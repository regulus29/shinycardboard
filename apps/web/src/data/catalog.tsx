import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Catalog } from '@sc/core';
import { CATALOG_URL, DEV_CATALOG_URL } from '../config/constants';
import { EMPTY_MIGRATION, type MigrationResult } from './catalogMigration';
import { ErrorState } from '../ui/Feedback';
import { Skeleton } from '../ui/Feedback';

export type CatalogState =
  | { status: 'loading'; catalog: null; error: null }
  | { status: 'ready'; catalog: Catalog; error: null }
  | { status: 'error'; catalog: null; error: string };

export interface CatalogContextValue {
  state: CatalogState;
  /** Re-fetch after a failure (or to pick up a fresh build). */
  retry: () => void;
  /** Outcome of the retired-key migration for the loaded catalog (empty until it has run). */
  migration: MigrationResult;
  /** Used by the migration runner to publish its outcome. */
  setMigration: (result: MigrationResult) => void;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

function isCatalog(value: unknown): value is Catalog {
  const candidate = value as Partial<Catalog> | null;
  return Boolean(candidate && typeof candidate === 'object' && candidate.cards && candidate.printings && Array.isArray(candidate.sets));
}

/** Fetch and validate one catalog URL. The dev server answers unknown paths with HTML, so parse defensively. */
export async function fetchCatalog(url: string, signal?: AbortSignal): Promise<Catalog> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
  const json: unknown = await response.json().catch(() => {
    throw new Error('Catalog response was not valid JSON');
  });
  if (!isCatalog(json)) throw new Error('Catalog file has an unexpected shape');
  return json;
}

/** Prefer the real catalog; during development fall back to the generated dev fixture. */
export async function loadCatalog(signal?: AbortSignal): Promise<Catalog> {
  try {
    return await fetchCatalog(CATALOG_URL, signal);
  } catch (error) {
    if (!import.meta.env.DEV || signal?.aborted) throw error;
    return fetchCatalog(DEV_CATALOG_URL, signal).catch(() => {
      throw error;
    });
  }
}

export interface CatalogProviderProps {
  children: ReactNode;
  /** Injection point for tests. */
  load?: (signal?: AbortSignal) => Promise<Catalog>;
}

export function CatalogProvider({ children, load = loadCatalog }: CatalogProviderProps) {
  const [state, setState] = useState<CatalogState>({ status: 'loading', catalog: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const [migration, setMigration] = useState<MigrationResult>(EMPTY_MIGRATION);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading', catalog: null, error: null });
    load(controller.signal).then(
      (catalog) => setState({ status: 'ready', catalog, error: null }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', catalog: null, error: error instanceof Error ? error.message : 'Could not load the card catalog' });
      },
    );
    return () => controller.abort();
  }, [attempt, load]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const value = useMemo(() => ({ state, retry, migration, setMigration }), [state, retry, migration]);
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

/** Catalog loading state. Prefer `useRequiredCatalog` under a <CatalogGate>. */
export function useCatalog(): CatalogContextValue {
  const value = useContext(CatalogContext);
  if (!value) throw new Error('useCatalog must be used inside <CatalogProvider>');
  return value;
}

/** The loaded catalog. Throws if called before it is ready, so render it beneath <CatalogGate>. */
export function useRequiredCatalog(): Catalog {
  const { state } = useCatalog();
  if (state.status !== 'ready') throw new Error('Catalog is not loaded; wrap this view in <CatalogGate>');
  return state.catalog;
}

/** Renders children once the catalog is ready, with loading and retryable error states otherwise. */
export function CatalogGate({ children }: { children: ReactNode }) {
  const { state, retry } = useCatalog();
  if (state.status === 'ready') return <>{children}</>;
  if (state.status === 'error') {
    return <ErrorState title="Card catalog unavailable" message={state.error} onRetry={retry} />;
  }
  return (
    <div className="page" role="status">
      <span className="sr-only">Loading card catalog</span>
      <Skeleton height="2rem" width="12rem" />
      <Skeleton height="40vh" style={{ marginTop: '1.5rem' }} />
    </div>
  );
}
