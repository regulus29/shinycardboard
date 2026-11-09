/// <reference types="vitest/config" />
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { CARD_ART_CACHE, CARD_ART_HOST, SETTINGS_STORAGE_KEY, THEME_COLORS } from './pwa.config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/** Deploy base path, for example "/cards/" for a subpath host. Always ends with a slash. */
const BASE = (process.env.SC_BASE ?? '/').replace(/\/?$/, '/');
/** Reproducible builds: SC_BUILD_TIME or SOURCE_DATE_EPOCH override the wall clock. */
const BUILD_TIME = process.env.SC_BUILD_TIME
  ?? (process.env.SOURCE_DATE_EPOCH ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString() : new Date().toISOString());

const THEME_COLOR = THEME_COLORS.dark;

/** Fills the %SC_*% placeholders in index.html from pwa.config.ts so nothing is duplicated. */
function htmlConstants(): Plugin {
  const values: Record<string, string> = {
    SC_THEME_DARK: THEME_COLORS.dark,
    SC_THEME_LIGHT: THEME_COLORS.light,
    SC_SETTINGS_KEY: SETTINGS_STORAGE_KEY,
  };
  return {
    name: 'sc-html-constants',
    transformIndexHtml: { order: 'pre', handler: (html) => html.replace(/%(SC_[A-Z_]+)%/g, (match, key: string) => values[key] ?? match) },
  };
}
const NINETY_DAYS_S = 60 * 60 * 24 * 90;
/**
 * The card CDN sends no CORS headers, so art is cached as opaque responses. Browsers pad each
 * opaque entry (several MB of quota), so the cap is deliberately small and quota errors purge.
 */
const MAX_CARD_ART_ENTRIES = 300;

/** Serves the generated dev fixture at /dev-catalog.json during development only (never built). */
function devCatalog(): Plugin {
  const file = new URL('./src/dev/dev-catalog.json', import.meta.url);
  return {
    name: 'sc-dev-catalog',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/dev-catalog.json', (_req, res) => {
        if (!existsSync(file)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(readFileSync(file));
      });
    },
  };
}

const escapeHost = CARD_ART_HOST.replace(/\./g, '\\.');

export default defineConfig({
  base: BASE,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  resolve: {
    alias: process.env.VITEST
      ? { 'virtual:pwa-register/react': fileURLToPath(new URL('./src/test/pwa-register-stub.ts', import.meta.url)) }
      : {},
  },
  plugins: [
    react(),
    devCatalog(),
    htmlConstants(),
    // The service worker is irrelevant under vitest; its virtual module is aliased to a stub there.
    ...(process.env.VITEST
      ? []
      : [
          VitePWA({
            registerType: 'prompt',
            injectRegister: false,
            includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
            manifest: {
              id: BASE,
              name: 'Shiny Cardboard',
              short_name: 'Shiny Cardboard',
              description: 'Your Riftbound collection and decks, offline-ready.',
              start_url: BASE,
              scope: BASE,
              display: 'standalone',
              orientation: 'any',
              background_color: THEME_COLOR,
              theme_color: THEME_COLOR,
              categories: ['games', 'utilities'],
              icons: [
                { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
              ],
              shortcuts: [
                { name: 'Collection', url: `${BASE}collection`, icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
                { name: 'Decks', url: `${BASE}decks`, icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
              ],
            },
            workbox: {
              // json is included so catalog.json is precached: first-session offline works.
              globPatterns: ['**/*.{js,css,html,svg,png,woff2,ico,json}'],
              globIgnores: ['**/dev-catalog.json'],
              maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
              navigateFallback: `${BASE}index.html`,
              cleanupOutdatedCaches: true,
              clientsClaim: true,
              runtimeCaching: [
                {
                  urlPattern: new RegExp(`^https://${escapeHost}/.*`, 'i'),
                  handler: 'CacheFirst',
                  options: {
                    cacheName: CARD_ART_CACHE,
                    expiration: { maxEntries: MAX_CARD_ART_ENTRIES, maxAgeSeconds: NINETY_DAYS_S, purgeOnQuotaError: true },
                    cacheableResponse: { statuses: [0, 200] },
                  },
                },
                {
                  // Fallback when catalog.json was not part of the build precache (for example a CDN swap).
                  urlPattern: /\/catalog\.json$/,
                  handler: 'StaleWhileRevalidate',
                  options: { cacheName: 'catalog', cacheableResponse: { statuses: [200] } },
                },
              ],
            },
          }),
        ]),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
