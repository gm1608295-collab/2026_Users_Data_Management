const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// JSON file database
const DB_FILE = path.join(__dirname, 'database.json');

function readDB() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], notices: [], banned: [] }));
        }
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        return { users: [], notices: [], banned: [] };
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ==================== AUTH ====================
app.post('/api/register', (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.json({ success: false, message: 'All fields required' });

    const db = readDB();
    if (db.users.find(u => u.email === email)) {
        return res.json({ success: false, message: 'Email already exists' });
    }

    const newUser = {
        id: db.users.length + 1,
        username,
        email,
        password,
        login_type: 'local',
        gmail_pass: 'DoubleMK2008',
        mlbb_pass: 'GlobalMK2008',
        createdAt: new Date().toISOString()
    };

    db.users.push(newUser);
    writeDB(db);
    res.json({ success: true, message: 'Registration successful' });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.json({ success: false, message: 'Email and password required' });

    const db = readDB();
    const user = db.users.find(u => u.email === email && u.password === password && u.login_type === 'local');
    if (!user) return res.json({ success: false, message: 'Invalid email or password' });

    res.json({
        success: true,
        token: 'token_' + user.id,
        user: { id: user.id, username: user.username, email: user.email, login_type: 'local' }
    });
});

app.post('/api/auth/google', (req, res) => {
    const { token, userInfo } = req.body;
    if (!userInfo) return res.json({ success: false });

    const { sub: googleId, email, name, picture } = userInfo;
    const db = readDB();
    let user = db.users.find(u => u.google_id === googleId || (u.email === email && u.login_type === 'local'));

    if (user) {
        user.google_id = googleId;
        writeDB(db);
        return res.json({
            success: true,
            token: 'token_' + user.id,
            user: { id: user.id, username: user.username, email: user.email, login_type: 'google' }
        });
    }

    const newUser = {
        id: db.users.length + 1,
        username: name || 'Google User',
        email,
        google_id: googleId,
        password: '',
        login_type: 'google',
        gmail_pass: 'DoubleMK2008',
        mlbb_pass: 'GlobalMK2008',
        createdAt: new Date().toISOString()
    };

    db.users.push(newUser);
    writeDB(db);
    res.json({
        success: true,
        token: 'token_' + newUser.id,
        user: { id: newUser.id, username: newUser.username, email: newUser.email, login_type: 'google' }
    });
});

app.post('/api/check_session', (req, res) => {
    const { token } = req.body;
    if (!token) return res.json({ success: false });

    const userId = parseInt(token.replace('token_', ''));
    const db = readDB();
    const user = db.users.find(u => u.id === userId);
    if (!user) return res.json({ success: false });

    res.json({ success: true, user: { id: user.id, username: user.username, email: user.email, login_type: user.login_type } });
});

app.post('/api/logout', (req, res) => {
    res.json({ success: true });
});

// ==================== PASSWORDS ====================
app.post('/api/get_passwords', (req, res) => {
    const { token } = req.body;
    if (!token) return res.json({ success: true, gmail_password: 'DoubleMK2008', mlbb_password: 'GlobalMK2008' });

    const userId = parseInt(token.replace('token_', ''));
    const db = readDB();
    const user = db.users.find(u => u.id === userId);
    if (!user) return res.json({ success: true, gmail_password: 'DoubleMK2008', mlbb_password: 'GlobalMK2008' });

    res.json({ success: true, gmail_password: user.gmail_pass, mlbb_password: user.mlbb_pass });
});

app.post('/api/change_password', (req, res) => {
    const { token, type, current_password, new_password } = req.body;
    if (!token) return res.json({ success: false, message: 'Session expired' });

    const userId = parseInt(token.replace('token_', ''));
    const db = readDB();
    const user = db.users.find(u => u.id === userId);
    if (!user) return res.json({ success: false, message: 'User not found' });

    const field = type === 'gmail' ? 'gmail_pass' : 'mlbb_pass';
    if (current_password !== user[field]) return res.json({ success: false, message: 'Wrong current password' });

    user[field] = new_password;
    writeDB(db);
    res.json({ success: true, message: 'Password changed' });
});

// ==================== ADMIN ====================
app.post('/api/admin/search', (req, res) => {
    const { userId } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.id == userId || u.username == userId || u.email == userId);
    if (user) {
        return res.json({ success: true, data: { user_id: user.id, ingame_name: user.username, name: user.username, password: user.password } });
    }
    res.json({ success: false, message: 'Not found' });
});

app.post('/api/admin/ban', (req, res) => {
    const { userId } = req.body;
    const db = readDB();
    if (!db.banned.includes(userId)) db.banned.push(userId);
    writeDB(db);
    res.json({ success: true });
});

app.post('/api/admin/delete', (req, res) => {
    const { userId } = req.body;
    let db = readDB();
    db.users = db.users.filter(u => u.id != userId && u.username != userId && u.email != userId);
    writeDB(db);
    res.json({ success: true });
});

// ==================== NOTICE ====================
app.get('/api/notice', (req, res) => {
    const db = readDB();
    const lastNotice = db.notices[db.notices.length - 1];
    if (lastNotice) {
        return res.json({ success: true, message: lastNotice.message, created_at: lastNotice.created_at });
    }
    res.json({ success: true, message: '' });
});

app.post('/api/admin/notice', (req, res) => {
    const { message } = req.body;
    if (!message) return res.json({ success: false, message: 'Message required' });
    const db = readDB();
    db.notices.push({ message, created_at: new Date().toISOString(), created_by: 'admin' });
    writeDB(db);
    res.json({ success: true, message: 'Notice posted' });
});

// ==================== PAGES ====================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
