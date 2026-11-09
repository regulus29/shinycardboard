/** Tiny pub/sub announcing local user-data writes so auto sync can react. */
type Listener = () => void;
const listeners = new Set<Listener>();
let writes = 0;

export function subscribeLocalChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Called by repository writes after commit. Remote-applied writes must not call this. */
export function emitLocalChange(): void {
  listeners.forEach((listener) => listener());
}

/** Table hooks bump this counter so mutate() can tell whether a transaction really wrote rows. */
export function noteWrite(): void {
  writes += 1;
}

export function writeCount(): number {
  return writes;
}

/* ---- storage failures (quota, blocked transactions) surfaced to the UI as toasts ---- */

export interface StorageFailure {
  title: string;
  description: string;
}

type FailureListener = (failure: StorageFailure) => void;
const failureListeners = new Set<FailureListener>();

export function subscribeStorageFailures(listener: FailureListener): () => void {
  failureListeners.add(listener);
  return () => failureListeners.delete(listener);
}

/** Turn a low-level database error into a user-facing explanation. Raw messages are only logged. */
export function describeStorageError(error: unknown): StorageFailure {
  const name = error instanceof Error ? error.name : '';
  if (name === 'QuotaExceededError' || /quota/i.test(String((error as Error | undefined)?.message))) {
    return { title: 'Storage is full', description: 'Your change was not saved. Free some space on this device, or clear cached card art in Settings.' };
  }
  return { title: 'Could not save your change', description: 'The browser database refused the write. Try again, and export a backup if it keeps happening.' };
}

export function reportStorageFailure(error: unknown): void {
  console.error('Storage failure:', error);
  const failure = describeStorageError(error);
  failureListeners.forEach((listener) => listener(failure));
}
