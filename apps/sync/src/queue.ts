/** Runs async tasks one at a time, in submission order. A failed task does not block the next one. */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.catch(() => undefined);
    return result;
  }

  /** Resolves once everything submitted so far has finished. */
  idle(): Promise<void> {
    return this.tail.then(() => undefined);
  }
}
