import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { STORAGE_KEYS } from '../config/constants';
import {
  DEFAULT_SETTINGS,
  applySettingsToDocument,
  getSettings,
  resetSettingsCache,
  resolveTheme,
  sanitizeSettings,
  useSettings,
} from './settingsStore';

beforeEach(() => {
  localStorage.clear();
  resetSettingsCache();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-density');
});

describe('sanitizeSettings', () => {
  it('falls back to defaults for junk and drops unknown or badly typed keys', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ theme: 'neon', density: 'compact', sidebarCollapsed: 'yes', extra: 1 })).toEqual({
      ...DEFAULT_SETTINGS,
      density: 'compact',
    });
  });
});

describe('resolveTheme', () => {
  it('follows the system only when asked', () => {
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
    expect(resolveTheme('dark', true)).toBe('dark');
  });
});

describe('useSettings', () => {
  it('defaults to the dark theme', () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current[0].theme).toBe('dark');
  });

  it('persists updates to localStorage and re-renders', () => {
    const { result } = renderHook(() => useSettings());
    act(() => result.current[1]({ theme: 'light', defaultView: 'list' }));
    expect(result.current[0]).toMatchObject({ theme: 'light', defaultView: 'list' });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.settings)!)).toMatchObject({ theme: 'light' });
  });

  it('survives corrupted storage', () => {
    localStorage.setItem(STORAGE_KEYS.settings, '{not json');
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('is shared across hook instances', () => {
    const a = renderHook(() => useSettings());
    const b = renderHook(() => useSettings());
    act(() => a.result.current[1]({ density: 'compact' }));
    expect(b.result.current[0].density).toBe('compact');
  });
});

describe('applySettingsToDocument', () => {
  it('writes theme and density attributes on the root element', () => {
    applySettingsToDocument({ ...DEFAULT_SETTINGS, theme: 'system', density: 'compact' }, true);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.density).toBe('compact');
  });
});
