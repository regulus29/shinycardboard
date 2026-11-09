import { useSyncExternalStore } from 'react';

/** Mid-session database health: a failed read or an unexpected close flips this, and the shell reacts. */
let failure: string | null = null;
const listeners = new Set<() => void>();

export function reportDbFailure(reason: string): void {
  if (failure === reason) return;
  failure = reason;
  listeners.forEach((listener) => listener());
}

export function clearDbFailure(): void {
  if (failure === null) return;
  failure = null;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Non-null while the database is known to be unusable. The string is a short internal reason, never user text. */
export function useDbFailure(): string | null {
  return useSyncExternalStore(subscribe, () => failure, () => null);
}
