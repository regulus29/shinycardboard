/** Remove diacritics so accented names compare predictably. */
export function foldDiacritics(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Lowercase, hyphen separated, apostrophes dropped ("Kha'Zix" becomes "khazix"). */
export function slugify(text: string): string {
  return foldDiacritics(text)
    .toLowerCase()
    .replace(/['\u2019`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Number of digits collector numbers are padded to inside printing keys. */
export const NUMBER_PAD_WIDTH = 3;

export function padNumber(value: number): string {
  return String(value).padStart(NUMBER_PAD_WIDTH, '0');
}
