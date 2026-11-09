/** PWA values shared by vite.config.ts (build time) and the app (runtime). Keep this file dependency free. */
export const CARD_ART_HOST = 'cmsassets.rgpub.io';
export const CARD_ART_CACHE = 'card-art';

/** Single source for values that index.html, vite.config.ts and the app must agree on. */
export const SETTINGS_STORAGE_KEY = 'sc.settings.v1';
/** Browser chrome colors; the dark value must equal --bg-app in tokens.css (guarded by a test). */
export const THEME_COLORS = { dark: '#080a0f', light: '#f4f3ef' } as const;
