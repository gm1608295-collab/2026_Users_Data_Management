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
setInterval(() => { https.get(`https://two026-users-data-management.onrender.com/api/ping`, (res) => {}); }, 600000);
app.get('/api/ping', (req, res) => { res.json({ success: true, time: new Date().toISOString() }); });

// ==================== DATABASE ====================
const DB1 = 'postgresql://neondb_owner:npg_3lq1dLYxvgVX@ep-misty-base-amkxcayc-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require';
const DB2 = 'postgresql://neondb_owner:npg_6RwnXBl5LKQt@ep-damp-sea-a46t7qil-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require';

const pool1 = new Pool({ connectionString: DB1, ssl: { rejectUnauthorized: false }, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
const pool2 = new Pool({ connectionString: DB2, ssl: { rejectUnauthorized: false }, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });

let currentPool = pool1;
let pool1Active = true;

async function getPool() {
    try { await currentPool.query('SELECT 1'); return currentPool; }
    catch(e) { console.log('DB Switch:', e.message); currentPool = pool1Active ? pool2 : pool1; pool1Active = !pool1Active; return currentPool; }
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
    
    return { name: deviceName.trim(), type: deviceType, brand: device.vendor || os.name || 'Unknown', model: device.model || os.version || 'Unknown', browser: browser.name || 'Unknown', browserVersion: browser.version || '', osName: os.name || 'Unknown', osVersion: os.version || '', isMobile };
}

// ==================== LOGIN TRACKING ====================
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
        
        // Save device session
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
        const notificationSound = sound || 'notification';
        const notificationTitle = title || 'SOLO M Game Shop';
        
        const data = JSON.stringify({ 
            app_id: ONESIGNAL_APP_ID, 
            included_segments: ["All"], 
            contents: { en: msg }, 
            headings: { en: notificationTitle },
            android_sound: notificationSound,
            ios_sound: notificationSound + ".wav",
            android_channel_id: "solom-notification-channel",
            small_icon: "ic_stat_onesignal_default",
            large_icon: "https://two026-users-data-management.onrender.com/icons/icon-192.png",
            priority: 10,
            ttl: 3600
        }); 
        
        const req = https.request({ 
            hostname: 'onesignal.com', 
            path: '/api/v1/notifications', 
            method: 'POST', 
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Basic ${ONESIGNAL_API_KEY}` 
            } 
        }); 
        req.write(data); 
        req.end(); 
    } catch(e) { console.error('[ONESIGNAL ERROR]', e.message); } 
}

// ==================== REDEEM CATEGORIES ====================
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
        `CREATE TABLE IF NOT EXISTS auth_users (id SERIAL PRIMARY KEY, username VARCHAR(100), email VARCHAR(200), phone VARCHAR(50), password VARCHAR(255), google_id VARCHAR(200), login_type VARCHAR(10) DEFAULT 'local', avatar VARCHAR(500), gmail_pass VARCHAR(100) DEFAULT 'DoubleMK2008', mlbb_pass VARCHAR(100) DEFAULT 'GlobalMK2008', tiktok_pass VARCHAR(100) DEFAULT 'DoubleMK2008', balance DECIMAL DEFAULT 0, usd_balance DECIMAL DEFAULT 0, premium_expiry TIMESTAMP, paid_spins INT DEFAULT 0, premium_tier INT DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, last_login TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS login_history (id SERIAL PRIMARY KEY, user_id INT NOT NULL, username VARCHAR(100), login_type VARCHAR(20), ip_address VARCHAR(50), device_info VARCHAR(300), device_type VARCHAR(50), device_brand VARCHAR(100), device_model VARCHAR(100), browser VARCHAR(50), is_mobile BOOLEAN DEFAULT false, user_agent TEXT, login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS device_sessions (id SERIAL PRIMARY KEY, user_id INT NOT NULL, token VARCHAR(200) NOT NULL, device_name VARCHAR(300), device_type VARCHAR(50), device_brand VARCHAR(100), device_model VARCHAR(100), browser VARCHAR(50), ip_address VARCHAR(50), user_agent TEXT, is_active BOOLEAN DEFAULT true, last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, token))`,
        `CREATE TABLE IF NOT EXISTS notices (id SERIAL PRIMARY KEY, message TEXT, color VARCHAR(20) DEFAULT '#ffffff', created_by VARCHAR(100), notice_type VARCHAR(20) DEFAULT 'dashboard', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS slider_images (id SERIAL PRIMARY KEY, image_urls TEXT DEFAULT '[]', updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS bg_music (id SERIAL PRIMARY KEY, music_urls TEXT DEFAULT '[]', updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS videos (id SERIAL PRIMARY KEY, video_url TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS page_status (page_id VARCHAR(50) PRIMARY KEY, status VARCHAR(5) DEFAULT 'on', updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS banned_users (user_id VARCHAR(100) PRIMARY KEY, banned_by VARCHAR(100), banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, user_id INT, username VARCHAR(100), amount DECIMAL, payment_method VARCHAR(50), screenshot TEXT, status VARCHAR(20) DEFAULT 'pending', submitted_user_id VARCHAR(20), reject_reason TEXT DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS redeem_codes (id SERIAL PRIMARY KEY, category VARCHAR(50), code VARCHAR(100), used BOOLEAN DEFAULT false, used_by INT, used_at TIMESTAMP, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS used_codes (code VARCHAR(100) PRIMARY KEY, user_id INT, used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS otp_codes (id SERIAL PRIMARY KEY, user_id INT, code VARCHAR(6), expires_at TIMESTAMP, used BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS user_security_pass (user_id INT PRIMARY KEY, security_password VARCHAR(100), set_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS spin_history (id SERIAL PRIMARY KEY, user_id INT, reward_type VARCHAR(50), reward_amount DECIMAL DEFAULT 0, segment_label VARCHAR(50), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS premium_draws (user_id INT, draw_date DATE, draw_count INT DEFAULT 1, PRIMARY KEY(user_id, draw_date))`,
        `CREATE TABLE IF NOT EXISTS weekly_bonus (id SERIAL PRIMARY KEY, user_id INT, claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS daily_checkin_events (id SERIAL PRIMARY KEY, event_type VARCHAR(20) NOT NULL DEFAULT 'normal', event_name VARCHAR(100), start_date DATE NOT NULL, start_time TIME DEFAULT '00:00:00', end_date DATE, end_time TIME DEFAULT '14:30:00', total_days INT NOT NULL DEFAULT 7, is_active BOOLEAN DEFAULT true, cancelled BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS daily_checkin_rewards (id SERIAL PRIMARY KEY, event_id INT REFERENCES daily_checkin_events(id) ON DELETE CASCADE, day_number INT NOT NULL, reward_type VARCHAR(20) NOT NULL, reward_amount DECIMAL(10,2) DEFAULT 0, reward_label VARCHAR(100), icon_url VARCHAR(500), UNIQUE(event_id, day_number))`,
        `CREATE TABLE IF NOT EXISTS daily_checkins (id SERIAL PRIMARY KEY, user_id INT NOT NULL, event_id INT REFERENCES daily_checkin_events(id) ON DELETE CASCADE, checkin_date DATE NOT NULL DEFAULT CURRENT_DATE, day_number INT NOT NULL, reward_type VARCHAR(20), reward_amount DECIMAL(10,2) DEFAULT 0, claimed BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, event_id, checkin_date))`
    ];
    
    for (const q of queries) { 
        await p.query(q).catch(e => console.log('Table create:', e.message)); 
    }
}
initTables(pool1);
initTables(pool2);

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
        await pool1.query(query);
        await pool2.query(query);
        console.log('[OK] spin_history_v2 table created');
    } catch(e) {
        console.log('[WARN] spin_history_v2 table error:', e.message);
    }
}
createSpinHistoryV2Table();
