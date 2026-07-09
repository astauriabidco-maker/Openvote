/// <reference lib="webworker" />

const CACHE_NAME = 'openvote-v1';
const API_CACHE = 'openvote-api-v1';
const OFFLINE_URL = '/offline.html';

// Ressources à mettre en cache immédiatement
const PRECACHE_URLS = [
    '/',
    '/offline.html',
    '/icon-192.png',
    '/icon-512.png',
    '/manifest.json',
];

// ========================================
// Installation : mise en cache initiale
// ========================================
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Pre-caching resources');
            return cache.addAll(PRECACHE_URLS);
        })
    );
    self.skipWaiting();
});

// ========================================
// Activation : nettoyage des anciens caches
// ========================================
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME && name !== API_CACHE)
                    .map((name) => {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        })
    );
    self.clients.claim();
});

// ========================================
// Fetch : stratégie Network-First pour API, Cache-First pour assets
// ========================================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Ignorer les requêtes non-GET (POST, etc. → passthrough)
    if (request.method !== 'GET') {
        return;
    }

    // API calls → Network-First avec fallback cache
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirstStrategy(request));
        return;
    }

    // Assets statiques → Cache-First
    if (
        url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|woff2?|ttf|geojson)$/) ||
        url.hostname.includes('basemaps.cartocdn.com') ||
        url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com')
    ) {
        event.respondWith(cacheFirstStrategy(request));
        return;
    }

    // Pages HTML → Network-First avec fallback offline
    event.respondWith(
        fetch(request)
            .then((response) => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                return response;
            })
            .catch(() => {
                return caches.match(request).then((cached) => {
                    return cached || caches.match(OFFLINE_URL);
                });
            })
    );
});

// Network-First : essayer le réseau, sinon cache
async function networkFirstStrategy(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(API_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cached = await caches.match(request);
        if (cached) {
            return cached;
        }
        return new Response(
            JSON.stringify({ error: 'Hors ligne', offline: true }),
            { headers: { 'Content-Type': 'application/json' } }
        );
    }
}

// Cache-First : utiliser le cache si disponible
async function cacheFirstStrategy(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        return new Response('', { status: 503 });
    }
}

// ========================================
// Background Sync : synchroniser les signalements hors-ligne
// ========================================
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-reports') {
        event.waitUntil(syncPendingReports());
    }
});

async function syncPendingReports() {
    try {
        // Récupérer les rapports en attente stockés dans IndexedDB
        const db = await openDB();
        const tx = db.transaction('pending-reports', 'readonly');
        const store = tx.objectStore('pending-reports');
        const reports = await getAllFromStore(store);

        for (const report of reports) {
            try {
                const response = await fetch(report.url, {
                    method: 'POST',
                    headers: report.headers,
                    body: report.body,
                });

                if (response.ok) {
                    // Supprimer le rapport synchronisé
                    const delTx = db.transaction('pending-reports', 'readwrite');
                    delTx.objectStore('pending-reports').delete(report.id);

                    // Notifier l'utilisateur
                    self.registration.showNotification('Openvote', {
                        body: `✅ Signalement synchronisé avec succès`,
                        icon: '/icon-192.png',
                        badge: '/icon-192.png',
                        tag: 'sync-success',
                    });
                }
            } catch {
                console.log('[SW] Sync failed for report, will retry');
            }
        }
    } catch (err) {
        console.error('[SW] Sync error:', err);
    }
}

// ========================================
// Push Notifications
// ========================================
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'Openvote — Alerte';
    const options = {
        body: data.body || 'Nouvelle alerte électorale',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [200, 100, 200],
        tag: data.tag || 'openvote-alert',
        data: { url: data.url || '/' },
        actions: [
            { action: 'open', title: 'Voir' },
            { action: 'dismiss', title: 'Fermer' },
        ],
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.action === 'dismiss') return;

    const url = event.notification.data?.url || '/';
    event.waitUntil(
        self.clients.matchAll({ type: 'window' }).then((clients) => {
            const client = clients.find((c) => c.url.includes(url));
            if (client) return client.focus();
            return self.clients.openWindow(url);
        })
    );
});

// ========================================
// IndexedDB helpers
// ========================================
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('openvote-offline', 1);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('pending-reports')) {
                db.createObjectStore('pending-reports', { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function getAllFromStore(store) {
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
