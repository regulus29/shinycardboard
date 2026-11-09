/**
 * Set plus collector number parsing: `ogn 42`, `OGN-042`, `ogn042`, `unl 29a`, `ogn #42`,
 * `ven-r04`, and the printed forms `042/298`, `ogn 042/298`, `ogn/042`.
 */

export interface NumberRef {
  /** Optional letters before the digits (`r04`, `sp4`). */
  prefix: string;
  number: number;
  /** Variant marker after the digits: `a`, `b` or `*`. Empty for the unmarked printing. */
  suffix: string;
  /** Printed set size from `042/298`, when given. */
  total: number | null;
}

export interface CardRef extends NumberRef {
  set: string;
}

const MAX_NUMBER_DIGITS = 4;
const MAX_PREFIX_LETTERS = 2;
const MIN_SET_LETTERS = 2;
const MAX_SET_LETTERS = 4;

const DIGITS = `0*(\\d{1,${MAX_NUMBER_DIGITS}})`;
/** `/298` after a number: the printed set size. */
const TOTAL_PART = new RegExp(`^(.*\\d[a-z*]?)/${DIGITS}$`, 'i');
/** Number part: optional `#`, letters, zero padded digits, optional marker. */
const NUMBER_PART = new RegExp(`^#?([a-z]{0,${MAX_PREFIX_LETTERS}})${DIGITS}([a-z*]?)$`, 'i');
/** Whole reference in one token, separators optional. */
const COMPACT_REF = new RegExp(
  `^#?([a-z]{${MIN_SET_LETTERS},${MAX_SET_LETTERS + MAX_PREFIX_LETTERS}})[-#/]*([a-z]{0,${MAX_PREFIX_LETTERS}}?)${DIGITS}([a-z*]?)$`,
  'i',
);
const SET_LIKE = new RegExp(`^[a-z]{${MIN_SET_LETTERS},${MAX_SET_LETTERS}}$`, 'i');
/** Keys spell the overnumbered and signature marker `*` as `x`; accept both. */
function normalizeMarker(marker: string): string {
  const lower = marker.toLowerCase();
  return lower === 'x' ? '*' : lower;
}

const PLAIN_NUMBER = /^\d{1,4}$/;

/** Split a trailing `/298` off a token. */
function splitTotal(token: string): { rest: string; total: number | null } {
  const match = TOTAL_PART.exec(token);
  if (!match) return { rest: token, total: null };
  return { rest: match[1] as string, total: Number.parseInt(match[2] as string, 10) };
}

/** `42`, `#42`, `029`, `29a`, `r04`, `042/298`. Digits are required. */
export function parseNumberRef(token: string): NumberRef | null {
  const { rest, total } = splitTotal(token);
  const match = NUMBER_PART.exec(rest);
  if (!match) return null;
  return {
    prefix: (match[1] ?? '').toLowerCase(),
    number: Number.parseInt(match[2] ?? '', 10),
    suffix: normalizeMarker(match[3] ?? ''),
    total,
  };
}

/** A plain integer with nothing else around it. */
export function isPlainNumber(token: string): boolean {
  return PLAIN_NUMBER.test(token);
}

export function isSetLike(token: string): boolean {
  return SET_LIKE.test(token);
}

/**
 * Choose where the set code ends. With known sets the longest known set wins, so
 * `venr04` splits into `ven` and `r04`. Without them the leading letters before any
 * separator are the set.
 */
function splitSet(letters: string, separatorSplit: number, known: ReadonlySet<string> | null): [string, string] | null {
  if (!known) {
    return separatorSplit <= MAX_SET_LETTERS ? [letters.slice(0, separatorSplit), letters.slice(separatorSplit)] : null;
  }
  for (let length = Math.min(MAX_SET_LETTERS, letters.length); length >= MIN_SET_LETTERS; length--) {
    const set = letters.slice(0, length);
    const prefix = letters.slice(length);
    if (known.has(set) && prefix.length <= MAX_PREFIX_LETTERS) return [set, prefix];
  }
  return null;
}

/** One-token reference such as `ogn042`, `unl-229*`, `ogn/042` or `ogn042/298`. `known` holds lower case set codes. */
export function parseCompactRef(token: string, known: ReadonlySet<string> | null): CardRef | null {
  const { rest, total } = splitTotal(token);
  const match = COMPACT_REF.exec(rest);
  if (!match) return null;
  const head = (match[1] ?? '').toLowerCase();
  const tail = (match[2] ?? '').toLowerCase();
  const split = splitSet(head + tail, head.length, known);
  if (!split) return null;
  return {
    set: split[0],
    prefix: split[1],
    number: Number.parseInt(match[3] ?? '', 10),
    suffix: normalizeMarker(match[4] ?? ''),
    total,
  };
}

/** Pull the variant marker and number out of a source id such as "unl-029a-219" or "ven-r04". */
const SOURCE_ID_NUMBER = /^[a-z]+-([a-z]{0,2})0*(\d+)([a-z*]?)(?:-|$)/i;
const SOURCE_ID_TOTAL = /-(\d+)$/;

export function parseSourceIdRef(riftboundId: string): NumberRef | null {
  const match = SOURCE_ID_NUMBER.exec(riftboundId);
  if (!match) return null;
  return {
    prefix: (match[1] ?? '').toLowerCase(),
    number: Number.parseInt(match[2] ?? '', 10),
    suffix: (match[3] ?? '').toLowerCase(),
    total: parseSourceIdTotal(riftboundId),
  };
}

/** The printed set size: the last numeric segment of the source id. */
export function parseSourceIdTotal(riftboundId: string): number | null {
  const match = SOURCE_ID_TOTAL.exec(riftboundId);
  return match ? Number.parseInt(match[1] as string, 10) : null;
}
