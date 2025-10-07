import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import tailwindcss from '@tailwindcss/postcss';

export default defineConfig({
  plugins: [react()],
  root: 'public/frontend',
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 3001,
    host: true,
    watch: {
      ignored: ['**/data/**', '**/logs/**', '**/node_modules/**'],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        ws: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, res) => {
            console.error('Proxy error:', err);
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
            }
            res.end('Proxy error: ' + err.message);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Enable SSE for all SSE endpoints
            if (req.url?.includes('/updates') || req.url?.includes('/scan-status') || req.url?.includes('/status')) {
              proxyReq.setHeader('Connection', 'keep-alive');
              proxyReq.setHeader('Cache-Control', 'no-cache');
              proxyReq.setHeader('Accept', 'text/event-stream');
            }
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            // Disable buffering for SSE endpoints
            if (req.url?.includes('/updates') || req.url?.includes('/scan-status') || req.url?.includes('/status')) {
              proxyRes.headers['x-accel-buffering'] = 'no';
              // Ensure SSE headers are preserved
              if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
                proxyRes.headers['cache-control'] = 'no-cache';
                proxyRes.headers['connection'] = 'keep-alive';
              }
            }
          });
        },
      },
      '/ws': {
        target: 'ws://127.0.0.1:3000',
        ws: true,
        changeOrigin: true,
      },
      '/webhooks': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'public/frontend/src'),
    },
  },
});