import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { STORAGE_KEYS } from '../config/constants';
import { THEME_COLORS as THEME_COLOR_VALUES } from '../../pwa.config';

export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';
export type Density = 'comfortable' | 'compact';
export type DefaultView = 'grid' | 'list';

export interface Settings {
  theme: ThemePreference;
  density: Density;
  /** Initial layout for collection views. */
  defaultView: DefaultView;
  sidebarCollapsed: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  density: 'comfortable',
  defaultView: 'grid',
  sidebarCollapsed: false,
};

const ALLOWED: { [K in keyof Settings]: readonly Settings[K][] | 'boolean' } = {
  theme: ['dark', 'light', 'system'],
  density: ['comfortable', 'compact'],
  defaultView: ['grid', 'list'],
  sidebarCollapsed: 'boolean',
};

/** Keep only well-typed known keys so stale or tampered storage can never break the UI. */
export function sanitizeSettings(input: unknown): Settings {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(ALLOWED) as (keyof Settings)[]) {
    const rule = ALLOWED[key];
    const value = raw[key];
    const valid = rule === 'boolean' ? typeof value === 'boolean' : (rule as readonly unknown[]).includes(value);
    if (valid) out[key] = value;
  }
  return out as unknown as Settings;
}

export function resolveTheme(preference: ThemePreference, systemPrefersLight: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersLight ? 'light' : 'dark';
  return preference;
}

/* ---------------------------- store ---------------------------- */

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: Settings = DEFAULT_SETTINGS;

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.settings);
  } catch {
    return null;
  }
}

export function getSettings(): Settings {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cached = sanitizeSettings(raw ? JSON.parse(raw) : null);
    } catch {
      cached = DEFAULT_SETTINGS;
    }
  }
  return cached;
}

export function updateSettings(patch: Partial<Settings>): void {
  const next = sanitizeSettings({ ...getSettings(), ...patch });
  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(next));
  } catch {
    /* storage unavailable: keep the in-memory value for this session */
    cachedRaw = undefined;
    cached = next;
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => event.key === STORAGE_KEYS.settings && listener();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Persisted preferences. `const [settings, update] = useSettings()`. */
export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const settings = useSyncExternalStore(subscribe, getSettings, () => DEFAULT_SETTINGS);
  const update = useCallback((patch: Partial<Settings>) => updateSettings(patch), []);
  return [settings, update];
}

/* ------------------------- applying to DOM ------------------------- */

const LIGHT_QUERY = '(prefers-color-scheme: light)';
const THEME_COLORS: Record<ResolvedTheme, string> = THEME_COLOR_VALUES;

export function applySettingsToDocument(settings: Settings, systemPrefersLight: boolean, root: HTMLElement = document.documentElement) {
  const theme = resolveTheme(settings.theme, systemPrefersLight);
  root.dataset.theme = theme;
  root.dataset.density = settings.density;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
}

/** Mount once near the root: keeps <html> attributes in sync with settings and the OS theme. */
export function useApplySettings(): void {
  const [settings] = useSettings();
  useEffect(() => {
    const query = window.matchMedia(LIGHT_QUERY);
    const apply = () => applySettingsToDocument(settings, query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [settings]);
}

/** Test helper: forget cached storage reads. */
export function resetSettingsCache(): void {
  cachedRaw = undefined;
  cached = DEFAULT_SETTINGS;
}
