## Shiny Cardboard

A personal, game-first collection and deck-building app for the Riftbound trading card game. One universal collection you can search by anything, decks that are views over that collection, and tools that help you build new legal decks from the cards you own. Single user, local-first, same responsive web app on phone and desktop, with simple sync between devices.

## Features

- Search that understands release titles and card numbers in any form: `unleashed 29`, `ogn 42`, `OGN-042`, `042/298`, `unl 29a`, plus names with typos, attributes (`fury unit energy>=3`), rules text, keywords, variants (`alt art`, `signature`, `metal`), ownership (`owned:yes`) and your own tags (`tag:"aggro"`)
- One universal collection with grid and table views, grouping, sorting, filters, tags, bulk tagging, saved searches, set completion tracking and a card detail view with art, all printings, owned copies and the decks that use a card
- CSV import with a preview (this app's format and TCGplayer exports), CSV and JSON backup export, deck list text import and export
- Legend-first deck builder with live rules validation, owned-only and all-cards modes, missing cards list, cross-deck allocation warnings, stats, fill-from-collection and what-to-buy suggestions, a legend readiness ranking ("what can I build?"), and a sample hand with mulligan
- Offline-capable installable PWA with a bundled font and cached card art
- Simple sync between devices through a small self-hosted server

## Quick start

Requires Node 22 or newer.

```bash
npm install
npm run build:catalog
npm run dev
```

`build:catalog` pulls the card data from the Riftcodex API (cached in `data/raw/`, add `--refresh` to refetch) and writes `apps/web/public/catalog.json`, which is committed so the Pages workflow can build without calling the API (it blocks cloud runners). Rerun it locally and commit the result to refresh card data. It fails if any existing printing key would disappear without an alias, so a data refresh can never orphan your collection.

To sync devices, run the sync server somewhere your devices can reach over HTTPS, then enter its URL and token in Settings. See `docs/sync-server.md`.

```bash
SYNC_TOKEN=<a long random secret> npm run sync
```

## Hosting on GitHub Pages

A workflow in `.github/workflows/pages.yml` tests and builds the app on every push to `main` and publishes it at `https://<user>.github.io/shinycardboard/`. One-time setup: in the repo, open Settings, then Pages, and set Source to GitHub Actions. Then open the URL on your phone and use Add to Home Screen (Android Chrome: Install app).

To build for a subpath by hand, set `SC_BASE=/shinycardboard/` before `npm run build`.

## Project layout

- `packages/core`: pure TypeScript logic with no UI. Catalog build, search, deck rules and assist tools, import and export, sync merge
- `apps/web`: the React PWA (Vite, React 19, Dexie)
- `apps/sync`: dependency-free Node sync server
- `scripts`: catalog build and the original data spike
- `docs`: product spec, web architecture, deck rules notes, sync server operations, data spike findings

## Testing

```bash
npm run typecheck
npm test
npm run build
```

Definition of success: the catalog builds from the real dataset, the verification queries in the core search tests pass, typecheck and all tests pass, and the app runs in a browser.

## Key design decisions

- Printing keys come from the source id and variant only, never from other records, and a table of aliases maps retired keys forward. Owned copies attach to a printing, deck slots attach to a card concept.
- Deck rules are data in `packages/core/src/rules/rules.config.json`, each with provenance (confirmed, attested or unverified). The sideboard size and a few other rules are still unverified against the official tournament rules.
- Sync is last write wins per record with tombstones. A quantity edited on two devices at once keeps one value. Details are in `docs/sync-server.md`.
- Card art is loaded from the publisher CDN on demand and cached by the service worker. Only URLs are stored in data.

## Docs

- `docs/spec.md`: product spec
- `docs/web-architecture.md`: web app guide, data API and feature notes
- `docs/deck-rules-notes.md`: deck rules model, provenance and assumptions
- `docs/sync-server.md`: sync server operations and semantics
- `docs/data-spike-findings.md`: card data coverage findings

## Credits

The Sora typeface is bundled under the SIL Open Font License (`apps/web/src/assets/fonts/OFL-Sora.txt`). Riftbound and its card art belong to Riot Games. This is an unofficial personal tool.
