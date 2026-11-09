import { beforeEach, describe, expect, it } from 'vitest';
import { readSource } from './test/readSource';
import { STORAGE_KEYS } from './config/constants';
import { SETTINGS_STORAGE_KEY, THEME_COLORS } from '../pwa.config';

const VALUES: Record<string, string> = { SC_THEME_DARK: THEME_COLORS.dark, SC_THEME_LIGHT: THEME_COLORS.light, SC_SETTINGS_KEY: SETTINGS_STORAGE_KEY };
/** Mirror of the build-time placeholder substitution in vite.config.ts. */
const fill = (html: string) => html.replace(/%(SC_[A-Z_]+)%/g, (m, key: string) => VALUES[key] ?? m);

/** The inline script in index.html applies the saved theme before first paint. */
function runBootstrap() {
  const html = fill(readSource('index.html'));
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1]!;
  new Function(script)();
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-density');
  document.head.innerHTML = '<meta name="theme-color" content="#080a0f" />';
});

describe('index.html theme bootstrap', () => {
  it('takes the storage key and theme colors from the shared config, never literals', () => {
    const raw = readSource('index.html');
    expect(raw).toContain('%SC_SETTINGS_KEY%');
    expect(raw).not.toContain(SETTINGS_STORAGE_KEY);
    expect(raw).not.toContain(THEME_COLORS.dark);
    expect(STORAGE_KEYS.settings).toBe(SETTINGS_STORAGE_KEY);
    expect(fill(raw)).not.toMatch(/%SC_/);
  });

  it('keeps the dark browser chrome color equal to the --bg-app token', () => {
    expect(readSource('src/styles/tokens.css')).toContain(`--bg-app: ${THEME_COLORS.dark};`);
  });

  it('defaults to dark with empty storage', () => {
    runBootstrap();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('applies saved light theme and compact density', () => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ theme: 'light', density: 'compact' }));
    runBootstrap();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.density).toBe('compact');
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute('content')).toBe(THEME_COLORS.light);
  });

  it('survives corrupted storage', () => {
    localStorage.setItem(STORAGE_KEYS.settings, '{nope');
    runBootstrap();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
