// ====================================
// SERVICE WORKER - SOLO M GAME SHOP
// All Systems Included
// ====================================

// ✅ OneSignal Push Notification SDK
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

const CACHE_VERSION = 'v5';
const CACHE_NAME = `solom-cache-${CACHE_VERSION}`;

// ==================== FILES TO CACHE ====================
const STATIC_FILES = [
    '/',
    '/index.html',
    '/dashboard.html',
    '/game.html',
    '/admin.html',
    '/exchange.html',
    '/buycode.html',
    '/topup.html',
    '/data.html',
    '/history.html',
    '/password.html',
    '/recovery.html',
    '/contact.html',
    '/aboutredeem.html',
    '/terms.html',
    '/privacy.html',
    '/offline.html',
    '/premium.html'
];

const CACHE_EXTENSIONS = [
    '.html', '.css', '.js', '.json', '.png', '.jpg', '.jpeg',
    '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'
];

// ==================== INSTALL EVENT ====================
self.addEventListener('install', (event) => {
    console.log('[SW] 🚀 Installing Service Worker...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] 📦 Caching static files...');
                return Promise.allSettled(
                    STATIC_FILES.map(url =>
                        cache.add(url).catch(err => {
                            console.warn(`[SW] ⚠️ Failed to cache: ${url}`, err.message);
                        })
                    )
                );
            })
            .then(() => {
                console.log('[SW] ✅ Static files cached');
                // ✅ Force activation (don't wait for old tabs to close)
                return self.skipWaiting();
            })
    );
});

// ==================== ACTIVATE EVENT ====================
self.addEventListener('activate', (event) => {
    console.log('[SW] 🔄 Activating Service Worker...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => {
                            // Delete old caches (different version)
                            return name.startsWith('solom-cache-') && name !== CACHE_NAME;
                        })
                        .map((name) => {
                            console.log('[SW] 🗑️ Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] ✅ Activation complete');
                // ✅ Take control of all clients immediately
                return self.clients.claim();
            })
    );
});

// ==================== FETCH EVENT (MAIN LOGIC) ====================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // ❌ Skip non-GET requests
    if (request.method !== 'GET') return;
    
    // ❌ Skip chrome-extension and other non-http requests
    if (!url.protocol.startsWith('http')) return;
    
    // ❌ Skip API calls (let them go to network)
    if (url.pathname.startsWith('/api/')) {
        return; // Network only for API
    }
    
    // ❌ Skip OneSignal requests
    if (url.hostname.includes('onesignal.com')) return;
    
    // ✅ Handle navigation requests (HTML pages)
    if (request.mode === 'navigate') {
        event.respondWith(
            networkFirstWithOfflineFallback(request)
        );
        return;
    }
    
    // ✅ Handle static assets (CSS, JS, Images, Fonts)
    if (CACHE_EXTENSIONS.some(ext => url.pathname.endsWith(ext))) {
        event.respondWith(
            cacheFirstWithNetworkUpdate(request)
        );
        return;
    }
    
    // ✅ Default: Cache First
    event.respondWith(
        cacheFirstWithNetworkUpdate(request)
    );
});

// ==================== CACHE STRATEGIES ====================

// ✅ Cache First, Network Update (for static assets)
async function cacheFirstWithNetworkUpdate(request) {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
        // Return cached version immediately
        // Update cache in background
        fetch(request).then(response => {
            if (response && response.status === 200) {
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(request, response.clone());
                });
            }
        }).catch(() => {});
        
        return cachedResponse;
    }
    
    // Not in cache, try network
    try {
        const networkResponse = await fetch(request);
        
        // Cache the response for next time
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        // Network failed, return offline page for HTML requests
        if (request.headers.get('Accept')?.includes('text/html')) {
            const cache = await caches.open(CACHE_NAME);
            return cache.match('/offline.html');
        }
        
        // For other assets, return error
        return new Response('Network error', { status: 408 });
    }
}

// ✅ Network First, Offline Fallback (for HTML pages)
async function networkFirstWithOfflineFallback(request) {
    try {
        // Try network first
        const networkResponse = await fetch(request);
        
        // Cache the response
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        // Network failed, try cache
        const cachedResponse = await caches.match(request);
        
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Not in cache either, return offline page
        const cache = await caches.open(CACHE_NAME);
        const offlinePage = await cache.match('/offline.html');
        
        if (offlinePage) {
            return offlinePage;
        }
        
        // Fallback message
        return new Response(
            `<html><body style="background:#0c0e27;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;text-align:center"><div><h2>📴 You are offline</h2><p>Please check your internet connection</p><button onclick="location.reload()" style="background:#f39c12;color:#000;border:none;padding:10px 20px;border-radius:20px;font-weight:bold;cursor:pointer;margin-top:10px">🔄 Retry</button></div></body></html>`,
            {
                status: 200,
                headers: { 'Content-Type': 'text/html' }
            }
        );
    }
}

// ==================== PUSH NOTIFICATION ====================
self.addEventListener('push', (event) => {
    console.log('[SW] 📬 Push notification received');
    
    let data = {};
    
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data = {
                title: 'SOLO M Game Shop',
                body: event.data.text(),
                icon: '/icons/icon-192.png',
                badge: '/icons/icon-72.png'
            };
        }
    }
    
    const options = {
        body: data.body || 'You have a new notification',
        icon: data.icon || '/icons/icon-192.png',
        badge: data.badge || '/icons/icon-72.png',
        vibrate: [200, 100, 200],
        data: {
            url: data.url || '/dashboard',
            dateOfArrival: Date.now()
        },
        actions: [
            {
                action: 'open',
                title: '🔔 Open'
            },
            {
                action: 'close',
                title: '✕ Close'
            }
        ],
        requireInteraction: true,
        tag: 'solom-notification'
    };
    
    event.waitUntil(
        self.registration.showNotification(
            data.title || 'SOLO M Game Shop',
            options
        )
    );
});

// ==================== NOTIFICATION CLICK ====================
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] 👆 Notification clicked');
    
    event.notification.close();
    
    const urlToOpen = event.notification.data?.url || '/dashboard';
    
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        })
        .then((clientList) => {
            // Check if there's already an open tab
            for (const client of clientList) {
                if (client.url.includes(urlToOpen) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Open new window
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

// ==================== MESSAGE EVENT (from main page) ====================
self.addEventListener('message', (event) => {
    console.log('[SW] 📨 Message received:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CHECK_ONLINE') {
        // Send online status back to client
        event.ports[0].postMessage({
            online: self.navigator ? self.navigator.onLine : true
        });
    }
});

// ==================== SYNC EVENT (Background Sync) ====================
self.addEventListener('sync', (event) => {
    console.log('[SW] 🔄 Background sync:', event.tag);
    
    if (event.tag === 'sync-spins') {
        event.waitUntil(
            // Process any pending spin data
            processPendingSpins()
        );
    }
    
    if (event.tag === 'sync-orders') {
        event.waitUntil(
            // Process any pending orders
            processPendingOrders()
        );
    }
});

// ✅ Process pending spins when back online
async function processPendingSpins() {
    try {
        const pendingSpins = await getPendingData('pendingSpins');
        if (!pendingSpins || pendingSpins.length === 0) return;
        
        console.log('[SW] Processing', pendingSpins.length, 'pending spins');
        
        for (const spin of pendingSpins) {
            await fetch('/api/spin/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(spin)
            });
        }
        
        // Clear processed data
        await clearPendingData('pendingSpins');
        console.log('[SW] ✅ All pending spins processed');
    } catch (error) {
        console.error('[SW] Error processing spins:', error);
    }
}

// ✅ Process pending orders when back online
async function processPendingOrders() {
    try {
        const pendingOrders = await getPendingData('pendingOrders');
        if (!pendingOrders || pendingOrders.length === 0) return;
        
        console.log('[SW] Processing', pendingOrders.length, 'pending orders');
        
        for (const order of pendingOrders) {
            await fetch('/api/submit_order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(order)
            });
        }
        
        await clearPendingData('pendingOrders');
        console.log('[SW] ✅ All pending orders processed');
    } catch (error) {
        console.error('[SW] Error processing orders:', error);
    }
}

// ==================== INDEXEDDB HELPERS ====================
function getPendingData(storeName) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('SolomOfflineDB', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(storeName)) {
                resolve([]);
                return;
            }
            
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const getAll = store.getAll();
            
            getAll.onsuccess = () => resolve(getAll.result);
            getAll.onerror = () => reject(getAll.error);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('pendingSpins')) {
                db.createObjectStore('pendingSpins', { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('pendingOrders')) {
                db.createObjectStore('pendingOrders', { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

function clearPendingData(storeName) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('SolomOfflineDB', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const clearRequest = store.clear();
            
            clearRequest.onsuccess = () => resolve();
            clearRequest.onerror = () => reject(clearRequest.error);
        };
    });
}

// ==================== ONLINE/OFFLINE DETECTION ====================
self.addEventListener('online', () => {
    console.log('[SW] 🌐 Back online!');
    
    // Notify all clients
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({
                type: 'ONLINE_STATUS',
                online: true
            });
        });
    });
    
    // Trigger background sync
    self.registration.sync.register('sync-spins').catch(() => {});
    self.registration.sync.register('sync-orders').catch(() => {});
});

self.addEventListener('offline', () => {
    console.log('[SW] 📴 Went offline');
    
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({
                type: 'ONLINE_STATUS',
                online: false
            });
        });
    });
});

console.log('[SW] ✅ Service Worker Ready!');
