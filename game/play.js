
// ==================== MAIN GAME ENGINE ====================
(function() {
    // ==================== DOM ELEMENTS ====================
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const wrapper = document.getElementById('gameWrapper');
    
    const startScreen = document.getElementById('startScreen');
    const gameOverScreen = document.getElementById('gameOverScreen');
    const winScreen = document.getElementById('winScreen');
    
    const hudLevel = document.getElementById('hudLevel');
    const hudTime = document.getElementById('hudTime');
    const hudCoins = document.getElementById('hudCoins');
    const hudDiamonds = document.getElementById('hudDiamonds');
    const hudScore = document.getElementById('hudScore');
    
    // ==================== PORTRAIT WARNING ====================
    const portraitWarning = document.createElement('div');
    portraitWarning.id = 'portraitWarning';
    portraitWarning.style.cssText = `
        display:none;position:absolute;top:0;left:0;width:100%;height:100%;
        z-index:30;background:rgba(0,0,0,0.92);
        flex-direction:column;justify-content:center;align-items:center;
        color:#fff;text-align:center;pointer-events:none;
    `;
    portraitWarning.innerHTML = `
        <div style="font-size:70px;animation:rotatePhone 2s infinite">📱</div>
        <p style="font-size:18px;color:#f39c12;font-weight:bold;margin-top:20px">🔄 Please Rotate Your Device</p>
        <p style="font-size:14px;color:#aaa;margin-top:10px">ကျေးဇူးပြု၍ ဖုန်းကို ဘေးတိုက်ထားပါ</p>
        <style>
            @keyframes rotatePhone{0%,100%{transform:rotate(0deg)}50%{transform:rotate(90deg)}}
        </style>
    `;
    wrapper.appendChild(portraitWarning);
    
    function checkOrientation() {
        const isPortrait = window.innerHeight > window.innerWidth;
        if (isPortrait && gameRunning) {
            portraitWarning.style.display = 'flex';
            gamePaused = true;
        } else if (!isPortrait && gamePaused && portraitWarning.style.display === 'flex') {
            portraitWarning.style.display = 'none';
            gamePaused = false;
        } else if (!isPortrait) {
            portraitWarning.style.display = 'none';
        }
    }
    
    async function lockLandscape() {
        try {
            if (screen.orientation && screen.orientation.lock) {
                await screen.orientation.lock('landscape');
            }
        } catch(e) {}
    }
    
    window.addEventListener('orientationchange', () => setTimeout(checkOrientation, 200));
    window.addEventListener('resize', () => { resizeCanvas(); checkOrientation(); });
    
    // ==================== CANVAS SETUP ====================
    let W, H, GROUND_Y;
    
    function resizeCanvas() {
        W = wrapper.clientWidth;
        H = wrapper.clientHeight;
        canvas.width = W;
        canvas.height = H;
        GROUND_Y = Math.floor(H * 0.8);
    }
    resizeCanvas();
    
    // ==================== GAME STATE ====================
    const GRAVITY = 0.55, MAX_SPEED = 14;
    let gameRunning = false, gamePaused = false;
    let currentLevel = 0, score = 0, coins = 0, diamonds = 0, timeLeft = 300;
    let timerInterval = null;
    let playerLives = 3, enemyKills = 0;
    let levelLength = 0, flagX = 0;
    let platforms = [], mysteryBoxes = [], coinItems = [], enemies = [];
    let particles = [], cameraX = 0, lastJumpTime = 0;
    let globalKeys = {};
    
    // ==================== PLAYER ====================
    const player = {
        x: 80, y: 0, w: 30, h: 42,
        vx: 0, vy: 0, speed: 5.5,
        jumpForce: -11.5, doubleJump: true, canDoubleJump: false,
        onGround: false, isBig: false, invincible: false, invincibleTimer: 0,
        facing: 1, color: '#e74c3c', blinkTimer: 0
    };
    
    // ==================== LEVELS ====================
    const levels = [
        { name: '1-1', timeLimit: 300, enemyTypes: ['goomba','goomba','goomba','goomba','goomba','koopa','goomba'],
          platCount: 10, coinCount: 25, boxCount: 6, boss: false },
        { name: '1-2', timeLimit: 280, enemyTypes: ['goomba','koopa','goomba','goomba','koopa','goomba','goomba','koopa'],
          platCount: 12, coinCount: 30, boxCount: 7, boss: false },
        { name: '1-3', timeLimit: 260, enemyTypes: ['koopa','goomba','koopa','goomba','koopa','goomba','koopa','goomba','koopa'],
          platCount: 14, coinCount: 28, boxCount: 6, boss: false },
        { name: '1-4', timeLimit: 240, enemyTypes: ['goomba','koopa','koopa','goomba','goomba','koopa','goomba','koopa','goomba','koopa'],
          platCount: 16, coinCount: 35, boxCount: 8, boss: false },
        { name: '1-5', timeLimit: 200, enemyTypes: ['goomba','koopa','goomba','koopa','goomba'],
          platCount: 8, coinCount: 15, boxCount: 5, boss: true },
    ];
    
    // ==================== LEVEL GENERATION ====================
    function generateLevel(idx) {
        if (idx >= levels.length) { winGame(); return; }
        
        const lvl = levels[idx];
        currentLevel = idx;
        resizeCanvas();
        
        levelLength = Math.max(W * 3.5, 3200);
        flagX = levelLength - 300;
        timeLeft = lvl.timeLimit;
        
        // Platforms
        platforms = [];
        for (let i = 0; i < lvl.platCount; i++) {
            platforms.push({
                x: 200 + Math.random() * (levelLength - 400),
                y: GROUND_Y - 55 - Math.random() * 230,
                w: 50 + Math.random() * 100, h: 16
            });
        }
        platforms.push({ x: flagX - 280, y: GROUND_Y - 140, w: 140, h: 16 });
        platforms.push({ x: flagX - 150, y: GROUND_Y - 95, w: 120, h: 16 });
        platforms.push({ x: flagX - 60, y: GROUND_Y - 160, w: 110, h: 16 });
        
        // Mystery Boxes
        mysteryBoxes = [];
        const boxItems = ['coin', 'coin', 'mushroom', 'star', 'diamond'];
        for (let i = 0; i < lvl.boxCount; i++) {
            mysteryBoxes.push({
                x: 300 + Math.random() * (levelLength - 600),
                y: GROUND_Y - 110 - Math.random() * 180,
                item: boxItems[Math.floor(Math.random() * boxItems.length)],
                collected: false, w: 32, h: 32
            });
        }
        
        // Coins
        coinItems = [];
        for (let i = 0; i < lvl.coinCount; i++) {
            coinItems.push({
                x: 140 + Math.random() * (levelLength - 280),
                y: GROUND_Y - 30 - Math.random() * 290,
                collected: false, r: 10
            });
        }
        
        // Enemies
        enemies = [];
        lvl.enemyTypes.forEach((type, i) => {
            const eW = type === 'boss' ? 50 : 34;
            const eH = type === 'boss' ? 58 : 32;
            const enemyObj = {
                x: 250 + i * 200 + Math.random() * 150,
                y: GROUND_Y - eH,
                type: type, w: eW, h: eH,
                vx: (Math.random() > 0.5 ? 1 : -1) * (1.2 + Math.random() * 1.5),
                vy: 0, alive: true, stomped: false, stompTimer: 0,
                hp: type === 'boss' ? 6 : (type === 'koopa' ? 2 : 1),
                maxHp: type === 'boss' ? 6 : (type === 'koopa' ? 2 : 1)
            };
            enemies.push(enemyObj);
        });
        
        if (lvl.boss) {
            enemies.push({
                x: flagX - 400, y: GROUND_Y - 58, type: 'boss', w: 50, h: 58,
                vx: -2, vy: 0, alive: true, stomped: false, stompTimer: 0,
                hp: 6, maxHp: 6
            });
        }
        
        // Reset player
        player.x = 80;
        player.y = GROUND_Y - player.h;
        player.vx = 0;
        player.vy = 0;
        player.onGround = false;
        player.doubleJump = true;
        player.canDoubleJump = false;
        player.isBig = false;
        player.invincible = false;
        player.invincibleTimer = 0;
        player.w = 30;
        player.h = 42;
        player.color = '#e74c3c';
        player.blinkTimer = 0;
        
        cameraX = 0;
        particles = [];
        
        hudLevel.textContent = lvl.name;
        hudTime.textContent = timeLeft;
        updateHUD();
    }
    
    function updateHUD() {
        hudCoins.textContent = coins;
        hudDiamonds.textContent = diamonds;
        hudScore.textContent = score;
    }
    
    // ==================== COLLISION ====================
    function rectHit(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }
    
    function addParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x: x + Math.random() * 15, y: y + Math.random() * 15,
                vx: (Math.random() - 0.5) * 7, vy: -(Math.random() * 7 + 3),
                life: 18 + Math.random() * 22, color: color, size: 2 + Math.random() * 4
            });
        }
    }
    
    function collectItem(it, type) {
        if (type === 'coin') { coins++; score += 100; addParticles(it.x, it.y, '#ffd700', 10); SFX.coin(); }
        else if (type === 'diamond') { diamonds++; score += 500; addParticles(it.x, it.y, '#00bcd4', 20); SFX.coin(); }
        else if (type === 'mushroom') { player.makeBig(); score += 200; addParticles(it.x, it.y, '#e74c3c', 15); SFX.powerup(); }
        else if (type === 'star') { player.makeInvincible(220); score += 300; addParticles(it.x, it.y, '#ffdd00', 28); SFX.powerup(); }
        updateHUD();
    }
    
    // Add missing methods to player object
    player.makeBig = function() {
        if (!this.isBig) { this.isBig = true; this.h = 52; this.y -= 10; }
    };
    player.makeInvincible = function(dur) {
        this.invincible = true; this.invincibleTimer = dur; this.color = '#ffdd00';
    };
    
    // ==================== GAME FLOW ====================
     function startGame() {
    resizeCanvas();
    checkOrientation();
    
    score = 0;
    coins = 0;
    diamonds = 0;
    playerLives = 3;
    enemyKills = 0;
    currentLevel = 0;
    
    startScreen.style.display = 'none';
    gameOverScreen.style.display = 'none';
    winScreen.style.display = 'none';
    portraitWarning.style.display = 'none';
    
    generateLevel(0);
    gameRunning = true;
    gamePaused = false;
    
    // ✅ FIX: Rebuild mobile controls on restart
    const mobileCtrl = document.getElementById('mobileControls');
    if (mobileCtrl && window.innerWidth <= 768) {
        mobileCtrl.style.display = 'block';
        // Re-attach touch events
        if (typeof setupMobileControls === 'function') {
            setupMobileControls();
        }
    }
    
    updateHUD();
    
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (gameRunning && !gamePaused) {
            timeLeft--;
            hudTime.textContent = timeLeft;
            if (timeLeft <= 0) playerDie();
        }
    }, 1000);
    }
        
    function restartGame() { startGame(); }
    
    function playerDie() {
        playerLives--;
        SFX.die();
        if (playerLives <= 0) { gameOver(); return; }
        player.invincible = true;
        player.invincibleTimer = 90;
        player.blinkTimer = 0;
        generateLevel(currentLevel);
        updateHUD();
    }
    
    function gameOver() {
        gameRunning = false;
        if (timerInterval) clearInterval(timerInterval);
        document.getElementById('finalScore').textContent = score;
        document.getElementById('finalLevel').textContent = levels[currentLevel].name;
        gameOverScreen.style.display = 'flex';
        saveScore();
    }
    
    function winGame() {
        gameRunning = false;
        if (timerInterval) clearInterval(timerInterval);
        SFX.win();
        document.getElementById('winScore').textContent = score;
        document.getElementById('winDiamonds').textContent = diamonds;
        winScreen.style.display = 'flex';
        saveScore();
    }
    
    async function saveScore() {
        const did = localStorage.getItem('gdid') || 'g_' + Date.now();
        if (!localStorage.getItem('gdid')) localStorage.setItem('gdid', did);
        try {
            await fetch('/api/game/save_score', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    device_id: did, score: score, gold_earned: coins,
                    waves_completed: currentLevel + 1, kills: enemyKills,
                    deaths: 3 - playerLives, hero_used: 'SoloRunner'
                })
            });
        } catch(e) {}
    }
    
    document.getElementById('btnStart').onclick = function() { lockLandscape(); startGame(); };
    document.getElementById('btnRetry').onclick = restartGame;
    document.getElementById('btnPlayAgain').onclick = restartGame;
    
    // Expose keys for button.js
    window.gameKeys = globalKeys;
    window.gameIsRunning = function() { return gameRunning && !gamePaused; };
    
    // ==================== UPDATE ====================
    function update() {
        if (!gameRunning || gamePaused) return;
        
        // Keyboard Input
        if (globalKeys['ArrowLeft'] || globalKeys['a'] || globalKeys['A']) {
            player.vx = -player.speed;
            player.facing = -1;
        } else if (globalKeys['ArrowRight'] || globalKeys['d'] || globalKeys['D']) {
            player.vx = player.speed;
            player.facing = 1;
        } else {
            player.vx *= 0.7;
        }
        
        const jumpKey = globalKeys['ArrowUp'] || globalKeys['w'] || globalKeys['W'] || globalKeys[' '] || globalKeys['Space'];
        const now = Date.now();
        
        if (jumpKey && player.onGround && now - lastJumpTime > 150) {
            player.vy = player.jumpForce;
            player.onGround = false;
            player.canDoubleJump = true;
            lastJumpTime = now;
            SFX.jump();
        } else if (jumpKey && !player.onGround && player.canDoubleJump && player.doubleJump && now - lastJumpTime > 150) {
            player.vy = player.jumpForce * 0.78;
            player.canDoubleJump = false;
            player.doubleJump = false;
            lastJumpTime = now;
            addParticles(player.x + player.w/2, player.y + player.h, '#fff', 8);
            SFX.jump();
        }
        
        player.vy += GRAVITY;
        if (player.vy > MAX_SPEED) player.vy = MAX_SPEED;
        player.x += player.vx;
        player.y += player.vy;
        player.onGround = false;
        
        if (player.y + player.h >= GROUND_Y) {
            player.y = GROUND_Y - player.h;
            player.vy = 0;
            player.onGround = true;
            player.doubleJump = true;
        }
        
        platforms.forEach(p => {
            if (player.vy > 0 && player.x + player.w > p.x && player.x < p.x + p.w &&
                player.y + player.h >= p.y && player.y + player.h - player.vy <= p.y) {
                player.y = p.y - player.h;
                player.vy = 0;
                player.onGround = true;
                player.doubleJump = true;
            }
        });
        
        if (player.x < 0) player.x = 0;
        if (player.y > H + 120) playerDie();
        
        const targetCam = player.x - W / 3;
        cameraX += (targetCam - cameraX) * 0.14;
        if (cameraX < 0) cameraX = 0;
        if (cameraX > levelLength - W) cameraX = levelLength - W;
        
        mysteryBoxes.forEach(box => {
            if (!box.collected && rectHit(player, { x: box.x, y: box.y - box.h, w: box.w, h: box.h })) {
                box.collected = true;
                collectItem(box, box.item);
            }
        });
        
        coinItems.forEach(coin => {
            if (!coin.collected && Math.hypot(player.x + player.w/2 - coin.x, player.y + player.h/2 - coin.y) < coin.r + player.w/2) {
                coin.collected = true;
                collectItem(coin, 'coin');
            }
        });
        
        enemies.forEach(en => {
            if (!en.alive) return;
            if (en.stomped) { en.stompTimer--; if (en.stompTimer <= 0) en.alive = false; return; }
            
            if (en.type === 'boss') {
                if (player.x < en.x) en.vx = -2.8; else en.vx = 2.8;
            } else {
                en.x += en.vx;
                if (en.x < cameraX - 80 || en.x > cameraX + W + 400) en.vx *= -1;
            }
            en.y = GROUND_Y - en.h;
            
            if (rectHit(player, en)) {
                if (player.vy > 0 && player.y + player.h - player.vy <= en.y + 14) {
                    en.hp--;
                    player.vy = -7.5;
                    if (en.hp <= 0) {
                        en.stomped = true;
                        en.stompTimer = 16;
                        enemyKills++;
                        score += en.type === 'boss' ? 5000 : (en.type === 'koopa' ? 500 : 200);
                        addParticles(en.x + en.w/2, en.y, '#ff5722', 22);
                        SFX.stomp();
                        updateHUD();
                    } else {
                        SFX.bossHit();
                    }
                } else if (!player.invincible) {
                    playerDie();
                }
            }
        });
        
        if (player.invincible) {
            player.invincibleTimer--;
            player.blinkTimer++;
            if (player.invincibleTimer <= 0) {
                player.invincible = false;
                player.color = '#e74c3c';
            }
        }
        
        if (player.x > flagX) {
            score += timeLeft * 10;
            updateHUD();
            generateLevel(currentLevel + 1);
            updateHUD();
        }
        
        particles = particles.filter(p => {
            p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life--;
            return p.life > 0;
        });
    }
    
    // ==================== RENDER ====================
    function drawPlayer() {
        const px = Math.floor(player.x - cameraX);
        const py = Math.floor(player.y);
        const pw = player.w, ph = player.h;
        const now = Date.now();
        
        if (!player.invincible || Math.floor(player.blinkTimer / 4) % 2 === 0) {
            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.beginPath();
            ctx.ellipse(px + pw/2, GROUND_Y + 3, pw/2, 4, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Legs
            ctx.fillStyle = '#1565C0';
            ctx.fillRect(px + 5, py + ph - 8, 8, 8);
            ctx.fillRect(px + pw - 13, py + ph - 8, 8, 8);
            
            // Shoes
            ctx.fillStyle = '#5D4037';
            ctx.fillRect(px + 3, py + ph - 3, 12, 5);
            ctx.fillRect(px + pw - 15, py + ph - 3, 12, 5);
            
            // Body
            ctx.fillStyle = player.color;
            ctx.fillRect(px + 3, py + 14, pw - 6, ph - 24);
            
            // Straps
            ctx.fillStyle = '#1976D2';
            ctx.fillRect(px + 6, py + 14, 4, ph - 26);
            ctx.fillRect(px + pw - 10, py + 14, 4, ph - 26);
            
            // Belt
            ctx.fillStyle = '#FFC107';
            ctx.fillRect(px + 2, py + ph - 14, pw - 4, 4);
            
            // Arms
            ctx.fillStyle = '#FFCC80';
            const armSwing = (player.onGround && Math.abs(player.vx) > 0.5) ? Math.sin(now / 120) * 4 : 0;
            ctx.fillRect(px - 4, py + 16 + armSwing, 8, 12);
            ctx.fillRect(px + pw - 4, py + 16 - armSwing, 8, 12);
            
            // Head
            ctx.fillStyle = '#FFCC80';
            ctx.beginPath();
            ctx.arc(px + pw/2, py + 8, pw/2 - 1, 0, Math.PI * 2);
            ctx.fill();
            
            // Eyes
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(px + 8, py + 9, 5, 0, Math.PI * 2); ctx.fill();
            ctx.arc(px + pw - 8, py + 9, 5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#000';
            const ed = player.facing > 0 ? 2.5 : -2.5;
            ctx.beginPath();
            ctx.arc(px + 8 + ed, py + 10, 2.2, 0, Math.PI * 2); ctx.fill();
            ctx.arc(px + pw - 8 + ed, py + 10, 2.2, 0, Math.PI * 2); ctx.fill();
            
            // Mustache
            ctx.fillStyle = '#5D4037';
            ctx.fillRect(px + 5, py + 14, pw - 10, 3);
            
            // Mouth
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(px + pw/2, py + 19, 4, 0, Math.PI); ctx.fill();
            
            // Hat
            ctx.fillStyle = '#C62828';
            ctx.beginPath();
            ctx.ellipse(px + pw/2, py + 3, pw/2 + 2, 8, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.ellipse(px + pw/2, py + 1, pw/2, 6, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#C62828';
            ctx.beginPath();
            ctx.arc(px + pw/2, py - 1, 5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 6px Arial';
            ctx.fillText('S', px + pw/2 - 3, py + 2);
        }
    }
    
    function render() {
        ctx.clearRect(0, 0, W, H);
        const now = Date.now();
        
        // Sky
        const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
        sky.addColorStop(0, '#2196F3'); sky.addColorStop(0.4, '#64B5F6');
        sky.addColorStop(0.8, '#a5d6a7'); sky.addColorStop(1, '#66BB6A');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, GROUND_Y);
        
        // Sun
        const sx = W - 80 - cameraX * 0.04, sy = 50;
        ctx.fillStyle = 'rgba(255,255,200,0.25)';
        ctx.beginPath(); ctx.arc(sx, sy, 60, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,150,0.5)';
        ctx.beginPath(); ctx.arc(sx, sy, 42, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FFE082';
        ctx.beginPath(); ctx.arc(sx, sy, 28, 0, Math.PI * 2); ctx.fill();
        
        // Mountains
        ctx.fillStyle = '#81C784';
        for (let i = 0; i < 10; i++) {
            const mx = ((i * 200) - cameraX * 0.2) % (W + 450) - 180;
            ctx.beginPath(); ctx.moveTo(mx, GROUND_Y); ctx.lineTo(mx + 70, GROUND_Y - 70); ctx.lineTo(mx + 160, GROUND_Y); ctx.fill();
        }
        
        // Clouds
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        for (let i = 0; i < 8; i++) {
            const cx = ((i * 280 + 50) - cameraX * 0.12) % (W + 500) - 180;
            const cy = 30 + (i % 3) * 60;
            ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.arc(cx + 28, cy - 14, 18, 0, Math.PI * 2);
            ctx.arc(cx + 55, cy, 24, 0, Math.PI * 2); ctx.fill();
        }
        
        // Ground
        ctx.fillStyle = '#5D4037'; ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
        ctx.fillStyle = '#4CAF50'; ctx.fillRect(0, GROUND_Y, W, 8);
        ctx.fillStyle = '#388E3C'; ctx.fillRect(0, GROUND_Y - 3, W, 4);
        
        // Platforms
        platforms.forEach(p => {
            const px = p.x - cameraX;
            if (px < -p.w || px > W) return;
            ctx.fillStyle = '#6D4C41'; ctx.fillRect(px, p.y, p.w, p.h);
            ctx.fillStyle = '#4CAF50'; ctx.fillRect(px, p.y - 6, p.w, 8);
            ctx.strokeStyle = '#3E2723'; ctx.lineWidth = 1.5; ctx.strokeRect(px, p.y, p.w, p.h);
        });
        
        // Mystery Boxes
        mysteryBoxes.forEach(box => {
            if (box.collected) return;
            const bx = box.x - cameraX;
            if (bx < -40 || bx > W) return;
            const by = box.y - box.h;
            ctx.fillStyle = '#F9A825'; ctx.fillRect(bx, by, box.w, box.h);
            ctx.fillStyle = '#fff'; ctx.font = 'bold 18px Arial'; ctx.fillText('?', bx + 7, by + 23);
            ctx.strokeStyle = '#BF360C'; ctx.lineWidth = 2; ctx.strokeRect(bx, by, box.w, box.h);
        });
        
        // Coins
        coinItems.forEach(coin => {
            if (coin.collected) return;
            const cx = coin.x - cameraX;
            if (cx < -20 || cx > W) return;
            const cy = coin.y + Math.sin(now / 320 + coin.x * 0.01) * 6;
            ctx.fillStyle = '#FFD700'; ctx.beginPath(); ctx.arc(cx, cy, coin.r, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#FFAB00'; ctx.beginPath(); ctx.arc(cx, cy, coin.r - 3, 0, Math.PI * 2); ctx.fill();
        });
        
        // Enemies
        enemies.forEach(en => {
            if (!en.alive && !en.stomped) return;
            const ex = en.x - cameraX;
            if (ex < -70 || ex > W + 70) return;
            const ey = GROUND_Y - en.h;
            
            if (en.type === 'goomba') {
                ctx.fillStyle = en.stomped ? '#6D4C41' : '#D84315';
                ctx.beginPath(); ctx.ellipse(ex + en.w/2, ey + en.h/2, en.w/2 - 2, en.h/2 - 2, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + 10, ey + 7, 5, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(ex + en.w - 10, ey + 7, 5, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(ex + 10, ey + 7, 2.5, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(ex + en.w - 10, ey + 7, 2.5, 0, Math.PI * 2); ctx.fill();
            } else if (en.type === 'koopa') {
                ctx.fillStyle = en.stomped ? '#757575' : '#43A047';
                ctx.fillRect(ex, en.stomped ? ey + en.h - 8 : ey, en.w, en.stomped ? 8 : en.h - 10);
                if (!en.stomped) {
                    ctx.fillStyle = '#FFF9C4'; ctx.beginPath(); ctx.arc(ex + en.w/2, ey - 3, 10, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(ex + en.w/2 - 4, ey - 5, 2, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(ex + en.w/2 + 4, ey - 5, 2, 0, Math.PI * 2); ctx.fill();
                }
            } else if (en.type === 'boss') {
                ctx.fillStyle = '#C62828'; ctx.beginPath(); ctx.ellipse(ex + en.w/2, ey + en.h/2, en.w/2, en.h/2 - 2, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + 14, ey + 18, 7, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(ex + en.w - 14, ey + 18, 7, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(ex + 14, ey + 19, 3, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(ex + en.w - 14, ey + 19, 3, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#E53935'; ctx.fillRect(ex, ey - 22, en.w, 8);
                ctx.fillStyle = '#00E676'; ctx.fillRect(ex, ey - 22, en.w * (en.hp / en.maxHp), 8);
            }
        });
        
        // Player
        drawPlayer();
        
        // Flag
        const fx = flagX - cameraX;
        if (fx > -70 && fx < W + 70) {
            ctx.fillStyle = '#9E9E9E'; ctx.fillRect(fx + 2, GROUND_Y - 140, 6, 140);
            ctx.fillStyle = '#FFC107'; ctx.beginPath(); ctx.arc(fx + 5, GROUND_Y - 140, 8, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#4CAF50'; ctx.beginPath();
            ctx.moveTo(fx + 8, GROUND_Y - 137); ctx.lineTo(fx + 40, GROUND_Y - 118); ctx.lineTo(fx + 8, GROUND_Y - 99); ctx.fill();
        }
        
        // Particles
        particles.forEach(p => {
            const ppx = p.x - cameraX;
            if (ppx < -10 || ppx > W + 10) return;
            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.min(1, p.life / 15);
            ctx.fillRect(ppx, p.y, p.size, p.size);
        });
        ctx.globalAlpha = 1;
        
        // Lives
        ctx.font = 'bold 14px Arial'; ctx.fillStyle = '#fff';
        for (let i = 0; i < playerLives; i++) ctx.fillText('❤️', W - 70 + i * 22, 22);
    }
    
    // ==================== GAME LOOP ====================
    function gameLoop() {
        checkOrientation();
        update();
        render();
        requestAnimationFrame(gameLoop);
    }
    
    // ==================== KEYBOARD INPUT ====================
    document.addEventListener('keydown', e => {
        globalKeys[e.key] = true;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
            e.preventDefault();
        }
    });
    document.addEventListener('keyup', e => { globalKeys[e.key] = false; });
    
    // ==================== START ====================
    resizeCanvas();
    lockLandscape();
    gameLoop();
    
    console.log('🍄 SUPER SOLO RUN - Ready!');
})();
