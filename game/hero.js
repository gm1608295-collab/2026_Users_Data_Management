
// ==================== HERO CLASS ====================
class Hero {
    constructor(x, y, w, h) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.vx = 0;
        this.vy = 0;
        this.speed = 5.5;
        this.jumpForce = -11.5;
        this.doubleJump = true;
        this.canDoubleJump = false;
        this.onGround = false;
        this.isBig = false;
        this.invincible = false;
        this.invincibleTimer = 0;
        this.blinkTimer = 0;
        this.facing = 1;
        this.color = '#e74c3c';
    }
    
    reset() {
        this.vx = 0;
        this.vy = 0;
        this.onGround = false;
        this.doubleJump = true;
        this.canDoubleJump = false;
        this.isBig = false;
        this.invincible = false;
        this.invincibleTimer = 0;
        this.blinkTimer = 0;
        this.w = 30;
        this.h = 42;
        this.color = '#e74c3c';
    }
    
    makeBig() {
        if(!this.isBig) {
            this.isBig = true;
            this.h = 52;
            this.y -= 10;
        }
    }
    
    makeInvincible(duration) {
        this.invincible = true;
        this.invincibleTimer = duration;
        this.color = '#ffdd00';
    }
    
    update() {
        if(this.invincible) {
            this.invincibleTimer--;
            this.blinkTimer++;
            if(this.invincibleTimer <= 0) {
                this.invincible = false;
                this.color = '#e74c3c';
            }
        }
    }
    
    draw(ctx, cameraX, GROUND_Y) {
        const px = Math.floor(this.x - cameraX);
        const py = Math.floor(this.y);
        const pw = this.w;
        const ph = this.h;
        const now = Date.now();
        
        if(!this.invincible || Math.floor(this.blinkTimer / 4) % 2 === 0) {
            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.beginPath();
            ctx.ellipse(px + pw/2, GROUND_Y + 3, pw/2, 4, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Legs (blue overalls)
            ctx.fillStyle = '#1565C0';
            ctx.fillRect(px + 5, py + ph - 8, 8, 8);
            ctx.fillRect(px + pw - 13, py + ph - 8, 8, 8);
            
            // Brown shoes
            ctx.fillStyle = '#5D4037';
            ctx.fillRect(px + 3, py + ph - 3, 12, 5);
            ctx.fillRect(px + pw - 15, py + ph - 3, 12, 5);
            
            // Body (red shirt)
            ctx.fillStyle = this.color;
            ctx.fillRect(px + 3, py + 14, pw - 6, ph - 24);
            
            // Overalls strap
            ctx.fillStyle = '#1976D2';
            ctx.fillRect(px + 6, py + 14, 4, ph - 26);
            ctx.fillRect(px + pw - 10, py + 14, 4, ph - 26);
            
            // Belt
            ctx.fillStyle = '#FFC107';
            ctx.fillRect(px + 2, py + ph - 14, pw - 4, 4);
            
            // Arms (skin color)
            ctx.fillStyle = '#FFCC80';
            const armSwing = (this.onGround && Math.abs(this.vx) > 0.5) ? Math.sin(now / 120) * 4 : 0;
            ctx.fillRect(px - 4, py + 16 + armSwing, 8, 12);
            ctx.fillRect(px + pw - 4, py + 16 - armSwing, 8, 12);
            
            // Head (skin)
            ctx.fillStyle = '#FFCC80';
            ctx.beginPath();
            ctx.arc(px + pw/2, py + 8, pw/2 - 1, 0, Math.PI * 2);
            ctx.fill();
            
            // Eyes
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(px + 8, py + 9, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.arc(px + pw - 8, py + 9, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath();
            const ed = this.facing > 0 ? 2.5 : -2.5;
            ctx.arc(px + 8 + ed, py + 10, 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.arc(px + pw - 8 + ed, py + 10, 2.2, 0, Math.PI * 2);
            ctx.fill();
            
            // Mustache
            ctx.fillStyle = '#5D4037';
            ctx.fillRect(px + 5, py + 14, pw - 10, 3);
            
            // Mouth (smile)
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(px + pw/2, py + 19, 4, 0, Math.PI);
            ctx.fill();
            
            // Mario Hat
            ctx.fillStyle = '#C62828';
            ctx.beginPath();
            ctx.ellipse(px + pw/2, py + 3, pw/2 + 2, 8, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.ellipse(px + pw/2, py + 1, pw/2, 6, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Hat S logo
            ctx.fillStyle = '#C62828';
            ctx.beginPath();
            ctx.arc(px + pw/2, py - 1, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 6px Arial';
            ctx.fillText('S', px + pw/2 - 3, py + 2);
        }
    }
}
