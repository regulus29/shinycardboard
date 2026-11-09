## Shiny Cardboard product spec

A personal, game-first collection and deck workbench for Riftbound. Single user, local-first, one responsive web app for phone and desktop, simple sync between devices.

## Principles

- One universal collection. Decks, tags and saved searches are views over it, never containers that hide cards.
- Everything about a card is searchable: name, set plus number in any format, domain, type, cost, might, rarity, keywords, rules text, variant, artist, user tags, ownership, deck usage.
- Game first, not trading first. No marketplace concepts.
- Card art everywhere it helps. Art is fetched from the source CDN on demand and cached by the service worker. Only URLs are stored in data.
- Rules are data. Deck limits live in `packages/core/src/rules/rules.config.json` and are never hard coded.
- Data is the user. Full export and import of everything at all times.

## Architecture

- `packages/core` (`@sc/core`): pure TypeScript with no DOM or framework. Catalog build, search, deck rules and assist tools, import and export, sync merge logic. Everything is unit tested.
- `apps/web` (`@sc/web`): Vite, React 19, TypeScript, React Router, Dexie (IndexedDB), vite-plugin-pwa. Plain CSS with design tokens, no CSS framework.
- `apps/sync` (`@sc/sync`): small Node HTTP server that stores one user JSON snapshot per collection, bearer token auth from environment, last write wins per record. Uses `@sc/core` merge logic.
- `scripts/build-catalog.ts`: fetches Riftcodex, runs `buildCatalog`, writes `apps/web/public/catalog.json` (gitignored build output).
- Shared types and function signatures are in `packages/core/src`. They are the contract. Change a signature only with a strong reason and update every consumer.

## Data model

Card concept (`Card`, keyed by `cardKey`) versus physical printing (`Printing`, keyed by `printingKey`). Owned copies (`OwnedEntry`) attach to a printing with finish and condition. Deck slots (`DeckSlot`) attach to a card concept, with an optional pinned printing. Tags attach to card concepts (`CardTagging`). All user records carry `id`, `updatedAt` and optional `deleted` tombstone so they sync.

## Features by element

### Catalog and search (core)

- Normalized catalog from Riftcodex with unique stable printing keys and variant detection, including the OPP Metal printings that share a source id with the base card.
- Omnibox query language described in `search.ts`. Forgiving: `ogn 42`, `OGN-042`, `unl 29a`, partial names, typos, and plain words like `fury unit`.
- Verification queries are part of the definition of done and live in the core test suite against a committed fixture.

### Collection (web)

- Add, edit and remove owned copies from any card with finish, condition and quantity. Quick add mode for fast entry.
- Grid view with card art and a dense table view. Group by set, domain, type, rarity or none. Sort by any attribute.
- Owned versus all-cards toggle, missing-from-set view, set completion bars per set and per variant.
- Card detail with large art, all printings, rules text, owned copies, tags, and the decks that use it.
- Tags: create, rename, bulk tag from selection, filter by tag in the omnibox.
- Saved searches act as smart folders in the sidebar.
- Import (this app's CSV, TCGplayer CSV, JSON backup) with a preview and issue report. Export CSV and JSON backup.

### Decks (core and web)

- Legend-first builder. Pick a Champion Legend, then the card pool is limited to legal cards.
- Live validation from the rules config, with clear plain language issues.
- Owned only mode and all cards mode. In all cards mode, missing cards are marked.
- Missing cards list with counts. Cross deck allocation warnings.
- Stats: energy curve, type split, domain split, average energy.
- Assist: what can I build ranking of legends from the collection, fill suggestions from owned cards.
- Deck text import and export, duplicate deck, notes and tags.
- Sample hand and mulligan draw.

### Sync (core, sync server, web)

- Manual and automatic sync with a configurable server URL and token. Last write wins per record, tombstones for deletes. Status indicator and error messages. Works offline and syncs when back online.

### Shell and design (web)

- Responsive: bottom tab bar on phones, collapsible sidebar on desktop. Dark theme by default with a light theme and system option.
- Domain colors as accents. Rarity treatment on cards. Skeleton states, empty states with guidance, and error states.
- Keyboard: `/` focuses the omnibox, `Esc` clears, arrow keys move through results.
- Accessible: semantic landmarks, focus rings, labels, contrast, reduced motion respected.
- Installable PWA with offline catalog and cached art.

## Quality bar

- TypeScript strict. No `any` without a comment explaining why.
- Small, cohesive modules. No deeply nested functions. No hard coded limits or magic numbers.
- Unit tests for all core logic. Component tests for key UI flows.
- Definition of success: the catalog builds from the real dataset, the verification queries pass, typecheck and tests pass, and the running app works in a browser.

## Out of scope for now

Marketplace features, pricing, accounts, multi-user sharing, card scanning, VR. The data layer stays UI independent so a VR front end can reuse it later.
