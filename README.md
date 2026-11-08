## shinycardboard

A personal, game-focused collection and deck-building app for the Riftbound trading card game.

### Goals

- One universal collection, searchable by any card attribute, set code, collector number or custom tag
- Decks are views over the collection, not containers
- Legend-first deck builder with config-driven rules validation
- Same responsive web app on phone and desktop, with simple sync
- Later: VR collection and playtest interface

### Status

Planning and data spike. See `docs/` for specs and findings.

### Data spike

Run the Riftcodex coverage report with Python 3 (standard library only):

    python -I scripts/riftcodex_spike.py

The pull is cached in `data/raw/` (gitignored). Add `--refresh` to refetch. Results are summarized in `docs/data-spike-findings.md`.
