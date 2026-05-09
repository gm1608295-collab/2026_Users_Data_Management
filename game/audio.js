
// ==================== AUDIO SYSTEM ====================
class AudioSystem {
    constructor() {
        this.bgm = document.createElement('audio');
        this.bgm.loop = true;
        this.bgm.volume = 0.4;
        this.sounds = {};
        this.loaded = false;
    }
    
    async loadBGM(url) {
        try {
            const res = await fetch('/api/bg_music');
            const data = await res.json();
            if(data.playlist && data.playlist.length > 0) {
                this.bgm.src = data.playlist[0];
                this.bgm.load();
            }
        } catch(e) {}
    }
    
    playBGM() {
        this.bgm.play().catch(()=>{});
    }
    
    pauseBGM() {
        this.bgm.pause();
    }
    
    playSound(name, volume = 1) {
        try {
            if(this.sounds[name]) {
                const s = this.sounds[name].cloneNode();
                s.volume = volume;
                s.play().catch(()=>{});
            }
        } catch(e) {}
    }
    
    registerSound(name, url) {
        const audio = new Audio(url);
        audio.volume = 0.5;
        this.sounds[name] = audio;
    }
}

const Audio = new AudioSystem();

// Register game sounds (using generated oscillator tones as placeholders)
function createTone(freq, duration, type = 'sine') {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = 0.1;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
}

// Sound effects using simple tones
const SFX = {
    jump: () => createTone(600, 0.15),
    coin: () => createTone(1200, 0.1),
    stomp: () => createTone(200, 0.2, 'square'),
    powerup: () => createTone(800, 0.3),
    die: () => createTone(150, 0.5, 'sawtooth'),
    win: () => createTone(1000, 0.5),
    bossHit: () => createTone(100, 0.3, 'square')
};
