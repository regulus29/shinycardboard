/** Debounced, serialized autosave with flush. Framework free so it can be tested with fake timers. */

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface Autosaver<T> {
  /** Queue the latest value; earlier queued values are replaced. */
  schedule(value: T): void;
  /** Save any queued value now and wait for every in flight save. */
  flush(): Promise<void>;
  /** Forget the queued value (for example when the record was deleted). */
  cancel(): void;
  status(): SaveStatus;
  hasPending(): boolean;
  subscribe(listener: (status: SaveStatus) => void): () => void;
}

export function createAutosaver<T>(save: (value: T) => Promise<void>, delayMs: number): Autosaver<T> {
  let queued: { value: T } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<void> = Promise.resolve();
  let current: SaveStatus = 'idle';
  const listeners = new Set<(status: SaveStatus) => void>();

  const set = (next: SaveStatus) => {
    current = next;
    listeners.forEach((listener) => listener(next));
  };

  const run = (): Promise<void> => {
    if (!queued) return inflight;
    const { value } = queued;
    queued = undefined;
    set('saving');
    inflight = inflight
      .then(() => save(value))
      .then(
        () => set(queued ? 'pending' : 'saved'),
        () => {
          queued ??= { value };
          set('error');
        },
      );
    return inflight;
  };

  return {
    schedule(value) {
      queued = { value };
      clearTimeout(timer);
      set('pending');
      timer = setTimeout(() => {
        timer = undefined;
        void run();
      }, delayMs);
    },
    async flush() {
      clearTimeout(timer);
      timer = undefined;
      await run();
      await inflight;
    },
    cancel() {
      clearTimeout(timer);
      timer = undefined;
      queued = undefined;
      if (current === 'pending') set('idle');
    },
    status: () => current,
    hasPending: () => queued !== undefined || current === 'saving',
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
