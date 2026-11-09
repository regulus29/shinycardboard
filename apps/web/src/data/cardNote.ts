import { db } from './db';
import { mutate, putRecord, revive, toTombstone } from './repo';

/**
 * Set the free-text note on a card's tagging record. A blank note with no tags removes the record.
 * Lives beside the tag mutations' contract: one record per card, id equals cardKey.
 */
export function setCardNote(cardKey: string, note: string) {
  const clean = note.trim();
  return mutate([db.taggings], async () => {
    const existing = await db.taggings.get(cardKey);
    const live = existing && !existing.deleted ? existing : undefined;
    if (!clean) {
      if (!live) return null;
      const { note: _dropped, ...rest } = live;
      if (rest.tags.length === 0) {
        await db.taggings.put(toTombstone(live));
        return null;
      }
      return putRecord(db.taggings, rest);
    }
    const base = existing ? revive(existing) : { id: cardKey, cardKey, tags: [], updatedAt: 0 };
    return putRecord(db.taggings, { ...base, tags: live?.tags ?? [], note: clean });
  });
}
