/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBpwQyqqWnVQA8rD7gy_Jxrsqs5xNzTVpI',
  authDomain: 'gruasbacar.firebaseapp.com',
  projectId: 'gruasbacar',
  storageBucket: 'gruasbacar.firebasestorage.app',
  messagingSenderId: '231607744664',
  appId: '1:231607744664:web:99e7212a059c01f768f8ed',
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
