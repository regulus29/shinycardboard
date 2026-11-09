import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Read a file relative to apps/web (vitest runs with that as cwd; jsdom hides file URLs). */
export function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}
