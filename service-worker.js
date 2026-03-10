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
const CACHE_NAME = 'ic-bell-system-v1.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap',
  'https://res.cloudinary.com/dy9ys5okf/image/upload/v1773033808/app_icon_ftwi7s_gwhdvd.png'
];

// Install event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching files');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Service Worker: All files cached');
        return self.skipWaiting();
      })
  );
});

// Activate event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Activated');
      return self.clients.claim();
    })
  );
});

// Fetch event
self.addEventListener('fetch', event => {
  // Skip non-GET requests and external URLs
  if (event.request.method !== 'GET' || 
      !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version if available
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(response => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          // Cache the new response
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });

          return response;
        }).catch(() => {
          // If offline and not in cache, show offline page
          if (event.request.mode === 'navigate') {
            return caches.match('/offline.html');
          }
        });
      })
  );
});

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
