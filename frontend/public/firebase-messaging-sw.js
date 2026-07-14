/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDI92aeYmGHJ8HPVkNfgdW0_z3PFwMINds',
  authDomain: 'gruas-bacar.firebaseapp.com',
  projectId: 'gruas-bacar',
  storageBucket: 'gruas-bacar.firebasestorage.app',
  messagingSenderId: '956942498498',
  appId: '1:956942498498:web:b58e92fe0a2c9b1c0d7e7f',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification ?? {};
  if (!title) return;
  self.registration.showNotification(title, {
    body: body ?? '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    data: payload.data,
  });
});
