import type { Condition, Finish } from '@sc/core';

/** Largest card tilt in degrees on the detail page. */
export const TILT_MAX_DEG = 9;
export const TAG_SUGGESTION_LIMIT = 8;
export const NOTES_MAX_LENGTH = 500;
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export const FINISH_LABELS: Record<Finish, string> = { normal: 'Normal', foil: 'Foil' };
export const CONDITION_LABELS: Record<Condition, string> = {
  NM: 'Near Mint',
  LP: 'Lightly Played',
  MP: 'Moderately Played',
  HP: 'Heavily Played',
  DMG: 'Damaged',
};
