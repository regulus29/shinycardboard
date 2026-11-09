import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DESKTOP_MIN_WIDTH_REM } from '../config/constants';

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return path.endsWith('.css') ? [path] : [];
  });
}

describe('layout breakpoint', () => {
  it('every phone media query matches DESKTOP_MIN_WIDTH_REM', () => {
    const expected = `${(DESKTOP_MIN_WIDTH_REM - 0.01).toFixed(2)}rem`;
    for (const file of cssFiles(resolve(process.cwd(), 'src'))) {
      const css = readFileSync(file, 'utf8');
      for (const [, value] of css.matchAll(/@media[^{]*max-width:\s*([\d.]+rem)/g)) {
        expect(value, file).toBe(expected);
      }
    }
  });
});
