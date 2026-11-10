import { describe, expect, it } from 'vitest';
import { validateCollectionRecord } from './records';

const deck = { id: 'd1', updatedAt: 1, name: 'Burn', main: [], runes: [], battlefields: [], sideboard: [] };

describe('deck win loss record', () => {
  it('accepts decks with and without a record', () => {
    expect(validateCollectionRecord('decks', deck, 'r')).toBeNull();
    expect(validateCollectionRecord('decks', { ...deck, wins: 5, losses: 0 }, 'r')).toBeNull();
  });

  it('rejects negative, fractional or oversized counts', () => {
    expect(validateCollectionRecord('decks', { ...deck, wins: -1 }, 'r')).toMatch(/wins/);
    expect(validateCollectionRecord('decks', { ...deck, losses: 1.5 }, 'r')).toMatch(/losses/);
    expect(validateCollectionRecord('decks', { ...deck, wins: 10 ** 9 }, 'r')).toMatch(/wins/);
  });
});
