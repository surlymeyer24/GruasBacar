import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

const rootDir = path.resolve(__dirname, '..');

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
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
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      // Vite 6 rechaza hosts desconocidos (túneles, preview embebido).
      allowedHosts: true,
      // HMR desactivable con DISABLE_HMR=true (p. ej. preview de Cursor sin WebSocket).
      hmr:
        process.env.DISABLE_HMR === 'true'
          ? false
          : {
              host: '127.0.0.1',
              port: 5173,
              clientPort: 5173,
            },
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
