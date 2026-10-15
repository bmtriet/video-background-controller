import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
export default defineConfig({
  root: path.resolve('frontend'), plugins: [react(), tailwindcss()],
  build: { outDir: '../dist/frontend', emptyOutDir: true },
  server: { host: '127.0.0.1', port: 5173, proxy: {
    '/api': 'http://127.0.0.1:3000', '/media': 'http://127.0.0.1:3000',
    '/content': 'http://127.0.0.1:3000',
    '/socket.io': { target: 'http://127.0.0.1:3000', ws: true }
  }}
});
