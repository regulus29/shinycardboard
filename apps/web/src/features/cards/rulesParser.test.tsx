import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { parseRulesText, rulesPlainText } from './rulesParser';
import { RulesText } from './RulesText';

/** Real text from the catalog (Akali, Deadly Weapon). */
const AKALI =
  "[Empower] :rb_energy_2::rb_rune_fury: (:rb_energy_2::rb_rune_fury:: Empower me. Use only if not Empowered.)\nWhen I move, you may deal 1 to a unit at a battlefield I moved to or from. If I'm [Empowered], deal 2 instead.\n[Empowered][>] I have +1 :rb_might:.";

describe('parseRulesText', () => {
  const blocks = parseRulesText(AKALI);

  it('splits paragraphs on newlines', () => {
    expect(blocks).toHaveLength(3);
  });

  it('parses keywords, energy and rune icons, and nests reminder text', () => {
    const first = blocks[0]!;
    expect(first[0]).toEqual({ kind: 'keyword', label: 'Empower' });
    expect(first.slice(2, 4)).toEqual([{ kind: 'energy', amount: 2 }, { kind: 'rune', rune: 'fury' }]);
    const reminder = first.find((s) => s.kind === 'reminder');
    expect(reminder && reminder.kind === 'reminder' && reminder.children.some((s) => s.kind === 'energy')).toBe(true);
  });

  it('parses the arrow and might icon', () => {
    expect(blocks[2]?.map((s) => s.kind)).toEqual(['keyword', 'arrow', 'text', 'might', 'text']);
  });

  it('reads back as plain text without raw markup', () => {
    const plain = rulesPlainText(blocks);
    expect(plain).not.toMatch(/:rb_/);
    expect(plain).toContain('2 energy');
    expect(plain).toContain('fury rune');
  });

  it('keeps unknown tokens as text and survives unbalanced parentheses', () => {
    expect(parseRulesText(':rb_mystery: ok')[0]).toEqual([{ kind: 'text', text: ':rb_mystery: ok' }]);
    expect(() => parseRulesText('a ) b ( c [x')).not.toThrow();
    expect(parseRulesText('(open')[0]?.[0]?.kind).toBe('reminder');
    expect(parseRulesText('')).toEqual([]);
  });

  it('handles rainbow runes, exhaust and numbered keywords', () => {
    const [block] = parseRulesText('[Assault 2] :rb_exhaust: :rb_rune_rainbow:');
    expect(block?.map((s) => s.kind)).toEqual(['keyword', 'text', 'exhaust', 'text', 'rune']);
  });
});

describe('RulesText', () => {
  it('renders icons with text alternatives and bold keywords', () => {
    render(<RulesText text={AKALI} />);
    expect(screen.getAllByRole('img', { name: '2 energy' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: 'Fury rune' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: 'might' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'then' })).toBeInTheDocument();
    expect(document.querySelectorAll('.rules__keyword').length).toBe(3);
    expect(document.body.textContent).not.toContain(':rb_');
  });
});
