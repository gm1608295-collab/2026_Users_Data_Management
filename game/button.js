
// ==================== MOBILE TOUCH CONTROLS ====================
(function() {
    const mobileControls = document.getElementById('mobileControls');
    if (!mobileControls) return;
    
    // Build controls HTML
    mobileControls.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:6px">
            <div style="display:grid;grid-template-columns:50px 50px 50px;grid-template-rows:50px 50px 50px;gap:3px">
                <div style="background:transparent;border:none;pointer-events:none"></div>
                <button id="btnUp" style="grid-column:2;grid-row:1;width:50px;height:50px;border:2px solid rgba(255,255,255,0.4);background:rgba(255,255,255,0.12);color:#fff;border-radius:10px;font-size:20px;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent">▲</button>
                <div style="background:transparent;border:none;pointer-events:none"></div>
                <button id="btnLeft" style="grid-column:1;grid-row:2;width:50px;height:50px;border:2px solid rgba(255,255,255,0.4);background:rgba(255,255,255,0.12);color:#fff;border-radius:10px;font-size:20px;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent">◄</button>
                <div style="background:transparent;border:none;pointer-events:none"></div>
                <button id="btnRight" style="grid-column:3;grid-row:2;width:50px;height:50px;border:2px solid rgba(255,255,255,0.4);background:rgba(255,255,255,0.12);color:#fff;border-radius:10px;font-size:20px;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent">►</button>
            </div>
            <div style="display:flex;gap:8px;flex-direction:column">
                <button id="btnJump" style="width:65px;height:65px;border-radius:50%;border:3px solid #f39c12;background:rgba(243,156,18,0.2);color:#f39c12;font-size:13px;font-weight:bold;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent">⬆<br>JUMP</button>
            </div>
        </div>
    `;
    
    // Setup touch events
    const keyMap = {
        'btnUp': 'ArrowUp',
        'btnLeft': 'ArrowLeft',
        'btnRight': 'ArrowRight',
        'btnJump': ' '
    };
    
    Object.keys(keyMap).forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        const key = keyMap[btnId];
        
        btn.addEventListener('pointerdown', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (window.gameKeys) window.gameKeys[key] = true;
            this.style.background = 'rgba(243,156,18,0.5)';
            this.style.borderColor = '#f39c12';
        });
        
        btn.addEventListener('pointerup', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (window.gameKeys) window.gameKeys[key] = false;
            this.style.background = 'rgba(255,255,255,0.12)';
            this.style.borderColor = 'rgba(255,255,255,0.4)';
        });
        
        btn.addEventListener('pointerleave', function(e) {
            if (window.gameKeys) window.gameKeys[key] = false;
            this.style.background = 'rgba(255,255,255,0.12)';
            this.style.borderColor = 'rgba(255,255,255,0.4)';
        });
        
        btn.addEventListener('pointercancel', function(e) {
            if (window.gameKeys) window.gameKeys[key] = false;
            this.style.background = 'rgba(255,255,255,0.12)';
            this.style.borderColor = 'rgba(255,255,255,0.4)';
        });
    });
    
    console.log('✅ Mobile Controls Ready');
})();
