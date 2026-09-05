import path from 'path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Serve e emite o `.wasm` do `web-ifc` num caminho FIXO (`/wasm/web-ifc.wasm`).
 *
 * ─── NEM COMMITADO, NEM POR CDN ─────────────────────────────────────────────
 *
 * Commitar o binário pina a versão à mão, e ele envelhece calado no primeiro
 * `npm update` — passando a divergir do JS que o carrega. CDN é o erro clássico
 * de mismatch que o README do `bim-spike/` já documenta. Copiando do
 * `node_modules` no build, a versão bate SEMPRE com a instalada.
 *
 * Caminho fixo, e não `?url` com hash, porque `IfcAPI.SetWasmPath` recebe um
 * DIRETÓRIO e concatena o nome do arquivo — um nome com hash quebraria a
 * concatenação.
 */
function webIfcWasm() {
  const origem = path.resolve(process.cwd(), 'node_modules/web-ifc/web-ifc.wasm');
  return {
    name: 'opura-web-ifc-wasm',
    configureServer(server: { middlewares: { use: (rota: string, fn: (req: unknown, res: { setHeader: (k: string, v: string) => void; end: (b?: Buffer) => void }) => void) => void } }) {
      server.middlewares.use('/wasm/web-ifc.wasm', (_req, res) => {
        res.setHeader('Content-Type', 'application/wasm');
        res.end(fs.readFileSync(origem));
      });
    },
    generateBundle(this: { emitFile: (a: { type: 'asset'; fileName: string; source: Buffer }) => void }) {
      this.emitFile({ type: 'asset', fileName: 'wasm/web-ifc.wasm', source: fs.readFileSync(origem) });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  // Carimbo do commit dentro do bundle.
  //
  // Existe por um motivo específico: o Vercel COMPILA NA INFRAESTRUTURA DELE, com
  // as dependências dele. O `dist/` gerado aqui e o que o site serve têm o mesmo
  // tamanho e conteúdo equivalente, mas hashes de arquivo diferentes — logo,
  // comparar o nome do bundle local com o do site nunca prova nada. Foi assim que
  // a primeira versão de `scripts/publicar-producao.sh` acusou falha numa
  // publicação que estava correta.
  //
  // Com o commit dentro do bundle, a prova vira direta: baixa-se o que o site
  // entrega e procura-se o SHA. `BUILD_COMMIT` chega pelo `--build-env` do script;
  // no build local cai no git; sem nenhum dos dois, fica vazio e a checagem
  // simplesmente não roda (nunca dá falso positivo).
  const commit =
    process.env.BUILD_COMMIT ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    (() => {
      // `import` no topo, não `require`: este arquivo é ESM, e `require` aqui
      // lança — o catch engolia o erro e devolvia vazio, deixando o carimbo fora
      // do bundle sem ninguém perceber.
      try {
        return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
          .toString()
          .trim();
      } catch {
        return '';
      }
    })();

  return {
    define: {
      __BUILD_COMMIT__: JSON.stringify(commit),
    },
    server: {
      port: 3100,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      tailwindcss(),
      webIfcWasm(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icons/*.png', 'icons/*.svg'],
        manifest: {
          name: 'Opura — Controle Operacional',
          short_name: 'Opura',
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
          // SW novo assume o controle imediatamente após deploy (evita tela branca
          // de stale-hash no primeiro acesso, pois o SW antigo deixa de servir HTML velho).
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          // Cache static assets + index.html (necessário para navigateFallback funcionar offline).
          // JS bundles excluídos do precache para evitar stale-hash white screen
          // (novo deploy muda hashes do JS; HTML precacheado é atualizado a cada build,
          // mantendo as referências aos hashes corretos).
          globPatterns: ['**/*.{css,ico,png,svg,woff2}'],
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024, // 8 MB limit
          // Skip Supabase API calls — too dynamic for precache
          navigateFallback: null,
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
              // REST do Supabase: SEMPRE rede, nunca cache no Service Worker.
              // Respostas são filtradas por sessão/RLS (chave só de URL cacheava
              // dado de um usuário/estado e servia para outro) e o React Query já
              // faz cache/dedup em memória com invalidação controlada. Cachear aqui
              // causava "dado some e volta só com hard refresh": em qualquer engasgo
              // de rede o NetworkFirst servia a lista antiga (ex.: organizações).
              urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/.*/i,
              handler: 'NetworkOnly',
            },
          ],
        },
        devOptions: {
          enabled: false, // disable SW in dev to avoid auth/API conflicts
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    test: {
      globals: true,
      environment: 'node',
      include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
      // Teste que precisa de DOM declara `// @vitest-environment jsdom` no
      // topo do próprio arquivo. Aqui havia um `environmentMatchGlobs` apontando
      // `__tests__/components/**` para jsdom — opção REMOVIDA no Vitest 4, que é
      // a versão em uso: ela não fazia nada e descrevia um mecanismo que não
      // existe mais. Config que mente custa mais caro que config ausente.
      setupFiles: ['__tests__/components/setup.ts'],
    }
  };
});
