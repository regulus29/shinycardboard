import { describe, expect, it } from 'vitest';
import { screenHeightFor } from './standaloneHeight';

const phone = { width: 402, height: 874 };

describe('screenHeightFor', () => {
  it('uses the long edge in portrait and the short edge in landscape', () => {
    expect(screenHeightFor(phone, 402, 780)).toBe(874);
    expect(screenHeightFor(phone, 874, 380)).toBe(402);
  });
});
