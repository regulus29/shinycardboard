"""Data spike: pull the full Riftcodex card set and report how well it supports our search needs.

Standard library only. Raw pages are cached under data/raw/ (gitignored) so reruns are cheap.
"""
import argparse
import json
import urllib.request
from collections import Counter
from pathlib import Path

DEFAULT_API = "https://api.riftcodex.com/cards"
DEFAULT_PAGE_SIZE = 100
REQUEST_TIMEOUT_SECONDS = 60
# Some hosts block the default Python user agent, so identify the client explicitly.
CLIENT_NAME = "shinycardboard-spike/0.1"
RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"

# Fields our search and deck features depend on, as dotted paths into a card record.
REQUIRED_FIELDS = [
    "name",
    "collector_number",
    "riftbound_id",
    "set.set_id",
    "classification.type",
    "classification.rarity",
    "classification.domain",
    "attributes.energy",
    "attributes.might",
    "text.plain",
    "media.image_url",
    "tags",
    "metadata.alternate_art",
    "metadata.overnumbered",
    "metadata.signature",
]


def fetch_page(api_url, page, size):
    url = f"{api_url}?page={page}&size={size}"
    request = urllib.request.Request(url, headers={"User-Agent": CLIENT_NAME})
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
        return json.load(resp)


def fetch_all(api_url, size):
    """Return every card record, paging until the API reports no more pages."""
    first = fetch_page(api_url, 1, size)
    cards = list(first["items"])
    for page in range(2, first["pages"] + 1):
        cards.extend(fetch_page(api_url, page, size)["items"])
    return cards


def get_path(record, dotted):
    value = record
    for key in dotted.split("."):
        if not isinstance(value, dict) or key not in value:
            return None
        value = value[key]
    return value


def is_present(value):
    return value is not None and value != "" and value != []


def field_coverage(cards):
    total = len(cards)
    return {
        path: sum(is_present(get_path(c, path)) for c in cards) / total
        for path in REQUIRED_FIELDS
    }


def duplicate_keys(cards, key_fn):
    counts = Counter(key_fn(c) for c in cards)
    return {k: n for k, n in counts.items() if n > 1}


def print_report(cards):
    print(f"Total records: {len(cards)}\n")

    print("Field coverage (share of records with a value):")
    for path, share in field_coverage(cards).items():
        print(f"  {path:32s} {share:6.1%}")

    print("\nRecords per set:")
    for set_id, n in Counter(get_path(c, "set.set_id") for c in cards).most_common():
        print(f"  {set_id}: {n}")

    print("\nCard types:")
    for t, n in Counter(get_path(c, "classification.type") for c in cards).most_common():
        print(f"  {t}: {n}")

    print("\nVariant flags:")
    for flag in ("alternate_art", "overnumbered", "signature"):
        print(f"  {flag}: {sum(bool(get_path(c, f'metadata.{flag}')) for c in cards)}")

    dup_ids = duplicate_keys(cards, lambda c: c.get("riftbound_id"))
    dup_set_num = duplicate_keys(
        cards, lambda c: (get_path(c, "set.set_id"), c.get("collector_number"))
    )
    print(f"\nDuplicate riftbound_id values: {len(dup_ids)}")
    print(f"Duplicate (set, collector_number) pairs: {len(dup_set_num)}")
    for key, n in list(dup_set_num.items())[:5]:
        print(f"  e.g. {key} x{n}")

    domains = Counter(d for c in cards for d in (get_path(c, "classification.domain") or []))
    print(f"\nDomains seen: {dict(domains)}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default=DEFAULT_API)
    parser.add_argument("--size", type=int, default=DEFAULT_PAGE_SIZE)
    parser.add_argument("--refresh", action="store_true", help="ignore the cached pull")
    args = parser.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    cache = RAW_DIR / "cards.json"
    if cache.exists() and not args.refresh:
        cards = json.loads(cache.read_text(encoding="utf-8"))
        print(f"Loaded {len(cards)} cached records from {cache}")
    else:
        cards = fetch_all(args.api, args.size)
        cache.write_text(json.dumps(cards), encoding="utf-8")
        print(f"Fetched and cached {len(cards)} records to {cache}")

    print_report(cards)


if __name__ == "__main__":
    main()
