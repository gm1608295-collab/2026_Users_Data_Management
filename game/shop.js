
// ==================== IN-GAME SHOP ====================
const GameShop = {
    items: [
        { id: 'extra_life', name: '❤️ Extra Life', price: 500, icon: '❤️', action: 'addLife' },
        { id: 'mushroom', name: '🍄 Mushroom', price: 300, icon: '🍄', action: 'powerUp' },
        { id: 'star', name: '⭐ Star', price: 800, icon: '⭐', action: 'invincible' },
        { id: 'time_add', name: '⏱️ +30s Time', price: 200, icon: '⏱️', action: 'addTime' },
    ],
    
    diamonds: 0,
    coins: 0,
    
    init(d, c) {
        this.diamonds = d;
        this.coins = c;
    },
    
    buy(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return false;
        if (this.coins < item.price) return false;
        
        this.coins -= item.price;
        return item;
    },
    
    getItems() {
        return this.items;
    }
};
