// ===============================================================
// Automated School Bell System
// Copyright (c) 2026 Aaqib's DevDesk. All Rights Reserved.
// Developer: Aaqib Anwar @ Aaqib's DevDesk

// Project: Automated School Bell System
// Developed for: Institutional Bell Schedule Automation
// Developer Contact: aaqib.devdesk@gmail.com , anwarcareem@gmail.com

// ---------------------------------------------------------------
// INTELLECTUAL PROPERTY NOTICE
// ---------------------------------------------------------------

// This software, including its source code, architecture, design,
// documentation, and associated systems, is the intellectual
// property of Aaqib Anwar @ Aaqib's DevDesk.

// This project was independently designed and developed by
// Aaqib Anwar @ Aaqib's DevDesk and is protected under applicable copyright laws
// and international intellectual property regulations.

// ---------------------------------------------------------------
// RESTRICTIONS
// ---------------------------------------------------------------

// The following actions are STRICTLY PROHIBITED without explicit
// written permission from the developer:

// • Copying or reproducing this software
// • Modifying the source code
// • Redistributing the code
// • Reverse engineering or extracting logic
// • Using the system for commercial or institutional deployment
// • Reusing any part of the codebase in other projects

// Unauthorized use, duplication, or distribution of this software
// or any portion of it may result in legal action.

// ---------------------------------------------------------------
// PERMITTED USE
// ---------------------------------------------------------------

// The deployed system may only be used for operational purposes
// within the institution for which it was developed.

// The source code remains the property of the developer.

// ---------------------------------------------------------------
// DISCLAIMER
// ---------------------------------------------------------------

// This software is provided "as is" without warranties of any kind.
// The developer shall not be held liable for damages arising from
// misuse, modification, or unauthorized deployment.

// ---------------------------------------------------------------
// END OF NOTICE
// ---------------------------------------------------------------

// Service Worker for Bell System PWA
const CACHE_NAME = 'bell-system-v2.0'; // Increment version number
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/offline.html',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap',
  'https://res.cloudinary.com/dy9ys5okf/image/upload/v1773033808/app_icon_ftwi7s_gwhdvd.png'
];

// IMPORTANT: DO NOT cache API endpoints
const apiUrls = [
  '/.netlify/functions/getSchedule',
  '/.netlify/functions/scheduleQueue',
  '/.netlify/functions/ringNow',
  '/.netlify/functions/clearSchedule',
  '/.netlify/functions/clearDay'
];

// Install event
self.addEventListener('install', event => {
  console.log('🔄 Service Worker: Installing new version');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Service Worker: Caching files');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('✅ Service Worker: Installation complete');
        // Force the waiting service worker to become active
        return self.skipWaiting();
      })
  );
});

// Activate event - Clean up old caches
self.addEventListener('activate', event => {
  console.log('🚀 Service Worker: Activating new version');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('🗑️ Service Worker: Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      console.log('✅ Service Worker: Activated and ready');
      // Take control of all clients immediately
      return self.clients.claim();
    })
  );
});

// Fetch event
self.addEventListener('fetch', event => {
  const url = event.request.url;
  
  // Network-first for API calls (always get fresh data)
  if (apiUrls.some(apiUrl => url.includes(apiUrl))) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Return fresh data from network
          return response;
        })
        .catch(error => {
          console.log('⚠️ API fetch failed:', error);
          // For API calls, return error but don't use cache
          return new Response(JSON.stringify({ error: 'Network error' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }
  
  // For HTML files, use network-first with cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Clone the response
          const responseToCache = response.clone();
          
          // Update cache with new version
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
          
          return response;
        })
        .catch(() => {
          // If network fails, return cached version or offline page
          return caches.match(event.request)
            .then(cachedResponse => {
              if (cachedResponse) {
                return cachedResponse;
              }
              return caches.match('/offline.html');
            });
        })
    );
    return;
  }
  
  // For static assets (CSS, JS, fonts), use cache-first with network update
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Return cached version immediately
        const fetchPromise = fetch(event.request)
          .then(networkResponse => {
            // Update cache with new version
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, networkResponse.clone());
            });
            return networkResponse;
          })
          .catch(error => {
            console.log('⚠️ Network fetch failed for:', url);
          });
        
        // Return cached version, but update in background
        return cachedResponse || fetchPromise;
      })
  );
});

// Handle messages from the page
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  
  // Force refresh all clients when new version is installed
  if (event.data === 'refreshClients') {
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.navigate(client.url);
      });
    });
  }
});

// Background sync for offline operations
self.addEventListener('sync', event => {
  if (event.tag === 'sync-schedule') {
    event.waitUntil(syncSchedule());
  }
});

async function syncSchedule() {
  // Implement background sync logic if needed
  console.log('🔄 Background sync triggered');
}

// Handle push notifications
self.addEventListener('push', event => {
  const options = {
    body: event.data?.text() || 'Bell System Notification',
    icon: 'https://res.cloudinary.com/dy9ys5okf/image/upload/v1773033808/app_icon_ftwi7s_gwhdvd.png',
    badge: 'https://res.cloudinary.com/dy9ys5okf/image/upload/v1773033808/app_icon_ftwi7s_gwhdvd.png',
    vibrate: [200, 100, 200],
    tag: 'bell-notification',
    renotify: true,
    actions: [
      {
        action: 'open',
        title: 'Open App'
      },
      {
        action: 'close',
        title: 'Close'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Bell System', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }

});

