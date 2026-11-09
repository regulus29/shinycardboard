import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { SyncEngine, type SyncState } from './engine';
import { useSyncConfig } from './config';

interface SyncContextValue {
  engine: SyncEngine;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export interface SyncProviderProps {
  children: ReactNode;
  /** Injection point for tests. Defaults to an engine wired to the real database. */
  engine?: SyncEngine;
  /** Disable timers and listeners (tests, storybook-style previews). */
  autoStart?: boolean;
}

export function SyncProvider({ children, engine: provided, autoStart = true }: SyncProviderProps) {
  const engine = useMemo(() => provided ?? new SyncEngine(), [provided]);
  const config = useSyncConfig();

  useEffect(() => {
    if (!autoStart) return;
    engine.start();
    return () => engine.stop();
  }, [engine, autoStart]);

  // Changing URL or token re-evaluates the disabled/enabled state and syncs immediately.
  useEffect(() => {
    if (autoStart) void engine.refresh();
  }, [engine, config, autoStart]);

  const value = useMemo(() => ({ engine }), [engine]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export interface UseSync {
  state: SyncState;
  /** Trigger a sync immediately (manual "Sync now"). */
  syncNow: () => Promise<void>;
  /** Forget server cursors and do a full push and pull. */
  resyncEverything: () => Promise<void>;
}

export function useSync(): UseSync {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside <SyncProvider>');
  const { engine } = ctx;
  const state = useSyncExternalStore(engine.subscribe, engine.getState, engine.getState);
  const syncNow = useCallback(() => engine.syncNow(), [engine]);
  const resyncEverything = useCallback(() => engine.resyncEverything(), [engine]);
  return { state, syncNow, resyncEverything };
}
