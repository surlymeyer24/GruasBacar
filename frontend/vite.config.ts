import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const rootDir = path.resolve(__dirname, '..');

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'BACAR — Control de Grúas',
          short_name: 'GrúasBacar',
          description: 'Plataforma de gestión de grúas, servicio vehicular, auditoría fotográfica y control operativo de flota en tiempo real.',
          theme_color: '#161A1D',
          background_color: '#161A1D',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          navigationPreload: false,
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
      alias: {
        '@gruasbacar/shared': path.resolve(__dirname, '../shared/src/index.ts'),
        '@': path.resolve(__dirname, './src'),
        react: path.resolve(rootDir, 'node_modules/react'),
        'react-dom': path.resolve(rootDir, 'node_modules/react-dom'),
      },
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom', 'motion/react', 'jspdf'],
    },
    server: {
      host: '0.0.0.0',
      port: 5174,
      strictPort: true,
      // Vite 6 rechaza hosts desconocidos (túneles, preview embebido).
      allowedHosts: true,
      // HMR desactivable con DISABLE_HMR=true (p. ej. preview de Cursor sin WebSocket).
      hmr:
        process.env.DISABLE_HMR === 'true'
          ? false
          : {
              port: 5174,
            },
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
