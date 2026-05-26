import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3100,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icons/*.png', 'icons/*.svg'],
        manifest: {
          name: 'OrçaCloud — Controle Operacional',
          short_name: 'OrçaCloud',
          description: 'Gestão de obras e controle operacional de construção civil',
          theme_color: '#2563eb',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait-primary',
          scope: '/',
          start_url: '/?utm_source=pwa',
          lang: 'pt-BR',
          categories: ['business', 'productivity'],
          icons: [
            { src: 'icons/icon-72.png',  sizes: '72x72',   type: 'image/png' },
            { src: 'icons/icon-96.png',  sizes: '96x96',   type: 'image/png' },
            { src: 'icons/icon-128.png', sizes: '128x128', type: 'image/png' },
            { src: 'icons/icon-144.png', sizes: '144x144', type: 'image/png' },
            { src: 'icons/icon-152.png', sizes: '152x152', type: 'image/png' },
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-384.png', sizes: '384x384', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
          screenshots: [
            {
              src: 'icons/screenshot-mobile.png',
              sizes: '390x844',
              type: 'image/png',
              form_factor: 'narrow',
              label: 'Controle Operacional — Lista de OEs',
            },
          ],
          shortcuts: [
            {
              name: 'Controle Operacional',
              url: '/?view=operacional',
              icons: [{ src: 'icons/icon-96.png', sizes: '96x96' }],
            },
          ],
        },
        workbox: {
          // Cache static assets only — JS bundles excluded from precache to avoid stale-hash white screen
          // (new deploy changes JS hashes; cached HTML with old hashes → 404 → white screen)
          globPatterns: ['**/*.{css,ico,png,svg,woff2}'],
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024, // 8 MB limit
          // Skip Supabase API calls — too dynamic for precache
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api/, /^\/rest/, /^\/realtime/],
          runtimeCaching: [
            {
              // Navigation: always fetch fresh HTML from network (prevents stale JS hash mismatch after deploy)
              urlPattern: ({ request }: { request: Request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'navigation-cache',
                networkTimeoutSeconds: 4,
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Cache Google Fonts
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Cache Supabase storage (images/docs uploaded as evidence)
              urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'supabase-storage-cache',
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Stale-while-revalidate for Supabase REST API (read)
              urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'supabase-api-cache',
                expiration: { maxEntries: 100, maxAgeSeconds: 60 * 5 },
                networkTimeoutSeconds: 3,
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: {
          enabled: false, // disable SW in dev to avoid auth/API conflicts
        },
      }),
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    test: {
      globals: true,
      environment: 'node',
      include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
      environmentMatchGlobs: [
        ['__tests__/components/**/*.test.tsx', 'jsdom'],
      ],
      setupFiles: ['__tests__/components/setup.ts'],
    }
  };
});
