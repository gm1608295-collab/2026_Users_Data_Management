const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const https = require('https');
const UAParser = require('ua-parser-js');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(__dirname));

// ==================== AUTO WAKE-UP ====================
setInterval(function() { https.get('https://two026-users-data-management.onrender.com/api/ping', function(res) {}); }, 600000);
app.get('/api/ping', function(req, res) { res.json({ success: true, time: new Date().toISOString() }); });

// ==================== DATABASE ====================
var DB1 = 'postgresql://neondb_owner:npg_3lq1dLYxvgVX@ep-misty-base-amkxcayc-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require';
var DB2 = 'postgresql://neondb_owner:npg_6RwnXBl5LKQt@ep-damp-sea-a46t7qil-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require';

var pool1 = new Pool({ connectionString: DB1, ssl: { rejectUnauthorized: false }, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
var pool2 = new Pool({ connectionString: DB2, ssl: { rejectUnauthorized: false }, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });

var currentPool = pool1;
var pool1Active = true;

async function getPool() {
    try { await currentPool.query('SELECT 1'); return currentPool; }
    catch(e) { console.log('DB Switch:', e.message); currentPool = pool1Active ? pool2 : pool1; pool1Active = !pool1Active; return currentPool; }
}

// ==================== DEVICE DETECTION ====================
function detectDevice(ua) {
    var parser = new UAParser(ua);
    var result = parser.getResult();
    var browser = result.browser;
    var os = result.os;
    var device = result.device;
    var deviceName = '';
    var deviceType = 'Desktop';
    var icon = '🖥️';
    var isMobile = false;
    if (device.vendor) deviceName += device.vendor + ' ';
    if (device.model) deviceName += device.model;
    if (!deviceName.trim()) { if (os.name) deviceName += os.name + ' '; if (os.version) deviceName += os.version; }
    if (browser.name) { deviceName += ' - ' + browser.name; if (browser.version) deviceName += ' ' + browser.version.split('.')[0]; }
    if (!deviceName.trim()) deviceName = 'Unknown Device';
    if (device.type === 'mobile') { deviceType = 'Mobile'; icon = '📱'; isMobile = true; }
    else if (device.type === 'tablet') { deviceType = 'Tablet'; icon = '📱'; isMobile = true; }
    else if (/Median|WebView/i.test(ua)) { deviceType = 'App'; deviceName = 'SOLO M Game App - ' + (os.name||''); icon = '🎮'; isMobile = true; }
    return { name: deviceName.trim(), type: deviceType, icon: icon, brand: device.vendor || os.name || 'Unknown', model: device.model || os.version || 'Unknown', browser: browser.name || 'Unknown', browserVersion: browser.version || '', osName: os.name || 'Unknown', osVersion: os.version || '', isMobile: isMobile };
}

// ==================== LOGIN TRACKING ====================
async function trackLogin(userId, username, loginType, req) {
    try {
        var p = await getPool();
        var ua = req.headers['user-agent'] || '';
        var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'Unknown';
        var info = detectDevice(ua);
        await p.query('INSERT INTO login_history (user_id, username, login_type, ip_address, device_info, device_type, device_brand, device_model, browser, is_mobile, user_agent) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [userId, username, loginType, ip, info.name, info.type, info.brand, info.model, info.browser, info.isMobile, ua]).catch(function(e) { console.log('Login history error:', e.message); });
        var deviceToken = 'dev_' + userId + '_' + ip.replace(/\./g, '_') + '_' + ua.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_');
        await p.query('INSERT INTO device_sessions (user_id, token, device_name, device_type, device_brand, device_model, browser, ip_address, user_agent) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (user_id, token) DO UPDATE SET last_activity=NOW(), is_active=true, ip_address=$8', [userId, deviceToken, info.name, info.type, info.brand, info.model, info.browser, ip, ua]).catch(function(e) { console.log('Device session error:', e.message); });
    } catch(e) { console.error('[LOGIN TRACK ERROR]', e.message); }
}

// ==================== CONFIG ====================
var BOT_TOKEN = '8737284644:AAEW7XtU6HqK4O49dJXG6MXSj08BvLUAdJE';
var CHAT_ID = '8315028972';
var ONESIGNAL_APP_ID = '1943a7fe-8313-4ce2-b420-0a0e2b59fcff';
var ONESIGNAL_API_KEY = 'os_v2_app_dfb2p7udcngofnbabihcwwp476agyhbcncxexnu2gu2xsbo4uww6tynm5fuwze77wvka65febiapxnwwpoczsbtcq56a3e4a3thkskq';
var TIKTOK_CLIENT_KEY = 'awlwv9kkzin9m9pv';
var TIKTOK_CLIENT_SECRET = '3QDthZspcNC7eHZNCA5ofYAs3CpACLX7';
var TIKTOK_REDIRECT = 'https://two026-users-data-management.onrender.com/auth/tiktok/callback';
var GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
var GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
var GOOGLE_REDIRECT = process.env.GOOGLE_REDIRECT || 'https://two026-users-data-management.onrender.com/auth/google/callback';
var TELEGRAM_API = 'https://api.telegram.org/bot' + BOT_TOKEN;
var IMGBB_API_KEY = '55854bc5e01a19fd4793d1df84326d00';

function tgSend(msg) { https.get(TELEGRAM_API + '/sendMessage?chat_id=' + CHAT_ID + '&text=' + encodeURIComponent(msg) + '&parse_mode=HTML', function(res) { res.on('data', function() {}); }).on('error', function() {}); }

function sendOnesignal(msg, sound, title) {
    try {
        var notificationSound = sound || 'notification';
        var notificationTitle = title || 'SOLO M Game Shop';
        var data = JSON.stringify({ app_id: ONESIGNAL_APP_ID, included_segments: ["All"], contents: { en: msg }, headings: { en: notificationTitle }, android_sound: notificationSound, ios_sound: notificationSound + ".wav", android_channel_id: "solom-notification-channel", small_icon: "ic_stat_onesignal_default", large_icon: "https://two026-users-data-management.onrender.com/icons/icon-192.png", priority: 10, ttl: 3600 });
        var req = https.request({ hostname: 'onesignal.com', path: '/api/v1/notifications', method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + ONESIGNAL_API_KEY } }, function(res) { var body = ''; res.on('data', function(chunk) { body += chunk; }); res.on('end', function() { console.log('[ONESIGNAL] Response:', body.substring(0, 100)); }); });
        req.on('error', function(e) { console.error('[ONESIGNAL ERROR]', e.message); });
        req.write(data); req.end();
    } catch(e) { console.error('[ONESIGNAL ERROR]', e.message); }
}

// ==================== REDEEM CATEGORIES ====================
var REDEEM_CATEGORIES = [
    { id: 'shhh_emote', name: 'Shhh emote', icon: 'https://i.ibb.co/KprVCy87/icon-reward2-Q0a-Xg-C62.png', price: 2500 },
    { id: 'golden_border', name: 'Golden Month Border', icon: 'https://i.ibb.co/LXVHQfk3/icon-reward1-D7w-Nl-OTn.png', price: 3500 },
    { id: 'lucky_diamond', name: 'Lucky Diamond Code', icon: 'https://i.ibb.co/n8m2ZSgz/box4-7e338a9e.png', price: 2000 },
    { id: 'magic_durt', name: 'Magic Durt', icon: 'https://i.ibb.co/NdpDZ0P7/8.png', price: 1500 },
    { id: 'emblem_box', name: 'Emblem Box', icon: 'https://i.ibb.co/Xr1LDXSG/mbx1-c5ec07ee.png', price: 1500 }
];

// ==================== INIT TABLES ====================
async function initTables(p) {
    var queries = [
        'CREATE TABLE IF NOT EXISTS auth_users (id SERIAL PRIMARY KEY, username VARCHAR(100), email VARCHAR(200), phone VARCHAR(50), password VARCHAR(255), google_id VARCHAR(200), login_type VARCHAR(10) DEFAULT \'local\', avatar VARCHAR(500), gmail_pass VARCHAR(100) DEFAULT \'DoubleMK2008\', mlbb_pass VARCHAR(100) DEFAULT \'GlobalMK2008\', tiktok_pass VARCHAR(100) DEFAULT \'DoubleMK2008\', balance DECIMAL DEFAULT 0, usd_balance DECIMAL DEFAULT 0, premium_expiry TIMESTAMP, paid_spins INT DEFAULT 0, premium_tier INT DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, last_login TIMESTAMP)',
        'CREATE TABLE IF NOT EXISTS login_history (id SERIAL PRIMARY KEY, user_id INT NOT NULL, username VARCHAR(100), login_type VARCHAR(20), ip_address VARCHAR(50), device_info VARCHAR(300), device_type VARCHAR(50), device_brand VARCHAR(100), device_model VARCHAR(100), browser VARCHAR(50), is_mobile BOOLEAN DEFAULT false, user_agent TEXT, login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
        'CREATE TABLE IF NOT EXISTS device_sessions (id SERIAL PRIMARY KEY, user_id INT NOT NULL, token VARCHAR(200) NOT NULL, device_name VARCHAR(300), device_type VARCHAR(50), device_brand VARCHAR(100), device_model VARCHAR(100), browser VARCHAR(50), ip_address VARCHAR(50), user_agent TEXT, is_active BOOLEAN DEFAULT true, last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, token))',
        'CREATE TABLE IF NOT EXISTS notices (id SERIAL PRIMARY KEY, message TEXT, color VARCHAR(20) DEFAULT \'#ffffff\', created_by VARCHAR(100), notice_type VARCHAR(20) DEFAULT \'dashboard\', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
        'CREATE TABLE IF NOT EXISTS slider_images (id SERIAL PRIMARY KEY, image_urls TEXT DEFAULT \'[]\', updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
        'CREATE TABLE IF NOT EXISTS bg_music (id SERIAL PRIMARY KEY, music_urls TEXT DEFAULT \'[]\', updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
        'CREATE TABLE IF NOT EXISTS videos (id SERIAL PRIMARY KEY, video_url TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
        'CREATE TABLE IF NOT EXISTS page_status (page_id VARCHAR(50) PRIMARY KEY, status VARCHAR(5) DEFAULT \'on\', updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
        'CREATE TABLE IF NOT EXISTS banned_users (user_id VARCHAR(100) PRIMARY KEY, banned_by VARCHAR(100), banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
        'CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, user_id INT, username VARCHAR(100), amount DECIMAL, payment_method VARCHAR(50), screenshot TEXT, status VARCHAR(20) DEFAULT \'pending\', submitted_user_id VARCHAR(20), reject_reason TEXT DEFAULT \'\', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
        'CREATE TABLE IF NOT EXISTS redeem_codes (id SERIAL PRIMARY KEY, category VARCHAR(50), code VARCHAR(100), used BOOLEAN DEFAULT false, used_by INT, used_at TIMESTAMP, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
        'CREATE TABLE IF NOT EXISTS used_codes (code VARCHAR(100) PRIMARY KEY, user_id INT, used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
        'CREATE TABLE IF NOT EXISTS otp_codes (id SERIAL PRIMARY KEY, user_id INT, code VARCHAR(6), expires_at TIMESTAMP, used BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
        'CREATE TABLE IF NOT EXISTS user_security_pass (user_id INT PRIMARY KEY, security_password VARCHAR(100), set_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
        'CREATE TABLE IF NOT EXISTS spin_history (id SERIAL PRIMARY KEY, user_id INT, reward_type VARCHAR(50), reward_amount DECIMAL DEFAULT 0, segment_label VARCHAR(50), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
        'CREATE TABLE IF NOT EXISTS premium_draws (user_id INT, draw_date DATE, draw_count INT DEFAULT 1, PRIMARY KEY(user_id, draw_date))',
        'CREATE TABLE IF NOT EXISTS weekly_bonus (id SERIAL PRIMARY KEY, user_id INT, claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
        'CREATE TABLE IF NOT EXISTS daily_checkin_events (id SERIAL PRIMARY KEY, event_type VARCHAR(20) NOT NULL DEFAULT \'normal\', event_name VARCHAR(100), start_date DATE NOT NULL, start_time TIME DEFAULT \'00:00:00\', end_date DATE, end_time TIME DEFAULT \'14:30:00\', total_days INT NOT NULL DEFAULT 7, is_active BOOLEAN DEFAULT true, cancelled BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
        'CREATE TABLE IF NOT EXISTS daily_checkin_rewards (id SERIAL PRIMARY KEY, event_id INT REFERENCES daily_checkin_events(id) ON DELETE CASCADE, day_number INT NOT NULL, reward_type VARCHAR(20) NOT NULL, reward_amount DECIMAL(10,2) DEFAULT 0, reward_label VARCHAR(100), icon_url VARCHAR(500), UNIQUE(event_id, day_number))',
        'CREATE TABLE IF NOT EXISTS daily_checkins (id SERIAL PRIMARY KEY, user_id INT NOT NULL, event_id INT REFERENCES daily_checkin_events(id) ON DELETE CASCADE, checkin_date DATE NOT NULL DEFAULT CURRENT_DATE, day_number INT NOT NULL, reward_type VARCHAR(20), reward_amount DECIMAL(10,2) DEFAULT 0, claimed BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, event_id, checkin_date))'
    ];
    for (var i = 0; i < queries.length; i++) { await p.query(queries[i]).catch(function(e) { console.log('Table create:', e.message); }); }
}
initTables(pool1);
initTables(pool2);

// ==================== CREATE SPIN HISTORY V2 TABLE ====================
async function createSpinHistoryV2Table() {
    var query = 'CREATE TABLE IF NOT EXISTS spin_history_v2 (id SERIAL PRIMARY KEY, user_id INT NOT NULL, spin_source VARCHAR(20) NOT NULL, reward_type VARCHAR(20), reward_amount DECIMAL(10,2) DEFAULT 0, balance_before_mmk DECIMAL(10,2) DEFAULT 0, balance_after_mmk DECIMAL(10,2) DEFAULT 0, balance_before_usd DECIMAL(10,2) DEFAULT 0, balance_after_usd DECIMAL(10,2) DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)';
    try { await pool1.query(query); await pool2.query(query); console.log('spin_history_v2 table created'); } catch(e) { console.log('spin_history_v2 error:', e.message); }
}
createSpinHistoryV2Table();

// ==================== ALL PAGES ====================
var ALL_PAGES = [
    { id: 'topup', name: 'Top Up' }, { id: 'buycode', name: 'Buy Code MLBB' }, { id: 'dashboard', name: 'Dashboard' },
    { id: 'data', name: 'Data' }, { id: 'history', name: 'History' }, { id: 'password', name: 'Password' },
    { id: 'recovery', name: 'Recovery' }, { id: 'contact', name: 'Contact' }, { id: 'aboutredeem', name: 'About Redeem' },
    { id: 'game', name: 'Lucky Spin' }, { id: 'exchange', name: 'Exchange' }
];
ALL_PAGES.forEach(function(pg) {
    pool1.query("INSERT INTO page_status (page_id, status) VALUES ($1, 'on') ON CONFLICT (page_id) DO NOTHING", [pg.id]).catch(function() {});
    pool2.query("INSERT INTO page_status (page_id, status) VALUES ($1, 'on') ON CONFLICT (page_id) DO NOTHING", [pg.id]).catch(function() {});
});

// ==================== IMAGE UPLOAD ====================
app.post('/api/upload_image', async function(req, res) {
    var base64 = req.body.base64;
    if (!base64) return res.json({ success: false, message: 'No image data' });
    try {
        var imageData = base64.replace(/^data:image\/\w+;base64,/, '');
        var formData = new URLSearchParams(); formData.append('key', IMGBB_API_KEY); formData.append('image', imageData);
        var response = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: formData.toString(), signal: AbortSignal.timeout(15000) });
        var data = await response.json();
        data.success ? res.json({ success: true, url: data.data.url }) : res.json({ success: false, message: 'Upload failed' });
    } catch(e) { res.json({ success: false }); }
});

// ==================== MUSIC UPLOAD ====================
app.post('/api/upload_music', async function(req, res) {
    var base64 = req.body.base64; var filename = req.body.filename;
    if (!base64) return res.json({ success: false, message: 'No music data' });
    try {
        var isVideo = base64.startsWith('data:video/'); var isAudio = base64.startsWith('data:audio/');
        var isM4A = filename && (filename.toLowerCase().endsWith('.m4a') || filename.toLowerCase().endsWith('.aac'));
        if (isVideo && !isM4A) return res.json({ success: false, message: 'Video not allowed! Audio only.' });
        if (!isAudio && !isVideo) return res.json({ success: false, message: 'Invalid file!' });
        var base64Data; var matches = base64.match(/^data:[^;]+;base64,(.+)$/);
        if (matches && matches[1]) base64Data = matches[1]; else { var ci = base64.indexOf(','); base64Data = ci > -1 ? base64.substring(ci + 1) : base64; }
        var buffer = Buffer.from(base64Data, 'base64'); var blob = new Blob([buffer], { type: 'application/octet-stream' });
        var formData = new FormData(); formData.append('reqtype', 'fileupload'); formData.append('fileToUpload', blob, filename || 'music.mp3');
        var response = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: formData, signal: AbortSignal.timeout(60000) });
        var url = await response.text();
        if (url && url.startsWith('https://')) res.json({ success: true, url: url.trim() }); else res.json({ success: false, message: 'Upload failed' });
    } catch(e) { res.json({ success: false }); }
});

// ==================== AUTH ====================
app.post('/api/login', async function(req, res) {
    var email = req.body.email; var password = req.body.password;
    if (!email || !password) return res.json({ success: false, message: 'All fields required' });
    try {
        var p = await getPool(); var r = await p.query("SELECT * FROM auth_users WHERE email=$1 AND password=$2 AND login_type='local'", [email, password]);
        if (r.rows.length === 0) return res.json({ success: false, message: 'Invalid' });
        var u = r.rows[0]; await p.query('UPDATE auth_users SET last_login=NOW() WHERE id=$1', [u.id]);
        trackLogin(u.id, u.username, 'local', req);
        res.json({ success: true, token: 'token_' + u.id, user: { id: u.id, username: u.username, email: u.email, login_type: 'local' } });
    } catch(e) { res.json({ success: false }); }
});

app.post('/api/register', async function(req, res) {
    var username = req.body.username; var email = req.body.email; var phone = req.body.phone; var password = req.body.password;
    if (!username || !email || !phone || !password) return res.json({ success: false, message: 'All fields required' });
    try {
        var p = await getPool(); var exist = await p.query('SELECT id FROM auth_users WHERE email=$1', [email]);
        if (exist.rows.length > 0) return res.json({ success: false, message: 'Email exists' });
        await p.query('INSERT INTO auth_users (username,email,phone,password,login_type) VALUES ($1,$2,$3,$4,$5)', [username, email, phone, password, 'local']);
        tgSend(username + '\n' + email); res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

app.post('/api/logout', function(req, res) { res.json({ success: true }); });

app.post('/api/check_banned', async function(req, res) {
    try { var p = await getPool(); var r = await p.query('SELECT * FROM banned_users WHERE user_id=$1', [req.body.userId]); res.json({ banned: r.rows.length > 0 }); } catch(e) { res.json({ banned: false }); }
});

// ==================== BANNED LIST API ====================
app.get('/api/admin/banned_list', async function(req, res) {
    try { var p = await getPool(); var r = await p.query('SELECT user_id FROM banned_users'); res.json({ success: true, banned: r.rows.map(function(row) { return row.user_id; }) }); } catch(e) { res.json({ success: false, banned: [] }); }
});

// ==================== GOOGLE OAUTH ====================
app.get('/auth/google', function(req, res) {
    if (!GOOGLE_CLIENT_ID) return res.send('Not configured');
    res.redirect('https://accounts.google.com/o/oauth2/v2/auth?client_id=' + GOOGLE_CLIENT_ID + '&redirect_uri=' + encodeURIComponent(GOOGLE_REDIRECT) + '&response_type=code&scope=email%20profile');
});

app.get('/auth/google/callback', async function(req, res) {
    var code = req.query.code; if (!code) return res.send('<script>alert("Failed");window.location.href="/";</script>');
    try {
        var tokenRes = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: GOOGLE_REDIRECT, grant_type: 'authorization_code' }) });
        var tokenData = await tokenRes.json(); if (!tokenData.access_token) return res.send('<script>alert("Failed");window.location.href="/";</script>');
        var userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { 'Authorization': 'Bearer ' + tokenData.access_token } });
        var userInfo = await userRes.json(); var googleId = userInfo.id; var email = userInfo.email; var name = userInfo.name || 'Google User';
        var p = await getPool(); var user = await p.query('SELECT * FROM auth_users WHERE google_id=$1', [googleId]);
        if (user.rows.length > 0) { var u = user.rows[0]; await p.query('UPDATE auth_users SET last_login=NOW() WHERE id=$1', [u.id]); trackLogin(u.id, u.username||name, 'google', req); res.send('<script>localStorage.setItem("auth_token","token_' + u.id + '");localStorage.setItem("user",JSON.stringify({id:' + u.id + ',username:"' + (u.username||name) + '",email:"' + email + '",login_type:"google"}));window.location.href="/dashboard";</script>'); return; }
        user = await p.query("SELECT * FROM auth_users WHERE email=$1 AND login_type='local'", [email]);
        if (user.rows.length > 0) { var u2 = user.rows[0]; await p.query('UPDATE auth_users SET google_id=$1, last_login=NOW() WHERE id=$2', [googleId, u2.id]); trackLogin(u2.id, u2.username||name, 'google', req); res.send('<script>localStorage.setItem("auth_token","token_' + u2.id + '");localStorage.setItem("user",JSON.stringify({id:' + u2.id + ',username:"' + (u2.username||name) + '",email:"' + email + '",login_type:"google"}));window.location.href="/dashboard";</script>'); return; }
        var nu = await p.query('INSERT INTO auth_users (username,email,google_id,login_type) VALUES ($1,$2,$3,$4) RETURNING id', [name, email, googleId, 'google']);
        trackLogin(nu.rows[0].id, name, 'google', req);
        res.send('<script>localStorage.setItem("auth_token","token_' + nu.rows[0].id + '");localStorage.setItem("user",JSON.stringify({id:' + nu.rows[0].id + ',username:"' + name + '",email:"' + email + '",login_type:"google"}));window.location.href="/dashboard";</script>');
    } catch(e) { res.send('<script>alert("Failed");window.location.href="/";</script>'); }
});

// ==================== TIKTOK OAUTH ====================
app.get('/auth/tiktok', function(req, res) { res.redirect('https://www.tiktok.com/v2/auth/authorize/?client_key=' + TIKTOK_CLIENT_KEY + '&scope=user.info.basic&response_type=code&redirect_uri=' + TIKTOK_REDIRECT + '&state=' + Math.random().toString(36)); });

app.get('/auth/tiktok/callback', async function(req, res) {
    try {
        var code = req.query.code; if (!code) return res.send('<script>window.close()</script>');
        var tr = await fetch('https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_key: TIKTOK_CLIENT_KEY, client_secret: TIKTOK_CLIENT_SECRET, code: code, grant_type: 'authorization_code', redirect_uri: TIKTOK_REDIRECT }) });
        var td = await tr.json();
        var ur = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', { headers: { 'Authorization': 'Bearer ' + td.access_token } });
        var ud = await ur.json(); var user = ud.data.user;
        var p = await getPool(); var dr = await p.query('SELECT * FROM auth_users WHERE google_id=$1', [user.open_id]);
        if (dr.rows.length > 0) { await p.query('UPDATE auth_users SET last_login=NOW() WHERE id=$1', [dr.rows[0].id]); trackLogin(dr.rows[0].id, dr.rows[0].username||user.display_name, 'tiktok', req); res.send('<script>localStorage.setItem("auth_token","token_' + dr.rows[0].id + '");localStorage.setItem("user",JSON.stringify({id:' + dr.rows[0].id + ',username:"' + (dr.rows[0].username||user.display_name) + '",email:"tiktok@user.com",login_type:"tiktok"}));window.location.href="/dashboard";</script>'); return; }
        var nu = await p.query('INSERT INTO auth_users (username,email,google_id,login_type) VALUES ($1,$2,$3,$4) RETURNING id', [user.display_name, 'tiktok_' + user.open_id + '@tiktok.com', user.open_id, 'tiktok']);
        trackLogin(nu.rows[0].id, user.display_name, 'tiktok', req);
        res.send('<script>localStorage.setItem("auth_token","token_' + nu.rows[0].id + '");localStorage.setItem("user",JSON.stringify({id:' + nu.rows[0].id + ',username:"' + user.display_name + '",email:"tiktok@user.com",login_type:"tiktok"}));window.location.href="/dashboard";</script>');
    } catch(e) { res.send('<script>alert("Failed");window.location.href="/";</script>'); }
});

// ==================== GET USER DATA PASSWORDS ====================
app.post('/api/get_passwords', async function(req, res) {
    var token = req.body.token;
    var defaults = { gmail_password: 'DoubleMK2008', mlbb_password: 'GlobalMK2008', tiktok_password: 'DoubleMK2008' };
    if (!token) return res.json(defaults);
    try {
        var p = await getPool(); var uid = parseInt(token.replace('token_', ''));
        if (isNaN(uid)) return res.json(defaults);
        var r = await p.query('SELECT gmail_pass, mlbb_pass, tiktok_pass FROM auth_users WHERE id=$1', [uid]);
        if (r.rows.length > 0) { var u = r.rows[0]; res.json({ success: true, gmail_password: u.gmail_pass || defaults.gmail_password, mlbb_password: u.mlbb_pass || defaults.mlbb_password, tiktok_password: u.tiktok_pass || defaults.tiktok_password }); }
        else { res.json(defaults); }
    } catch(e) { res.json(defaults); }
});

app.post('/api/admin/get_user_data_pass', async function(req, res) {
    var userId = req.body.userId; if (!userId) return res.json({ success: false });
    try {
        var p = await getPool(); var r = await p.query('SELECT gmail_pass, mlbb_pass, tiktok_pass FROM auth_users WHERE id=$1', [userId]);
        if (r.rows.length > 0) res.json({ success: true, gmail_pass: r.rows[0].gmail_pass || 'DoubleMK2008', mlbb_pass: r.rows[0].mlbb_pass || 'GlobalMK2008', tiktok_pass: r.rows[0].tiktok_pass || 'DoubleMK2008' });
        else res.json({ success: false, message: 'User not found' });
    } catch(e) { res.json({ success: false }); }
});

app.post('/api/admin/update_data_pass', async function(req, res) {
    var userId = req.body.userId; var gmail_pass = req.body.gmail_pass; var mlbb_pass = req.body.mlbb_pass; var tiktok_pass = req.body.tiktok_pass;
    if (!userId) return res.json({ success: false, message: 'User ID required' });
    try {
        var p = await getPool();
        if (gmail_pass) await p.query('UPDATE auth_users SET gmail_pass=$1 WHERE id=$2', [gmail_pass, userId]);
        if (mlbb_pass) await p.query('UPDATE auth_users SET mlbb_pass=$1 WHERE id=$2', [mlbb_pass, userId]);
        if (tiktok_pass) await p.query('UPDATE auth_users SET tiktok_pass=$1 WHERE id=$2', [tiktok_pass, userId]);
        res.json({ success: true, message: 'Data passwords updated!' });
    } catch(e) { res.json({ success: false, message: 'Server error' }); }
});

// ==================== CHANGE PASSWORD ====================
app.post('/api/change_password', async function(req, res) {
    var token = req.body.token; var type = req.body.type; var currentPassword = req.body.currentPassword; var newPassword = req.body.newPassword;
    if (!token || !type || !currentPassword || !newPassword) return res.json({ success: false, message: 'All fields required' });
    if (token === 'guest') return res.json({ success: false, message: 'Guest accounts cannot change password' });
    if (newPassword.length < 6) return res.json({ success: false, message: 'Password must be at least 6 characters' });
    if (currentPassword === newPassword) return res.json({ success: false, message: 'New password must be different' });
    try {
        var p = await getPool(); var uid = parseInt(token.replace('token_', ''));
        if (isNaN(uid) || uid <= 0) return res.json({ success: false, message: 'Invalid session. Please login again.' });
        var user = await p.query('SELECT * FROM auth_users WHERE id=$1', [uid]);
        if (user.rows.length === 0) return res.json({ success: false, message: 'User not found. Please login again.' });
        var u = user.rows[0]; var col = type === 'gmail' ? 'gmail_pass' : type === 'mlbb' ? 'mlbb_pass' : 'tiktok_pass';
        var defaultPass = type === 'mlbb' ? 'GlobalMK2008' : 'DoubleMK2008'; var currentStored = u[col] || defaultPass;
        if (currentPassword !== currentStored) return res.json({ success: false, message: 'Current password is incorrect!' });
        await p.query('UPDATE auth_users SET ' + col + '=$1 WHERE id=$2', [newPassword, uid]);
        res.json({ success: true, message: 'Password changed successfully!' });
    } catch(e) { res.json({ success: false, message: 'Server error. Please try again.' }); }
});

app.post('/api/save_user_data', function(req, res) { res.json({ success: true }); });
app.post('/api/get_my_data', function(req, res) { res.json({ success: true, gmail: [], mlbb: [], tiktok: [] }); });

// ==================== HISTORY SECURITY PASSWORD API ====================
app.post('/api/get_security_pass_status', async function(req, res) {
    var token = req.body.token; if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    try {
        var p = await getPool(); var uid = parseInt(token.replace('token_', '')); if (isNaN(uid)) return res.json({ success: false });
        var r = await p.query('SELECT security_password, set_date FROM user_security_pass WHERE user_id=$1', [uid]);
        if (r.rows.length > 0) {
            var row = r.rows[0]; var hasPassword = !!row.security_password; var setDate = row.set_date ? new Date(row.set_date).getTime() : null;
            var canChange = false; var daysPassed = 0; var daysLeft = 0;
            if (setDate) { var now = new Date(); daysPassed = Math.floor((now.getTime() - setDate) / (1000 * 60 * 60 * 24)); daysLeft = Math.max(0, 7 - daysPassed); canChange = daysPassed >= 7; }
            res.json({ success: true, hasPassword: hasPassword, setDate: setDate, daysPassed: daysPassed, daysLeft: daysLeft, canChange: canChange });
        } else { res.json({ success: true, hasPassword: false, setDate: null, daysPassed: 0, daysLeft: 0, canChange: true }); }
    } catch(e) { res.json({ success: false }); }
});

app.post('/api/set_security_pass', async function(req, res) {
    var token = req.body.token; var password = req.body.password;
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    if (!password || password.length < 6) return res.json({ success: false, message: 'Password must be at least 6 characters' });
    try {
        var p = await getPool(); var uid = parseInt(token.replace('token_', '')); if (isNaN(uid)) return res.json({ success: false });
        var existing = await p.query('SELECT set_date FROM user_security_pass WHERE user_id=$1', [uid]);
        if (existing.rows.length > 0 && existing.rows[0].set_date) {
            var setDate = new Date(existing.rows[0].set_date); var now = new Date();
            var daysPassed = Math.floor((now.getTime() - setDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysPassed < 7) { var daysLeft = 7 - daysPassed; return res.json({ success: false, message: daysLeft + ' days remaining before you can change password', daysLeft: daysLeft }); }
        }
        await p.query('INSERT INTO user_security_pass (user_id, security_password, set_date, updated_at) VALUES ($1, $2, NOW(), NOW()) ON CONFLICT (user_id) DO UPDATE SET security_password=$2, set_date=NOW(), updated_at=NOW()', [uid, password]);
        res.json({ success: true, message: 'Password set successfully!' });
    } catch(e) { res.json({ success: false, message: 'Server error' }); }
});

app.post('/api/verify_security_pass', async function(req, res) {
    var token = req.body.token; var password = req.body.password;
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    if (!password) return res.json({ success: false, message: 'Password required' });
    try {
        var p = await getPool(); var uid = parseInt(token.replace('token_', '')); if (isNaN(uid)) return res.json({ success: false });
        var r = await p.query('SELECT security_password FROM user_security_pass WHERE user_id=$1', [uid]);
        if (r.rows.length === 0 || !r.rows[0].security_password) return res.json({ success: false, message: 'Password not set yet' });
        if (password === r.rows[0].security_password) res.json({ success: true, message: 'Verified!' }); else res.json({ success: false, message: 'Wrong password!' });
    } catch(e) { res.json({ success: false, message: 'Server error' }); }
});

// ==================== VERIFY USER ID ====================
app.post('/api/verify_user_id', async function(req, res) {
    var token = req.body.token; var userId = req.body.userId;
    if (!token || !userId) return res.json({ success: false, verified: false });
    try {
        var p = await getPool(); var uid = parseInt(token.replace('token_', ''));
        var r = await p.query('SELECT id,username,email FROM auth_users WHERE id=$1', [uid]);
        if (r.rows.length === 0) return res.json({ verified: false });
        var u = r.rows[0];
        u.id.toString().padStart(6,'0') === userId.toString().padStart(6,'0') ? res.json({ success: true, verified: true, username: u.username, email: u.email, id: u.id }) : res.json({ verified: false });
    } catch(e) { res.json({ verified: false }); }
});

// ==================== SLIDER ====================
app.get('/api/slider_images', async function(req, res) {
    try { var p = await getPool(); var r = await p.query('SELECT image_urls FROM slider_images ORDER BY id DESC LIMIT 1'); if (r.rows.length === 0) return res.json({ images: [] }); res.json({ success: true, images: JSON.parse(r.rows[0].image_urls || '[]') }); } catch(e) { res.json({ images: [] }); }
});

app.post('/api/admin/slider_images', async function(req, res) {
    try {
        var p = await getPool(); var images = req.body.images;
        if (!images || images.length === 0) { await p.query('DELETE FROM slider_images'); return res.json({ success: true }); }
        await p.query('DELETE FROM slider_images'); await p.query('INSERT INTO slider_images (image_urls) VALUES ($1)', [JSON.stringify(images)]); res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

// ==================== BG MUSIC ====================
app.get('/api/bg_music', async function(req, res) {
    try { var p = await getPool(); var r = await p.query('SELECT music_urls FROM bg_music ORDER BY id DESC LIMIT 1'); if (r.rows.length === 0) return res.json({ playlist: [] }); res.json({ playlist: JSON.parse(r.rows[0].music_urls || '[]') }); } catch(e) { res.json({ playlist: [] }); }
});

app.post('/api/admin/bg_music', async function(req, res) {
    try {
        var p = await getPool(); var playlist = req.body.playlist;
        if (!playlist || playlist.length === 0) { await p.query('DELETE FROM bg_music'); return res.json({ success: true }); }
        await p.query('DELETE FROM bg_music'); await p.query('INSERT INTO bg_music (music_urls) VALUES ($1)', [JSON.stringify(playlist)]); res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

// ==================== PAGE TOGGLE ====================
app.get('/api/admin/page_status', async function(req, res) {
    try {
        var p = await getPool(); var result = [];
        for (var i = 0; i < ALL_PAGES.length; i++) { var pg = ALL_PAGES[i]; var q = await p.query('SELECT status FROM page_status WHERE page_id=$1', [pg.id]); result.push({ id: pg.id, name: pg.name, status: q.rows.length > 0 ? q.rows[0].status : 'on' }); }
        res.json({ pages: result });
    } catch(e) { res.json({ pages: [] }); }
});

app.post('/api/admin/toggle_page', async function(req, res) {
    try { var p = await getPool(); await p.query('INSERT INTO page_status (page_id, status) VALUES ($1,$2) ON CONFLICT (page_id) DO UPDATE SET status=$2', [req.body.page_id, req.body.status]); res.json({ success: true }); } catch(e) { res.json({ success: false }); }
});

// ==================== BACKUP & RESTORE ====================
app.get('/api/admin/backup', async function(req, res) {
    try {
        var p = await getPool(); var users = await p.query('SELECT * FROM auth_users'); var orders = await p.query('SELECT * FROM orders');
        var notices = await p.query('SELECT * FROM notices'); var slider = await p.query('SELECT * FROM slider_images');
        var bgM = await p.query('SELECT * FROM bg_music'); var ps = await p.query('SELECT * FROM page_status');
        var banned = await p.query('SELECT * FROM banned_users'); var codes = await p.query('SELECT * FROM redeem_codes');
        var videos = await p.query('SELECT * FROM videos');
        res.json({ success: true, data: { version: '1.0', date: new Date().toISOString(), tables: { auth_users: users.rows, orders: orders.rows, notices: notices.rows, slider_images: slider.rows, bg_music: bgM.rows, page_status: ps.rows, banned_users: banned.rows, redeem_codes: codes.rows, videos: videos.rows } } });
    } catch(e) { res.json({ success: false }); }
});

app.post('/api/admin/restore', async function(req, res) {
    var data = req.body.data; if (!data || !data.tables) return res.json({ success: false });
    try {
        var p = await getPool(); var t = data.tables;
        if (t.auth_users) { await p.query('DELETE FROM auth_users'); for (var a = 0; a < t.auth_users.length; a++) { var r = t.auth_users[a]; await p.query('INSERT INTO auth_users VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)', [r.id, r.username, r.email, r.phone, r.password, r.google_id, r.login_type, r.avatar, r.gmail_pass, r.mlbb_pass, r.tiktok_pass, r.balance, r.created_at, r.last_login]).catch(function() {}); } }
        if (t.orders) { await p.query('DELETE FROM orders'); for (var b = 0; b < t.orders.length; b++) { var o = t.orders[b]; await p.query('INSERT INTO orders VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [o.id, o.user_id, o.username, o.amount, o.payment_method, o.screenshot, o.status, o.submitted_user_id, o.reject_reason, o.created_at]).catch(function() {}); } }
        if (t.banned_users) { await p.query('DELETE FROM banned_users'); for (var c = 0; c < t.banned_users.length; c++) { var bu = t.banned_users[c]; await p.query('INSERT INTO banned_users VALUES ($1,$2,$3)', [bu.user_id, bu.banned_by, bu.banned_at]).catch(function() {}); } }
        if (t.notices) { await p.query('DELETE FROM notices'); for (var d = 0; d < t.notices.length; d++) { var n = t.notices[d]; await p.query('INSERT INTO notices VALUES ($1,$2,$3,$4,$5,$6)', [n.id, n.message, n.color, n.created_by, n.notice_type, n.created_at]).catch(function() {}); } }
        if (t.redeem_codes) { await p.query('DELETE FROM redeem_codes'); for (var e = 0; e < t.redeem_codes.length; e++) { var rc = t.redeem_codes[e]; await p.query('INSERT INTO redeem_codes VALUES ($1,$2,$3,$4,$5,$6,$7)', [rc.id, rc.category, rc.code, rc.used, rc.used_by, rc.used_at, rc.created_at]).catch(function() {}); } }
        res.json({ success: true });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// ==================== ADMIN ====================
app.get('/api/admin/users_grouped', async function(req, res) {
    try {
        var p = await getPool(); var lo = await p.query("SELECT * FROM auth_users WHERE login_type='local' ORDER BY id DESC");
        var go = await p.query("SELECT * FROM auth_users WHERE login_type='google' ORDER BY id DESC");
        var ti = await p.query("SELECT * FROM auth_users WHERE login_type='tiktok' ORDER BY id DESC");
        var tg = await p.query("SELECT * FROM auth_users WHERE login_type='telegram' ORDER BY id DESC");
        var ba = await p.query('SELECT user_id FROM banned_users');
        res.json({ success: true, local: lo.rows, google: go.rows, tiktok: ti.rows, telegram: tg.rows, banned: ba.rows.map(function(r) { return r.user_id; }), total: lo.rows.length + go.rows.length + ti.rows.length + tg.rows.length });
    } catch(e) { res.json({ success: false }); }
});

app.post('/api/admin/edit_user', async function(req, res) {
    try {
        var p = await getPool();
        req.body.password ? await p.query('UPDATE auth_users SET username=$1,email=$2,phone=$3,password=$4 WHERE id=$5', [req.body.username, req.body.email, req.body.phone, req.body.password, req.body.id]) : await p.query('UPDATE auth_users SET username=$1,email=$2,phone=$3 WHERE id=$4', [req.body.username, req.body.email, req.body.phone, req.body.id]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

app.post('/api/admin/ban', async function(req, res) {
    try { var p = await getPool(); await p.query('INSERT INTO banned_users (user_id,banned_by) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET banned_by=$2', [req.body.userId, 'admin']); tgSend('Banned: ' + req.body.userId); res.json({ success: true }); } catch(e) { res.json({ success: false }); }
});

app.post('/api/admin/unban', async function(req, res) {
    try { var p = await getPool(); await p.query('DELETE FROM banned_users WHERE user_id=$1', [req.body.userId]); res.json({ success: true }); } catch(e) { res.json({ success: false }); }
});

app.post('/api/admin/delete', async function(req, res) {
    try {
        var p = await getPool(); var userId = req.body.userId;
        await p.query('INSERT INTO banned_users (user_id, banned_by) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET banned_by=$2', [userId, 'admin']);
        await p.query('DELETE FROM auth_users WHERE id=$1', [userId]); await p.query('DELETE FROM orders WHERE user_id=$1', [userId]);
        tgSend('Deleted: ' + userId); res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

app.post('/api/admin/search_user', async function(req, res) {
    try { var p = await getPool(); var r = await p.query('SELECT id,username,email,balance FROM auth_users WHERE id::text=$1 OR username ILIKE $2 OR email ILIKE $2 LIMIT 5', [req.body.query, '%' + req.body.query + '%']); res.json({ users: r.rows }); } catch(e) { res.json({ users: [] }); }
});

app.post('/api/admin/update_balance', async function(req, res) {
    try { var p = await getPool(); await p.query('UPDATE auth_users SET balance=COALESCE(balance,0)+$1 WHERE id=$2', [req.body.amount, req.body.userId]); res.json({ success: true }); } catch(e) { res.json({ success: false }); }
});

// ==================== ORDERS ====================
app.get('/api/admin/orders', async function(req, res) {
    try {
        var p = await getPool(); var filter = req.query.filter || 'all'; var query = 'SELECT * FROM orders'; var params = [];
        var today = new Date().toISOString().split('T')[0];
        if (filter === 'today') { query += ' WHERE DATE(created_at)=$1'; params.push(today); }
        else if (filter === 'yesterday') { query += ' WHERE DATE(created_at)=$1'; params.push(new Date(Date.now()-86400000).toISOString().split('T')[0]); }
        query += ' ORDER BY id DESC'; var r = await p.query(query, params);
        var totalR = await p.query('SELECT COUNT(*) FROM orders'); var todayR = await p.query('SELECT COUNT(*) FROM orders WHERE DATE(created_at)=$1', [today]);
        res.json({ orders: r.rows, total: parseInt(totalR.rows[0].count), today: parseInt(todayR.rows[0].count) });
    } catch(e) { res.json({ orders: [], total: 0, today: 0 }); }
});

app.post('/api/submit_order', async function(req, res) {
    try {
        var p = await getPool(); var uid = parseInt(req.body.token.replace('token_', '')); var user = await p.query('SELECT username FROM auth_users WHERE id=$1', [uid]);
        var un = user.rows[0] ? user.rows[0].username : 'Unknown';
        await p.query('INSERT INTO orders (user_id,username,amount,payment_method,screenshot,status,submitted_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)', [uid, un, req.body.amount, req.body.payment_method, req.body.screenshot, 'pending', req.body.user_id||uid]);
        tgSend('New Order\n' + un + '\n' + req.body.amount + ' Ks\n' + req.body.payment_method); res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

app.post('/api/get_orders', async function(req, res) {
    try { var p = await getPool(); var uid = parseInt(req.body.token.replace('token_', '')); var r = await p.query('SELECT * FROM orders WHERE user_id=$1 ORDER BY id DESC', [uid]); res.json({ orders: r.rows }); } catch(e) { res.json({ orders: [] }); }
});

app.post('/api/admin/order_status', async function(req, res) {
    try {
        var p = await getPool(); var id = req.body.id; var status = req.body.status; var reason = req.body.reason;
        if (status === 'rejected') { await p.query('UPDATE orders SET status=$1, reject_reason=$2 WHERE id=$3', [status, reason || '', id]); }
        else { await p.query('UPDATE orders SET status=$1 WHERE id=$2', [status, id]); }
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

// ==================== NOTICES ====================
app.get('/api/notice', async function(req, res) {
    try { var p = await getPool(); var r = await p.query("SELECT * FROM notices WHERE notice_type='dashboard' OR notice_type IS NULL ORDER BY id DESC LIMIT 1"); if (r.rows.length === 0) return res.json({ message: '' }); var n = r.rows[0]; res.json({ success: true, message: n.message, color: n.color, created_at: n.created_at }); } catch(e) { res.json({ message: '' }); }
});
app.get('/api/admin/notices', async function(req, res) {
    try { var p = await getPool(); var r = await p.query("SELECT * FROM notices WHERE notice_type='dashboard' OR notice_type IS NULL ORDER BY id DESC"); res.json({ notices: r.rows }); } catch(e) { res.json({ notices: [] }); }
});
app.post('/api/admin/notice', async function(req, res) {
    try { var p = await getPool(); var message = req.body.message; var color = req.body.color; if (!message) return res.json({ success: false }); await p.query("INSERT INTO notices (message,color,created_by,notice_type) VALUES ($1,$2,$3,'dashboard')", [message, color||'#fff', 'admin']); res.json({ success: true }); } catch(e) { res.json({ success: false }); }
});
app.post('/api/admin/notice/delete', async function(req, res) {
    try { var p = await getPool(); await p.query('DELETE FROM notices WHERE id=$1', [req.body.id]); res.json({ success: true }); } catch(e) { res.json({ success: false }); }
});
app.post('/api/admin/notices/delete_all', async function(req, res) {
    try { var p = await getPool(); await p.query("DELETE FROM notices WHERE notice_type='dashboard' OR notice_type IS NULL"); res.json({ success: true }); } catch(e) { res.json({ success: false }); }
});

// Top Up Notice
app.get('/api/topup_notice', async function(req, res) {
    try { var p = await getPool(); var r = await p.query("SELECT * FROM notices WHERE notice_type='topup' ORDER BY id DESC LIMIT 1"); if (r.rows.length === 0) return res.json({ message: '' }); var n = r.rows[0]; res.json({ success: true, message: n.message, color: n.color, created_at: n.created_at }); } catch(e) { res.json({ message: '' }); }
});
app.get('/api/admin/topup_notices', async function(req, res) {
    try { var p = await getPool(); var r = await p.query("SELECT * FROM notices WHERE notice_type='topup' ORDER BY id DESC"); res.json({ notices: r.rows }); } catch(e) { res.json({ notices: [] }); }
});
app.post('/api/admin/topup_notice', async function(req, res) {
    try { var p = await getPool(); var message = req.body.message; var color = req.body.color; if (!message) return res.json({ success: false }); await p.query("INSERT INTO notices (message,color,created_by,notice_type) VALUES ($1,$2,$3,'topup')", [message, color||'#fff', 'admin']); res.json({ success: true }); } catch(e) { res.json({ success: false }); }
});
app.post('/api/admin/topup_notice/delete', async function(req, res) {
    try { var p = await getPool(); await p.query("DELETE FROM notices WHERE id=$1 AND notice_type='topup'", [req.body.id]); res.json({ success: true }); } catch(e) { res.json({ success: false }); }
});
app.post('/api/admin/topup_notices/delete_all', async function(req, res) {
    try { var p = await getPool(); await p.query("DELETE FROM notices WHERE notice_type='topup'"); res.json({ success: true }); } catch(e) { res.json({ success: false }); }
});

// Buy Code Notice
app.get('/api/buycode_notice', async function(req, res) {
    try { var p = await getPool(); var r = await p.query("SELECT * FROM notices WHERE notice_type='buycode' ORDER BY id DESC LIMIT 1"); if (r.rows.length === 0) return res.json({ message: '' }); var n = r.rows[0]; res.json({ success: true, message: n.message, color: n.color, created_at: n.created_at }); } catch(e) { res.json({ message: '' }); }
});
app.get('/api/admin/buycode_notices', async function(req, res) {
    try { var p = await getPool(); var r = await p.query("SELECT * FROM notices WHERE notice_type='buycode' ORDER BY id DESC"); res.json({ notices: r.rows }); } catch(e) { res.json({ notices: [] }); }
});
app.post('/api/admin/buycode_notice', async function(req, res) {
    try { var p = await getPool(); var message = req.body.message; var color = req.body.color; if (!message) return res.json({ success: false }); await p.query("INSERT INTO notices (message,color,created_by,notice_type) VALUES ($1,$2,$3,'buycode')", [message, color||'#fff', 'admin']); res.json({ success: true }); } catch(e) { res.json({ success: false }); }
});
app.post('/api/admin/buycode_notice/delete', async function(req, res) {
    try { var p = await getPool(); await p.query("DELETE FROM notices WHERE id=$1 AND notice_type='buycode'", [req.body.id]); res.json({ success: true }); } catch(e) { res.json({ success: false }); }
});
app.post('/api/admin/buycode_notices/delete_all', async function(req, res) {
    try { var p = await getPool(); await p.query("DELETE FROM notices WHERE notice_type='buycode'"); res.json({ success: true }); } catch(e) { res.json({ success: false }); }
});

// ==================== BOT MESSAGE ====================
app.post('/api/admin/bot_message', async function(req, res) {
    var message = req.body.message; var sound = req.body.sound; var title = req.body.title;
    if (!message) return res.json({ success: false, message: 'Message required' });
    try {
        var p = await getPool(); var users = await p.query("SELECT DISTINCT google_id FROM auth_users WHERE login_type='telegram'"); var telegramCount = 0;
        for (var i = 0; i < users.rows.length; i++) {
            var user = users.rows[i]; var tid = user.google_id.replace('tg_', '');
            try { await fetch(TELEGRAM_API + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: tid, text: message, parse_mode: 'HTML' }) }); telegramCount++; } catch(e) {}
        }
        var selectedSound = sound || 'notification'; var selectedTitle = title || 'SOLO M Game Shop';
        sendOnesignal(message, selectedSound, selectedTitle);
        res.json({ success: true, count: telegramCount, push_sent: true, sound: selectedSound });
    } catch(e) { res.json({ success: false, message: 'Server error' }); }
});

async function trackTelegramLogin(userId, username) {
    try { var p = await getPool(); await p.query("INSERT INTO login_history (user_id, username, login_type, device_info, device_type, is_mobile) VALUES ($1,$2,'telegram','Telegram Bot','Bot',true)", [userId, username]); } catch(e) {}
}

// ==================== TELEGRAM BOT ====================
var lastUpdateId = 0;

function sendTelegramMessage(chatId, text, replyMarkup) {
    var body = { chat_id: chatId, text: text, parse_mode: 'HTML' };
    if (replyMarkup) body.reply_markup = JSON.stringify(replyMarkup);
    https.get(TELEGRAM_API + '/sendMessage?' + new URLSearchParams(body).toString(), function(res) { res.on('data', function() {}); }).on('error', function() {});
}

async function createTelegramUser(userId, firstName) {
    try {
        var p = await getPool(); var tgId = 'tg_' + userId;
        var exist = await p.query('SELECT * FROM auth_users WHERE google_id = $1', [tgId]);
        if (exist.rows.length > 0) { await p.query('UPDATE auth_users SET last_login = NOW() WHERE id = $1', [exist.rows[0].id]); trackTelegramLogin(exist.rows[0].id, exist.rows[0].username || firstName); return { id: exist.rows[0].id, isNew: false, balance: exist.rows[0].balance || 0 }; }
        var displayName = firstName || 'TG User'; var email = 'tg_' + userId + '@telegram.com';
        var nu = await p.query('INSERT INTO auth_users (username, email, google_id, login_type, balance) VALUES ($1, $2, $3, $4, $5) RETURNING id', [displayName, email, tgId, 'telegram', 0]);
        trackTelegramLogin(nu.rows[0].id, displayName); tgSend('Telegram User: ' + displayName + '\n' + tgId);
        return { id: nu.rows[0].id, isNew: true, balance: 0 };
    } catch(e) { return null; }
}

async function getUserBalance(userId) {
    try { var p = await getPool(); var r = await p.query("SELECT balance FROM auth_users WHERE google_id = $1", ['tg_' + userId]); return r.rows.length > 0 ? (r.rows[0].balance || 0) : null; } catch(e) { return null; }
}

async function getUserOrders(userId) {
    try { var p = await getPool(); var user = await p.query("SELECT id FROM auth_users WHERE google_id = $1", ['tg_' + userId]); if (user.rows.length === 0) return []; var r = await p.query("SELECT * FROM orders WHERE user_id = $1 ORDER BY id DESC LIMIT 3", [user.rows[0].id]); return r.rows; } catch(e) { return []; }
}

async function createOTP(userId) {
    var otp = Math.floor(100000 + Math.random() * 900000).toString();
    try { var p = await getPool(); await p.query("UPDATE otp_codes SET used = true WHERE user_id = $1", [userId]); await p.query("INSERT INTO otp_codes (user_id, code, expires_at) VALUES ($1, $2, NOW() + INTERVAL '60 seconds')", [userId, otp]); } catch(e) {}
    return otp;
}

function startLongPolling() {
    console.log('Telegram Bot Started');
    var mainKeyboard = { inline_keyboard: [[{ text: 'Home', url: 'https://two026-users-data-management.onrender.com' }], [{ text: 'Top Up', url: 'https://two026-users-data-management.onrender.com/topup.html' }], [{ text: 'Buy Code', url: 'https://two026-users-data-management.onrender.com/buycode.html' }], [{ text: 'Contact Admin', url: 'https://t.me/Solo_m28' }]] };
    var quickKeyboard = { inline_keyboard: [[{ text: 'Balance', callback_data: 'balance' }], [{ text: 'OTP', callback_data: 'otp' }], [{ text: 'Orders', callback_data: 'status' }], [{ text: 'Buy Code', callback_data: 'buycode' }], [{ text: 'Contact', url: 'https://t.me/Solo_m28' }]] };

    async function getUpdates() {
        try {
            var url = TELEGRAM_API + '/getUpdates?offset=' + (lastUpdateId + 1) + '&timeout=15';
            var response = await fetch(url, { signal: AbortSignal.timeout(20000) }); var result = await response.json();
            if (result.ok && result.result.length > 0) {
                for (var i = 0; i < result.result.length; i++) {
                    var update = result.result[i]; lastUpdateId = update.update_id;
                    if (update.callback_query) {
                        var cq = update.callback_query; var chatId = cq.message.chat.id; var data = cq.data; var firstName = cq.from.first_name || 'User';
                        var user = await createTelegramUser(cq.from.id, firstName);
                        if (!user) { sendTelegramMessage(chatId, 'Error. /start'); continue; }
                        if (data === 'balance') { var balance = user.balance || 0; sendTelegramMessage(chatId, 'Balance: ' + balance.toLocaleString() + ' Ks\n~$' + (balance/2100).toFixed(2) + ' USD', quickKeyboard); }
                        else if (data === 'otp') { var otp = await createOTP(user.id); sendTelegramMessage(chatId, 'OTP: ' + otp + '\n60 seconds only', quickKeyboard); }
                        else if (data === 'status') { var orders = await getUserOrders(cq.from.id); if (orders.length === 0) { sendTelegramMessage(chatId, 'No orders', quickKeyboard); } else { var msg = 'Recent Orders:\n\n'; for (var j = 0; j < orders.length; j++) { var o = orders[j]; var st = o.status === 'approved' ? 'OK' : o.status === 'rejected' ? 'NO' : '...'; msg += st + ' #' + o.id + ' | ' + o.amount + ' Ks | ' + o.payment_method + '\n' + new Date(o.created_at).toLocaleDateString() + '\n\n'; } sendTelegramMessage(chatId, msg, quickKeyboard); } }
                        else if (data === 'buycode') { sendTelegramMessage(chatId, 'Buy Code: https://two026-users-data-management.onrender.com/buycode.html', mainKeyboard); }
                        try { await fetch(TELEGRAM_API + '/answerCallbackQuery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: cq.id }) }); } catch(e) {}
                        continue;
                    }
                    var msg = update.message; if (!msg) continue;
                    var chatId = msg.chat.id; var text = (msg.text || '').trim(); var firstName = msg.from.first_name || 'User';
                    if (text === '/start' || text === '/login') { var u = await createTelegramUser(msg.from.id, firstName); var welcome = u.isNew ? 'Welcome to SOLO M Game Shop!\n\nHi ' + firstName + '!\n\nYour account is ready.' : 'Welcome back ' + firstName + '!'; sendTelegramMessage(chatId, welcome + '\n\nBalance: ' + (u.balance || 0).toLocaleString() + ' Ks', quickKeyboard); }
                    else if (text === '/help') { sendTelegramMessage(chatId, 'Commands:\n/start\n/help\n/balance\n/otp\n/status\n/buy\n\nContact: @Solo_m28', quickKeyboard); }
                    else if (text === '/balance') { var ub = await createTelegramUser(msg.from.id, firstName); var bal = ub ? (ub.balance || 0) : 0; sendTelegramMessage(chatId, 'Balance: ' + bal.toLocaleString() + ' Ks\n~$' + (bal/2100).toFixed(2) + ' USD', quickKeyboard); }
                    else if (text === '/otp') { var uo = await createTelegramUser(msg.from.id, firstName); if (uo) { var otp2 = await createOTP(uo.id); sendTelegramMessage(chatId, 'OTP: ' + otp2 + '\n60 seconds only'); } }
                    else if (text === '/status') { var ord = await getUserOrders(msg.from.id); if (ord.length === 0) { sendTelegramMessage(chatId, 'No orders'); } else { var smsg = 'Recent Orders:\n\n'; for (var k = 0; k < ord.length; k++) { var oo = ord[k]; var sst = oo.status === 'approved' ? 'OK' : oo.status === 'rejected' ? 'NO' : '...'; smsg += sst + ' #' + oo.id + ' | ' + oo.amount + ' Ks | ' + oo.payment_method + '\n' + new Date(oo.created_at).toLocaleDateString() + '\n\n'; } sendTelegramMessage(chatId, smsg); } }
                    else if (text === '/buy') { sendTelegramMessage(chatId, 'Buy Code: https://two026-users-data-management.onrender.com/buycode.html', mainKeyboard); }
                    else { sendTelegramMessage(chatId, 'Commands:\n/start\n/help\n/balance\n/otp\n/status\n/buy', quickKeyboard); }
                }
            }
        } catch(e) { console.log('Bot Polling:', e.message); }
        setTimeout(getUpdates, 500);
    }
    getUpdates();
    console.log('Bot Long Polling Active');
}
startLongPolling();

// ==================== VIDEO SYSTEM ====================
function getEmbedUrl(url) {
    if (!url) return '';
    if (url.match(/\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i)) return url;
    if (url.includes('catbox.moe') || url.includes('files.')) return url;
    var ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
    if (ytMatch) return 'https://www.youtube.com/embed/' + ytMatch[1] + '?autoplay=1&mute=1&playsinline=1';
    var shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
    if (shortsMatch) return 'https://www.youtube.com/embed/' + shortsMatch[1] + '?autoplay=1&mute=1&playsinline=1';
    return url;
}

app.post('/api/admin/video', async function(req, res) {
    var url = req.body.url; if (!url) return res.json({ success: false });
    try { var p = await getPool(); await p.query('DELETE FROM videos'); await p.query('INSERT INTO videos (video_url) VALUES ($1)', [url]); res.json({ success: true }); } catch(e) { res.json({ success: false }); }
});

app.get('/api/video', async function(req, res) {
    try {
        var p = await getPool(); var r = await p.query('SELECT * FROM videos ORDER BY id DESC LIMIT 1');
        if (r.rows.length > 0) { var rawUrl = r.rows[0].video_url; var embedUrl = getEmbedUrl(rawUrl); res.json({ success: true, url: embedUrl, originalUrl: rawUrl, isYouTube: embedUrl.includes('youtube.com/embed') }); }
        else { res.json({ success: false, url: '' }); }
    } catch(e) { res.json({ success: false, url: '' }); }
});

app.post('/api/admin/video/delete', async function(req, res) {
    try { var p = await getPool(); await p.query('DELETE FROM videos'); res.json({ success: true }); } catch(e) { res.json({ success: false }); }
});

// ==================== BUY CODE SYSTEM ====================
app.get('/api/redeem_codes', async function(req, res) {
    try {
        var p = await getPool(); var r = await p.query('SELECT * FROM redeem_codes WHERE used=false ORDER BY category, id ASC');
        var grouped = {};
        REDEEM_CATEGORIES.forEach(function(cat) { var codes = r.rows.filter(function(c) { return c.category === cat.id && !c.used; }); grouped[cat.id] = { name: cat.name, icon: cat.icon, price: cat.price, codes: codes.map(function(c) { return { id: c.id, code: c.code }; }) }; });
        res.json({ success: true, categories: grouped });
    } catch(e) { res.json({ success: false, categories: {} }); }
});

app.post('/api/buy_code', async function(req, res) {
    var token = req.body.token; var codeId = req.body.codeId;
    if (!token || !codeId) return res.json({ success: false, message: 'Missing data' });
    try {
        var p = await getPool(); var uid = parseInt(token.replace('token_', '')); if (isNaN(uid)) return res.json({ success: false, message: 'Invalid token' });
        var query; var params;
        if (parseInt(codeId) <= 13) {
            var catMap = { 1: 'shhh_emote', 2: 'shhh_emote', 3: 'shhh_emote', 4: 'shhh_emote', 5: 'golden_border', 6: 'golden_border', 7: 'golden_border', 8: 'golden_border', 9: 'lucky_diamond', 10: 'lucky_diamond', 11: 'lucky_diamond', 12: 'magic_durt', 13: 'emblem_box' };
            var category = catMap[parseInt(codeId)]; if (!category) return res.json({ success: false, message: 'Invalid category' });
            query = 'SELECT * FROM redeem_codes WHERE category=$1 AND used=false ORDER BY id ASC LIMIT 1'; params = [category];
        } else { query = 'SELECT * FROM redeem_codes WHERE id=$1 AND used=false'; params = [codeId]; }
        var codeCheck = await p.query(query, params);
        if (codeCheck.rows.length === 0) return res.json({ success: false, message: 'Code not available' });
        var code = codeCheck.rows[0];
        var cat = REDEEM_CATEGORIES.find(function(c) { return c.id === code.category; }); var price = cat ? cat.price : 0;
        var user = await p.query('SELECT balance FROM auth_users WHERE id=$1', [uid]); if (user.rows.length === 0) return res.json({ success: false, message: 'User not found' });
        var balance = parseFloat(user.rows[0].balance || 0); if (balance < price) return res.json({ success: false, message: 'Insufficient balance. Need ' + price + ' Ks' });
        await p.query('UPDATE redeem_codes SET used=true, used_by=$1, used_at=NOW() WHERE id=$2', [uid, code.id]);
        await p.query('UPDATE auth_users SET balance=balance-$1 WHERE id=$2', [price, uid]);
        var newBalance = balance - price;
        res.json({ success: true, code: code.code, balance: newBalance });
    } catch(e) { res.json({ success: false, message: 'Server error' }); }
});

app.get('/api/admin/redeem_codes', async function(req, res) {
    try { var p = await getPool(); var r = await p.query('SELECT * FROM redeem_codes ORDER BY category, id ASC'); res.json({ success: true, codes: r.rows }); } catch(e) { res.json({ success: false, codes: [] }); }
});

app.post('/api/admin/redeem_code', async function(req, res) {
    var category = req.body.category; var code = req.body.code; if (!category || !code) return res.json({ success: false });
    try { var p = await getPool(); await p.query('INSERT INTO redeem_codes (category, code, used) VALUES ($1, $2, $3)', [category, code, false]); res.json({ success: true }); } catch(e) { res.json({ success: false }); }
});

app.post('/api/admin/redeem_code/delete', async function(req, res) {
    var id = req.body.id; if (!id) return res.json({ success: false });
    try { var p = await getPool(); await p.query('DELETE FROM redeem_codes WHERE id=$1', [id]); res.json({ success: true }); } catch(e) { res.json({ success: false }); }
});

// ==================== MAINTENANCE PAGE ====================
function maintenancePage() {
    return '<!DOCTYPE html><html lang="my"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Maintenance</title><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"><style>*{margin:0;padding:0}body{background:linear-gradient(135deg,#0c0e27,#1a1f4b,#2c3e50);min-height:100vh;display:flex;justify-content:center;align-items:center;text-align:center;font-family:sans-serif;color:#fff}.box i{font-size:70px;color:#f39c12;animation:pulse 2s infinite}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}.box h2{color:#f39c12;margin:15px 0}.box p{color:#ccc;margin-bottom:20px}.box a{color:#000;background:#f39c12;padding:10px 25px;border-radius:6px;text-decoration:none;font-weight:bold}</style></head><body><div class="box"><i class="fas fa-tools"></i><h2>Page Under Maintenance</h2><p>Please wait...</p><a href="/dashboard"><i class="fas fa-arrow-left"></i> Back to Dashboard</a></div></body></html>';
}

async function servePageWithCheck(req, res, pageId, filePath) {
    try { var p = await getPool(); var r = await p.query('SELECT status FROM page_status WHERE page_id=$1', [pageId]); if (r.rows.length > 0 && r.rows[0].status === 'off') return res.send(maintenancePage()); } catch(e) {}
    res.sendFile(path.join(__dirname, filePath));
}

// ==================== BUY CODE NOTI BELL API ====================
app.get('/api/buycode_new_codes', async function(req, res) {
    try {
        var p = await getPool(); var r = await p.query('SELECT * FROM redeem_codes WHERE used=false ORDER BY id DESC LIMIT 1');
        if (r.rows.length > 0) { var latest = r.rows[0]; var cat = REDEEM_CATEGORIES.find(function(c) { return c.id === latest.category; }); var catName = cat ? cat.name : latest.category; res.json({ success: true, hasNew: true, latestId: latest.id, message: 'New redeem codes available!' }); }
        else { res.json({ success: true, hasNew: false, latestId: 0 }); }
    } catch(e) { res.json({ success: false }); }
});

// ==================== SPIN CONFIG ====================
var SPIN_CONFIG = {
    NORMAL_SEGMENTS: [{label:'FREE',color:'#1abc9c',reward:0,type:'free',weight:44},{label:'Thank You',color:'#7f8c8d',reward:0,type:'thanks',weight:48},{label:'500 Ks',color:'#f39c12',reward:500,type:'mmk',weight:3},{label:'$0.25',color:'#e74c3c',reward:0.25,type:'usd',weight:2},{label:'$0.50',color:'#e67e22',reward:0.50,type:'usd',weight:1},{label:'$0.75',color:'#3498db',reward:0.75,type:'usd',weight:1},{label:'$1.00',color:'#2ecc71',reward:1.00,type:'usd',weight:1},{label:'$2.00',color:'#9b59b6',reward:2.00,type:'usd',weight:1}],
    NORMAL_BUY_SEGMENTS: [{label:'FREE',color:'#1abc9c',reward:0,type:'free',weight:40},{label:'Thank You',color:'#7f8c8d',reward:0,type:'thanks',weight:50},{label:'500 Ks',color:'#f39c12',reward:500,type:'mmk',weight:5},{label:'$0.25',color:'#e74c3c',reward:0.25,type:'usd',weight:3},{label:'$0.50',color:'#e67e22',reward:0.50,type:'usd',weight:2},{label:'$0.75',color:'#3498db',reward:0.75,type:'usd',weight:1},{label:'$1.00',color:'#2ecc71',reward:1.00,type:'usd',weight:1},{label:'$2.00',color:'#9b59b6',reward:2.00,type:'usd',weight:1}],
    PREMIUM_BUY_SEGMENTS: [{label:'FREE',color:'#1abc9c',reward:0,type:'free',weight:40},{label:'Thank You',color:'#7f8c8d',reward:0,type:'thanks',weight:40},{label:'500 Ks',color:'#f39c12',reward:500,type:'mmk',weight:6},{label:'$0.25',color:'#e74c3c',reward:0.25,type:'usd',weight:3},{label:'$0.50',color:'#e67e22',reward:0.50,type:'usd',weight:2},{label:'$0.75',color:'#3498db',reward:0.75,type:'usd',weight:1},{label:'$1.00',color:'#2ecc71',reward:1.00,type:'usd',weight:1},{label:'$2.00',color:'#9b59b6',reward:2.00,type:'usd',weight:1}],
    PREMIUM_TIER1_SEGMENTS: [{label:'500 Ks',color:'#f39c12',reward:500,type:'mmk',weight:18},{label:'1000 Ks',color:'#c9a84c',reward:1000,type:'mmk',weight:14},{label:'$0.50',color:'#e74c3c',reward:0.50,type:'usd',weight:17},{label:'$0.75',color:'#e67e22',reward:0.75,type:'usd',weight:15},{label:'$1.00',color:'#2ecc71',reward:1.00,type:'usd',weight:12},{label:'$2.00',color:'#9b59b6',reward:2.00,type:'usd',weight:9},{label:'$3.00',color:'#e91e63',reward:3.00,type:'usd',weight:6},{label:'SUPER',color:'#ff1744',reward:0,type:'super',weight:5},{label:'Thank You',color:'#7f8c8d',reward:0,type:'thanks',weight:5}],
    PREMIUM_TIER2_SEGMENTS: [{label:'500 Ks',color:'#f39c12',reward:500,type:'mmk',weight:14},{label:'1000 Ks',color:'#c9a84c',reward:1000,type:'mmk',weight:11},{label:'$0.50',color:'#e74c3c',reward:0.50,type:'usd',weight:12},{label:'$0.75',color:'#e67e22',reward:0.75,type:'usd',weight:11},{label:'$1.00',color:'#2ecc71',reward:1.00,type:'usd',weight:10},{label:'$2.00',color:'#9b59b6',reward:2.00,type:'usd',weight:7},{label:'$3.00',color:'#e91e63',reward:3.00,type:'usd',weight:5},{label:'SUPER',color:'#ff1744',reward:0,type:'super',weight:3},{label:'Thank You',color:'#7f8c8d',reward:0,type:'thanks',weight:25}],
    PREMIUM_TIER3_SEGMENTS: [{label:'500 Ks',color:'#f39c12',reward:500,type:'mmk',weight:12},{label:'1000 Ks',color:'#c9a84c',reward:1000,type:'mmk',weight:10},{label:'$0.50',color:'#e74c3c',reward:0.50,type:'usd',weight:15},{label:'$0.75',color:'#e67e22',reward:0.75,type:'usd',weight:11},{label:'$1.00',color:'#2ecc71',reward:1.00,type:'usd',weight:7},{label:'$2.00',color:'#9b59b6',reward:2.00,type:'usd',weight:5},{label:'$3.00',color:'#e91e63',reward:3.00,type:'usd',weight:4},{label:'SUPER',color:'#ff1744',reward:0,type:'super',weight:4},{label:'Thank You',color:'#7f8c8d',reward:0,type:'thanks',weight:34}]
};

// ==================== SPIN & USD APIs ====================
app.post('/api/get_usd_balance', async function(req, res) {
    var token = req.body.token; if (!token || token === 'guest') return res.json({ usd_balance: 0 });
    try { var p = await getPool(); var uid = parseInt(token.replace('token_', '')); if (isNaN(uid)) return res.json({ usd_balance: 0 }); var r = await p.query('SELECT usd_balance FROM auth_users WHERE id=$1', [uid]); res.json({ usd_balance: parseFloat(r.rows[0] ? r.rows[0].usd_balance : 0) }); } catch(e) { res.json({ usd_balance: 0 }); }
});

app.post('/api/get_balance', async function(req, res) {
    var token = req.body.token; if (!token || token === 'guest') return res.json({ balance: 0 });
    try { var p = await getPool(); var uid = parseInt(token.replace('token_', '')); if (isNaN(uid)) return res.json({ balance: 0 }); var r = await p.query('SELECT balance FROM auth_users WHERE id=$1', [uid]); res.json({ balance: parseFloat(r.rows[0] ? r.rows[0].balance : 0) }); } catch(e) { res.json({ balance: 0 }); }
});

app.post('/api/get_paid_spins', async function(req, res) {
    var token = req.body.token; if (!token || token === 'guest') return res.json({ paid_spins: 0 });
    try { var p = await getPool(); var uid = parseInt(token.replace('token_', '')); if (isNaN(uid)) return res.json({ paid_spins: 0 }); var r = await p.query('SELECT paid_spins FROM auth_users WHERE id=$1', [uid]); res.json({ paid_spins: parseInt(r.rows[0] ? r.rows[0].paid_spins : 0) }); } catch(e) { res.json({ paid_spins: 0 }); }
});

app.post('/api/get_premium_status', async function(req, res) {
    var token = req.body.token; if (!token || token === 'guest') return res.json({ success: false, premium_active: false });
    try {
        var p = await getPool(); var uid = parseInt(token.replace('token_', '')); if (isNaN(uid)) return res.json({ success: false, premium_active: false });
        var r = await p.query('SELECT premium_expiry, premium_tier FROM auth_users WHERE id=$1', [uid]);
        var isPremium = r.rows.length > 0 && r.rows[0].premium_expiry && new Date(r.rows[0].premium_expiry) > new Date();
        var premiumTier = r.rows[0] ? r.rows[0].premium_tier : 1;
        var maxDaily = 1;
        if (isPremium) { switch(premiumTier) { case 1: maxDaily = 3; break; case 2: maxDaily = 5; break; case 3: maxDaily = 7; break; default: maxDaily = 3; } }
        var todayDraws = await p.query("SELECT COUNT(*) as cnt FROM spin_history_v2 WHERE user_id=$1 AND DATE(created_at)=CURRENT_DATE AND spin_source='daily'", [uid]);
        var usedToday = parseInt(todayDraws.rows[0] ? todayDraws.rows[0].cnt : 0);
        var remaining = Math.max(0, maxDaily - usedToday);
        res.json({ success: true, premium_active: isPremium, premium_tier: premiumTier, expires_at: isPremium ? r.rows[0].premium_expiry.toISOString() : null, daily_draws_remaining: remaining, max_daily_draws: maxDaily });
    } catch(e) { res.json({ success: false, premium_active: false }); }
});

app.post('/api/deduct_balance', async function(req, res) {
    var token = req.body.token; var amount = req.body.amount; var reason = req.body.reason;
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    if (!amount || amount <= 0) return res.json({ success: false, message: 'Invalid amount' });
    try {
        var p = await getPool(); var uid = parseInt(token.replace('token_', '')); if (isNaN(uid)) return res.json({ success: false, message: 'Invalid session' });
        var r = await p.query('SELECT balance FROM auth_users WHERE id=$1', [uid]); var balance = parseFloat(r.rows[0] ? r.rows[0].balance : 0);
        if (balance < amount) return res.json({ success: false, message: 'Not enough balance' });
        await p.query('UPDATE auth_users SET balance = balance - $1 WHERE id=$2', [amount, uid]);
        if (reason && reason.indexOf('Buy') !== -1 && reason.indexOf('spins') !== -1) { var spinsMatch = reason.match(/Buy (\d+) spins/); if (spinsMatch) await p.query('UPDATE auth_users SET paid_spins = COALESCE(paid_spins, 0) + $1 WHERE id=$2', [parseInt(spinsMatch[1]), uid]); }
        await p.query("INSERT INTO orders (user_id, username, amount, payment_method, status) VALUES ($1, (SELECT username FROM auth_users WHERE id=$1), $2, $3, 'approved')", [uid, -amount, reason || 'Spin Purchase']);
        res.json({ success: true, new_balance: balance - amount });
    } catch(e) { res.json({ success: false, message: 'Server error' }); }
});

app.post('/api/buy_premium', async function(req, res) {
    var token = req.body.token; var months = req.body.months; var cost = req.body.cost; var tier = req.body.tier;
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    if (!months || !cost) return res.json({ success: false, message: 'Missing data' });
    try {
        var p = await getPool(); var uid = parseInt(token.replace('token_', '')); if (isNaN(uid)) return res.json({ success: false, message: 'Invalid session' });
        var bal = await p.query('SELECT balance FROM auth_users WHERE id=$1', [uid]); var balance = parseFloat(bal.rows[0] ? bal.rows[0].balance : 0);
        if (balance < cost) return res.json({ success: false, message: 'Not enough balance' });
        var expiry = new Date(); expiry.setMonth(expiry.getMonth() + months); var premiumTier = tier || 1;
        await p.query('UPDATE auth_users SET balance = balance - $1, premium_expiry = $2, premium_tier = $3 WHERE id = $4', [cost, expiry, premiumTier, uid]);
        await p.query("INSERT INTO orders (user_id, username, amount, payment_method, status) VALUES ($1, (SELECT username FROM auth_users WHERE id=$1), $2, 'Premium Purchase', 'approved')", [uid, -cost]);
        await p.query('INSERT INTO weekly_bonus (user_id) VALUES ($1)', [uid]);
        res.json({ success: true, expires_at: expiry.toISOString(), premium_tier: premiumTier });
    } catch(e) { res.json({ success: false, message: 'Server error' }); }
});

app.post('/api/claim_weekly_bonus', async function(req, res) {
    var token = req.body.token; if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    try {
        var p = await getPool(); var uid = parseInt(token.replace('token_', '')); if (isNaN(uid)) return res.json({ success: false, message: 'Invalid session' });
        var last = await p.query('SELECT claimed_at FROM weekly_bonus WHERE user_id=$1 ORDER BY claimed_at DESC LIMIT 1', [uid]);
        if (last.rows.length > 0 && Math.floor((Date.now() - new Date(last.rows[0].claimed_at).getTime()) / 86400000) < 7) return res.json({ success: false, message: 'Already claimed this week' });
        await p.query('INSERT INTO weekly_bonus (user_id) VALUES ($1)', [uid]); res.json({ success: true, message: 'Weekly bonus claimed!' });
    } catch(e) { res.json({ success: false, message: 'Server error' }); }
});

app.post('/api/admin/revoke_premium', async function(req, res) {
    var userId = req.body.userId; if (!userId) return res.json({ success: false, message: 'User ID required' });
    try { var p = await getPool(); await p.query('UPDATE auth_users SET premium_expiry = NULL, premium_tier = 1 WHERE id = $1', [userId]); res.json({ success: true, message: 'Premium access revoked!' }); } catch(e) { res.json({ success: false, message: 'Server error' }); }
});

app.post('/api/admin/get_user_premium', async function(req, res) {
    var userId = req.body.userId; if (!userId) return res.json({ success: false });
    try {
        var p = await getPool(); var r = await p.query('SELECT premium_expiry, premium_tier, username FROM auth_users WHERE id=$1', [userId]);
        if (r.rows.length > 0) { var u = r.rows[0]; var isActive = u.premium_expiry && new Date(u.premium_expiry) > new Date(); res.json({ success: true, username: u.username, premium_active: isActive, premium_tier: u.premium_tier || 1, expires_at: u.premium_expiry ? u.premium_expiry.toISOString() : null, days_left: u.premium_expiry ? Math.max(0, Math.ceil((new Date(u.premium_expiry) - new Date()) / (1000 * 60 * 60 * 24))) : 0 }); }
        else { res.json({ success: false, message: 'User not found' }); }
    } catch(e) { res.json({ success: false, message: 'Server error' }); }
});

app.post('/api/exchange_usd_to_mmk', async function(req, res) {
    var token = req.body.token; var usd_amount = req.body.usd_amount;
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    if (!usd_amount || usd_amount < 1) return res.json({ success: false, message: 'Minimum 1 USD required' });
    try {
        var p = await getPool(); var uid = parseInt(token.replace('token_', '')); if (isNaN(uid)) return res.json({ success: false, message: 'Invalid session' });
        var r = await p.query('SELECT usd_balance FROM auth_users WHERE id=$1', [uid]); var usdBalance = parseFloat(r.rows[0] ? r.rows[0].usd_balance : 0);
        if (usdBalance < usd_amount) return res.json({ success: false, message: 'Insufficient USD balance' });
        var mmkAmount = 2000 * usd_amount;
        await p.query('UPDATE auth_users SET usd_balance = usd_balance - $1 WHERE id=$2', [usd_amount, uid]);
        await p.query('UPDATE auth_users SET balance = COALESCE(balance,0) + $1 WHERE id=$2', [mmkAmount, uid]);
        res.json({ success: true, mmk_received: mmkAmount, service_fee: 1000 * usd_amount });
    } catch(e) { res.json({ success: false, message: 'Server error' }); }
});

app.get('/api/exchange_rate_info', async function(req, res) {
    try {
        var p = await getPool(); var r = await p.query("SELECT value FROM settings WHERE key = 'exchange_rate'"); var baseRate = r.rows.length > 0 ? parseInt(r.rows[0].value) : 3500;
        res.json({ success: true, base_rate: baseRate, fees: { transport: 300, internet: 300, data_transfer: 400, total: 1000 }, final_rate: baseRate - 1000 });
    } catch(e) { res.json({ success: true, base_rate: 3500, fees: { transport: 300, internet: 300, data_transfer: 400, total: 1000 }, final_rate: 2500 }); }
});

app.post('/api/spin/save', async function(req, res) {
    var token = req.body.token; var reward_type = req.body.reward_type; var reward_amount = req.body.reward_amount; var segment_label = req.body.segment_label;
    if (!token || token === 'guest') return res.json({ success: false });
    try {
        var p = await getPool(); var uid = parseInt(token.replace('token_', '')); if (isNaN(uid)) return res.json({ success: false });
        await p.query('INSERT INTO spin_history (user_id, reward_type, reward_amount, segment_label) VALUES ($1,$2,$3,$4)', [uid, reward_type||'thanks', reward_amount||0, segment_label||'Unknown']);
        if (reward_type === 'usd' && reward_amount > 0) await p.query('UPDATE auth_users SET usd_balance = COALESCE(usd_balance,0) + $1 WHERE id=$2', [reward_amount, uid]);
        else if (reward_type === 'mmk' && reward_amount > 0) await p.query('UPDATE auth_users SET balance = COALESCE(balance,0) + $1 WHERE id=$2', [reward_amount, uid]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

app.post('/api/spin/use_paid_spin', async function(req, res) {
    var token = req.body.token; if (!token || token === 'guest') return res.json({ success: false });
    try { var p = await getPool(); var uid = parseInt(token.replace('token_', '')); if (isNaN(uid)) return res.json({ success: false }); await p.query('UPDATE auth_users SET paid_spins = GREATEST(0, COALESCE(paid_spins, 0) - 1) WHERE id=$1', [uid]); res.json({ success: true }); } catch(e) { res.json({ success: false }); }
});

app.post('/api/track_premium_draw', async function(req, res) {
    var token = req.body.token; if (!token || token === 'guest') return res.json({ success: false });
    try { var p = await getPool(); var uid = parseInt(token.replace('token_', '')); if (isNaN(uid)) return res.json({ success: false }); await p.query('INSERT INTO premium_draws (user_id, draw_date, draw_count) VALUES ($1, CURRENT_DATE, 1) ON CONFLICT (user_id, draw_date) DO UPDATE SET draw_count = premium_draws.draw_count + 1', [uid]); res.json({ success: true }); } catch(e) { res.json({ success: false }); }
});

// ==================== SPIN EXECUTE API ====================
app.post('/api/spin/execute', async function(req, res) {
    var token = req.body.token; var spin_source = req.body.spin_source;
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    if (!spin_source || ['daily', 'bought', 'premium_bought', 'weekly_bonus'].indexOf(spin_source) === -1) return res.json({ success: false, message: 'Invalid spin source' });
    try {
        var p = await getPool(); var uid = parseInt(token.replace('token_', '')); if (isNaN(uid)) return res.json({ success: false, message: 'Invalid session' });
        var user = await p.query('SELECT * FROM auth_users WHERE id=$1', [uid]); if (user.rows.length === 0) return res.json({ success: false, message: 'User not found' });
        var u = user.rows[0]; var isPremium = u.premium_expiry && new Date(u.premium_expiry) > new Date(); var premiumTier = u.premium_tier || 1;
        var maxDaily = 1;
        if (isPremium) { switch(premiumTier) { case 1: maxDaily = 3; break; case 2: maxDaily = 5; break; case 3: maxDaily = 7; break; default: maxDaily = 3; } }
        var todayDraws = await p.query("SELECT COUNT(*) as cnt FROM spin_history_v2 WHERE user_id=$1 AND DATE(created_at)=CURRENT_DATE AND spin_source='daily'", [uid]); var dailyUsed = parseInt(todayDraws.rows[0] ? todayDraws.rows[0].cnt : 0); var dailyRemaining = Math.max(0, maxDaily - dailyUsed); var boughtSpins = parseInt(u.paid_spins || 0);
        var weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        var weeklyBonusUsed = await p.query("SELECT COUNT(*) as cnt FROM spin_history_v2 WHERE user_id=$1 AND spin_source='weekly_bonus' AND created_at >= $2", [uid, weekStart]);
        var weeklyClaimed = await p.query("SELECT COUNT(*) as cnt FROM weekly_bonus WHERE user_id=$1 AND claimed_at >= $2", [uid, weekStart]);
        var weeklyTotal = 0;
        if (weeklyClaimed.rows[0] && weeklyClaimed.rows[0].cnt > 0 && isPremium) { switch(premiumTier) { case 1: weeklyTotal = 5; break; case 2: weeklyTotal = 7; break; case 3: weeklyTotal = 10; break; default: weeklyTotal = 5; } }
        var weeklyRemaining = Math.max(0, weeklyTotal - parseInt(weeklyBonusUsed.rows[0] ? weeklyBonusUsed.rows[0].cnt : 0));
        var canSpin = false;
        if (spin_source === 'daily' && dailyRemaining > 0) { canSpin = true; }
        else if ((spin_source === 'bought' || spin_source === 'premium_bought') && boughtSpins > 0) { canSpin = true; await p.query('UPDATE auth_users SET paid_spins = GREATEST(0, paid_spins - 1) WHERE id=$1', [uid]); }
        else if (spin_source === 'weekly_bonus' && isPremium && weeklyRemaining > 0) { canSpin = true; }
        if (!canSpin) return res.json({ success: false, message: 'No draws remaining', draws: { daily: dailyRemaining, bought: boughtSpins, weekly: weeklyRemaining } });
        var segments;
        if (!isPremium) { segments = (spin_source === 'daily') ? SPIN_CONFIG.NORMAL_SEGMENTS : SPIN_CONFIG.NORMAL_BUY_SEGMENTS; }
        else { if (spin_source === 'daily' || spin_source === 'weekly_bonus') { switch(premiumTier) { case 1: segments = SPIN_CONFIG.PREMIUM_TIER1_SEGMENTS; break; case 2: segments = SPIN_CONFIG.PREMIUM_TIER2_SEGMENTS; break; case 3: segments = SPIN_CONFIG.PREMIUM_TIER3_SEGMENTS; break; default: segments = SPIN_CONFIG.PREMIUM_TIER1_SEGMENTS; } } else { segments = SPIN_CONFIG.PREMIUM_BUY_SEGMENTS; } }
        var totalWeight = segments.reduce(function(sum, s) { return sum + s.weight; }, 0); var rand = Math.random() * totalWeight; var winIndex = 0;
        for (var i = 0; i < segments.length; i++) { rand -= segments[i].weight; if (rand <= 0) { winIndex = i; break; } }
        var reward = segments[winIndex];
        var balBefore = { mmk: parseFloat(u.balance||0), usd: parseFloat(u.usd_balance||0) }; var balAfter = { mmk: balBefore.mmk, usd: balBefore.usd };
        if (reward.type === 'usd' && reward.reward > 0) { await p.query('UPDATE auth_users SET usd_balance = COALESCE(usd_balance,0) + $1 WHERE id=$2', [reward.reward, uid]); balAfter.usd += reward.reward; }
        else if (reward.type === 'mmk' && reward.reward > 0) { await p.query('UPDATE auth_users SET balance = COALESCE(balance,0) + $1 WHERE id=$2', [reward.reward, uid]); balAfter.mmk += reward.reward; }
        else if (reward.type === 'free' && (spin_source === 'bought' || spin_source === 'premium_bought')) { await p.query('UPDATE auth_users SET paid_spins = paid_spins + 1 WHERE id=$1', [uid]); }
        await p.query('INSERT INTO spin_history_v2 (user_id, spin_source, reward_type, reward_amount, balance_before_mmk, balance_after_mmk, balance_before_usd, balance_after_usd) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [uid, spin_source, reward.type, reward.reward, balBefore.mmk, balAfter.mmk, balBefore.usd, balAfter.usd]);
        var updatedUser = await p.query('SELECT paid_spins FROM auth_users WHERE id=$1', [uid]); var updatedBought = parseInt(updatedUser.rows[0] ? updatedUser.rows[0].paid_spins : 0);
        res.json({ success: true, winIndex: winIndex, reward: reward, mmkBalance: balAfter.mmk, usdBalance: balAfter.usd, draws: { daily: spin_source === 'daily' ? dailyRemaining - 1 : dailyRemaining, bought: (spin_source === 'bought' || spin_source === 'premium_bought') ? updatedBought : boughtSpins, weekly: spin_source === 'weekly_bonus' ? weeklyRemaining - 1 : weeklyRemaining } });
    } catch(e) { res.json({ success: false, message: 'Server error: ' + e.message }); }
});

// ==================== SPIN RATES ====================
async function createSpinRatesTable() {
    var query = 'CREATE TABLE IF NOT EXISTS spin_rates (id SERIAL PRIMARY KEY, rate_type VARCHAR(50) NOT NULL, segment_label VARCHAR(50) NOT NULL, reward DECIMAL(10,2) DEFAULT 0, reward_type VARCHAR(20) DEFAULT \'usd\', segment_color VARCHAR(20) DEFAULT \'#e74c3c\', weight INT DEFAULT 10, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(rate_type, segment_label))';
    try { await pool1.query(query); await pool2.query(query); console.log('spin_rates table created'); } catch(e) { console.log('spin_rates error:', e.message); }
}
createSpinRatesTable();

async function initDefaultSpinRates() {
    var defaultRates = [
        {rate_type:'normal_daily',segment_label:'FREE',reward:0,reward_type:'free',segment_color:'#1abc9c',weight:44},{rate_type:'normal_daily',segment_label:'Thank You',reward:0,reward_type:'thanks',segment_color:'#7f8c8d',weight:48},{rate_type:'normal_daily',segment_label:'500 Ks',reward:500,reward_type:'mmk',segment_color:'#f39c12',weight:3},{rate_type:'normal_daily',segment_label:'$0.25',reward:0.25,reward_type:'usd',segment_color:'#e74c3c',weight:2},{rate_type:'normal_daily',segment_label:'$0.50',reward:0.50,reward_type:'usd',segment_color:'#e67e22',weight:1},{rate_type:'normal_daily',segment_label:'$0.75',reward:0.75,reward_type:'usd',segment_color:'#3498db',weight:1},{rate_type:'normal_daily',segment_label:'$1.00',reward:1.00,reward_type:'usd',segment_color:'#2ecc71',weight:1},{rate_type:'normal_daily',segment_label:'$2.00',reward:2.00,reward_type:'usd',segment_color:'#9b59b6',weight:1},
        {rate_type:'normal_buy',segment_label:'FREE',reward:0,reward_type:'free',segment_color:'#1abc9c',weight:40},{rate_type:'normal_buy',segment_label:'Thank You',reward:0,reward_type:'thanks',segment_color:'#7f8c8d',weight:50},{rate_type:'normal_buy',segment_label:'500 Ks',reward:500,reward_type:'mmk',segment_color:'#f39c12',weight:5},{rate_type:'normal_buy',segment_label:'$0.25',reward:0.25,reward_type:'usd',segment_color:'#e74c3c',weight:3},{rate_type:'normal_buy',segment_label:'$0.50',reward:0.50,reward_type:'usd',segment_color:'#e67e22',weight:2},{rate_type:'normal_buy',segment_label:'$0.75',reward:0.75,reward_type:'usd',segment_color:'#3498db',weight:1},{rate_type:'normal_buy',segment_label:'$1.00',reward:1.00,reward_type:'usd',segment_color:'#2ecc71',weight:1},{rate_type:'normal_buy',segment_label:'$2.00',reward:2.00,reward_type:'usd',segment_color:'#9b59b6',weight:1},
        {rate_type:'premium_buy',segment_label:'FREE',reward:0,reward_type:'free',segment_color:'#1abc9c',weight:40},{rate_type:'premium_buy',segment_label:'Thank You',reward:0,reward_type:'thanks',segment_color:'#7f8c8d',weight:40},{rate_type:'premium_buy',segment_label:'500 Ks',reward:500,reward_type:'mmk',segment_color:'#f39c12',weight:6},{rate_type:'premium_buy',segment_label:'$0.25',reward:0.25,reward_type:'usd',segment_color:'#e74c3c',weight:3},{rate_type:'premium_buy',segment_label:'$0.50',reward:0.50,reward_type:'usd',segment_color:'#e67e22',weight:2},{rate_type:'premium_buy',segment_label:'$0.75',reward:0.75,reward_type:'usd',segment_color:'#3498db',weight:1},{rate_type:'premium_buy',segment_label:'$1.00',reward:1.00,reward_type:'usd',segment_color:'#2ecc71',weight:1},{rate_type:'premium_buy',segment_label:'$2.00',reward:2.00,reward_type:'usd',segment_color:'#9b59b6',weight:1},
        {rate_type:'premium_tier1',segment_label:'500 Ks',reward:500,reward_type:'mmk',segment_color:'#f39c12',weight:18},{rate_type:'premium_tier1',segment_label:'1000 Ks',reward:1000,reward_type:'mmk',segment_color:'#c9a84c',weight:14},{rate_type:'premium_tier1',segment_label:'$0.50',reward:0.50,reward_type:'usd',segment_color:'#e74c3c',weight:17},{rate_type:'premium_tier1',segment_label:'$0.75',reward:0.75,reward_type:'usd',segment_color:'#e67e22',weight:15},{rate_type:'premium_tier1',segment_label:'$1.00',reward:1.00,reward_type:'usd',segment_color:'#2ecc71',weight:12},{rate_type:'premium_tier1',segment_label:'$2.00',reward:2.00,reward_type:'usd',segment_color:'#9b59b6',weight:9},{rate_type:'premium_tier1',segment_label:'$3.00',reward:3.00,reward_type:'usd',segment_color:'#e91e63',weight:6},{rate_type:'premium_tier1',segment_label:'SUPER',reward:0,reward_type:'super',segment_color:'#ff1744',weight:5},{rate_type:'premium_tier1',segment_label:'Thank You',reward:0,reward_type:'thanks',segment_color:'#7f8c8d',weight:5},
        {rate_type:'premium_tier2',segment_label:'500 Ks',reward:500,reward_type:'mmk',segment_color:'#f39c12',weight:14},{rate_type:'premium_tier2',segment_label:'1000 Ks',reward:1000,reward_type:'mmk',segment_color:'#c9a84c',weight:11},{rate_type:'premium_tier2',segment_label:'$0.50',reward:0.50,reward_type:'usd',segment_color:'#e74c3c',weight:12},{rate_type:'premium_tier2',segment_label:'$0.75',reward:0.75,reward_type:'usd',segment_color:'#e67e22',weight:11},{rate_type:'premium_tier2',segment_label:'$1.00',reward:1.00,reward_type:'usd',segment_color:'#2ecc71',weight:10},{rate_type:'premium_tier2',segment_label:'$2.00',reward:2.00,reward_type:'usd',segment_color:'#9b59b6',weight:7},{rate_type:'premium_tier2',segment_label:'$3.00',reward:3.00,reward_type:'usd',segment_color:'#e91e63',weight:5},{rate_type:'premium_tier2',segment_label:'SUPER',reward:0,reward_type:'super',segment_color:'#ff1744',weight:3},{rate_type:'premium_tier2',segment_label:'Thank You',reward:0,reward_type:'thanks',segment_color:'#7f8c8d',weight:25},
        {rate_type:'premium_tier3',segment_label:'500 Ks',reward:500,reward_type:'mmk',segment_color:'#f39c12',weight:12},{rate_type:'premium_tier3',segment_label:'1000 Ks',reward:1000,reward_type:'mmk',segment_color:'#c9a84c',weight:10},{rate_type:'premium_tier3',segment_label:'$0.50',reward:0.50,reward_type:'usd',segment_color:'#e74c3c',weight:15},{rate_type:'premium_tier3',segment_label:'$0.75',reward:0.75,reward_type:'usd',segment_color:'#e67e22',weight:11},{rate_type:'premium_tier3',segment_label:'$1.00',reward:1.00,reward_type:'usd',segment_color:'#2ecc71',weight:7},{rate_type:'premium_tier3',segment_label:'$2.00',reward:2.00,reward_type:'usd',segment_color:'#9b59b6',weight:5},{rate_type:'premium_tier3',segment_label:'$3.00',reward:3.00,reward_type:'usd',segment_color:'#e91e63',weight:4},{rate_type:'premium_tier3',segment_label:'SUPER',reward:0,reward_type:'super',segment_color:'#ff1744',weight:4},{rate_type:'premium_tier3',segment_label:'Thank You',reward:0,reward_type:'thanks',segment_color:'#7f8c8d',weight:34}
    ];
    try { for (var i = 0; i < defaultRates.length; i++) { var rate = defaultRates[i]; await pool1.query('INSERT INTO spin_rates (rate_type, segment_label, reward, reward_type, segment_color, weight) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (rate_type, segment_label) DO NOTHING', [rate.rate_type, rate.segment_label, rate.reward, rate.reward_type, rate.segment_color, rate.weight]); } console.log('Default spin rates initialized'); } catch(e) { console.log('Default spin rates error:', e.message); }
}
initDefaultSpinRates();

app.get('/api/spin_rates', async function(req, res) {
    try { var p = await getPool(); var r = await p.query('SELECT * FROM spin_rates ORDER BY rate_type, id ASC'); var rates = {}; r.rows.forEach(function(row) { if (!rates[row.rate_type]) rates[row.rate_type] = []; rates[row.rate_type].push({ label: row.segment_label, color: row.segment_color, reward: parseFloat(row.reward), type: row.reward_type, weight: row.weight }); }); res.json({ success: true, rates: rates }); } catch(e) { res.json({ success: false, rates: {} }); }
});

app.get('/api/admin/spin_rates', async function(req, res) {
    try { var p = await getPool(); var r = await p.query('SELECT * FROM spin_rates ORDER BY rate_type, id ASC'); res.json({ success: true, rates: r.rows }); } catch(e) { res.json({ success: false, rates: [] }); }
});

app.post('/api/admin/spin_rates/save', async function(req, res) {
    var rates = req.body.rates; if (!rates || !Array.isArray(rates)) return res.json({ success: false, message: 'Invalid data' });
    try { var p = await getPool(); for (var i = 0; i < rates.length; i++) { var rate = rates[i]; await p.query('UPDATE spin_rates SET weight = $1, updated_at = NOW() WHERE rate_type = $2 AND segment_label = $3', [rate.weight, rate.rate_type, rate.segment_label]); } res.json({ success: true, message: 'Rates updated!' }); } catch(e) { res.json({ success: false, message: 'Server error' }); }
});

// ==================== PROMO CODE SYSTEM ====================
async function createPromoCodesTable() {
    var query = 'CREATE TABLE IF NOT EXISTS promo_codes (id SERIAL PRIMARY KEY, api_key VARCHAR(64) UNIQUE NOT NULL, amount DECIMAL DEFAULT 0, currency VARCHAR(10) DEFAULT \'MMK\', used BOOLEAN DEFAULT false, used_by INT, used_at TIMESTAMP, expiry_date DATE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)';
    try { await pool1.query(query); await pool2.query(query); console.log('promo_codes table ready'); } catch(e) { console.log('promo_codes error:', e.message); }
}
createPromoCodesTable();
var PROMO_CODE_PRICE = 700;

app.post('/api/admin/promo_code/create', async function(req, res) {
    var api_key = req.body.api_key; var amount = req.body.amount; var currency = req.body.currency; var expiry_date = req.body.expiry_date;
    if (!api_key || !amount) return res.json({ success: false, message: 'API Key and Amount required' });
    try { var p = await getPool(); await p.query('INSERT INTO promo_codes (api_key, amount, currency, expiry_date) VALUES ($1, $2, $3, $4)', [api_key, parseFloat(amount), currency || 'MMK', expiry_date || null]); res.json({ success: true, message: 'Promo code created!' }); } catch(e) { res.json({ success: false, message: 'Server error: ' + e.message }); }
});

app.get('/api/admin/promo_codes', async function(req, res) {
    try { var p = await getPool(); var r = await p.query('SELECT * FROM promo_codes ORDER BY id DESC'); res.json({ success: true, codes: r.rows }); } catch(e) { res.json({ success: false, codes: [] }); }
});

app.post('/api/admin/promo_code/delete', async function(req, res) {
    var id = req.body.id; if (!id) return res.json({ success: false, message: 'ID required' });
    try { var p = await getPool(); await p.query('DELETE FROM promo_codes WHERE id = $1', [id]); res.json({ success: true, message: 'Deleted!' }); } catch(e) { res.json({ success: false, message: 'Server error' }); }
});

app.post('/api/buy_promo_code', async function(req, res) {
    var token = req.body.token; var codeId = req.body.codeId; if (!token || !codeId) return res.json({ success: false, message: 'Missing data' });
    try {
        var p = await getPool(); var uid = parseInt(token.replace('token_', '')); if (isNaN(uid)) return res.json({ success: false, message: 'Invalid token' });
        var code = await p.query('SELECT * FROM promo_codes WHERE id = $1 AND used = false AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)', [codeId]);
        if (code.rows.length === 0) return res.json({ success: false, message: 'Promo code not available' });
        var c = code.rows[0]; var user = await p.query('SELECT balance FROM auth_users WHERE id=$1', [uid]); if (user.rows.length === 0) return res.json({ success: false, message: 'User not found' });
        var balance = parseFloat(user.rows[0].balance || 0); if (balance < PROMO_CODE_PRICE) return res.json({ success: false, message: 'Insufficient balance. Need ' + PROMO_CODE_PRICE + ' Ks' });
        await p.query('UPDATE promo_codes SET used = true WHERE id = $1', [c.id]);
        await p.query('UPDATE auth_users SET balance = balance - $1 WHERE id = $2', [PROMO_CODE_PRICE, uid]);
        var newBalance = balance - PROMO_CODE_PRICE;
        res.json({ success: true, code: c.api_key, amount: c.amount, currency: c.currency, balance: newBalance });
    } catch(e) { res.json({ success: false, message: 'Server error' }); }
});

app.post('/api/redeem_promo', async function(req, res) {
    var token = req.body.token; var promo_code = req.body.promo_code;
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    if (!promo_code) return res.json({ success: false, message: 'Promo code required' });
    try {
        var p = await getPool(); var uid = parseInt(token.replace('token_', '')); var promoCode = promo_code.toUpperCase();
        var code = await p.query("SELECT * FROM promo_codes WHERE UPPER(api_key) = $1 AND used = true AND used_by IS NULL AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)", [promoCode]);
        if (code.rows.length > 0) {
            var c = code.rows[0]; await p.query('UPDATE promo_codes SET used_by = $1, used_at = NOW() WHERE id = $2', [uid, c.id]);
            if (c.currency === 'USD') { await p.query('UPDATE auth_users SET usd_balance = COALESCE(usd_balance,0) + $1 WHERE id = $2', [c.amount, uid]); }
            else { await p.query('UPDATE auth_users SET balance = COALESCE(balance,0) + $1 WHERE id = $2', [c.amount, uid]); }
            var updatedUser = await p.query('SELECT balance, usd_balance FROM auth_users WHERE id = $1', [uid]);
            return res.json({ success: true, message: 'Success! ' + c.amount.toLocaleString() + ' ' + c.currency + ' received!', amount: c.amount, currency: c.currency, balance: parseFloat(updatedUser.rows[0] ? updatedUser.rows[0].balance : 0), usd_balance: parseFloat(updatedUser.rows[0] ? updatedUser.rows[0].usd_balance : 0) });
        }
        var redeemedCheck = await p.query("SELECT * FROM promo_codes WHERE UPPER(api_key) = $1 AND used = true AND used_by IS NOT NULL", [promoCode]);
        if (redeemedCheck.rows.length > 0) return res.json({ success: false, message: 'Code already used (one time only)' });
        var unsoldCheck = await p.query("SELECT * FROM promo_codes WHERE UPPER(api_key) = $1 AND used = false", [promoCode]);
        if (unsoldCheck.rows.length > 0) return res.json({ success: false, message: 'Invalid code' });
        var expiredCheck = await p.query("SELECT * FROM promo_codes WHERE UPPER(api_key) = $1 AND expiry_date < CURRENT_DATE", [promoCode]);
        if (expiredCheck.rows.length > 0) return res.json({ success: false, message: 'Code expired' });
        return res.json({ success: false, message: 'Invalid code' });
    } catch(e) { res.json({ success: false, message: 'Server error' }); }
});

// ==================== DAILY CHECK-IN EVENT MANAGEMENT (ADMIN) ====================
app.get('/api/admin/checkin_events', async function(req, res) {
    try {
        var p = await getPool(); var events = await p.query('SELECT * FROM daily_checkin_events ORDER BY id DESC');
        for (var i = 0; i < events.rows.length; i++) { var event = events.rows[i]; var rewards = await p.query('SELECT * FROM daily_checkin_rewards WHERE event_id=$1 ORDER BY day_number ASC', [event.id]); event.rewards = rewards.rows; }
        res.json({ success: true, events: events.rows });
    } catch(e) { res.json({ success: false, events: [] }); }
});

app.post('/api/admin/checkin_event/create', async function(req, res) {
    var event_type = req.body.event_type; var event_name = req.body.event_name; var start_date = req.body.start_date; var start_time = req.body.start_time; var total_days = req.body.total_days; var rewards = req.body.rewards;
    if (!event_type || !start_date || !total_days) return res.json({ success: false, message: 'Missing required fields' });
    try {
        var p = await getPool(); var startDate = new Date(start_date); var endDate = new Date(startDate); endDate.setDate(endDate.getDate() + parseInt(total_days) + 2);
        var result = await p.query('INSERT INTO daily_checkin_events (event_type, event_name, start_date, start_time, end_date, total_days) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [event_type, event_name || (event_type === 'normal' ? 'Normal Daily Check-In' : 'Premium Daily Check-In'), start_date, start_time || '00:00:00', endDate.toISOString().split('T')[0], parseInt(total_days)]);
        var eventId = result.rows[0].id;
        if (rewards && Array.isArray(rewards)) { for (var i = 0; i < rewards.length; i++) { var reward = rewards[i]; await p.query('INSERT INTO daily_checkin_rewards (event_id, day_number, reward_type, reward_amount, reward_label, icon_url) VALUES ($1,$2,$3,$4,$5,$6)', [eventId, reward.day, reward.type, parseFloat(reward.amount) || 0, reward.label || '', reward.icon || '']); } }
        res.json({ success: true, message: 'Event created!', event_id: eventId });
    } catch(e) { res.json({ success: false, message: 'Server error: ' + e.message }); }
});

app.post('/api/admin/checkin_event/edit', async function(req, res) {
    var event_id = req.body.event_id; var event_name = req.body.event_name; var start_date = req.body.start_date; var start_time = req.body.start_time; var total_days = req.body.total_days; var rewards = req.body.rewards;
    if (!event_id) return res.json({ success: false, message: 'Event ID required' });
    try {
        var p = await getPool(); var event = await p.query('SELECT * FROM daily_checkin_events WHERE id=$1', [event_id]); if (event.rows.length === 0) return res.json({ success: false, message: 'Event not found' });
        var evt = event.rows[0]; var now = new Date(); var eventStart = new Date(evt.start_date + 'T' + (evt.start_time || '00:00:00'));
        if (eventStart <= now) return res.json({ success: false, message: 'Cannot edit started event' });
        var endDate = new Date(start_date || evt.start_date); endDate.setDate(endDate.getDate() + parseInt(total_days || evt.total_days) + 2);
        await p.query('UPDATE daily_checkin_events SET event_name=$1, start_date=$2, start_time=$3, end_date=$4, total_days=$5, updated_at=NOW() WHERE id=$6', [event_name || evt.event_name, start_date || evt.start_date, start_time || evt.start_time, endDate.toISOString().split('T')[0], parseInt(total_days) || evt.total_days, event_id]);
        if (rewards && Array.isArray(rewards)) { await p.query('DELETE FROM daily_checkin_rewards WHERE event_id=$1', [event_id]); for (var i = 0; i < rewards.length; i++) { var reward = rewards[i]; await p.query('INSERT INTO daily_checkin_rewards (event_id, day_number, reward_type, reward_amount, reward_label, icon_url) VALUES ($1,$2,$3,$4,$5,$6)', [event_id, reward.day, reward.type, parseFloat(reward.amount) || 0, reward.label || '', reward.icon || '']); } }
        res.json({ success: true, message: 'Event updated!' });
    } catch(e) { res.json({ success: false, message: 'Server error: ' + e.message }); }
});

app.post('/api/admin/checkin_event/cancel', async function(req, res) {
    var event_id = req.body.event_id; if (!event_id) return res.json({ success: false, message: 'Event ID required' });
    try {
        var p = await getPool(); var event = await p.query('SELECT * FROM daily_checkin_events WHERE id=$1', [event_id]); if (event.rows.length === 0) return res.json({ success: false, message: 'Event not found' });
        var evt = event.rows[0]; var now = new Date(); var eventStart = new Date(evt.start_date + 'T' + (evt.start_time || '00:00:00'));
        if (eventStart <= now) return res.json({ success: false, message: 'Cannot cancel started event' });
        await p.query('UPDATE daily_checkin_events SET cancelled=true, is_active=false WHERE id=$1', [event_id]); res.json({ success: true, message: 'Event cancelled!' });
    } catch(e) { res.json({ success: false, message: 'Server error' }); }
});

// ==================== DAILY CHECK-IN USER APIs ====================
app.post('/api/daily_checkin/status', async function(req, res) {
    var token = req.body.token; if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    try {
        var p = await getPool(); var uid = parseInt(token.replace('token_', '')); if (isNaN(uid)) return res.json({ success: false });
        var now = new Date(); var today = now.toISOString().split('T')[0];
        var user = await p.query('SELECT premium_expiry, premium_tier FROM auth_users WHERE id=$1', [uid]);
        var isPremium = user.rows[0] && user.rows[0].premium_expiry && new Date(user.rows[0].premium_expiry) > new Date();
        var eventQuery;
        if (isPremium) { eventQuery = "SELECT * FROM daily_checkin_events WHERE is_active=true AND cancelled=false AND (event_type='normal' OR event_type='premium') AND start_date <= $1 AND end_date >= $1 ORDER BY event_type ASC"; }
        else { eventQuery = "SELECT * FROM daily_checkin_events WHERE is_active=true AND cancelled=false AND event_type='normal' AND start_date <= $1 AND end_date >= $1 ORDER BY id ASC"; }
        var events = await p.query(eventQuery, [today]); var result = [];
        for (var i = 0; i < events.rows.length; i++) {
            var event = events.rows[i]; var resetTime = event.end_time || '14:30:00'; var todayReset = new Date(today + 'T' + resetTime);
            var todayCheckin = await p.query('SELECT * FROM daily_checkins WHERE user_id=$1 AND event_id=$2 AND checkin_date=$3', [uid, event.id, today]);
            var currentDay = 1; var startDate = new Date(event.start_date); var daysDiff = Math.floor((now - startDate) / (1000 * 60 * 60 * 24)) + 1; currentDay = Math.max(1, Math.min(daysDiff, event.total_days));
            var rewards = await p.query('SELECT * FROM daily_checkin_rewards WHERE event_id=$1 ORDER BY day_number ASC', [event.id]);
            var claimedDays = await p.query('SELECT day_number FROM daily_checkins WHERE user_id=$1 AND event_id=$2 ORDER BY day_number ASC', [uid, event.id]);
            var claimedDayNumbers = claimedDays.rows.map(function(r) { return r.day_number; });
            var dayStatus = [];
            for (var d = 1; d <= event.total_days; d++) { var reward = rewards.rows.find(function(r) { return r.day_number === d; }); dayStatus.push({ day: d, claimed: claimedDayNumbers.indexOf(d) !== -1, reward: reward ? { type: reward.reward_type, amount: parseFloat(reward.reward_amount), label: reward.reward_label, icon: reward.icon_url } : null }); }
            result.push({ event_id: event.id, event_type: event.event_type, event_name: event.event_name, start_date: event.start_date, end_date: event.end_date, end_time: event.end_time, total_days: event.total_days, current_day: currentDay, checked_in_today: todayCheckin.rows.length > 0, claimed_days: claimedDayNumbers, day_status: dayStatus, can_claim: todayCheckin.rows.length === 0 && now < todayReset, next_reset: todayReset.toISOString() });
        }
        res.json({ success: true, events: result, is_premium: isPremium });
    } catch(e) { res.json({ success: false, message: 'Server error' }); }
});

app.post('/api/daily_checkin/claim', async function(req, res) {
    var token = req.body.token; var event_id = req.body.event_id;
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    if (!event_id) return res.json({ success: false, message: 'Event ID required' });
    try {
        var p = await getPool(); var uid = parseInt(token.replace('token_', '')); if (isNaN(uid)) return res.json({ success: false });
        var now = new Date(); var today = now.toISOString().split('T')[0];
        var event = await p.query('SELECT * FROM daily_checkin_events WHERE id=$1 AND is_active=true AND cancelled=false', [event_id]); if (event.rows.length === 0) return res.json({ success: false, message: 'Event not found' });
        var evt = event.rows[0]; if (today < evt.start_date || today > evt.end_date) return res.json({ success: false, message: 'Event not active today' });
        var todayCheckin = await p.query('SELECT * FROM daily_checkins WHERE user_id=$1 AND event_id=$2 AND checkin_date=$3', [uid, event_id, today]); if (todayCheckin.rows.length > 0) return res.json({ success: false, message: 'Already claimed today' });
        var resetTime = evt.end_time || '14:30:00'; var todayReset = new Date(today + 'T' + resetTime); if (now >= todayReset) return res.json({ success: false, message: 'Claim period ended. Wait for reset.' });
        var startDate = new Date(evt.start_date); var daysDiff = Math.floor((now - startDate) / (1000 * 60 * 60 * 24)) + 1; var currentDay = Math.max(1, Math.min(daysDiff, evt.total_days));
        var reward = await p.query('SELECT * FROM daily_checkin_rewards WHERE event_id=$1 AND day_number=$2', [event_id, currentDay]); if (reward.rows.length === 0) return res.json({ success: false, message: 'No reward for this day' });
        var rwd = reward.rows[0];
        switch (rwd.reward_type) { case 'mmk': await p.query('UPDATE auth_users SET balance = COALESCE(balance,0) + $1 WHERE id=$2', [rwd.reward_amount, uid]); break; case 'usd': await p.query('UPDATE auth_users SET usd_balance = COALESCE(usd_balance,0) + $1 WHERE id=$2', [rwd.reward_amount, uid]); break; case 'spin': await p.query('UPDATE auth_users SET paid_spins = COALESCE(paid_spins,0) + $1 WHERE id=$2', [parseInt(rwd.reward_amount), uid]); break; }
        await p.query('INSERT INTO daily_checkins (user_id, event_id, checkin_date, day_number, reward_type, reward_amount) VALUES ($1,$2,$3,$4,$5,$6)', [uid, event_id, today, currentDay, rwd.reward_type, rwd.reward_amount]);
        var updatedUser = await p.query('SELECT balance, usd_balance, paid_spins FROM auth_users WHERE id=$1', [uid]);
        res.json({ success: true, message: 'Reward claimed!', day: currentDay, reward_type: rwd.reward_type, reward_amount: parseFloat(rwd.reward_amount), reward_label: rwd.reward_label, mmk_balance: parseFloat(updatedUser.rows[0] ? updatedUser.rows[0].balance : 0), usd_balance: parseFloat(updatedUser.rows[0] ? updatedUser.rows[0].usd_balance : 0), paid_spins: parseInt(updatedUser.rows[0] ? updatedUser.rows[0].paid_spins : 0) });
    } catch(e) { res.json({ success: false, message: 'Server error: ' + e.message }); }
});

// ==================== REUSE CHECK-IN EVENT ====================
app.post('/api/admin/checkin_event/reuse', async function(req, res) {
    var event_id = req.body.event_id; var start_date = req.body.start_date; var start_time = req.body.start_time;
    if (!event_id || !start_date) return res.json({ success: false, message: 'Event ID and Start Date required' });
    try {
        var p = await getPool(); var original = await p.query('SELECT * FROM daily_checkin_events WHERE id=$1', [event_id]); if (original.rows.length === 0) return res.json({ success: false, message: 'Original event not found' });
        var orig = original.rows[0]; var startDate = new Date(start_date); var endDate = new Date(startDate); endDate.setDate(endDate.getDate() + parseInt(orig.total_days) + 2);
        var newEvent = await p.query('INSERT INTO daily_checkin_events (event_type, event_name, start_date, start_time, end_date, end_time, total_days) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id', [orig.event_type, orig.event_name, start_date, start_time || orig.start_time, endDate.toISOString().split('T')[0], orig.end_time || '14:30:00', orig.total_days]);
        var newEventId = newEvent.rows[0].id;
        var originalRewards = await p.query('SELECT * FROM daily_checkin_rewards WHERE event_id=$1 ORDER BY day_number ASC', [event_id]);
        for (var i = 0; i < originalRewards.rows.length; i++) { var reward = originalRewards.rows[i]; await p.query('INSERT INTO daily_checkin_rewards (event_id, day_number, reward_type, reward_amount, reward_label, icon_url) VALUES ($1,$2,$3,$4,$5,$6)', [newEventId, reward.day_number, reward.reward_type, reward.reward_amount, reward.reward_label, reward.icon_url]); }
        res.json({ success: true, message: 'Event reused!', new_event_id: newEventId, start_date: start_date, end_date: endDate.toISOString().split('T')[0] });
    } catch(e) { res.json({ success: false, message: 'Server error: ' + e.message }); }
});

// ==================== ADMIN: USERS WITH LOGIN INFO ====================
app.get('/api/admin/users_with_logins', async function(req, res) {
    try {
        var p = await getPool();
        var r = await p.query("SELECT u.id, u.username, u.email, u.phone, u.login_type, u.balance, u.usd_balance, u.premium_expiry, u.premium_tier, u.last_login, u.created_at as registered_at, (SELECT COUNT(*) FROM device_sessions ds WHERE ds.user_id = u.id AND ds.is_active = true AND ds.last_activity > NOW() - INTERVAL '7 days') as active_devices, (SELECT login_at FROM login_history lh WHERE lh.user_id = u.id ORDER BY lh.login_at DESC LIMIT 1) as last_login_time, (SELECT CONCAT(COALESCE(device_brand,''), ' ', COALESCE(device_model,''), ' - ', COALESCE(browser,'')) FROM login_history lh WHERE lh.user_id = u.id AND device_brand IS NOT NULL ORDER BY lh.login_at DESC LIMIT 1) as last_device, (SELECT ip_address FROM login_history lh WHERE lh.user_id = u.id ORDER BY lh.login_at DESC LIMIT 1) as last_ip, (SELECT COUNT(*) FROM login_history lh WHERE lh.user_id = u.id) as total_logins FROM auth_users u ORDER BY u.last_login DESC NULLS LAST LIMIT 100");
        res.json({ success: true, users: r.rows });
    } catch(e) { res.json({ success: false, users: [] }); }
});

// ==================== LEADERBOARD API ====================
app.get('/api/leaderboard/top_spenders', async function(req, res) {
    try {
        var p = await getPool();
        var r = await p.query("SELECT u.username, u.email, COALESCE(SUM(CASE WHEN o.amount > 0 AND o.status = 'approved' THEN o.amount ELSE 0 END), 0) as total_spent, COUNT(CASE WHEN o.status = 'approved' THEN 1 END) as total_orders FROM auth_users u LEFT JOIN orders o ON u.id = o.user_id WHERE u.login_type != 'guest' AND u.id NOT IN (SELECT user_id::INT FROM banned_users) AND u.last_login > NOW() - INTERVAL '30 days' AND u.balance > 0 GROUP BY u.id, u.username, u.email HAVING COALESCE(SUM(CASE WHEN o.amount > 0 AND o.status = 'approved' THEN o.amount ELSE 0 END), 0) > 0 ORDER BY total_spent DESC LIMIT 10");
        res.json({ success: true, leaders: r.rows });
    } catch(e) { res.json({ success: false, leaders: [] }); }
});

// ==================== PAGE ROUTES ====================
app.get('/', function(req, res) { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/dashboard', function(req, res) { servePageWithCheck(req, res, 'dashboard', 'dashboard.html'); });
app.get('/admin', function(req, res) { res.sendFile(path.join(__dirname, 'admin.html')); });
app.get('/topup.html', function(req, res) { servePageWithCheck(req, res, 'topup', 'topup.html'); });
app.get('/buycode.html', function(req, res) { servePageWithCheck(req, res, 'buycode', 'buycode.html'); });
app.get('/data.html', function(req, res) { servePageWithCheck(req, res, 'data', 'data.html'); });
app.get('/history.html', function(req, res) { servePageWithCheck(req, res, 'history', 'history.html'); });
app.get('/password.html', function(req, res) { servePageWithCheck(req, res, 'password', 'password.html'); });
app.get('/recovery.html', function(req, res) { servePageWithCheck(req, res, 'recovery', 'recovery.html'); });
app.get('/contact.html', function(req, res) { servePageWithCheck(req, res, 'contact', 'contact.html'); });
app.get('/aboutredeem.html', function(req, res) { servePageWithCheck(req, res, 'aboutredeem', 'aboutredeem.html'); });
app.get('/terms.html', function(req, res) { res.sendFile(path.join(__dirname, 'terms.html')); });
app.get('/privacy.html', function(req, res) { res.sendFile(path.join(__dirname, 'privacy.html')); });
app.get('/offline.html', function(req, res) { res.sendFile(path.join(__dirname, 'offline.html')); });
app.get('/game.html', function(req, res) { res.sendFile(path.join(__dirname, 'game.html')); });
app.get('/exchange.html', function(req, res) { servePageWithCheck(req, res, 'exchange', 'exchange.html'); });

// ==================== START SERVER ====================
app.listen(PORT, '0.0.0.0', function() {
    console.log('Server running on port ' + PORT);
    console.log('DB: DB1 + DB2 Auto-Switch');
    console.log('Page Control: ' + ALL_PAGES.length + ' pages');
    console.log('Bot: Enhanced Long Polling');
    console.log('Redeem Codes: ' + REDEEM_CATEGORIES.length + ' categories');
});
