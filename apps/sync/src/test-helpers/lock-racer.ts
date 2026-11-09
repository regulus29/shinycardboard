/**
 * Child process for the lock race test. Tries to take the data directory lock, prints `won` or `locked`,
 * then holds the lock until its stdin closes so the other racers see a live holder.
 */
import { FileStateStore, StoreLockedError } from '../store';

const dataDir = process.argv[2] ?? '';

async function main(): Promise<void> {
  const store = new FileStateStore(dataDir);
  try {
    await store.load();
  } catch (error) {
    if (!(error instanceof StoreLockedError)) throw error;
    process.stdout.write('locked\n');
    return;
  }
  process.stdout.write('won\n');
  process.stdin.resume();
  process.stdin.on('end', () => {
    void store.close().then(() => process.exit(0));
  });
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
