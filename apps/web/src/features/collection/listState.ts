import { LIST_STATE_PREFIX } from './constants';

/** Scroll memory per history entry, so Back from card detail lands where the user left. */
export interface SavedListState {
  scrollTop: number;
  rowStride: number;
}

export function saveListState(locationKey: string, state: SavedListState): void {
  try {
    sessionStorage.setItem(LIST_STATE_PREFIX + locationKey, JSON.stringify(state));
  } catch {
    // Storage can be unavailable or full; scroll restoration is a nicety.
  }
}

export function loadListState(locationKey: string): SavedListState | null {
  try {
    const raw = sessionStorage.getItem(LIST_STATE_PREFIX + locationKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedListState>;
    return typeof parsed.scrollTop === 'number' && typeof parsed.rowStride === 'number'
      ? { scrollTop: parsed.scrollTop, rowStride: parsed.rowStride }
      : null;
  } catch {
    return null;
  }
}
