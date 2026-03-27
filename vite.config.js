import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/ws': {
        target: 'ws://localhost:4000',
        ws: true,
      },
      '/render': 'http://localhost:4000',
      '/render.html': 'http://localhost:4000',
      '/renderer-assets': 'http://localhost:4000',
      '/template-assets': 'http://localhost:4000',
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
