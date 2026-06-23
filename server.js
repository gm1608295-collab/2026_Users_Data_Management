// ==================== TIME ZONE ====================
process.env.TZ = 'Asia/Yangon';
console.log('🕐 Server Timezone:', process.env.TZ);

const bcrypt = require('bcrypt');
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(__dirname));

const cookieParser = require('cookie-parser');
app.use(cookieParser());
// ==================== AUTO WAKE-UP ====================
setInterval(() => { https.get(`https://solo-m-store-security-system-and-user.onrender.com/api/ping`, (res) => {}); }, 600000);
app.get('/api/ping', (req, res) => { res.json({ success: true, time: new Date().toISOString() }); });

// ==================== DATABASE - 5 POOLS AUTO-SWITCH ====================
// ဒီအတိုင်း ပြန်ထည့်ပါ
const DB1 = 'postgresql://neondb_owner:npg_3lq1dLYxvgVX@ep-misty-base-amkxcayc-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require';
const DB2 = 'postgresql://neondb_owner:npg_6RwnXBl5LKQt@ep-damp-sea-a46t7qil-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require';
const DB3 = 'postgresql://neondb_owner:npg_LVD3pNxhd1vi@ep-withered-violet-aprnlbey-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require';
const DB4 = 'postgresql://neondb_owner:npg_ntqgkA5OVL8P@ep-noisy-resonance-aqy8odea-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';
const DB5 = 'postgresql://neondb_owner:npg_KuFVvHic4m0Y@ep-orange-paper-aqn9ak7c-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';
const pools = [
    new Pool({ connectionString: DB1, ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 30000 }),
    new Pool({ connectionString: DB2, ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 30000 }),
    new Pool({ connectionString: DB3, ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 30000 }),
    new Pool({ connectionString: DB4, ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 30000 }),
    new Pool({ connectionString: DB5, ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 30000 })
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
// IP Address ရယူရန် Helper Function
function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
        || req.socket?.remoteAddress 
        || req.ip 
        || '0.0.0.0';
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
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;
const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
const TIKTOK_REDIRECT = 'https://solo-m-store-security-system-and-user.onrender.com/auth/tiktok/callback';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT = process.env.GOOGLE_REDIRECT || 'https://solo-m-store-security-system-and-user.onrender.com/auth/google/callback';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const TELEGRAM_PAYMENT_TOKEN = process.env.TELEGRAM_PAYMENT_TOKEN;
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;
const ADMIN_PASSWORD_HASH = '$2b$10$XeN/2HtPBf4DLh1.SjNKmuUzpjCRjhEa.wwknw6enjJc5a27l7ZkK';
// EmailJS Config
const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;

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
            large_icon: "https://solo-m-store-security-system-and-user.onrender.com/icons/icon-192.png",
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
// ==================== JWT CONFIG ====================
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'solom-game-shop-secret-key-2026';

// Generate JWT Token
function generateToken(user) {
    return jwt.sign(
        { 
            userId: user.id, 
            username: user.username, 
            email: user.email,
            login_type: user.login_type 
        },
        JWT_SECRET,
        { expiresIn: '30d' }  // 30 ရက် သက်တမ်း
    );
}

// Verify JWT Token (Middleware)
function verifyToken(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch(e) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
}
// ==================== REDEEM CATEGORIES (Hardcoded Prices) ====================
const REDEEM_CATEGORIES = [
    { id: 'shhh_emote', name: 'Shhh emote', icon: 'https://i.ibb.co/KprVCy87/icon-reward2-Q0a-Xg-C62.png', price: 2500 },
    { id: 'golden_border', name: 'Golden Month Border', icon: 'https://i.ibb.co/LXVHQfk3/icon-reward1-D7w-Nl-OTn.png', price: 3500 },
    { id: 'lucky_diamond', name: 'Lucky Diamond Code', icon: 'https://i.ibb.co/n8m2ZSgz/box4-7e338a9e.png', price: 500 },
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

        `CREATE TABLE IF NOT EXISTS otp_rate_limits (
    id SERIAL PRIMARY KEY,
    ip_address VARCHAR(100) NOT NULL,
    request_count INT DEFAULT 1,
    first_request_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_request_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
        
        // ========== GAME ==========
        `CREATE TABLE IF NOT EXISTS spin_history (id SERIAL PRIMARY KEY, user_id INT, reward_type VARCHAR(50), reward_amount DECIMAL DEFAULT 0, segment_label VARCHAR(50), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS spin_history_v2 (id SERIAL PRIMARY KEY, user_id INT NOT NULL, spin_source VARCHAR(20) NOT NULL, reward_type VARCHAR(20), reward_amount DECIMAL(10,2) DEFAULT 0, balance_before_mmk DECIMAL(10,2) DEFAULT 0, balance_after_mmk DECIMAL(10,2) DEFAULT 0, balance_before_usd DECIMAL(10,2) DEFAULT 0, balance_after_usd DECIMAL(10,2) DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        
        // ========== SPIN RATES ==========
        `CREATE TABLE IF NOT EXISTS spin_rates (id SERIAL PRIMARY KEY, rate_type VARCHAR(50) NOT NULL, segment_label VARCHAR(50) NOT NULL, reward DECIMAL(10,2) DEFAULT 0, reward_type VARCHAR(20) DEFAULT 'usd', segment_color VARCHAR(20) DEFAULT '#e74c3c', weight INT DEFAULT 10, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(rate_type, segment_label))`,
        
        // ========== PREMIUM ==========
        `CREATE TABLE IF NOT EXISTS premium_draws (user_id INT, draw_date DATE, draw_count INT DEFAULT 1, PRIMARY KEY(user_id, draw_date))`,
        `CREATE TABLE IF NOT EXISTS weekly_bonus (id SERIAL PRIMARY KEY, user_id INT, claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        
        // ========== PROMO CODES ==========
        `CREATE TABLE IF NOT EXISTS promo_codes (id SERIAL PRIMARY KEY, api_key VARCHAR(64) UNIQUE NOT NULL, amount DECIMAL DEFAULT 0, currency VARCHAR(10) DEFAULT 'MMK', used BOOLEAN DEFAULT false, used_by INT, used_at TIMESTAMP, expiry_date DATE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        
        // ========== RESELLER SYSTEM ==========
        `CREATE TABLE IF NOT EXISTS resellers (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, api_key VARCHAR(64) UNIQUE NOT NULL, balance DECIMAL DEFAULT 0, currency VARCHAR(10) DEFAULT 'MMK', markup_percent INT DEFAULT 0, status VARCHAR(20) DEFAULT 'active', expiry_date DATE, max_daily_transactions INT DEFAULT 50, rate_limit_per_min INT DEFAULT 60, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS reseller_transactions (id SERIAL PRIMARY KEY, reseller_id INT, reseller_name VARCHAR(100), action VARCHAR(50), amount DECIMAL, balance_after DECIMAL, currency VARCHAR(10) DEFAULT 'MMK', product VARCHAR(100), game_uid VARCHAR(50), details TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS settings (key VARCHAR(50) PRIMARY KEY, value TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        
        // ========== DAILY CHECK-IN SYSTEM ==========
        `CREATE TABLE IF NOT EXISTS daily_checkin_events (id SERIAL PRIMARY KEY, event_type VARCHAR(20) NOT NULL DEFAULT 'normal', event_name VARCHAR(100), start_date DATE NOT NULL, start_time TIME DEFAULT '00:00:00', end_date DATE, end_time TIME DEFAULT '14:30:00', total_days INT NOT NULL DEFAULT 7, is_active BOOLEAN DEFAULT true, cancelled BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS daily_checkin_rewards (id SERIAL PRIMARY KEY, event_id INT REFERENCES daily_checkin_events(id) ON DELETE CASCADE, day_number INT NOT NULL, reward_type VARCHAR(20) NOT NULL, reward_amount DECIMAL(10,2) DEFAULT 0, reward_label VARCHAR(100), icon_url VARCHAR(500), UNIQUE(event_id, day_number))`,
        `CREATE TABLE IF NOT EXISTS daily_checkins (id SERIAL PRIMARY KEY, user_id INT NOT NULL, event_id INT REFERENCES daily_checkin_events(id) ON DELETE CASCADE, checkin_date DATE NOT NULL DEFAULT CURRENT_DATE, day_number INT NOT NULL, reward_type VARCHAR(20), reward_amount DECIMAL(10,2) DEFAULT 0, claimed BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, event_id, checkin_date))`,
         `CREATE TABLE IF NOT EXISTS daily_checkin_progress (
    user_id INT NOT NULL,
    event_id INT NOT NULL,
    current_day INT DEFAULT 1,
    last_claim_date DATE,
    PRIMARY KEY (user_id, event_id)
)`,
    
  // Add this to initTables function
`CREATE TABLE IF NOT EXISTS force_update (
    id SERIAL PRIMARY KEY,
    is_active BOOLEAN DEFAULT false,
    message TEXT DEFAULT '📱 APK အသစ်ထွက်ရှိပြီးဖြစ်ပါသည်။ ကျေးဇူးပြု၍ အဆင့်မြှင့်တင်ပါရန်။',
    apk_url VARCHAR(500),
    version_code INT DEFAULT 1,
    version_name VARCHAR(50) DEFAULT '1.0.0',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
        
        // ========== CHAT SYSTEM ==========
`CREATE TABLE IF NOT EXISTS chat_rooms (
    id SERIAL PRIMARY KEY, 
    room_name VARCHAR(100) NOT NULL, 
    room_type VARCHAR(20) DEFAULT 'private', 
    created_by INT, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
`CREATE TABLE IF NOT EXISTS chat_participants (
    room_id INT NOT NULL, 
    user_id INT NOT NULL, 
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
    PRIMARY KEY (room_id, user_id)
)`,
`CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY, 
    room_id INT NOT NULL, 
    sender_id INT NOT NULL, 
    username VARCHAR(100), 
    message TEXT, 
    is_read BOOLEAN DEFAULT false, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
`CREATE TABLE IF NOT EXISTS chat_online_users (
    user_id INT PRIMARY KEY,
    socket_id VARCHAR(100),
    username VARCHAR(100),
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
//========== CHAT PREMIUM (NEW - Composite PK) ==========
`CREATE TABLE IF NOT EXISTS chat_premium (
    user_id INT NOT NULL,
    premium_tier INT NOT NULL,
    premium_expiry TIMESTAMP,
    purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, premium_tier)
)`,

        // ========== အောက်ပါ Code ကို queries array ထဲ (အဆုံးပိုင်း) မှာထည့်ပါ ==========

// Add password hash columns if not exist (for One-Time Password System)
`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS gmail_pass_hash VARCHAR(255)`,
`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS mlbb_pass_hash VARCHAR(255)`,
`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS tiktok_pass_hash VARCHAR(255)`,
`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS passwords_generated BOOLEAN DEFAULT false`,
`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS passwords_viewed_at TIMESTAMP`,

        // ========== PASSWORD GENERATION COOLDOWN COLUMNS ==========
`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS last_password_gen TIMESTAMP`,
`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS password_gen_cooldown TIMESTAMP`,

        // ✅ Tab တစ်ခုချင်းစီအတွက် သီးသန့် Cooldown Columns
`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS gmail_last_gen TIMESTAMP`,
`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS gmail_gen_cooldown TIMESTAMP`,
`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS mlbb_last_gen TIMESTAMP`,
`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS mlbb_gen_cooldown TIMESTAMP`,
`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS tiktok_last_gen TIMESTAMP`,
`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS tiktok_gen_cooldown TIMESTAMP`,

        `CREATE TABLE IF NOT EXISTS user_gmail_data (
    id SERIAL PRIMARY KEY, user_id INT, name VARCHAR(200), emails TEXT,
    phones TEXT, password VARCHAR(200), dob VARCHAR(50),
    country VARCHAR(100), region VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
`CREATE TABLE IF NOT EXISTS user_mlbb_data (
    id SERIAL PRIMARY KEY, user_id INT, ingame_name VARCHAR(200), ingame_id VARCHAR(100),
    server_id VARCHAR(100), emails TEXT, password VARCHAR(200),
    dob VARCHAR(50), country VARCHAR(100), region VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
`CREATE TABLE IF NOT EXISTS user_tiktok_data (
    id SERIAL PRIMARY KEY, user_id INT, full_name VARCHAR(200), last_name VARCHAR(200),
    emails TEXT, phones TEXT, password VARCHAR(200),
    dob VARCHAR(50), country VARCHAR(100), region VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
    
`ALTER TABLE user_gmail_data ADD COLUMN IF NOT EXISTS title VARCHAR(200)`,
`ALTER TABLE user_mlbb_data ADD COLUMN IF NOT EXISTS title VARCHAR(200)`,
`ALTER TABLE user_tiktok_data ADD COLUMN IF NOT EXISTS title VARCHAR(200)`,

        // ========== ORDERS TABLE - ADD MISSING COLUMNS ==========
`ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_name TEXT`,
`ALTER TABLE orders ADD COLUMN IF NOT EXISTS game_id VARCHAR(50)`,
`ALTER TABLE orders ADD COLUMN IF NOT EXISTS server_id VARCHAR(50)`,
`ALTER TABLE orders ADD COLUMN IF NOT EXISTS player_id VARCHAR(50)`,

        // ✅ Add timer_end column to page_status
        `ALTER TABLE page_status ADD COLUMN IF NOT EXISTS timer_end TIMESTAMP`,

        // ========== ADD MISSING COLUMNS TO ORDERS TABLE ==========
`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type VARCHAR(50) DEFAULT 'topup'`,
`ALTER TABLE orders ADD COLUMN IF NOT EXISTS sender_premium_tier INT DEFAULT 0`,
      
        // ========== MONITORING SYSTEM TABLES & COLUMNS ==========
        `ALTER TABLE login_history ADD COLUMN IF NOT EXISTS country VARCHAR(100)`,
        `ALTER TABLE login_history ADD COLUMN IF NOT EXISTS city VARCHAR(100)`,
        `ALTER TABLE login_history ADD COLUMN IF NOT EXISTS isp VARCHAR(200)`,
        `ALTER TABLE device_sessions ADD COLUMN IF NOT EXISTS device_fingerprint VARCHAR(200)`,
        `CREATE TABLE IF NOT EXISTS blocked_ips (
            ip_address VARCHAR(50) PRIMARY KEY,
            blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS admin_activity_log (
            id SERIAL PRIMARY KEY,
            action VARCHAR(100),
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

        // ========== EVENTS TABLE ==========
`CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    subtitle TEXT,
    start_date DATE NOT NULL,
    end_date DATE,
    status VARCHAR(20) DEFAULT 'upcoming',
    action_link VARCHAR(500),
    action_text VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
        
        // ========== INDEXES ==========
        `CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON chat_messages(room_id)`,
        `CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id)`,
        `CREATE INDEX IF NOT EXISTS idx_chat_participants_user ON chat_participants(user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_spin_history_user ON spin_history_v2(user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`,
 
         `CREATE TABLE IF NOT EXISTS user_avatars (
            id SERIAL PRIMARY KEY,
            user_id INT UNIQUE NOT NULL,
            avatar_url TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS group_avatars (
            id SERIAL PRIMARY KEY,
            room_id INT UNIQUE NOT NULL,
            avatar_url TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `ALTER TABLE chat_participants ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'member'`,
        `CREATE TABLE IF NOT EXISTS group_reports (
            id SERIAL PRIMARY KEY,
            room_id INT NOT NULL,
            reported_by INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
    ];
    
    for (const q of queries) { 
        await p.query(q).catch(e => console.log('Table create error:', e.message)); 
    }
}
initTables(pools[0]);
initTables(pools[1]);
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
    { id: 'game', name: 'Lucky Spin' },
    { id: 'exchange', name: 'Exchange' },
    { id: 'chat', name: 'Chat' }
];

ALL_PAGES.forEach(async (pg) => {
    await pools[0].query("INSERT INTO page_status (page_id, status) VALUES ($1, 'on') ON CONFLICT (page_id) DO NOTHING", [pg.id]).catch(() => {});
    await pools[1].query("INSERT INTO page_status (page_id, status) VALUES ($1, 'on') ON CONFLICT (page_id) DO NOTHING", [pg.id]).catch(() => {});
});
// ============================================================
// MONITORING & SECURITY SYSTEM APIS (FULL HISTORY VERSION)
// ============================================================

// 1. Dashboard Stats (Today + Total Accounts)
app.post('/api/monitor/stats', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.json({ success: false });

    try {
        const p = await getPool();
        const today = new Date().toISOString().split('T')[0];

        // Total Registered Users
        const totalUsers = await p.query("SELECT COUNT(*) as cnt FROM auth_users");
        // Today's Logins
        const logins = await p.query("SELECT COUNT(*) as cnt FROM login_history WHERE DATE(login_at) = $1", [today]);
        // New Users Today
        const newUsers = await p.query("SELECT COUNT(*) as cnt FROM auth_users WHERE DATE(created_at) = $1", [today]);
        // Suspicious (Users with > 2 IPs in 24h)
        const suspicious = await p.query(`
            SELECT COUNT(DISTINCT user_id) as cnt
            FROM login_history 
            WHERE login_at > NOW() - INTERVAL '24 hours'
            GROUP BY user_id
            HAVING COUNT(DISTINCT ip_address) >= 2
        `);

        res.json({
            success: true,
            total_users: parseInt(totalUsers.rows[0].cnt),
            today_logins: parseInt(logins.rows[0].cnt),
            new_users: parseInt(newUsers.rows[0].cnt),
            suspicious_count: suspicious.rows.length
        });
    } catch(e) {
        res.json({ success: false, message: e.message });
    }
});

// 2. All User Activity Stream (Order by Last Login)
app.post('/api/monitor/all_users_activity', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.json({ success: false });

    try {
        const p = await getPool();
        // Get all users with their latest login info
        const result = await p.query(`
            SELECT 
                u.id,
                u.username,
                u.email,
                u.balance,
                u.created_at,
                MAX(lh.login_at) as last_login,
                COUNT(lh.id) as total_logins,
                COUNT(DISTINCT lh.ip_address) as unique_ips,
                COUNT(DISTINCT lh.device_info) as unique_devices,
                (SELECT device_info FROM login_history WHERE user_id = u.id ORDER BY login_at DESC LIMIT 1) as last_device,
                (SELECT ip_address FROM login_history WHERE user_id = u.id ORDER BY login_at DESC LIMIT 1) as last_ip,
                (SELECT browser FROM login_history WHERE user_id = u.id ORDER BY login_at DESC LIMIT 1) as last_browser
            FROM auth_users u
            LEFT JOIN login_history lh ON u.id = lh.user_id
            GROUP BY u.id, u.username, u.email, u.balance, u.created_at
            ORDER BY last_login DESC NULLS LAST
        `);
        res.json({ success: true, users: result.rows });
    } catch(e) {
        res.json({ success: false, users: [] });
    }
});

// 3. Full User Login History (Detailed View) - No changes, keep as is
app.post('/api/monitor/user_history', async (req, res) => {
    const { token, user_id } = req.body;
    if (!token || !user_id) return res.json({ success: false });

    try {
        const p = await getPool();
        const history = await p.query(`
            SELECT 
                login_at, 
                ip_address, 
                device_info, 
                device_type, 
                browser, 
                is_mobile,
                login_type
            FROM login_history 
            WHERE user_id = $1 
            ORDER BY login_at DESC 
            LIMIT 100
        `, [user_id]);
        res.json({ success: true, history: history.rows });
    } catch(e) {
        res.json({ success: false, history: [] });
    }
});
// ==================== PAGE TIMER SYSTEM (SERVER-SIDE) ====================

// Get page timer status (for user pages)
app.get('/api/page_timer/:pageId', async (req, res) => {
    const { pageId } = req.params;
    
    try {
        const p = await getPool();
        
        // Check if page is OFF with timer
        const status = await p.query(
            "SELECT status, timer_end FROM page_status WHERE page_id = $1",
            [pageId]
        );
        
        if (status.rows.length === 0) {
            return res.json({ success: true, status: 'on', timer_end: null });
        }
        
        const row = status.rows[0];
        const isOff = row.status === 'off';
        const timerEnd = row.timer_end ? new Date(row.timer_end) : null;
        const now = new Date();
        
        // If timer expired, auto-turn ON
        if (isOff && timerEnd && timerEnd <= now) {
            await p.query(
                "UPDATE page_status SET status = 'on', timer_end = NULL WHERE page_id = $1",
                [pageId]
            );
            return res.json({ success: true, status: 'on', timer_end: null });
        }
        
        res.json({
            success: true,
            status: row.status,
            timer_end: timerEnd ? timerEnd.toISOString() : null
        });
        
    } catch(e) {
        console.error('[PAGE TIMER ERROR]', e.message);
        res.json({ success: false, status: 'on', timer_end: null });
    }
});
// ============================================================
// MONITORING & SECURITY SYSTEM APIS (FULL VERSION - ALL FEATURES)
// ============================================================

// 1. GET IP GEOLOCATION (Country/City Detection)
async function getIPLocation(ip) {
    if (!ip || ip === '127.0.0.1' || ip === '::1') return { country: 'Localhost', city: 'Local' };
    try {
        const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city,isp,query`);
        const data = await res.json();
        if (data.status === 'success') {
            return { country: data.country, city: data.city, isp: data.isp };
        }
        return { country: 'Unknown', city: 'Unknown', isp: 'Unknown' };
    } catch(e) {
        return { country: 'Error', city: 'Error', isp: 'Error' };
    }
}

// 2. MODIFIED LOGIN TRACKING (To save Location and Device Fingerprint)
// Replace your existing trackLogin function with this one
async function trackLogin(userId, username, loginType, req) {
    try {
        const p = await getPool();
        const ua = req.headers['user-agent'] || '';
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
        const info = detectDevice(ua);
        
        // Get IP Location
        const location = await getIPLocation(ip);
        
        // Generate Simple Device Fingerprint
        const deviceFingerprint = 'dev_' + userId + '_' + ip.replace(/\./g, '_') + '_' + ua.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_');
        
        // Save login history (with new columns)
        await p.query(
            `INSERT INTO login_history (user_id, username, login_type, ip_address, device_info, device_type, device_brand, device_model, browser, is_mobile, user_agent, country, city, isp) 
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [userId, username, loginType, ip, info.name, info.type, info.brand, info.model, info.browser, info.isMobile, ua, location.country, location.city, location.isp]
        ).catch(e => console.log('Login history error:', e.message));
        
        // Save device session with fingerprint
        await p.query(
            `INSERT INTO device_sessions (user_id, token, device_name, device_type, device_brand, device_model, browser, ip_address, user_agent, device_fingerprint) 
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             ON CONFLICT (user_id, token) DO UPDATE SET last_activity=NOW(), is_active=true, ip_address=$8`,
            [userId, deviceFingerprint, info.name, info.type, info.brand, info.model, info.browser, ip, ua, deviceFingerprint]
        ).catch(e => console.log('Device session error:', e.message));
        
    } catch(e) {
        console.error('[LOGIN TRACK ERROR]', e.message);
    }
}

// 3. GET ADMIN ACTIVITY LOG
app.post('/api/monitor/admin_logs', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.json({ success: false });
    try {
        const p = await getPool();
        const logs = await p.query(`SELECT action, details, created_at FROM admin_activity_log ORDER BY created_at DESC LIMIT 50`);
        res.json({ success: true, logs: logs.rows });
    } catch(e) {
        res.json({ success: false, logs: [] });
    }
});

// 4. BLOCK / UNBLOCK IP ADDRESS
app.post('/api/monitor/block_ip', async (req, res) => {
    const { token, ip_address } = req.body;
    if (!token || !ip_address) return res.json({ success: false });
    try {
        const p = await getPool();
        await p.query(`INSERT INTO blocked_ips (ip_address) VALUES ($1) ON CONFLICT (ip_address) DO NOTHING`, [ip_address]);
        res.json({ success: true, message: 'IP Blocked!' });
    } catch(e) { res.json({ success: false }); }
});

app.post('/api/monitor/unblock_ip', async (req, res) => {
    const { token, ip_address } = req.body;
    if (!token || !ip_address) return res.json({ success: false });
    try {
        const p = await getPool();
        await p.query(`DELETE FROM blocked_ips WHERE ip_address = $1`, [ip_address]);
        res.json({ success: true, message: 'IP Unblocked!' });
    } catch(e) { res.json({ success: false }); }
});

// 5. ADMIN ACTION LOGGER (Call this in approve/reject functions)
async function logAdminAction(action, details) {
    try {
        const p = await getPool();
        await p.query(`INSERT INTO admin_activity_log (action, details) VALUES ($1, $2)`, [action, details]);
    } catch(e) {}
            }

// ==================== BAN CHECK MIDDLEWARE (UPDATED: IP BLOCK) ====================
async function banCheckMiddleware(req, res, next) {
    const protectedPages = [
        '/dashboard', '/topup.html', '/buycode.html', '/data.html', 
        '/history.html', '/password.html', '/recovery.html', 
        '/contact.html', '/game.html', '/exchange.html',
        '/chat.html', '/chatpremium.html', '/group.html', '/profile.html'
    ];
    
    const path = req.path;
    
    if (protectedPages.some(p => path === p || path.startsWith(p))) {
        const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
                        || req.socket?.remoteAddress 
                        || req.ip 
                        || '0.0.0.0';

        try {
            const p = await getPool();

            // ✅ 1. IP Address ကို အမြဲတမ်း စစ်ဆေးပါ (Token ရှိမရှိ မစစ်ပါနဲ့)
            const ipCheck = await p.query('SELECT * FROM blocked_ips WHERE ip_address = $1', [clientIP]);
            if (ipCheck.rows.length > 0) {
                // IP Block ခံထားရင် Login Page ပြန်ပို့ပါ
                console.log(`[IP BLOCK] Blocked IP attempted access: ${clientIP}`);
                return res.redirect('/?ip_banned=1');
            }

            // ✅ 2. User ID ကို စစ်ဆေးပါ (Token ရှိရင်)
            const token = req.cookies?.auth_token;
            if (token && token !== 'guest') {
                const uid = parseInt(token.replace('token_', ''));
                if (!isNaN(uid)) {
                    const r = await p.query('SELECT * FROM banned_users WHERE user_id = $1', [uid]);
                    if (r.rows.length > 0) {
                        return res.redirect('/?banned=1');
                    }
                }
            }
        } catch(e) {
            console.error('[BAN CHECK ERROR]', e.message);
        }
    }
    
    next();
}
// Admin: Set page timer (for admin panel)
app.post('/api/admin/set_page_timer', async (req, res) => {
    const { page_id, duration_seconds } = req.body;
    
    if (!page_id || !duration_seconds || duration_seconds <= 0) {
        return res.json({ success: false, message: 'Invalid parameters' });
    }
    
    try {
        const p = await getPool();
        
        // Calculate timer end time
        const timerEnd = new Date(Date.now() + (duration_seconds * 1000));
        
        // Update page status: OFF with timer
        await p.query(
            "INSERT INTO page_status (page_id, status, timer_end, updated_at) VALUES ($1, 'off', $2, NOW()) ON CONFLICT (page_id) DO UPDATE SET status = 'off', timer_end = $2, updated_at = NOW()",
            [page_id, timerEnd]
        );
        
        console.log('[PAGE TIMER] Set for', page_id, 'Duration:', duration_seconds, 's, Ends at:', timerEnd.toISOString());
        
        res.json({ 
            success: true, 
            message: 'Timer set!',
            timer_end: timerEnd.toISOString()
        });
        
    } catch(e) {
        console.error('[SET PAGE TIMER ERROR]', e.message);
        res.json({ success: false, message: 'Server error: ' + e.message });
    }
});

// Admin: Cancel page timer
app.post('/api/admin/cancel_page_timer', async (req, res) => {
    const { page_id } = req.body;
    
    if (!page_id) {
        return res.json({ success: false, message: 'Page ID required' });
    }
    
    try {
        const p = await getPool();
        
        // Turn ON and remove timer
        await p.query(
            "UPDATE page_status SET status = 'on', timer_end = NULL WHERE page_id = $1",
            [page_id]
        );
        
        console.log('[PAGE TIMER] Cancelled for', page_id);
        
        res.json({ success: true, message: 'Timer cancelled!' });
        
    } catch(e) {
        console.error('[CANCEL PAGE TIMER ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});

// Auto-check expired timers (run every 30 seconds)
async function autoCheckTimers() {
    try {
        const p = await getPool();
        const now = new Date();
        
        // Find expired timers
        const expired = await p.query(
            "SELECT page_id FROM page_status WHERE status = 'off' AND timer_end IS NOT NULL AND timer_end <= $1",
            [now]
        );
        
        for (const row of expired.rows) {
            await p.query(
                "UPDATE page_status SET status = 'on', timer_end = NULL WHERE page_id = $1",
                [row.page_id]
            );
            console.log('[AUTO TIMER] Page', row.page_id, 'auto-turned ON');
        }
        
    } catch(e) {
        console.error('[AUTO TIMER CHECK ERROR]', e.message);
    }
}

// Run auto-check every 30 seconds
setInterval(autoCheckTimers, 30000);

// ==================== EVENTS MANAGEMENT (ADMIN) ====================
// Get all events
app.get('/api/admin/events', async (req, res) => {
    try {
        const p = await getPool();
        const r = await p.query('SELECT * FROM events ORDER BY id DESC');
        res.json({ success: true, events: r.rows });
    } catch(e) {
        res.json({ success: false, events: [] });
    }
});

// Create new event
app.post('/api/admin/event/create', async (req, res) => {
    const { title, subtitle, start_date, end_date, status, action_link, action_text } = req.body;
    
    if (!title || !start_date) {
        return res.json({ success: false, message: 'Title and Start Date required' });
    }
    
    try {
        const p = await getPool();
        await p.query(
            `INSERT INTO events (title, subtitle, start_date, end_date, status, action_link, action_text) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [title, subtitle || '', start_date, end_date || null, status || 'upcoming', action_link || '', action_text || '']
        );
        res.json({ success: true, message: 'Event created!' });
    } catch(e) {
        res.json({ success: false, message: 'Server error: ' + e.message });
    }
});

// Delete event
app.post('/api/admin/event/delete', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.json({ success: false, message: 'ID required' });
    
    try {
        const p = await getPool();
        await p.query('DELETE FROM events WHERE id = $1', [id]);
        res.json({ success: true, message: 'Deleted!' });
    } catch(e) {
        res.json({ success: false, message: 'Server error' });
    }
});

// ==================== FORCE UPDATE SYSTEM ====================

// Get current force update status (for Dashboard)
app.get('/api/force_update/status', async (req, res) => {
    try {
        const p = await getPool();
        const r = await p.query(
            "SELECT is_active, message, apk_url, version_code, version_name, updated_at FROM force_update ORDER BY id DESC LIMIT 1"
        );
        
        if (r.rows.length > 0 && r.rows[0].is_active) {
            res.json({ 
                success: true, 
                is_active: true, 
                message: r.rows[0].message,
                apk_url: r.rows[0].apk_url,
                version_code: r.rows[0].version_code,
                version_name: r.rows[0].version_name,
                updated_at: r.rows[0].updated_at
            });
        } else {
            res.json({ success: true, is_active: false });
        }
    } catch(e) {
        console.error('[FORCE UPDATE STATUS ERROR]', e.message);
        res.json({ success: false, is_active: false });
    }
});

// Admin: Activate force update
app.post('/api/admin/force_update/activate', async (req, res) => {
    const { message, apk_url, version_code, version_name } = req.body;
    
    try {
        const p = await getPool();
        
        // Deactivate all first
        await p.query("UPDATE force_update SET is_active = false");
        
        // Insert new force update
        await p.query(
            `INSERT INTO force_update (is_active, message, apk_url, version_code, version_name, updated_at) 
             VALUES (true, $1, $2, $3, $4, NOW())`,
            [
                message || '📱 APK အသစ်ထွက်ရှိပြီးဖြစ်ပါသည်။ ကျေးဇူးပြု၍ အဆင့်မြှင့်တင်ပါရန်။',
                apk_url || 'https://drive.google.com/file/d/1M-htRNRJtRBPEpppPRAn84sIn0fXZSDS/view?usp=drivesdk',
                version_code || 1,
                version_name || '1.0.0'
            ]
        );
        
        // Optional: Send Telegram notification
        try {
            tgSend(`📱 Force Update Activated!\n📦 Version: ${version_name || '1.0.0'}\n🔗 ${apk_url || 'https://drive.google.com/file/d/1M-htRNRJtRBPEpppPRAn84sIn0fXZSDS/view?usp=drivesdk'}`);
        } catch(e) {}
        
        console.log('[FORCE UPDATE] Activated by admin');
        res.json({ success: true, message: 'Force update notification activated!' });
        
    } catch(e) {
        console.error('[FORCE UPDATE ACTIVATE ERROR]', e.message);
        res.json({ success: false, message: 'Server error: ' + e.message });
    }
});

// Admin: Deactivate force update
app.post('/api/admin/force_update/deactivate', async (req, res) => {
    try {
        const p = await getPool();
        await p.query("UPDATE force_update SET is_active = false");
        
        console.log('[FORCE UPDATE] Deactivated by admin');
        res.json({ success: true, message: 'Force update notification deactivated!' });
        
    } catch(e) {
        console.error('[FORCE UPDATE DEACTIVATE ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
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
        const r = await p.query(
            "SELECT id, username, email FROM auth_users WHERE email=$1 AND password=$2 AND login_type='local'", 
            [email, password]
        ); 
        
        if (r.rows.length === 0) {
            return res.json({ success: false, message: 'Invalid email or password' }); 
        }
        
        const u = r.rows[0];
        
        // ✅ JWT Token Generate
        const token = generateToken({ ...u, login_type: 'local' });
        
        res.json({ 
            success: true, 
            message: 'Password verified',
            token: token,  // ✅ JWT Token
            user: { id: u.id, username: u.username, email: u.email }
        }); 
    }
    catch(e) { 
        console.error('[LOGIN ERROR]', e.message);
        res.json({ success: false, message: 'Server error' }); 
    }
});

app.post('/api/register', async (req, res) => {
    const { username, email, phone, password } = req.body;
    if (!username || !email || !phone || !password) {
        return res.json({ success: false, message: 'All fields required' });
    }
    
    try {
        const p = await getPool();
        
        // Check existing
        const exist = await p.query('SELECT id FROM auth_users WHERE email=$1', [email]);
        if (exist.rows.length > 0) {
            return res.json({ success: false, message: 'Email exists' });
        }
        
        // Insert user
        await p.query(
            'INSERT INTO auth_users (username, email, phone, password, login_type) VALUES ($1,$2,$3,$4,$5)',
            [username, email, phone, password, 'local']
        );
        
        // ✅ QR Code Data (for recovery)
        const qrData = JSON.stringify({
            email: email,
            password: password,
            username: username
        });
        
        tgSend(`🆕 ${username}\n📧 ${email}`);
        
        res.json({
            success: true,
            qr_data: qrData  // ✅ QR Code ဖန်တီးဖို့ Data
        });
        
    } catch(e) {
        console.error('[REGISTER ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});
// Generate OTP
app.post('/api/otp/request', async (req, res) => {
    const { email } = req.body;
    const clientIP = getClientIP(req);  // ✅ IP ရယူ
    
    if (!email) {
        return res.json({ success: false, message: 'Email required' });
    }
    
    try {
        const p = await getPool();
        
        // Find user
        const user = await p.query(
            "SELECT id, username FROM auth_users WHERE email=$1 AND login_type='local'", 
            [email]
        );
        
        if (user.rows.length === 0) {
            return res.json({ success: false, message: 'ဒီ Email ဖြင့် အကောင့်မတွေ့ပါ' });
        }
        
        const uid = user.rows[0].id;
        
        // ========== ✅ IP-BASED RATE LIMIT CHECK ==========
        const ipCheck = await p.query(
            `SELECT COUNT(*) as count 
             FROM otp_rate_limits 
             WHERE ip_address = $1 
               AND last_request_at > NOW() - INTERVAL '15 minutes'`,
            [clientIP]
        );
        
        const requestCount = parseInt(ipCheck.rows[0]?.count || 0);
        
        if (requestCount >= 5) {
            return res.json({ 
                success: false, 
                message: 'OTP တောင်းခံမှု အကြိမ်ရေ များလွန်းပါသည်။ ၁၅ မိနစ်ခန့် စောင့်ဆိုင်းပါ။' 
            });
        }
        // ========== END IP RATE LIMIT CHECK ==========
        
        // OTP Rate Limit - 30 seconds
        const recentOtp = await p.query(
            "SELECT * FROM otp_codes WHERE user_id=$1 AND created_at > NOW() - INTERVAL '30 seconds'",
            [uid]
        );
        
        if (recentOtp.rows.length > 0) {
            return res.json({ success: false, message: 'စက္ကန့် ၃၀ အတွင်း OTP ပြန်တောင်းနိုင်ပါမည်' });
        }
        
        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Save OTP (expires in 90 seconds)
        await p.query(
            "INSERT INTO otp_codes (user_id, code, expires_at) VALUES ($1, $2, NOW() + INTERVAL '90 seconds')",
            [uid, otp]
        );
        
        // ========== ✅ IP RATE LIMIT RECORD UPDATE ==========
        if (requestCount > 0) {
            // Update existing record
            await p.query(
                `UPDATE otp_rate_limits 
                 SET request_count = request_count + 1, last_request_at = NOW() 
                 WHERE ip_address = $1 AND last_request_at > NOW() - INTERVAL '15 minutes'`,
                [clientIP]
            );
        } else {
            // Insert new record
            await p.query(
                `INSERT INTO otp_rate_limits (ip_address, request_count, first_request_at, last_request_at) 
                 VALUES ($1, 1, NOW(), NOW())`,
                [clientIP]
            );
        }
        // ========== END IP RATE LIMIT RECORD UPDATE ==========
        
        // Send OTP via EmailJS
        const emailSent = await sendOTPEmail(email, user.rows[0].username, otp);
        
        if (emailSent) {
            res.json({ 
                success: true, 
                message: 'OTP ကုဒ် သင့် Email သို့ ပို့ပြီးပါပြီ (၉၀ စက္ကန့်အတွင်း အသုံးပြုပါ)' 
            });
        } else {
            res.json({ success: false, message: 'Email ပို့ရန် မအောင်မြင်ပါ' });
        }
        
    } catch(e) {
        console.error('[OTP REQUEST ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});

// Verify OTP + Login
app.post('/api/otp/verify', async (req, res) => {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
        return res.json({ success: false, message: 'Email and OTP required' });
    }
    
    try {
        const p = await getPool();
        
        const user = await p.query("SELECT id, username FROM auth_users WHERE email=$1", [email]);
        
        if (user.rows.length === 0) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        const uid = user.rows[0].id;
        
        const otpCheck = await p.query(
            "SELECT * FROM otp_codes WHERE user_id=$1 AND code=$2 AND expires_at > NOW() AND used=false ORDER BY id DESC LIMIT 1",
            [uid, otp]
        );
        
        if (otpCheck.rows.length === 0) {
            return res.json({ success: false, message: 'OTP မှားယွင်းနေပါသည် သို့မဟုတ် သက်တမ်းကုန်သွားပါပြီ' });
        }
        
        await p.query('UPDATE otp_codes SET used=true WHERE id=$1', [otpCheck.rows[0].id]);
        await p.query('UPDATE otp_codes SET used=true WHERE user_id=$1 AND used=false', [uid]);
        await p.query('UPDATE auth_users SET last_login=NOW() WHERE id=$1', [uid]);
        
        trackLogin(uid, user.rows[0].username, 'local', req);
        
        // ✅ JWT Token Generate
        const token = generateToken({ 
            id: uid, 
            username: user.rows[0].username, 
            email: email, 
            login_type: 'local' 
        });
        
        res.json({
            success: true,
            token: token,  // ✅ JWT Token
            user: { id: uid, username: user.rows[0].username, email: email, login_type: 'local' }
        });
        
    } catch(e) {
        console.error('[OTP VERIFY ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});

// Check OTP Status
app.post('/api/otp/status', async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.json({ success: false, message: 'Email required' });
    }
    
    try {
        const p = await getPool();
        
        const user = await p.query("SELECT id FROM auth_users WHERE email=$1", [email]);
        if (user.rows.length === 0) {
            return res.json({ success: false, has_otp: false });
        }
        
        const uid = user.rows[0].id;
        
        const otp = await p.query(
            "SELECT expires_at FROM otp_codes WHERE user_id=$1 AND used=false AND expires_at > NOW() ORDER BY id DESC LIMIT 1",
            [uid]
        );
        
        if (otp.rows.length === 0) {
            return res.json({ success: true, has_otp: false, remaining_seconds: 0 });
        }
        
        const expiresAt = new Date(otp.rows[0].expires_at);
        const now = new Date();
        const remainingSeconds = Math.max(0, Math.floor((expiresAt - now) / 1000));
        
        res.json({
            success: true,
            has_otp: true,
            remaining_seconds: remainingSeconds
        });
        
    } catch(e) {
        console.error('[OTP STATUS ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});
// Send OTP Email via EmailJS
async function sendOTPEmail(email, username, otp) {
    try {
        const expiryTime = new Date(Date.now() + 90 * 1000);
        const timeStr = expiryTime.toLocaleTimeString('my-MM', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                service_id: EMAILJS_SERVICE_ID,
                template_id: EMAILJS_TEMPLATE_ID,
                user_id: EMAILJS_PUBLIC_KEY,
                template_params: {
                    to_name: username,
                    passcode: otp,
                    time: timeStr,
                    to_email: email
                }
            })
        });

        return response.ok;
    } catch(e) {
        console.error('[EMAIL ERROR]', e.message);
        return false;
    }
}
// =================== QR CODE DECODE (SERVER-SIDE) ===================
app.post('/api/decode_qr', async (req, res) => {
    const { image } = req.body;
    
    if (!image) {
        return res.json({ success: false, message: 'No image provided' });
    }
    
    try {
        // ✅ Base64 ကနေ Buffer ပြောင်း
        const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        
        // ✅ Jimp library သုံးပြီး QR Code ဖတ်မယ်
        const Jimp = require('jimp');
        const QrCode = require('qrcode-reader');
        
        const jimpImage = await Jimp.read(buffer);
        
        const qr = new QrCode();
        
        const qrData = await new Promise((resolve, reject) => {
            qr.callback = function(err, value) {
                if (err) {
                    reject(err);
                } else {
                    resolve(value.result);
                }
            };
            qr.decode(jimpImage.bitmap);
        });
        
        if (qrData) {
            // ✅ QR Code ဖတ်လို့ရပြီ
            try {
                var userData = JSON.parse(qrData);
                
                if (userData.email && userData.password) {
                    res.json({
                        success: true,
                        qr_data: qrData,
                        message: 'SOLO M QR Code detected'
                    });
                } else {
                    res.json({
                        success: false,
                        message: 'Not a SOLO M QR code'
                    });
                }
            } catch(e) {
                res.json({
                    success: false,
                    message: 'Invalid QR Code format'
                });
            }
        } else {
            res.json({
                success: false,
                message: 'No QR Code found'
            });
        }
        
    } catch(e) {
        console.error('[QR DECODE ERROR]', e.message);
        res.json({ success: false, message: 'Could not decode QR: ' + e.message });
    }
});

app.post('/api/logout', (req, res) => res.json({ success: true }));
app.post('/api/check_banned', async (req, res) => {
    try {
        const p = await getPool();
        const userId = req.body.userId;
        
        // ✅ userId ကို သေချာ parse လုပ်မယ်
        let uid = null;
        if (typeof userId === 'string') {
            // token_xxx ပုံစံ ဖယ်ရှား
            const cleaned = userId.replace('token_', '');
            if (/^\d+$/.test(cleaned)) {
                uid = parseInt(cleaned, 10);
            }
        } else if (typeof userId === 'number') {
            uid = userId;
        }
        
        if (uid === null || isNaN(uid)) {
            return res.json({ banned: false });
        }
        
        const r = await p.query('SELECT * FROM banned_users WHERE user_id = $1', [uid]);
        res.json({ banned: r.rows.length > 0 });
    } catch(e) {
        console.error('[CHECK BAN ERROR]', e.message);
        res.json({ banned: false });
    }
});
app.get('/api/admin/generate_hash', async (req, res) => {
    const password = 'MK2008';
    const hash = await bcrypt.hash(password, 10);
    res.json({ hash: hash });
});
app.post('/api/admin/verify', async (req, res) => {
    const { password } = req.body;
    const match = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    res.json({ success: match });
});
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


// ==================== GET USER DATA PASSWORDS (JWT VERSION) ====================
app.post('/api/get_passwords', async (req, res) => {
    const { token } = req.body;
    
    const defaults = { 
        gmail_password: 'DoubleMK2008', 
        mlbb_password: 'GlobalMK2008', 
        tiktok_password: 'DoubleMK2008' 
    };
    
    if (!token) {
        return res.json(defaults);
    }
    
    try {
        // ✅ JWT Verify
        const jwt = require('jsonwebtoken');
        const JWT_SECRET = process.env.JWT_SECRET || 'solom-game-shop-secret-key-2026';
        let decoded;
        
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch(e) {
            return res.json(defaults);
        }
        
        // ✅ userId ကို အရင်စစ်
        const uid = decoded.userId || decoded.id || decoded.uid;
        
        if (!uid) {
            return res.json(defaults);
        }
        
        const p = await getPool();
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
// ==================== NETWORK TEST APIs ====================

// Ping Test API
app.get('/api/ping', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ success: true, time: Date.now() });
});

// Download Speed Test API
app.get('/api/speedtest', (req, res) => {
    const size = parseInt(req.query.size) || 100 * 1024; // Default 100KB
    const maxSize = 5 * 1024 * 1024; // 5MB max
    
    const actualSize = Math.min(size, maxSize);
    const buffer = Buffer.alloc(actualSize);
    
    // Fill buffer with random data
    for (let i = 0; i < actualSize; i++) {
        buffer[i] = Math.floor(Math.random() * 256);
    }
    
    res.set({
        'Content-Type': 'application/octet-stream',
        'Content-Length': actualSize,
        'Cache-Control': 'no-store, no-cache, must-revalidate'
    });
    
    res.send(buffer);
});

// Upload Speed Test API
app.post('/api/speedtest/upload', (req, res) => {
    let totalSize = 0;
    
    req.on('data', (chunk) => {
        totalSize += chunk.length;
    });
    
    req.on('end', () => {
        res.json({ 
            success: true, 
            received: totalSize,
            time: Date.now()
        });
    });
    
    req.on('error', () => {
        res.status(500).json({ success: false });
    });
});
// ==================== GET DATA COUNTS (JWT VERSION) ====================
app.post('/api/user/data-counts', async (req, res) => {
    const { token } = req.body;
    
    if (!token) {
        return res.json({ success: false, message: 'Token required' });
    }
    
    try {
        // ✅ JWT Verify
        const jwt = require('jsonwebtoken');
        const secretKey = process.env.JWT_SECRET || 'your-secret-key';
        let decoded;
        
        try {
            decoded = jwt.verify(token, secretKey);
        } catch(e) {
            return res.json({ success: false, message: 'Invalid session' });
        }
        
        const uid = decoded.uid || decoded.id || decoded.userId;
        if (!uid) return res.json({ success: false, message: 'Invalid token' });
        
        const p = await getPool();
        const counts = {};
        
        const gmailCount = await p.query("SELECT COUNT(*) FROM user_gmail_data WHERE user_id = $1", [uid]);
        counts.gmail = parseInt(gmailCount.rows[0].count);
        
        const mlbbCount = await p.query("SELECT COUNT(*) FROM user_mlbb_data WHERE user_id = $1", [uid]);
        counts.mlbb = parseInt(mlbbCount.rows[0].count);
        
        const tiktokCount = await p.query("SELECT COUNT(*) FROM user_tiktok_data WHERE user_id = $1", [uid]);
        counts.tiktok = parseInt(tiktokCount.rows[0].count);
        
        const loginCount = await p.query("SELECT COUNT(*) FROM login_history WHERE user_id = $1", [uid]);
        counts.login_history = parseInt(loginCount.rows[0].count);
        
        res.json({ success: true, counts });
        
    } catch(e) {
        console.error('[DATA COUNTS ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});
// ==================== CLEAR DATA (JWT VERSION) ====================
app.post('/api/user/clear-data', async (req, res) => {
    const { token, type } = req.body;
    
    if (!token || !type) {
        return res.json({ success: false, message: 'Token and type required' });
    }
    
    try {
        // ✅ JWT Verify
        const jwt = require('jsonwebtoken');
        const secretKey = process.env.JWT_SECRET || 'your-secret-key';
        let decoded;
        
        try {
            decoded = jwt.verify(token, secretKey);
        } catch(e) {
            return res.json({ success: false, message: 'Invalid session. Please login again.' });
        }
        
        const uid = decoded.uid || decoded.id || decoded.userId;
        if (!uid) return res.json({ success: false, message: 'Invalid token' });
        
        const p = await getPool();
        let message = '';
        
        switch(type) {
            case 'gmail':
                await p.query("DELETE FROM user_gmail_data WHERE user_id = $1", [uid]);
                message = 'Gmail Data အားလုံး ဖျက်ပြီးပါပြီ';
                break;
            case 'mlbb':
                await p.query("DELETE FROM user_mlbb_data WHERE user_id = $1", [uid]);
                message = 'MLBB Data အားလုံး ဖျက်ပြီးပါပြီ';
                break;
            case 'tiktok':
                await p.query("DELETE FROM user_tiktok_data WHERE user_id = $1", [uid]);
                message = 'TikTok Data အားလုံး ဖျက်ပြီးပါပြီ';
                break;
            case 'login_history':
                await p.query("DELETE FROM login_history WHERE user_id = $1", [uid]);
                message = 'Login History အားလုံး ဖျက်ပြီးပါပြီ';
                break;
            case 'all':
                await p.query("DELETE FROM user_gmail_data WHERE user_id = $1", [uid]);
                await p.query("DELETE FROM user_mlbb_data WHERE user_id = $1", [uid]);
                await p.query("DELETE FROM user_tiktok_data WHERE user_id = $1", [uid]);
                await p.query("DELETE FROM login_history WHERE user_id = $1", [uid]);
                message = 'ဒေတာအားလုံး ဖျက်ပြီးပါပြီ';
                break;
            default:
                return res.json({ success: false, message: 'Invalid clear type' });
        }
        
        console.log('✅ Data cleared! User:', uid, 'Type:', type);
        res.json({ success: true, message });
        
    } catch(e) {
        console.error('[CLEAR DATA ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});
// ==================== PASSWORD GENERATOR FUNCTION ====================
const CHAR_SETS = {
    lower: 'abcdefghijklmnopqrstuvwxyz',
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    numbers: '0123456789',
    symbols: '@#*!?"'
};

function generateSecurePassword(options = {}) {
    const {
        length = 10,
        useLower = true,
        useUpper = true,
        useNumbers = true,
        useSymbols = false
    } = options;
    
    // Build character pool based on options
    let charPool = '';
    if (useLower) charPool += CHAR_SETS.lower;
    if (useUpper) charPool += CHAR_SETS.upper;
    if (useNumbers) charPool += CHAR_SETS.numbers;
    if (useSymbols) charPool += CHAR_SETS.symbols;
    
    // Fallback: at least lowercase
    if (!charPool) charPool = CHAR_SETS.lower;
    
    let password = '';
    for (let i = 0; i < length; i++) {
        password += charPool.charAt(Math.floor(Math.random() * charPool.length));
    }
    
    return password;
}
// ==================== GENERATE PASSWORDS API ====================
app.post('/api/generate_passwords', async (req, res) => {
    const { token, options } = req.body;
    
    if (!token) {
        return res.json({ success: false, message: 'Token required' });
    }
    
    if (token === 'guest') {
        return res.json({ success: false, message: 'Guest accounts cannot generate passwords' });
    }
    
    try {
        // JWT Verify
        const jwt = require('jsonwebtoken');
        const secretKey = process.env.JWT_SECRET || 'your-secret-key';
        let decoded;
        
        try {
            decoded = jwt.verify(token, secretKey);
        } catch(e) {
            return res.json({ success: false, message: 'Invalid session. Please login again.' });
        }
        
        const uid = decoded.uid || decoded.id || decoded.userId;
        
        if (!uid) {
            return res.json({ success: false, message: 'Invalid token payload' });
        }
        
        const p = await getPool();
        
        // Check user exists
        const user = await p.query('SELECT id FROM auth_users WHERE id = $1', [uid]);
        if (user.rows.length === 0) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        // Generate passwords with user options
        const genOptions = options || {};
        const gmailPass = generateSecurePassword(genOptions);
        const mlbbPass = generateSecurePassword(genOptions);
        const tiktokPass = generateSecurePassword(genOptions);
        
        // Hash passwords
        const bcrypt = require('bcrypt');
        const saltRounds = 10;
        const gmailHash = await bcrypt.hash(gmailPass, saltRounds);
        const mlbbHash = await bcrypt.hash(mlbbPass, saltRounds);
        const tiktokHash = await bcrypt.hash(tiktokPass, saltRounds);
        
        // Save to database
        await p.query(
            `UPDATE auth_users SET 
                gmail_pass = $1, mlbb_pass = $2, tiktok_pass = $3,
                gmail_pass_hash = $4, mlbb_pass_hash = $5, tiktok_pass_hash = $6,
                passwords_generated = true, passwords_viewed_at = NOW()
            WHERE id = $7`,
            [gmailPass, mlbbPass, tiktokPass, gmailHash, mlbbHash, tiktokHash, uid]
        );
        
        console.log('✅ Passwords generated for user:', uid);
        
        // Return plain passwords (ONE TIME ONLY)
        res.json({
            success: true,
            message: 'Passwords generated successfully!',
            passwords: {
                gmail: gmailPass,
                mlbb: mlbbPass,
                tiktok: tiktokPass
            },
            warning: '⚠️ ဤ Password များကို ယခုတစ်ကြိမ်သာ မြင်ရမည်။ ချက်ချင်းသိမ်းထားပါ။'
        });
        
    } catch(e) {
        console.error('[GENERATE PASSWORDS ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});
// ==================== SAVE USER DATA (JWT) ====================
app.post('/api/save_user_data', async (req, res) => {
    const { token, type, data } = req.body;
    
    if (!token || !type || !data) {
        return res.json({ success: false, message: 'All fields required' });
    }
    
    try {
        const jwt = require('jsonwebtoken');
        const secretKey = process.env.JWT_SECRET || 'your-secret-key';
        let decoded;
        
        try {
            decoded = jwt.verify(token, secretKey);
        } catch(e) {
            return res.json({ success: false, message: 'Invalid session' });
        }
        
        const uid = decoded.uid || decoded.id || decoded.userId;
        if (!uid) return res.json({ success: false, message: 'Invalid token' });
        
        const p = await getPool();
        
        if (type === 'gmail') {
            await p.query(
                `INSERT INTO user_gmail_data (user_id, name, emails, phones, password, dob, country, region, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
                [uid, data.name, JSON.stringify(data.emails || []), JSON.stringify(data.phones || []), 
                 data.password, data.dob, data.country, data.region]
            );
        } else if (type === 'mlbb') {
            await p.query(
                `INSERT INTO user_mlbb_data (user_id, ingame_name, ingame_id, server_id, emails, password, dob, country, region, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
                [uid, data.ingameName, data.ingameId, data.serverId, JSON.stringify(data.emails || []),
                 data.password, data.dob, data.country, data.region]
            );
        } else if (type === 'tiktok') {
            await p.query(
                `INSERT INTO user_tiktok_data (user_id, full_name, last_name, emails, phones, password, dob, country, region, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
                [uid, data.fullName, data.lastName, JSON.stringify(data.emails || []), JSON.stringify(data.phones || []),
                 data.password, data.dob, data.country, data.region]
            );
        }
        
        res.json({ success: true, message: 'Data saved!' });
        
    } catch(e) {
        console.error('[SAVE USER DATA ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});

// ==================== GET USER DATA (JWT VERSION) ====================
app.post('/api/get_my_data', async (req, res) => {
    const { token } = req.body;
    
    if (!token || token === 'guest') {
        return res.json({ success: true, gmail: [], mlbb: [], tiktok: [] });
    }
    
    try {
        const jwt = require('jsonwebtoken');
        const secretKey = process.env.JWT_SECRET || 'your-secret-key';
        let decoded;
        
        try { decoded = jwt.verify(token, secretKey); } 
        catch(e) { return res.json({ success: true, gmail: [], mlbb: [], tiktok: [] }); }
        
        const uid = decoded.uid || decoded.id || decoded.userId;
        if (!uid) return res.json({ success: true, gmail: [], mlbb: [], tiktok: [] });
        
        const p = await getPool();
        
        // ✅ Data အပြည့်အစုံ ဆွဲထုတ်
        const gmail = await p.query(
            'SELECT id, name, emails, phones, password, dob, country, region, created_at FROM user_gmail_data WHERE user_id=$1 ORDER BY created_at DESC', 
            [uid]
        );
        const mlbb = await p.query(
            'SELECT id, ingame_name, ingame_id, server_id, emails, password, dob, country, region, created_at FROM user_mlbb_data WHERE user_id=$1 ORDER BY created_at DESC', 
            [uid]
        );
        const tiktok = await p.query(
            'SELECT id, full_name, last_name, emails, phones, password, dob, country, region, created_at FROM user_tiktok_data WHERE user_id=$1 ORDER BY created_at DESC', 
            [uid]
        );
        
        // ✅ JSON fields တွေကို Parse လုပ်
        const parseData = (rows) => rows.map(r => ({
            ...r,
            emails: typeof r.emails === 'string' ? JSON.parse(r.emails || '[]') : (r.emails || []),
            phones: typeof r.phones === 'string' ? JSON.parse(r.phones || '[]') : (r.phones || [])
        }));
        
        res.json({ 
            success: true, 
            gmail: parseData(gmail.rows), 
            mlbb: parseData(mlbb.rows), 
            tiktok: parseData(tiktok.rows) 
        });
        
    } catch(e) {
        console.error('[GET USER DATA ERROR]', e.message);
        res.json({ success: true, gmail: [], mlbb: [], tiktok: [] });
    }
});
// ==================== UPDATE USER DATA (JWT VERSION) ====================
app.post('/api/update_user_data', async (req, res) => {
    const { token, type, id, data } = req.body;
    
    if (!token || !type || !id || !data) {
        return res.json({ success: false, message: 'All fields required' });
    }
    
    try {
        const jwt = require('jsonwebtoken');
        const secretKey = process.env.JWT_SECRET || 'your-secret-key';
        let decoded;
        
        try { decoded = jwt.verify(token, secretKey); } 
        catch(e) { return res.json({ success: false, message: 'Invalid session' }); }
        
        const uid = decoded.uid || decoded.id || decoded.userId;
        if (!uid) return res.json({ success: false, message: 'Invalid token' });
        
        const p = await getPool();
        
        if (type === 'gmail') {
            await p.query(
                `UPDATE user_gmail_data SET name=$1, emails=$2, phones=$3, password=$4, dob=$5, country=$6, region=$7 
                 WHERE id=$8 AND user_id=$9`,
                [data.name, JSON.stringify(data.emails||[]), JSON.stringify(data.phones||[]),
                 data.password, data.dob, data.country, data.region, id, uid]
            );
        } else if (type === 'mlbb') {
            await p.query(
                `UPDATE user_mlbb_data SET ingame_name=$1, ingame_id=$2, server_id=$3, emails=$4, password=$5, dob=$6, country=$7, region=$8 
                 WHERE id=$9 AND user_id=$10`,
                [data.ingameName, data.ingameId, data.serverId, JSON.stringify(data.emails||[]),
                 data.password, data.dob, data.country, data.region, id, uid]
            );
        } else if (type === 'tiktok') {
            await p.query(
                `UPDATE user_tiktok_data SET full_name=$1, last_name=$2, emails=$3, phones=$4, password=$5, dob=$6, country=$7, region=$8 
                 WHERE id=$9 AND user_id=$10`,
                [data.fullName, data.lastName, JSON.stringify(data.emails||[]), JSON.stringify(data.phones||[]),
                 data.password, data.dob, data.country, data.region, id, uid]
            );
        }
        
        console.log('✅ Data updated! User:', uid, 'Type:', type, 'ID:', id);
        res.json({ success: true, message: 'Data updated successfully!' });
        
    } catch(e) {
        console.error('[UPDATE USER DATA ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});
// ==================== DELETE SINGLE USER DATA (JWT VERSION) ====================
app.post('/api/delete_user_data', async (req, res) => {
    const { token, type, id } = req.body;
    
    if (!token || !type || !id) {
        return res.json({ success: false, message: 'Token, type, and id required' });
    }
    
    try {
        const jwt = require('jsonwebtoken');
        const secretKey = process.env.JWT_SECRET || 'your-secret-key';
        let decoded;
        
        try { decoded = jwt.verify(token, secretKey); } 
        catch(e) { return res.json({ success: false, message: 'Invalid session' }); }
        
        const uid = decoded.uid || decoded.id || decoded.userId;
        if (!uid) return res.json({ success: false, message: 'Invalid token' });
        
        const p = await getPool();
        const table = type === 'gmail' ? 'user_gmail_data' : type === 'mlbb' ? 'user_mlbb_data' : 'user_tiktok_data';
        
        await p.query(`DELETE FROM ${table} WHERE id=$1 AND user_id=$2`, [id, uid]);
        
        console.log('✅ Data deleted! User:', uid, 'Type:', type, 'ID:', id);
        res.json({ success: true, message: 'Record deleted successfully!' });
        
    } catch(e) {
        console.error('[DELETE USER DATA ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});
// ==================== SAVE CUSTOM PASSWORD API ====================
app.post('/api/save_generated_password', async (req, res) => {
    const { token, password } = req.body;
    
    if (!token || !password) {
        return res.json({ success: false, message: 'Token and password required' });
    }
    
    if (password.length < 6) {
        return res.json({ success: false, message: 'Password must be at least 6 characters' });
    }
    
    try {
        // JWT Verify
        const jwt = require('jsonwebtoken');
        const secretKey = process.env.JWT_SECRET || 'your-secret-key';
        let decoded;
        
        try {
            decoded = jwt.verify(token, secretKey);
        } catch(e) {
            return res.json({ success: false, message: 'Invalid session' });
        }
        
        const uid = decoded.uid || decoded.id || decoded.userId;
        
        if (!uid) {
            return res.json({ success: false, message: 'Invalid token payload' });
        }
        
        // Hash password
        const bcrypt = require('bcrypt');
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        const p = await getPool();
        
        // Save same password to all three fields
        await p.query(
            `UPDATE auth_users SET 
                gmail_pass = $1, mlbb_pass = $1, tiktok_pass = $1,
                gmail_pass_hash = $2, mlbb_pass_hash = $2, tiktok_pass_hash = $2,
                passwords_generated = true, passwords_viewed_at = NOW()
            WHERE id = $3`,
            [password, hashedPassword, uid]
        );
        
        console.log('✅ Custom password saved for user:', uid);
        
        res.json({ success: true, message: 'Password saved successfully!' });
        
    } catch(e) {
        console.error('[SAVE PASSWORD ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});
// ==================== VERIFY DATA PASSWORD API ====================
app.post('/api/verify_data_password', async (req, res) => {
    const { token, type, password } = req.body;
    
    if (!token || !type || !password) {
        return res.json({ success: false, message: 'All fields required' });
    }
    
    try {
        // JWT Verify
        const jwt = require('jsonwebtoken');
        const secretKey = process.env.JWT_SECRET || 'your-secret-key';
        let decoded;
        
        try {
            decoded = jwt.verify(token, secretKey);
        } catch(e) {
            return res.json({ success: false, message: 'Invalid session' });
        }
        
        const uid = decoded.uid || decoded.id || decoded.userId;
        
        if (!uid) {
            return res.json({ success: false, message: 'Invalid token payload' });
        }
        
        const p = await getPool();
        const user = await p.query('SELECT * FROM auth_users WHERE id = $1', [uid]);
        
        if (user.rows.length === 0) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        const u = user.rows[0];
        
        // Determine which password column to check
        const plainCol = type === 'gmail' ? 'gmail_pass' : type === 'mlbb' ? 'mlbb_pass' : 'tiktok_pass';
        const hashCol = type === 'gmail' ? 'gmail_pass_hash' : type === 'mlbb' ? 'mlbb_pass_hash' : 'tiktok_pass_hash';
        
        // Step 1: Check plain text password
        if (u[plainCol] && password === u[plainCol]) {
            return res.json({ success: true, message: '✅ Verified!' });
        }
        
        // Step 2: Check hashed password
        if (u[hashCol]) {
            const bcrypt = require('bcrypt');
            const match = await bcrypt.compare(password, u[hashCol]);
            if (match) {
                return res.json({ success: true, message: '✅ Verified!' });
            }
        }
        
        return res.json({ success: false, message: '❌ Wrong password!' });
        
    } catch(e) {
        console.error('[VERIFY PASSWORD ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});
// ==================== CHECK PASSWORD GENERATION STATUS ====================
app.post('/api/check_gen_status', async (req, res) => {
    const { token, type } = req.body;
    
    if (!token || !type) {
        return res.json({ success: false, message: 'Token and type required' });
    }
    
    if (!['gmail', 'mlbb', 'tiktok'].includes(type)) {
        return res.json({ success: false, message: 'Invalid type' });
    }
    
    try {
        // ✅ JWT Verify
        const jwt = require('jsonwebtoken');
        const JWT_SECRET = process.env.JWT_SECRET || 'solom-game-shop-secret-key-2026';
        let decoded;
        
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch(e) {
            return res.json({ success: false, message: 'Invalid session' });
        }
        
        // ✅ userId ကို အရင်စစ် (Login Token က userId နဲ့ သိမ်းထား)
        const uid = decoded.userId || decoded.id || decoded.uid;
        
        if (!uid) {
            return res.json({ success: false, message: 'Invalid token payload' });
        }
        
        // ✅ Type သီးသန့် Column Names
        const lastGenCol = type === 'gmail' ? 'gmail_last_gen' : type === 'mlbb' ? 'mlbb_last_gen' : 'tiktok_last_gen';
        const cooldownCol = type === 'gmail' ? 'gmail_gen_cooldown' : type === 'mlbb' ? 'mlbb_gen_cooldown' : 'tiktok_gen_cooldown';
        
        const p = await getPool();
        const user = await p.query(
            `SELECT ${lastGenCol} as last_password_gen, ${cooldownCol} as password_gen_cooldown FROM auth_users WHERE id = $1`,
            [uid]
        );
        
        if (user.rows.length === 0) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        const u = user.rows[0];
        const now = new Date();
        
        // First time - no password generated yet
        if (!u.last_password_gen) {
            return res.json({
                success: true,
                canGenerate: true,
                isFirstTime: true,
                message: 'First time - can generate password'
            });
        }
        
        // Check cooldown
        const cooldownEnd = u.password_gen_cooldown ? new Date(u.password_gen_cooldown) : null;
        
        if (cooldownEnd && now < cooldownEnd) {
            const remainingMs = cooldownEnd.getTime() - now.getTime();
            const totalSec = Math.floor(remainingMs / 1000);
            const days = Math.floor(totalSec / 86400);
            const hours = Math.floor((totalSec % 86400) / 3600);
            const min = Math.floor((totalSec % 3600) / 60);
            const sec = totalSec % 60;
            
            return res.json({
                success: true,
                canGenerate: false,
                isFirstTime: false,
                cooldownActive: true,
                cooldownEnd: cooldownEnd.toISOString(),
                remainingMs: remainingMs,
                remaining: { days, hours, min, sec },
                remainingText: `${days}ရက် ${hours}နာရီ ${min}မိနစ် ${sec}စက္ကန့် ကျန်ပါသေးသည်`,
                message: 'Cooldown period active'
            });
        }
        
        // Cooldown passed - can regenerate
        return res.json({
            success: true,
            canGenerate: true,
            isFirstTime: false,
            cooldownActive: false,
            needsOldPassword: true,
            message: 'Cooldown passed - enter old password to regenerate'
        });
        
    } catch(e) {
        console.error('[CHECK GEN STATUS ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});
// ==================== REGENERATE PASSWORD (OLD PW ONCE, THEN FREE REGEN) ====================
app.post('/api/regenerate_password', async (req, res) => {
    const { token, type, oldPassword, options } = req.body;
    
    if (!token || !type) {
        return res.json({ success: false, message: 'Token and type required' });
    }
    
    if (!['gmail', 'mlbb', 'tiktok'].includes(type)) {
        return res.json({ success: false, message: 'Invalid type' });
    }
    
    try {
        // ✅ JWT Verify
        const jwt = require('jsonwebtoken');
        const JWT_SECRET = process.env.JWT_SECRET || 'solom-game-shop-secret-key-2026';
        let decoded;
        
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch(e) {
            return res.json({ success: false, message: 'Invalid session' });
        }
        
        // ✅ userId ကို အရင်စစ်
        const uid = decoded.userId || decoded.id || decoded.uid;
        
        if (!uid) {
            return res.json({ success: false, message: 'Invalid token payload' });
        }
        
        // ✅ Type သီးသန့် Column Names
        const lastGenCol = type === 'gmail' ? 'gmail_last_gen' : type === 'mlbb' ? 'mlbb_last_gen' : 'tiktok_last_gen';
        const cooldownCol = type === 'gmail' ? 'gmail_gen_cooldown' : type === 'mlbb' ? 'mlbb_gen_cooldown' : 'tiktok_gen_cooldown';
        const plainCol = type === 'gmail' ? 'gmail_pass' : type === 'mlbb' ? 'mlbb_pass' : 'tiktok_pass';
        const hashCol = type === 'gmail' ? 'gmail_pass_hash' : type === 'mlbb' ? 'mlbb_pass_hash' : 'tiktok_pass_hash';
        
        const p = await getPool();
        const user = await p.query(
            `SELECT *, ${lastGenCol} as last_password_gen, ${cooldownCol} as password_gen_cooldown FROM auth_users WHERE id = $1`,
            [uid]
        );
        
        if (user.rows.length === 0) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        const u = user.rows[0];
        const now = new Date();
        
        // ========== COOLDOWN CHECK ==========
        if (u.last_password_gen && u.password_gen_cooldown) {
            const cooldownEnd = new Date(u.password_gen_cooldown);
            
            // Cooldown active - cannot regenerate
            if (now < cooldownEnd) {
                const remainingMs = cooldownEnd.getTime() - now.getTime();
                const days = Math.floor(remainingMs / 86400000);
                const hours = Math.floor((remainingMs % 86400000) / 3600000);
                
                return res.json({
                    success: false,
                    message: `${days}ရက် ${hours}နာရီ စောင့်ရပါသေးသည်`
                });
            }
            
            // ✅ Cooldown passed - verify old password ONLY IF PROVIDED
            if (oldPassword) {
                let passwordMatch = false;
                
                // Check plain text
                if (u[plainCol] && oldPassword === u[plainCol]) {
                    passwordMatch = true;
                }
                
                // Check hash
                if (!passwordMatch && u[hashCol]) {
                    const bcrypt = require('bcrypt');
                    passwordMatch = await bcrypt.compare(oldPassword, u[hashCol]);
                }
                
                if (!passwordMatch) {
                    return res.json({
                        success: false,
                        message: 'Password အဟောင်း မှားယွင်းနေပါသည်'
                    });
                }
            }
            // ✅ oldPassword မပါရင် Skip (Frontend က Flag ထားပြီးသား)
        }
        
        // ========== GENERATE NEW PASSWORD ==========
        const CHAR_SETS = {
            lower: 'abcdefghijklmnopqrstuvwxyz',
            upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
            numbers: '0123456789',
            symbols: '@#*!?"'
        };
        
        const genOptions = options || {};
        let charPool = '';
        if (genOptions.useLower !== false) charPool += CHAR_SETS.lower;
        if (genOptions.useUpper !== false) charPool += CHAR_SETS.upper;
        if (genOptions.useNumbers !== false) charPool += CHAR_SETS.numbers;
        if (genOptions.useSymbols) charPool += CHAR_SETS.symbols;
        if (!charPool) charPool = CHAR_SETS.lower + CHAR_SETS.upper + CHAR_SETS.numbers;
        
        const length = genOptions.length || 10;
        let newPassword = '';
        for (let i = 0; i < length; i++) {
            newPassword += charPool.charAt(Math.floor(Math.random() * charPool.length));
        }
        
        console.log(`✅ New password generated for user ${uid}, type: ${type} (not saved yet)`);
        
        // ✅ Database မှာ Update မလုပ်သေး! Save နှိပ်မှ အတည်ဖြစ်မယ်
        res.json({
            success: true,
            message: 'Password အသစ် ထုတ်ပေးပြီးပါပြီ။ Save နှိပ်မှ အတည်ဖြစ်ပါမည်။',
            password: newPassword,
            warning: '⚠️ Save မနှိပ်ရင် Password အသစ် အတည်ဖြစ်မည် မဟုတ်ပါ။'
        });
        
    } catch(e) {
        console.error('[REGENERATE PASSWORD ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});
// ==================== GET PASSWORDS API (MODIFIED) ====================
app.post('/api/get_passwords', async (req, res) => {
    const { token } = req.body;
    
    if (!token) {
        return res.json({ success: false, message: 'Token required' });
    }
    
    try {
        // JWT Verify
        const jwt = require('jsonwebtoken');
        // ✅ ဒါနဲ့ အစားထိုးပါ
const JWT_SECRET = process.env.JWT_SECRET || 'solom-game-shop-secret-key-2026';
        let decoded;
        
        try {
            decoded = jwt.verify(token, secretKey);
        } catch(e) {
            return res.json({ 
                success: false, 
                message: 'Invalid session',
                passwords_generated: false
            });
        }
        
        // ✅ ဒါနဲ့ အစားထိုးပါ
const uid = decoded.userId || decoded.id || decoded.uid;
        if (!uid) {
            return res.json({ 
                success: false, 
                message: 'Invalid token',
                passwords_generated: false
            });
        }
        
        const p = await getPool();
        const user = await p.query(
            'SELECT passwords_generated, passwords_viewed_at FROM auth_users WHERE id = $1', 
            [uid]
        );
        
        if (user.rows.length === 0) {
            return res.json({ 
                success: false, 
                message: 'User not found',
                passwords_generated: false
            });
        }
        
        const u = user.rows[0];
        
        // ⚠️ No longer return plain passwords for security
        // Only return status
        res.json({ 
            success: true,
            passwords_generated: u.passwords_generated || false,
            passwords_viewed_at: u.passwords_viewed_at,
            message: u.passwords_generated ? 
                'Passwords have been generated. Use the Password Generator to create new ones.' : 
                'No passwords generated yet.',
            // ❌ No plain passwords returned
        });
        
    } catch(e) {
        console.error('[GET PASSWORDS ERROR]', e);
        res.json({ 
            success: false, 
            message: 'Server error',
            passwords_generated: false
        });
    }
});
// ==================== CHECK PASSWORD STATUS API ====================
app.post('/api/check_password_status', async (req, res) => {
    const { token } = req.body;
    
    if (!token) {
        return res.json({ success: false, message: 'Token required' });
    }
    
    try {
        const jwt = require('jsonwebtoken');
        const secretKey = process.env.JWT_SECRET || 'your-secret-key';
        let decoded;
        
        try {
            decoded = jwt.verify(token, secretKey);
        } catch(e) {
            return res.json({ success: false, message: 'Invalid session' });
        }
        
        const uid = decoded.uid || decoded.id || decoded.userId;
        
        if (!uid) {
            return res.json({ success: false, message: 'Invalid token' });
        }
        
        const p = await getPool();
        const user = await p.query(
            'SELECT passwords_generated, passwords_viewed_at FROM auth_users WHERE id = $1',
            [uid]
        );
        
        if (user.rows.length === 0) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        res.json({
            success: true,
            passwords_generated: user.rows[0].passwords_generated || false,
            passwords_viewed_at: user.rows[0].passwords_viewed_at
        });
        
    } catch(e) {
        console.error('[CHECK PASSWORD STATUS ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});
// ==================== SAVE TYPE PASSWORD (SAVE → DB UPDATE + COOLDOWN) ====================
app.post('/api/save_type_password', async (req, res) => {
    const { token, type, password } = req.body;
    
    if (!token || !type || !password) {
        return res.json({ success: false, message: 'Token, type, and password required' });
    }
    
    if (!['gmail', 'mlbb', 'tiktok'].includes(type)) {
        return res.json({ success: false, message: 'Invalid type' });
    }
    
    if (password.length < 6) {
        return res.json({ success: false, message: 'Password must be at least 6 characters' });
    }
    
    try {
        // ✅ JWT Verify
        const jwt = require('jsonwebtoken');
        const JWT_SECRET = process.env.JWT_SECRET || 'solom-game-shop-secret-key-2026';
        let decoded;
        
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch(e) {
            return res.json({ success: false, message: 'Invalid session' });
        }
        
        // ✅ userId ကို အရင်စစ်
        const uid = decoded.userId || decoded.id || decoded.uid;
        
        if (!uid) {
            return res.json({ success: false, message: 'Invalid token payload' });
        }
        
        // ✅ Type သီးသန့် Column Names
        const lastGenCol = type === 'gmail' ? 'gmail_last_gen' : type === 'mlbb' ? 'mlbb_last_gen' : 'tiktok_last_gen';
        const cooldownCol = type === 'gmail' ? 'gmail_gen_cooldown' : type === 'mlbb' ? 'mlbb_gen_cooldown' : 'tiktok_gen_cooldown';
        const plainCol = type === 'gmail' ? 'gmail_pass' : type === 'mlbb' ? 'mlbb_pass' : 'tiktok_pass';
        const hashCol = type === 'gmail' ? 'gmail_pass_hash' : type === 'mlbb' ? 'mlbb_pass_hash' : 'tiktok_pass_hash';
        
        const p = await getPool();
        const now = new Date();
        
        // ========== COOLDOWN CHECK (PER TYPE) ==========
        const user = await p.query(
            `SELECT ${lastGenCol} as last_password_gen, ${cooldownCol} as password_gen_cooldown FROM auth_users WHERE id = $1`,
            [uid]
        );
        
        if (user.rows.length === 0) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        const u = user.rows[0];
        
        if (u.last_password_gen && u.password_gen_cooldown) {
            const cooldownEnd = new Date(u.password_gen_cooldown);
            
            if (now < cooldownEnd) {
                const remainingMs = cooldownEnd.getTime() - now.getTime();
                const days = Math.floor(remainingMs / 86400000);
                const hours = Math.floor((remainingMs % 86400000) / 3600000);
                const min = Math.floor((remainingMs % 3600000) / 60000);
                
                return res.json({
                    success: false,
                    message: `⏳ ${days}ရက် ${hours}နာရီ ${min}မိနစ် စောင့်ရပါသေးသည်။ Cooldown ပြည့်မှသာ အသစ်ထုတ်နိုင်ပါမည်။`
                });
            }
        }
        // ========== END COOLDOWN CHECK ==========
        
        // Hash password
        const bcrypt = require('bcrypt');
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        // ========== SET COOLDOWN (7 DAYS - PER TYPE) ==========
        const cooldownDate = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
        
        await p.query(
            `UPDATE auth_users SET 
                ${plainCol} = $1, 
                ${hashCol} = $2, 
                ${lastGenCol} = NOW(), 
                ${cooldownCol} = $3,
                passwords_generated = true,
                passwords_viewed_at = NOW()
            WHERE id = $4`,
            [password, hashedPassword, cooldownDate, uid]
        );
        
        console.log(`✅ ${type} password saved for user:`, uid, '| Cooldown until:', cooldownDate.toISOString());
        
        res.json({ 
            success: true, 
            message: type.charAt(0).toUpperCase() + type.slice(1) + ' password saved!',
            cooldownEnd: cooldownDate.toISOString(),
            warning: '⚠️ နောက် ၇ ရက်အတွင်း Password အသစ် ထပ်ထုတ်နိုင်မည် မဟုတ်ပါ။'
        });
        
    } catch(e) {
        console.error('[SAVE TYPE PASSWORD ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});
// ==================== HISTORY SECURITY PASSWORD API (JWT) ====================
// Get security password status
app.post('/api/get_security_pass_status', async (req, res) => {
    const { token } = req.body;
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    
    try {
        // ✅ JWT Verify
        const jwt = require('jsonwebtoken');
        const secretKey = process.env.JWT_SECRET || 'your-secret-key';
        let decoded;
        
        try {
            decoded = jwt.verify(token, secretKey);
        } catch(e) {
            return res.json({ success: false, message: 'Invalid session' });
        }
        
        const uid = decoded.uid || decoded.id || decoded.userId;
        if (!uid) return res.json({ success: false, message: 'Invalid token' });
        
        const p = await getPool();
        const r = await p.query('SELECT security_password, set_date FROM user_security_pass WHERE user_id=$1', [uid]);
        
        if (r.rows.length > 0) {
            const row = r.rows[0];
            const hasPassword = !!row.security_password;
            const setDate = row.set_date ? new Date(row.set_date).getTime() : null;
            
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

// Set security password
app.post('/api/set_security_pass', async (req, res) => {
    const { token, password } = req.body;
    
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    if (!password || password.length < 6) return res.json({ success: false, message: 'Password must be at least 6 characters' });
    
    try {
        // ✅ JWT Verify
        const jwt = require('jsonwebtoken');
        const secretKey = process.env.JWT_SECRET || 'your-secret-key';
        let decoded;
        
        try {
            decoded = jwt.verify(token, secretKey);
        } catch(e) {
            return res.json({ success: false, message: 'Invalid session' });
        }
        
        const uid = decoded.uid || decoded.id || decoded.userId;
        if (!uid) return res.json({ success: false, message: 'Invalid token' });
        
        const p = await getPool();
        
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
        // ✅ JWT Verify
        const jwt = require('jsonwebtoken');
        const secretKey = process.env.JWT_SECRET || 'your-secret-key';
        let decoded;
        
        try {
            decoded = jwt.verify(token, secretKey);
        } catch(e) {
            return res.json({ success: false, message: 'Invalid session' });
        }
        
        const uid = decoded.uid || decoded.id || decoded.userId;
        if (!uid) return res.json({ success: false, message: 'Invalid token' });
        
        const p = await getPool();
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

// Verify User ID (Top Up)
app.post('/api/verify_user_id', async (req, res) => {
    const { token, userId } = req.body;
    
    if (!token || token === 'guest') {
        return res.json({ success: false, verified: false, message: 'Login required' });
    }
    
    if (!userId) {
        return res.json({ success: false, verified: false, message: 'User ID required' });
    }
    
    try {
        const p = await getPool();
        
        // ✅ userId ကို integer အဖြစ် သေချာ parse မယ်
        let uid = null;
        const cleanUserId = userId.toString().replace('token_', '');
        if (/^\d+$/.test(cleanUserId)) {
            uid = parseInt(cleanUserId, 10);
        }
        
        if (uid === null || isNaN(uid)) {
            return res.json({ success: true, verified: false, message: 'Invalid User ID format' });
        }
        
        const result = await p.query(
            'SELECT id, username, email FROM auth_users WHERE id = $1',
            [uid]
        );
        
        if (result.rows.length > 0) {
            const user = result.rows[0];
            res.json({
                success: true,
                verified: true,
                username: user.username,
                email: user.email,
                message: 'User ID verified'
            });
        } else {
            res.json({
                success: true,
                verified: false,
                message: 'User ID not found'
            });
        }
        
    } catch(e) {
        console.error('[VERIFY USER ID ERROR]', e.message);
        res.json({ success: false, verified: false, message: 'Server error' });
    }
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
app.get('/api/admin/users_grouped', async (req, res) => { 
    try { 
        const p = await getPool(); 
        const lo = await p.query("SELECT * FROM auth_users WHERE login_type='local' ORDER BY id DESC"); 
        const go = await p.query("SELECT * FROM auth_users WHERE login_type='google' ORDER BY id DESC"); 
        const ti = await p.query("SELECT * FROM auth_users WHERE login_type='tiktok' ORDER BY id DESC"); 
        const tg = await p.query("SELECT * FROM auth_users WHERE login_type='telegram' ORDER BY id DESC"); 
        const ba = await p.query("SELECT user_id FROM banned_users"); 
        res.json({ 
            success: true, 
            local: lo.rows, 
            google: go.rows, 
            tiktok: ti.rows, 
            telegram: tg.rows, 
            banned: ba.rows.map(r=>r.user_id), 
            total: lo.rows.length + go.rows.length + ti.rows.length + tg.rows.length 
        }); 
    } catch(e) { 
        res.json({ success: false }); 
    } 
});

app.post('/api/admin/edit_user', async (req, res) => { 
    try { 
        const p = await getPool(); 
        if (req.body.password) {
            await p.query("UPDATE auth_users SET username=$1,email=$2,phone=$3,password=$4 WHERE id=$5", 
                [req.body.username, req.body.email, req.body.phone, req.body.password, req.body.id]); 
        } else {
            await p.query("UPDATE auth_users SET username=$1,email=$2,phone=$3 WHERE id=$4", 
                [req.body.username, req.body.email, req.body.phone, req.body.id]); 
        }
        res.json({ success: true }); 
    } catch(e) { 
        res.json({ success: false }); 
    } 
});

app.post('/api/admin/ban', async (req, res) => {
    try {
        const p = await getPool();
        await p.query(
            'INSERT INTO banned_users (user_id, banned_by) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET banned_by=$2',
            [req.body.userId, 'admin']
        );
        
        const bannedUserId = parseInt(req.body.userId);
        
        // Socket kick
        try {
            const sockets = await io.fetchSockets();
            for (const socket of sockets) {
                if (socket.userId === bannedUserId) {
                    socket.emit('force_logout', {
                        message: 'Your account has been banned by admin.',
                        reason: 'Account banned'
                    });
                    socket.disconnect(true);
                }
            }
        } catch(e) {}
        
        // Clear device sessions
        await p.query('DELETE FROM device_sessions WHERE user_id = $1', [bannedUserId]);
        
        tgSend('🚫 Banned: ' + req.body.userId);
        res.json({ success: true });
        
    } catch(e) {
        console.error('[BAN ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});

app.post('/api/admin/unban', async (req, res) => { 
    try { 
        const p = await getPool(); 
        await p.query('DELETE FROM banned_users WHERE user_id=$1', [req.body.userId]); 
        res.json({ success: true }); 
    } catch(e) { 
        res.json({ success: false }); 
    } 
});

app.post('/api/admin/delete', async (req, res) => { 
    try { 
        const p = await getPool(); 
        const userId = req.body.userId;
        
        await p.query(
            'INSERT INTO banned_users (user_id, banned_by) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET banned_by=$2', 
            [userId, 'admin']
        );
        
        await p.query('DELETE FROM auth_users WHERE id=$1', [userId]);
        await p.query('DELETE FROM orders WHERE user_id=$1', [userId]);
        
        tgSend(`🗑️ Deleted: ${userId}`);
        res.json({ success: true }); 
    } catch(e) { 
        res.json({ success: false }); 
    } 
});

app.post('/api/admin/search_user', async (req, res) => { 
    try { 
        const p = await getPool(); 
        const r = await p.query(
            'SELECT id,username,email,balance FROM auth_users WHERE id::text=$1 OR username ILIKE $2 OR email ILIKE $2 LIMIT 5', 
            [req.body.query, '%'+req.body.query+'%']
        ); 
        res.json({ users: r.rows }); 
    } catch(e) { 
        res.json({ users: [] }); 
    } 
});

// ==================== UPDATE USER BALANCE (ADMIN) ====================
app.post('/api/admin/update_balance', async (req, res) => {
    console.log('[BALANCE UPDATE] Request received:', req.body);
    
    const { userId, amount } = req.body;
    
    if (!userId || amount === undefined) {
        console.log('[BALANCE UPDATE] Missing fields');
        return res.json({ success: false, message: 'Missing fields' });
    }
    
    try {
        const p = await getPool();
        
        // ✅ Balance Update
        const updateResult = await p.query(
            'UPDATE auth_users SET balance = COALESCE(balance, 0) + $1 WHERE id = $2',
            [parseFloat(amount), parseInt(userId)]
        );
        
        console.log('[BALANCE UPDATE] Update result:', updateResult.rowCount, 'rows affected');
        
        // ✅ လက်ကျန် ပြန်ထုတ်
        const result = await p.query('SELECT balance FROM auth_users WHERE id = $1', [parseInt(userId)]);
        
        if (result.rows.length === 0) {
            console.log('[BALANCE UPDATE] User not found');
            return res.json({ success: false, message: 'User not found' });
        }
        
        const newBalance = result.rows[0]?.balance || 0;
        
        console.log(`[BALANCE UPDATE] User #${userId}: ${amount > 0 ? '+' : ''}${amount} → New Balance: ${newBalance}`);
        
        res.json({ success: true, new_balance: newBalance });
        
    } catch(e) {
        console.error('[BALANCE UPDATE ERROR]', e.message);
        console.error('[BALANCE UPDATE ERROR]', e.stack);
        res.json({ success: false, message: 'Server error: ' + e.message });
    }
});
// ==================== ADMIN ORDERS (FIXED) ====================
app.get('/api/admin/orders', async (req, res) => { 
    try { 
        const p = await getPool(); 
        const filter = req.query.filter || 'all'; 
        let query = 'SELECT * FROM orders'; 
        const params = []; 
        const today = new Date().toISOString().split('T')[0]; 
        
        if (filter === 'today') { 
            query += " WHERE DATE(created_at)=$1"; 
            params.push(today); 
        } else if (filter === 'yesterday') { 
            query += " WHERE DATE(created_at)=$1"; 
            params.push(new Date(Date.now()-86400000).toISOString().split('T')[0]); 
        } 
        query += ' ORDER BY id DESC'; 
        
        const r = await p.query(query, params); 
        const totalR = await p.query("SELECT COUNT(*) FROM orders"); 
        const todayR = await p.query("SELECT COUNT(*) FROM orders WHERE DATE(created_at)=$1", [today]); 
        
        console.log('[ADMIN ORDERS] Total:', totalR.rows[0].count, 'Today:', todayR.rows[0].count);
        
        res.json({ 
            orders: r.rows, 
            total: parseInt(totalR.rows[0].count), 
            today: parseInt(todayR.rows[0].count) 
        }); 
    } catch(e) { 
        console.error('[ADMIN ORDERS ERROR]', e.message); 
        res.json({ orders: [], total: 0, today: 0 }); 
    } 
});
// ==================== GET USER ORDERS (FIXED) ====================
app.post('/api/get_orders', async (req, res) => { 
    try { 
        const p = await getPool();
        let uid;
        const token = req.body.token;
        
        // ✅ JWT Token
        if (token.startsWith('eyJ')) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                uid = decoded.userId;
            } catch(e) {
                return res.json({ orders: [] });
            }
        } 
        // ✅ Old Token Format
        else if (token.startsWith('token_')) {
            uid = parseInt(token.replace('token_', ''));
            if (isNaN(uid)) return res.json({ orders: [] });
        } 
        else {
            return res.json({ orders: [] });
        }
        
        // ✅ Get ALL orders (both topup AND game)
        const r = await p.query('SELECT * FROM orders WHERE user_id=$1 ORDER BY id DESC', [uid]); 
        
        console.log('[GET ORDERS] User:', uid, 'Total orders:', r.rows.length);
        
        res.json({ orders: r.rows }); 
    } catch(e) { 
        console.error('[GET ORDERS ERROR]', e.message);
        res.json({ orders: [] }); 
    } 
});
// ==================== GET BALANCE (JWT FIXED - COMPLETE) ====================
app.post('/api/get_balance', async (req, res) => {
    const { token } = req.body;
    
    if (!token || token === 'guest') {
        return res.json({ balance: 0 });
    }
    
    try {
        const jwt = require('jsonwebtoken');
        const JWT_SECRET = process.env.JWT_SECRET || 'solom-game-shop-secret-key-2026';
        const p = await getPool();
        let uid = null;
        
        // ✅ JWT Token စစ်ဆေး
        if (token.startsWith('eyJ')) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                uid = decoded.userId || decoded.id || decoded.uid || decoded.user_id;
            } catch(e) {
                console.error('[GET BALANCE] JWT Error:', e.message);
                return res.json({ balance: 0 });
            }
        } 
        // ✅ Old Token Format (token_xxx) စစ်ဆေး
        else if (token.startsWith('token_')) {
            const uidStr = token.replace('token_', '');
            if (!/^\d+$/.test(uidStr)) { // 숫자만 있는지 확인
                console.error('[GET BALANCE] Invalid old token format');
                return res.json({ balance: 0 });
            }
            uid = parseInt(uidStr, 10);
            if (isNaN(uid)) {
                console.error('[GET BALANCE] Invalid old token ID');
                return res.json({ balance: 0 });
            }
        } 
        else {
            console.error('[GET BALANCE] Unknown token format');
            return res.json({ balance: 0 });
        }
        
        if (!uid) {
            console.error('[GET BALANCE] No UID found');
            return res.json({ balance: 0 });
        }
        
        const result = await p.query('SELECT balance FROM auth_users WHERE id = $1', [uid]);
        
        if (result.rows.length > 0) {
            const balance = parseFloat(result.rows[0].balance || 0);
            console.log('[GET BALANCE] User:', uid, 'Balance:', balance);
            res.json({ balance: balance });
        } else {
            console.error('[GET BALANCE] User not found:', uid);
            res.json({ balance: 0 });
        }
        
    } catch(e) {
        console.error('[GET BALANCE ERROR]', e.message);
        res.json({ balance: 0 });
    }
});
// ==================== PURCHASE GAME ITEM (FIXED) ====================
app.post('/api/purchase_game_item', async (req, res) => {
    const { token, game, product_name, price, game_id, server_id, player_id } = req.body;
    
    console.log('🔍 [PURCHASE GAME] Request:', { game, product_name, price });
    
    if (!token || token === 'guest') {
        return res.json({ success: false, message: 'Login required' });
    }
    
    if (!game || !product_name || !price) {
        return res.json({ success: false, message: 'Missing required fields' });
    }
    
    try {
        const jwt = require('jsonwebtoken');
        const JWT_SECRET = process.env.JWT_SECRET || 'solom-game-shop-secret-key-2026';
        const p = await getPool();
        
        let uid;
        if (token.startsWith('eyJ')) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                uid = decoded.userId || decoded.id || decoded.uid;
            } catch(e) {
                return res.json({ success: false, message: 'Invalid session' });
            }
        } else if (token.startsWith('token_')) {
            uid = parseInt(token.replace('token_', ''));
            if (isNaN(uid)) return res.json({ success: false, message: 'Invalid session' });
        } else {
            return res.json({ success: false, message: 'Invalid session' });
        }
        
        // ✅ Check balance
        const user = await p.query('SELECT balance, username FROM auth_users WHERE id = $1', [uid]);
        if (user.rows.length === 0) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        const currentBalance = parseFloat(user.rows[0].balance || 0);
        const username = user.rows[0].username || 'Unknown';
        
        if (currentBalance < price) {
            return res.json({ success: false, message: 'ငွေမလုံလောက်ပါ' });
        }
        
        // ✅ Deduct balance
        const newBalance = currentBalance - price;
        await p.query('UPDATE auth_users SET balance = balance - $1 WHERE id = $2', [price, uid]);
        
        // ✅ Get product image URL
        let productImageUrl = getProductImageUrl(game, product_name);
        
        const paymentMethod = game.toUpperCase() + ' Purchase';
        
        // ✅ INSERT with order_type = 'game'
        const insertResult = await p.query(
            `INSERT INTO orders (user_id, username, amount, payment_method, screenshot, status, submitted_user_id, product_name, game_id, server_id, player_id, order_type, created_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()) RETURNING id`,
            [
                uid, 
                username, 
                -price, 
                paymentMethod, 
                productImageUrl,
                'pending',
                uid.toString(),
                product_name,
                game_id || null,
                server_id || null,
                player_id || null,
                'game'  // ✅ order_type = 'game'
            ]
        );
        
        const orderId = insertResult.rows[0].id;
        
        console.log('✅ [GAME PURCHASE] Order ID:', orderId, 'User:', uid, 'Game:', game, 'Product:', product_name, 'Price:', price, 'New Balance:', newBalance);
        
        // ✅ Telegram notification
        try {
            const gameDetails = game_id ? '🆔 ' + game_id + (server_id ? ' (' + server_id + ')' : '') : '';
            tgSend('🎮 Game Purchase\n👤 ' + username + '\n🎮 ' + game.toUpperCase() + '\n📦 ' + product_name + '\n💰 ' + price.toLocaleString() + ' Ks\n' + gameDetails + '\n⏳ Pending');
        } catch(e) {}
        
        res.json({
            success: true,
            message: 'ဝယ်ယူမှု အောင်မြင်ပါသည်။ Admin မှ ၃ မိနစ်အတွင်း အတည်ပြုပါမည်။',
            new_balance: newBalance,
            product: product_name,
            game: game,
            product_image: productImageUrl,
            order_id: orderId
        });
        
    } catch(e) {
        console.error('[PURCHASE GAME ITEM ERROR]', e.message);
        res.json({ success: false, message: 'Server error: ' + e.message });
    }
});
// ==================== GET PRODUCT IMAGE URL ====================
function getProductImageUrl(game, productName) {
    // MLBB Product Images
    const mlbbImages = {
        '5 Diamonds (5+0)': 'https://i.ibb.co/Nftqx8f/01-JS3-SZBBHTF0-QMWNE3-VY3-SH7-V.png',
        '11 Diamonds (10+1)': 'https://i.ibb.co/Nftqx8f/01-JS3-SZBBHTF0-QMWNE3-VY3-SH7-V.png',
        '22 Diamonds (20+2)': 'https://i.ibb.co/Nftqx8f/01-JS3-SZBBHTF0-QMWNE3-VY3-SH7-V.png',
        '55 Diamonds (50+5)': 'https://i.ibb.co/JWNBm8YQ/01-JNK3-Q7-NM1-K2-RHXAP8-ZSQHAMQ.png',
        '56 Diamonds (51+5)': 'https://i.ibb.co/JWNBm8YQ/01-JNK3-Q7-NM1-K2-RHXAP8-ZSQHAMQ.png',
        '86 Diamonds (78+8)': 'https://i.ibb.co/JWNBm8YQ/01-JNK3-Q7-NM1-K2-RHXAP8-ZSQHAMQ.png',
        '112 Diamonds (102+10)': 'https://i.ibb.co/S4MnMpXQ/01-JD9-FCWTADSQZNA61-T2-B8-RKY4.png',
        '165 Diamonds (150+15)': 'https://i.ibb.co/QF2QrQzZ/01-JNK3-K4-CF78-HAW68-VY2-B8-MVNZ.png',
        'Weekly Diamond Pass': 'https://i.ibb.co/gbY4GTvk/8cfaffbfa7aa9e957bb6da56f7fed781.jpg',
        'Twilight Pass': 'https://i.ibb.co/xcRdNfj/01-JED346-YHR0-Z1-YVSG81-DEMFYQ.png',
        'First Recharge 50+50': 'https://i.ibb.co/JWbn70T0/01-JSEPEK616-XR3-P8-SWTFH4-TQTD.png',
        'First Recharge 150+150': 'https://i.ibb.co/yMK1y2L/01-JSEPFNH4-BPJA6-TY0-HRVX8-PPX.png',
        'First Recharge 250+250': 'https://i.ibb.co/BHS071wB/01-JSEPG6-R0-J4-AMCXEQWHY0-V9-PW.png',
        'First Recharge 500+500': 'https://i.ibb.co/BHS071wB/01-JSEPG6-R0-J4-AMCXEQWHY0-V9-PW.png',
        'Epic Treasure (Weekly)': 'https://i.ibb.co/7JnFxhNQ/01-KG538-P2-SD5-RGD4-V8-MMWE0-HN6.jpg',
        'Epic Hero (Monthly)': 'https://i.ibb.co/7JnFxhNQ/01-KG538-P2-SD5-RGD4-V8-MMWE0-HN6.jpg'
    };
    
    // PUBG Product Images
    const pubgImages = {
        '60 UC': 'https://i.ibb.co/pBXCsdCW/01-K85-PFFBFP3-DQJXKGG9-JD9-YN2.jpg',
        '325 UC': 'https://i.ibb.co/23v79K9p/01-K85-PNG8-XXYY0-M19-ZVFZMT7-D6.jpg',
        '660 UC': 'https://i.ibb.co/Ldqz4LMY/01-K85-R7-JPGWH903890-XQXV3-JFN.jpg',
        '1800 UC': 'https://i.ibb.co/Ldqz4LMY/01-K85-R7-JPGWH903890-XQXV3-JFN.jpg',
        '3850 UC': 'https://i.ibb.co/Jj2xWCq5/01-K85-RDSC9-JWH8-W1-K15-R8-QZCGY.jpg',
        '8100 UC': 'https://i.ibb.co/Jj2xWCq5/01-K85-RDSC9-JWH8-W1-K15-R8-QZCGY.jpg'
    };
    
    // HOK Product Images
    const hokImages = {
        '16 Tokens': 'https://i.ibb.co/VcX4s8zY/e4597b399a7fe0d3af3af2f16461f647.jpg',
        '80 Tokens': 'https://i.ibb.co/VcX4s8zY/e4597b399a7fe0d3af3af2f16461f647.jpg',
        '240 Tokens': 'https://i.ibb.co/VcX4s8zY/e4597b399a7fe0d3af3af2f16461f647.jpg',
        '400 Tokens': 'https://i.ibb.co/VcX4s8zY/e4597b399a7fe0d3af3af2f16461f647.jpg',
        '560 Tokens': 'https://i.ibb.co/VcX4s8zY/e4597b399a7fe0d3af3af2f16461f647.jpg',
        '800 Tokens': 'https://i.ibb.co/VcX4s8zY/e4597b399a7fe0d3af3af2f16461f647.jpg',
        '1200 Tokens': 'https://i.ibb.co/VcX4s8zY/e4597b399a7fe0d3af3af2f16461f647.jpg',
        '2400 Tokens': 'https://i.ibb.co/VcX4s8zY/e4597b399a7fe0d3af3af2f16461f647.jpg'
    };
    
    if (game === 'mlbb') {
        return mlbbImages[productName] || 'https://i.ibb.co/XkST52ZT/9dad5c0fde6524c0fcffbb3b6060adf8.jpg';
    } else if (game === 'pubg') {
        return pubgImages[productName] || 'https://i.ibb.co/ccpjJN58/6cff530cefe3c08a01e01353e676d3ad.jpg';
    } else if (game === 'hok') {
        return hokImages[productName] || 'https://i.ibb.co/VcX4s8zY/e4597b399a7fe0d3af3af2f16461f647.jpg';
    }
    
    return '';
}
// ==================== SUBMIT ORDER (TOP-UP ONLY) ====================
app.post('/api/submit_order', async (req, res) => {
    try {
        const { token, amount, payment_method, screenshot, user_id } = req.body;
        
        if (!token || token === 'guest') {
            return res.json({ success: false, message: 'Login required' });
        }
        
        const jwt = require('jsonwebtoken');
        const JWT_SECRET = process.env.JWT_SECRET || 'solom-game-shop-secret-key-2026';
        const p = await getPool();
        let uid;
        
        // JWT Token
        if (token.startsWith('eyJ')) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                uid = decoded.userId || decoded.id || decoded.uid || decoded.user_id;
            } catch(e) {
                return res.json({ success: false, message: 'Invalid token' });
            }
        } else if (token.startsWith('token_')) {
            uid = parseInt(token.replace('token_', ''));
        } else if (/^\d+$/.test(token)) {
            uid = parseInt(token);
        } else {
            return res.json({ success: false, message: 'Invalid token format' });
        }
        
        if (!uid) {
            return res.json({ success: false, message: 'Invalid token payload' });
        }
        
        const user = await p.query('SELECT username FROM auth_users WHERE id=$1', [uid]);
        const un = user.rows[0]?.username || 'Unknown';
        
        // ✅ ORDER TYPE: 'topup' လို့ သတ်မှတ်ပါ
        await p.query(
            `INSERT INTO orders (user_id, username, amount, payment_method, screenshot, status, submitted_user_id, order_type) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [uid, un, amount || 0, payment_method, screenshot || '', 'pending', user_id || uid, 'topup']
        );
        
        res.json({ success: true, message: 'Order submitted' });
        
    } catch(e) {
        console.error('[SUBMIT ORDER ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});
// ==================== ORDER STATUS (ADMIN) ====================
app.post('/api/admin/order_status', async (req, res) => { 
    try { 
        const p = await getPool(); 
        const { id, status, reason } = req.body; 
        if (status === 'rejected') { 
            await p.query('UPDATE orders SET status=$1, reject_reason=$2 WHERE id=$3', [status, reason || '', id]); 
        } else { 
            await p.query('UPDATE orders SET status=$1 WHERE id=$2', [status, id]); 
        } 
        res.json({ success: true }); 
    } catch(e) { 
        res.json({ success: false }); 
    } 
});
// ==================== REJECT ORDER WITH AUTO REFUND ====================
app.post('/api/admin/order/reject', async (req, res) => {
    const { id, reason } = req.body;
    if (!id) return res.json({ success: false, message: 'Order ID required' });
    
    try {
        const p = await getPool();
        
        // Get order details
        const order = await p.query('SELECT * FROM orders WHERE id = $1', [id]);
        if (order.rows.length === 0) {
            return res.json({ success: false, message: 'Order not found' });
        }
        
        const o = order.rows[0];
        const userId = o.user_id;
        const amount = Math.abs(parseFloat(o.amount || 0));
        
        // Update order status to rejected
        await p.query(
            'UPDATE orders SET status = $1, reject_reason = $2 WHERE id = $3',
            ['rejected', reason || 'အချက်အလက်များ မှန်ကန်မှုမရှိပါ', id]
        );
        
        // ✅ Auto refund if amount > 0
        if (amount > 0 && userId) {
            await p.query(
                'UPDATE auth_users SET balance = COALESCE(balance, 0) + $1 WHERE id = $2',
                [amount, userId]
            );
            console.log(`[REFUND] User ${userId} refunded ${amount} Ks for order ${id}`);
        }
        
        res.json({ success: true, message: 'Order rejected and refunded' });
        
    } catch(e) {
        console.error('[REJECT ORDER ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});
// ==================== GET ORDER BY ID ====================
app.post('/api/order/by_id', async (req, res) => {
    const { orderId, token } = req.body;
    
    if (!orderId) return res.json({ success: false, message: 'Order ID required' });
    
    try {
        const p = await getPool();
        let uid = null;
        
        // Verify token
        if (token && token !== 'guest') {
            if (token.startsWith('eyJ')) {
                try {
                    const decoded = jwt.verify(token, JWT_SECRET);
                    uid = decoded.userId;
                } catch(e) {}
            } else if (token.startsWith('token_')) {
                uid = parseInt(token.replace('token_', ''));
            }
        }
        
        const order = await p.query('SELECT * FROM orders WHERE id = $1', [orderId]);
        
        if (order.rows.length === 0) {
            return res.json({ success: false, message: 'Order not found' });
        }
        
        const o = order.rows[0];
        
        // Check if user owns this order (if logged in)
        if (uid && o.user_id !== uid) {
            return res.json({ success: false, message: 'Not your order' });
        }
        
        res.json({ success: true, order: o });
        
    } catch(e) {
        console.error('[ORDER BY ID ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});
// ==================== BULK APPROVE ALL PENDING ORDERS ====================
app.post('/api/admin/orders/approve_all_pending', async (req, res) => {
    try {
        const p = await getPool();
        
        // Get all pending orders
        const pendingOrders = await p.query(
            "SELECT * FROM orders WHERE status = 'pending' ORDER BY id ASC"
        );
        
        if (pendingOrders.rows.length === 0) {
            return res.json({ success: false, message: 'No pending orders' });
        }
        
        let approvedCount = 0;
        let totalAmount = 0;
        
        for (const order of pendingOrders.rows) {
            const userId = order.user_id;
            const amount = Math.abs(parseFloat(order.amount || 0));
            
            // Update order status
            await p.query(
                "UPDATE orders SET status = 'approved' WHERE id = $1",
                [order.id]
            );
            
            // Add balance to user
            if (amount > 0 && userId) {
                await p.query(
                    'UPDATE auth_users SET balance = COALESCE(balance, 0) + $1 WHERE id = $2',
                    [amount, userId]
                );
                totalAmount += amount;
            }
            
            approvedCount++;
        }
        
        console.log(`[BULK APPROVE] Approved ${approvedCount} orders, total amount: ${totalAmount} Ks`);
        
        res.json({ 
            success: true, 
            message: `✅ Approved ${approvedCount} orders, total +${totalAmount.toLocaleString()} Ks`,
            count: approvedCount,
            total_amount: totalAmount
        });
        
    } catch(e) {
        console.error('[BULK APPROVE ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});
// ==================== NOTICES ====================
app.get('/api/notice', async (req, res) => { 
    try { 
        const p = await getPool(); 
        const r = await p.query("SELECT * FROM notices WHERE notice_type='dashboard' OR notice_type IS NULL ORDER BY id DESC LIMIT 1"); 
        if (r.rows.length === 0) return res.json({ message: '' }); 
        const n = r.rows[0]; 
        res.json({ success: true, message: n.message, color: n.color, created_at: n.created_at }); 
    } catch(e) { 
        res.json({ message: '' }); 
    } 
});

app.get('/api/admin/notices', async (req, res) => { 
    try { 
        const p = await getPool(); 
        const r = await p.query("SELECT * FROM notices WHERE notice_type='dashboard' OR notice_type IS NULL ORDER BY id DESC"); 
        res.json({ notices: r.rows }); 
    } catch(e) { 
        res.json({ notices: [] }); 
    } 
});

app.post('/api/admin/notice', async (req, res) => { 
    try { 
        const p = await getPool(); 
        const { message, color } = req.body; 
        if (!message) return res.json({ success: false }); 
        await p.query("INSERT INTO notices (message,color,created_by,notice_type) VALUES ($1,$2,$3,'dashboard')", [message, color||'#fff', 'admin']); 
        res.json({ success: true }); 
    } catch(e) { 
        res.json({ success: false }); 
    } 
});

app.post('/api/admin/notice/delete', async (req, res) => { 
    try { 
        const p = await getPool(); 
        await p.query('DELETE FROM notices WHERE id=$1', [req.body.id]); 
        res.json({ success: true }); 
    } catch(e) { 
        res.json({ success: false }); 
    } 
});

app.post('/api/admin/notices/delete_all', async (req, res) => { 
    try { 
        const p = await getPool(); 
        await p.query("DELETE FROM notices WHERE notice_type='dashboard' OR notice_type IS NULL"); 
        res.json({ success: true }); 
    } catch(e) { 
        res.json({ success: false }); 
    } 
});

// Top Up Notice
app.get('/api/topup_notice', async (req, res) => { 
    try { 
        const p = await getPool(); 
        const r = await p.query("SELECT * FROM notices WHERE notice_type='topup' ORDER BY id DESC LIMIT 1"); 
        if (r.rows.length === 0) return res.json({ message: '' }); 
        const n = r.rows[0]; 
        res.json({ success: true, message: n.message, color: n.color, created_at: n.created_at }); 
    } catch(e) { 
        res.json({ message: '' }); 
    } 
});

app.get('/api/admin/topup_notices', async (req, res) => { 
    try { 
        const p = await getPool(); 
        const r = await p.query("SELECT * FROM notices WHERE notice_type='topup' ORDER BY id DESC"); 
        res.json({ notices: r.rows }); 
    } catch(e) { 
        res.json({ notices: [] }); 
    } 
});

app.post('/api/admin/topup_notice', async (req, res) => { 
    try { 
        const p = await getPool(); 
        const { message, color } = req.body; 
        if (!message) return res.json({ success: false }); 
        await p.query("INSERT INTO notices (message,color,created_by,notice_type) VALUES ($1,$2,$3,'topup')", [message, color||'#fff', 'admin']); 
        res.json({ success: true }); 
    } catch(e) { 
        res.json({ success: false }); 
    } 
});

app.post('/api/admin/topup_notice/delete', async (req, res) => { 
    try { 
        const p = await getPool(); 
        await p.query("DELETE FROM notices WHERE id=$1 AND notice_type='topup'", [req.body.id]); 
        res.json({ success: true }); 
    } catch(e) { 
        res.json({ success: false }); 
    } 
});

app.post('/api/admin/topup_notices/delete_all', async (req, res) => { 
    try { 
        const p = await getPool(); 
        await p.query("DELETE FROM notices WHERE notice_type='topup'"); 
        res.json({ success: true }); 
    } catch(e) { 
        res.json({ success: false }); 
    } 
});

// Buy Code Notice
app.get('/api/buycode_notice', async (req, res) => { 
    try { 
        const p = await getPool(); 
        const r = await p.query("SELECT * FROM notices WHERE notice_type='buycode' ORDER BY id DESC LIMIT 1"); 
        if (r.rows.length === 0) return res.json({ message: '' }); 
        const n = r.rows[0]; 
        res.json({ success: true, message: n.message, color: n.color, created_at: n.created_at }); 
    } catch(e) { 
        res.json({ message: '' }); 
    } 
});

app.get('/api/admin/buycode_notices', async (req, res) => { 
    try { 
        const p = await getPool(); 
        const r = await p.query("SELECT * FROM notices WHERE notice_type='buycode' ORDER BY id DESC"); 
        res.json({ notices: r.rows }); 
    } catch(e) { 
        res.json({ notices: [] }); 
    } 
});

app.post('/api/admin/buycode_notice', async (req, res) => { 
    try { 
        const p = await getPool(); 
        const { message, color } = req.body; 
        if (!message) return res.json({ success: false }); 
        await p.query("INSERT INTO notices (message,color,created_by,notice_type) VALUES ($1,$2,$3,'buycode')", [message, color||'#fff', 'admin']); 
        res.json({ success: true }); 
    } catch(e) { 
        res.json({ success: false }); 
    } 
});

app.post('/api/admin/buycode_notice/delete', async (req, res) => { 
    try { 
        const p = await getPool(); 
        await p.query("DELETE FROM notices WHERE id=$1 AND notice_type='buycode'", [req.body.id]); 
        res.json({ success: true }); 
    } catch(e) { 
        res.json({ success: false }); 
    } 
});

app.post('/api/admin/buycode_notices/delete_all', async (req, res) => { 
    try { 
        const p = await getPool(); 
        await p.query("DELETE FROM notices WHERE notice_type='buycode'"); 
        res.json({ success: true }); 
    } catch(e) { 
        res.json({ success: false }); 
    } 
});
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
// ==================== TELEGRAM BOT (မြန်မာလို - ALL FIXED) ====================
let lastUpdateId = 0;

function sendTelegramMessage(chatId, text, replyMarkup = null) {
    const body = { chat_id: chatId, text, parse_mode: 'HTML' };
    if (replyMarkup) body.reply_markup = JSON.stringify(replyMarkup);
    https.get(`${TELEGRAM_API}/sendMessage?${new URLSearchParams(body).toString()}`, (res) => {
        res.on('data', () => {});
    }).on('error', () => {});
}

async function sendPaymentInvoice(chatId, amount, description) {
    try {
        const response = await fetch(`${TELEGRAM_API}/sendInvoice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                title: 'SOLO M Game Shop',
                description: description,
                payload: 'topup_' + Date.now(),
                provider_token: TELEGRAM_PAYMENT_TOKEN,
                currency: 'XTR',
                prices: [{ label: description, amount: amount }]
            })
        });
        return await response.json();
    } catch(e) { return null; }
}

async function createTelegramUser(userId, firstName) {
    try {
        const p = await getPool();
        const tgId = 'tg_' + userId;
        const exist = await p.query("SELECT * FROM auth_users WHERE google_id = $1", [tgId]);
        
        if (exist.rows.length > 0) {
            await p.query('UPDATE auth_users SET last_login = NOW() WHERE id = $1', [exist.rows[0].id]);
            trackTelegramLogin(exist.rows[0].id, exist.rows[0].username || firstName);
            return { id: exist.rows[0].id, isNew: false, balance: exist.rows[0].balance || 0 };
        }
        
        const displayName = firstName || 'TG User';
        const email = 'tg_' + userId + '@telegram.com';
        
        const nu = await p.query(
            'INSERT INTO auth_users (username, email, google_id, login_type, balance) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [displayName, email, tgId, 'telegram', 0]
        );
        
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

async function getUserPremium(userId) {
    try {
        const p = await getPool();
        const user = await p.query("SELECT id FROM auth_users WHERE google_id = $1", ['tg_' + userId]);
        if (user.rows.length === 0) return null;
        
        const r = await p.query("SELECT premium_tier, premium_expiry FROM auth_users WHERE id = $1", [user.rows[0].id]);
        if (r.rows.length > 0) {
            const tier = r.rows[0].premium_tier || 1;
            const expiry = r.rows[0].premium_expiry;
            const tierNames = ['', '🥉 Bronze', '🥈 Silver', '🥇 Gold', '💎 Diamond'];
            return {
                tier: tier,
                tierName: tierNames[tier] || 'Free',
                expiry: expiry,
                isExpired: expiry ? new Date(expiry) < new Date() : true
            };
        }
        return { tier: 1, tierName: 'Free', expiry: null, isExpired: true };
    } catch(e) { return null; }
}

async function getDailyCheckinStatus(userId) {
    try {
        const p = await getPool();
        const user = await p.query("SELECT id FROM auth_users WHERE google_id = $1", ['tg_' + userId]);
        if (user.rows.length === 0) return null;
        
        const r = await p.query(
            "SELECT current_day, last_claim_date FROM daily_checkin_progress WHERE user_id = $1 AND event_id = (SELECT id FROM daily_checkin_events WHERE is_active = true AND cancelled = false ORDER BY id DESC LIMIT 1)",
            [user.rows[0].id]
        );
        
        if (r.rows.length > 0) {
            const today = new Date().toISOString().split('T')[0];
            const lastClaim = r.rows[0].last_claim_date ? new Date(r.rows[0].last_claim_date).toISOString().split('T')[0] : null;
            return {
                currentDay: r.rows[0].current_day,
                claimedToday: lastClaim === today
            };
        }
        return { currentDay: 1, claimedToday: false };
    } catch(e) { return null; }
}

async function getUserSpinHistory(userId) {
    try {
        const p = await getPool();
        const user = await p.query("SELECT id FROM auth_users WHERE google_id = $1", ['tg_' + userId]);
        if (user.rows.length === 0) return [];
        
        const r = await p.query(
            "SELECT reward_type, reward_amount, created_at FROM spin_history_v2 WHERE user_id = $1 ORDER BY id DESC LIMIT 5",
            [user.rows[0].id]
        );
        return r.rows;
    } catch(e) { return []; }
}

function startLongPolling() {
    console.log('🤖 Telegram Bot စတင်ပါပြီ');
    
    const BASE_URL = 'https://solo-m-store-security-system-and-user.onrender.com';
    
    const mainKeyboard = {
        inline_keyboard: [
            [{ text: '🏠 အကောင့်ဝင်ရန်', url: BASE_URL }],
            [{ text: '💰 ငွေဖြည့်ရန်', url: BASE_URL + '/topup.html' }],
            [{ text: '🛒 Code ဝယ်ရန်', url: BASE_URL + '/buycode.html' }],
            [{ text: '🎰 Lucky Spin', url: BASE_URL + '/game.html' }],
            [{ text: '📞 Admin ဆက်သွယ်ရန်', url: 'https://t.me/Solo_m28' }]
        ]
    };
    
    const quickKeyboard = {
    inline_keyboard: [
        [{ text: '💳 လက်ကျန်ကြည့်ရန်', callback_data: 'balance' }],
        [{ text: '⭐ Stars ဖြည့်ရန်', callback_data: 'topup_stars' }],
        [{ text: '🔐 OTP ရယူရန်', callback_data: 'otp' }],
        [{ text: '📋 Order စစ်ရန်', callback_data: 'status' }],
        [{ text: '👑 Premium', callback_data: 'premium' }],
        [{ text: '📅 Daily Check-in', callback_data: 'checkin' }],
        [{ text: '🎰 Spin History', callback_data: 'spins' }],
        [{ text: '🛒 Code ဝယ်ရန်', callback_data: 'buycode' }],
        [{ text: '📞 ဆက်သွယ်ရန်', url: 'https://t.me/Solo_m28' }],
        [{ text: '📱 App ဒေါင်းရန်', url: 'https://drive.google.com/file/d/13Adx-ucYt7JzDxR1ZFOxV2pUH6UtLxqd/view?usp=drivesdk' }]
    ]
};
    
    // ==================== CALLBACK HANDLER ====================
    async function handleCallback(cq) {
        const chatId = cq.message.chat.id;
        const data = cq.data;
        const firstName = cq.from.first_name || 'User';
        
        // ✅ Answer callback query FIRST
        try {
            await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callback_query_id: cq.id })
            });
        } catch(e) {}
        
        const user = await createTelegramUser(cq.from.id, firstName);
        if (!user) {
            sendTelegramMessage(chatId, '❌ Error ရှိနေပါသည်။ /start ကိုနှိပ်ပါ', quickKeyboard);
            return;
        }
        
        // 💳 Balance
        if (data === 'balance') {
            const balance = user.balance || 0;
            sendTelegramMessage(chatId, 
                `💳 <b>သင့်လက်ကျန်</b>\n\n` +
                `💰 <b>${balance.toLocaleString()} ကျပ်</b>\n` +
                `💵 ≈ $${(balance/2100).toFixed(2)} USD`,
                quickKeyboard
            );
        }
        
        // ⭐ Stars Top Up
        else if (data === 'topup_stars') {
            const topupKeyboard = {
                inline_keyboard: [
                    [{ text: '⭐ 50 Stars', callback_data: 'pay_50' }],
                    [{ text: '⭐ 100 Stars', callback_data: 'pay_100' }],
                    [{ text: '⭐ 500 Stars', callback_data: 'pay_500' }],
                    [{ text: '⭐ 1000 Stars', callback_data: 'pay_1000' }],
                    [{ text: '« နောက်သို့', callback_data: 'back_to_main' }]
                ]
            };
            sendTelegramMessage(chatId, '💰 ဖြည့်လိုသော Stars ပမာဏကို ရွေးချယ်ပါ -', topupKeyboard);
        }
        else if (data === 'pay_50') {
            await sendPaymentInvoice(chatId, 50, 'Top Up 50 Stars');
        }
        else if (data === 'pay_100') {
            await sendPaymentInvoice(chatId, 100, 'Top Up 100 Stars');
        }
        else if (data === 'pay_500') {
            await sendPaymentInvoice(chatId, 500, 'Top Up 500 Stars');
        }
        else if (data === 'pay_1000') {
            await sendPaymentInvoice(chatId, 1000, 'Top Up 1000 Stars');
        }
        else if (data === 'back_to_main') {
            sendTelegramMessage(chatId, '« ပင်မစာမျက်နှာသို့ ပြန်ရောက်ပါပြီ', quickKeyboard);
        }
        
        // 🔐 OTP
        else if (data === 'otp') {
            const otp = await createOTP(user.id);
            sendTelegramMessage(chatId, 
                `🔐 <b>သင့် OTP ကုဒ်</b>\n\n` +
                `🔢 <b>${otp}</b>\n\n` +
                `⏰ ၆၀ စက္ကန့်အတွင်း အသုံးပြုပါ。\n` +
                `⚠️ မည်သူ့ကိုမျှ မပေးပါနှင့်。`,
                quickKeyboard
            );
        }
        
        // 📋 Order Status
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
        
        // 👑 Premium
        else if (data === 'premium') {
            const premium = await getUserPremium(cq.from.id);
            if (premium) {
                let msg = `👑 <b>Premium Status</b>\n\n`;
                msg += `⭐ Tier: <b>${premium.tierName}</b>\n`;
                if (premium.expiry) {
                    msg += `📅 သက်တမ်းကုန်: <b>${new Date(premium.expiry).toLocaleDateString()}</b>\n`;
                    msg += `✅ Status: ${premium.isExpired ? '❌ ကုန်သွားပါပြီ' : '✅ Active'}\n`;
                } else {
                    msg += `📅 Status: Free Tier\n`;
                }
                msg += `\n🌐 Premium ဝယ်ယူရန်: ${BASE_URL}/premium.html`;
                sendTelegramMessage(chatId, msg, quickKeyboard);
            }
        }
        
        // 📅 Daily Check-in
        else if (data === 'checkin') {
            const checkin = await getDailyCheckinStatus(cq.from.id);
            if (checkin) {
                let msg = `📅 <b>Daily Check-in</b>\n\n`;
                msg += `🔢 လက်ရှိနေ့: <b>Day ${checkin.currentDay}</b>\n`;
                msg += `✅ ဒီနေ့: ${checkin.claimedToday ? '✅ ရယူပြီးပါပြီ' : '⚠️ မရယူရသေးပါ'}\n\n`;
                msg += `🌐 Check-in လုပ်ရန်: ${BASE_URL}/game.html`;
                sendTelegramMessage(chatId, msg, quickKeyboard);
            }
        }
        
        // 🎰 Spin History
        else if (data === 'spins') {
            const spins = await getUserSpinHistory(cq.from.id);
            if (spins.length === 0) {
                sendTelegramMessage(chatId, '🎰 Spin မလုပ်ရသေးပါ。', quickKeyboard);
            } else {
                let msg = '🎰 <b>နောက်ဆုံး Spin မှတ်တမ်း</b>\n\n';
                spins.forEach(s => {
                    const emoji = s.reward_type === 'usd' ? '💵' : '💰';
                    msg += `${emoji} ${s.reward_amount} ${s.reward_type?.toUpperCase() || ''} | 📅 ${new Date(s.created_at).toLocaleDateString()}\n`;
                });
                msg += `\n🎰 Spin လုပ်ရန်: ${BASE_URL}/game.html`;
                sendTelegramMessage(chatId, msg, quickKeyboard);
            }
        }
        
        // 🛒 Buy Code
        else if (data === 'buycode') {
            sendTelegramMessage(chatId, 
                '🛒 <b>Code ဝယ်ယူရန်</b>\n\n' +
                `🌐 ${BASE_URL}/buycode.html\n\n` +
                '<b>Code အမျိုးအစားများ:</b>\n' +
                '• Shhh Emote - 2,500 Ks\n' +
                '• Golden Border - 3,500 Ks\n' +
                '• Lucky Diamond - 2,000 Ks\n' +
                '• Magic Durt - 1,500 Ks\n' +
                '• Emblem Box - 1,500 Ks',
                mainKeyboard
            );
        }
    }
    
    // ==================== MESSAGE HANDLER ====================
    async function handleMessage(msg) {
        const chatId = msg.chat.id;
        const text = (msg.text || '').trim();
        const firstName = msg.from.first_name || 'User';
        
        if (text === '/start' || text === '/login') {
            const user = await createTelegramUser(msg.from.id, firstName);
            const welcomeMsg = user.isNew ? 
                `🎉 <b>SOLO M Game Shop မှ ကြိုဆိုပါတယ်!</b>\n\nမင်္ဂလာပါ ${firstName}!\n\nသင့်အကောင့်ကို အလိုအလျောက် ဖွင့်ပေးပြီးပါပြီ。` :
                `👋 ပြန်လည်ကြိုဆိုပါတယ် ${firstName}!`;
            
            sendTelegramMessage(chatId, 
                welcomeMsg + '\n\n' +
                '💳 လက်ကျန်: <b>' + (user.balance || 0).toLocaleString() + ' ကျပ်</b>\n\n' +
                '<b>🆕 Update အသစ်များ:</b>\n' +
                '• 🔐 OTP 2-Step Login System\n' +
                '• 🎰 Lucky Spin 2.0\n' +
                '• 👑 Premium Tier System\n' +
                '• 📅 Daily Check-in Rewards\n' +
                '• 💱 USD Exchange\n' +
                '• 💬 Chat System\n\n' +
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
                `/premium - Premium Status\n` +
                `/spins - Spin History\n` +
                `/buy - Code ဝယ်ရန်\n\n` +
                `<b>🆕 Features:</b>\n` +
                '• 🔐 OTP 2-Step Login\n' +
                '• 🎰 Lucky Spin Game\n' +
                '• 👑 Bronze/Silver/Gold Premium\n' +
                '• 📅 Daily Check-in System\n' +
                '• 💱 USD Exchange\n' +
                '• 💬 Live Chat\n\n' +
                `<b>🌐 Website:</b> ${BASE_URL}\n` +
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
                    `🔐 <b>သင့် OTP ကုဒ်</b>\n\n🔢 <b>${otp}</b>\n\n⏰ ၆၀ စက္ကန့်အတွင်း အသုံးပြုပါ。\n\n🌐 ${BASE_URL}`
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
        else if (text === '/premium') {
            const premium = await getUserPremium(msg.from.id);
            if (premium) {
                let msg = `👑 <b>သင့် Premium Status</b>\n\n`;
                msg += `⭐ Tier: <b>${premium.tierName}</b>\n`;
                if (premium.expiry) {
                    msg += `📅 သက်တမ်းကုန်: <b>${new Date(premium.expiry).toLocaleDateString()}</b>\n`;
                }
                sendTelegramMessage(chatId, msg, quickKeyboard);
            }
        }
        else if (text === '/spins') {
            const spins = await getUserSpinHistory(msg.from.id);
            if (spins.length === 0) {
                sendTelegramMessage(chatId, '🎰 Spin မလုပ်ရသေးပါ။');
            } else {
                let msg = '🎰 <b>သင့် Spin မှတ်တမ်း</b>\n\n';
                spins.forEach(s => {
                    msg += `🎁 ${s.reward_amount} ${s.reward_type?.toUpperCase() || ''} | 📅 ${new Date(s.created_at).toLocaleDateString()}\n`;
                });
                sendTelegramMessage(chatId, msg, quickKeyboard);
            }
        }
        else if (text === '/buy') {
            sendTelegramMessage(chatId, 
                '🛒 <b>Code ဝယ်ယူရန်</b>\n\n' +
                `🌐 ${BASE_URL}/buycode.html\n\n` +
                '<b>ရနိုင်သော Code များ:</b>\n' +
                '• Shhh Emote - 2,500 Ks\n' +
                '• Golden Border - 3,500 Ks\n' +
                '• Lucky Diamond - 2,000 Ks\n' +
                '• Magic Durt - 1,500 Ks\n' +
                '• Emblem Box - 1,500 Ks',
                mainKeyboard
            );
        }
        else if (text === '/topup') {
            const topupKeyboard = {
                inline_keyboard: [
                    [{ text: '⭐ 50 Stars', callback_data: 'pay_50' }],
                    [{ text: '⭐ 100 Stars', callback_data: 'pay_100' }],
                    [{ text: '⭐ 500 Stars', callback_data: 'pay_500' }],
                    [{ text: '⭐ 1000 Stars', callback_data: 'pay_1000' }]
                ]
            };
            sendTelegramMessage(chatId, '💰 ဖြည့်လိုသော Stars ပမာဏကို ရွေးချယ်ပါ -', topupKeyboard);
        }
        else {
            sendTelegramMessage(chatId, 
                `အောက်ပါ Commands များကို အသုံးပြုပါ။\n\n` +
                `/start - စတင်ရန်\n` +
                `/help - အကူအညီ\n` +
                `/balance - လက်ကျန်ကြည့်ရန်\n` +
                `/otp - OTP Code\n` +
                `/status - Order မှတ်တမ်း\n` +
                `/premium - Premium Status\n` +
                `/spins - Spin History\n` +
                `/buy - Code ဝယ်ယူရန်\n` +
                `/topup - Stars ဖြည့်ရန်`,
                quickKeyboard
            );
        }
    }
    
    // ==================== PRE CHECKOUT HANDLER ====================
    async function handlePreCheckout(pq) {
        try {
            await fetch(`${TELEGRAM_API}/answerPreCheckoutQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pre_checkout_query_id: pq.id,
                    ok: true
                })
            });
        } catch(e) {
            console.log('Pre-checkout error:', e.message);
        }
    }
    
    // ==================== SUCCESSFUL PAYMENT HANDLER ====================
    async function handleSuccessfulPayment(msg) {
        const payment = msg.successful_payment;
        const chatId = msg.chat.id;
        const firstName = msg.from.first_name || 'User';
        
        const amount = payment.total_amount;
        const currency = payment.currency;
        
        // Create/Get user
        const user = await createTelegramUser(msg.from.id, firstName);
        if (!user) return;
        
        try {
            const p = await getPool();
            
            // Add balance (Stars → MMK conversion)
            // 1 Star ≈ 210 Ks (example rate)
            const mmkAmount = amount * 210;
            
            await p.query(
                'UPDATE auth_users SET balance = COALESCE(balance, 0) + $1 WHERE id = $2',
                [mmkAmount, user.id]
            );
            
            // Log order
            await p.query(
                "INSERT INTO orders (user_id, username, amount, payment_method, status) VALUES ($1, $2, $3, $4, 'approved')",
                [user.id, firstName, mmkAmount, 'Stars ' + amount + ' ⭐']
            );
            
            sendTelegramMessage(chatId,
                `✅ <b>ငွေဖြည့်မှု အောင်မြင်ပါသည်!</b>\n\n` +
                `⭐ Stars: <b>${amount} ⭐</b>\n` +
                `💰 လက်ကျန်ထည့်ငွေ: <b>${mmkAmount.toLocaleString()} ကျပ်</b>\n\n` +
                `💳 လက်ကျန်ကြည့်ရန် /balance ကိုနှိပ်ပါ။`,
                quickKeyboard
            );
            
            // Admin notification
            tgSend(`💎 Stars Top Up!\n👤 ${firstName}\n⭐ ${amount} Stars\n💰 +${mmkAmount.toLocaleString()} Ks`);
            
        } catch(e) {
            console.log('Payment processing error:', e.message);
            sendTelegramMessage(chatId, '❌ ငွေဖြည့်မှု မအောင်မြင်ပါ။ Admin ကိုဆက်သွယ်ပါ။');
        }
    }
    
    // ==================== MAIN POLLING LOOP ====================
    async function getUpdates() {
    try {
        const allowed = encodeURIComponent(JSON.stringify(["message", "callback_query", "pre_checkout_query"]));
        const url = `${TELEGRAM_API}/getUpdates?offset=${lastUpdateId + 1}&timeout=15&allowed_updates=${allowed}`;
        
        const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
        const result = await response.json();
        
        if (result.ok && result.result.length > 0) {
            for (const update of result.result) {
                lastUpdateId = update.update_id;
                
                // Callback query (Button clicks)
                if (update.callback_query) {
                    await handleCallback(update.callback_query);
                    continue;
                }
                
                // Pre-checkout
                if (update.pre_checkout_query) {
                    await handlePreCheckout(update.pre_checkout_query);
                    continue;
                }
                
                // Message
                if (update.message) {
                    if (update.message.successful_payment) {
                        await handleSuccessfulPayment(update.message);
                        continue;
                    }
                    if (update.message.text) {
                        await handleMessage(update.message);
                    }
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

// ==================== BUY CODE API (FULLY REWRITTEN) ====================
app.post('/api/buy_code', async (req, res) => {
    const { token, codeId } = req.body;
    console.log('[BUY CODE API] Received:', { token: token?.substring(0, 20) + '...', codeId });

    if (!token || !codeId) {
        return res.json({ success: false, message: 'Missing data' });
    }

    try {
        const p = await getPool();
        let uid = null;

        // ========== 1. TOKEN PARSING (Support both JWT and old format) ==========
        // Method A: JWT Token (starts with eyJ)
        if (token.startsWith('eyJ')) {
            try {
                const jwt = require('jsonwebtoken');
                const JWT_SECRET = process.env.JWT_SECRET || 'solom-game-shop-secret-key-2026';
                const decoded = jwt.verify(token, JWT_SECRET);
                uid = decoded.userId || decoded.id || decoded.uid;
                console.log('[BUY CODE API] JWT Decoded UID:', uid);
            } catch (e) {
                console.error('[BUY CODE API] JWT Error:', e.message);
                return res.json({ success: false, message: 'Invalid session. Please login again.' });
            }
        }
        // Method B: Old token format (token_123)
        else if (token.startsWith('token_')) {
            uid = parseInt(token.replace('token_', ''));
            if (isNaN(uid)) {
                return res.json({ success: false, message: 'Invalid token format' });
            }
            console.log('[BUY CODE API] Old Token UID:', uid);
        }
        // Method C: Direct numeric token
        else if (/^\d+$/.test(token)) {
            uid = parseInt(token);
            console.log('[BUY CODE API] Numeric Token UID:', uid);
        }
        else {
            return res.json({ success: false, message: 'Invalid token format' });
        }

        if (!uid || isNaN(uid)) {
            return res.json({ success: false, message: 'Invalid user ID from token' });
        }

        // ========== 2. FIND CODE IN DATABASE ==========
        // First, check if this is a hardcoded ID (1-13) from frontend
        let query;
        let params;
        const numericCodeId = parseInt(codeId);

        if (numericCodeId <= 13 && numericCodeId >= 1) {
            // Map hardcoded ID to category
            const catMap = {
                1: 'shhh_emote', 2: 'shhh_emote', 3: 'shhh_emote', 4: 'shhh_emote',
                5: 'golden_border', 6: 'golden_border', 7: 'golden_border', 8: 'golden_border',
                9: 'lucky_diamond', 10: 'lucky_diamond', 11: 'lucky_diamond',
                12: 'magic_durt',
                13: 'emblem_box'
            };
            const category = catMap[numericCodeId];
            if (!category) {
                return res.json({ success: false, message: 'Invalid category' });
            }
            // Find first available code in that category
            query = 'SELECT * FROM redeem_codes WHERE category = $1 AND used = false ORDER BY id ASC LIMIT 1';
            params = [category];
            console.log('[BUY CODE API] Looking for code in category:', category);
        } else {
            // Direct ID lookup (for Admin-added codes)
            query = 'SELECT * FROM redeem_codes WHERE id = $1 AND used = false';
            params = [numericCodeId];
            console.log('[BUY CODE API] Looking for code by ID:', numericCodeId);
        }

        const codeCheck = await p.query(query, params);
        console.log('[BUY CODE API] Code found:', codeCheck.rows.length > 0);

        if (codeCheck.rows.length === 0) {
            return res.json({ success: false, message: 'Code not available - All codes in this category are used' });
        }

        const code = codeCheck.rows[0];

        // ========== 3. GET PRICE FROM REDEEM_CATEGORIES ==========
        const cat = REDEEM_CATEGORIES.find(c => c.id === code.category);
        const price = cat ? cat.price : 0;
        console.log('[BUY CODE API] Category:', code.category, 'Price:', price);

        if (price <= 0) {
            return res.json({ success: false, message: 'Invalid price for this code' });
        }

        // ========== 4. CHECK USER BALANCE ==========
        const user = await p.query('SELECT balance FROM auth_users WHERE id = $1', [uid]);
        if (user.rows.length === 0) {
            return res.json({ success: false, message: 'User not found' });
        }

        const balance = parseFloat(user.rows[0].balance || 0);
        if (balance < price) {
            return res.json({ 
                success: false, 
                message: `Insufficient balance. Need ${price.toLocaleString()} Ks, you have ${balance.toLocaleString()} Ks` 
            });
        }

        // ========== 5. MARK CODE AS USED & DEDUCT BALANCE ==========
        await p.query('UPDATE redeem_codes SET used = true, used_by = $1, used_at = NOW() WHERE id = $2', [uid, code.id]);
        await p.query('UPDATE auth_users SET balance = balance - $1 WHERE id = $2', [price, uid]);

        const newBalance = balance - price;
        console.log('[BUY CODE API] SUCCESS! User:', uid, 'Code:', code.code, 'New Balance:', newBalance);

        // ========== 6. SEND RESPONSE ==========
        res.json({ 
            success: true, 
            code: code.code, 
            balance: newBalance,
            message: 'Code purchased successfully!'
        });

    } catch (e) {
        console.error('[BUY CODE API ERROR]', e);
        res.json({ success: false, message: 'Server error: ' + e.message });
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

// ==================== GET USD BALANCE (JWT FIXED - COMPLETE) ====================
app.post('/api/get_usd_balance', async (req, res) => {
    const { token } = req.body;
    
    if (!token || token === 'guest') {
        return res.json({ usd_balance: 0 });
    }
    
    try {
        const jwt = require('jsonwebtoken');
        const JWT_SECRET = process.env.JWT_SECRET || 'solom-game-shop-secret-key-2026';
        const p = await getPool();
        let uid;
        
        if (token.startsWith('eyJ')) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                uid = decoded.userId || decoded.id || decoded.uid || decoded.user_id;
            } catch(e) {
                return res.json({ usd_balance: 0 });
            }
        } else if (token.startsWith('token_')) {
            uid = parseInt(token.replace('token_', ''));
            if (isNaN(uid)) return res.json({ usd_balance: 0 });
        } else {
            return res.json({ usd_balance: 0 });
        }
        
        if (!uid) return res.json({ usd_balance: 0 });
        
        const result = await p.query('SELECT usd_balance FROM auth_users WHERE id = $1', [uid]);
        
        if (result.rows.length > 0) {
            res.json({ usd_balance: parseFloat(result.rows[0].usd_balance || 0) });
        } else {
            res.json({ usd_balance: 0 });
        }
        
    } catch(e) {
        res.json({ usd_balance: 0 });
    }
});
// ==================== GET PAID SPINS (JWT FIXED) ====================
app.post('/api/get_paid_spins', async (req, res) => {
    const { token } = req.body;
    if (!token || token === 'guest') return res.json({ paid_spins: 0 });
    try {
        const p = await getPool();
        let uid;
        
        // ✅ JWT Token
        if (token.startsWith('eyJ')) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                uid = decoded.userId;
            } catch(e) {
                return res.json({ paid_spins: 0 });
            }
        } 
        // ✅ Old Token
        else if (token.startsWith('token_')) {
            uid = parseInt(token.replace('token_', ''));
        } 
        else {
            return res.json({ paid_spins: 0 });
        }
        
        if (isNaN(uid)) return res.json({ paid_spins: 0 });
        const r = await p.query('SELECT paid_spins FROM auth_users WHERE id=$1', [uid]);
        res.json({ paid_spins: parseInt(r.rows[0]?.paid_spins || 0) });
    } catch(e) { res.json({ paid_spins: 0 }); }
});

// ==================== GET PREMIUM STATUS (JWT FIXED) ====================
app.post('/api/get_premium_status', async (req, res) => {
    const { token } = req.body;
    if (!token || token === 'guest') return res.json({ success: false, premium_active: false });
    try {
        const p = await getPool();
        let uid;
        
        // ✅ JWT Token
        if (token.startsWith('eyJ')) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                uid = decoded.userId;
            } catch(e) {
                return res.json({ success: false, premium_active: false });
            }
        } 
        // ✅ Old Token
        else if (token.startsWith('token_')) {
            uid = parseInt(token.replace('token_', ''));
        } 
        else {
            return res.json({ success: false, premium_active: false });
        }
        
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
// ==================== DEDUCT BALANCE (BUY SPINS - JWT FIXED) ====================
app.post('/api/deduct_balance', async (req, res) => {
    const { token, amount, reason } = req.body;
    
    if (!token || token === 'guest') {
        return res.json({ success: false, message: 'Login required' });
    }
    
    try {
        const p = await getPool();
        let uid;
        
        // ✅ JWT Token
        if (token.startsWith('eyJ')) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                uid = decoded.userId;
            } catch(e) {
                return res.json({ success: false, message: 'Invalid session' });
            }
        } 
        // ✅ Old Token
        else if (token.startsWith('token_')) {
            uid = parseInt(token.replace('token_', ''));
            if (isNaN(uid)) return res.json({ success: false, message: 'Invalid session' });
        } 
        else {
            return res.json({ success: false, message: 'Invalid session' });
        }
        
        // ✅ Balance နှုတ်
        const user = await p.query('SELECT balance FROM auth_users WHERE id=$1', [uid]);
        const currentBalance = parseFloat(user.rows[0]?.balance || 0);
        
        if (currentBalance < amount) {
            return res.json({ success: false, message: 'Balance not enough' });
        }
        
        await p.query('UPDATE auth_users SET balance = balance - $1 WHERE id=$2', [amount, uid]);
        
        // ✅ Paid Spins တိုး (Spins အရေအတွက်ကို reason ကနေ ထုတ်ယူ)
        var spinsToAdd = 0;
        if (reason) {
            var match = reason.match(/\d+/);
            if (match) spinsToAdd = parseInt(match[0]);
        }
        if (spinsToAdd > 0) {
            await p.query('UPDATE auth_users SET paid_spins = COALESCE(paid_spins, 0) + $1 WHERE id = $2', [spinsToAdd, uid]);
        }
        
        const newBalance = currentBalance - amount;
        
        res.json({ success: true, new_balance: newBalance });
        
    } catch(e) {
        res.json({ success: false, message: 'Server error' });
    }
});
// ==================== BUY PREMIUM (WITH WEEKLY BONUS AUTO-CLAIM) ====================
app.post('/api/buy_premium', async (req, res) => {
    const { token, months, cost, tier } = req.body;
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    if (!months || !cost) return res.json({ success: false, message: 'Missing data' });
    
    try {
        const p = await getPool();
        let uid;
        
        // JWT Token
        if (token.startsWith('eyJ')) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                uid = decoded.userId;
            } catch(e) {
                return res.json({ success: false, message: 'Invalid session' });
            }
        } 
        // Old Token
        else if (token.startsWith('token_')) {
            uid = parseInt(token.replace('token_', ''));
        } 
        else {
            return res.json({ success: false, message: 'Invalid session' });
        }
        
        if (isNaN(uid)) return res.json({ success: false, message: 'Invalid session' });
        
        // Check balance
        const bal = await p.query('SELECT balance FROM auth_users WHERE id=$1', [uid]);
        const balance = parseFloat(bal.rows[0]?.balance || 0);
        if (balance < cost) return res.json({ success: false, message: 'ငွေမလုံလောက်ပါ။ Top Up လုပ်ပါ။' });
        
        // Calculate expiry
        const expiry = new Date();
        expiry.setMonth(expiry.getMonth() + months);
        const premiumTier = tier || 1;
        
        // Deduct balance + Set premium
        await p.query(
            'UPDATE auth_users SET balance = balance - $1, premium_expiry = $2, premium_tier = $3 WHERE id = $4',
            [cost, expiry, premiumTier, uid]
        );
        
        // Log order
        await p.query(
            "INSERT INTO orders (user_id, username, amount, payment_method, status) VALUES ($1, (SELECT username FROM auth_users WHERE id=$1), $2, 'Premium Purchase', 'approved')",
            [uid, -cost]
        );
        
        // ✅ Weekly Bonus Auto-Claim (ဒီတစ်ပတ်အတွက် ချက်ချင်း)
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // တနင်္လာနေ့
        weekStart.setHours(0, 0, 0, 0);
        
        const alreadyClaimed = await p.query(
            'SELECT id FROM weekly_bonus WHERE user_id=$1 AND claimed_at >= $2',
            [uid, weekStart]
        );
        
        if (alreadyClaimed.rows.length === 0) {
            // ဒီတစ်ပတ်အတွက် မရသေးရင် Auto-Claim
            await p.query('INSERT INTO weekly_bonus (user_id) VALUES ($1)', [uid]);
            console.log('✅ Weekly Bonus Auto-Claimed for new premium user:', uid);
        }
        
        console.log('✅ Premium purchased for user:', uid, 'Tier:', premiumTier, 'Expiry:', expiry.toISOString());
        
        res.json({ 
            success: true, 
            expires_at: expiry.toISOString(), 
            premium_tier: premiumTier,
            message: 'Premium ဝယ်ယူမှု အောင်မြင်ပါသည်။ Weekly Bonus ရရှိပါပြီ။'
        });
        
    } catch(e) { 
        console.error('[BUY PREMIUM ERROR]', e.message);
        res.json({ success: false, message: 'Server error' }); 
    }
});
// ==================== CHAT PREMIUM PURCHASE (JWT FIXED - FULL) ====================
app.post('/api/chat/purchase_premium', async (req, res) => {
    const { token, premium_tier, months, price_usd } = req.body;
    
    console.log('[CHAT PREMIUM PURCHASE] Received:', { token: token?.substring(0,10)+'...', premium_tier, months, price_usd });
    
    if (!token || token === 'guest') {
        return res.json({ success: false, message: 'အကောင့်ဝင်ရောက်ပါ' });
    }
    if (!premium_tier || !months || !price_usd) {
        return res.json({ success: false, message: 'အချက်အလက်များ မပြည့်စုံပါ' });
    }
    
    try {
        const p = await getPool();
        let uid;
        
        // ✅ JWT Token
        if (token.startsWith('eyJ')) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                uid = decoded.userId;
            } catch(e) {
                return res.json({ success: false, message: 'အကောင့်မမှန်ကန်ပါ' });
            }
        } 
        // ✅ Old Token
        else if (token.startsWith('token_')) {
            uid = parseInt(token.replace('token_', ''));
        } 
        else {
            return res.json({ success: false, message: 'အကောင့်မမှန်ကန်ပါ' });
        }
        
        if (isNaN(uid)) {
            return res.json({ success: false, message: 'အကောင့်မမှန်ကန်ပါ' });
        }
        
        // 1. Check USD Balance
        const user = await p.query('SELECT usd_balance FROM auth_users WHERE id = $1', [uid]);
        if (user.rows.length === 0) {
            return res.json({ success: false, message: 'အကောင့်မတွေ့ပါ' });
        }
        
        const usdBalance = parseFloat(user.rows[0]?.usd_balance || 0);
        
        if (usdBalance < price_usd) {
            return res.json({ success: false, message: `USD လက်ကျန်မလုံလောက်ပါ ($${usdBalance})` });
        }
        
        // 2. Deduct USD Balance
        const newUsdBalance = usdBalance - price_usd;
        await p.query('UPDATE auth_users SET usd_balance = $1 WHERE id = $2', [newUsdBalance, uid]);
        
        // 3. Calculate Premium Expiry
        const now = new Date();
        
        // Check if this specific tier already exists
        const existing = await p.query(
            'SELECT premium_expiry FROM chat_premium WHERE user_id = $1 AND premium_tier = $2',
            [uid, premium_tier]
        );
        
        let newExpiry;
        
        if (existing.rows.length > 0 && existing.rows[0].premium_expiry) {
            const currentExpiry = new Date(existing.rows[0].premium_expiry);
            
            if (currentExpiry > now) {
                // Extend existing premium (add months)
                newExpiry = new Date(currentExpiry);
                newExpiry.setMonth(newExpiry.getMonth() + months);
            } else {
                // Expired, start fresh
                newExpiry = new Date(now);
                newExpiry.setMonth(newExpiry.getMonth() + months);
            }
            
            // Update
            await p.query(
                `UPDATE chat_premium SET premium_expiry = $1, updated_at = NOW()
                 WHERE user_id = $2 AND premium_tier = $3`,
                [newExpiry, uid, premium_tier]
            );
        } else {
            // No existing, insert new
            newExpiry = new Date(now);
            newExpiry.setMonth(newExpiry.getMonth() + months);
            
            await p.query(
                `INSERT INTO chat_premium (user_id, premium_tier, premium_expiry, purchased_at, updated_at) 
                 VALUES ($1, $2, $3, NOW(), NOW())`,
                [uid, premium_tier, newExpiry]
            );
        }
        
        // 4. Log Transaction
        await p.query(
            `INSERT INTO orders (user_id, username, amount, payment_method, status) 
             VALUES ($1, (SELECT username FROM auth_users WHERE id=$1), $2, 'Chat Premium USD', 'approved')`,
            [uid, -price_usd]
        );
        
        const tierNames = { 1: 'Bronze', 2: 'Silver', 3: 'Gold' };
        const tierName = tierNames[premium_tier] || 'Premium';
        
        console.log('[CHAT PREMIUM PURCHASE] ✅ SUCCESS! Tier:', tierName, 'Expiry:', newExpiry.toISOString());
        
        res.json({
            success: true,
            message: `✅ ${tierName} Premium အောင်မြင်ပါသည်!`,
            premium_tier: premium_tier,
            expiry_date: newExpiry.toISOString(),
            new_usd_balance: newUsdBalance
        });
        
    } catch(e) {
        console.error('[CHAT PREMIUM PURCHASE ERROR]', e.message);
        res.json({ success: false, message: 'ဆာဗာချိတ်ဆက်မှု ပျက်ကွက်ပါသည်' });
    }
});
// ==================== GET ALL PREMIUM TIERS STATUS (JWT FIXED) ====================
app.post('/api/chat/premium/all_tiers', async (req, res) => {
    const { token } = req.body;
    
    if (!token || token === 'guest') {
        return res.json({ success: true, tiers: { 1: false, 2: false, 3: false }, expiry_dates: {} });
    }
    
    try {
        const p = await getPool();
        let uid;
        
        // ✅ JWT Token
        if (token.startsWith('eyJ')) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                uid = decoded.userId;
            } catch(e) {
                return res.json({ success: true, tiers: { 1: false, 2: false, 3: false }, expiry_dates: {} });
            }
        } 
        // ✅ Old Token
        else if (token.startsWith('token_')) {
            uid = parseInt(token.replace('token_', ''));
        } 
        else {
            return res.json({ success: true, tiers: { 1: false, 2: false, 3: false }, expiry_dates: {} });
        }
        
        if (isNaN(uid)) {
            return res.json({ success: true, tiers: { 1: false, 2: false, 3: false }, expiry_dates: {} });
        }
        
        const tiers = { 1: false, 2: false, 3: false };
        const expiryDates = {};
        const now = new Date();
        
        for (let tier = 1; tier <= 3; tier++) {
            const r = await p.query(
                `SELECT premium_expiry FROM chat_premium 
                 WHERE user_id = $1 AND premium_tier = $2 AND premium_expiry > NOW()`,
                [uid, tier]
            );
            
            if (r.rows.length > 0) {
                tiers[tier] = true;
                expiryDates[tier] = r.rows[0].premium_expiry.toISOString();
            }
        }
        
        console.log('[ALL TIERS] User:', uid, 'Tiers:', tiers);
        
        res.json({ success: true, tiers: tiers, expiry_dates: expiryDates });
        
    } catch(e) {
        console.error('[ALL TIERS STATUS ERROR]', e.message);
        res.json({ success: true, tiers: { 1: false, 2: false, 3: false }, expiry_dates: {} });
    }
});

// ==================== CLAIM WEEKLY BONUS (JWT FIXED) ====================
app.post('/api/claim_weekly_bonus', async (req, res) => {
    const { token } = req.body;
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    
    try {
        const p = await getPool();
        let uid;
        
        // ✅ JWT Token
        if (token.startsWith('eyJ')) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                uid = decoded.userId;
            } catch(e) {
                return res.json({ success: false, message: 'Invalid session' });
            }
        } 
        // ✅ Old Token
        else if (token.startsWith('token_')) {
            uid = parseInt(token.replace('token_', ''));
        } 
        else {
            return res.json({ success: false, message: 'Invalid session' });
        }
        
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
// ==================== EXCHANGE USD TO MMK (JWT FIXED) ====================
app.post('/api/exchange_usd_to_mmk', async (req, res) => {
    const { token, usd_amount } = req.body;
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    if (!usd_amount || usd_amount < 1) return res.json({ success: false, message: 'Minimum 1 USD required' });
    
    try {
        const p = await getPool();
        let uid;
        
        // ✅ JWT Token
        if (token.startsWith('eyJ')) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                uid = decoded.userId;
            } catch(e) {
                return res.json({ success: false, message: 'Invalid session' });
            }
        } 
        // ✅ Old Token
        else if (token.startsWith('token_')) {
            uid = parseInt(token.replace('token_', ''));
        } 
        else {
            return res.json({ success: false, message: 'Invalid session' });
        }
        
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
// ==================== SAVE SPIN HISTORY - Legacy (JWT FIXED) ====================
app.post('/api/spin/save', async (req, res) => {
    const { token, reward_type, reward_amount, segment_label } = req.body;
    if (!token || token === 'guest') return res.json({ success: false });
    try {
        const p = await getPool();
        let uid;
        
        // ✅ JWT Token
        if (token.startsWith('eyJ')) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                uid = decoded.userId;
            } catch(e) {
                return res.json({ success: false });
            }
        } 
        // ✅ Old Token
        else if (token.startsWith('token_')) {
            uid = parseInt(token.replace('token_', ''));
        } 
        else {
            return res.json({ success: false });
        }
        
        if (isNaN(uid)) return res.json({ success: false });
        
        await p.query('INSERT INTO spin_history (user_id, reward_type, reward_amount, segment_label) VALUES ($1,$2,$3,$4)', [uid, reward_type||'thanks', reward_amount||0, segment_label||'Unknown']);
        if (reward_type === 'usd' && reward_amount > 0) await p.query('UPDATE auth_users SET usd_balance = COALESCE(usd_balance,0) + $1 WHERE id=$2', [reward_amount, uid]);
        else if (reward_type === 'mmk' && reward_amount > 0) await p.query('UPDATE auth_users SET balance = COALESCE(balance,0) + $1 WHERE id=$2', [reward_amount, uid]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

// ==================== USE PAID SPIN - Legacy (JWT FIXED) ====================
app.post('/api/spin/use_paid_spin', async (req, res) => {
    const { token } = req.body;
    if (!token || token === 'guest') return res.json({ success: false });
    try {
        const p = await getPool();
        let uid;
        
        // ✅ JWT Token
        if (token.startsWith('eyJ')) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                uid = decoded.userId;
            } catch(e) {
                return res.json({ success: false });
            }
        } 
        // ✅ Old Token
        else if (token.startsWith('token_')) {
            uid = parseInt(token.replace('token_', ''));
        } 
        else {
            return res.json({ success: false });
        }
        
        if (isNaN(uid)) return res.json({ success: false });
        
        await p.query('UPDATE auth_users SET paid_spins = GREATEST(0, COALESCE(paid_spins, 0) - 1) WHERE id=$1', [uid]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

// ==================== TRACK PREMIUM DRAW (JWT FIXED) ====================
app.post('/api/track_premium_draw', async (req, res) => {
    const { token } = req.body;
    if (!token || token === 'guest') return res.json({ success: false });
    try {
        const p = await getPool();
        let uid;
        
        // ✅ JWT Token
        if (token.startsWith('eyJ')) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                uid = decoded.userId;
            } catch(e) {
                return res.json({ success: false });
            }
        } 
        // ✅ Old Token
        else if (token.startsWith('token_')) {
            uid = parseInt(token.replace('token_', ''));
        } 
        else {
            return res.json({ success: false });
        }
        
        if (isNaN(uid)) return res.json({ success: false });
        
        await p.query(`INSERT INTO premium_draws (user_id, draw_date, draw_count) VALUES ($1, CURRENT_DATE, 1) ON CONFLICT (user_id, draw_date) DO UPDATE SET draw_count = premium_draws.draw_count + 1`, [uid]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});
// ==================== SPIN EXECUTE (JWT + MMK FIX - COMPLETE) ====================
app.post('/api/spin/execute', async (req, res) => {
    const { token, spin_source } = req.body;
    
    // ✅ JWT Config
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'solom-game-shop-secret-key-2026';
    
    console.log('[SPIN EXECUTE] Source:', spin_source);
    
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    if (!spin_source || !['daily', 'bought', 'premium_bought', 'weekly_bonus'].includes(spin_source)) {
        return res.json({ success: false, message: 'Invalid spin source' });
    }
    
    try {
        const p = await getPool();
        let uid;
        
        // ✅ JWT Token
        if (token.startsWith('eyJ')) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                uid = decoded.userId;
            } catch(e) {
                return res.json({ success: false, message: 'Invalid session' });
            }
        } 
        // ✅ Old Token
        else if (token.startsWith('token_')) {
            uid = parseInt(token.replace('token_', ''));
        } 
        else {
            return res.json({ success: false, message: 'Invalid session' });
        }
        
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
        
        // ✅ BALANCE UPDATE (MMK + USD - နှစ်ခုလုံး သီးသန့်စီ)
        const balBefore = { mmk: parseFloat(u.balance||0), usd: parseFloat(u.usd_balance||0) };
        let balAfter = { mmk: balBefore.mmk, usd: balBefore.usd };
        
        // ✅ USD Reward
        if (reward.type === 'usd' && reward.reward > 0) {
            await p.query('UPDATE auth_users SET usd_balance = COALESCE(usd_balance,0) + $1 WHERE id=$2', [reward.reward, uid]);
            balAfter.usd += reward.reward;
        }
        
        // ✅ MMK Reward (သီးသန့်)
        if (reward.type === 'mmk' && reward.reward > 0) {
            await p.query('UPDATE auth_users SET balance = COALESCE(balance,0) + $1 WHERE id=$2', [reward.reward, uid]);
            balAfter.mmk += reward.reward;
        }
        
        // ✅ Free Spin Reward
        if (reward.type === 'free' && (spin_source === 'bought' || spin_source === 'premium_bought')) {
            await p.query('UPDATE auth_users SET paid_spins = paid_spins + 1 WHERE id=$1', [uid]);
        }
        
        // Log
        await p.query(
            `INSERT INTO spin_history_v2 (user_id, spin_source, reward_type, reward_amount, balance_before_mmk, balance_after_mmk, balance_before_usd, balance_after_usd) 
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, 
            [uid, spin_source, reward.type, reward.reward, balBefore.mmk, balAfter.mmk, balBefore.usd, balAfter.usd]
        );
        
        const updatedUser = await p.query('SELECT paid_spins FROM auth_users WHERE id=$1', [uid]);
        const updatedBought = parseInt(updatedUser.rows[0]?.paid_spins || 0);
        
        console.log('[SPIN RESULT] ✅ User:', uid, 'Tier:', premiumTier, 'Reward:', reward.label, 'MMK:', balAfter.mmk, 'USD:', balAfter.usd);
        
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

// ==================== BUY PROMO CODE (JWT FIXED) ====================
app.post('/api/buy_promo_code', async (req, res) => {
    const { token, codeId } = req.body;
    
    if (!token || !codeId) return res.json({ success: false, message: 'Missing data' });
    
    try {
        const p = await getPool();
        let uid;
        
        // ✅ JWT Token
        if (token.startsWith('eyJ')) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                uid = decoded.userId;
            } catch(e) {
                return res.json({ success: false, message: 'Invalid token' });
            }
        } 
        // ✅ Old Token
        else if (token.startsWith('token_')) {
            uid = parseInt(token.replace('token_', ''));
        } 
        else {
            return res.json({ success: false, message: 'Invalid token' });
        }
        
        if (isNaN(uid)) return res.json({ success: false, message: 'Invalid token' });
        
        // Get promo code
        const code = await p.query(
            "SELECT * FROM promo_codes WHERE id = $1 AND used = false AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)",
            [codeId]
        );
        
        if (code.rows.length === 0) {
            return res.json({ success: false, message: 'ရောင်းကုန်သွားပါပြီ(သို့)ပွဲတော်ပြီးသွားပါပြီ' });
        }
        
        const c = code.rows[0];
        
        // Check balance
        const user = await p.query('SELECT balance FROM auth_users WHERE id=$1', [uid]);
        if (user.rows.length === 0) return res.json({ success: false, message: 'User not found' });
        
        const balance = parseFloat(user.rows[0].balance || 0);
        if (balance < PROMO_CODE_PRICE) {
            return res.json({ success: false, message: 'Insufficient balance. Need ' + PROMO_CODE_PRICE + ' Ks' });
        }
        
        await p.query('UPDATE promo_codes SET used = true WHERE id = $1', [c.id]);
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
// ==================== REDEEM PROMO CODE (JWT FIXED) ====================
app.post('/api/redeem_promo', async (req, res) => {
    const { token, promo_code } = req.body;
    
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    if (!promo_code) return res.json({ success: false, message: 'Promo code required' });
    
    try {
        const p = await getPool();
        let uid;
        
        // ✅ JWT Token
        if (token.startsWith('eyJ')) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                uid = decoded.userId;
            } catch(e) {
                return res.json({ success: false, message: 'Invalid session' });
            }
        } 
        // ✅ Old Token
        else if (token.startsWith('token_')) {
            uid = parseInt(token.replace('token_', ''));
        } 
        else {
            return res.json({ success: false, message: 'Invalid session' });
        }
        
        if (isNaN(uid)) return res.json({ success: false, message: 'Invalid session' });
        
        const promoCode = promo_code.toUpperCase();
        
        // Check if code exists and is SOLD but NOT REDEEMED
        const code = await p.query(
            "SELECT * FROM promo_codes WHERE UPPER(api_key) = $1 AND used = true AND used_by IS NULL AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)",
            [promoCode]
        );
        
        if (code.rows.length > 0) {
            const c = code.rows[0];
            
            await p.query('UPDATE promo_codes SET used_by = $1, used_at = NOW() WHERE id = $2', [uid, c.id]);
            
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
        
        // Check already redeemed
        const redeemedCheck = await p.query(
            "SELECT * FROM promo_codes WHERE UPPER(api_key) = $1 AND used = true AND used_by IS NOT NULL",
            [promoCode]
        );
        
        if (redeemedCheck.rows.length > 0) {
            return res.json({ success: false, message: 'Code ကိုအသုံးပြုပြီးပါပြီ (တစ်ကြိမ်ပဲသုံးလို့ရပါသည်)' });
        }
        
        const unsoldCheck = await p.query(
            "SELECT * FROM promo_codes WHERE UPPER(api_key) = $1 AND used = false",
            [promoCode]
        );
        
        if (unsoldCheck.rows.length > 0) {
            return res.json({ success: false, message: 'Code မှားယွင်းနေပါသည်' });
        }
        
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
// ==================== DAILY CHECK-IN STATUS (REAL VERSION) ====================
app.post('/api/daily_checkin/status', async (req, res) => {
    const { token } = req.body;
    
    if (!token || token === 'guest') {
        return res.json({ success: false, events: [] });
    }
    
    try {
        const jwt = require('jsonwebtoken');
        const JWT_SECRET = process.env.JWT_SECRET || 'solom-game-shop-secret-key-2026';
        const p = await getPool();
        
        let uid;
        if (token.startsWith('eyJ')) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                uid = decoded.userId || decoded.id || decoded.uid;
            } catch(e) {
                return res.json({ success: false, events: [], message: 'Invalid token' });
            }
        } else if (token.startsWith('token_')) {
            uid = parseInt(token.replace('token_', ''));
        } else {
            return res.json({ success: false, events: [] });
        }
        
        if (!uid || isNaN(uid)) {
            return res.json({ success: false, events: [] });
        }
        
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        
        // Check premium status
        const userRes = await p.query(
            'SELECT premium_expiry, premium_tier FROM auth_users WHERE id = $1', [uid]
        );
        const isPremium = userRes.rows.length > 0 && 
                         userRes.rows[0].premium_expiry && 
                         new Date(userRes.rows[0].premium_expiry) > now;
        
        // Get all active events
        const events = await p.query(
            `SELECT * FROM daily_checkin_events 
             WHERE is_active = true AND cancelled = false
             ORDER BY start_date ASC, id DESC`
        );
        
        const result = [];
        
        for (const ev of events.rows) {
            const startTime = ev.start_time || '00:00:00';
            const resetTime = ev.end_time || '14:30:00';
            const totalDays = ev.total_days;
            
            const startDateTime = new Date(ev.start_date + 'T' + startTime);
            const endDateTime = new Date(ev.end_date + 'T' + '23:59:59');
            const graceEndDateTime = new Date(endDateTime.getTime() + 2 * 24 * 60 * 60 * 1000);
            
            // Skip fully ended events
            if (now > graceEndDateTime) continue;
            
            // Skip premium events for non-premium users
            if (ev.event_type === 'premium' && !isPremium) continue;
            
            const hasStarted = now >= startDateTime;
            const hasEnded = now > endDateTime;
            const isGracePeriod = (now > endDateTime && now <= graceEndDateTime);
            
            // Pending countdown
            let pendingCountdown = null;
            if (!hasStarted) {
                pendingCountdown = Math.floor((startDateTime - now) / 1000);
            }
            
            // Current day
            let currentDay = 1;
            if (hasStarted && !isGracePeriod) {
                const daysSinceStart = Math.floor((now - startDateTime) / (24 * 60 * 60 * 1000));
                currentDay = Math.min(daysSinceStart + 1, totalDays);
            } else if (isGracePeriod) {
                currentDay = totalDays;
            }
            
            // Check today's claim
            const todayCheck = await p.query(
                "SELECT * FROM daily_checkins WHERE user_id = $1 AND event_id = $2 AND checkin_date = $3",
                [uid, ev.id, todayStr]
            );
            const checkedInToday = todayCheck.rows.length > 0;
            
            // Can claim?
            let canClaim = false;
            if (hasStarted && !checkedInToday && now <= graceEndDateTime) {
                if (isGracePeriod) {
                    const lastDayClaim = await p.query(
                        "SELECT * FROM daily_checkins WHERE user_id = $1 AND event_id = $2 AND day_number = $3",
                        [uid, ev.id, totalDays]
                    );
                    canClaim = lastDayClaim.rows.length === 0;
                } else {
                    canClaim = currentDay <= totalDays;
                }
            }
            
            // Get rewards
            const rewards = await p.query(
                "SELECT * FROM daily_checkin_rewards WHERE event_id = $1 ORDER BY day_number ASC",
                [ev.id]
            );
            
            // Build day status
            const dayStatus = [];
            for (let d = 1; d <= totalDays; d++) {
                const dayClaims = await p.query(
                    "SELECT * FROM daily_checkins WHERE user_id = $1 AND event_id = $2 AND day_number = $3",
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
                        icon: reward.icon_url || ''
                    } : null
                });
            }
            
            result.push({
                event_id: ev.id,
                event_name: ev.event_name,
                event_type: ev.event_type,
                start_date: ev.start_date,
                start_time: startTime,
                end_date: ev.end_date,
                end_time: ev.end_time,
                grace_end_date: graceEndDateTime.toISOString().split('T')[0],
                is_grace_period: isGracePeriod,
                is_fully_ended: now > graceEndDateTime,
                has_started: hasStarted,
                is_pending: !hasStarted,
                pending_countdown_seconds: pendingCountdown,
                total_days: totalDays,
                current_day: currentDay,
                checked_in_today: checkedInToday,
                can_claim: canClaim,
                reset_time: resetTime,
                day_status: dayStatus
            });
        }
        
        res.json({ success: true, events: result, server_time: now.toISOString() });
        
    } catch(e) {
        res.json({ success: false, events: [], message: e.message });
    }
});
// ==================== DAILY CHECK-IN CLAIM (JWT FIXED - FULL) ====================
app.post('/api/daily_checkin/claim', async function(req, res) {
    var token = req.body.token;
    var event_id = req.body.event_id;
    
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    if (!event_id) return res.json({ success: false, message: 'Event ID required' });
    
    try {
        var p = await getPool();
        var uid;
        
        // ✅ JWT Token
        if (token.startsWith('eyJ')) {
            try {
                var decoded = jwt.verify(token, JWT_SECRET);
                uid = decoded.userId;
            } catch(e) {
                return res.json({ success: false, message: 'Invalid session' });
            }
        } 
        // ✅ Old Token
        else if (token.startsWith('token_')) {
            uid = parseInt(token.replace('token_', ''));
        } 
        else {
            return res.json({ success: false, message: 'Invalid session' });
        }
        
        if (isNaN(uid)) return res.json({ success: false });
        
        // ✅ Server Time (Myanmar)
        var now = new Date();
        var todayStr = now.toISOString().split('T')[0];
        
        // Get event
        var event = await p.query(
            'SELECT * FROM daily_checkin_events WHERE id=$1 AND is_active=true AND cancelled=false', 
            [event_id]
        );
        if (event.rows.length === 0) {
            return res.json({ success: false, message: 'Event not found' });
        }
        
        var evt = event.rows[0];
        var startTime = evt.start_time || '00:00:00';
        var resetTime = evt.end_time || '00:00:00';
        var totalDays = evt.total_days;
        
        var startDateTime = new Date(evt.start_date + 'T' + startTime);
        var endDateTime = new Date(evt.end_date + 'T' + '23:59:59');
        var graceEndDateTime = new Date(endDateTime.getTime() + 2 * 24 * 60 * 60 * 1000);
        
        if (now < startDateTime) {
            var timeUntilStart = startDateTime - now;
            var hoursUntil = Math.floor(timeUntilStart / 3600000);
            var minsUntil = Math.floor((timeUntilStart % 3600000) / 60000);
            return res.json({ 
                success: false, 
                message: '⏰ Event starts in ' + hoursUntil + 'h ' + minsUntil + 'm' 
            });
        }
        
        if (now > graceEndDateTime) {
            return res.json({ success: false, message: '📅 Event has fully ended.' });
        }
        
        var isGracePeriod = (now > endDateTime && now <= graceEndDateTime);
        var isActivePeriod = (now >= startDateTime && now <= endDateTime);
        
        var currentDay = 1;
        if (isActivePeriod) {
            currentDay = getCurrentDay(evt.start_date, startTime, resetTime, now, totalDays);
        } else if (isGracePeriod) {
            currentDay = totalDays;
        }
        
        var todayCheckin = await p.query(
            'SELECT * FROM daily_checkins WHERE user_id=$1 AND event_id=$2 AND checkin_date=$3',
            [uid, event_id, todayStr]
        );
        if (todayCheckin.rows.length > 0) {
            return res.json({ success: false, message: '✅ Already claimed today!' });
        }
        
        if (isActivePeriod) {
            var todayReset = new Date(todayStr + 'T' + resetTime);
            if (now >= todayReset) {
                return res.json({ 
                    success: false, 
                    message: '⏰ Claim period ended. Next reset at ' + resetTime 
                });
            }
        }
        
        if (isGracePeriod) {
            var lastDayClaim = await p.query(
                'SELECT * FROM daily_checkins WHERE user_id=$1 AND event_id=$2 AND day_number=$3',
                [uid, event_id, totalDays]
            );
            if (lastDayClaim.rows.length > 0) {
                return res.json({ success: false, message: '⚠️ Last day reward already claimed.' });
            }
        }
        
        var reward = await p.query(
            'SELECT * FROM daily_checkin_rewards WHERE event_id=$1 AND day_number=$2',
            [event_id, currentDay]
        );
        if (reward.rows.length === 0) {
            return res.json({ success: false, message: 'No reward for this day' });
        }
        var rwd = reward.rows[0];
        
        switch (rwd.reward_type) {
            case 'mmk':
                await p.query('UPDATE auth_users SET balance = COALESCE(balance,0) + $1 WHERE id=$2', 
                    [rwd.reward_amount, uid]);
                break;
            case 'usd':
                await p.query('UPDATE auth_users SET usd_balance = COALESCE(usd_balance,0) + $1 WHERE id=$2', 
                    [rwd.reward_amount, uid]);
                break;
            case 'spin':
                await p.query('UPDATE auth_users SET paid_spins = COALESCE(paid_spins,0) + $1 WHERE id=$2', 
                    [parseInt(rwd.reward_amount), uid]);
                break;
        }
        
        await p.query(
            'INSERT INTO daily_checkins (user_id, event_id, checkin_date, day_number, reward_type, reward_amount) VALUES ($1,$2,$3,$4,$5,$6)',
            [uid, event_id, todayStr, currentDay, rwd.reward_type, rwd.reward_amount]
        );
        
        var nextDay = Math.min(currentDay + 1, totalDays);
        if (isGracePeriod) nextDay = currentDay;
        
        await p.query(
            `INSERT INTO daily_checkin_progress (user_id, event_id, current_day, last_claim_date) 
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (user_id, event_id) 
             DO UPDATE SET current_day=$3, last_claim_date=$4`,
            [uid, event_id, nextDay, todayStr]
        );
        
        var updatedUser = await p.query('SELECT balance, usd_balance, paid_spins FROM auth_users WHERE id=$1', [uid]);
        
        res.json({
            success: true,
            message: '🎉 Reward claimed!',
            day: currentDay,
            reward_type: rwd.reward_type,
            reward_amount: parseFloat(rwd.reward_amount),
            reward_label: rwd.reward_label,
            mmk_balance: parseFloat(updatedUser.rows[0]?.balance || 0),
            usd_balance: parseFloat(updatedUser.rows[0]?.usd_balance || 0),
            paid_spins: parseInt(updatedUser.rows[0]?.paid_spins || 0)
        });
        
    } catch(e) {
        console.error('[CHECKIN CLAIM ERROR]', e.message);
        res.json({ success: false, message: 'Server error: ' + e.message });
    }
});

function getCurrentDay(startDate, startTime, resetTime, now, totalDays) {
    var startMoment = new Date(startDate + 'T' + startTime);
    var firstReset = new Date(startDate + 'T' + resetTime);
    if (firstReset <= startMoment) {
        firstReset.setDate(firstReset.getDate() + 1);
    }
    if (now < firstReset) {
        return 1;
    }
    var daysAfterFirst = Math.floor((now - firstReset) / (24 * 60 * 60 * 1000));
    var day = 1 + daysAfterFirst;
    return Math.min(day, totalDays);
}
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
                cp.premium_expiry as chat_premium_expiry,
                (SELECT COUNT(*) FROM device_sessions ds WHERE ds.user_id = u.id AND ds.is_active = true AND ds.last_activity > NOW() - INTERVAL '7 days') as active_devices,
                (SELECT login_at FROM login_history lh WHERE lh.user_id = u.id ORDER BY lh.login_at DESC LIMIT 1) as last_login_time,
                (SELECT CONCAT(COALESCE(device_brand,''), ' ', COALESCE(device_model,''), ' • ', COALESCE(browser,'')) FROM login_history lh WHERE lh.user_id = u.id AND device_brand IS NOT NULL ORDER BY lh.login_at DESC LIMIT 1) as last_device,
                (SELECT ip_address FROM login_history lh WHERE lh.user_id = u.id ORDER BY lh.login_at DESC LIMIT 1) as last_ip,
                (SELECT COUNT(*) FROM login_history lh WHERE lh.user_id = u.id) as total_logins
            FROM auth_users u
            LEFT JOIN chat_premium cp ON u.id = cp.user_id
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

// ==================== WEEKLY LEADERBOARD API ====================
app.get('/api/leaderboard/weekly_top_spenders', async (req, res) => {
    try {
        const p = await getPool();
        
        // ✅ ဒီတစ်ပတ်အတွင်း completed orders တွေကို User အလိုက် စုပေါင်း
        const result = await p.query(`
            SELECT 
                u.id,
                u.username, 
                u.email,
                COALESCE(SUM(o.amount), 0) as weekly_spent
            FROM auth_users u
            LEFT JOIN orders o ON u.id = o.user_id 
                AND o.status = 'completed'
                AND o.created_at >= date_trunc('week', CURRENT_DATE)
            GROUP BY u.id, u.username, u.email
            HAVING COALESCE(SUM(o.amount), 0) > 0
            ORDER BY weekly_spent DESC
            LIMIT 10
        `);
        
        res.json({ 
            success: true, 
            leaders: result.rows,
            week_start: new Date().toISOString()
        });
        
    } catch(e) {
        console.error('[LEADERBOARD ERROR]', e.message);
        res.json({ success: false, leaders: [] });
    }
});
// ==================== SOCKET.IO + SERVER START ====================
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*', // ✅ Render အတွက် အကုန်ခွင့်ပြု
        methods: ['GET', 'POST']
    },
    transports: ['polling', 'websocket'], // ✅ နှစ်ခုလုံး ခွင့်ပြု
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    httpCompression: true,
    maxHttpBufferSize: 1e7 // 10MB for file uploads
});

// Online users tracking (in-memory)
const onlineUsersMap = new Map();

io.on('connection', (socket) => {
    console.log('✅ User connected:', socket.id);
    
    socket.on('user_online', async (data) => {
        socket.userId = data.userId;
        socket.username = data.username;
        
        // Store in memory
        onlineUsersMap.set(data.userId, { 
            socketId: socket.id, 
            username: data.username, 
            online: true,
            last_active: Date.now()
        });
        
        // Update DB
        try {
            const p = await getPool();
            await p.query(
                `INSERT INTO chat_online_users (user_id, socket_id, username, last_active) 
                 VALUES ($1, $2, $3, NOW()) 
                 ON CONFLICT (user_id) DO UPDATE SET socket_id=$2, last_active=NOW()`,
                [data.userId, socket.id, data.username]
            );
        } catch(e) { console.log('DB online error:', e.message); }
        
        // Broadcast online users
        const onlineList = Array.from(onlineUsersMap.values());
        io.emit('online_users', onlineList);
    });
    
    socket.on('join_room', (roomId) => {
        if (roomId) {
            socket.join('room_' + roomId);
            console.log('📌 User joined room:', roomId);
        }
    });
    
    // ========== SEND MESSAGE (WITH PREMIUM TIER) ==========
    socket.on('send_message', async (data) => {
        const { roomId, message, userId, username, senderPremiumTier } = data;
        
        if (!roomId || !message || !userId) {
            console.log('⚠️ Invalid message data:', data);
            return;
        }
        
        console.log('📨 Message received:', { roomId, userId, message: message?.substring(0,30), tier: senderPremiumTier });
        
        try {
            const p = await getPool();
            
            // Check if user is in room
            const check = await p.query(
                'SELECT * FROM chat_participants WHERE room_id=$1 AND user_id=$2',
                [roomId, userId]
            );
            
            if (check.rows.length === 0) {
                console.log('⚠️ User not in room:', userId, roomId);
                socket.emit('error', { message: 'You are not in this chat room' });
                return;
            }
            
            // Save message to database with sender_premium_tier
            const result = await p.query(
                `INSERT INTO chat_messages (room_id, sender_id, username, message, sender_premium_tier, created_at) 
                 VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
                [roomId, userId, username, message, senderPremiumTier || 0]
            );
            
            const msgData = {
                id: result.rows[0].id,
                roomId: roomId,
                sender_id: userId,
                username: username,
                message: message,
                sender_premium_tier: senderPremiumTier || 0,
                created_at: new Date().toISOString()
            };
            
            // Send to room
            io.to('room_' + roomId).emit('new_message', msgData);
            console.log('✅ Message sent to room:', roomId);
            
        } catch(e) { 
            console.error('Send message error:', e.message);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });
    
    socket.on('typing', (data) => {
        const { roomId, userId, username } = data;
        if (roomId && userId) {
            socket.to('room_' + roomId).emit('user_typing', { userId, username, roomId });
        }
    });
    
    socket.on('disconnect', async () => {
        if (socket.userId) {
            onlineUsersMap.delete(socket.userId);
            
            try {
                const p = await getPool();
                await p.query('DELETE FROM chat_online_users WHERE user_id = $1', [socket.userId]);
            } catch(e) {
                console.log('DB disconnect error:', e.message);
            }
            
            const onlineList = Array.from(onlineUsersMap.values());
            io.emit('online_users', onlineList);
        }
        console.log('❌ User disconnected:', socket.id);
    });
});

// ==================== CHAT PREMIUM SYSTEM ====================

// Get chat premium status
app.post('/api/chat/premium/status', async (req, res) => {
    const { token } = req.body;
    if (!token || token === 'guest') return res.json({ success: false, premium_active: false });
    
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        if (isNaN(uid)) return res.json({ success: false });
        
        const r = await p.query('SELECT premium_tier, premium_expiry FROM chat_premium WHERE user_id = $1', [uid]);
        
        if (r.rows.length > 0) {
            const expiry = new Date(r.rows[0].premium_expiry);
            const isActive = expiry > new Date();
            
            if (!isActive) {
                await p.query('DELETE FROM chat_premium WHERE user_id = $1', [uid]);
                return res.json({ success: true, premium_active: false, premium_tier: 0, expires_at: null });
            }
            
            res.json({
                success: true,
                premium_active: true,
                premium_tier: r.rows[0].premium_tier || 1,
                expires_at: expiry.toISOString()
            });
        } else {
            res.json({ success: true, premium_active: false, premium_tier: 0, expires_at: null });
        }
    } catch(e) {
        console.error('[PREMIUM STATUS ERROR]', e.message);
        res.json({ success: false, premium_active: false });
    }
});

// Get premium details with days remaining
app.post('/api/chat/premium/details', async (req, res) => {
    const { token } = req.body;
    if (!token || token === 'guest') return res.json({ success: false, premium_active: false });
    
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        if (isNaN(uid)) return res.json({ success: false });
        
        const r = await p.query('SELECT premium_tier, premium_expiry FROM chat_premium WHERE user_id = $1', [uid]);
        
        if (r.rows.length > 0) {
            const expiry = new Date(r.rows[0].premium_expiry);
            const now = new Date();
            const isActive = expiry > now;
            
            if (!isActive) {
                await p.query('DELETE FROM chat_premium WHERE user_id = $1', [uid]);
                return res.json({ 
                    success: true, 
                    premium_active: false, 
                    premium_tier: 0, 
                    days_remaining: 0,
                    expires_at: null
                });
            }
            
            const daysRemaining = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
            
            res.json({
                success: true,
                premium_active: true,
                premium_tier: r.rows[0].premium_tier || 1,
                expires_at: expiry.toISOString(),
                days_remaining: daysRemaining
            });
        } else {
            res.json({ success: true, premium_active: false, premium_tier: 0, days_remaining: 0, expires_at: null });
        }
    } catch(e) {
        console.error('[PREMIUM DETAILS ERROR]', e.message);
        res.json({ success: false, premium_active: false });
    }
});

// Buy chat premium (1, 2, or 3 months) - WITH UPGRADE SUPPORT
app.post('/api/chat/premium/buy', async (req, res) => {
    const { token, months, cost, tier } = req.body;
    
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    if (!months || !cost) return res.json({ success: false, message: 'Missing data' });
    
    if (![1, 2, 3].includes(months)) {
        return res.json({ success: false, message: 'Invalid plan. Choose 1, 2, or 3 months.' });
    }
    
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        if (isNaN(uid)) return res.json({ success: false, message: 'Invalid session' });
        
        // Check USD balance
        const bal = await p.query('SELECT usd_balance FROM auth_users WHERE id = $1', [uid]);
        const usdBalance = parseFloat(bal.rows[0]?.usd_balance || 0);
        
        if (usdBalance < cost) {
            return res.json({ success: false, message: `Insufficient USD balance. Need $${cost}` });
        }
        
        // Check existing premium
        const existing = await p.query('SELECT premium_expiry, premium_tier FROM chat_premium WHERE user_id = $1', [uid]);
        
        let newExpiry;
        let newTier;
        const now = new Date();
        
        if (existing.rows.length > 0 && existing.rows[0].premium_expiry > now) {
            // Extend existing premium
            const currentExpiry = new Date(existing.rows[0].premium_expiry);
            const currentTier = existing.rows[0].premium_tier || 1;
            
            newExpiry = new Date(currentExpiry);
            newExpiry.setMonth(newExpiry.getMonth() + months);
            newTier = Math.max(currentTier, tier || 1);
            
            await p.query(
                `UPDATE chat_premium SET premium_tier = $1, premium_expiry = $2, updated_at = NOW() WHERE user_id = $3`,
                [newTier, newExpiry, uid]
            );
        } else {
            // New premium purchase
            newExpiry = new Date(now);
            newExpiry.setMonth(newExpiry.getMonth() + months);
            newTier = tier || 1;
            
            await p.query(
                `INSERT INTO chat_premium (user_id, premium_tier, premium_expiry, purchased_at, updated_at) 
                 VALUES ($1, $2, $3, NOW(), NOW())
                 ON CONFLICT (user_id) DO UPDATE SET premium_tier = $2, premium_expiry = $3, updated_at = NOW()`,
                [uid, newTier, newExpiry]
            );
        }
        
        // Deduct USD balance
        await p.query('UPDATE auth_users SET usd_balance = usd_balance - $1 WHERE id = $2', [cost, uid]);
        
        // Log transaction
        await p.query(
            `INSERT INTO orders (user_id, username, amount, payment_method, status) 
             VALUES ($1, (SELECT username FROM auth_users WHERE id=$1), $2, 'Chat Premium', 'approved')`,
            [uid, -cost]
        );
        
        const daysRemaining = Math.ceil((newExpiry - new Date()) / (1000 * 60 * 60 * 24));
        const tierNames = ['', 'Bronze', 'Silver', 'Gold'];
        
        res.json({ 
            success: true, 
            message: `Premium ${tierNames[newTier]} activated for ${months} month(s)!`,
            expires_at: newExpiry.toISOString(),
            premium_tier: newTier,
            days_remaining: daysRemaining,
            new_usd_balance: usdBalance - cost
        });
        
    } catch(e) {
        console.error('[CHAT PREMIUM BUY ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});

// Auto cleanup expired premiums
async function cleanupExpiredPremiums() {
    try {
        const p = await getPool();
        const result = await p.query(
            "DELETE FROM chat_premium WHERE premium_expiry < NOW() RETURNING user_id"
        );
        if (result.rows.length > 0) {
            console.log(`[PREMIUM CLEANUP] Removed ${result.rows.length} expired premiums`);
        }
    } catch(e) {
        console.error('[PREMIUM CLEANUP ERROR]', e.message);
    }
}
setInterval(cleanupExpiredPremiums, 60 * 60 * 1000);
cleanupExpiredPremiums();

// Admin: Revoke chat premium (remove immediately, no expiry wait)
app.post('/api/admin/revoke_chat_premium', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.json({ success: false, message: 'User ID required' });
    
    try {
        const p = await getPool();
        
        // Delete chat premium record immediately
        const result = await p.query(
            'DELETE FROM chat_premium WHERE user_id = $1 RETURNING user_id',
            [userId]
        );
        
        if (result.rows.length > 0) {
            console.log(`[ADMIN] Revoked chat premium for user ${userId}`);
            res.json({ success: true, message: 'Chat premium revoked!' });
        } else {
            res.json({ success: false, message: 'User does not have chat premium' });
        }
    } catch(e) {
        console.error('[REVOKE CHAT PREMIUM ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});
// ==================== CHAT API ROUTES ====================

// Get current user
app.post('/api/chat/current_user', async (req, res) => {
    const { token } = req.body;
    if (!token || token === 'guest') return res.json({ success: false });
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        const r = await p.query('SELECT id, username, email FROM auth_users WHERE id=$1', [uid]);
        if (r.rows.length > 0) {
            res.json({ success: true, user: r.rows[0] });
        } else {
            res.json({ success: false });
        }
    } catch(e) { 
        console.error('[CURRENT USER ERROR]', e.message);
        res.json({ success: false }); 
    }
});

// Get all users (except self)
app.post('/api/chat/all_users', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.json({ users: [] });
    try {
        const p = await getPool();
        const r = await p.query('SELECT id, username FROM auth_users WHERE id != $1 ORDER BY username ASC', [userId]);
        res.json({ users: r.rows });
    } catch(e) { 
        console.error('[ALL USERS ERROR]', e.message);
        res.json({ users: [] }); 
    }
});

// Get online users list
app.post('/api/chat/online_users', async (req, res) => {
    try {
        const p = await getPool();
        const r = await p.query(
            "SELECT user_id, username, last_active FROM chat_online_users WHERE last_active > NOW() - INTERVAL '1 minute'"
        );
        res.json({ success: true, users: r.rows });
    } catch(e) {
        console.error('[ONLINE USERS ERROR]', e.message);
        res.json({ success: true, users: [] });
    }
});

// Update /api/chat/rooms to include avatar_url
app.post('/api/chat/rooms', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.json({ rooms: [] });
    try {
        const p = await getPool();
        const r = await p.query(`
            SELECT 
                cr.*,
                (SELECT COUNT(*) FROM chat_messages cm WHERE cm.room_id = cr.id AND cm.is_read = false AND cm.sender_id != $1) as unread,
                (SELECT message FROM chat_messages WHERE room_id = cr.id ORDER BY id DESC LIMIT 1) as last_message,
                CASE 
                    WHEN cr.room_type = 'group' THEN (SELECT avatar_url FROM group_avatars WHERE room_id = cr.id ORDER BY updated_at DESC LIMIT 1)
                    WHEN cr.room_type = 'private' THEN (
                        SELECT avatar_url FROM user_avatars 
                        WHERE user_id IN (SELECT user_id FROM chat_participants WHERE room_id = cr.id AND user_id != $1 LIMIT 1)
                        ORDER BY updated_at DESC LIMIT 1
                    )
                    ELSE NULL
                END as avatar_url
            FROM chat_rooms cr
            JOIN chat_participants cp ON cr.id = cp.room_id
            WHERE cp.user_id = $1
            ORDER BY cr.id DESC
        `, [userId]);
        res.json({ rooms: r.rows });
    } catch(e) { res.json({ rooms: [] }); }
});


// Get messages
app.get('/api/chat/messages/:roomId', async (req, res) => {
    const { roomId } = req.params;
    try {
        const p = await getPool();
        const r = await p.query(
            'SELECT * FROM chat_messages WHERE room_id = $1 ORDER BY id ASC LIMIT 100',
            [roomId]
        );
        res.json({ messages: r.rows });
    } catch(e) { 
        console.error('[MESSAGES ERROR]', e.message);
        res.json({ messages: [] }); 
    }
});

// Create admin room
app.post('/api/chat/create_admin_room', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.json({ success: false });
    try {
        const p = await getPool();
        
        // Check if admin exists
        const admin = await p.query('SELECT id, username FROM auth_users WHERE id=1');
        if (admin.rows.length === 0) {
            await p.query("INSERT INTO auth_users (id, username, email, login_type) VALUES (1, 'Admin', 'admin@solo.com', 'local') ON CONFLICT (id) DO NOTHING");
        }
        
        const user = await p.query('SELECT username FROM auth_users WHERE id=$1', [userId]);
        const userName = user.rows[0]?.username || 'User';
        
        // Check if admin room exists
        const existing = await p.query(`
            SELECT cr.id, cr.room_name FROM chat_rooms cr
            JOIN chat_participants cp ON cr.id = cp.room_id
            WHERE cr.room_type = 'admin' AND cp.user_id = $1
        `, [userId]);
        
        if (existing.rows.length > 0) {
            return res.json({ success: true, room: existing.rows[0] });
        }
        
        // Create room
        const room = await p.query(
            "INSERT INTO chat_rooms (room_name, room_type, created_by) VALUES ($1, 'admin', $2) RETURNING id, room_name",
            [userName + ' - Admin', userId]
        );
        const roomId = room.rows[0].id;
        
        await p.query('INSERT INTO chat_participants (room_id, user_id) VALUES ($1,$2)', [roomId, userId]);
        await p.query('INSERT INTO chat_participants (room_id, user_id) VALUES ($1,1)', [roomId]);
        
        res.json({ success: true, room: room.rows[0] });
    } catch(e) { 
        console.error('[CREATE ADMIN ROOM ERROR]', e.message);
        res.json({ success: false }); 
    }
});

// Create private room
app.post('/api/chat/create_private_room', async (req, res) => {
    const { userId, otherUserId } = req.body;
    if (!userId || !otherUserId) return res.json({ success: false });
    try {
        const p = await getPool();
        
        // Check if room exists
        const existing = await p.query(`
            SELECT cr.id, cr.room_name FROM chat_rooms cr
            JOIN chat_participants cp1 ON cr.id = cp1.room_id AND cp1.user_id = $1
            JOIN chat_participants cp2 ON cr.id = cp2.room_id AND cp2.user_id = $2
            WHERE cr.room_type = 'private'
        `, [userId, otherUserId]);
        
        if (existing.rows.length > 0) {
            return res.json({ success: true, room: existing.rows[0] });
        }
        
        const user1 = await p.query('SELECT username FROM auth_users WHERE id=$1', [userId]);
        const user2 = await p.query('SELECT username FROM auth_users WHERE id=$1', [otherUserId]);
        const roomName = (user1.rows[0]?.username || 'User') + ' & ' + (user2.rows[0]?.username || 'User');
        
        const room = await p.query(
            "INSERT INTO chat_rooms (room_name, room_type, created_by) VALUES ($1, 'private', $2) RETURNING id",
            [roomName, userId]
        );
        const roomId = room.rows[0].id;
        
        await p.query('INSERT INTO chat_participants (room_id, user_id) VALUES ($1,$2)', [roomId, userId]);
        await p.query('INSERT INTO chat_participants (room_id, user_id) VALUES ($1,$2)', [roomId, otherUserId]);
        
        res.json({ success: true, room: { id: roomId, room_name: roomName } });
    } catch(e) { 
        console.error('[CREATE PRIVATE ROOM ERROR]', e.message);
        res.json({ success: false }); 
    }
});

// Update /api/chat/groups to include avatar_url
app.post('/api/chat/groups', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.json({ groups: [] });
    
    try {
        const p = await getPool();
        const r = await p.query(`
            SELECT 
                cr.id, cr.room_name, cr.room_type, cr.created_by,
                (SELECT message FROM chat_messages WHERE room_id = cr.id ORDER BY id DESC LIMIT 1) as last_message,
                (SELECT avatar_url FROM group_avatars WHERE room_id = cr.id ORDER BY updated_at DESC LIMIT 1) as avatar_url,
                (SELECT COUNT(*) FROM chat_participants WHERE room_id = cr.id) as member_count,
                (SELECT role FROM chat_participants WHERE room_id = cr.id AND user_id = $1) as user_role
            FROM chat_rooms cr
            JOIN chat_participants cp ON cr.id = cp.room_id
            WHERE cr.room_type = 'group' AND cp.user_id = $1
            ORDER BY cr.id DESC
        `, [userId]);
        
        res.json({ groups: r.rows });
    } catch(e) {
        console.error('[GROUPS ERROR]', e.message);
        res.json({ groups: [] });
    }
});

// Add member to group
app.post('/api/chat/add_member', async (req, res) => {
    const { roomId, userId, requesterId } = req.body;
    if (!roomId || !userId) return res.json({ success: false, message: 'Missing data' });
    
    try {
        const p = await getPool();
        const exist = await p.query('SELECT * FROM chat_participants WHERE room_id=$1 AND user_id=$2', [roomId, userId]);
        if (exist.rows.length > 0) return res.json({ success: false, message: 'Already a member' });
        
        await p.query("INSERT INTO chat_participants (room_id, user_id, role) VALUES ($1, $2, 'member')", [roomId, userId]);
        const user = await p.query('SELECT username FROM auth_users WHERE id=$1', [userId]);
        await p.query("INSERT INTO chat_messages (room_id, sender_id, username, message) VALUES ($1, 0, 'System', $2)", [roomId, `${user.rows[0]?.username || 'User'} was added`]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

// Get invite link
app.post('/api/chat/invite_link', async (req, res) => {
    const { roomId, userId } = req.body;
    if (!roomId || !userId) return res.json({ success: false });
    
    try {
        const p = await getPool();
        
        const check = await p.query('SELECT * FROM chat_participants WHERE room_id=$1 AND user_id=$2', [roomId, userId]);
        if (check.rows.length === 0) {
            return res.json({ success: false, message: 'You are not in this group' });
        }
        
        const inviteLink = `${req.protocol}://${req.get('host')}/join_group?room=${roomId}`;
        res.json({ success: true, link: inviteLink });
    } catch(e) {
        console.error('[INVITE LINK ERROR]', e.message);
        res.json({ success: false });
    }
});

// Leave group
app.post('/api/chat/leave_group', async (req, res) => {
    const { roomId, userId } = req.body;
    if (!roomId || !userId) return res.json({ success: false });
    
    try {
        const p = await getPool();
        const member = await p.query('SELECT role FROM chat_participants WHERE room_id=$1 AND user_id=$2', [roomId, userId]);
        if (member.rows.length === 0) return res.json({ success: false, message: 'Not a member' });
        if (member.rows[0].role === 'owner') return res.json({ success: false, message: 'Owner must transfer ownership first' });
        
        await p.query('DELETE FROM chat_participants WHERE room_id=$1 AND user_id=$2', [roomId, userId]);
        const user = await p.query('SELECT username FROM auth_users WHERE id=$1', [userId]);
        await p.query("INSERT INTO chat_messages (room_id, sender_id, username, message) VALUES ($1, 0, 'System', $2)", [roomId, `${user.rows[0]?.username || 'User'} left the group`]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

// Mark messages as read
app.post('/api/chat/read', async (req, res) => {
    const { roomId, userId } = req.body;
    try {
        const p = await getPool();
        
        // Mark as read
        await p.query(
            'UPDATE chat_messages SET is_read = true WHERE room_id = $1 AND sender_id != $2 AND is_read = false',
            [roomId, userId]
        );
        
        // ✅ Socket emit - Real-time seen update
        io.to('room_' + roomId).emit('messages_read', {
            roomId: roomId,
            readerId: userId
        });
        
        res.json({ success: true });
    } catch(e) { 
        console.error('[READ ERROR]', e.message);
        res.json({ success: false }); 
    }
});
// Delete room
app.post('/api/chat/delete_room', async (req, res) => {
    const { roomId, userId } = req.body;
    
    try {
        const p = await getPool();
        const check = await p.query("SELECT * FROM chat_participants WHERE room_id=$1 AND user_id=$2 AND role='owner'", [roomId, userId]);
        if (check.rows.length === 0) return res.json({ success: false, message: 'Only owner can delete group' });
        
        await p.query('DELETE FROM chat_messages WHERE room_id=$1', [roomId]);
        await p.query('DELETE FROM chat_participants WHERE room_id=$1', [roomId]);
        await p.query('DELETE FROM chat_rooms WHERE id=$1', [roomId]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

// Debug endpoint
app.get('/api/debug/chat', async (req, res) => {
    try {
        const p = await getPool();
        const messages = await p.query('SELECT COUNT(*) FROM chat_messages');
        const rooms = await p.query('SELECT COUNT(*) FROM chat_rooms');
        const participants = await p.query('SELECT COUNT(*) FROM chat_participants');
        
        res.json({
            success: true,
            messages: parseInt(messages.rows[0].count),
            rooms: parseInt(rooms.rows[0].count),
            participants: parseInt(participants.rows[0].count),
            db_connected: true,
            socket_ready: true
        });
    } catch(e) {
        console.error('[DEBUG ERROR]', e.message);
        res.json({ success: false, error: e.message });
    }
});
// ==================== MESSAGE EDIT/DELETE ====================

app.post('/api/chat/edit_message', async (req, res) => {
    const { messageId, newMessage, userId } = req.body;
    
    if (!messageId || !newMessage || !userId) {
        return res.json({ success: false, message: 'Missing data' });
    }
    
    try {
        const p = await getPool();
        
        const msg = await p.query('SELECT * FROM chat_messages WHERE id=$1 AND sender_id=$2', [messageId, userId]);
        if (msg.rows.length === 0) {
            return res.json({ success: false, message: 'Not your message' });
        }
        
        await p.query("UPDATE chat_messages SET message=$1 WHERE id=$2", [newMessage, messageId]);
        
        res.json({ success: true });
    } catch(e) {
        console.error('[EDIT ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});

app.post('/api/chat/delete_message', async (req, res) => {
    const { messageId, userId } = req.body;
    
    if (!messageId || !userId) {
        return res.json({ success: false, message: 'Missing data' });
    }
    
    try {
        const p = await getPool();
        
        const msg = await p.query('SELECT * FROM chat_messages WHERE id=$1 AND sender_id=$2', [messageId, userId]);
        if (msg.rows.length === 0) {
            return res.json({ success: false, message: 'Not your message' });
        }
        
        await p.query('DELETE FROM chat_messages WHERE id=$1', [messageId]);
        
        res.json({ success: true });
    } catch(e) {
        console.error('[DELETE ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});
// ==================== CHAT FILE UPLOAD API ====================
app.post('/api/chat/upload_file', async (req, res) => {
    const { token, base64, fileName, fileType } = req.body;
    
    if (!token || token === 'guest') return res.json({ success: false, message: 'Login required' });
    if (!base64) return res.json({ success: false, message: 'No file data' });
    
    try {
        const p = await getPool();
        const uid = parseInt(token.replace('token_', ''));
        
        // Check if user has chat premium
        const premCheck = await p.query(
            "SELECT premium_expiry FROM chat_premium WHERE user_id = $1 AND premium_expiry > NOW()",
            [uid]
        );
        
        if (premCheck.rows.length === 0) {
            return res.json({ success: false, message: 'Premium required to send files' });
        }
        
        let resultUrl = '';
        
        // Check if it's an image
        const isImage = fileType && fileType.startsWith('image/');
        
        if (isImage) {
            // Upload to ImgBB
            const imageData = base64.replace(/^data:image\/\w+;base64,/, '');
            const formData = new URLSearchParams();
            formData.append('key', IMGBB_API_KEY);
            formData.append('image', imageData);
            
            const response = await fetch('https://api.imgbb.com/1/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString(),
                signal: AbortSignal.timeout(30000)
            });
            const imgData = await response.json();
            if (imgData.success) {
                resultUrl = imgData.data.url;
            } else {
                return res.json({ success: false, message: 'Image upload failed' });
            }
        } else {
            // Upload file to Catbox
            let base64Data = base64;
            if (base64.includes(',')) {
                base64Data = base64.split(',')[1];
            }
            const buffer = Buffer.from(base64Data, 'base64');
            const blob = new Blob([buffer]);
            const formData = new FormData();
            formData.append('reqtype', 'fileupload');
            formData.append('fileToUpload', blob, fileName || 'file');
            
            const response = await fetch('https://catbox.moe/user/api.php', {
                method: 'POST',
                body: formData,
                signal: AbortSignal.timeout(60000)
            });
            resultUrl = await response.text();
            resultUrl = resultUrl.trim();
            
            if (!resultUrl || !resultUrl.startsWith('https://')) {
                return res.json({ success: false, message: 'File upload failed' });
            }
        }
        
        res.json({ 
            success: true, 
            url: resultUrl, 
            fileName: fileName || 'file',
            fileType: fileType
        });
        
    } catch(e) {
        console.error('[CHAT FILE UPLOAD ERROR]', e.message);
        res.json({ success: false, message: 'Server error: ' + e.message });
    }
});
// ==================== CHAT PROFILE APIs ====================
// Get My Profile (with groups)
app.post('/api/chat/my_profile', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.json({ success: false });
    
    try {
        const p = await getPool();
        
        const user = await p.query(
            `SELECT u.id, u.username, u.email,
             (SELECT avatar_url FROM user_avatars WHERE user_id = u.id ORDER BY updated_at DESC LIMIT 1) as avatar_url
             FROM auth_users u WHERE u.id = $1`,
            [userId]
        );
        
        if (user.rows.length === 0) return res.json({ success: false });
        
        // ✅ Groups with avatar
        const groups = await p.query(`
            SELECT cr.id, cr.room_name, cr.room_type,
             (SELECT avatar_url FROM group_avatars WHERE room_id = cr.id ORDER BY updated_at DESC LIMIT 1) as avatar_url,
             (SELECT COUNT(*) FROM chat_participants WHERE room_id = cr.id) as member_count
            FROM chat_rooms cr
            JOIN chat_participants cp ON cr.id = cp.room_id
            WHERE cp.user_id = $1 AND cr.room_type = 'group'
            ORDER BY cr.id DESC
        `, [userId]);
        
        res.json({
            success: true,
            username: user.rows[0].username,
            name: user.rows[0].username,
            email: user.rows[0].email,
            avatar_url: user.rows[0].avatar_url || '',
            groups: groups.rows
        });
        
    } catch(e) { res.json({ success: false }); }
});
// Update Username
app.post('/api/chat/update_username', async (req, res) => {
    const { userId, username } = req.body;
    
    if (!userId || !username) {
        return res.json({ success: false, message: 'Username required' });
    }
    
    // Validate username (letters, numbers, underscore only)
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return res.json({ success: false, message: 'Username can only contain letters, numbers, and underscore' });
    }
    
    if (username.length < 3 || username.length > 20) {
        return res.json({ success: false, message: 'Username must be 3-20 characters' });
    }
    
    try {
        const p = await getPool();
        
        // Check if username already taken
        const existing = await p.query(
            'SELECT id FROM auth_users WHERE LOWER(username) = LOWER($1) AND id != $2',
            [username, userId]
        );
        
        if (existing.rows.length > 0) {
            return res.json({ success: false, message: 'Username already taken' });
        }
        
        // Update username
        await p.query(
            'UPDATE auth_users SET username = $1 WHERE id = $2',
            [username, userId]
        );
        
        // Also update username in chat_messages
        await p.query(
            'UPDATE chat_messages SET username = $1 WHERE sender_id = $2',
            [username, userId]
        );
        
        res.json({ success: true, message: 'Username updated!' });
        
    } catch(e) {
        console.error('[UPDATE USERNAME ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});

// Search Users (for adding to group)
app.post('/api/chat/search_users', async (req, res) => {
    const { query, excludeIds } = req.body;
    
    if (!query || query.length < 1) {
        return res.json({ users: [] });
    }
    
    try {
        const p = await getPool();
        
        let sql = `SELECT u.id, u.username, 
                    (SELECT premium_tier FROM chat_premium WHERE user_id = u.id AND premium_expiry > NOW() LIMIT 1) as premium_tier
                    FROM auth_users u
                    WHERE LOWER(u.username) LIKE LOWER($1)
                    AND u.id NOT IN (SELECT user_id::INT FROM banned_users)`;
        
        const params = ['%' + query + '%'];
        
        if (excludeIds && excludeIds.length > 0) {
            sql += ' AND u.id NOT IN (';
            excludeIds.forEach((id, i) => {
                sql += '$' + (params.length + 1);
                params.push(id);
                if (i < excludeIds.length - 1) sql += ',';
            });
            sql += ')';
        }
        
        sql += ' ORDER BY u.username ASC LIMIT 10';
        
        const r = await p.query(sql, params);
        
        res.json({ success: true, users: r.rows });
        
    } catch(e) {
        console.error('[SEARCH USERS ERROR]', e.message);
        res.json({ users: [] });
    }
});

// Report Group
app.post('/api/chat/report_group', async (req, res) => {
    const { roomId, userId } = req.body;
    if (!roomId || !userId) return res.json({ success: false, message: 'Missing data' });
    
    try {
        const p = await getPool();
        const already = await p.query("SELECT id FROM group_reports WHERE room_id=$1 AND reported_by=$2 AND created_at > NOW() - INTERVAL '24 hours'", [roomId, userId]);
        if (already.rows.length > 0) return res.json({ success: false, message: 'Already reported today' });
        
        await p.query('INSERT INTO group_reports (room_id, reported_by) VALUES ($1, $2)', [roomId, userId]);
        const count = await p.query('SELECT COUNT(*) as cnt FROM group_reports WHERE room_id=$1', [roomId]);
        const reportCount = parseInt(count.rows[0]?.cnt || 0);
        
        res.json({ success: true, reportCount, warning: reportCount >= 50 });
    } catch(e) { res.json({ success: false }); }
});
// ==================== PROFILE & AVATAR APIs ====================

// Update Avatar
app.post('/api/chat/update_avatar', async (req, res) => {
    const { userId, avatarUrl } = req.body;
    
    console.log('[AVATAR] Request received:', { userId, avatarUrl: avatarUrl?.substring(0, 50) });
    
    if (!userId) {
        return res.json({ success: false, message: 'User ID required' });
    }
    
    try {
        const p = await getPool();
        
        // ✅ Table ရှိမရှိ စစ်
        await p.query(`
            CREATE TABLE IF NOT EXISTS user_avatars (
                id SERIAL PRIMARY KEY,
                user_id INT UNIQUE NOT NULL,
                avatar_url TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // ✅ Insert or Update
        await p.query(
            `INSERT INTO user_avatars (user_id, avatar_url, updated_at) 
             VALUES ($1, $2, NOW()) 
             ON CONFLICT (user_id) DO UPDATE SET avatar_url = $2, updated_at = NOW()`,
            [parseInt(userId), avatarUrl || '']
        );
        
        console.log('[AVATAR] ✅ Updated for user:', userId);
        
        res.json({ success: true, message: 'Avatar updated!' });
        
    } catch(e) {
        console.error('[AVATAR ERROR]', e.message, e.stack);
        res.json({ success: false, message: 'Server error: ' + e.message });
    }
});
// View User Profile (public)
app.post('/api/chat/user_profile', async (req, res) => {
    const { userId, viewerId } = req.body;
    if (!userId) return res.json({ success: false });
    
    try {
        const p = await getPool();
        
        const user = await p.query(
            `SELECT u.id, u.username, 
             (SELECT avatar_url FROM user_avatars WHERE user_id = u.id ORDER BY updated_at DESC LIMIT 1) as avatar_url
             FROM auth_users u WHERE u.id = $1`,
            [userId]
        );
        
        if (user.rows.length === 0) return res.json({ success: false });
        
        const u = user.rows[0];
        
        // Get public groups
        const groups = await p.query(`
            SELECT cr.id, cr.room_name 
            FROM chat_rooms cr
            JOIN chat_participants cp ON cr.id = cp.room_id
            WHERE cp.user_id = $1 AND cr.room_type = 'group'
            ORDER BY cr.id DESC LIMIT 10
        `, [userId]);
        
        res.json({
            success: true,
            username: u.username,
            name: u.username,
            avatar_url: u.avatar_url || '',
            groups: groups.rows
        });
        
    } catch(e) {
        console.error('[USER PROFILE ERROR]', e.message);
        res.json({ success: false });
    }
});

// ==================== GROUP MANAGEMENT APIs ====================

// Get Group Info
app.post('/api/chat/group_info', async (req, res) => {
    const { roomId, userId } = req.body;
    if (!roomId) return res.json({ success: false });
    
    try {
        const p = await getPool();
        
        const room = await p.query(
            `SELECT cr.*, 
             (SELECT avatar_url FROM group_avatars WHERE room_id = cr.id ORDER BY updated_at DESC LIMIT 1) as avatar_url
             FROM chat_rooms cr WHERE cr.id = $1`,
            [roomId]
        );
        
        if (room.rows.length === 0) return res.json({ success: false });
        
        const r = room.rows[0];
        
        // Count members
        const count = await p.query('SELECT COUNT(*) as cnt FROM chat_participants WHERE room_id = $1', [roomId]);
        
        // Check user role
        let userRole = null;
        let isMember = false;
        
        if (userId) {
            const member = await p.query(
                'SELECT role FROM chat_participants WHERE room_id = $1 AND user_id = $2',
                [roomId, userId]
            );
            if (member.rows.length > 0) {
                isMember = true;
                userRole = member.rows[0].role || 'member';
            }
        }
        
        res.json({
            success: true,
            room_name: r.room_name,
            room_type: r.room_type,
            avatar_url: r.avatar_url || '',
            member_count: parseInt(count.rows[0]?.cnt || 0),
            is_member: isMember,
            user_role: userRole
        });
        
    } catch(e) {
        console.error('[GROUP INFO ERROR]', e.message);
        res.json({ success: false });
    }
});

// Update Group Avatar
app.post('/api/chat/update_group_avatar', async (req, res) => {
    const { roomId, avatarUrl } = req.body;
    
    console.log('[GROUP AVATAR] Request:', { roomId });
    
    if (!roomId) return res.json({ success: false, message: 'Room ID required' });
    
    try {
        const p = await getPool();
        
        // ✅ Table auto-create
        await p.query(`
            CREATE TABLE IF NOT EXISTS group_avatars (
                id SERIAL PRIMARY KEY,
                room_id INT UNIQUE NOT NULL,
                avatar_url TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // ✅ Get user from token (need to send token from client)
        // For now, just update without role check
        await p.query(
            `INSERT INTO group_avatars (room_id, avatar_url, updated_at) 
             VALUES ($1, $2, NOW()) 
             ON CONFLICT (room_id) DO UPDATE SET avatar_url = $2, updated_at = NOW()`,
            [parseInt(roomId), avatarUrl || '']
        );
        
        console.log('[GROUP AVATAR] ✅ Updated for room:', roomId);
        
        res.json({ success: true, message: 'Avatar updated!' });
        
    } catch(e) {
        console.error('[GROUP AVATAR ERROR]', e.message, e.stack);
        res.json({ success: false, message: 'Server error: ' + e.message });
    }
});

// Join Group
app.post('/api/chat/join_group', async (req, res) => {
    const { roomId, userId } = req.body;
    if (!roomId || !userId) return res.json({ success: false, message: 'Missing data' });
    
    try {
        const p = await getPool();
        const exist = await p.query('SELECT * FROM chat_participants WHERE room_id=$1 AND user_id=$2', [roomId, userId]);
        if (exist.rows.length > 0) return res.json({ success: false, message: 'Already a member' });
        
        await p.query("INSERT INTO chat_participants (room_id, user_id, role) VALUES ($1, $2, 'member')", [roomId, userId]);
        const user = await p.query('SELECT username FROM auth_users WHERE id=$1', [userId]);
        await p.query("INSERT INTO chat_messages (room_id, sender_id, username, message) VALUES ($1, 0, 'System', $2)", [roomId, `${user.rows[0]?.username || 'User'} joined the group`]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});
// Get Group Members (for manage)
app.post('/api/chat/group_members', async (req, res) => {
    const { roomId, userId } = req.body;
    if (!roomId || !userId) return res.json({ success: false, message: 'Missing data' });
    
    try {
        const p = await getPool();
        const reqCheck = await p.query('SELECT role FROM chat_participants WHERE room_id=$1 AND user_id=$2', [roomId, userId]);
        if (reqCheck.rows.length === 0) return res.json({ success: false, message: 'Not a member' });
        
        const userRole = reqCheck.rows[0].role;
        const members = await p.query(`
            SELECT cp.user_id, cp.role, u.username,
             (SELECT avatar_url FROM user_avatars WHERE user_id = cp.user_id ORDER BY updated_at DESC LIMIT 1) as avatar_url
            FROM chat_participants cp
            JOIN auth_users u ON cp.user_id = u.id
            WHERE cp.room_id = $1
            ORDER BY CASE cp.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, u.username ASC
        `, [roomId]);
        res.json({ success: true, members: members.rows, userRole });
    } catch(e) { res.json({ success: false }); }
});

// Promote to Admin
app.post('/api/chat/promote_admin', async (req, res) => {
    const { roomId, userId, requesterId } = req.body;
    if (!roomId || !userId || !requesterId) return res.json({ success: false });
    
    try {
        const p = await getPool();
        const ownerCheck = await p.query("SELECT * FROM chat_participants WHERE room_id=$1 AND user_id=$2 AND role='owner'", [roomId, requesterId]);
        if (ownerCheck.rows.length === 0) return res.json({ success: false, message: 'Only owner can promote' });
        await p.query("UPDATE chat_participants SET role='admin' WHERE room_id=$1 AND user_id=$2", [roomId, userId]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

// Demote to Member
app.post('/api/chat/demote_member', async (req, res) => {
    const { roomId, userId, requesterId } = req.body;
    if (!roomId || !userId || !requesterId) return res.json({ success: false });
    
    try {
        const p = await getPool();
        const ownerCheck = await p.query("SELECT * FROM chat_participants WHERE room_id=$1 AND user_id=$2 AND role='owner'", [roomId, requesterId]);
        if (ownerCheck.rows.length === 0) return res.json({ success: false, message: 'Only owner can demote' });
        await p.query("UPDATE chat_participants SET role='member' WHERE room_id=$1 AND user_id=$2", [roomId, userId]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

// Kick Member
app.post('/api/chat/kick_member', async (req, res) => {
    const { roomId, userId, requesterId } = req.body;
    if (!roomId || !userId || !requesterId) return res.json({ success: false });
    
    try {
        const p = await getPool();
        const permCheck = await p.query("SELECT role FROM chat_participants WHERE room_id=$1 AND user_id=$2 AND role IN ('owner','admin')", [roomId, requesterId]);
        if (permCheck.rows.length === 0) return res.json({ success: false, message: 'Permission denied' });
        
        const targetCheck = await p.query("SELECT role FROM chat_participants WHERE room_id=$1 AND user_id=$2", [roomId, userId]);
        if (targetCheck.rows.length > 0 && targetCheck.rows[0].role === 'owner') return res.json({ success: false, message: 'Cannot kick owner' });
        
        await p.query('DELETE FROM chat_participants WHERE room_id=$1 AND user_id=$2', [roomId, userId]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});
// Ban Member
app.post('/api/chat/ban_member', async (req, res) => {
    const { roomId, userId, requesterId, durationMinutes } = req.body;
    if (!roomId || !userId || !requesterId) return res.json({ success: false });
    
    try {
        const p = await getPool();
        
        // Permission check
        const permCheck = await p.query("SELECT role FROM chat_participants WHERE room_id=$1 AND user_id=$2 AND role IN ('owner','admin')", [roomId, requesterId]);
        if (permCheck.rows.length === 0) return res.json({ success: false, message: 'Permission denied' });
        
        // Cannot ban owner
        const targetCheck = await p.query("SELECT role FROM chat_participants WHERE room_id=$1 AND user_id=$2", [roomId, userId]);
        if (targetCheck.rows.length > 0 && targetCheck.rows[0].role === 'owner') {
            return res.json({ success: false, message: 'Cannot ban owner' });
        }
        
        // ✅ Member stays in group (don't delete from chat_participants)
        // ✅ Just add to banned_users table
        const banKey = 'group_' + roomId;
        
        // Calculate expiry
        let expiryDate = null;
        if (durationMinutes && durationMinutes > 0) {
            expiryDate = new Date(Date.now() + durationMinutes * 60 * 1000);
        }
        
        // Add to banned_users with expiry
        await p.query(
            `INSERT INTO banned_users (user_id, banned_by, ban_expiry) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (user_id, banned_by) 
             DO UPDATE SET ban_expiry = $3`,
            [userId, banKey, expiryDate]
        );
        
        res.json({ 
            success: true, 
            message: durationMinutes ? 'Banned for ' + durationMinutes + ' min (text box locked)' : 'Permanently banned (text box locked)' 
        });
        
    } catch(e) {
        console.error('[BAN ERROR]', e.message);
        res.json({ success: false, message: 'Server error' });
    }
});

app.post('/api/chat/check_ban', async (req, res) => {
    const { userId, roomId } = req.body;
    if (!userId || !roomId) return res.json({ success: false });
    
    try {
        const p = await getPool();
        const banKey = 'group_' + roomId;
        
        const r = await p.query(
            'SELECT * FROM banned_users WHERE user_id=$1 AND banned_by=$2',
            [userId, banKey]
        );
        
        if (r.rows.length === 0) {
            return res.json({ success: true, is_banned: false });
        }
        
        const ban = r.rows[0];
        
        // Check if ban expired
        if (ban.ban_expiry && new Date(ban.ban_expiry) <= new Date()) {
            // Auto remove expired ban
            await p.query('DELETE FROM banned_users WHERE user_id=$1 AND banned_by=$2', [userId, banKey]);
            return res.json({ success: true, is_banned: false });
        }
        
        res.json({
            success: true,
            is_banned: true,
            ban_expiry: ban.ban_expiry ? ban.ban_expiry.toISOString() : null
        });
        
    } catch(e) {
        res.json({ success: false, is_banned: false });
    }
});

// Transfer Ownership
app.post('/api/chat/transfer_owner', async (req, res) => {
    const { roomId, userId, requesterId } = req.body;
    if (!roomId || !userId || !requesterId) return res.json({ success: false });
    
    try {
        const p = await getPool();
        const ownerCheck = await p.query("SELECT * FROM chat_participants WHERE room_id=$1 AND user_id=$2 AND role='owner'", [roomId, requesterId]);
        if (ownerCheck.rows.length === 0) return res.json({ success: false, message: 'Only owner can transfer' });
        
        await p.query("UPDATE chat_participants SET role='admin' WHERE room_id=$1 AND user_id=$2", [roomId, requesterId]);
        await p.query("UPDATE chat_participants SET role='owner' WHERE room_id=$1 AND user_id=$2", [roomId, userId]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

// Create Group with public link
app.post('/api/chat/create_group', async (req, res) => {
    const { userId, groupName, members, publicLink } = req.body;
    if (!userId || !groupName) return res.json({ success: false, message: 'Group name required' });
    
    try {
        const p = await getPool();
        const link = publicLink || groupName.toLowerCase().replace(/\s+/g, '-');
        
        // ✅ public_link column မသုံးဘဲ room_name ကိုပဲ link အဖြစ်သုံး
        const room = await p.query(
            "INSERT INTO chat_rooms (room_name, room_type, created_by) VALUES ($1, 'group', $2) RETURNING id",
            [groupName, userId]
        );
        const roomId = room.rows[0].id;
        await p.query("INSERT INTO chat_participants (room_id, user_id, role) VALUES ($1, $2, 'owner')", [roomId, userId]);
        
        res.json({ success: true, room: { id: roomId, room_name: groupName } });
    } catch(e) {
        console.error('[CREATE GROUP ERROR]', e.message);
        res.json({ success: false, message: 'Server error: ' + e.message });
    }
});
// ==================== BAN CHECK MIDDLEWARE ====================
async function banCheckMiddleware(req, res, next) {
    // စစ်မယ့် Page တွေ (dashboard က သွားတဲ့ Page တွေ)
    const protectedPages = [
        '/dashboard', '/topup.html', '/buycode.html', '/data.html', 
        '/history.html', '/password.html', '/recovery.html', 
        '/contact.html', '/game.html', '/exchange.html',
        '/chat.html', '/chatpremium.html', '/group.html', '/profile.html'
    ];
    
    // Login, Register, Admin, Index တွေက မစစ်ဘူး
    const path = req.path;
    
    // Protected Page တွေမှသာ Ban စစ်
    if (protectedPages.some(p => path === p || path.startsWith(p))) {
        // Cookie ကနေ Token ဖတ်
        const token = req.cookies?.auth_token;
        
        if (token && token !== 'guest') {
            try {
                const uid = parseInt(token.replace('token_', ''));
                if (!isNaN(uid)) {
                    const p = await getPool();
                    const r = await p.query('SELECT * FROM banned_users WHERE user_id = $1', [uid]);
                    
                    if (r.rows.length > 0) {
                        // Ban ခံထားရ → Login Page ပြန်ပို့
                        return res.redirect('/?banned=1');
                    }
                }
            } catch(e) {}
        }
    }
    
    next();
}

// ✅ Middleware ကို အသုံးပြု
app.use(banCheckMiddleware);
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
app.get('/chat.html', (req, res) => res.sendFile(path.join(__dirname, 'chat.html')));
app.get('/chatpremium.html', (req, res) => res.sendFile(path.join(__dirname, 'chatpremium.html')));
app.get('/group.html', (req, res) => res.sendFile(path.join(__dirname, 'group.html')));
app.get('/profile.html', (req, res) => res.sendFile(path.join(__dirname, 'profile.html')));
app.get('/monitor.html', (req, res) => res.sendFile(path.join(__dirname, 'monitor.html')));
pools.forEach(pool => {
    initTables(pool);
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📊 DB: 5 Pools Auto-Switch`);
    console.log(`📄 Page Control: ${ALL_PAGES.length} pages`);
    console.log(`💬 Chat: Socket.io Ready`);
    console.log(`🤖 Bot: Enhanced Long Polling`);
    console.log(`🎮 Redeem Codes: ${REDEEM_CATEGORIES.length} categories`);
    console.log(`👑 Premium Chat System: Ready`);
});
