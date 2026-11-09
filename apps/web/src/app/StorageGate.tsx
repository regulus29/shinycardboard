import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { db } from '../data/db';
import { clearDbFailure, useDbFailure } from '../data/health';
import { ErrorState, Spinner } from '../ui';

type Status = 'checking' | 'ok' | 'failed';

/**
 * Opens the database before the app renders, and keeps watching it. If the browser refuses
 * (private mode, blocked storage, full disk, another tab mid-update) or the connection later
 * closes or a read fails, it shows an explanation and a retry instead of leaving every data
 * hook stuck on "loading".
 */
export function StorageGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('checking');
  const [generation, setGeneration] = useState(0);
  const midSessionFailure = useDbFailure();

  const open = useCallback(() => {
    setStatus('checking');
    db.open().then(
      () => {
        clearDbFailure();
        setGeneration((n) => n + 1); // remount children so live queries restart on the fresh connection
        setStatus('ok');
      },
      (error: unknown) => {
        console.error('Database could not be opened:', error);
        setStatus('failed');
      },
    );
  }, []);
  useEffect(open, [open]);

  if (status === 'ok' && midSessionFailure === null) return <div key={generation} style={{ display: 'contents' }}>{children}</div>;
  if (status === 'failed' || (status === 'ok' && midSessionFailure !== null)) {
    return (
      <div className="boot-screen">
        <ErrorState
          title="Storage unavailable"
          message="Shiny Cardboard keeps your collection in this browser's local database, and the browser would not open it. This usually means a private or incognito window, storage blocked in site settings, a full disk, or another tab mid-update. Close other tabs or switch to a normal window, then retry."
          retryLabel="Try again"
          onRetry={open}
        />
      </div>
    );
  }
  return (
    <div className="boot-screen" role="status">
      <Spinner />
      <span className="sr-only">Opening your collection</span>
    </div>
  );
}
