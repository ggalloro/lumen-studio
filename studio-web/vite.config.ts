/// <reference types="vitest/config" />
import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

// Backend targets. Each can be overridden from the environment, which is how
// docker-compose or a remote dev box points the dev server at other hosts.
const targets: Record<string, string> = {
  identity: process.env.IDENTITY_URL ?? 'http://localhost:8081',
  assets: process.env.ASSETS_URL ?? 'http://localhost:8082',
  renditions: process.env.RENDITIONS_URL ?? 'http://localhost:8083',
  review: process.env.REVIEW_URL ?? 'http://localhost:8084',
  brand: process.env.BRAND_URL ?? 'http://localhost:8085',
  campaigns: process.env.CAMPAIGNS_URL ?? 'http://localhost:8086',
  rights: process.env.RIGHTS_URL ?? 'http://localhost:8087',
};

function proxyFor(prefix: string, target: string): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    rewrite: (path) => path.slice(prefix.length) || '/',
    configure: (proxy) => {
      // Keep Server-Sent Events streaming: never let anything buffer or
      // compress text/event-stream responses on their way to the browser.
      proxy.on('proxyRes', (proxyRes) => {
        const type = proxyRes.headers['content-type'] ?? '';
        if (type.includes('text/event-stream')) {
          proxyRes.headers['cache-control'] = 'no-cache';
          proxyRes.headers['x-accel-buffering'] = 'no';
        }
      });
    },
  };
}

const proxy = Object.fromEntries(
  Object.entries(targets).map(([name, target]) => {
    const prefix = `/api/${name}`;
    return [prefix, proxyFor(prefix, target)];
  }),
);

export default defineConfig({
  plugins: [react()],
  build: {
    // "assets" would collide with the /assets/:id client route when served by nginx.
    assetsDir: 'static',
    // The component library is large; one vendor chunk is fine for this app.
    chunkSizeWarningLimit: 1500,
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    proxy,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    proxy,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    server: {
      deps: {
        // These packages import their own CSS files, which Node cannot load
        // directly, so let Vite transform them.
        inline: [/@adobe\/react-spectrum/, /@react-spectrum\//, /@spectrum-icons\//],
      },
    },
  },
});
