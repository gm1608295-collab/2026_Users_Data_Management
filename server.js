const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Simple in-memory user store
let users = [];

app.post('/api/register', (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.json({ success: false, message: 'All fields required' });
    
    const exists = users.find(u => u.email === email);
    if (exists) return res.json({ success: false, message: 'Email already exists' });
    
    users.push({ id: users.length + 1, username, email, password, login_type: 'local' });
    res.json({ success: true, message: 'Registration successful' });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.json({ success: false, message: 'Email and password required' });
    
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) return res.json({ success: false, message: 'Invalid email or password' });
    
    res.json({ success: true, token: 'token_' + user.id, user: { id: user.id, username: user.username, email: user.email, login_type: 'local' } });
});

app.post('/api/check_session', (req, res) => {
    const { token } = req.body;
    if (!token) return res.json({ success: false });
    
    const userId = parseInt(token.replace('token_', ''));
    const user = users.find(u => u.id === userId);
    if (!user) return res.json({ success: false });
    
    res.json({ success: true, user: { id: user.id, username: user.username, email: user.email, login_type: 'local' } });
});

app.post('/api/logout', (req, res) => {
    res.json({ success: true });
});

app.post('/api/get_passwords', (req, res) => {
    res.json({ success: true, gmail_password: 'DoubleMK2008', mlbb_password: 'GlobalMK2008' });
});

app.post('/api/change_password', (req, res) => {
    res.json({ success: true, message: 'Password changed' });
});

app.post('/api/admin/search', (req, res) => {
    const { userId } = req.body;
    const user = users.find(u => u.id == userId || u.username == userId || u.email == userId);
    if (user) return res.json({ success: true, data: { user_id: user.id, name: user.username, email: user.email, password: user.password } });
    res.json({ success: false, message: 'Not found' });
});

app.post('/api/admin/ban', (req, res) => {
    res.json({ success: true });
});

app.post('/api/admin/delete', (req, res) => {
    const { userId } = req.body;
    users = users.filter(u => u.id != userId && u.username != userId && u.email != userId);
    res.json({ success: true });
});

app.get('/api/notice', (req, res) => {
    res.json({ success: true, message: 'Welcome to MLBB Security System!' });
});

app.post('/api/admin/notice', (req, res) => {
    res.json({ success: true, message: 'Notice posted' });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
