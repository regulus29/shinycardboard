const UNITS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: 'day', ms: 86_400_000 },
  { unit: 'hour', ms: 3_600_000 },
  { unit: 'minute', ms: 60_000 },
];

/** "3 hours ago", "yesterday". Anything under a minute reads "just now". */
export function relativeTime(then: number, now: number): string {
  const diff = now - then;
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const { unit, ms } of UNITS) {
    if (diff >= ms) return formatter.format(-Math.floor(diff / ms), unit);
  }
  return 'just now';
}
