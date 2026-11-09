## Deck rules notes

How `packages/core/src/decks` models Riftbound deck building. Every limit lives in `packages/core/src/rules/rules.config.json`, and each rule has a `provenance` entry there with a status (`confirmed`, `attested`, `unverified`) and a source. The old blanket `verified: false` is gone.

## Provenance summary

Checked on 2026-11-08 against the Core Rules 1.5 text mirrored at riftboundfaq.com/reference/core-rules/1.5 (and the archived 1.0 text, where rule numbers differ by one). Web content was treated as data.

- Confirmed: main deck of at least 40 cards including the Chosen Champion (103.3), copy limit 3 by name including the champion (103.3.b), signature limit of 3 in total regardless of name (103.3.d, 103.2.d in 1.0), signature cards must share the Legend champion tag (103.3.d), exactly 12 runes within the Domain Identity (103.4.a), no required split of runes across domains, battlefields at most one of each name (103.5.c), no-domain cards fit any identity (103.2.b.5), exactly one Legend (103.2.a), opening hand of 4 (116), mulligan up to 2 with set-aside cards recycled (117), Chosen Champion starts in the Champion Zone (103.3.a).
- Attested: copy limit counting the sideboard, and 3 battlefields (the count is set by the Mode of Play, 103.5.a, and 3 is the 1v1 standard).
- Unverified: sideboard sizes 0 or 8 (two sources say 10, so a bad size is only a warning) and the sideboard type restriction below. Sideboards are not in the Core Rules, they belong to the Tournament Rules, which were not read.

## Derived from the data

- Legend identity: every Legend has one or two domains and never Colorless.
- Colorless in the data means "no domain". Only Battlefields and Tokens (Gold, Recruit, Sprite) carry it. There is no deckable Colorless Unit, Spell or Gear today, so `colorlessAlwaysLegal` has no effect on main decks yet. Battlefields are never domain checked.
- Runes carry exactly one domain, so any split is legal. Twelve Fury runes complete a Fury/Order rune deck.
- Chosen champion: a Unit with supertype Champion carrying the legend champion tag. Signature units are not eligible. Several candidates per legend is normal.
- Champion tag resolution: the champion tag is the legend tag that is also the name of a Champion unit ("Kennen, Keeper of Balance" has tag Kennen). Faction tags (Yordle) never name a champion, so they are never guessed. No match gives `unresolved` and several give `ambiguous`. Both produce a `champion-unresolved` warning, and champion and signature mismatch checks are skipped. `Deck.chosenChampionKey` settles an ambiguous legend. On the full dataset every legend resolves.
- Signature cards carry the champion tag of one legend and their domains sit inside its identity. The total limit is counted over the main deck.
- Tokens are never deckable and Legends are never listed as deck cards.

## Assumptions

- Sideboard accepts only main deckable types (Unit, Spell, Gear), as a sideboard swaps main deck cards. Runes and battlefields there raise `section-type`. Unverified.
- Domain identity and signature rules apply to the sideboard as well.
- Without a legend, `legalCards` offers everything deckable except signature cards.
- A Legend counts as one required card in `missingCards`, `allocationConflicts`, `buildableLegends` and `suggestMissing`.
- `Deck.chosenChampionKey` must be a legal champion for the legend and be in the main deck. Without it, any matching champion in main satisfies the rule, and sample hands and suggestions use the first matching one.

## Counting semantics

- Ownership is by card concept across printings, finishes and conditions. Tombstones, unknown printings and non-positive quantities are ignored.
- Pin aware: a slot pinned to a printing of that card is filled only from it, unpinned demand uses the rest. Unknown or foreign pins are ignored.
- `allocationConflicts` ignores pins and reports a card only when two or more non-deleted decks demand more than is owned.
- Duplicate slots merge before any count. Bad counts are dropped and fractions floored.

## Assist heuristics

`rules/assist.config.json` holds taste, not rules: curve and type targets, score weights, reason count, other champion cap, rarity cost table and readiness weights.

- `suggestFill`: greedy, one copy at a time. Picks the chosen champion first (x3), then at most `otherChampionCards` further champions, prefers the champion tag over faction tags, respects curve and type targets and the signature limit.
- `suggestMissing`: what to buy when the owned cards cannot complete the deck. The owned fill is applied first, then the best fitting cards penalised by relative rarity (Common cheapest). No prices.
- `buildableLegends`: `completeness` is the honest share of filled slots. `score` blends it with champion choices, signature coverage and distinct card depth, so legends with the same pool still separate. Sorted by score, then usable copies, then key. Exact ties are real: two legends with the same domains and the same owned champions are equivalent for the collection.

## What suggestMissing guarantees

- Applying the owned fill (`suggestFill`) plus the buys (`suggestMissing`) to a deck with a legend yields zero `validateDeck` errors, for any collection and any legend whose champion resolves. This is tested on the real data for an empty collection, a starter Vi collection without a Vi champion, a random 30 percent collection, a mono Calm collection and an unowned explicit `chosenChampionKey`, over every legend.
- When no owned champion can be the chosen champion, `suggestFill` holds one main slot back and returns a marker (`role: 'missing-champion'`, `count: 0`). `suggestMissing` then buys the cheapest legal champion (relative rarity, no prices) into that slot and flags it `role: 'chosen-champion'`. An explicit `chosenChampionKey` is honored: that exact card is bought.
- The buys also cover runes, battlefields, the legend and the signature limit, and never exceed copy limits.
- Not covered: a deck whose main section is already full without a champion (nothing can be added without removing a card), and legends whose champion cannot be resolved (only a warning is possible).

## Signature cards in the sideboard

Rule 103.3.d is silent on sideboards. The conservative reading is configured: signature cards in main plus sideboard count together toward the limit of 3 (`signatureLimitAppliesAcrossSideboard`, status unverified). Set it to false to count the main deck only.
