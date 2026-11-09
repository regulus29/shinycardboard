/**
 * Public surface of the card search engine.
 *
 * Query language (case insensitive, terms ANDed; `OR`, `|` and parentheses group alternatives):
 *  - Bare set plus number in any form: `ogn 42`, `OGN-042`, `ogn042`, `unl 29a`, `ogn #42`.
 *    A bare number (`42`) matches that collector number and combines with other terms.
 *    No marker means the standard printing; `a`, `b` or `*` select a marked printing.
 *  - Bare words match name (exact, prefix, word prefix, substring, then typo tolerance),
 *    then champion or faction tags. Domain, type and rarity words filter (`fury unit`);
 *    keyword words (`tank`) match the keyword or the name. A bare set code (`ogn`) filters by set.
 *  - `field:value` and comparisons: set, number, type, domain, rarity, energy (alias cost),
 *    might, power, text, name, keyword, tag, variant, owned, deck, artist.
 *    Comma separated values are alternatives (`domain:fury,calm`).
 *  - Numeric operators: `energy>=3`, `might<2`, `cost:2..4`, `cost:..2`, `might!=1`.
 *  - owned flags: `owned:yes|no|foil|nonfoil|3|>2`, `variant:alt|sig|over|metal`,
 *    `tag:none`, `tag:any`, `deck:none`, `deck:any`.
 *  - Negation with `-` prefix (`-domain:fury`, `-"draw 1"`, `-(a OR b)`), quoted phrases
 *    (name or rules text), `tag:"aggro package"`.
 * Parsing never throws. Unknown fields become warnings and fall back to free text.
 * Suggestions are full query strings with the last token completed.
 */
export type {
  Clause,
  CardRefClause,
  EnumClause,
  EnumField,
  Facet,
  GroupClause,
  NumberClause,
  NumericField,
  NumericOp,
  NumericTest,
  OwnedClause,
  OwnedTest,
  ParseOptions,
  ParsedQuery,
  ParseWarning,
  PhraseClause,
  PhraseTarget,
  PrintingClause,
  SearchContext,
  SearchHit,
  SearchOptions,
  SortKey,
  TextClause,
  TextField,
  UserListClause,
  UserListField,
  WordClause,
} from './types';
export { parseQuery } from './parse';
export { runSearch } from './run';
export { suggest, suggestTokens, type Suggestion } from './suggest';
