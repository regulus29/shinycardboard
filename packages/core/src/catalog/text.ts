import { KEYWORDS, KNOWN_NON_KEYWORD_TERMS } from './vocabulary';

const ENTITIES: Record<string, string> = {
  '&gt;': '>',
  '&lt;': '<',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/** Source marker for cards without rules text. */
const NO_TEXT_MARKER = '[NO TEXT]';

function decodeEntities(text: string): string {
  return text.replace(/&(?:gt|lt|amp|quot|nbsp|#39);/g, (entity) => ENTITIES[entity] ?? entity);
}

/**
 * Plain rules text with line breaks kept. Prefers the rich text because the
 * plain field glues paragraphs together ("[Assault]Your conquer...").
 */
export function cleanRulesText(rich: string | null, plain: string | null): string {
  const withBreaks = rich
    ? rich
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, '')
    : (plain ?? '');
  const text = decodeEntities(withBreaks)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
  return text === NO_TEXT_MARKER ? '' : text;
}

const KEYWORD_BY_LOWER = new Map(KEYWORDS.map((keyword) => [keyword.toLowerCase(), keyword]));
const BRACKET_TERM = /\[([^\]]+)\]/g;
const TRAILING_NUMBER = /\s+\d+$/;

/** Bracketed terms in rules text with trailing numbers removed ("Assault 2" becomes "Assault"). */
export function bracketTerms(rulesText: string): string[] {
  return [...rulesText.matchAll(BRACKET_TERM)].map((match) =>
    (match[1] ?? '').replace(TRAILING_NUMBER, '').trim(),
  );
}

/** Canonical keywords found in rules text, in vocabulary order, without duplicates. */
export function parseKeywords(rulesText: string): string[] {
  const found = new Set(bracketTerms(rulesText).map((term) => KEYWORD_BY_LOWER.get(term.toLowerCase())));
  return KEYWORDS.filter((keyword) => found.has(keyword));
}

const KNOWN_OTHER = new Set(KNOWN_NON_KEYWORD_TERMS.map((term) => term.toLowerCase()));

/** Bracketed terms that are neither keywords nor known effect words: possible new mechanics. */
export function unrecognizedTerms(rulesText: string): string[] {
  return bracketTerms(rulesText).filter((term) => {
    const lower = term.toLowerCase();
    return !KEYWORD_BY_LOWER.has(lower) && !KNOWN_OTHER.has(lower);
  });
}
