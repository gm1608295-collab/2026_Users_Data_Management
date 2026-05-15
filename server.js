const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const https = require('https');
const UAParser = require('ua-parser-js');
const http = require('http');
const { Server } = require('socket.io');
const app = express();

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(__dirname));

// ==================== AUTO WAKE-UP ====================
setInterval(() => { https.get(`https://two026-users-data-management.onrender.com/api/ping`, (res) => {}); }, 600000);
app.get('/api/ping', (req, res) => { res.json({ success: true, time: new Date().toISOString() }); });

// ==================== DATABASE - 5 POOLS AUTO-SWITCH ====================
const DB1 = 'postgresql://neondb_owner:npg_3lq1dLYxvgVX@ep-misty-base-amkxcayc-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require';
const DB2 = 'postgresql://neondb_owner:npg_6RwnXBl5LKQt@ep-damp-sea-a46t7qil-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require';
const DB3 = 'postgresql://neondb_owner:npg_LVD3pNxhd1vi@ep-withered-violet-aprnlbey-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require';
const DB4 = 'postgresql://neondb_owner:npg_ntqgkA5OVL8P@ep-noisy-resonance-aqy8odea-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';
const DB5 = 'postgresql://neondb_owner:npg_KuFVvHic4m0Y@ep-orange-paper-aqn9ak7c-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';

const pools = [
    new Pool({ connectionString: DB1, ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 }),
    new Pool({ connectionString: DB2, ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 }),
    new Pool({ connectionString: DB3, ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 }),
    new Pool({ connectionString: DB4, ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 }),
    new Pool({ connectionString: DB5, ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 })
];

let currentPoolIndex = 0;

async function getPool() {
    // Try current pool first
    try {
        await pools[currentPoolIndex].query('SELECT 1');
        return pools[currentPoolIndex];
    } catch(e) {
        console.log('DB Switch from pool #' + (currentPoolIndex + 1) + ':', e.message.substring(0, 50));
        
        // Try next pools in order
        for (let i = 0; i < pools.length; i++) {
            const nextIndex = (currentPoolIndex + i + 1) % pools.length;
            try {
                await pools[nextIndex].query('SELECT 1');
                currentPoolIndex = nextIndex;
                console.log('Switched to pool #' + (currentPoolIndex + 1));
                return pools[currentPoolIndex];
            } catch(e2) {
                console.log('Pool #' + (nextIndex + 1) + ' also failed');
            }
        }
        
        // All pools failed, return current anyway
        return pools[currentPoolIndex];
    }
}
// ==================== DEVICE DETECTION ====================
function detectDevice(ua) {
    const parser = new UAParser(ua);
    const result = parser.getResult();
    
    const browser = result.browser;
    const os = result.os;
    const device = result.device;
    
    let deviceName = '';
    let deviceType = 'Desktop';
    let isMobile = false;
    
    // Build device name
    if (device.vendor) deviceName += device.vendor + ' ';
    if (device.model) deviceName += device.model;
    if (!deviceName.trim()) {
        if (os.name) deviceName += os.name + ' ';
        if (os.version) deviceName += os.version;
    }
    if (browser.name) {
        deviceName += ' - ' + browser.name;
        if (browser.version) deviceName += ' ' + browser.version.split('.')[0];
    }
    if (!deviceName.trim()) deviceName = 'Unknown Device';
    
    // Device type
    if (device.type === 'mobile') { deviceType = 'Mobile'; isMobile = true; }
    else if (device.type === 'tablet') { deviceType = 'Tablet'; isMobile = true; }
    else if (/Median|WebView/i.test(ua)) { deviceType = 'App'; deviceName = 'SOLO M Game App - ' + (os.name||''); isMobile = true; }
    
    return { 
        name: deviceName.trim(), 
        type: deviceType, 
        brand: device.vendor || os.name || 'Unknown', 
        model: device.model || os.version || 'Unknown', 
        browser: browser.name || 'Unknown', 
        browserVersion: browser.version || '', 
        osName: os.name || 'Unknown', 
        osVersion: os.version || '', 
        isMobile 
    };
}
// ==================== LOGIN TRACKING (FIXED) ====================
async function trackLogin(userId, username, loginType, req) {
    try {
        const p = await getPool();
        const ua = req.headers['user-agent'] || '';
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'Unknown';
        const info = detectDevice(ua);
        
        // Save login history
        await p.query(
            `INSERT INTO login_history (user_id, username, login_type, ip_address, device_info, device_type, device_brand, device_model, browser, is_mobile, user_agent) 
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [userId, username, loginType, ip, info.name, info.type, info.brand, info.model, info.browser, info.isMobile, ua]
        ).catch(e => console.log('Login history error:', e.message));
        
        // ✅ Save device session - use user_id + device fingerprint as unique key
        // Generate a unique device token based on user_id + IP + User-Agent
        const deviceToken = 'dev_' + userId + '_' + ip.replace(/\./g, '_') + '_' + ua.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_');
        
        await p.query(
            `INSERT INTO device_sessions (user_id, token, device_name, device_type, device_brand, device_model, browser, ip_address, user_agent) 
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (user_id, token) DO UPDATE SET last_activity=NOW(), is_active=true, ip_address=$8`,
            [userId, deviceToken, info.name, info.type, info.brand, info.model, info.browser, ip, ua]
        ).catch(e => console.log('Device session error:', e.message));
        
    } catch(e) {
        console.error('[LOGIN TRACK ERROR]', e.message);
    }
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
function sendOnesignal(msg, sound, title) { 
    try {
        // ✅ Set default if not provided
        const notificationSound = sound || 'notification';
        const notificationTitle = title || 'SOLO M Game Shop';
        
        const data = JSON.stringify({ 
            app_id: ONESIGNAL_APP_ID, 
            included_segments: ["All"], 
            contents: { en: msg }, 
            headings: { en: notificationTitle },
            // ✅ Custom Sounds from Median.co
            android_sound: notificationSound,
            ios_sound: notificationSound + ".wav",
            android_channel_id: "solom-notification-channel",
            // ✅ Small icon for Android
            small_icon: "ic_stat_onesignal_default",
            // ✅ Large icon
            large_icon: "https://two026-users-data-management.onrender.com/icons/icon-192.png",
            // ✅ Priority
            priority: 10,
            // ✅ TTL (1 hour)
            ttl: 3600
        }); 
        
        console.log('[ONESIGNAL] 📲 Sending:', {
            title: notificationTitle,
            message: msg.substring(0, 50),
            sound: notificationSound
        });
        
        const req = https.request({ 
            hostname: 'onesignal.com', 
            path: '/api/v1/notifications', 
            method: 'POST', 
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Basic ${ONESIGNAL_API_KEY}` 
            } 
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                console.log('[ONESIGNAL] Response:', body.substring(0, 100));
                console.log('[ONESIGNAL] 📲 Push sent with sound:', notificationSound);
            });
        });
        
        req.on('error', (e) => {
            console.error('[ONESIGNAL ERROR]', e.message);
        });
        
        req.write(data); 
        req.end(); 
        
    } catch(e) {
        console.error('[ONESIGNAL ERROR]', e.message);
    } 
}
// ==================== REDEEM CATEGORIES (Hardcoded Prices) ====================
const REDEEM_CATEGORIES = [
    { id: 'shhh_emote', name: 'Shhh emote', icon: 'https://i.ibb.co/KprVCy87/icon-reward2-Q0a-Xg-C62.png', price: 2500 },
    { id: 'golden_border', name: 'Golden Month Border', icon: 'https://i.ibb.co/LXVHQfk3/icon-reward1-D7w-Nl-OTn.png', price: 3500 },
    { id: 'lucky_diamond', name: 'Lucky Diamond Code', icon: 'https://i.ibb.co/n8m2ZSgz/box4-7e338a9e.png', price: 2000 },
    { id: 'magic_durt', name: 'Magic Durt', icon: 'https://i.ibb.co/NdpDZ0P7/8.png', price: 1500 },
    { id: 'emblem_box', name: 'Emblem Box', icon: 'https://i.ibb.co/Xr1LDXSG/mbx1-c5ec07ee.png', price: 1500 }  
];

 // ==================== INIT TABLES ====================
async function initTables(p) {
    const queries = [
        // ========== USER & AUTH ==========
        `CREATE TABLE IF NOT EXISTS auth_users (id SERIAL PRIMARY KEY, username VARCHAR(100), email VARCHAR(200), phone VARCHAR(50), password VARCHAR(255), google_id VARCHAR(200), login_type VARCHAR(10) DEFAULT 'local', avatar VARCHAR(500), gmail_pass VARCHAR(100) DEFAULT 'DoubleMK2008', mlbb_pass VARCHAR(100) DEFAULT 'GlobalMK2008', tiktok_pass VARCHAR(100) DEFAULT 'DoubleMK2008', balance DECIMAL DEFAULT 0, usd_balance DECIMAL DEFAULT 0, premium_expiry TIMESTAMP, paid_spins INT DEFAULT 0, premium_tier INT DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, last_login TIMESTAMP)`,
        
        // ========== SECURITY ==========
        `CREATE TABLE IF NOT EXISTS login_history (id SERIAL PRIMARY KEY, user_id INT NOT NULL, username VARCHAR(100), login_type VARCHAR(20), ip_address VARCHAR(50), device_info VARCHAR(300), device_type VARCHAR(50), device_brand VARCHAR(100), device_model VARCHAR(100), browser VARCHAR(50), is_mobile BOOLEAN DEFAULT false, user_agent TEXT, login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS device_sessions (id SERIAL PRIMARY KEY, user_id INT NOT NULL, token VARCHAR(200) NOT NULL, device_name VARCHAR(300), device_type VARCHAR(50), device_brand VARCHAR(100), device_model VARCHAR(100), browser VARCHAR(50), ip_address VARCHAR(50), user_agent TEXT, is_active BOOLEAN DEFAULT true, last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, token))`,
        
        // ========== CONTENT ==========
        `CREATE TABLE IF NOT EXISTS notices (id SERIAL PRIMARY KEY, message TEXT, color VARCHAR(20) DEFAULT '#ffffff', created_by VARCHAR(100), notice_type VARCHAR(20) DEFAULT 'dashboard', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS slider_images (id SERIAL PRIMARY KEY, image_urls TEXT DEFAULT '[]', updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS bg_music (id SERIAL PRIMARY KEY, music_urls TEXT DEFAULT '[]', updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS videos (id SERIAL PRIMARY KEY, video_url TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        
        // ========== SHOP ==========
        `CREATE TABLE IF NOT EXISTS page_status (page_id VARCHAR(50) PRIMARY KEY, status VARCHAR(5) DEFAULT 'on', updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS banned_users (user_id VARCHAR(100) PRIMARY KEY, banned_by VARCHAR(100), banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, user_id INT, username VARCHAR(100), amount DECIMAL, payment_method VARCHAR(50), screenshot TEXT, status VARCHAR(20) DEFAULT 'pending', submitted_user_id VARCHAR(20), reject_reason TEXT DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS redeem_codes (id SERIAL PRIMARY KEY, category VARCHAR(50), code VARCHAR(100), used BOOLEAN DEFAULT false, used_by INT, used_at TIMESTAMP, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS used_codes (code VARCHAR(100) PRIMARY KEY, user_id INT, used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        
        // ========== SECURITY PASSWORDS ==========
        `CREATE TABLE IF NOT EXISTS otp_codes (id SERIAL PRIMARY KEY, user_id INT, code VARCHAR(6), expires_at TIMESTAMP, used BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS user_security_pass (user_id INT PRIMARY KEY, security_password VARCHAR(100), set_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        
        // ========== GAME ==========
        `CREATE TABLE IF NOT EXISTS spin_history (id SERIAL PRIMARY KEY, user_id INT, reward_type VARCHAR(50), reward_amount DECIMAL DEFAULT 0, segment_label VARCHAR(50), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        
        // ========== PREMIUM ==========
        `CREATE TABLE IF NOT EXISTS premium_draws (user_id INT, draw_date DATE, draw_count INT DEFAULT 1, PRIMARY KEY(user_id, draw_date))`,
        `CREATE TABLE IF NOT EXISTS weekly_bonus (id SERIAL PRIMARY KEY, user_id INT, claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        
        // ========== DAILY CHECK-IN SYSTEM ==========
        `CREATE TABLE IF NOT EXISTS daily_checkin_events (
            id SERIAL PRIMARY KEY,
            event_type VARCHAR(20) NOT NULL DEFAULT 'normal',
            event_name VARCHAR(100),
            start_date DATE NOT NULL,
            start_time TIME DEFAULT '00:00:00',
            end_date DATE,
            end_time TIME DEFAULT '14:30:00',
            total_days INT NOT NULL DEFAULT 7,
            is_active BOOLEAN DEFAULT true,
            cancelled BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS daily_checkin_rewards (
            id SERIAL PRIMARY KEY,
            event_id INT REFERENCES daily_checkin_events(id) ON DELETE CASCADE,
            day_number INT NOT NULL,
            reward_type VARCHAR(20) NOT NULL,
            reward_amount DECIMAL(10,2) DEFAULT 0,
            reward_label VARCHAR(100),
            icon_url VARCHAR(500),
            UNIQUE(event_id, day_number)
        )`,
        `CREATE TABLE IF NOT EXISTS daily_checkins (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL,
            event_id INT REFERENCES daily_checkin_events(id) ON DELETE CASCADE,
            checkin_date DATE NOT NULL DEFAULT CURRENT_DATE,
            day_number INT NOT NULL,
            reward_type VARCHAR(20),
            reward_amount DECIMAL(10,2) DEFAULT 0,
            claimed BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, event_id, checkin_date)
        )`
    ];
    
    for (const q of queries) { 
        await p.query(q).catch(e => console.log('Table create:', e.message)); 
    }
}
initTables(pools[0]);
initTables(pools[1]);
// ==================== CREATE SPIN HISTORY V2 TABLE ====================
async function createSpinHistoryV2Table() {
    const query = `
        CREATE TABLE IF NOT EXISTS spin_history_v2 (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL,
            spin_source VARCHAR(20) NOT NULL,
            reward_type VARCHAR(20),
            reward_amount DECIMAL(10,2) DEFAULT 0,
            balance_before_mmk DECIMAL(10,2) DEFAULT 0,
            balance_after_mmk DECIMAL(10,2) DEFAULT 0,
            balance_before_usd DECIMAL(10,2) DEFAULT 0,
            balance_after_usd DECIMAL(10,2) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
    try {
        await pools[0].query(query);
        await pools[1].query(query);
        console.log('✅ spin_history_v2 table created on both databases');
    } catch(e) {
        console.log('⚠️ spin_history_v2 table error:', e.message);
    }
}
createSpinHistoryV2Table();
// ==================== ALL PAGES ====================
const ALL_PAGES = [
    { id: 'topup', name: 'Top Up' },
    { id: 'buycode', name: 'Buy Code MLBB' },
    { id: 'dashboard', name: 'Dashboard' },
    { id: 'data', name: 'Data' },
    { id: 'history', name: 'History' },
    { id: 'password', name: 'Password' },
    { id: 'recovery', name: 'Recovery' },
    { id: 'contact', name: 'Contact' },
    { id: 'aboutredeem', name: 'About Redeem' },
    { id: 'game', name: 'Lucky Spin' },        // ✅ ထည့်ပါ
    { id: 'exchange', name: 'Exchange' }         // ✅ ထည့်ပါ
    { id: 'chat', name: 'Chat' }
];

ALL_PAGES.forEach(async (pg) => {
    await pools[0].query("INSERT INTO page_status (page_id, status) VALUES ($1, 'on') ON CONFLICT (page_id) DO NOTHING", [pg.id]).catch(() => {});
    await pools[1].query("INSERT INTO page_status (page_id, status) VALUES ($1, 'on') ON CONFLICT (page_id) DO NOTHING", [pg.id]).catch(() => {});
});
// ==================== IMAGE UPLOAD ====================
app.post('/api/upload_image', async (req, res) => {
    const { base64 } = req.body;
    if (!base64) return res.json({ success: false, message: 'No image data' });
    try {
        const imageData = base64.replace(/^data:image\/\w+;base64,/, '');
        const formData = new URLSearchParams(); formData.append('key', IMGBB_API_KEY); formData.append('image', imageData);
        const response = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: formData.toString(), signal: AbortSignal.timeout(15000) });
        const data = await response.json();
        data.success ? res.json({ success: true, url: data.data.url }) : res.json({ success: false, message: 'Upload failed' });
    } catch(e) { res.json({ success: false }); }
});

// ==================== MUSIC UPLOAD ====================
app.post('/api/upload_music', async (req, res) => {
    const { base64, filename } = req.body;
    if (!base64) return res.json({ success: false, message: 'No music data' });
    try {
        const isVideo = base64.startsWith('data:video/');
        const isAudio = base64.startsWith('data:audio/');
        const isM4A = filename && (filename.toLowerCase().endsWith('.m4a') || filename.toLowerCase().endsWith('.aac'));
        if (isVideo && !isM4A) return res.json({ success: false, message: 'âŒ Video not allowed! Audio only.' });
        if (!isAudio && !isVideo) return res.json({ success: false, message: 'âŒ Invalid file!' });
        let base64Data;
        const matches = base64.match(/^data:[^;]+;base64,(.+)$/);
        if (matches && matches[1]) base64Data = matches[1];
        else { const ci = base64.indexOf(','); base64Data = ci > -1 ? base64.substring(ci + 1) : base64; }
        const buffer = Buffer.from(base64Data, 'base64');
        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const formData = new FormData(); formData.append('reqtype', 'fileupload'); formData.append('fileToUpload', blob, filename || 'music.mp3');
        const response = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: formData, signal: AbortSignal.timeout(60000) });
        const url = await response.text();
        if (url && url.startsWith('https://')) res.json({ success: true, url: url.trim() });
        else res.json({ success: false, message: 'Upload failed' });
    } catch(e) { res.json({ success: false }); }
});
// ==================== AUTH ====================
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.json({ success: false, message: 'All fields required' });
    try { 
        const p = await getPool(); 
        const r = await p.query("SELECT * FROM auth_users WHERE email=$1 AND password=$2 AND login_type='local'", [email, password]); 
        if (r.rows.length === 0) return res.json({ success: false, message: 'Invalid' }); 
        const u = r.rows[0]; 
        await p.query('UPDATE auth_users SET last_login=NOW() WHERE id=$1', [u.id]); 
        trackLogin(u.id, u.username, 'local', req);
        res.json({ success: true, token: 'token_' + u.id, user: { id: u.id, username: u.username, email: u.email, login_type: 'local' } }); 
    }
    catch(e) { res.json({ success: false }); }
});

app.post('/api/register', async (req, res) => {
    const { username, email, phone, password } = req.body;
    if (!username || !email || !phone || !password) return res.json({ success: false, message: 'All fields required' });
    try { const p = await getPool(); const exist = await p.query('SELECT id FROM auth_users WHERE email=$1', [email]); if (exist.rows.length > 0) return res.json({ success: false, message: 'Email exists' }); await p.query('INSERT INTO auth_users (username,email,phone,password,login_type) VALUES ($1,$2,$3,$4,$5)', [username, email, phone, password, 'local']); tgSend(`🆕 ${username}\n📧 ${email}`); res.json({ success: true }); }
    catch(e) { res.json({ success: false }); }
});

app.post('/api/logout', (req, res) => res.json({ success: true }));
app.post('/api/check_banned', async (req, res) => { try { const p = await getPool(); const r = await p.query('SELECT * FROM banned_users WHERE user_id=$1', [req.body.userId]); res.json({ banned: r.rows.length > 0 }); } catch(e) { res.json({ banned: false }); } });
// ==================== BANNED LIST API (အသစ်) ====================
app.get('/api/admin/banned_list', async (req, res) => {
    try {
        const p = await getPool();
        const r = await p.query('SELECT user_id FROM banned_users');
        res.json({ 
            success: true, 
            banned: r.rows.map(row => row.user_id) 
        });
    } catch(e) {
        res.json({ success: false, banned: [] });
    }
});
// ==================== GOOGLE OAUTH ====================
app.get('/auth/google', (req, res) => { if (!GOOGLE_CLIENT_ID) return res.send('Not configured'); res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT)}&response_type=code&scope=email%20profile`); });
app.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query; if (!code) return res.send('<script>alert("Failed");window.location.href="/";</script>');
    try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: GOOGLE_REDIRECT, grant_type: 'authorization_code' }) });
        const tokenData = await tokenRes.json(); if (!tokenData.access_token) return res.send('<script>alert("Failed");window.location.href="/";</script>');
        const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } });
        const userInfo = await userRes.json(); const googleId = userInfo.id, email = userInfo.email, name = userInfo.name || 'Google User';
        const p = await getPool(); let user = await p.query('SELECT * FROM auth_users WHERE google_id=$1', [googleId]);
        
        if (user.rows.length > 0) { 
            const u = user.rows[0]; 
            await p.query('UPDATE auth_users SET last_login=NOW() WHERE id=$1', [u.id]); 
            trackLogin(u.id, u.username||name, 'google', req);
            res.send(`<script>localStorage.setItem("auth_token","token_${u.id}");localStorage.setItem("user",JSON.stringify({id:${u.id},username:"${u.username||name}",email:"${email}",login_type:"google"}));window.location.href="/dashboard";</script>`); 
            return; 
        }
        
        user = await p.query("SELECT * FROM auth_users WHERE email=$1 AND login_type='local'", [email]);
        if (user.rows.length > 0) { 
            const u = user.rows[0]; 
            await p.query('UPDATE auth_users SET google_id=$1, last_login=NOW() WHERE id=$2', [googleId, u.id]); 
            trackLogin(u.id, u.username||name, 'google', req);
            res.send(`<script>localStorage.setItem("auth_token","token_${u.id}");localStorage.setItem("user",JSON.stringify({id:${u.id},username:"${u.username||name}",email:"${email}",login_type:"google"}));window.location.href="/dashboard";</script>`); 
            return; 
        }
        
        const nu = await p.query('INSERT INTO auth_users (username,email,google_id,login_type) VALUES ($1,$2,$3,$4) RETURNING id', [name, email, googleId, 'google']);
        trackLogin(nu.rows[0].id, name, 'google', req);
        res.send(`<script>localStorage.setItem("auth_token","token_${nu.rows[0].id}");localStorage.setItem("user",JSON.stringify({id:${nu.rows[0].id},username:"${name}",email:"${email}",login_type:"google"}));window.location.href="/dashboard";</script>`);
    } catch(e) { res.send('<script>alert("Failed");window.location.href="/";</script>'); }
});

// ==================== TIKTOK OAUTH ====================
app.get('/auth/tiktok', (req, res) => { res.redirect(`https://www.tiktok.com/v2/auth/authorize/?client_key=${TIKTOK_CLIENT_KEY}&scope=user.info.basic&response_type=code&redirect_uri=${TIKTOK_REDIRECT}&state=${Math.random().toString(36)}`); });
app.get('/auth/tiktok/callback', async (req, res) => {
    try { const { code } = req.query; if (!code) return res.send('<script>window.close()</script>');
        const tr = await fetch('https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_key: TIKTOK_CLIENT_KEY, client_secret: TIKTOK_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: TIKTOK_REDIRECT }) });
        const td = await tr.json(); const ur = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', { headers: { 'Authorization': `Bearer ${td.access_token}` } });
        const ud = await ur.json(); const user = ud.data.user;
        const p = await getPool(); const dr = await p.query('SELECT * FROM auth_users WHERE google_id=$1', [user.open_id]);
        
        if (dr.rows.length > 0) { 
            await p.query('UPDATE auth_users SET last_login=NOW() WHERE id=$1', [dr.rows[0].id]); 
            trackLogin(dr.rows[0].id, dr.rows[0].username||user.display_name, 'tiktok', req);
            res.send(`<script>localStorage.setItem("auth_token","token_${dr.rows[0].id}");localStorage.setItem("user",JSON.stringify({id:${dr.rows[0].id},username:"${dr.rows[0].username||user.display_name}",email:"tiktok@user.com",login_type:"tiktok"}));window.location.href="/dashboard";</script>`); 
            return;
        }
        
        const nu = await p.query('INSERT INTO auth_users (username,email,google_id,login_type) VALUES ($1,$2,$3,$4) RETURNING id', [user.display_name, 'tiktok_'+user.open_id+'@tiktok.com', user.open_id, 'tiktok']); 
        trackLogin(nu.rows[0].id, user.display_name, 'tiktok', req);
        res.send(`<script>localStorage.setItem("auth_token","token_${nu.rows[0].id}");localStorage.setItem("user",JSON.stringify({id:${nu.rows[0].id},username:"${user.display_name}",email:"tiktok@user.com",login_type:"tiktok"}));window.location.href="/dashboard";</script>`);
    } catch(e) { res.send('<script>alert("Failed");window.location.href="/";</script>'); }
});
// ==================== GET USER DATA PASSWORDS (FROM DB) ====================
app.post('/api/get_passwords', async (req, res) => {
    const { token } = req.body;
    
    // Default passwords as fallback
    const defaults = { 
        gmail_password: 'DoubleMK2008', 
        mlbb_password: 'GlobalMK2008', 
        tiktok_password: 'DoubleMK2008' 
    };
    
    if (!token) {
        return res.json(defaults);
    }
    
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        
        if (isNaN(uid)) {
            return res.json(defaults);
        }
        
        const r = await p.query(
            'SELECT gmail_pass, mlbb_pass, tiktok_pass FROM auth_users WHERE id=$1', 
            [uid]
        );
        
        if (r.rows.length > 0) {
            const u = r.rows[0];
            res.json({
                success: true,
                gmail_password: u.gmail_pass || defaults.gmail_password,
                mlbb_password: u.mlbb_pass || defaults.mlbb_password,
                tiktok_password: u.tiktok_pass || defaults.tiktok_password
            });
        } else {
            res.json(defaults);
        }
    } catch(e) {
        res.json(defaults);
    }
});
// ==================== ADMIN: GET USER DATA PASSWORDS ====================
app.post('/api/admin/get_user_data_pass', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.json({ success: false });
    try {
        const p = await getPool();
        const r = await p.query('SELECT gmail_pass, mlbb_pass, tiktok_pass FROM auth_users WHERE id=$1', [userId]);
        if (r.rows.length > 0) {
            res.json({
                success: true,
                gmail_pass: r.rows[0].gmail_pass || 'DoubleMK2008',
                mlbb_pass: r.rows[0].mlbb_pass || 'GlobalMK2008',
                tiktok_pass: r.rows[0].tiktok_pass || 'DoubleMK2008'
            });
        } else {
            res.json({ success: false, message: 'User not found' });
        }
    } catch(e) { res.json({ success: false }); }
});

// ==================== ADMIN: UPDATE USER DATA PASSWORDS (DIRECT) ====================
app.post('/api/admin/update_data_pass', async (req, res) => {
    const { userId, gmail_pass, mlbb_pass, tiktok_pass } = req.body;
    if (!userId) return res.json({ success: false, message: 'User ID required' });
    try {
        const p = await getPool();
        
        if (gmail_pass) {
            await p.query('UPDATE auth_users SET gmail_pass=$1 WHERE id=$2', [gmail_pass, userId]);
        }
        if (mlbb_pass) {
            await p.query('UPDATE auth_users SET mlbb_pass=$1 WHERE id=$2', [mlbb_pass, userId]);
        }
        if (tiktok_pass) {
            await p.query('UPDATE auth_users SET tiktok_pass=$1 WHERE id=$2', [tiktok_pass, userId]);
        }
        
        res.json({ success: true, message: 'Data passwords updated!' });
    } catch(e) { res.json({ success: false, message: 'Server error' }); }
});

// ==================== CHANGE PASSWORD (USER - WITH CURRENT PASSWORD VERIFICATION) ====================
app.post('/api/change_password', async (req, res) => {
    const { token, type, currentPassword, newPassword } = req.body;
    
    console.log('[CHANGE PASSWORD] Request:', { token: token?.substring(0,10)+'...', type, hasCurrent: !!currentPassword, hasNew: !!newPassword });
    
    if (!token || !type || !currentPassword || !newPassword) {
        return res.json({ success: false, message: 'All fields required' });
    }
    
    // Guest users cannot change password
    if (token === 'guest') {
        return res.json({ success: false, message: 'Guest accounts cannot change password' });
    }
    
    if (newPassword.length < 6) {
        return res.json({ success: false, message: 'Password must be at least 6 characters' });
    }
    
    if (currentPassword === newPassword) {
        return res.json({ success: false, message: 'New password must be different' });
    }
    
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        
        console.log('[CHANGE PASSWORD] User ID:', uid);
        
        if (isNaN(uid) || uid <= 0) {
            return res.json({ success: false, message: 'Invalid session. Please login again.' });
        }
        
        const user = await p.query('SELECT * FROM auth_users WHERE id=$1', [uid]);
        console.log('[CHANGE PASSWORD] User found:', user.rows.length > 0);
        
        if (user.rows.length === 0) {
            return res.json({ success: false, message: 'User not found. Please login again.' });
        }
        
        const u = user.rows[0];
        const col = type === 'gmail' ? 'gmail_pass' : type === 'mlbb' ? 'mlbb_pass' : 'tiktok_pass';
        
        // Get current stored password (or default)
        const defaultPass = type === 'mlbb' ? 'GlobalMK2008' : 'DoubleMK2008';
        const currentStored = u[col] || defaultPass;
        
        console.log('[CHANGE PASSWORD] Column:', col, 'Stored:', currentStored?.substring(0,3)+'...', 'Input:', currentPassword?.substring(0,3)+'...');
        
        if (currentPassword !== currentStored) {
            return res.json({ success: false, message: 'Current password is incorrect!' });
        }
        
        // Update password
        await p.query(`UPDATE auth_users SET ${col}=$1 WHERE id=$2`, [newPassword, uid]);
        
        console.log('[CHANGE PASSWORD] SUCCESS!');
        
        res.json({ success: true, message: 'Password changed successfully!' });
        
    } catch(e) {
        console.error('[CHANGE PASSWORD ERROR]', e);
        res.json({ success: false, message: 'Server error. Please try again.' });
    }
});
app.post('/api/save_user_data', (req, res) => { res.json({ success: true }); });
app.post('/api/get_my_data', (req, res) => { res.json({ success: true, gmail: [], mlbb: [], tiktok: [] }); });

// ==================== HISTORY SECURITY PASSWORD API ====================

// Get security password status
app.post('/api/get_security_pass_status', async (req, res) => {
    const { token } = req.body;
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        if (isNaN(uid)) return res.json({ success: false });
        
        const r = await p.query('SELECT security_password, set_date FROM user_security_pass WHERE user_id=$1', [uid]);
        
        if (r.rows.length > 0) {
            const row = r.rows[0];
            const hasPassword = !!row.security_password;
            const setDate = row.set_date ? new Date(row.set_date).getTime() : null;
            
            // Calculate 7-day lock
            let canChange = false;
            let daysPassed = 0;
            let daysLeft = 0;
            
            if (setDate) {
                const now = new Date();
                daysPassed = Math.floor((now.getTime() - setDate) / (1000 * 60 * 60 * 24));
                daysLeft = Math.max(0, 7 - daysPassed);
                canChange = daysPassed >= 7;
            }
            
            res.json({
                success: true,
                hasPassword: hasPassword,
                setDate: setDate,
                daysPassed: daysPassed,
                daysLeft: daysLeft,
                canChange: canChange
            });
        } else {
            res.json({
                success: true,
                hasPassword: false,
                setDate: null,
                daysPassed: 0,
                daysLeft: 0,
                canChange: true
            });
        }
    } catch(e) {
        res.json({ success: false });
    }
});

// Set security password - FIXED
app.post('/api/set_security_pass', async (req, res) => {
    const { token, password } = req.body;
    
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    if (!password || password.length < 6) return res.json({ success: false, message: 'Password must be at least 6 characters' });
    
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        if (isNaN(uid)) return res.json({ success: false });
        
        // Check existing
        const existing = await p.query('SELECT set_date FROM user_security_pass WHERE user_id=$1', [uid]);
        
        if (existing.rows.length > 0 && existing.rows[0].set_date) {
            const setDate = new Date(existing.rows[0].set_date);
            const now = new Date();
            const daysPassed = Math.floor((now.getTime() - setDate.getTime()) / (1000 * 60 * 60 * 24));
            
            if (daysPassed < 7) {
                const daysLeft = 7 - daysPassed;
                return res.json({ success: false, message: daysLeft + ' days remaining before you can change password', daysLeft: daysLeft });
            }
        }
        
        // Set/Update password
        await p.query(
            `INSERT INTO user_security_pass (user_id, security_password, set_date, updated_at) 
             VALUES ($1, $2, NOW(), NOW()) 
             ON CONFLICT (user_id) DO UPDATE SET security_password=$2, set_date=NOW(), updated_at=NOW()`,
            [uid, password]
        );
        
        res.json({ success: true, message: 'Password set successfully!' });
        
    } catch(e) {
        res.json({ success: false, message: 'Server error' });
    }
});

// Verify security password
app.post('/api/verify_security_pass', async (req, res) => {
    const { token, password } = req.body;
    
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    if (!password) return res.json({ success: false, message: 'Password required' });
    
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        if (isNaN(uid)) return res.json({ success: false });
        
        const r = await p.query('SELECT security_password FROM user_security_pass WHERE user_id=$1', [uid]);
        
        if (r.rows.length === 0 || !r.rows[0].security_password) {
            return res.json({ success: false, message: 'Password not set yet' });
        }
        
        if (password === r.rows[0].security_password) {
            res.json({ success: true, message: 'Verified!' });
        } else {
            res.json({ success: false, message: 'Wrong password!' });
        }
        
    } catch(e) {
        res.json({ success: false, message: 'Server error' });
    }
});
// ==================== VERIFY USER ID ====================
app.post('/api/verify_user_id', async (req, res) => {
    const { token, userId } = req.body; if (!token || !userId) return res.json({ success: false, verified: false });
    try { const p = await getPool(); const uid = parseInt(token.replace('token_', '')); const r = await p.query('SELECT id,username,email FROM auth_users WHERE id=$1', [uid]); if (r.rows.length === 0) return res.json({ verified: false }); const u = r.rows[0]; u.id.toString().padStart(6,'0') === userId.toString().padStart(6,'0') ? res.json({ success: true, verified: true, username: u.username, email: u.email, id: u.id }) : res.json({ verified: false }); }
    catch(e) { res.json({ verified: false }); }
});

// ==================== SLIDER ====================
app.get('/api/slider_images', async (req, res) => { try { const p = await getPool(); const r = await p.query('SELECT image_urls FROM slider_images ORDER BY id DESC LIMIT 1'); if (r.rows.length === 0) return res.json({ images: [] }); res.json({ success: true, images: JSON.parse(r.rows[0].image_urls || '[]') }); } catch(e) { res.json({ images: [] }); } });
app.post('/api/admin/slider_images', async (req, res) => { try { const p = await getPool(); const { images } = req.body; if (!images || images.length === 0) { await p.query('DELETE FROM slider_images'); return res.json({ success: true }); } await p.query('DELETE FROM slider_images'); await p.query('INSERT INTO slider_images (image_urls) VALUES ($1)', [JSON.stringify(images)]); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });

// ==================== BG MUSIC ====================
app.get('/api/bg_music', async (req, res) => { try { const p = await getPool(); const r = await p.query('SELECT music_urls FROM bg_music ORDER BY id DESC LIMIT 1'); if (r.rows.length === 0) return res.json({ playlist: [] }); res.json({ playlist: JSON.parse(r.rows[0].music_urls || '[]') }); } catch(e) { res.json({ playlist: [] }); } });
app.post('/api/admin/bg_music', async (req, res) => { try { const p = await getPool(); const { playlist } = req.body; if (!playlist || playlist.length === 0) { await p.query('DELETE FROM bg_music'); return res.json({ success: true }); } await p.query('DELETE FROM bg_music'); await p.query('INSERT INTO bg_music (music_urls) VALUES ($1)', [JSON.stringify(playlist)]); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });

// ==================== PAGE TOGGLE ====================
app.get('/api/admin/page_status', async (req, res) => { try { const p = await getPool(); const result = []; for (const pg of ALL_PAGES) { const q = await p.query("SELECT status FROM page_status WHERE page_id=$1", [pg.id]); result.push({ id: pg.id, name: pg.name, status: q.rows.length > 0 ? q.rows[0].status : 'on' }); } res.json({ pages: result }); } catch(e) { res.json({ pages: [] }); } });
app.post('/api/admin/toggle_page', async (req, res) => { try { const p = await getPool(); await p.query("INSERT INTO page_status (page_id, status) VALUES ($1,$2) ON CONFLICT (page_id) DO UPDATE SET status=$2", [req.body.page_id, req.body.status]); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });

// ==================== BACKUP & RESTORE ====================
app.get('/api/admin/backup', async (req, res) => { try { const p = await getPool(); const users = await p.query('SELECT * FROM auth_users'); const orders = await p.query('SELECT * FROM orders'); const notices = await p.query('SELECT * FROM notices'); const slider = await p.query('SELECT * FROM slider_images'); const bgM = await p.query('SELECT * FROM bg_music'); const ps = await p.query('SELECT * FROM page_status'); const banned = await p.query('SELECT * FROM banned_users'); const codes = await p.query('SELECT * FROM redeem_codes'); const videos = await p.query('SELECT * FROM videos'); res.json({ success: true, data: { version: '1.0', date: new Date().toISOString(), tables: { auth_users: users.rows, orders: orders.rows, notices: notices.rows, slider_images: slider.rows, bg_music: bgM.rows, page_status: ps.rows, banned_users: banned.rows, redeem_codes: codes.rows, videos: videos.rows } } }); } catch(e) { res.json({ success: false }); } });
app.post('/api/admin/restore', async (req, res) => {
    const { data } = req.body; if (!data || !data.tables) return res.json({ success: false });
    try { const p = await getPool(); const t = data.tables;
        if (t.auth_users) { await p.query('DELETE FROM auth_users'); for (const r of t.auth_users) { await p.query('INSERT INTO auth_users VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)', [r.id, r.username, r.email, r.phone, r.password, r.google_id, r.login_type, r.avatar, r.gmail_pass, r.mlbb_pass, r.tiktok_pass, r.balance, r.created_at, r.last_login]).catch(() => {}); } }
        if (t.orders) { await p.query('DELETE FROM orders'); for (const r of t.orders) { await p.query('INSERT INTO orders VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [r.id, r.user_id, r.username, r.amount, r.payment_method, r.screenshot, r.status, r.submitted_user_id, r.reject_reason, r.created_at]).catch(() => {}); } }
        if (t.banned_users) { await p.query('DELETE FROM banned_users'); for (const r of t.banned_users) { await p.query('INSERT INTO banned_users VALUES ($1,$2,$3)', [r.user_id, r.banned_by, r.banned_at]).catch(() => {}); } }
        if (t.notices) { await p.query('DELETE FROM notices'); for (const r of t.notices) { await p.query('INSERT INTO notices VALUES ($1,$2,$3,$4,$5,$6)', [r.id, r.message, r.color, r.created_by, r.notice_type, r.created_at]).catch(() => {}); } }
        if (t.redeem_codes) { await p.query('DELETE FROM redeem_codes'); for (const r of t.redeem_codes) { await p.query('INSERT INTO redeem_codes VALUES ($1,$2,$3,$4,$5,$6,$7)', [r.id, r.category, r.code, r.used, r.used_by, r.used_at, r.created_at]).catch(() => {}); } }
        res.json({ success: true });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// ==================== ADMIN ====================
app.get('/api/admin/users_grouped', async (req, res) => { try { const p = await getPool(); const lo = await p.query("SELECT * FROM auth_users WHERE login_type='local' ORDER BY id DESC"); const go = await p.query("SELECT * FROM auth_users WHERE login_type='google' ORDER BY id DESC"); const ti = await p.query("SELECT * FROM auth_users WHERE login_type='tiktok' ORDER BY id DESC"); const tg = await p.query("SELECT * FROM auth_users WHERE login_type='telegram' ORDER BY id DESC"); const ba = await p.query("SELECT user_id FROM banned_users"); res.json({ success: true, local: lo.rows, google: go.rows, tiktok: ti.rows, telegram: tg.rows, banned: ba.rows.map(r=>r.user_id), total: lo.rows.length + go.rows.length + ti.rows.length + tg.rows.length }); } catch(e) { res.json({ success: false }); } });
app.post('/api/admin/edit_user', async (req, res) => { try { const p = await getPool(); req.body.password ? await p.query("UPDATE auth_users SET username=$1,email=$2,phone=$3,password=$4 WHERE id=$5", [req.body.username, req.body.email, req.body.phone, req.body.password, req.body.id]) : await p.query("UPDATE auth_users SET username=$1,email=$2,phone=$3 WHERE id=$4", [req.body.username, req.body.email, req.body.phone, req.body.id]); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });
app.post('/api/admin/ban', async (req, res) => { try { const p = await getPool(); await p.query('INSERT INTO banned_users (user_id,banned_by) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET banned_by=$2', [req.body.userId, 'admin']); tgSend('ðŸš« Banned: ' + req.body.userId); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });
app.post('/api/admin/unban', async (req, res) => { try { const p = await getPool(); await p.query('DELETE FROM banned_users WHERE user_id=$1', [req.body.userId]); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });
app.post('/api/admin/delete', async (req, res) => { 
    try { 
        const p = await getPool(); 
        const userId = req.body.userId;
        
        // First, add to banned_users so user gets auto-kicked
        await p.query(
            'INSERT INTO banned_users (user_id, banned_by) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET banned_by=$2', 
            [userId, 'admin']
        );
        
        // Then delete the user
        await p.query('DELETE FROM auth_users WHERE id=$1', [userId]);
        
        // Also delete user's orders
        await p.query('DELETE FROM orders WHERE user_id=$1', [userId]);
        
        tgSend(`ðŸ—‘ï¸ Deleted: ${userId}`);
        res.json({ success: true }); 
    } catch(e) { 
        res.json({ success: false }); 
    } 
});
app.post('/api/admin/search_user', async (req, res) => { try { const p = await getPool(); const r = await p.query('SELECT id,username,email,balance FROM auth_users WHERE id::text=$1 OR username ILIKE $2 OR email ILIKE $2 LIMIT 5', [req.body.query, '%'+req.body.query+'%']); res.json({ users: r.rows }); } catch(e) { res.json({ users: [] }); } });
app.post('/api/admin/update_balance', async (req, res) => { try { const p = await getPool(); await p.query('UPDATE auth_users SET balance=COALESCE(balance,0)+$1 WHERE id=$2', [req.body.amount, req.body.userId]); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });

// ==================== ORDERS ====================
app.get('/api/admin/orders', async (req, res) => { try { const p = await getPool(); const filter = req.query.filter || 'all'; let query = 'SELECT * FROM orders'; const params = []; const today = new Date().toISOString().split('T')[0]; if (filter === 'today') { query += " WHERE DATE(created_at)=$1"; params.push(today); } else if (filter === 'yesterday') { query += " WHERE DATE(created_at)=$1"; params.push(new Date(Date.now()-86400000).toISOString().split('T')[0]); } query += ' ORDER BY id DESC'; const r = await p.query(query, params); const totalR = await p.query("SELECT COUNT(*) FROM orders"); const todayR = await p.query("SELECT COUNT(*) FROM orders WHERE DATE(created_at)=$1", [today]); res.json({ orders: r.rows, total: parseInt(totalR.rows[0].count), today: parseInt(todayR.rows[0].count) }); } catch(e) { res.json({ orders: [], total: 0, today: 0 }); } });
app.post('/api/submit_order', async (req, res) => { try { const p = await getPool(); const uid = parseInt(req.body.token.replace('token_', '')); const user = await p.query('SELECT username FROM auth_users WHERE id=$1', [uid]); const un = user.rows[0]?.username || 'Unknown'; await p.query('INSERT INTO orders (user_id,username,amount,payment_method,screenshot,status,submitted_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)', [uid, un, req.body.amount, req.body.payment_method, req.body.screenshot, 'pending', req.body.user_id||uid]); tgSend(`ðŸ›’ New Order\nðŸ‘¤ ${un}\nðŸ’° ${req.body.amount} Ks\nðŸ’³ ${req.body.payment_method}`); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });
app.post('/api/get_orders', async (req, res) => { try { const p = await getPool(); const uid = parseInt(req.body.token.replace('token_', '')); const r = await p.query('SELECT * FROM orders WHERE user_id=$1 ORDER BY id DESC', [uid]); res.json({ orders: r.rows }); } catch(e) { res.json({ orders: [] }); } });
app.post('/api/admin/order_status', async (req, res) => { try { const p = await getPool(); const { id, status, reason } = req.body; if (status === 'rejected') { await p.query('UPDATE orders SET status=$1, reject_reason=$2 WHERE id=$3', [status, reason || '', id]); } else { await p.query('UPDATE orders SET status=$1 WHERE id=$2', [status, id]); } res.json({ success: true }); } catch(e) { res.json({ success: false }); } });

// ==================== NOTICES ====================
app.get('/api/notice', async (req, res) => { try { const p = await getPool(); const r = await p.query("SELECT * FROM notices WHERE notice_type='dashboard' OR notice_type IS NULL ORDER BY id DESC LIMIT 1"); if (r.rows.length === 0) return res.json({ message: '' }); const n = r.rows[0]; res.json({ success: true, message: n.message, color: n.color, created_at: n.created_at }); } catch(e) { res.json({ message: '' }); } });
app.get('/api/admin/notices', async (req, res) => { try { const p = await getPool(); const r = await p.query("SELECT * FROM notices WHERE notice_type='dashboard' OR notice_type IS NULL ORDER BY id DESC"); res.json({ notices: r.rows }); } catch(e) { res.json({ notices: [] }); } });
app.post('/api/admin/notice', async (req, res) => { try { const p = await getPool(); const { message, color } = req.body; if (!message) return res.json({ success: false }); await p.query("INSERT INTO notices (message,color,created_by,notice_type) VALUES ($1,$2,$3,'dashboard')", [message, color||'#fff', 'admin']); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });
app.post('/api/admin/notice/delete', async (req, res) => { try { const p = await getPool(); await p.query('DELETE FROM notices WHERE id=$1', [req.body.id]); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });
app.post('/api/admin/notices/delete_all', async (req, res) => { try { const p = await getPool(); await p.query("DELETE FROM notices WHERE notice_type='dashboard' OR notice_type IS NULL"); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });

// Top Up Notice
app.get('/api/topup_notice', async (req, res) => { try { const p = await getPool(); const r = await p.query("SELECT * FROM notices WHERE notice_type='topup' ORDER BY id DESC LIMIT 1"); if (r.rows.length === 0) return res.json({ message: '' }); const n = r.rows[0]; res.json({ success: true, message: n.message, color: n.color, created_at: n.created_at }); } catch(e) { res.json({ message: '' }); } });
app.get('/api/admin/topup_notices', async (req, res) => { try { const p = await getPool(); const r = await p.query("SELECT * FROM notices WHERE notice_type='topup' ORDER BY id DESC"); res.json({ notices: r.rows }); } catch(e) { res.json({ notices: [] }); } });
app.post('/api/admin/topup_notice', async (req, res) => { try { const p = await getPool(); const { message, color } = req.body; if (!message) return res.json({ success: false }); await p.query("INSERT INTO notices (message,color,created_by,notice_type) VALUES ($1,$2,$3,'topup')", [message, color||'#fff', 'admin']); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });
app.post('/api/admin/topup_notice/delete', async (req, res) => { try { const p = await getPool(); await p.query("DELETE FROM notices WHERE id=$1 AND notice_type='topup'", [req.body.id]); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });
app.post('/api/admin/topup_notices/delete_all', async (req, res) => { try { const p = await getPool(); await p.query("DELETE FROM notices WHERE notice_type='topup'"); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });

// Buy Code Notice
app.get('/api/buycode_notice', async (req, res) => { try { const p = await getPool(); const r = await p.query("SELECT * FROM notices WHERE notice_type='buycode' ORDER BY id DESC LIMIT 1"); if (r.rows.length === 0) return res.json({ message: '' }); const n = r.rows[0]; res.json({ success: true, message: n.message, color: n.color, created_at: n.created_at }); } catch(e) { res.json({ message: '' }); } });
app.get('/api/admin/buycode_notices', async (req, res) => { try { const p = await getPool(); const r = await p.query("SELECT * FROM notices WHERE notice_type='buycode' ORDER BY id DESC"); res.json({ notices: r.rows }); } catch(e) { res.json({ notices: [] }); } });
app.post('/api/admin/buycode_notice', async (req, res) => { try { const p = await getPool(); const { message, color } = req.body; if (!message) return res.json({ success: false }); await p.query("INSERT INTO notices (message,color,created_by,notice_type) VALUES ($1,$2,$3,'buycode')", [message, color||'#fff', 'admin']); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });
app.post('/api/admin/buycode_notice/delete', async (req, res) => { try { const p = await getPool(); await p.query("DELETE FROM notices WHERE id=$1 AND notice_type='buycode'", [req.body.id]); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });
app.post('/api/admin/buycode_notices/delete_all', async (req, res) => { try { const p = await getPool(); await p.query("DELETE FROM notices WHERE notice_type='buycode'"); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });

// ==================== BOT MESSAGE ====================
app.post('/api/admin/bot_message', async (req, res) => {
    const { message, sound, title } = req.body;
    console.log('[BOT MESSAGE]', { message: message?.substring(0,30), sound, title });
    
    if (!message) return res.json({ success: false, message: 'Message required' });
    
    try {
        const p = await getPool();
        
        // 1. Telegram Bot
        const users = await p.query("SELECT DISTINCT google_id FROM auth_users WHERE login_type='telegram'");
        let telegramCount = 0;
        for (const user of users.rows) {
            const tid = user.google_id.replace('tg_', '');
            try {
                await fetch(`${TELEGRAM_API}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: tid,
                        text: `📢 ${message}`,
                        parse_mode: 'HTML'
                    })
                });
                telegramCount++;
            } catch(e) {}
        }
        
        // 2. ✅ OneSignal Push Notification (with selected sound)
        const selectedSound = sound || 'notification';
        const selectedTitle = title || 'SOLO M Game Shop';
        
        // Call OneSignal
        sendOnesignal(message, selectedSound, selectedTitle);
        
        console.log('[BOT MESSAGE] ✅ Sent - Telegram: ' + telegramCount + ', Push: yes, Sound: ' + selectedSound);
        
        res.json({ 
            success: true, 
            count: telegramCount,
            push_sent: true,
            sound: selectedSound
        });
        
    } catch(e) {
        console.error('[BOT MESSAGE ERROR]', e);
        res.json({ success: false, message: 'Server error' });
    }
});
// trackLogin for Telegram (manual)
async function trackTelegramLogin(userId, username) {
    try {
        const p = await getPool();
        await p.query(
            `INSERT INTO login_history (user_id, username, login_type, device_info, device_type, is_mobile) 
             VALUES ($1,$2,'telegram','Telegram Bot','Bot',true)`,
            [userId, username]
        );
    } catch(e) {}
}
// ==================== TELEGRAM BOT (မြန်မာလို) ====================
let lastUpdateId = 0;

function sendTelegramMessage(chatId, text, replyMarkup = null) {
    const body = { chat_id: chatId, text, parse_mode: 'HTML' };
    if (replyMarkup) body.reply_markup = JSON.stringify(replyMarkup);
    https.get(`${TELEGRAM_API}/sendMessage?${new URLSearchParams(body).toString()}`, (res) => {
        res.on('data', () => {});
    }).on('error', () => {});
}

async function createTelegramUser(userId, firstName) {
    try {
        const p = await getPool();
        const tgId = 'tg_' + userId;
        const exist = await p.query("SELECT * FROM auth_users WHERE google_id = $1", [tgId]);
        
        if (exist.rows.length > 0) {
            await p.query('UPDATE auth_users SET last_login = NOW() WHERE id = $1', [exist.rows[0].id]);
            // ✅ Track login
            trackTelegramLogin(exist.rows[0].id, exist.rows[0].username || firstName);
            return { id: exist.rows[0].id, isNew: false, balance: exist.rows[0].balance || 0 };
        }
        
        const displayName = firstName || 'TG User';
        const email = 'tg_' + userId + '@telegram.com';
        
        const nu = await p.query(
            'INSERT INTO auth_users (username, email, google_id, login_type, balance) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [displayName, email, tgId, 'telegram', 0]
        );
        
        // ✅ Track login for new user
        trackTelegramLogin(nu.rows[0].id, displayName);
        
        tgSend(`🆕 Telegram User အသစ်\n👤 ${displayName}\n🆔 ${tgId}`);
        
        return { id: nu.rows[0].id, isNew: true, balance: 0 };
    } catch(e) { return null; }
}

async function getUserBalance(userId) {
    try { const p = await getPool(); const r = await p.query("SELECT balance FROM auth_users WHERE google_id = $1", ['tg_' + userId]); return r.rows.length > 0 ? (r.rows[0].balance || 0) : null; }
    catch(e) { return null; }
}

async function getUserOrders(userId) {
    try { const p = await getPool(); const user = await p.query("SELECT id FROM auth_users WHERE google_id = $1", ['tg_' + userId]); if (user.rows.length === 0) return []; const r = await p.query("SELECT * FROM orders WHERE user_id = $1 ORDER BY id DESC LIMIT 3", [user.rows[0].id]); return r.rows; }
    catch(e) { return []; }
}

async function createOTP(userId) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    try { const p = await getPool(); await p.query("UPDATE otp_codes SET used = true WHERE user_id = $1", [userId]); await p.query("INSERT INTO otp_codes (user_id, code, expires_at) VALUES ($1, $2, NOW() + INTERVAL '60 seconds')", [userId, otp]); }
    catch(e) {}
    return otp;
}

function startLongPolling() {
    console.log('🤖 Telegram Bot စတင်ပါပြီ');
    
    const mainKeyboard = {
        inline_keyboard: [
            [{ text: '🏠 အကောင့်ဝင်ရန်', url: 'https://two026-users-data-management.onrender.com' }],
            [{ text: '💰 ငွေဖြည့်ရန်', url: 'https://two026-users-data-management.onrender.com/topup.html' }],
            [{ text: '🛒 Code ဝယ်ရန်', url: 'https://two026-users-data-management.onrender.com/buycode.html' }],
            [{ text: '📞 Admin ဆက်သွယ်ရန်', url: 'https://t.me/Solo_m28' }]
        ]
    };
    
    const quickKeyboard = {
        inline_keyboard: [
            [{ text: '💳 လက်ကျန်ကြည့်ရန်', callback_data: 'balance' }],
            [{ text: '🔐 OTP ရယူရန်', callback_data: 'otp' }],
            [{ text: '📋 Order စစ်ရန်', callback_data: 'status' }],
            [{ text: '🛒 Code ဝယ်ရန်', callback_data: 'buycode' }],
            [{ text: '📞 ဆက်သွယ်ရန်', url: 'https://t.me/Solo_m28' }]
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
                    
                    // ========== ခလုတ်နှိပ်ခြင်းများ ==========
                    if (update.callback_query) {
                        const cq = update.callback_query;
                        const chatId = cq.message.chat.id;
                        const data = cq.data;
                        const firstName = cq.from.first_name || 'User';
                        
                        const user = await createTelegramUser(cq.from.id, firstName);
                        if (!user) { sendTelegramMessage(chatId, '❌ Error ရှိနေပါသည်။ /start ကိုနှိပ်ပါ'); continue; }
                        
                        if (data === 'balance') {
                            const balance = user.balance || 0;
                            sendTelegramMessage(chatId, 
                                `💳 <b>သင့်လက်ကျန်</b>\n\n` +
                                `💰 <b>${balance.toLocaleString()} ကျပ်</b>\n` +
                                `💵 ≈ $${(balance/2100).toFixed(2)} USD\n\n` +
                                `ငွေဖြည့်ရန် Top Up ခလုတ်ကိုနှိပ်ပါ။`, 
                                quickKeyboard
                            );
                        }
                        else if (data === 'otp') {
                            const otp = await createOTP(user.id);
                            sendTelegramMessage(chatId, 
                                `🔐 <b>သင့် OTP ကုဒ်</b>\n\n` +
                                `🔢 <b>${otp}</b>\n\n` +
                                `⏰ ၆၀ စက္ကန့်အတွင်း အသုံးပြုပါ။\n` +
                                `⚠️ မည်သူ့ကိုမျှ မပေးပါနှင့်။`, 
                                quickKeyboard
                            );
                        }
                        else if (data === 'status') {
                            const orders = await getUserOrders(cq.from.id);
                            if (orders.length === 0) {
                                sendTelegramMessage(chatId, '📋 မှာယူမှုမရှိသေးပါ။', quickKeyboard);
                            } else {
                                let msg = '📋 <b>နောက်ဆုံး မှာယူမှုများ</b>\n\n';
                                orders.forEach(o => {
                                    const st = o.status === 'approved' ? '✅' : o.status === 'rejected' ? '❌' : '⏳';
                                    msg += `${st} #${o.id} | 💰 ${o.amount} Ks | 💳 ${o.payment_method}\n📅 ${new Date(o.created_at).toLocaleDateString()}\n\n`;
                                });
                                sendTelegramMessage(chatId, msg, quickKeyboard);
                            }
                        }
                        else if (data === 'buycode') {
                            sendTelegramMessage(chatId, 
                                '🛒 <b>Code ဝယ်ယူရန်</b>\n\nhttps://two026-users-data-management.onrender.com/buycode.html', 
                                mainKeyboard
                            );
                        }
                        
                        try { await fetch(`${TELEGRAM_API}/answerCallbackQuery`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: cq.id }) }); } catch(e) {}
                        continue;
                    }
                    
                    // ========== စာတိုပေးပို့ခြင်းများ ==========
                    const msg = update.message;
                    if (!msg) continue;
                    
                    const chatId = msg.chat.id;
                    const text = (msg.text || '').trim();
                    const firstName = msg.from.first_name || 'User';
                    
                    if (text === '/start' || text === '/login') {
                        const user = await createTelegramUser(msg.from.id, firstName);
                        const welcomeMsg = user.isNew ? 
                            `🎉 <b>SOLO M Game Shop မှ ကြိုဆိုပါတယ်!</b>\n\nမင်္ဂလာပါ ${firstName}!\n\nသင့်အကောင့်ကို အလိုအလျောက် ဖွင့်ပေးပြီးပါပြီ။` :
                            `👋 ပြန်လည်ကြိုဆိုပါတယ် ${firstName}!`;
                        
                        sendTelegramMessage(chatId, 
                            welcomeMsg + '\n\n' +
                            '💳 လက်ကျန်: <b>' + (user.balance || 0).toLocaleString() + ' ကျပ်</b>\n\n' +
                            'အောက်ပါ ခလုတ်များကို အသုံးပြုနိုင်ပါသည်။',
                            quickKeyboard
                        );
                    }
                    else if (text === '/help') {
                        sendTelegramMessage(chatId,
                            `📖 <b>SOLO M Game Shop</b>\n\n` +
                            `<b>Commands များ:</b>\n` +
                            `/start - အကောင့်ဝင်ရန်\n` +
                            `/help - အကူအညီ\n` +
                            `/balance - လက်ကျန်ကြည့်ရန်\n` +
                            `/otp - OTP Code\n` +
                            `/status - Order စစ်ရန်\n` +
                            `/buy - Code ဝယ်ရန်\n\n` +
                            `<b>ဆက်သွယ်ရန်:</b> @Solo_m28`,
                            quickKeyboard
                        );
                    }
                    else if (text === '/balance') {
                        const user = await createTelegramUser(msg.from.id, firstName);
                        const balance = user ? (user.balance || 0) : 0;
                        sendTelegramMessage(chatId, 
                            `💳 <b>သင့်လက်ကျန်</b>\n\n` +
                            `💰 <b>${balance.toLocaleString()} ကျပ်</b>\n` +
                            `💵 ≈ $${(balance/2100).toFixed(2)} USD`, 
                            quickKeyboard
                        );
                    }
                    else if (text === '/otp') {
                        const user = await createTelegramUser(msg.from.id, firstName);
                        if (user) {
                            const otp = await createOTP(user.id);
                            sendTelegramMessage(chatId, 
                                `🔐 <b>သင့် OTP ကုဒ်</b>\n\n🔢 <b>${otp}</b>\n\n⏰ ၆၀ စက္ကန့်အတွင်း အသုံးပြုပါ။`
                            );
                        }
                    }
                    else if (text === '/status') {
                        const orders = await getUserOrders(msg.from.id);
                        if (orders.length === 0) {
                            sendTelegramMessage(chatId, '📋 မှာယူမှုမရှိသေးပါ။');
                        } else {
                            let msg = '📋 <b>နောက်ဆုံး မှာယူမှုများ</b>\n\n';
                            orders.forEach(o => {
                                const st = o.status === 'approved' ? '✅' : o.status === 'rejected' ? '❌' : '⏳';
                                msg += `${st} #${o.id} | 💰 ${o.amount} Ks | 💳 ${o.payment_method}\n📅 ${new Date(o.created_at).toLocaleDateString()}\n\n`;
                            });
                            sendTelegramMessage(chatId, msg);
                        }
                    }
                    else if (text === '/buy') {
                        sendTelegramMessage(chatId, 
                            '🛒 <b>Code ဝယ်ယူရန်</b>\n\nhttps://two026-users-data-management.onrender.com/buycode.html', 
                            mainKeyboard
                        );
                    }
                    else {
                        sendTelegramMessage(chatId, 
                            `အောက်ပါ Commands များကို အသုံးပြုပါ။\n\n` +
                            `/start - စတင်ရန်\n` +
                            `/help - အကူအညီ\n` +
                            `/balance - လက်ကျန်ကြည့်ရန်\n` +
                            `/otp - OTP Code\n` +
                            `/status - Order မှတ်တမ်း\n` +
                            `/buy - Code ဝယ်ယူရန်`,
                            quickKeyboard
                        );
                    }
                }
            }
        } catch(e) {
            console.log('Bot Polling:', e.message);
        }
        setTimeout(getUpdates, 500);
    }
    
    getUpdates();
    console.log('✅ Bot Long Polling Active');
}

startLongPolling();
// ==================== VIDEO SYSTEM ====================
function getEmbedUrl(url) {
    if (!url) return '';
    if (url.match(/\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i)) return url;
    if (url.includes('catbox.moe') || url.includes('files.')) return url;
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1&playsinline=1`;
    const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
    if (shortsMatch) return `https://www.youtube.com/embed/${shortsMatch[1]}?autoplay=1&mute=1&playsinline=1`;
    return url;
}

app.post('/api/admin/video', async (req, res) => { const { url } = req.body; if (!url) return res.json({ success: false }); try { const p = await getPool(); await p.query('DELETE FROM videos'); await p.query('INSERT INTO videos (video_url) VALUES ($1)', [url]); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });
app.get('/api/video', async (req, res) => { try { const p = await getPool(); const r = await p.query('SELECT * FROM videos ORDER BY id DESC LIMIT 1'); if (r.rows.length > 0) { const rawUrl = r.rows[0].video_url; const embedUrl = getEmbedUrl(rawUrl); res.json({ success: true, url: embedUrl, originalUrl: rawUrl, isYouTube: embedUrl.includes('youtube.com/embed') }); } else { res.json({ success: false, url: '' }); } } catch(e) { res.json({ success: false, url: '' }); } });
app.post('/api/admin/video/delete', async (req, res) => { try { const p = await getPool(); await p.query('DELETE FROM videos'); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });

// ==================== BUY CODE SYSTEM ====================
app.get('/api/redeem_codes', async (req, res) => {
    try {
        const p = await getPool();
        const r = await p.query("SELECT * FROM redeem_codes WHERE used=false ORDER BY category, id ASC");
        console.log('[REDEEM CODES] Total:', r.rows.length);
        
        const grouped = {};
        REDEEM_CATEGORIES.forEach(cat => {
            const codes = r.rows.filter(c => c.category === cat.id && !c.used);
            grouped[cat.id] = { name: cat.name, icon: cat.icon, price: cat.price, codes: codes.map(c => ({ id: c.id, code: c.code })) };
        });
        
        res.json({ success: true, categories: grouped });
    } catch(e) { res.json({ success: false, categories: {} }); }
});

app.post('/api/buy_code', async (req, res) => {
    const { token, codeId } = req.body;
    console.log('[BUY CODE API] Received:', { token: token?.substring(0,10)+'...', codeId });
    
    if (!token || !codeId) {
        return res.json({ success: false, message: 'Missing data' });
    }
    
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        if (isNaN(uid)) return res.json({ success: false, message: 'Invalid token' });
        
        // ====== FIX: Find by code ID, don't check "used" status ======
        // The frontend sends Hardcoded IDs (1-13)
        // But DB may have different IDs
        // SOLUTION: Use a different approach
        
        // First, check if this is a hardcoded ID (1-13)
        // If so, find an available code in the same category
        var query;
        var params;
        
        if (parseInt(codeId) <= 13) {
            // Map hardcoded ID to category
            var catMap = {
                1: 'shhh_emote', 2: 'shhh_emote', 3: 'shhh_emote', 4: 'shhh_emote',
                5: 'golden_border', 6: 'golden_border', 7: 'golden_border', 8: 'golden_border',
                9: 'lucky_diamond', 10: 'lucky_diamond', 11: 'lucky_diamond',
                12: 'magic_durt',
                13: 'emblem_box'
            };
            
            var category = catMap[parseInt(codeId)];
            if (!category) return res.json({ success: false, message: 'Invalid category' });
            
            // Find first available code in that category
            query = 'SELECT * FROM redeem_codes WHERE category=$1 AND used=false ORDER BY id ASC LIMIT 1';
            params = [category];
            
        } else {
            // Direct ID lookup (for Admin-added codes)
            query = 'SELECT * FROM redeem_codes WHERE id=$1 AND used=false';
            params = [codeId];
        }
        
        var codeCheck = await p.query(query, params);
        console.log('[BUY CODE API] Code found:', codeCheck.rows.length > 0);
        
        if (codeCheck.rows.length === 0) {
            return res.json({ success: false, message: 'Code not available - All codes in this category are used' });
        }
        
        var code = codeCheck.rows[0];
        var cat = REDEEM_CATEGORIES.find(function(c) { return c.id === code.category; });
        var price = cat ? cat.price : 0;
        
        // Check balance
        var user = await p.query('SELECT balance FROM auth_users WHERE id=$1', [uid]);
        if (user.rows.length === 0) return res.json({ success: false, message: 'User not found' });
        
        var balance = parseFloat(user.rows[0].balance || 0);
        if (balance < price) return res.json({ success: false, message: 'Insufficient balance. Need ' + price + ' Ks' });
        
        // Mark as used
        await p.query('UPDATE redeem_codes SET used=true, used_by=$1, used_at=NOW() WHERE id=$2', [uid, code.id]);
        
        // Deduct balance
        await p.query('UPDATE auth_users SET balance=balance-$1 WHERE id=$2', [price, uid]);
        
        var newBalance = balance - price;
        console.log('[BUY CODE API] SUCCESS! Code:', code.code, 'Balance:', newBalance);
        
        res.json({ success: true, code: code.code, balance: newBalance });
        
    } catch(e) {
        console.error('[BUY CODE API ERROR]', e);
        res.json({ success: false, message: 'Server error' });
    }
});
app.get('/api/admin/redeem_codes', async (req, res) => { try { const p = await getPool(); const r = await p.query('SELECT * FROM redeem_codes ORDER BY category, id ASC'); res.json({ success: true, codes: r.rows }); } catch(e) { res.json({ success: false, codes: [] }); } });
app.post('/api/admin/redeem_code', async (req, res) => { const { category, code } = req.body; if (!category || !code) return res.json({ success: false }); try { const p = await getPool(); await p.query('INSERT INTO redeem_codes (category, code, used) VALUES ($1, $2, $3)', [category, code, false]); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });
app.post('/api/admin/redeem_code/delete', async (req, res) => { const { id } = req.body; if (!id) return res.json({ success: false }); try { const p = await getPool(); await p.query('DELETE FROM redeem_codes WHERE id=$1', [id]); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });
// ==================== MAINTENANCE PAGE ====================
function maintenancePage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Under Maintenance</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        *{margin:0;padding:0}
        body{
            background:linear-gradient(135deg,#0c0e27,#1a1f4b,#2c3e50);
            min-height:100vh;
            display:flex;
            justify-content:center;
            align-items:center;
            text-align:center;
            font-family:sans-serif;
            color:#fff;
            padding:20px;
        }
        .box i{
            font-size:70px;
            color:#f39c12;
            animation:pulse 2s infinite;
        }
        @keyframes pulse{
            0%,100%{opacity:1}
            50%{opacity:0.5}
        }
        .box h2{
            color:#f39c12;
            margin:15px 0;
            font-size:20px;
        }
        .box p{
            color:#ccc;
            margin-bottom:20px;
            font-size:14px;
        }
        .box a{
            color:#000;
            background:#f39c12;
            padding:10px 25px;
            border-radius:6px;
            text-decoration:none;
            font-weight:bold;
            display:inline-block;
        }
    </style>
</head>
<body>
    <div class="box">
        <i class="fas fa-tools"></i>
        <h2>This page is under maintenance</h2>
        <p>Please wait while we make updates. The page will be back soon.</p>
        <a href="/dashboard"><i class="fas fa-arrow-left"></i> Back to Dashboard</a>
    </div>
</body>
</html>`;
}

async function servePageWithCheck(req, res, pageId, filePath) {
    try { 
        const p = await getPool(); 
        const r = await p.query("SELECT status FROM page_status WHERE page_id=$1", [pageId]); 
        if (r.rows.length > 0 && r.rows[0].status === 'off') { 
            return res.send(maintenancePage()); 
        } 
    } catch(e) {}
    res.sendFile(path.join(__dirname, filePath));
}

// ==================== BUY CODE NOTI BELL API ====================
app.get('/api/buycode_new_codes', async (req, res) => {
    try {
        const p = await getPool();
        const r = await p.query("SELECT * FROM redeem_codes WHERE used=false ORDER BY id DESC LIMIT 1");
        
        if (r.rows.length > 0) {
            const latest = r.rows[0];
            const cat = REDEEM_CATEGORIES.find(c => c.id === latest.category);
            const catName = cat ? cat.name : latest.category;
            
            res.json({ 
                success: true, 
                hasNew: true,
                latestId: latest.id,
                message: 'Mobile Legends Bang Bang မှ Redeem Code အသစ်များ ထပ်မံရောက်ရှိလာပါပြီ၊ Customers များ ဝယ်ယူအားပေးနိုင်ပါပြီ။'
            });
        } else {
            res.json({ success: true, hasNew: false, latestId: 0 });
        }
    } catch(e) { res.json({ success: false }); }
});

// ╔══════════════════════════════════════════════════════════════╗
// ║              SPIN & USD API (COMPLETE REWRITE)              ║
// ╚══════════════════════════════════════════════════════════════╝

// ==================== SPIN CONFIG (SERVER-SIDE) ====================
const SPIN_CONFIG = {
    // ✅ Normal Daily 1 Draw (Total Weight = 101)
    NORMAL_SEGMENTS: [
        { label: 'FREE',      color: '#1abc9c', reward: 0,    type: 'free',    weight: 44 },
        { label: 'Thank You', color: '#7f8c8d', reward: 0,    type: 'thanks',  weight: 48 },
        { label: '500 Ks',    color: '#f39c12', reward: 500,  type: 'mmk',     weight: 3  },
        { label: '$0.25',     color: '#e74c3c', reward: 0.25, type: 'usd',     weight: 2  },
        { label: '$0.50',     color: '#e67e22', reward: 0.50, type: 'usd',     weight: 1  },
        { label: '$0.75',     color: '#3498db', reward: 0.75, type: 'usd',     weight: 1  },
        { label: '$1.00',     color: '#2ecc71', reward: 1.00, type: 'usd',     weight: 1  },
        { label: '$2.00',     color: '#9b59b6', reward: 2.00, type: 'usd',     weight: 1  }
    ],
    
    // ✅ Buy Normal Draw (Total Weight = 103)
    NORMAL_BUY_SEGMENTS: [
        { label: 'FREE',      color: '#1abc9c', reward: 0,    type: 'free',    weight: 40 },
        { label: 'Thank You', color: '#7f8c8d', reward: 0,    type: 'thanks',  weight: 50 },
        { label: '500 Ks',    color: '#f39c12', reward: 500,  type: 'mmk',     weight: 5  },
        { label: '$0.25',     color: '#e74c3c', reward: 0.25, type: 'usd',     weight: 3  },
        { label: '$0.50',     color: '#e67e22', reward: 0.50, type: 'usd',     weight: 2  },
        { label: '$0.75',     color: '#3498db', reward: 0.75, type: 'usd',     weight: 1  },
        { label: '$1.00',     color: '#2ecc71', reward: 1.00, type: 'usd',     weight: 1  },
        { label: '$2.00',     color: '#9b59b6', reward: 2.00, type: 'usd',     weight: 1  }
    ],
    
    // ✅ Buy Premium Draw (Total Weight = 94)
    PREMIUM_BUY_SEGMENTS: [
        { label: 'FREE',      color: '#1abc9c', reward: 0,    type: 'free',    weight: 40 },
        { label: 'Thank You', color: '#7f8c8d', reward: 0,    type: 'thanks',  weight: 40 },
        { label: '500 Ks',    color: '#f39c12', reward: 500,  type: 'mmk',     weight: 6  },
        { label: '$0.25',     color: '#e74c3c', reward: 0.25, type: 'usd',     weight: 3  },
        { label: '$0.50',     color: '#e67e22', reward: 0.50, type: 'usd',     weight: 2  },
        { label: '$0.75',     color: '#3498db', reward: 0.75, type: 'usd',     weight: 1  },
        { label: '$1.00',     color: '#2ecc71', reward: 1.00, type: 'usd',     weight: 1  },
        { label: '$2.00',     color: '#9b59b6', reward: 2.00, type: 'usd',     weight: 1  }
    ],
    
    // ✅ Premium Tier 1 - Bronze (Total Weight = 101)
    PREMIUM_TIER1_SEGMENTS: [
        { label: '500 Ks',    color: '#f39c12', reward: 500,  type: 'mmk',     weight: 18 },
        { label: '1000 Ks',   color: '#c9a84c', reward: 1000, type: 'mmk',     weight: 14 },
        { label: '$0.50',     color: '#e74c3c', reward: 0.50, type: 'usd',     weight: 17 },
        { label: '$0.75',     color: '#e67e22', reward: 0.75, type: 'usd',     weight: 15 },
        { label: '$1.00',     color: '#2ecc71', reward: 1.00, type: 'usd',     weight: 12 },
        { label: '$2.00',     color: '#9b59b6', reward: 2.00, type: 'usd',     weight: 9  },
        { label: '$3.00',     color: '#e91e63', reward: 3.00, type: 'usd',     weight: 6  },
        { label: 'SUPER',     color: '#ff1744', reward: 0,    type: 'super',   weight: 5  },
        { label: 'Thank You', color: '#7f8c8d', reward: 0,    type: 'thanks',  weight: 5  }
    ],
    
    // ✅ Premium Tier 2 - Silver (Total Weight = 98)
    PREMIUM_TIER2_SEGMENTS: [
        { label: '500 Ks',    color: '#f39c12', reward: 500,  type: 'mmk',     weight: 14 },
        { label: '1000 Ks',   color: '#c9a84c', reward: 1000, type: 'mmk',     weight: 11 },
        { label: '$0.50',     color: '#e74c3c', reward: 0.50, type: 'usd',     weight: 12 },
        { label: '$0.75',     color: '#e67e22', reward: 0.75, type: 'usd',     weight: 11 },
        { label: '$1.00',     color: '#2ecc71', reward: 1.00, type: 'usd',     weight: 10 },
        { label: '$2.00',     color: '#9b59b6', reward: 2.00, type: 'usd',     weight: 7  },
        { label: '$3.00',     color: '#e91e63', reward: 3.00, type: 'usd',     weight: 5  },
        { label: 'SUPER',     color: '#ff1744', reward: 0,    type: 'super',   weight: 3  },
        { label: 'Thank You', color: '#7f8c8d', reward: 0,    type: 'thanks',  weight: 25 }
    ],
    
    // ✅ Premium Tier 3 - Gold (Total Weight = 102)
    PREMIUM_TIER3_SEGMENTS: [
        { label: '500 Ks',    color: '#f39c12', reward: 500,  type: 'mmk',     weight: 12 },
        { label: '1000 Ks',   color: '#c9a84c', reward: 1000, type: 'mmk',     weight: 10 },
        { label: '$0.50',     color: '#e74c3c', reward: 0.50, type: 'usd',     weight: 15 },
        { label: '$0.75',     color: '#e67e22', reward: 0.75, type: 'usd',     weight: 11 },
        { label: '$1.00',     color: '#2ecc71', reward: 1.00, type: 'usd',     weight: 7  },
        { label: '$2.00',     color: '#9b59b6', reward: 2.00, type: 'usd',     weight: 5  },
        { label: '$3.00',     color: '#e91e63', reward: 3.00, type: 'usd',     weight: 4  },
        { label: 'SUPER',     color: '#ff1744', reward: 0,    type: 'super',   weight: 4  },
        { label: 'Thank You', color: '#7f8c8d', reward: 0,    type: 'thanks',  weight: 34 }
    ]
};

// ==================== GET USD BALANCE ====================
app.post('/api/get_usd_balance', async (req, res) => {
    const { token } = req.body;
    if (!token || token === 'guest') return res.json({ usd_balance: 0 });
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        if (isNaN(uid)) return res.json({ usd_balance: 0 });
        const r = await p.query('SELECT usd_balance FROM auth_users WHERE id=$1', [uid]);
        res.json({ usd_balance: parseFloat(r.rows[0]?.usd_balance || 0) });
    } catch(e) { res.json({ usd_balance: 0 }); }
});

// ==================== GET BALANCE ====================
app.post('/api/get_balance', async (req, res) => {
    const { token } = req.body;
    if (!token || token === 'guest') return res.json({ balance: 0 });
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        if (isNaN(uid)) return res.json({ balance: 0 });
        const r = await p.query('SELECT balance FROM auth_users WHERE id=$1', [uid]);
        res.json({ balance: parseFloat(r.rows[0]?.balance || 0) });
    } catch(e) { res.json({ balance: 0 }); }
});

// ==================== GET PAID SPINS ====================
app.post('/api/get_paid_spins', async (req, res) => {
    const { token } = req.body;
    if (!token || token === 'guest') return res.json({ paid_spins: 0 });
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        if (isNaN(uid)) return res.json({ paid_spins: 0 });
        const r = await p.query('SELECT paid_spins FROM auth_users WHERE id=$1', [uid]);
        res.json({ paid_spins: parseInt(r.rows[0]?.paid_spins || 0) });
    } catch(e) { res.json({ paid_spins: 0 }); }
});

// ==================== GET PREMIUM STATUS ====================
app.post('/api/get_premium_status', async (req, res) => {
    const { token } = req.body;
    if (!token || token === 'guest') return res.json({ success: false, premium_active: false });
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        if (isNaN(uid)) return res.json({ success: false, premium_active: false });
        
        const r = await p.query('SELECT premium_expiry, premium_tier FROM auth_users WHERE id=$1', [uid]);
        const isPremium = r.rows.length > 0 && r.rows[0].premium_expiry && new Date(r.rows[0].premium_expiry) > new Date();
        const premiumTier = r.rows[0]?.premium_tier || 1;
        
        let maxDaily = 1;
        if (isPremium) {
            switch(premiumTier) { case 1: maxDaily = 3; break; case 2: maxDaily = 5; break; case 3: maxDaily = 7; break; default: maxDaily = 3; }
        }
        
        const todayDraws = await p.query("SELECT COUNT(*) as cnt FROM spin_history_v2 WHERE user_id=$1 AND DATE(created_at)=CURRENT_DATE AND spin_source='daily'", [uid]);
        const usedToday = parseInt(todayDraws.rows[0]?.cnt || 0);
        const remaining = Math.max(0, maxDaily - usedToday);
        
        res.json({
            success: true, premium_active: isPremium, premium_tier: premiumTier,
            expires_at: isPremium ? r.rows[0].premium_expiry.toISOString() : null,
            daily_draws_remaining: remaining, max_daily_draws: maxDaily
        });
    } catch(e) { res.json({ success: false, premium_active: false }); }
});

// ==================== DEDUCT BALANCE (Buy Spins) ====================
app.post('/api/deduct_balance', async (req, res) => {
    const { token, amount, reason } = req.body;
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    if (!amount || amount <= 0) return res.json({ success: false, message: 'Invalid amount' });
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        if (isNaN(uid)) return res.json({ success: false, message: 'Invalid session' });
        const r = await p.query('SELECT balance FROM auth_users WHERE id=$1', [uid]);
        const balance = parseFloat(r.rows[0]?.balance || 0);
        if (balance < amount) return res.json({ success: false, message: 'ငွေမလုံလောက်ပါ။ Top Up လုပ်ပါ။' });
        await p.query('UPDATE auth_users SET balance = balance - $1 WHERE id=$2', [amount, uid]);
        if (reason && reason.includes('Buy') && reason.includes('spins')) {
            const spinsMatch = reason.match(/Buy (\d+) spins/);
            if (spinsMatch) await p.query('UPDATE auth_users SET paid_spins = COALESCE(paid_spins, 0) + $1 WHERE id=$2', [parseInt(spinsMatch[1]), uid]);
        }
        await p.query("INSERT INTO orders (user_id, username, amount, payment_method, status) VALUES ($1, (SELECT username FROM auth_users WHERE id=$1), $2, $3, 'approved')", [uid, -amount, reason || 'Spin Purchase']);
        res.json({ success: true, new_balance: balance - amount });
    } catch(e) { res.json({ success: false, message: 'Server error' }); }
});

// ==================== BUY PREMIUM ====================
app.post('/api/buy_premium', async (req, res) => {
    const { token, months, cost, tier } = req.body;
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    if (!months || !cost) return res.json({ success: false, message: 'Missing data' });
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        if (isNaN(uid)) return res.json({ success: false, message: 'Invalid session' });
        const bal = await p.query('SELECT balance FROM auth_users WHERE id=$1', [uid]);
        const balance = parseFloat(bal.rows[0]?.balance || 0);
        if (balance < cost) return res.json({ success: false, message: 'ငွေမလုံလောက်ပါ။ Top Up လုပ်ပါ။' });
        const expiry = new Date(); expiry.setMonth(expiry.getMonth() + months);
        const premiumTier = tier || 1;
        await p.query('UPDATE auth_users SET balance = balance - $1, premium_expiry = $2, premium_tier = $3 WHERE id = $4', [cost, expiry, premiumTier, uid]);
        await p.query("INSERT INTO orders (user_id, username, amount, payment_method, status) VALUES ($1, (SELECT username FROM auth_users WHERE id=$1), $2, 'Premium Purchase', 'approved')", [uid, -cost]);
        await p.query('INSERT INTO weekly_bonus (user_id) VALUES ($1)', [uid]);
        res.json({ success: true, expires_at: expiry.toISOString(), premium_tier: premiumTier });
    } catch(e) { res.json({ success: false, message: 'Server error' }); }
});

// ==================== CLAIM WEEKLY BONUS ====================
app.post('/api/claim_weekly_bonus', async (req, res) => {
    const { token } = req.body;
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        if (isNaN(uid)) return res.json({ success: false, message: 'Invalid session' });
        const last = await p.query('SELECT claimed_at FROM weekly_bonus WHERE user_id=$1 ORDER BY claimed_at DESC LIMIT 1', [uid]);
        if (last.rows.length > 0 && Math.floor((Date.now() - new Date(last.rows[0].claimed_at).getTime()) / 86400000) < 7) {
            return res.json({ success: false, message: 'Already claimed this week' });
        }
        await p.query('INSERT INTO weekly_bonus (user_id) VALUES ($1)', [uid]);
        res.json({ success: true, message: 'Weekly bonus claimed!' });
    } catch(e) { res.json({ success: false, message: 'Server error' }); }
});

// ==================== ADMIN: REVOKE PREMIUM ====================
app.post('/api/admin/revoke_premium', async (req, res) => {
    const { userId } = req.body;
    
    if (!userId) return res.json({ success: false, message: 'User ID required' });
    
    try {
        const p = await getPool();
        
        // Revoke premium immediately
        await p.query(
            'UPDATE auth_users SET premium_expiry = NULL, premium_tier = 1 WHERE id = $1',
            [userId]
        );
        
        console.log('[PREMIUM] Revoked for user:', userId);
        
        res.json({ success: true, message: 'Premium access revoked!' });
        
    } catch(e) {
        console.error('[PREMIUM REVOKE ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});

// Get user premium status (for admin)
app.post('/api/admin/get_user_premium', async (req, res) => {
    const { userId } = req.body;
    
    if (!userId) return res.json({ success: false });
    
    try {
        const p = await getPool();
        const r = await p.query(
            'SELECT premium_expiry, premium_tier, username FROM auth_users WHERE id=$1',
            [userId]
        );
        
        if (r.rows.length > 0) {
            const u = r.rows[0];
            const isActive = u.premium_expiry && new Date(u.premium_expiry) > new Date();
            
            res.json({
                success: true,
                username: u.username,
                premium_active: isActive,
                premium_tier: u.premium_tier || 1,
                expires_at: u.premium_expiry ? u.premium_expiry.toISOString() : null,
                days_left: u.premium_expiry 
                    ? Math.max(0, Math.ceil((new Date(u.premium_expiry) - new Date()) / (1000 * 60 * 60 * 24)))
                    : 0
            });
        } else {
            res.json({ success: false, message: 'User not found' });
        }
    } catch(e) {
        res.json({ success: false, message: 'Server error' });
    }
});
// ==================== EXCHANGE USD TO MMK ====================
app.post('/api/exchange_usd_to_mmk', async (req, res) => {
    const { token, usd_amount } = req.body;
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    if (!usd_amount || usd_amount < 1) return res.json({ success: false, message: 'Minimum 1 USD required' });
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        if (isNaN(uid)) return res.json({ success: false, message: 'Invalid session' });
        const r = await p.query('SELECT usd_balance FROM auth_users WHERE id=$1', [uid]);
        const usdBalance = parseFloat(r.rows[0]?.usd_balance || 0);
        if (usdBalance < usd_amount) return res.json({ success: false, message: 'Insufficient USD balance' });
        const mmkAmount = 2000 * usd_amount;
        await p.query('UPDATE auth_users SET usd_balance = usd_balance - $1 WHERE id=$2', [usd_amount, uid]);
        await p.query('UPDATE auth_users SET balance = COALESCE(balance,0) + $1 WHERE id=$2', [mmkAmount, uid]);
        res.json({ success: true, mmk_received: mmkAmount, service_fee: 1000 * usd_amount });
    } catch(e) { res.json({ success: false, message: 'Server error' }); }
});

// ==================== GET EXCHANGE RATE INFO ====================
app.get('/api/exchange_rate_info', async (req, res) => {
    try {
        const p = await getPool();
        const r = await p.query("SELECT value FROM settings WHERE key = 'exchange_rate'");
        const baseRate = r.rows.length > 0 ? parseInt(r.rows[0].value) : 3500;
        
        res.json({ 
            success: true, 
            base_rate: baseRate, 
            fees: { 
                transport: 300, 
                internet: 300, 
                data_transfer: 400, 
                total: 1000 
            }, 
            final_rate: baseRate - 1000 
        });
    } catch(e) {
        res.json({ 
            success: true, 
            base_rate: 3500, 
            fees: { transport: 300, internet: 300, data_transfer: 400, total: 1000 }, 
            final_rate: 2500 
        });
    }
});
// ==================== SAVE SPIN HISTORY (Legacy) ====================
app.post('/api/spin/save', async (req, res) => {
    const { token, reward_type, reward_amount, segment_label } = req.body;
    if (!token || token === 'guest') return res.json({ success: false });
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        if (isNaN(uid)) return res.json({ success: false });
        await p.query('INSERT INTO spin_history (user_id, reward_type, reward_amount, segment_label) VALUES ($1,$2,$3,$4)', [uid, reward_type||'thanks', reward_amount||0, segment_label||'Unknown']);
        if (reward_type === 'usd' && reward_amount > 0) await p.query('UPDATE auth_users SET usd_balance = COALESCE(usd_balance,0) + $1 WHERE id=$2', [reward_amount, uid]);
        else if (reward_type === 'mmk' && reward_amount > 0) await p.query('UPDATE auth_users SET balance = COALESCE(balance,0) + $1 WHERE id=$2', [reward_amount, uid]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

// ==================== USE PAID SPIN (Legacy) ====================
app.post('/api/spin/use_paid_spin', async (req, res) => {
    const { token } = req.body;
    if (!token || token === 'guest') return res.json({ success: false });
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        if (isNaN(uid)) return res.json({ success: false });
        await p.query('UPDATE auth_users SET paid_spins = GREATEST(0, COALESCE(paid_spins, 0) - 1) WHERE id=$1', [uid]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

// ==================== TRACK PREMIUM DRAW ====================
app.post('/api/track_premium_draw', async (req, res) => {
    const { token } = req.body;
    if (!token || token === 'guest') return res.json({ success: false });
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        if (isNaN(uid)) return res.json({ success: false });
        await p.query(`INSERT INTO premium_draws (user_id, draw_date, draw_count) VALUES ($1, CURRENT_DATE, 1) ON CONFLICT (user_id, draw_date) DO UPDATE SET draw_count = premium_draws.draw_count + 1`, [uid]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

// ╔══════════════════════════════════════════════════════════════╗
// ║           SPIN EXECUTE API (MAIN SPIN LOGIC)                ║
// ╚══════════════════════════════════════════════════════════════╝

app.post('/api/spin/execute', async (req, res) => {
    const { token, spin_source } = req.body;
    console.log('[SPIN EXECUTE] Source:', spin_source);
    
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    if (!spin_source || !['daily', 'bought', 'premium_bought', 'weekly_bonus'].includes(spin_source)) {
        return res.json({ success: false, message: 'Invalid spin source' });
    }
    
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        if (isNaN(uid)) return res.json({ success: false, message: 'Invalid session' });
        
        const user = await p.query('SELECT * FROM auth_users WHERE id=$1', [uid]);
        if (user.rows.length === 0) return res.json({ success: false, message: 'User not found' });
        
        const u = user.rows[0];
        const isPremium = u.premium_expiry && new Date(u.premium_expiry) > new Date();
        const premiumTier = u.premium_tier || 1;
        
        // ✅ Premium Tier အလိုက် Max Daily
        let maxDaily = 1;
        if (isPremium) {
            switch(premiumTier) { case 1: maxDaily = 3; break; case 2: maxDaily = 5; break; case 3: maxDaily = 7; break; default: maxDaily = 3; }
        }
        
        // Count daily used
        const todayDraws = await p.query("SELECT COUNT(*) as cnt FROM spin_history_v2 WHERE user_id=$1 AND DATE(created_at)=CURRENT_DATE AND spin_source='daily'", [uid]);
        const dailyUsed = parseInt(todayDraws.rows[0]?.cnt || 0);
        const dailyRemaining = Math.max(0, maxDaily - dailyUsed);
        const boughtSpins = parseInt(u.paid_spins || 0);
        
        // Count weekly used
        const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const weeklyBonusUsed = await p.query("SELECT COUNT(*) as cnt FROM spin_history_v2 WHERE user_id=$1 AND spin_source='weekly_bonus' AND created_at >= $2", [uid, weekStart]);
        const weeklyClaimed = await p.query("SELECT COUNT(*) as cnt FROM weekly_bonus WHERE user_id=$1 AND claimed_at >= $2", [uid, weekStart]);
        
        let weeklyTotal = 0;
        if (weeklyClaimed.rows[0]?.cnt > 0 && isPremium) {
            switch(premiumTier) { case 1: weeklyTotal = 5; break; case 2: weeklyTotal = 7; break; case 3: weeklyTotal = 10; break; default: weeklyTotal = 5; }
        }
        const weeklyRemaining = Math.max(0, weeklyTotal - parseInt(weeklyBonusUsed.rows[0]?.cnt || 0));
        
        console.log('[SPIN CHECK] Tier:', premiumTier, 'Daily:', dailyRemaining, 'Bought:', boughtSpins, 'Weekly:', weeklyRemaining);
        
        // Verify & Deduct
        let canSpin = false;
        if (spin_source === 'daily' && dailyRemaining > 0) { canSpin = true; }
        else if ((spin_source === 'bought' || spin_source === 'premium_bought') && boughtSpins > 0) {
            canSpin = true;
            await p.query('UPDATE auth_users SET paid_spins = GREATEST(0, paid_spins - 1) WHERE id=$1', [uid]);
        }
        else if (spin_source === 'weekly_bonus' && isPremium && weeklyRemaining > 0) { canSpin = true; }
        
        if (!canSpin) {
            return res.json({ success: false, message: 'No draws remaining', draws: { daily: dailyRemaining, bought: boughtSpins, weekly: weeklyRemaining } });
        }
        
        // ✅ Weighted Random - Source အလိုက် Segments ရွေးပါ
        let segments;
        if (!isPremium) {
            segments = (spin_source === 'daily') ? SPIN_CONFIG.NORMAL_SEGMENTS : SPIN_CONFIG.NORMAL_BUY_SEGMENTS;
        } else {
            if (spin_source === 'daily' || spin_source === 'weekly_bonus') {
                switch(premiumTier) { case 1: segments = SPIN_CONFIG.PREMIUM_TIER1_SEGMENTS; break; case 2: segments = SPIN_CONFIG.PREMIUM_TIER2_SEGMENTS; break; case 3: segments = SPIN_CONFIG.PREMIUM_TIER3_SEGMENTS; break; default: segments = SPIN_CONFIG.PREMIUM_TIER1_SEGMENTS; }
            } else {
                segments = SPIN_CONFIG.PREMIUM_BUY_SEGMENTS;
            }
        }
        
        const totalWeight = segments.reduce((sum, s) => sum + s.weight, 0);
        let rand = Math.random() * totalWeight, winIndex = 0;
        for (let i = 0; i < segments.length; i++) { rand -= segments[i].weight; if (rand <= 0) { winIndex = i; break; } }
        const reward = segments[winIndex];
        
        // Balance Update
        const balBefore = { mmk: parseFloat(u.balance||0), usd: parseFloat(u.usd_balance||0) };
        let balAfter = { mmk: balBefore.mmk, usd: balBefore.usd };
        
        if (reward.type === 'usd' && reward.reward > 0) { await p.query('UPDATE auth_users SET usd_balance = COALESCE(usd_balance,0) + $1 WHERE id=$2', [reward.reward, uid]); balAfter.usd += reward.reward; }
        else if (reward.type === 'mmk' && reward.reward > 0) { await p.query('UPDATE auth_users SET balance = COALESCE(balance,0) + $1 WHERE id=$2', [reward.reward, uid]); balAfter.mmk += reward.reward; }
        else if (reward.type === 'free' && (spin_source === 'bought' || spin_source === 'premium_bought')) { await p.query('UPDATE auth_users SET paid_spins = paid_spins + 1 WHERE id=$1', [uid]); }
        
        // Log
        await p.query(`INSERT INTO spin_history_v2 (user_id, spin_source, reward_type, reward_amount, balance_before_mmk, balance_after_mmk, balance_before_usd, balance_after_usd) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [uid, spin_source, reward.type, reward.reward, balBefore.mmk, balAfter.mmk, balBefore.usd, balAfter.usd]);
        
        const updatedUser = await p.query('SELECT paid_spins FROM auth_users WHERE id=$1', [uid]);
        const updatedBought = parseInt(updatedUser.rows[0]?.paid_spins || 0);
        
        console.log('[SPIN RESULT] ✅ User:', uid, 'Tier:', premiumTier, 'Reward:', reward.label);
        
        res.json({
            success: true, winIndex, reward,
            mmkBalance: balAfter.mmk, usdBalance: balAfter.usd,
            draws: {
                daily: spin_source === 'daily' ? dailyRemaining - 1 : dailyRemaining,
                bought: (spin_source === 'bought' || spin_source === 'premium_bought') ? updatedBought : boughtSpins,
                weekly: spin_source === 'weekly_bonus' ? weeklyRemaining - 1 : weeklyRemaining
            }
        });
        
    } catch(e) {
        console.error('[SPIN EXECUTE ERROR]', e.message);
        res.json({ success: false, message: 'Server error: ' + e.message });
    }
});

console.log('✅ SPIN & USD API Section Ready');

// ==================== CREATE SPIN RATES TABLE ====================
async function createSpinRatesTable() {
    const query = `
        CREATE TABLE IF NOT EXISTS spin_rates (
            id SERIAL PRIMARY KEY,
            rate_type VARCHAR(50) NOT NULL,
            segment_label VARCHAR(50) NOT NULL,
            reward DECIMAL(10,2) DEFAULT 0,
            reward_type VARCHAR(20) DEFAULT 'usd',
            segment_color VARCHAR(20) DEFAULT '#e74c3c',
            weight INT DEFAULT 10,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(rate_type, segment_label)
        )
    `;
    
    try {
        await pools[0].query(query);
        await pools[1].query(query);
        console.log('✅ spin_rates table created on both databases');
    } catch(e) {
        console.log('⚠️ spin_rates table error:', e.message);
    }
}
createSpinRatesTable();

// ==================== INIT DEFAULT SPIN RATES ====================
async function initDefaultSpinRates() {
    const defaultRates = [
        // Normal Daily Draw (Total = 101)
        { rate_type: 'normal_daily', segment_label: 'FREE', reward: 0, reward_type: 'free', segment_color: '#1abc9c', weight: 44 },
        { rate_type: 'normal_daily', segment_label: 'Thank You', reward: 0, reward_type: 'thanks', segment_color: '#7f8c8d', weight: 48 },
        { rate_type: 'normal_daily', segment_label: '500 Ks', reward: 500, reward_type: 'mmk', segment_color: '#f39c12', weight: 3 },
        { rate_type: 'normal_daily', segment_label: '$0.25', reward: 0.25, reward_type: 'usd', segment_color: '#e74c3c', weight: 2 },
        { rate_type: 'normal_daily', segment_label: '$0.50', reward: 0.50, reward_type: 'usd', segment_color: '#e67e22', weight: 1 },
        { rate_type: 'normal_daily', segment_label: '$0.75', reward: 0.75, reward_type: 'usd', segment_color: '#3498db', weight: 1 },
        { rate_type: 'normal_daily', segment_label: '$1.00', reward: 1.00, reward_type: 'usd', segment_color: '#2ecc71', weight: 1 },
        { rate_type: 'normal_daily', segment_label: '$2.00', reward: 2.00, reward_type: 'usd', segment_color: '#9b59b6', weight: 1 },
        
        // Normal Buy Draw (Total = 103)
        { rate_type: 'normal_buy', segment_label: 'FREE', reward: 0, reward_type: 'free', segment_color: '#1abc9c', weight: 40 },
        { rate_type: 'normal_buy', segment_label: 'Thank You', reward: 0, reward_type: 'thanks', segment_color: '#7f8c8d', weight: 50 },
        { rate_type: 'normal_buy', segment_label: '500 Ks', reward: 500, reward_type: 'mmk', segment_color: '#f39c12', weight: 5 },
        { rate_type: 'normal_buy', segment_label: '$0.25', reward: 0.25, reward_type: 'usd', segment_color: '#e74c3c', weight: 3 },
        { rate_type: 'normal_buy', segment_label: '$0.50', reward: 0.50, reward_type: 'usd', segment_color: '#e67e22', weight: 2 },
        { rate_type: 'normal_buy', segment_label: '$0.75', reward: 0.75, reward_type: 'usd', segment_color: '#3498db', weight: 1 },
        { rate_type: 'normal_buy', segment_label: '$1.00', reward: 1.00, reward_type: 'usd', segment_color: '#2ecc71', weight: 1 },
        { rate_type: 'normal_buy', segment_label: '$2.00', reward: 2.00, reward_type: 'usd', segment_color: '#9b59b6', weight: 1 },

        // Premium Buy Draw (Total = 94)
        { rate_type: 'premium_buy', segment_label: 'FREE', reward: 0, reward_type: 'free', segment_color: '#1abc9c', weight: 40 },
        { rate_type: 'premium_buy', segment_label: 'Thank You', reward: 0, reward_type: 'thanks', segment_color: '#7f8c8d', weight: 40 },
        { rate_type: 'premium_buy', segment_label: '500 Ks', reward: 500, reward_type: 'mmk', segment_color: '#f39c12', weight: 6 },
        { rate_type: 'premium_buy', segment_label: '$0.25', reward: 0.25, reward_type: 'usd', segment_color: '#e74c3c', weight: 3 },
        { rate_type: 'premium_buy', segment_label: '$0.50', reward: 0.50, reward_type: 'usd', segment_color: '#e67e22', weight: 2 },
        { rate_type: 'premium_buy', segment_label: '$0.75', reward: 0.75, reward_type: 'usd', segment_color: '#3498db', weight: 1 },
        { rate_type: 'premium_buy', segment_label: '$1.00', reward: 1.00, reward_type: 'usd', segment_color: '#2ecc71', weight: 1 },
        { rate_type: 'premium_buy', segment_label: '$2.00', reward: 2.00, reward_type: 'usd', segment_color: '#9b59b6', weight: 1 },

        // Premium Tier 1 (Total = 101)
        { rate_type: 'premium_tier1', segment_label: '500 Ks', reward: 500, reward_type: 'mmk', segment_color: '#f39c12', weight: 18 },
        { rate_type: 'premium_tier1', segment_label: '1000 Ks', reward: 1000, reward_type: 'mmk', segment_color: '#c9a84c', weight: 14 },
        { rate_type: 'premium_tier1', segment_label: '$0.50', reward: 0.50, reward_type: 'usd', segment_color: '#e74c3c', weight: 17 },
        { rate_type: 'premium_tier1', segment_label: '$0.75', reward: 0.75, reward_type: 'usd', segment_color: '#e67e22', weight: 15 },
        { rate_type: 'premium_tier1', segment_label: '$1.00', reward: 1.00, reward_type: 'usd', segment_color: '#2ecc71', weight: 12 },
        { rate_type: 'premium_tier1', segment_label: '$2.00', reward: 2.00, reward_type: 'usd', segment_color: '#9b59b6', weight: 9 },
        { rate_type: 'premium_tier1', segment_label: '$3.00', reward: 3.00, reward_type: 'usd', segment_color: '#e91e63', weight: 6 },
        { rate_type: 'premium_tier1', segment_label: 'SUPER', reward: 0, reward_type: 'super', segment_color: '#ff1744', weight: 5 },
        { rate_type: 'premium_tier1', segment_label: 'Thank You', reward: 0, reward_type: 'thanks', segment_color: '#7f8c8d', weight: 5 },

        // Premium Tier 2 (Total = 98)
        { rate_type: 'premium_tier2', segment_label: '500 Ks', reward: 500, reward_type: 'mmk', segment_color: '#f39c12', weight: 14 },
        { rate_type: 'premium_tier2', segment_label: '1000 Ks', reward: 1000, reward_type: 'mmk', segment_color: '#c9a84c', weight: 11 },
        { rate_type: 'premium_tier2', segment_label: '$0.50', reward: 0.50, reward_type: 'usd', segment_color: '#e74c3c', weight: 12 },
        { rate_type: 'premium_tier2', segment_label: '$0.75', reward: 0.75, reward_type: 'usd', segment_color: '#e67e22', weight: 11 },
        { rate_type: 'premium_tier2', segment_label: '$1.00', reward: 1.00, reward_type: 'usd', segment_color: '#2ecc71', weight: 10 },
        { rate_type: 'premium_tier2', segment_label: '$2.00', reward: 2.00, reward_type: 'usd', segment_color: '#9b59b6', weight: 7 },
        { rate_type: 'premium_tier2', segment_label: '$3.00', reward: 3.00, reward_type: 'usd', segment_color: '#e91e63', weight: 5 },
        { rate_type: 'premium_tier2', segment_label: 'SUPER', reward: 0, reward_type: 'super', segment_color: '#ff1744', weight: 3 },
        { rate_type: 'premium_tier2', segment_label: 'Thank You', reward: 0, reward_type: 'thanks', segment_color: '#7f8c8d', weight: 25 },

        // Premium Tier 3 (Total = 102)
        { rate_type: 'premium_tier3', segment_label: '500 Ks', reward: 500, reward_type: 'mmk', segment_color: '#f39c12', weight: 12 },
        { rate_type: 'premium_tier3', segment_label: '1000 Ks', reward: 1000, reward_type: 'mmk', segment_color: '#c9a84c', weight: 10 },
        { rate_type: 'premium_tier3', segment_label: '$0.50', reward: 0.50, reward_type: 'usd', segment_color: '#e74c3c', weight: 15 },
        { rate_type: 'premium_tier3', segment_label: '$0.75', reward: 0.75, reward_type: 'usd', segment_color: '#e67e22', weight: 11 },
        { rate_type: 'premium_tier3', segment_label: '$1.00', reward: 1.00, reward_type: 'usd', segment_color: '#2ecc71', weight: 7 },
        { rate_type: 'premium_tier3', segment_label: '$2.00', reward: 2.00, reward_type: 'usd', segment_color: '#9b59b6', weight: 5 },
        { rate_type: 'premium_tier3', segment_label: '$3.00', reward: 3.00, reward_type: 'usd', segment_color: '#e91e63', weight: 4 },
        { rate_type: 'premium_tier3', segment_label: 'SUPER', reward: 0, reward_type: 'super', segment_color: '#ff1744', weight: 4 },
        { rate_type: 'premium_tier3', segment_label: 'Thank You', reward: 0, reward_type: 'thanks', segment_color: '#7f8c8d', weight: 34 }
    ];
    
    try {
        for (const rate of defaultRates) {
            await pools[0].query(
                `INSERT INTO spin_rates (rate_type, segment_label, reward, reward_type, segment_color, weight) 
                 VALUES ($1,$2,$3,$4,$5,$6) 
                 ON CONFLICT (rate_type, segment_label) DO NOTHING`,
                [rate.rate_type, rate.segment_label, rate.reward, rate.reward_type, rate.segment_color, rate.weight]
            );
        }
        console.log('✅ Default spin rates initialized');
    } catch(e) {
        console.log('⚠️ Default spin rates error:', e.message);
    }
}
initDefaultSpinRates();

// ==================== SPIN RATES API ====================

// Get all spin rates (for game.html)
app.get('/api/spin_rates', async (req, res) => {
    try {
        const p = await getPool();
        const r = await p.query('SELECT * FROM spin_rates ORDER BY rate_type, id ASC');
        
        const rates = {};
        r.rows.forEach(row => {
            if (!rates[row.rate_type]) rates[row.rate_type] = [];
            rates[row.rate_type].push({
                label: row.segment_label,
                color: row.segment_color,
                reward: parseFloat(row.reward),
                type: row.reward_type,
                weight: row.weight
            });
        });
        
        res.json({ success: true, rates });
    } catch(e) {
        res.json({ success: false, rates: {} });
    }
});

// Admin: Get all spin rates for editing
app.get('/api/admin/spin_rates', async (req, res) => {
    try {
        const p = await getPool();
        const r = await p.query('SELECT * FROM spin_rates ORDER BY rate_type, id ASC');
        res.json({ success: true, rates: r.rows });
    } catch(e) {
        res.json({ success: false, rates: [] });
    }
});

// Admin: Save spin rates
app.post('/api/admin/spin_rates/save', async (req, res) => {
    const { rates } = req.body;
    
    if (!rates || !Array.isArray(rates)) {
        return res.json({ success: false, message: 'Invalid data' });
    }
    
    try {
        const p = await getPool();
        
        for (const rate of rates) {
            await p.query(
                `UPDATE spin_rates SET weight = $1, updated_at = NOW() 
                 WHERE rate_type = $2 AND segment_label = $3`,
                [rate.weight, rate.rate_type, rate.segment_label]
            );
        }
        
        console.log('[SPIN RATES] ✅ Updated by admin');
        res.json({ success: true, message: 'Rates updated successfully!' });
    } catch(e) {
        console.error('[SPIN RATES ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});

// ╔══════════════════════════════════════════════════════════════╗
// ║              PROMO CODE SYSTEM                              ║
// ╚══════════════════════════════════════════════════════════════╝

// ==================== CREATE PROMO CODES TABLE ====================
async function createPromoCodesTable() {
    const query = `
        CREATE TABLE IF NOT EXISTS promo_codes (
            id SERIAL PRIMARY KEY,
            api_key VARCHAR(64) UNIQUE NOT NULL,
            amount DECIMAL DEFAULT 0,
            currency VARCHAR(10) DEFAULT 'MMK',
            used BOOLEAN DEFAULT false,
            used_by INT,
            used_at TIMESTAMP,
            expiry_date DATE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
    try {
        await pools[0].query(query);
        await pools[1].query(query);
        console.log('✅ promo_codes table ready');
    } catch(e) {
        console.log('⚠️ promo_codes table error:', e.message);
    }
}
createPromoCodesTable();

// Promo Code fixed price
const PROMO_CODE_PRICE = 700; // 700 Ks per code

// ==================== ADMIN: CREATE PROMO CODE ====================
app.post('/api/admin/promo_code/create', async (req, res) => {
    const { api_key, amount, currency, expiry_date } = req.body;
    
    if (!api_key || !amount) {
        return res.json({ success: false, message: 'API Key and Amount required' });
    }
    
    try {
        const p = await getPool();
        
        await p.query(
            `INSERT INTO promo_codes (api_key, amount, currency, expiry_date) 
             VALUES ($1, $2, $3, $4)`,
            [api_key, parseFloat(amount), currency || 'MMK', expiry_date || null]
        );
        
        res.json({ success: true, message: 'Promo code created!' });
        
    } catch(e) {
        res.json({ success: false, message: 'Server error: ' + e.message });
    }
});

// ==================== ADMIN: GET ALL PROMO CODES ====================
app.get('/api/admin/promo_codes', async (req, res) => {
    try {
        const p = await getPool();
        const r = await p.query('SELECT * FROM promo_codes ORDER BY id DESC');
        res.json({ success: true, codes: r.rows });
    } catch(e) {
        res.json({ success: false, codes: [] });
    }
});

// ==================== ADMIN: DELETE PROMO CODE ====================
app.post('/api/admin/promo_code/delete', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.json({ success: false, message: 'ID required' });
    
    try {
        const p = await await getPool();
        await p.query('DELETE FROM promo_codes WHERE id = $1', [id]);
        res.json({ success: true, message: 'Deleted!' });
    } catch(e) {
        res.json({ success: false, message: 'Server error' });
    }
});

// ==================== BUY PROMO CODE (FROM BUY CODE PAGE) ====================
app.post('/api/buy_promo_code', async (req, res) => {
    const { token, codeId } = req.body;
    
    if (!token || !codeId) return res.json({ success: false, message: 'Missing data' });
    
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        if (isNaN(uid)) return res.json({ success: false, message: 'Invalid token' });
        
        // Get promo code
        const code = await p.query(
            "SELECT * FROM promo_codes WHERE id = $1 AND used = false AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)",
            [codeId]
        );
        
        if (code.rows.length === 0) {
            return res.json({ success: false, message: 'Promo code not available' });
        }
        
        const c = code.rows[0];
        
        // Check balance
        const user = await p.query('SELECT balance FROM auth_users WHERE id=$1', [uid]);
        if (user.rows.length === 0) return res.json({ success: false, message: 'User not found' });
        
        const balance = parseFloat(user.rows[0].balance || 0);
        if (balance < PROMO_CODE_PRICE) {
            return res.json({ success: false, message: 'Insufficient balance. Need ' + PROMO_CODE_PRICE + ' Ks' });
        }
        
        // ✅ Don't mark as used yet! User must redeem first
        // await p.query('UPDATE promo_codes SET used = true, used_by = $1, used_at = NOW() WHERE id = $2', [uid, c.id]);
        
        // ✅ Just deduct balance and mark as SOLD (but not redeemed)
        await p.query('UPDATE promo_codes SET used = true WHERE id = $1', [c.id]);
        
        // Deduct balance
        await p.query('UPDATE auth_users SET balance = balance - $1 WHERE id = $2', [PROMO_CODE_PRICE, uid]);
        
        const newBalance = balance - PROMO_CODE_PRICE;
        
        res.json({
            success: true,
            code: c.api_key,
            amount: c.amount,
            currency: c.currency,
            balance: newBalance
        });
        
    } catch(e) {
        console.error('[BUY PROMO CODE ERROR]', e);
        res.json({ success: false, message: 'Server error' });
    }
});

// ==================== REDEEM PROMO CODE (FROM CONTACT PAGE) - FIXED ====================
app.post('/api/redeem_promo', async (req, res) => {
    const { token, promo_code } = req.body;
    
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    if (!promo_code) return res.json({ success: false, message: 'Promo code required' });
    
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        
        // ✅ Case-insensitive
        const promoCode = promo_code.toUpperCase();
        
        // ✅ 1. Check if code exists and is SOLD (used=true) but NOT REDEEMED (used_by IS NULL)
        const code = await p.query(
            "SELECT * FROM promo_codes WHERE UPPER(api_key) = $1 AND used = true AND used_by IS NULL AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)",
            [promoCode]
        );
        
        if (code.rows.length > 0) {
            // ✅ Code found - user can redeem it (one time only)
            const c = code.rows[0];
            
            // Mark as redeemed by this user
            await p.query('UPDATE promo_codes SET used_by = $1, used_at = NOW() WHERE id = $2', [uid, c.id]);
            
            // Add balance
            if (c.currency === 'USD') {
                await p.query('UPDATE auth_users SET usd_balance = COALESCE(usd_balance,0) + $1 WHERE id = $2', [c.amount, uid]);
            } else {
                await p.query('UPDATE auth_users SET balance = COALESCE(balance,0) + $1 WHERE id = $2', [c.amount, uid]);
            }
            
            const updatedUser = await p.query('SELECT balance, usd_balance FROM auth_users WHERE id = $1', [uid]);
            
            return res.json({
                success: true,
                message: `✅ အောင်မြင်ပါသည်! ${c.amount.toLocaleString()} ${c.currency} ရရှိပါပြီ`,
                amount: c.amount,
                currency: c.currency,
                balance: parseFloat(updatedUser.rows[0]?.balance || 0),
                usd_balance: parseFloat(updatedUser.rows[0]?.usd_balance || 0)
            });
        }
        
        // ✅ 2. Check if code is already redeemed (used=true AND used_by IS NOT NULL)
        const redeemedCheck = await p.query(
            "SELECT * FROM promo_codes WHERE UPPER(api_key) = $1 AND used = true AND used_by IS NOT NULL",
            [promoCode]
        );
        
        if (redeemedCheck.rows.length > 0) {
            return res.json({ success: false, message: 'Code ကိုအသုံးပြုပြီးပါပြီ (တစ်ကြိမ်ပဲသုံးလို့ရပါသည်)' });
        }
        
        // ✅ 3. Check if code exists but not sold yet
        const unsoldCheck = await p.query(
            "SELECT * FROM promo_codes WHERE UPPER(api_key) = $1 AND used = false",
            [promoCode]
        );
        
        if (unsoldCheck.rows.length > 0) {
            return res.json({ success: false, message: 'Code မှားယွင်းနေပါသည်' });
        }
        
        // ✅ 4. Check expired
        const expiredCheck = await p.query(
            "SELECT * FROM promo_codes WHERE UPPER(api_key) = $1 AND expiry_date < CURRENT_DATE",
            [promoCode]
        );
        
        if (expiredCheck.rows.length > 0) {
            return res.json({ success: false, message: 'Code သက်တမ်းကုန်သွားပါပြီ' });
        }
        
        return res.json({ success: false, message: 'Code မှားယွင်းနေပါသည်' });
        
    } catch(e) {
        console.error('[REDEEM PROMO ERROR]', e);
        res.json({ success: false, message: 'Server error' });
    }
});

console.log('✅ Promo Code System Ready');

// ====================================
// DAILY CHECK-IN EVENT MANAGEMENT (ADMIN)
// ====================================

// Get all check-in events
app.get('/api/admin/checkin_events', async (req, res) => {
    try {
        const p = await getPool();
        const events = await p.query('SELECT * FROM daily_checkin_events ORDER BY id DESC');
        
        // Get rewards for each event
        for (let event of events.rows) {
            const rewards = await p.query(
                'SELECT * FROM daily_checkin_rewards WHERE event_id=$1 ORDER BY day_number ASC',
                [event.id]
            );
            event.rewards = rewards.rows;
        }
        
        res.json({ success: true, events: events.rows });
    } catch(e) {
        res.json({ success: false, events: [] });
    }
});

// Create check-in event
app.post('/api/admin/checkin_event/create', async (req, res) => {
    const { event_type, event_name, start_date, start_time, total_days, rewards } = req.body;
    
    if (!event_type || !start_date || !total_days) {
        return res.json({ success: false, message: 'Missing required fields' });
    }
    
    try {
        const p = await getPool();
        
        // Calculate end date (total_days + 2 extra days)
        const startDate = new Date(start_date);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + parseInt(total_days) + 2);
        
        const result = await p.query(
            `INSERT INTO daily_checkin_events 
            (event_type, event_name, start_date, start_time, end_date, total_days) 
            VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
            [
                event_type,
                event_name || (event_type === 'normal' ? 'Normal Daily Check-In' : 'Premium Daily Check-In'),
                start_date,
                start_time || '00:00:00',
                endDate.toISOString().split('T')[0],
                parseInt(total_days)
            ]
        );
        
        const eventId = result.rows[0].id;
        
        // Insert rewards
        if (rewards && Array.isArray(rewards)) {
            for (const reward of rewards) {
                await p.query(
                    `INSERT INTO daily_checkin_rewards 
                    (event_id, day_number, reward_type, reward_amount, reward_label, icon_url) 
                    VALUES ($1,$2,$3,$4,$5,$6)`,
                    [
                        eventId,
                        reward.day,
                        reward.type,
                        parseFloat(reward.amount) || 0,
                        reward.label || '',
                        reward.icon || ''
                    ]
                );
            }
        }
        
        res.json({ success: true, message: 'Event created!', event_id: eventId });
    } catch(e) {
        res.json({ success: false, message: 'Server error: ' + e.message });
    }
});

// Edit check-in event (before it starts)
app.post('/api/admin/checkin_event/edit', async (req, res) => {
    const { event_id, event_name, start_date, start_time, total_days, rewards } = req.body;
    
    if (!event_id) return res.json({ success: false, message: 'Event ID required' });
    
    try {
        const p = await getPool();
        
        // Check if event already started
        const event = await p.query('SELECT * FROM daily_checkin_events WHERE id=$1', [event_id]);
        if (event.rows.length === 0) return res.json({ success: false, message: 'Event not found' });
        
        const evt = event.rows[0];
        const now = new Date();
        const eventStart = new Date(evt.start_date + 'T' + (evt.start_time || '00:00:00'));
        
        if (eventStart <= now) {
            return res.json({ success: false, message: 'စတင်ပြီးသား Event ကို ပြင်ဆင်၍မရပါ' });
        }
        
        // Update event
        const endDate = new Date(start_date || evt.start_date);
        endDate.setDate(endDate.getDate() + parseInt(total_days || evt.total_days) + 2);
        
        await p.query(
            `UPDATE daily_checkin_events SET 
            event_name=$1, start_date=$2, start_time=$3, end_date=$4, total_days=$5, updated_at=NOW()
            WHERE id=$6`,
            [
                event_name || evt.event_name,
                start_date || evt.start_date,
                start_time || evt.start_time,
                endDate.toISOString().split('T')[0],
                parseInt(total_days) || evt.total_days,
                event_id
            ]
        );
        
        // Update rewards if provided
        if (rewards && Array.isArray(rewards)) {
            await p.query('DELETE FROM daily_checkin_rewards WHERE event_id=$1', [event_id]);
            for (const reward of rewards) {
                await p.query(
                    `INSERT INTO daily_checkin_rewards 
                    (event_id, day_number, reward_type, reward_amount, reward_label, icon_url) 
                    VALUES ($1,$2,$3,$4,$5,$6)`,
                    [event_id, reward.day, reward.type, parseFloat(reward.amount) || 0, reward.label || '', reward.icon || '']
                );
            }
        }
        
        res.json({ success: true, message: 'Event updated!' });
    } catch(e) {
        res.json({ success: false, message: 'Server error: ' + e.message });
    }
});

// Cancel/Delete check-in event (only if not started)
app.post('/api/admin/checkin_event/cancel', async (req, res) => {
    const { event_id } = req.body;
    if (!event_id) return res.json({ success: false, message: 'Event ID required' });
    
    try {
        const p = await getPool();
        
        const event = await p.query('SELECT * FROM daily_checkin_events WHERE id=$1', [event_id]);
        if (event.rows.length === 0) return res.json({ success: false, message: 'Event not found' });
        
        const evt = event.rows[0];
        const now = new Date();
        const eventStart = new Date(evt.start_date + 'T' + (evt.start_time || '00:00:00'));
        
        if (eventStart <= now) {
            return res.json({ success: false, message: 'စတင်ပြီးသား Event ကို ဖျက်၍မရပါ' });
        }
        
        await p.query('UPDATE daily_checkin_events SET cancelled=true, is_active=false WHERE id=$1', [event_id]);
        res.json({ success: true, message: 'Event cancelled!' });
    } catch(e) {
        res.json({ success: false, message: 'Server error' });
    }
});
 // ====================================
// DAILY CHECK-IN USER APIs
// ====================================
// ==================== DAILY CHECK-IN STATUS (WITH GRACE PERIOD) ====================
app.post('/api/daily_checkin/status', async (req, res) => {
    const { token } = req.body;
    
    if (!token || token === 'guest') {
        return res.json({ success: false, events: [] });
    }
    
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        if (isNaN(uid)) return res.json({ success: false, events: [] });
        
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        
        // ✅ Premium Status Check
        const userRes = await p.query('SELECT premium_expiry, premium_tier FROM auth_users WHERE id=$1', [uid]);
        const isPremium = userRes.rows.length > 0 && userRes.rows[0].premium_expiry && new Date(userRes.rows[0].premium_expiry) > now;
        
        // ✅ Active Events (Grace Period အတွင်းကိုပါ ပြမယ်)
        const events = await p.query(
            `SELECT * FROM daily_checkin_events 
             WHERE is_active = true 
             AND (
                 end_date >= $1 
                 OR end_date >= $2  -- Grace Period ၂ ရက်
             )
             AND (event_type = 'normal' OR (event_type = 'premium' AND $3 = true))
             ORDER BY id DESC`,
            [todayStr, 
             new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],  // ၂ ရက် Grace
             isPremium]
        );
        
        const result = [];
        
        for (const ev of events.rows) {
            const endDate = new Date(ev.end_date);
            const graceEndDate = new Date(endDate.getTime() + 2 * 24 * 60 * 60 * 1000); // +၂ ရက်
            const isGracePeriod = now > endDate && now <= graceEndDate;
            const isFullyEnded = now > graceEndDate;
            
            // ✅ အပြီးတိုင်ပြီးရင် မပြတော့ဘူး
            if (isFullyEnded) continue;
            
            // ✅ Grace Period အတွင်း Day ကို မတိုးတော့ဘူး
            const effectiveEndDate = isGracePeriod ? endDate.toISOString().split('T')[0] : todayStr;
            
            // Get user progress
            const progress = await p.query(
                "SELECT * FROM daily_checkin_progress WHERE user_id=$1 AND event_id=$2",
                [uid, ev.id]
            );
            
            let currentDay = progress.rows.length > 0 ? progress.rows[0].current_day : 1;
            
            // ✅ Grace Period မှာ current_day က end_date အထိပဲ ပြမယ်
            if (isGracePeriod && currentDay > ev.total_days) {
                currentDay = ev.total_days;
            }
            
            // Check if checked in today
            const todayCheck = await p.query(
                "SELECT * FROM daily_checkin_claims WHERE user_id=$1 AND event_id=$2 AND claim_date = CURRENT_DATE",
                [uid, ev.id]
            );
            
            const checkedInToday = todayCheck.rows.length > 0;
            
            // ✅ Grace Period မှာ Claim မရတော့ဘူး
            const canClaim = !isGracePeriod && !checkedInToday && currentDay <= ev.total_days;
            
            // Get rewards
            const rewards = await p.query(
                "SELECT * FROM daily_checkin_rewards WHERE event_id=$1 ORDER BY day_number ASC",
                [ev.id]
            );
            
            const dayStatus = [];
            for (let d = 1; d <= ev.total_days; d++) {
                const dayClaims = await p.query(
                    "SELECT * FROM daily_checkin_claims WHERE user_id=$1 AND event_id=$2 AND day_number=$3",
                    [uid, ev.id, d]
                );
                
                const reward = rewards.rows.find(r => r.day_number === d);
                
                dayStatus.push({
                    day: d,
                    claimed: dayClaims.rows.length > 0,
                    reward: reward ? {
                        type: reward.reward_type,
                        amount: parseFloat(reward.reward_amount),
                        label: reward.reward_label || '',
                        icon: reward.reward_icon || ''
                    } : null
                });
            }
            
            result.push({
                event_id: ev.id,
                event_name: ev.event_name,
                event_type: ev.event_type,
                start_date: ev.start_date,
                end_date: ev.end_date,
                grace_end_date: graceEndDate.toISOString().split('T')[0],
                is_grace_period: isGracePeriod,
                is_fully_ended: isFullyEnded,
                total_days: ev.total_days,
                current_day: currentDay,
                checked_in_today: checkedInToday,
                can_claim: canClaim,
                reset_time: ev.reset_time || '00:00',
                day_status: dayStatus
            });
        }
        
        res.json({ success: true, events: result });
        
    } catch(e) {
        console.error('[CHECKIN STATUS ERROR]', e.message);
        res.json({ success: false, events: [] });
    }
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
// ====================================
// INITIALIZE DEFAULT CHECK-IN EVENTS
// ====================================
async function initDefaultCheckinEvents() {
    let retries = 5;
    let tableReady = false;
    
    while (retries > 0) {
        try {
            const existing = await pools[0].query('SELECT COUNT(*) FROM daily_checkin_events');
            if (parseInt(existing.rows[0].count) > 0) {
                console.log('Check-in events already exist');
                return;
            }
            tableReady = true;
            break;
        } catch(e) {
            retries--;
            console.log('Waiting for tables... (' + retries + ' retries left)');
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    
    if (!tableReady) {
        console.log('Could not verify tables, skipping default events');
        return;
    }
    
    try {
        const normalEndDate = new Date();
        normalEndDate.setDate(normalEndDate.getDate() + 9);
        
        const normalEvent = await pools[0].query(
            'INSERT INTO daily_checkin_events (event_type, event_name, start_date, start_time, end_date, end_time, total_days) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
            ['normal', 'Normal Daily Check-In', new Date().toISOString().split('T')[0], '00:00:00', normalEndDate.toISOString().split('T')[0], '14:30:00', 7]
        );
        
        const normalRewards = [
            { day: 1, type: 'spin', amount: 1, label: '1 Draw Spin', icon: 'GIFT' },
            { day: 2, type: 'mmk', amount: 100, label: '100 Ks', icon: 'MONEY' },
            { day: 3, type: 'mmk', amount: 150, label: '150 Ks', icon: 'MONEY' },
            { day: 4, type: 'usd', amount: 0.05, label: '$0.05 USD', icon: 'USD' },
            { day: 5, type: 'spin', amount: 1, label: '1 Draw Spin', icon: 'SPIN' },
            { day: 6, type: 'usd', amount: 0.10, label: '$0.10 USD', icon: 'USD' },
            { day: 7, type: 'mmk', amount: 300, label: '300 Ks', icon: 'STAR' }
        ];
        
        for (const r of normalRewards) {
            await pools[0].query(
                'INSERT INTO daily_checkin_rewards (event_id, day_number, reward_type, reward_amount, reward_label, icon_url) VALUES ($1,$2,$3,$4,$5,$6)',
                [normalEvent.rows[0].id, r.day, r.type, r.amount, r.label, r.icon]
            );
        }
        
        console.log('Normal check-in event created');
        
        // Skip DB2 if not needed
        try {
            const normalEvent2 = await pools[1].query(
                'INSERT INTO daily_checkin_events (event_type, event_name, start_date, start_time, end_date, end_time, total_days) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
                ['normal', 'Normal Daily Check-In', new Date().toISOString().split('T')[0], '00:00:00', normalEndDate.toISOString().split('T')[0], '14:30:00', 7]
            );
            for (const r of normalRewards) {
                await pools[1].query(
                    'INSERT INTO daily_checkin_rewards (event_id, day_number, reward_type, reward_amount, reward_label, icon_url) VALUES ($1,$2,$3,$4,$5,$6)',
                    [normalEvent2.rows[0].id, r.day, r.type, r.amount, r.label, r.icon]
                );
            }
        } catch(e) {}
        
        console.log('Default check-in events ready');
        
    } catch(e) {
        console.log('Default check-in events error:', e.message);
    }
}

// Default Events
setTimeout(() => { initDefaultCheckinEvents(); }, 3000);
// ====================================
// REUSE EXISTING CHECK-IN EVENT
// ====================================
app.post('/api/admin/checkin_event/reuse', async (req, res) => {
    const { event_id, start_date, start_time } = req.body;
    
    if (!event_id || !start_date) {
        return res.json({ success: false, message: 'Event ID and Start Date required' });
    }
    
    try {
        const p = await getPool();
        
        // Get original event
        const original = await p.query('SELECT * FROM daily_checkin_events WHERE id=$1', [event_id]);
        if (original.rows.length === 0) {
            return res.json({ success: false, message: 'Original event not found' });
        }
        
        const orig = original.rows[0];
        
        // Calculate new end date
        const startDate = new Date(start_date);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + parseInt(orig.total_days) + 2);
        
        // Create new event with same settings
        const newEvent = await p.query(
            `INSERT INTO daily_checkin_events 
            (event_type, event_name, start_date, start_time, end_date, end_time, total_days) 
            VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
            [
                orig.event_type,
                orig.event_name,
                start_date,
                start_time || orig.start_time,
                endDate.toISOString().split('T')[0],
                orig.end_time || '14:30:00',
                orig.total_days
            ]
        );
        
        const newEventId = newEvent.rows[0].id;
        
        // Copy rewards from original event
        const originalRewards = await p.query(
            'SELECT * FROM daily_checkin_rewards WHERE event_id=$1 ORDER BY day_number ASC',
            [event_id]
        );
        
        for (const reward of originalRewards.rows) {
            await p.query(
                `INSERT INTO daily_checkin_rewards 
                (event_id, day_number, reward_type, reward_amount, reward_label, icon_url) 
                VALUES ($1,$2,$3,$4,$5,$6)`,
                [
                    newEventId,
                    reward.day_number,
                    reward.reward_type,
                    reward.reward_amount,
                    reward.reward_label,
                    reward.icon_url
                ]
            );
        }
        
        res.json({ 
            success: true, 
            message: 'Event reused! New event created.', 
            new_event_id: newEventId,
            start_date: start_date,
            end_date: endDate.toISOString().split('T')[0]
        });
    } catch(e) {
        res.json({ success: false, message: 'Server error: ' + e.message });
    }
});

// Get past events (for reuse)
app.get('/api/admin/checkin_events/past', async (req, res) => {
    try {
        const p = await getPool();
        const today = new Date().toISOString().split('T')[0];
        
        const events = await p.query(
            `SELECT * FROM daily_checkin_events 
            WHERE end_date < $1 AND cancelled = false 
            ORDER BY end_date DESC LIMIT 20`,
            [today]
        );
        
        res.json({ success: true, events: events.rows });
    } catch(e) {
        res.json({ success: false, events: [] });
    }
});
// ==================== ADMIN: USERS WITH LOGIN INFO ====================
app.get('/api/admin/users_with_logins', async (req, res) => {
    try {
        const p = await getPool();
        
        const r = await p.query(`
            SELECT 
                u.id, u.username, u.email, u.phone, u.login_type, 
                u.balance, u.usd_balance, u.premium_expiry, u.premium_tier,
                u.last_login, u.created_at as registered_at,
                (SELECT COUNT(*) FROM device_sessions ds WHERE ds.user_id = u.id AND ds.is_active = true AND ds.last_activity > NOW() - INTERVAL '7 days') as active_devices,
                (SELECT login_at FROM login_history lh WHERE lh.user_id = u.id ORDER BY lh.login_at DESC LIMIT 1) as last_login_time,
                (SELECT CONCAT(COALESCE(device_brand,''), ' ', COALESCE(device_model,''), ' • ', COALESCE(browser,'')) FROM login_history lh WHERE lh.user_id = u.id AND device_brand IS NOT NULL ORDER BY lh.login_at DESC LIMIT 1) as last_device,
                (SELECT ip_address FROM login_history lh WHERE lh.user_id = u.id ORDER BY lh.login_at DESC LIMIT 1) as last_ip,
                (SELECT COUNT(*) FROM login_history lh WHERE lh.user_id = u.id) as total_logins
            FROM auth_users u
            ORDER BY u.last_login DESC NULLS LAST
            LIMIT 100
        `);
        
        res.json({ success: true, users: r.rows });
    } catch(e) {
        console.error('[USERS WITH LOGINS ERROR]', e.message);
        res.json({ success: false, users: [] });
    }
});
// ╔══════════════════════════════════════════════════════════════╗
// ║              API KEY & RESELLER SYSTEM                      ║
// ╚══════════════════════════════════════════════════════════════╝

// ==================== CREATE RESELLER TABLES ====================
async function createResellerTables() {
    const queries = [
        `CREATE TABLE IF NOT EXISTS resellers (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            api_key VARCHAR(64) UNIQUE NOT NULL,
            balance DECIMAL DEFAULT 0,
            currency VARCHAR(10) DEFAULT 'MMK',
            markup_percent INT DEFAULT 0,
            status VARCHAR(20) DEFAULT 'active',
            expiry_date DATE,
            max_daily_transactions INT DEFAULT 50,
            rate_limit_per_min INT DEFAULT 60,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS reseller_transactions (
            id SERIAL PRIMARY KEY,
            reseller_id INT,
            reseller_name VARCHAR(100),
            action VARCHAR(50),
            amount DECIMAL,
            balance_after DECIMAL,
            currency VARCHAR(10) DEFAULT 'MMK',
            product VARCHAR(100),
            game_uid VARCHAR(50),
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS settings (
            key VARCHAR(50) PRIMARY KEY,
            value TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    ];
    
    try {
        for (const q of queries) {
            await pools[0].query(q).catch(() => {});
            await pools[1].query(q).catch(() => {});
        }
        console.log('✅ Reseller tables ready');
        
        // Add missing columns to existing resellers table
        const alterQueries = [
            `ALTER TABLE resellers ADD COLUMN IF NOT EXISTS expiry_date DATE`,
            `ALTER TABLE resellers ADD COLUMN IF NOT EXISTS max_daily_transactions INT DEFAULT 50`,
            `ALTER TABLE resellers ADD COLUMN IF NOT EXISTS rate_limit_per_min INT DEFAULT 60`
        ];
        
        for (const q of alterQueries) {
           await pools[0].query(q).catch(() => {});
await pools[1].query(q).catch(() => {}); 
        }
        
        // Init default exchange rate if not exists
        await pools[0].query(
            "INSERT INTO settings (key, value) VALUES ('exchange_rate', '3500') ON CONFLICT (key) DO NOTHING"
        ).catch(() => {});
        
    } catch(e) {
        console.log('⚠️ Reseller tables error:', e.message);
    }
}
createResellerTables();
// ==================== GENERATE API KEY ====================
function generateApiKey(prefix = 'sk_live') {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let key = prefix + '_';
    for (let i = 0; i < 32; i++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
}

// ==================== VERIFY API KEY MIDDLEWARE ====================
async function verifyApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
        return res.status(401).json({ success: false, message: 'API Key required' });
    }
    
    try {
        const p = await getPool();
        const r = await p.query(
            "SELECT * FROM resellers WHERE api_key = $1 AND status = 'active'",
            [apiKey]
        );
        
        if (r.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid or suspended API Key' });
        }
        
        const reseller = r.rows[0];
        
        // Check expiry date
        if (reseller.expiry_date) {
            const expiryDate = new Date(reseller.expiry_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            if (expiryDate < today) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'API Key has expired on ' + reseller.expiry_date 
                });
            }
        }
        
        // Check daily transaction limit
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayTxn = await p.query(
            "SELECT COUNT(*) as cnt FROM reseller_transactions WHERE reseller_id=$1 AND created_at >= $2",
            [reseller.id, todayStart]
        );
        const txnCount = parseInt(todayTxn.rows[0]?.cnt || 0);
        
        if (txnCount >= reseller.max_daily_transactions) {
            return res.status(429).json({ 
                success: false, 
                message: 'Daily transaction limit reached (' + reseller.max_daily_transactions + ')' 
            });
        }
        
        req.reseller = reseller;
        next();
    } catch(e) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
}
// ==================== EXCHANGE RATE API ====================

// Get exchange rate (public)
app.get('/api/exchange_rate', async (req, res) => {
    try {
        const p = await getPool();
        const r = await p.query("SELECT value FROM settings WHERE key = 'exchange_rate'");
        const rate = r.rows.length > 0 ? parseInt(r.rows[0].value) : 3500;
        res.json({ success: true, rate: rate });
    } catch(e) {
        res.json({ success: true, rate: 3500 });
    }
});

// Admin: Update exchange rate
app.post('/api/admin/exchange_rate', async (req, res) => {
    const { rate } = req.body;
    if (!rate || rate < 1) return res.json({ success: false, message: 'Invalid rate' });
    
    try {
        const p = await getPool();
        await p.query(
            "INSERT INTO settings (key, value, updated_at) VALUES ('exchange_rate', $1, NOW()) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()",
            [rate.toString()]
        );
        res.json({ success: true, message: 'Exchange rate updated!' });
    } catch(e) {
        res.json({ success: false, message: 'Server error' });
    }
});

// ==================== ADMIN RESELLER MANAGEMENT ====================

// Get all resellers
app.get('/api/admin/resellers', async (req, res) => {
    try {
        const p = await getPool();
        const r = await p.query('SELECT * FROM resellers ORDER BY id DESC');
        res.json({ success: true, resellers: r.rows });
    } catch(e) {
        res.json({ success: false, resellers: [] });
    }
});

// Create reseller
app.post('/api/admin/reseller/create', async (req, res) => {
    const { name, currency, markup_percent, initial_balance, expiry_date, max_daily, rate_limit } = req.body;
    
    if (!name) return res.json({ success: false, message: 'Reseller name required' });
    
    try {
        const p = await getPool();
        const apiKey = generateApiKey();
        const currency_type = currency || 'MMK';
        const markup = parseInt(markup_percent) || 0;
        const balance = parseFloat(initial_balance) || 0;
        const expiry = expiry_date || null;
        const dailyMax = parseInt(max_daily) || 50;
        const rate = parseInt(rate_limit) || 60;
        
        await p.query(
            `INSERT INTO resellers (name, api_key, balance, currency, markup_percent, expiry_date, max_daily_transactions, rate_limit_per_min) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [name, apiKey, balance, currency_type, markup, expiry, dailyMax, rate]
        );
        
        res.json({ 
            success: true, 
            message: 'Reseller created!',
            api_key: apiKey,
            expiry_date: expiry
        });
        
    } catch(e) {
        res.json({ success: false, message: 'Server error' });
    }
});

// Edit reseller
app.post('/api/admin/reseller/edit', async (req, res) => {
    const { id, name, currency, markup_percent, status, expiry_date, max_daily, rate_limit } = req.body;
    
    if (!id) return res.json({ success: false, message: 'Reseller ID required' });
    
    try {
        const p = await getPool();
        
        if (name) await p.query('UPDATE resellers SET name=$1 WHERE id=$2', [name, id]);
        if (currency) await p.query('UPDATE resellers SET currency=$1 WHERE id=$2', [currency, id]);
        if (markup_percent !== undefined) await p.query('UPDATE resellers SET markup_percent=$1 WHERE id=$2', [parseInt(markup_percent), id]);
        if (status) await p.query('UPDATE resellers SET status=$1 WHERE id=$2', [status, id]);
        if (expiry_date !== undefined) await p.query('UPDATE resellers SET expiry_date=$1 WHERE id=$2', [expiry_date, id]);
        if (max_daily !== undefined) await p.query('UPDATE resellers SET max_daily_transactions=$1 WHERE id=$2', [parseInt(max_daily), id]);
        if (rate_limit !== undefined) await p.query('UPDATE resellers SET rate_limit_per_min=$1 WHERE id=$2', [parseInt(rate_limit), id]);
        
        await p.query('UPDATE resellers SET updated_at=NOW() WHERE id=$1', [id]);
        
        res.json({ success: true, message: 'Reseller updated!' });
    } catch(e) {
        res.json({ success: false, message: 'Server error' });
    }
});

// Add balance to reseller
app.post('/api/admin/reseller/add_balance', async (req, res) => {
    const { id, amount, currency } = req.body;
    
    if (!id || !amount || amount <= 0) return res.json({ success: false, message: 'Invalid amount' });
    
    try {
        const p = await getPool();
        
        const reseller = await p.query('SELECT * FROM resellers WHERE id=$1', [id]);
        if (reseller.rows.length === 0) return res.json({ success: false, message: 'Reseller not found' });
        
        const r = reseller.rows[0];
        const cur = currency || r.currency;
        const newBalance = parseFloat(r.balance) + parseFloat(amount);
        
        await p.query('UPDATE resellers SET balance=$1 WHERE id=$2', [newBalance, id]);
        
        // Log transaction
        await p.query(
            `INSERT INTO reseller_transactions (reseller_id, reseller_name, action, amount, balance_after, currency) 
             VALUES ($1, $2, 'top_up', $3, $4, $5)`,
            [id, r.name, amount, newBalance, cur]
        );
        
        res.json({ success: true, message: 'Balance added!', new_balance: newBalance });
    } catch(e) {
        res.json({ success: false, message: 'Server error' });
    }
});

// Reset API Key
app.post('/api/admin/reseller/reset_key', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.json({ success: false, message: 'Reseller ID required' });
    
    try {
        const p = await getPool();
        const newKey = generateApiKey();
        await p.query('UPDATE resellers SET api_key=$1, updated_at=NOW() WHERE id=$2', [newKey, id]);
        
        res.json({ success: true, message: 'API Key reset!', api_key: newKey });
    } catch(e) {
        res.json({ success: false, message: 'Server error' });
    }
});

// Delete reseller
app.post('/api/admin/reseller/delete', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.json({ success: false, message: 'Reseller ID required' });
    
    try {
        const p = await getPool();
        await p.query('DELETE FROM resellers WHERE id=$1', [id]);
        res.json({ success: true, message: 'Reseller deleted!' });
    } catch(e) {
        res.json({ success: false, message: 'Server error' });
    }
});

// Get reseller transactions
app.get('/api/admin/reseller/transactions', async (req, res) => {
    try {
        const p = await getPool();
        const r = await p.query(
            'SELECT * FROM reseller_transactions ORDER BY id DESC LIMIT 50'
        );
        res.json({ success: true, transactions: r.rows });
    } catch(e) {
        res.json({ success: false, transactions: [] });
    }
});

// ==================== RESELLER API ENDPOINTS ====================

// Check balance
app.post('/api/reseller/balance', verifyApiKey, async (req, res) => {
    const r = req.reseller;
    res.json({
        success: true,
        reseller: r.name,
        balance: parseFloat(r.balance),
        currency: r.currency,
        markup_percent: r.markup_percent
    });
});

// Buy code/diamond
app.post('/api/reseller/buy', verifyApiKey, async (req, res) => {
    const r = req.reseller;
    const { game_uid, server_id, product, amount } = req.body;
    
    if (!game_uid || !product) {
        return res.json({ success: false, message: 'game_uid and product required' });
    }
    
    try {
        const p = await getPool();
        
        // Determine price based on product
        let price = 0;
        let productName = product;
        
        // Check if product is a redeem code category
        const cat = REDEEM_CATEGORIES.find(c => c.id === product);
        if (cat) {
            price = cat.price;
            
            // Check code availability
            const codeCheck = await p.query(
                'SELECT * FROM redeem_codes WHERE category=$1 AND used=false ORDER BY id ASC LIMIT 1',
                [product]
            );
            
            if (codeCheck.rows.length === 0) {
                return res.json({ success: false, message: 'No codes available for this product' });
            }
            
        } else if (product.startsWith('diamond_')) {
            // Diamond product
            const diamondAmount = parseInt(product.replace('diamond_', ''));
            price = diamondAmount * 50; // 50 Ks per diamond (adjust as needed)
            productName = `${diamondAmount} Diamonds`;
        } else {
            return res.json({ success: false, message: 'Invalid product' });
        }
        
        // Apply markup
        const finalPrice = price + (price * r.markup_percent / 100);
        
        // Check balance
        if (parseFloat(r.balance) < finalPrice) {
            return res.json({ 
                success: false, 
                message: 'Insufficient balance',
                required: finalPrice,
                balance: parseFloat(r.balance)
            });
        }
        
        // Deduct balance
        const newBalance = parseFloat(r.balance) - finalPrice;
        await p.query('UPDATE resellers SET balance=$1 WHERE id=$2', [newBalance, r.id]);
        
        // Mark code as used if it's a redeem code
        if (cat) {
            const codeCheck = await p.query(
                'SELECT * FROM redeem_codes WHERE category=$1 AND used=false ORDER BY id ASC LIMIT 1',
                [product]
            );
            if (codeCheck.rows.length > 0) {
                await p.query('UPDATE redeem_codes SET used=true, used_by=0, used_at=NOW() WHERE id=$1', [codeCheck.rows[0].id]);
            }
        }
        
        // Log transaction
        await p.query(
            `INSERT INTO reseller_transactions (reseller_id, reseller_name, action, amount, balance_after, currency, product, game_uid) 
             VALUES ($1, $2, 'buy', $3, $4, $5, $6, $7)`,
            [r.id, r.name, -finalPrice, newBalance, r.currency, productName, game_uid]
        );
        
        res.json({
            success: true,
            message: `Product ${productName} purchased successfully!`,
            transaction_id: 'TXN-' + Date.now(),
            product: productName,
            price: finalPrice,
            remaining_balance: newBalance
        });
        
    } catch(e) {
        res.json({ success: false, message: 'Server error' });
    }
});

// Transaction history for reseller
app.post('/api/reseller/transactions', verifyApiKey, async (req, res) => {
    const r = req.reseller;
    
    try {
        const p = await getPool();
        const txn = await p.query(
            'SELECT * FROM reseller_transactions WHERE reseller_id=$1 ORDER BY id DESC LIMIT 30',
            [r.id]
        );
        
        res.json({ success: true, transactions: txn.rows });
    } catch(e) {
        res.json({ success: false, transactions: [] });
    }
});

console.log('✅ API Key & Reseller System Ready');

// ==================== LEADERBOARD API ====================
app.get('/api/leaderboard/top_spenders', async (req, res) => {
    try {
        const p = await getPool();
        
        // Active users only: balance > 0, not banned, not guest, logged in within 30 days
        const r = await p.query(`
            SELECT 
                u.username, 
                u.email, 
                COALESCE(SUM(CASE WHEN o.amount > 0 AND o.status = 'approved' THEN o.amount ELSE 0 END), 0) as total_spent,
                COUNT(CASE WHEN o.status = 'approved' THEN 1 END) as total_orders
            FROM auth_users u
            LEFT JOIN orders o ON u.id = o.user_id
            WHERE u.login_type != 'guest'
              AND u.id NOT IN (SELECT user_id::INT FROM banned_users)
              AND u.last_login > NOW() - INTERVAL '30 days'
              AND u.balance > 0
            GROUP BY u.id, u.username, u.email
            HAVING COALESCE(SUM(CASE WHEN o.amount > 0 AND o.status = 'approved' THEN o.amount ELSE 0 END), 0) > 0
            ORDER BY total_spent DESC
            LIMIT 10
        `);
        
        res.json({ success: true, leaders: r.rows });
        
    } catch(e) {
        console.error('[LEADERBOARD ERROR]', e.message);
        res.json({ success: false, leaders: [] });
    }
});
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
app.get('/game.html', (req, res) => res.sendFile(path.join(__dirname, 'game.html')));
app.get('/exchange.html', (req, res) => servePageWithCheck(req, res, 'exchange', 'exchange.html'));
// Initialize tables on all 5 databases
pools.forEach(pool => {
    initTables(pool);
});

// ==================== SOCKET.IO + SERVER START ====================
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Online users tracking
const onlineUsers = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // User joins chat
    socket.on('join', (data) => {
        const { userId, username } = data;
        socket.userId = userId;
        socket.username = username;
        onlineUsers.set(userId, { socketId: socket.id, username, online: true });
        io.emit('online_users', Array.from(onlineUsers.values()));
    });
    
    // Join room
    socket.on('join_room', (roomId) => {
        socket.join('room_' + roomId);
    });
    
    // Send message
    socket.on('send_message', async (data) => {
        const { roomId, message, userId, username } = data;
        try {
            const p = await getPool();
            const result = await p.query(
                `INSERT INTO chat_messages (room_id, sender_id, username, message) VALUES ($1,$2,$3,$4) RETURNING id, created_at`,
                [roomId, userId, username, message]
            );
            const msgData = {
                id: result.rows[0].id,
                roomId, userId, username, message,
                created_at: result.rows[0].created_at
            };
            io.to('room_' + roomId).emit('new_message', msgData);
        } catch(e) {
            console.error('Message save error:', e.message);
        }
    });
    
    // Typing
    socket.on('typing', (data) => {
        socket.to('room_' + data.roomId).emit('user_typing', {
            userId: data.userId,
            username: data.username
        });
    });
    
    // Disconnect
    socket.on('disconnect', () => {
        if (socket.userId) {
            onlineUsers.delete(socket.userId);
            io.emit('online_users', Array.from(onlineUsers.values()));
        }
        console.log('User disconnected:', socket.id);
    });
});

// ==================== CHAT API ROUTES ====================
// Get user's rooms
app.post('/api/chat/rooms', async (req, res) => {
    const { token } = req.body;
    if (!token || token === 'guest') return res.json({ rooms: [] });
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        const r = await p.query(`
            SELECT cr.*, 
                (SELECT COUNT(*) FROM chat_messages cm WHERE cm.room_id = cr.id AND cm.is_read = false AND cm.sender_id != $1) as unread
            FROM chat_rooms cr
            JOIN chat_participants cp ON cr.id = cp.room_id
            WHERE cp.user_id = $1
            ORDER BY cr.id DESC
        `, [uid]);
        res.json({ success: true, rooms: r.rows });
    } catch(e) { res.json({ success: false, rooms: [] }); }
});

// Get messages
app.get('/api/chat/messages/:roomId', async (req, res) => {
    const { roomId } = req.params;
    try {
        const p = await getPool();
        const r = await p.query(
            'SELECT * FROM chat_messages WHERE room_id = $1 ORDER BY id ASC LIMIT 50',
            [roomId]
        );
        res.json({ success: true, messages: r.rows });
    } catch(e) { res.json({ success: false, messages: [] }); }
});

// Create admin room (User -> Admin)
app.post('/api/chat/create_admin_room', async (req, res) => {
    const { token } = req.body;
    if (!token || token === 'guest') return res.json({ success: false });
    
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        const uname = (await p.query('SELECT username FROM auth_users WHERE id=$1', [uid])).rows[0]?.username || 'User';
        
        // ✅ Check if admin exists (user_id = 1)
        const adminCheck = await p.query('SELECT id FROM auth_users WHERE id = 1');
        if (adminCheck.rows.length === 0) {
            // Create admin account if not exists
            await p.query(
                `INSERT INTO auth_users (id, username, email, login_type) VALUES (1, 'Admin', 'admin@sologame.com', 'local') 
                 ON CONFLICT (id) DO NOTHING`
            );
        }
        
        // ✅ Check if room already exists
        const existingRoom = await p.query(
            `SELECT cr.id FROM chat_rooms cr 
             JOIN chat_participants cp ON cr.id = cp.room_id 
             WHERE cr.room_type = 'admin' AND cp.user_id = $1`,
            [uid]
        );
        
        if (existingRoom.rows.length > 0) {
            return res.json({ 
                success: true, 
                room: { 
                    id: existingRoom.rows[0].id, 
                    room_name: uname + ' - Admin', 
                    room_type: 'admin' 
                } 
            });
        }
        
        // Create new room
        const room = await p.query(
            "INSERT INTO chat_rooms (room_name, room_type, created_by) VALUES ($1, 'admin', $2) RETURNING id",
            [uname + ' - Admin', uid]
        );
        const roomId = room.rows[0].id;
        
        // Add participants (user + admin)
        await p.query('INSERT INTO chat_participants (room_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [roomId, uid]);
        await p.query('INSERT INTO chat_participants (room_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [roomId, 1]); // Admin ID=1
        
        res.json({ 
            success: true, 
            room: { 
                id: roomId, 
                room_name: uname + ' - Admin', 
                room_type: 'admin' 
            } 
        });
        
    } catch(e) {
        console.error('[CREATE ADMIN ROOM ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});

// Mark messages as read
app.post('/api/chat/read', async (req, res) => {
    const { roomId, userId } = req.body;
    try {
        const p = await getPool();
        await p.query('UPDATE chat_messages SET is_read = true WHERE room_id = $1 AND sender_id != $2', [roomId, userId]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

// Get unread count
app.post('/api/chat/unread', async (req, res) => {
    const { token } = req.body;
    if (!token || token === 'guest') return res.json({ count: 0 });
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        const r = await p.query(
            `SELECT COUNT(*) as cnt FROM chat_messages cm 
             JOIN chat_participants cp ON cm.room_id = cp.room_id 
             WHERE cp.user_id = $1 AND cm.sender_id != $1 AND cm.is_read = false`,
            [uid]
        );
        res.json({ count: parseInt(r.rows[0].cnt) });
    } catch(e) { res.json({ count: 0 }); }
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`DB: 5 Pools Auto-Switch (DB1~DB5)`);
    console.log(`Page Control: ${ALL_PAGES.length} pages`);
    console.log(`Chat: Socket.io Ready`);
    console.log(`Bot: Enhanced Long Polling`);
    console.log(`Redeem Codes: ${REDEEM_CATEGORIES.length} categories`);
});
