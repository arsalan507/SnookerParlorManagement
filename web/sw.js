const CACHE_NAME = 'snooker-parlor-v2.0.0';
const STATIC_CACHE = 'snooker-static-v2.0.0';
const API_CACHE = 'snooker-api-v2.0.0';

// Files to cache for offline functionality
const STATIC_FILES = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/manifest.webmanifest'
];

// API endpoints to cache
const API_ENDPOINTS = [
  '/api/tables',
  '/api/summary/today',
  '/api/sessions'
];

// Install event - cache static files
self.addEventListener('install', event => {
  console.log('🔧 Service Worker installing...');
  
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache => {
        console.log('📦 Caching static files');
        return cache.addAll(STATIC_FILES);
      }),
      caches.open(API_CACHE).then(cache => {
        console.log('📦 Preparing API cache');
        return Promise.resolve();
      })
    ]).then(() => {
      console.log('✅ Service Worker installed');
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('🔄 Service Worker activating...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== STATIC_CACHE && cacheName !== API_CACHE) {
            console.log('🗑 Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Service Worker activated');
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests and chrome-extension URLs
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') {
    return;
  }
  
  // Handle static files
  if (STATIC_FILES.some(file => url.pathname === file || url.pathname.endsWith(file))) {
    event.respondWith(
      caches.match(request).then(response => {
        if (response) {
          return response;
        }
        
        return fetch(request).then(fetchResponse => {
          // Cache the fetched file
          const responseClone = fetchResponse.clone();
          caches.open(STATIC_CACHE).then(cache => {
            cache.put(request, responseClone);
          });
          return fetchResponse;
        });
      }).catch(() => {
        // Return offline page if available
        return caches.match('/index.html');
      })
    );
    return;
  }
  
  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      handleApiRequest(request)
    );
    return;
  }
  
  // Default: try network first, fall back to cache
  event.respondWith(
    fetch(request).catch(() => {
      return caches.match(request);
    })
  );
});

async function handleApiRequest(request) {
  const url = new URL(request.url);
  
  // For read-only API endpoints, use cache-first strategy
  const isReadOnlyEndpoint = API_ENDPOINTS.some(endpoint => 
    url.pathname.includes(endpoint)
  );
  
  if (isReadOnlyEndpoint && request.method === 'GET') {
    try {
      // Try network first
      const networkResponse = await fetch(request);
      
      if (networkResponse.ok) {
        // Cache successful response
        const cache = await caches.open(API_CACHE);
        cache.put(request, networkResponse.clone());
        return networkResponse;
      }
      
      throw new Error('Network response not ok');
      
    } catch (error) {
      // Fall back to cache
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        console.log('📦 Serving from cache:', url.pathname);
        return cachedResponse;
      }
      
      // Return offline indicator
      return new Response(
        JSON.stringify({ 
          error: 'Offline', 
          message: 'No cached data available',
          offline: true 
        }), 
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }
  
  // For write operations, always try network
  try {
    const response = await fetch(request);
    return response;
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: 'Offline', 
        message: 'Cannot perform this action while offline' 
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Background sync for offline actions (if supported)
if ('sync' in self.registration) {
  self.addEventListener('sync', event => {
    if (event.tag === 'background-sync') {
      console.log('🔄 Background sync triggered');
      event.waitUntil(handleBackgroundSync());
    }
  });
}

async function handleBackgroundSync() {
  // Handle queued offline actions
  try {
    const cache = await caches.open('offline-actions');
    const requests = await cache.keys();
    
    for (const request of requests) {
      try {
        await fetch(request);
        await cache.delete(request);
        console.log('✅ Synced offline action:', request.url);
      } catch (error) {
        console.log('❌ Failed to sync action:', request.url);
      }
    }
  } catch (error) {
    console.error('❌ Background sync failed:', error);
  }
}

// Push notification handling (for future features)
self.addEventListener('push', event => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: data.data,
    actions: data.actions
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow('/')
  );
});