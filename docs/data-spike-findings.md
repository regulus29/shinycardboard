## Riftbound card data spike findings

Source: Riftcodex open API, pulled 2026-11-08 with `scripts/riftcodex_spike.py`. No API key needed. A descriptive User-Agent is required, because the default Python one returns HTTP 403.

### Coverage

- 1451 records across sets VEN, OGN, SFD, UNL, OPP, OGS, PR and JDG
- Name, collector number, set, type, rarity, domain, rules text, image URL and variant flags are populated for effectively every record
- Energy is present on about 80 percent of records and might on about 53 percent. This is expected, because legends, battlefields and runes carry neither
- Tags are present on about 72 percent of records. They look like champion or faction labels and are not a full keyword list
- Card types: Unit, Spell, Legend, Gear, Battlefield, Rune
- Domains: Fury, Order, Chaos, Body, Mind, Calm, plus Colorless
- Variant flags: 100 alternate art, 72 overnumbered, 36 signature

### Identity findings

- The API `id` is unique per record (1451 of 1451)
- `riftbound_id` is not unique (1304 of 1451). OPP promo "Metal" printings share an id with their base printing and differ only by a name suffix
- 264 pairs of set and collector number repeat. Most are alternate art, overnumbered or signature variants, which carry an `a` or `*` marker in `riftbound_id`
- `riftbound_id` uses zero padded numbers such as `unl-029a-219`, which supports the flexible set plus number search

### Design consequences

- A printing needs its own identity key. Candidate: set code, collector number, variant marker and a normalized printing label taken from the name suffix. This must be stable across data refreshes, so do not rely on the API `id` alone
- Owned copies attach to a printing, while deck slots attach to a card concept (name plus rules), so any printing can fill a deck slot unless the user pins one
- Search normalization must handle padded and unpadded numbers and the `a` and `*` markers

### Open items

- Confirm whether the API `id` survives dataset refreshes. If it does, it can serve as the key
- Pull a keyword list, because the tags are not enough for keyword search. Rules text parsing may be required
- Node is not installed on this machine yet, so the planned TypeScript web app needs it before the app phase
