import type { Domain } from '@sc/core';

/**
 * Original geometric marks for the seven domains, drawn on a 16 grid. They are deliberately
 * simple (not the publisher's artwork) so each domain reads by shape as well as by color.
 */
const GLYPHS: Record<Domain, string> = {
  // Flame: a rising point with a notch
  Fury: 'M8 1.5c.4 2.4 3.6 3.9 3.6 7.4A3.6 3.6 0 0 1 8 12.5 3.6 3.6 0 0 1 4.4 8.9c0-1.5.8-2.5 1.6-3.3.1 1.2.6 1.8 1.2 2C7 5.8 7.4 3.8 8 1.5z',
  // Drop inside a ring: still water
  Calm: 'M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8zm0 3.2c1.6 1.9 2.6 3.1 2.6 4.4A2.6 2.6 0 0 1 8 12a2.6 2.6 0 0 1-2.6-2.6C5.4 8.1 6.4 6.9 8 5z',
  // Eye: almond with a pupil
  Mind: 'M1.2 8C2.9 4.9 5.3 3.4 8 3.4s5.1 1.5 6.8 4.6c-1.7 3.1-4.1 4.6-6.8 4.6S2.9 11.1 1.2 8zM8 5.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z',
  // Hexagon: solid and braced
  Body: 'M8 1.4 13.7 4.7v6.6L8 14.6 2.3 11.3V4.7L8 1.4zM8 4.6 5.1 6.3v3.4L8 11.4l2.9-1.7V6.3L8 4.6z',
  // Zigzag bolt in a diamond: unstable
  Chaos: 'M8 1 14.5 8 8 15 1.5 8 8 1zm.6 3.6L5.4 8.7h2.2l-.4 2.7 3.4-4.3H8.4l.2-2.5z',
  // Pillar and base: structure
  Order: 'M3 2.5h10v2H3v-2zm1.5 3h1.8v5H4.5v-5zm3.2 0h1.8v5H7.7v-5zm3.2 0h1.8v5h-1.8v-5zM3 11.5h10v2H3v-2z',
  // Plain ring: no allegiance
  Colorless: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zm0 2.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6z',
};

export interface DomainGlyphProps {
  domain: Domain;
  size?: number | string;
  className?: string;
}

/** Decorative glyph in the domain color; pair with visible or screen reader text for the name. */
export function DomainGlyph({ domain, size = '1em', className }: DomainGlyphProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
      fillRule="evenodd"
    >
      <path d={GLYPHS[domain]} />
    </svg>
  );
}
