import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    // No chequear updates al volver de la cámara nativa: autoUpdate +
    // visibilitychange puede recargar la PWA a mitad del flujo de fotos.
    window.setInterval(() => {
      void registration.update().catch(() => {});
    }, 10 * 60 * 1000);
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
