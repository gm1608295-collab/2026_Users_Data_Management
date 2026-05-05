const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(__dirname));

// ==================== AUTO WAKE-UP ====================
setInterval(() => { https.get(`https://two026-users-data-management.onrender.com/api/ping`, (res) => {}); }, 600000);
app.get('/api/ping', (req, res) => { res.json({ success: true, time: new Date().toISOString() }); });

// ==================== DATABASE (DB1 + DB2 Auto-Switch) ====================
const DB1 = 'postgresql://neondb_owner:npg_3lq1dLYxvgVX@ep-misty-base-amkxcayc-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require';
const DB2 = 'postgresql://neondb_owner:npg_6RwnXBl5LKQt@ep-damp-sea-a46t7qil-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require';

const pool1 = new Pool({ connectionString: DB1, ssl: { rejectUnauthorized: false }, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
const pool2 = new Pool({ connectionString: DB2, ssl: { rejectUnauthorized: false }, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });

let currentPool = pool1;
let pool1Active = true;

async function getPool() {
    try { await currentPool.query('SELECT 1'); return currentPool; }
    catch(e) { console.log('⚠️ DB Switch:', e.message); currentPool = pool1Active ? pool2 : pool1; pool1Active = !pool1Active; return currentPool; }
}

// ==================== CONFIG ====================
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
const IMGBB_API_KEY = '55854bc5e01a19fd4793d1df84326d00';

function tgSend(msg) { https.get(`${TELEGRAM_API}/sendMessage?chat_id=${CHAT_ID}&text=${encodeURIComponent(msg)}&parse_mode=HTML`, (res) => { res.on('data', () => {}); }).on('error', () => {}); }
function sendOnesignal(msg) { try { const data = JSON.stringify({ app_id: ONESIGNAL_APP_ID, included_segments: ["All"], contents: { en: msg }, headings: { en: "SOLO M Game Shop" } }); const req = https.request({ hostname: 'onesignal.com', path: '/api/v1/notifications', method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${ONESIGNAL_API_KEY}` } }); req.write(data); req.end(); } catch(e) {} }

// ==================== INIT TABLES ====================
async function initTables(p) {
    const queries = [
        `CREATE TABLE IF NOT EXISTS auth_users (id SERIAL PRIMARY KEY, username VARCHAR(100), email VARCHAR(200), phone VARCHAR(50), password VARCHAR(255), google_id VARCHAR(200), login_type VARCHAR(10) DEFAULT 'local', avatar VARCHAR(500), gmail_pass VARCHAR(100) DEFAULT 'DoubleMK2008', mlbb_pass VARCHAR(100) DEFAULT 'GlobalMK2008', tiktok_pass VARCHAR(100) DEFAULT 'DoubleMK2008', balance DECIMAL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, last_login TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS notices (id SERIAL PRIMARY KEY, message TEXT, color VARCHAR(20) DEFAULT '#ffffff', created_by VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS slider_images (id SERIAL PRIMARY KEY, image_urls TEXT DEFAULT '[]', updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS bg_music (id SERIAL PRIMARY KEY, music_urls TEXT DEFAULT '[]', updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS page_status (page_id VARCHAR(50) PRIMARY KEY, status VARCHAR(5) DEFAULT 'on', updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS banned_users (user_id VARCHAR(100) PRIMARY KEY, banned_by VARCHAR(100), banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, user_id INT, username VARCHAR(100), amount DECIMAL, payment_method VARCHAR(50), screenshot TEXT, status VARCHAR(20) DEFAULT 'pending', submitted_user_id VARCHAR(20), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS used_codes (code VARCHAR(100) PRIMARY KEY, user_id INT, used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS otp_codes (id SERIAL PRIMARY KEY, user_id INT, code VARCHAR(6), expires_at TIMESTAMP, used BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
    ];
    for (const q of queries) { await p.query(q).catch(() => {}); }
}
initTables(pool1); initTables(pool2);

// ==================== ALL PAGES ====================
const ALL_PAGES = [
    { id: 'topup', name: 'Top Up' }, { id: 'buycode', name: 'Buy Code MLBB' }, { id: 'dashboard', name: 'Dashboard' },
    { id: 'data', name: 'Data' }, { id: 'history', name: 'History' }, { id: 'password', name: 'Password' },
    { id: 'recovery', name: 'Recovery' }, { id: 'contact', name: 'Contact' }, { id: 'aboutredeem', name: 'About Redeem' }
];

ALL_PAGES.forEach(async (pg) => {
    await pool1.query("INSERT INTO page_status (page_id, status) VALUES ($1, 'on') ON CONFLICT (page_id) DO NOTHING", [pg.id]).catch(() => {});
    await pool2.query("INSERT INTO page_status (page_id, status) VALUES ($1, 'on') ON CONFLICT (page_id) DO NOTHING", [pg.id]).catch(() => {});
});

// ==================== IMAGE UPLOAD (ImgBB) ====================
app.post('/api/upload_image', async (req, res) => {
    const { base64 } = req.body;
    if (!base64) return res.json({ success: false, message: 'No image data' });
    try {
        const imageData = base64.replace(/^data:image\/\w+;base64,/, '');
        const formData = new URLSearchParams();
        formData.append('key', IMGBB_API_KEY);
        formData.append('image', imageData);
        const response = await fetch('https://api.imgbb.com/1/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString(),
            signal: AbortSignal.timeout(15000)
        });
        const data = await response.json();
        if (data.success) {
            console.log('[IMAGE UPLOAD] Success:', data.data.url);
            res.json({ success: true, url: data.data.url });
        } else {
            res.json({ success: false, message: 'Upload failed' });
        }
    } catch(e) {
        console.error('[IMAGE UPLOAD ERROR]', e.message);
        res.json({ success: false, message: 'Upload error' });
    }
});

// ==================== MUSIC UPLOAD (Catbox - AUDIO ONLY) ====================
app.post('/api/upload_music', async (req, res) => {
    const { base64, filename } = req.body;
    if (!base64) return res.json({ success: false, message: 'No music data' });
    
    try {
        // ====== STRICT CHECK: Audio Only ======
        // Check if it's a video file
        if (base64.startsWith('data:video/')) {
            return res.json({ success: false, message: '❌ Video files not allowed! Please select an Audio file (MP3, M4A, WAV, OGG, AAC).' });
        }
        
        // Check if it's an audio file
        const audioMatch = base64.match(/^data:(audio\/\w+);base64,(.+)/);
        if (!audioMatch) {
            return res.json({ success: false, message: '❌ Invalid file type! Please select an Audio file only.' });
        }
        
        const mimeType = audioMatch[1]; // audio/mpeg, audio/mp4, audio/x-m4a, etc.
        const base64Data = audioMatch[2];
        const buffer = Buffer.from(base64Data, 'base64');
        
        // Determine file extension
        let ext = '.mp3';
        if (mimeType.includes('m4a') || mimeType.includes('mp4')) ext = '.m4a';
        else if (mimeType.includes('ogg')) ext = '.ogg';
        else if (mimeType.includes('wav')) ext = '.wav';
        else if (mimeType.includes('aac')) ext = '.aac';
        
        const finalFilename = (filename || 'music') + ext;
        
        console.log('[MUSIC UPLOAD] Uploading:', finalFilename, 'Type:', mimeType);
        
        const blob = new Blob([buffer], { type: mimeType });
        const formData = new FormData();
        formData.append('reqtype', 'fileupload');
        formData.append('fileToUpload', blob, finalFilename);
        
        const response = await fetch('https://catbox.moe/user/api.php', {
            method: 'POST',
            body: formData,
            signal: AbortSignal.timeout(60000)
        });
        
        const url = await response.text();
        
        if (url && url.startsWith('https://')) {
            console.log('[MUSIC UPLOAD] Success:', url.trim());
            res.json({ success: true, url: url.trim() });
        } else {
            console.error('[MUSIC UPLOAD] Failed:', url);
            res.json({ success: false, message: 'Upload failed: ' + url });
        }
    } catch(e) {
        console.error('[MUSIC UPLOAD ERROR]', e.message);
        res.json({ success: false, message: 'Upload error: ' + e.message });
    }
});

// ==================== AUTH ====================
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.json({ success: false, message: 'All fields required' });
    try {
        const p = await getPool();
        const r = await p.query("SELECT * FROM auth_users WHERE email=$1 AND password=$2 AND login_type='local'", [email, password]);
        if (r.rows.length === 0) return res.json({ success: false, message: 'Invalid email or password' });
        const u = r.rows[0];
        await p.query('UPDATE auth_users SET last_login=NOW() WHERE id=$1', [u.id]);
        res.json({ success: true, token: 'token_' + u.id, user: { id: u.id, username: u.username, email: u.email, login_type: 'local' } });
    } catch(e) { res.json({ success: false, message: 'Error' }); }
});

app.post('/api/register', async (req, res) => {
    const { username, email, phone, password } = req.body;
    if (!username || !email || !phone || !password) return res.json({ success: false, message: 'All fields required' });
    try {
        const p = await getPool();
        const exist = await p.query('SELECT id FROM auth_users WHERE email=$1', [email]);
        if (exist.rows.length > 0) return res.json({ success: false, message: 'Email exists' });
        await p.query('INSERT INTO auth_users (username,email,phone,password,login_type) VALUES ($1,$2,$3,$4,$5)', [username, email, phone, password, 'local']);
        tgSend(`🆕 ${username}\n📧 ${email}`);
        res.json({ success: true, message: 'Registration successful' });
    } catch(e) { res.json({ success: false, message: 'Error' }); }
});

app.post('/api/logout', (req, res) => res.json({ success: true }));
app.post('/api/check_banned', async (req, res) => {
    try { const p = await getPool(); const r = await p.query('SELECT * FROM banned_users WHERE user_id=$1', [req.body.userId]); res.json({ banned: r.rows.length > 0 }); }
    catch(e) { res.json({ banned: false }); }
});

// ==================== GOOGLE OAUTH ====================
app.get('/auth/google', (req, res) => {
    if (!GOOGLE_CLIENT_ID) return res.send('Google Login not configured');
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT)}&response_type=code&scope=email%20profile&access_type=offline&prompt=consent`);
});

app.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.send('<script>alert("Failed");window.location.href="/";</script>');
    try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: GOOGLE_REDIRECT, grant_type: 'authorization_code' }) });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) return res.send('<script>alert("Failed");window.location.href="/";</script>');
        const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } });
        const userInfo = await userRes.json();
        const googleId = userInfo.id, email = userInfo.email, name = userInfo.name || 'Google User';
        const p = await getPool();
        let user = await p.query('SELECT * FROM auth_users WHERE google_id=$1', [googleId]);
        if (user.rows.length > 0) { const u = user.rows[0]; await p.query('UPDATE auth_users SET last_login=NOW() WHERE id=$1', [u.id]); res.send(`<script>localStorage.setItem("auth_token","token_${u.id}");localStorage.setItem("user",JSON.stringify({id:${u.id},username:"${u.username||name}",email:"${email}",login_type:"google"}));window.location.href="/dashboard";</script>`); return; }
        user = await p.query("SELECT * FROM auth_users WHERE email=$1 AND login_type='local'", [email]);
        if (user.rows.length > 0) { const u = user.rows[0]; await p.query('UPDATE auth_users SET google_id=$1, last_login=NOW() WHERE id=$2', [googleId, u.id]); res.send(`<script>localStorage.setItem("auth_token","token_${u.id}");localStorage.setItem("user",JSON.stringify({id:${u.id},username:"${u.username||name}",email:"${email}",login_type:"google"}));window.location.href="/dashboard";</script>`); return; }
        const nu = await p.query('INSERT INTO auth_users (username,email,google_id,login_type) VALUES ($1,$2,$3,$4) RETURNING id', [name, email, googleId, 'google']);
        res.send(`<script>localStorage.setItem("auth_token","token_${nu.rows[0].id}");localStorage.setItem("user",JSON.stringify({id:${nu.rows[0].id},username:"${name}",email:"${email}",login_type:"google"}));window.location.href="/dashboard";</script>`);
    } catch(e) { res.send('<script>alert("Failed");window.location.href="/";</script>'); }
});

// ==================== TIKTOK OAUTH ====================
app.get('/auth/tiktok', (req, res) => { res.redirect(`https://www.tiktok.com/v2/auth/authorize/?client_key=${TIKTOK_CLIENT_KEY}&scope=user.info.basic&response_type=code&redirect_uri=${TIKTOK_REDIRECT}&state=${Math.random().toString(36)}`); });
app.get('/auth/tiktok/callback', async (req, res) => {
    try {
        const { code } = req.query; if (!code) return res.send('<script>window.close()</script>');
        const tr = await fetch('https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_key: TIKTOK_CLIENT_KEY, client_secret: TIKTOK_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: TIKTOK_REDIRECT }) });
        const td = await tr.json();
        const ur = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', { headers: { 'Authorization': `Bearer ${td.access_token}` } });
        const ud = await ur.json(); const user = ud.data.user;
        const p = await getPool(); const dr = await p.query('SELECT * FROM auth_users WHERE google_id=$1', [user.open_id]);
        if (dr.rows.length > 0) { await p.query('UPDATE auth_users SET last_login=NOW() WHERE id=$1', [dr.rows[0].id]); res.send(`<script>localStorage.setItem("auth_token","token_${dr.rows[0].id}");localStorage.setItem("user",JSON.stringify({id:${dr.rows[0].id},username:"${dr.rows[0].username||user.display_name}",email:"${dr.rows[0].email||'tiktok@user.com'}",login_type:"tiktok"}));window.location.href="/dashboard";</script>`); }
        else { const nu = await p.query('INSERT INTO auth_users (username,email,google_id,login_type) VALUES ($1,$2,$3,$4) RETURNING id', [user.display_name, 'tiktok_'+user.open_id+'@tiktok.com', user.open_id, 'tiktok']); res.send(`<script>localStorage.setItem("auth_token","token_${nu.rows[0].id}");localStorage.setItem("user",JSON.stringify({id:${nu.rows[0].id},username:"${user.display_name}",email:"tiktok@user.com",login_type:"tiktok"}));window.location.href="/dashboard";</script>`); }
    } catch(e) { res.send('<script>alert("Failed");window.location.href="/";</script>'); }
});

// ==================== PASSWORDS / DATA ====================
app.post('/api/get_passwords', (req, res) => { res.json({ gmail_password: 'DoubleMK2008', mlbb_password: 'GlobalMK2008', tiktok_password: 'DoubleMK2008' }); });
app.post('/api/change_password', (req, res) => { res.json({ success: true }); });
app.post('/api/save_user_data', (req, res) => { res.json({ success: true }); });
app.post('/api/get_my_data', (req, res) => { res.json({ success: true, gmail: [], mlbb: [], tiktok: [] }); });

// ==================== VERIFY USER ID ====================
app.post('/api/verify_user_id', async (req, res) => {
    const { token, userId } = req.body; if (!token || !userId) return res.json({ success: false, verified: false });
    try { const p = await getPool(); const uid = parseInt(token.replace('token_', '')); const r = await p.query('SELECT id,username,email FROM auth_users WHERE id=$1', [uid]); if (r.rows.length === 0) return res.json({ verified: false }); const u = r.rows[0]; u.id.toString().padStart(6,'0') === userId.toString().padStart(6,'0') ? res.json({ success: true, verified: true, username: u.username, email: u.email, id: u.id }) : res.json({ verified: false }); }
    catch(e) { res.json({ verified: false }); }
});

// ==================== CODE MANAGEMENT ====================
app.post('/api/use_code', async (req, res) => {
    try { const p = await getPool(); const exist = await p.query('SELECT * FROM used_codes WHERE code=$1', [req.body.code]); if (exist.rows.length > 0) return res.json({ already_used: true }); await p.query('INSERT INTO used_codes (code,user_id) VALUES ($1,$2)', [req.body.code, req.body.userId]); res.json({ success: true }); }
    catch(e) { res.json({ success: false }); }
});

// ==================== SLIDER ====================
app.get('/api/slider_images', async (req, res) => { try { const p = await getPool(); const r = await p.query('SELECT image_urls FROM slider_images ORDER BY id DESC LIMIT 1'); r.rows.length === 0 ? res.json({ success: true, images: [] }) : res.json({ success: true, images: JSON.parse(r.rows[0].image_urls || '[]') }); } catch(e) { res.json({ images: [] }); } });
app.post('/api/admin/slider_images', async (req, res) => { try { const p = await getPool(); if (!req.body.images || req.body.images.length === 0) { await p.query('DELETE FROM slider_images'); return res.json({ success: true }); } await p.query('INSERT INTO slider_images (image_urls) VALUES ($1)', [JSON.stringify(req.body.images)]); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });

// ==================== BG MUSIC ====================
app.get('/api/bg_music', async (req, res) => {
    try {
        const p = await getPool();
        const r = await p.query('SELECT music_urls FROM bg_music ORDER BY id DESC LIMIT 1');
        if (r.rows.length === 0) return res.json({ playlist: [] });
        const playlist = JSON.parse(r.rows[0].music_urls || '[]');
        console.log('[BG MUSIC GET] Sending playlist:', playlist.length, 'songs');
        res.json({ success: true, playlist: playlist });
    } catch(e) {
        console.error('[BG MUSIC GET ERROR]', e.message);
        res.json({ playlist: [] });
    }
});

app.post('/api/admin/bg_music', async (req, res) => {
    try {
        const p = await getPool();
        const { playlist } = req.body;
        if (!playlist || playlist.length === 0) {
            await p.query('DELETE FROM bg_music');
            console.log('[BG MUSIC] Cleared playlist');
            return res.json({ success: true });
        }
        await p.query('DELETE FROM bg_music');
        await p.query('INSERT INTO bg_music (music_urls) VALUES ($1)', [JSON.stringify(playlist)]);
        console.log('[BG MUSIC SAVE] Saved playlist:', playlist.length, 'songs');
        res.json({ success: true });
    } catch(e) {
        console.error('[BG MUSIC SAVE ERROR]', e.message);
        res.json({ success: false, message: e.message });
    }
});

// ==================== PAGE TOGGLE ====================
app.get('/api/admin/page_status', async (req, res) => {
    try {
        const p = await getPool();
        const result = [];
        for (const pg of ALL_PAGES) {
            const q = await p.query("SELECT status FROM page_status WHERE page_id=$1", [pg.id]);
            result.push({ id: pg.id, name: pg.name, status: q.rows.length > 0 ? q.rows[0].status : 'on' });
        }
        res.json({ pages: result });
    } catch(e) { res.json({ pages: [] }); }
});

app.post('/api/admin/toggle_page', async (req, res) => {
    try {
        const p = await getPool();
        await p.query("INSERT INTO page_status (page_id, status) VALUES ($1,$2) ON CONFLICT (page_id) DO UPDATE SET status=$2", [req.body.page_id, req.body.status]);
        console.log(`[TOGGLE] ${req.body.page_id} -> ${req.body.status}`);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

// ==================== BACKUP & RESTORE ====================
app.get('/api/admin/backup', async (req, res) => {
    try {
        const p = await getPool();
        const users = await p.query('SELECT * FROM auth_users'); const orders = await p.query('SELECT * FROM orders');
        const notices = await p.query('SELECT * FROM notices'); const slider = await p.query('SELECT * FROM slider_images');
        const bgM = await p.query('SELECT * FROM bg_music'); const ps = await p.query('SELECT * FROM page_status');
        const banned = await p.query('SELECT * FROM banned_users'); const codes = await p.query('SELECT * FROM used_codes');
        res.json({ success: true, data: { version: '1.0', date: new Date().toISOString(), tables: { auth_users: users.rows, orders: orders.rows, notices: notices.rows, slider_images: slider.rows, bg_music: bgM.rows, page_status: ps.rows, banned_users: banned.rows, used_codes: codes.rows } } });
    } catch(e) { res.json({ success: false }); }
});

app.post('/api/admin/restore', async (req, res) => {
    const { data } = req.body; if (!data || !data.tables) return res.json({ success: false });
    try {
        const p = await getPool(); const t = data.tables;
        if (t.auth_users) { await p.query('DELETE FROM auth_users'); for (const r of t.auth_users) { await p.query('INSERT INTO auth_users VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)', [r.id, r.username, r.email, r.phone, r.password, r.google_id, r.login_type, r.avatar, r.gmail_pass, r.mlbb_pass, r.tiktok_pass, r.balance, r.created_at, r.last_login]).catch(() => {}); } }
        if (t.orders) { await p.query('DELETE FROM orders'); for (const r of t.orders) { await p.query('INSERT INTO orders VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [r.id, r.user_id, r.username, r.amount, r.payment_method, r.screenshot, r.status, r.submitted_user_id, r.created_at]).catch(() => {}); } }
        if (t.banned_users) { await p.query('DELETE FROM banned_users'); for (const r of t.banned_users) { await p.query('INSERT INTO banned_users VALUES ($1,$2,$3)', [r.user_id, r.banned_by, r.banned_at]).catch(() => {}); } }
        if (t.notices) { await p.query('DELETE FROM notices'); for (const r of t.notices) { await p.query('INSERT INTO notices VALUES ($1,$2,$3,$4,$5)', [r.id, r.message, r.color, r.created_by, r.created_at]).catch(() => {}); } }
        res.json({ success: true });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// ==================== ADMIN ====================
app.get('/api/admin/users_grouped', async (req, res) => { try { const p = await getPool(); const lo = await p.query("SELECT * FROM auth_users WHERE login_type='local' ORDER BY id DESC"); const go = await p.query("SELECT * FROM auth_users WHERE login_type='google' ORDER BY id DESC"); const ti = await p.query("SELECT * FROM auth_users WHERE login_type='tiktok' ORDER BY id DESC"); const ba = await p.query("SELECT user_id FROM banned_users"); res.json({ success: true, local: lo.rows, google: go.rows, tiktok: ti.rows, banned: ba.rows.map(r=>r.user_id), total: lo.rows.length + go.rows.length + ti.rows.length }); } catch(e) { res.json({ success: false }); } });
app.post('/api/admin/edit_user', async (req, res) => { try { const p = await getPool(); req.body.password ? await p.query("UPDATE auth_users SET username=$1,email=$2,phone=$3,password=$4 WHERE id=$5", [req.body.username, req.body.email, req.body.phone, req.body.password, req.body.id]) : await p.query("UPDATE auth_users SET username=$1,email=$2,phone=$3 WHERE id=$4", [req.body.username, req.body.email, req.body.phone, req.body.id]); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });
app.post('/api/admin/ban', async (req, res) => { try { const p = await getPool(); await p.query('INSERT INTO banned_users (user_id,banned_by) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET banned_by=$2', [req.body.userId, 'admin']); tgSend('🚫 Banned: ' + req.body.userId); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });
app.post('/api/admin/unban', async (req, res) => { try { const p = await getPool(); await p.query('DELETE FROM banned_users WHERE user_id=$1', [req.body.userId]); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });
app.post('/api/admin/delete', async (req, res) => { try { const p = await getPool(); await p.query('DELETE FROM auth_users WHERE id=$1', [req.body.userId]); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });
app.post('/api/admin/search_user', async (req, res) => { try { const p = await getPool(); const r = await p.query('SELECT id,username,email,balance FROM auth_users WHERE id::text=$1 OR username ILIKE $2 OR email ILIKE $2 LIMIT 5', [req.body.query, '%'+req.body.query+'%']); res.json({ users: r.rows }); } catch(e) { res.json({ users: [] }); } });
app.post('/api/admin/update_balance', async (req, res) => { try { const p = await getPool(); await p.query('UPDATE auth_users SET balance=COALESCE(balance,0)+$1 WHERE id=$2', [req.body.amount, req.body.userId]); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });

// ==================== ORDERS ====================
app.get('/api/admin/orders', async (req, res) => { try { const p = await getPool(); const filter = req.query.filter || 'all'; let query = 'SELECT * FROM orders'; const params = []; const today = new Date().toISOString().split('T')[0]; if (filter === 'today') { query += " WHERE DATE(created_at)=$1"; params.push(today); } else if (filter === 'yesterday') { query += " WHERE DATE(created_at)=$1"; params.push(new Date(Date.now()-86400000).toISOString().split('T')[0]); } query += ' ORDER BY id DESC'; const r = await p.query(query, params); const totalR = await p.query("SELECT COUNT(*) FROM orders"); const todayR = await p.query("SELECT COUNT(*) FROM orders WHERE DATE(created_at)=$1", [today]); res.json({ orders: r.rows, total: parseInt(totalR.rows[0].count), today: parseInt(todayR.rows[0].count) }); } catch(e) { res.json({ orders: [], total: 0, today: 0 }); } });
app.post('/api/submit_order', async (req, res) => { try { const p = await getPool(); const uid = parseInt(req.body.token.replace('token_', '')); const user = await p.query('SELECT username FROM auth_users WHERE id=$1', [uid]); const un = user.rows[0]?.username || 'Unknown'; await p.query('INSERT INTO orders (user_id,username,amount,payment_method,screenshot,status,submitted_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)', [uid, un, req.body.amount, req.body.payment_method, req.body.screenshot, 'pending', req.body.user_id||uid]); tgSend(`🛒 New Order\n👤 ${un}\n💰 ${req.body.amount} Ks\n💳 ${req.body.payment_method}`); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });
app.post('/api/get_orders', async (req, res) => { try { const p = await getPool(); const uid = parseInt(req.body.token.replace('token_', '')); const r = await p.query('SELECT * FROM orders WHERE user_id=$1 ORDER BY id DESC', [uid]); res.json({ orders: r.rows }); } catch(e) { res.json({ orders: [] }); } });
app.post('/api/admin/order_status', async (req, res) => { try { const p = await getPool(); await p.query('UPDATE orders SET status=$1 WHERE id=$2', [req.body.status, req.body.id]); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });
app.post('/api/get_balance', async (req, res) => { try { const p = await getPool(); const uid = parseInt(req.body.token.replace('token_', '')); const r = await p.query('SELECT balance FROM auth_users WHERE id=$1', [uid]); res.json({ balance: r.rows[0]?.balance || 0 }); } catch(e) { res.json({ balance: 0 }); } });

// ==================== NOTICE ====================
app.get('/api/notice', async (req, res) => { try { const p = await getPool(); const r = await p.query('SELECT * FROM notices ORDER BY id DESC LIMIT 1'); if (r.rows.length === 0) return res.json({ success: true, message: '', color: '#ffffff' }); const n = r.rows[0]; res.json({ success: true, message: n.message, color: n.color, id: n.id, created_at: n.created_at }); } catch(e) { res.json({ success: true, message: '' }); } });
app.get('/api/admin/notices', async (req, res) => { try { const p = await getPool(); const r = await p.query('SELECT * FROM notices ORDER BY id DESC'); res.json({ notices: r.rows }); } catch(e) { res.json({ notices: [] }); } });
app.post('/api/admin/notice', async (req, res) => { try { const p = await getPool(); const { message, color } = req.body; if (!message) return res.json({ success: false }); await p.query('INSERT INTO notices (message,color,created_by) VALUES ($1,$2,$3)', [message, color||'#ffffff', 'admin']); tgSend(`📢 ${message}`); sendOnesignal(message); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });
app.post('/api/admin/notice/delete', async (req, res) => { try { const p = await getPool(); await p.query('DELETE FROM notices WHERE id=$1', [req.body.id]); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });

// ==================== BOT MESSAGE ====================
app.post('/api/admin/bot_message', async (req, res) => { const { message } = req.body; if (!message) return res.json({ success: false, message: 'Enter message' }); try { const p = await getPool(); const users = await p.query("SELECT DISTINCT google_id FROM auth_users WHERE login_type='telegram'"); let count = 0; for (const user of users.rows) { const tid = user.google_id.replace('tg_', ''); try { await fetch(`${TELEGRAM_API}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: tid, text: `📢 Admin Message\n\n${message}`, parse_mode: 'HTML' }) }); count++; } catch(e) {} } res.json({ success: true, count }); } catch(e) { res.json({ success: false }); } });

// ==================== TELEGRAM BOT (Enhanced) ====================
let lastUpdateId = 0;

function sendTelegramMessage(chatId, text, replyMarkup = null) {
    const body = { chat_id: chatId, text, parse_mode: 'HTML' };
    if (replyMarkup) body.reply_markup = JSON.stringify(replyMarkup);
    https.get(`${TELEGRAM_API}/sendMessage?${new URLSearchParams(body).toString()}`, (res) => {
        res.on('data', () => {});
    }).on('error', () => {});
}

async function createTelegramUser(userId, firstName, username) {
    try {
        const p = await getPool();
        const tgId = 'tg_' + userId;
        const exist = await p.query("SELECT * FROM auth_users WHERE google_id = $1", [tgId]);
        
        if (exist.rows.length > 0) {
            await p.query('UPDATE auth_users SET last_login = NOW() WHERE id = $1', [exist.rows[0].id]);
            return { id: exist.rows[0].id, isNew: false, balance: exist.rows[0].balance || 0 };
        }
        
        const displayName = firstName || 'TG User';
        const email = 'tg_' + userId + '@telegram.com';
        
        const nu = await p.query(
            'INSERT INTO auth_users (username, email, google_id, login_type, balance) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [displayName, email, tgId, 'telegram', 0]
        );
        
        return { id: nu.rows[0].id, isNew: true, balance: 0 };
    } catch(e) {
        console.error('Create TG User Error:', e.message);
        return null;
    }
}

async function getUserBalance(userId) {
    try {
        const p = await getPool();
        const r = await p.query("SELECT balance FROM auth_users WHERE google_id = $1", ['tg_' + userId]);
        return r.rows.length > 0 ? (r.rows[0].balance || 0) : null;
    } catch(e) { return null; }
}

async function getUserOrders(userId) {
    try {
        const p = await getPool();
        const user = await p.query("SELECT id FROM auth_users WHERE google_id = $1", ['tg_' + userId]);
        if (user.rows.length === 0) return [];
        const r = await p.query(
            "SELECT * FROM orders WHERE user_id = $1 ORDER BY id DESC LIMIT 3",
            [user.rows[0].id]
        );
        return r.rows;
    } catch(e) { return []; }
}

async function createOTP(userId) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    try {
        const p = await getPool();
        await p.query("UPDATE otp_codes SET used = true WHERE user_id = $1", [userId]);
        await p.query(
            "INSERT INTO otp_codes (user_id, code, expires_at) VALUES ($1, $2, NOW() + INTERVAL '60 seconds')",
            [userId, otp]
        );
    } catch(e) {}
    return otp;
}

async function getUserPurchasedCodes(userId) {
    try {
        const p = await getPool();
        const user = await p.query("SELECT id FROM auth_users WHERE google_id = $1", ['tg_' + userId]);
        if (user.rows.length === 0) return [];
        const r = await p.query("SELECT code FROM used_codes WHERE user_id = $1", [user.rows[0].id]);
        return r.rows.map(r => r.code);
    } catch(e) { return []; }
}

function startLongPolling() {
    console.log('🤖 Enhanced Bot Started');
    
    // Main Menu Keyboard
    const mainKeyboard = {
        inline_keyboard: [
            [{ text: '🏠 Login Now', url: 'https://two026-users-data-management.onrender.com' }],
            [{ text: '💰 Top Up', url: 'https://two026-users-data-management.onrender.com/topup.html' }],
            [{ text: '🛒 Buy Code', url: 'https://two026-users-data-management.onrender.com/buycode.html' }],
            [{ text: '📞 Contact Admin', url: 'https://t.me/Solo_m28' }]
        ]
    };
    
    // Quick Actions Keyboard
    const quickKeyboard = {
        inline_keyboard: [
            [{ text: '💳 Check Balance', callback_data: 'balance' }],
            [{ text: '🔐 Get OTP', callback_data: 'otp' }],
            [{ text: '📋 Order Status', callback_data: 'status' }],
            [{ text: '🛒 Buy Code', callback_data: 'buycode' }],
            [{ text: '📞 Contact', url: 'https://t.me/Solo_m28' }]
        ]
    };
    
    async function getUpdates() {
        try {
            const url = `${TELEGRAM_API}/getUpdates?offset=${lastUpdateId + 1}&timeout=15`;
            const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
            const result = await response.json();
            
            if (result.ok && result.result.length > 0) {
                for (const update of result.result) {
                    lastUpdateId = update.update_id;
                    
                    // Handle Callback Query (Inline Button Press)
                    if (update.callback_query) {
                        const cq = update.callback_query;
                        const chatId = cq.message.chat.id;
                        const data = cq.data;
                        const firstName = cq.from.first_name || 'User';
                        
                        const user = await createTelegramUser(cq.from.id, firstName);
                        if (!user) {
                            sendTelegramMessage(chatId, '❌ Error. Please try /start');
                            continue;
                        }
                        
                        if (data === 'balance') {
                            const balance = user.balance || 0;
                            sendTelegramMessage(chatId, 
                                `💳 <b>Your Balance</b>\n\n` +
                                `💰 <b>${balance.toLocaleString()} Ks</b>\n` +
                                `💵 ≈ $${(balance/2100).toFixed(2)} USD\n\n` +
                                `ငွေဖြည့်လိုပါက Top Up ခလုတ်ကိုနှိပ်ပါ။`,
                                quickKeyboard
                            );
                        }
                        else if (data === 'otp') {
                            const otp = await createOTP(user.id);
                            sendTelegramMessage(chatId,
                                `🔐 <b>Your OTP Code</b>\n\n` +
                                `🔢 <b>${otp}</b>\n\n` +
                                `⏰ ၆၀ စက္ကန့်အတွင်း အသုံးပြုပါ။\n` +
                                `⚠️ ဤ OTP ကို မည်သူ့ကိုမျှ မပေးပါနှင့်။`,
                                quickKeyboard
                            );
                        }
                        else if (data === 'status') {
                            const orders = await getUserOrders(cq.from.id);
                            if (orders.length === 0) {
                                sendTelegramMessage(chatId, '📋 မှတ်တမ်းမရှိသေးပါ။', quickKeyboard);
                            } else {
                                let msg = '📋 <b>နောက်ဆုံး Order များ</b>\n\n';
                                orders.forEach((o, i) => {
                                    const status = o.status === 'approved' ? '✅' : o.status === 'rejected' ? '❌' : '⏳';
                                    msg += `${status} #${o.id} | 💰 ${o.amount} Ks | 💳 ${o.payment_method}\n`;
                                    msg += `   📅 ${new Date(o.created_at).toLocaleDateString()}\n\n`;
                                });
                                sendTelegramMessage(chatId, msg, quickKeyboard);
                            }
                        }
                        else if (data === 'buycode') {
                            sendTelegramMessage(chatId,
                                '🛒 <b>Code ဝယ်ယူရန်</b>\n\n' +
                                'အောက်ပါ Link မှတစ်ဆင့် ဝယ်ယူနိုင်ပါသည်။\n' +
                                'https://two026-users-data-management.onrender.com/buycode.html',
                                mainKeyboard
                            );
                        }
                        
                        // Answer callback query
                        try {
                            await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ callback_query_id: cq.id })
                            });
                        } catch(e) {}
                        
                        continue;
                    }
                    
                    // Handle Regular Message
                    const msg = update.message;
                    if (!msg) continue;
                    
                    const chatId = msg.chat.id;
                    const text = (msg.text || '').trim();
                    const firstName = msg.from.first_name || 'User';
                    
                    // Commands
                    if (text === '/start' || text === '/login') {
                        const user = await createTelegramUser(msg.from.id, firstName);
                        const welcomeMsg = user.isNew ? 
                            `🎉 <b>Welcome to SOLO M Game Shop!</b>\n\nမင်္ဂလာပါ ${firstName}!\n\nသင်၏အကောင့်ကို အလိုအလျောက် ဖွင့်ပေးပြီးပါပြီ။` :
                            `👋 ပြန်လည်ကြိုဆိုပါတယ် ${firstName}!`;
                        
                        sendTelegramMessage(chatId,
                            welcomeMsg + '\n\n' +
                            '💳 Balance: <b>' + (user.balance || 0).toLocaleString() + ' Ks</b>\n\n' +
                            'အောက်ပါ ခလုတ်များကို နှိပ်၍ အသုံးပြုနိုင်ပါသည်။',
                            quickKeyboard
                        );
                    }
                    else if (text === '/help') {
                        sendTelegramMessage(chatId,
                            `📖 <b>SOLO M Game Shop</b>\n\n` +
                            `<b>Commands:</b>\n` +
                            `/start - Login/Register\n` +
                            `/help - အကူအညီ\n` +
                            `/balance - လက်ကျန်ငွေကြည့်ရန်\n` +
                            `/otp - OTP Code ရယူရန်\n` +
                            `/status - Order Status ကြည့်ရန်\n` +
                            `/buy - Code ဝယ်ယူရန်\n\n` +
                            `<b>ဆက်သွယ်ရန်:</b> @Solo_m28`,
                            quickKeyboard
                        );
                    }
                    else if (text === '/balance') {
                        const user = await createTelegramUser(msg.from.id, firstName);
                        const balance = user ? (user.balance || 0) : 0;
                        sendTelegramMessage(chatId,
                            `💳 <b>Your Balance</b>\n\n💰 <b>${balance.toLocaleString()} Ks</b>\n💵 ≈ $${(balance/2100).toFixed(2)} USD`,
                            quickKeyboard
                        );
                    }
                    else if (text === '/otp') {
                        const user = await createTelegramUser(msg.from.id, firstName);
                        if (user) {
                            const otp = await createOTP(user.id);
                            sendTelegramMessage(chatId,
                                `🔐 <b>Your OTP Code</b>\n\n🔢 <b>${otp}</b>\n\n⏰ ၆၀ စက္ကန့်အတွင်း အသုံးပြုပါ။\n⚠️ မည်သူ့ကိုမျှ မပေးပါနှင့်။`
                            );
                        }
                    }
                    else if (text === '/status') {
                        const orders = await getUserOrders(msg.from.id);
                        if (orders.length === 0) {
                            sendTelegramMessage(chatId, '📋 မှတ်တမ်းမရှိသေးပါ။');
                        } else {
                            let orderMsg = '📋 <b>နောက်ဆုံး Orders</b>\n\n';
                            orders.forEach(o => {
                                const status = o.status === 'approved' ? '✅ Approved' : o.status === 'rejected' ? '❌ Rejected' : '⏳ Pending';
                                orderMsg += `🆔 #${o.id} | ${status}\n💰 ${o.amount} Ks | 💳 ${o.payment_method}\n📅 ${new Date(o.created_at).toLocaleDateString()}\n\n`;
                            });
                            sendTelegramMessage(chatId, orderMsg);
                        }
                    }
                    else if (text === '/buy') {
                        sendTelegramMessage(chatId,
                            '🛒 <b>Code ဝယ်ယူရန်</b>\n\nအောက်ပါ Link မှတစ်ဆင့် ဝယ်ယူနိုင်ပါသည်။',
                            mainKeyboard
                        );
                    }
                    else {
                        // Unknown command
                        sendTelegramMessage(chatId,
                            `အောက်ပါ Commands များကို အသုံးပြုပါ။\n\n` +
                            `/start - စတင်ရန်\n` +
                            `/help - အကူအညီ\n` +
                            `/balance - လက်ကျန်ငွေ\n` +
                            `/otp - OTP Code\n` +
                            `/status - Order မှတ်တမ်း\n` +
                            `/buy - Code ဝယ်ယူရန်`,
                            quickKeyboard
                        );
                    }
                }
            }
        } catch(e) {
            console.log('Bot Polling Error:', e.message);
        }
        setTimeout(getUpdates, 500);
    }
    
    getUpdates();
    console.log('✅ Bot Long Polling Active');
}

startLongPolling();

// ==================== MAINTENANCE PAGE ====================
function maintenancePage() {
    return `<!DOCTYPE html><html lang="my"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"><title>ပြုပြင်မွမ်းမံနေပါသည်</title><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"><style>*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',sans-serif}body{background:linear-gradient(135deg,#0c0e27,#1a1f4b,#2c3e50);min-height:100vh;display:flex;justify-content:center;align-items:center;padding:20px;text-align:center}.box i{font-size:70px;color:#f39c12;display:block;margin-bottom:20px;animation:pulse 2s infinite}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}.box h2{color:#f39c12;font-size:20px;margin-bottom:10px}.box p{color:rgba(255,255,255,0.7);font-size:14px;margin-bottom:20px}.box a{display:inline-block;padding:10px 25px;background:#f39c12;color:#000;text-decoration:none;border-radius:6px;font-weight:bold;font-size:14px}</style></head><body><div class="box"><i class="fas fa-tools"></i><h2>ယခုစာမျက်နှာကို ပြုပြင်မွမ်းမံနေပါသည်</h2><p>ကျေးဇူးပြု၍ ခဏစောင့်ဆိုင်းပေးပါ။</p><a href="/dashboard"><i class="fas fa-arrow-left"></i> ပင်မစာမျက်နှာသို့</a></div></body></html>`;
}

async function servePageWithCheck(req, res, pageId, filePath) {
    try {
        const p = await getPool();
        const r = await p.query("SELECT status FROM page_status WHERE page_id=$1", [pageId]);
        console.log(`[PAGE CHECK] ${pageId} -> ${r.rows.length > 0 ? r.rows[0].status : 'NOT FOUND (default on)'}`);
        if (r.rows.length > 0 && r.rows[0].status === 'off') {
            console.log(`[PAGE BLOCKED] ${pageId} is OFF`);
            return res.send(maintenancePage());
        }
    } catch(e) { console.log(`[PAGE CHECK ERROR] ${pageId}:`, e.message); }
    res.sendFile(path.join(__dirname, filePath));
}

// ==================== PAGE ROUTES ====================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/dashboard', (req, res) => servePageWithCheck(req, res, 'dashboard', 'dashboard.html'));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/topup.html', (req, res) => servePageWithCheck(req, res, 'topup', 'topup.html'));
app.get('/buycode.html', (req, res) => servePageWithCheck(req, res, 'buycode', 'buycode.html'));
app.get('/data.html', (req, res) => servePageWithCheck(req, res, 'data', 'data.html'));
app.get('/history.html', (req, res) => servePageWithCheck(req, res, 'history', 'history.html'));
app.get('/password.html', (req, res) => servePageWithCheck(req, res, 'password', 'password.html'));
app.get('/recovery.html', (req, res) => servePageWithCheck(req, res, 'recovery', 'recovery.html'));
app.get('/contact.html', (req, res) => servePageWithCheck(req, res, 'contact', 'contact.html'));
app.get('/aboutredeem.html', (req, res) => servePageWithCheck(req, res, 'aboutredeem', 'aboutredeem.html'));
app.get('/terms.html', (req, res) => res.sendFile(path.join(__dirname, 'terms.html')));
app.get('/privacy.html', (req, res) => res.sendFile(path.join(__dirname, 'privacy.html')));
app.get('/offline.html', (req, res) => res.sendFile(path.join(__dirname, 'offline.html')));

// ==================== START SERVER ====================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🗄️ DB: DB1 + DB2 Auto-Switch`);
    console.log(`📄 Page Control: 9 pages`);
    console.log(`🎵 Music Upload: Catbox (Audio Only)`);
    console.log(`🖼️ Image Upload: ImgBB`);
});
