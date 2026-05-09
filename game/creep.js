
// ==================== ENEMY CLASSES ====================
class Goomba {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.w = 34; this.h = 32;
        this.vx = (Math.random() > 0.5 ? 1 : -1) * 1.5;
        this.vy = 0;
        this.alive = true; this.stomped = false; this.stompTimer = 0;
        this.hp = 1; this.type = 'goomba';
    }
    
    update(cameraX, W) {
        if(this.stomped) { this.stompTimer--; if(this.stompTimer <= 0) this.alive = false; return; }
        this.x += this.vx;
        if(this.x < cameraX - 80 || this.x > cameraX + W + 400) this.vx *= -1;
    }
    
    draw(ctx, cameraX, GROUND_Y) {
        if(!this.alive && !this.stomped) return;
        const ex = this.x - cameraX, ey = GROUND_Y - this.h;
        ctx.fillStyle = this.stomped ? '#6D4C41' : '#D84315';
        ctx.beginPath(); ctx.ellipse(ex + this.w/2, ey + this.h/2, this.w/2-2, this.h/2-2, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = this.stomped ? '#4E342E' : '#BF360C';
        ctx.beginPath(); ctx.ellipse(ex + this.w/2, ey + this.h-4, this.w/2-4, 5, 0, 0, Math.PI); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + 10, ey + 7, 5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex + this.w-10, ey + 7, 5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(ex + 10, ey + 7, 2.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex + this.w-10, ey + 7, 2.5, 0, Math.PI*2); ctx.fill();
    }
    
    stomp() { this.hp--; if(this.hp <= 0) { this.stomped = true; this.stompTimer = 15; return true; } return false; }
    getScore() { return 200; }
}

class Koopa {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.w = 34; this.h = 40;
        this.vx = (Math.random() > 0.5 ? 1 : -1) * 1.3;
        this.vy = 0;
        this.alive = true; this.stomped = false; this.stompTimer = 0;
        this.hp = 2; this.type = 'koopa';
    }
    
    update(cameraX, W) {
        if(this.stomped) { this.stompTimer--; if(this.stompTimer <= 0) this.alive = false; return; }
        this.x += this.vx;
        if(this.x < cameraX - 80 || this.x > cameraX + W + 400) this.vx *= -1;
    }
    
    draw(ctx, cameraX, GROUND_Y) {
        if(!this.alive && !this.stomped) return;
        const ex = this.x - cameraX, ey = GROUND_Y - this.h;
        ctx.fillStyle = this.stomped ? '#757575' : '#43A047';
        ctx.fillRect(ex, this.stomped ? ey + this.h - 8 : ey, this.w, this.stomped ? 8 : this.h - 10);
        if(!this.stomped) {
            ctx.fillStyle = '#FFF9C4'; ctx.beginPath(); ctx.arc(ex + this.w/2, ey - 3, 10, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(ex + this.w/2-4, ey-5, 2, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(ex + this.w/2+4, ey-5, 2, 0, Math.PI*2); ctx.fill();
        }
    }
    
    stomp() { this.hp--; if(this.hp <= 0) { this.stomped = true; this.stompTimer = 18; return true; } return false; }
    getScore() { return 500; }
}

class Boss {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.w = 50; this.h = 58;
        this.vx = -2; this.vy = 0;
        this.alive = true; this.stomped = false; this.stompTimer = 0;
        this.hp = 6; this.maxHp = 6; this.type = 'boss';
    }
    
    update(playerX) {
        if(this.stomped) { this.stompTimer--; if(this.stompTimer <= 0) this.alive = false; return; }
        if(playerX < this.x) this.vx = -2.8; else this.vx = 2.8;
        this.x += this.vx;
    }
    
    draw(ctx, cameraX, GROUND_Y) {
        if(!this.alive && !this.stomped) return;
        const ex = this.x - cameraX, ey = GROUND_Y - this.h;
        ctx.fillStyle = '#C62828'; ctx.beginPath(); ctx.ellipse(ex + this.w/2, ey + this.h/2, this.w/2, this.h/2-2, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + 14, ey + 18, 7, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex + this.w-14, ey + 18, 7, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(ex + 14, ey + 19, 3, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex + this.w-14, ey + 19, 3, 0, Math.PI*2); ctx.fill();
        // HP Bar
        ctx.fillStyle = '#E53935'; ctx.fillRect(ex, ey-22, this.w, 8);
        ctx.fillStyle = '#00E676'; ctx.fillRect(ex, ey-22, this.w * (this.hp / this.maxHp), 8);
    }
    
    stomp() { this.hp--; if(this.hp <= 0) { this.stomped = true; this.stompTimer = 20; return true; } return false; }
    getScore() { return 5000; }
}
