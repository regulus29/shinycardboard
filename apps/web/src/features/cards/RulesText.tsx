import { useMemo, type ReactNode } from 'react';
import type { Domain } from '@sc/core';
import { DomainGlyph } from '../../ui';
import { parseRulesText, type RulesSegment, type RuneKind } from './rulesParser';

const RUNE_DOMAIN: Record<Exclude<RuneKind, 'rainbow'>, Domain> = {
  fury: 'Fury',
  calm: 'Calm',
  mind: 'Mind',
  body: 'Body',
  chaos: 'Chaos',
  order: 'Order',
};

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** Inline icon with a text alternative. Icons are simple original shapes drawn on a 16 grid. */
function Icon({ label, className, children }: { label: string; className: string; children: ReactNode }) {
  return (
    <span role="img" aria-label={label} className={`rules__icon ${className}`}>
      {children}
    </span>
  );
}

const SVG_PROPS = { viewBox: '0 0 16 16', width: '1em', height: '1em', 'aria-hidden': true, focusable: false } as const;

function renderSegment(segment: RulesSegment, key: number): ReactNode {
  switch (segment.kind) {
    case 'text':
      return segment.text;
    case 'keyword':
      return (
        <strong key={key} className="rules__keyword">
          {segment.label}
        </strong>
      );
    case 'arrow':
      return (
        <Icon key={key} label="then" className="rules__arrow">
          <svg {...SVG_PROPS} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
          </svg>
        </Icon>
      );
    case 'energy':
      return (
        <Icon key={key} label={`${segment.amount} energy`} className="rules__energy">
          <span aria-hidden="true">{segment.amount}</span>
        </Icon>
      );
    case 'might':
      return (
        <Icon key={key} label="might" className="rules__might">
          <svg {...SVG_PROPS} fill="currentColor">
            <path d="M8 1.5 13 4v4.2c0 3-2 5.2-5 6.3-3-1.1-5-3.3-5-6.3V4l5-2.5zm0 3L5.5 5.8v2.4c0 1.6 1 2.9 2.5 3.7 1.5-.8 2.5-2.1 2.5-3.7V5.8L8 4.5z" />
          </svg>
        </Icon>
      );
    case 'exhaust':
      return (
        <Icon key={key} label="exhaust" className="rules__exhaust">
          <svg {...SVG_PROPS} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3" />
          </svg>
        </Icon>
      );
    case 'rune':
      return segment.rune === 'rainbow' ? (
        <Icon key={key} label="any domain rune" className="rules__rune rules__rune--rainbow">
          <span aria-hidden="true" />
        </Icon>
      ) : (
        <Icon key={key} label={`${capitalize(segment.rune)} rune`} className="rules__rune">
          <DomainGlyph domain={RUNE_DOMAIN[segment.rune]} size="1.1em" />
        </Icon>
      );
    case 'reminder':
      return (
        <span key={key} className="rules__reminder">
          ({segment.children.map(renderSegment)})
        </span>
      );
  }
}

/** Rules text as paragraphs with keyword chips, icons and de-emphasized reminder text. */
export function RulesText({ text }: { text: string }) {
  const blocks = useMemo(() => parseRulesText(text), [text]);
  return (
    <div className="rules">
      {blocks.map((block, index) => (
        <p key={index} className="rules__paragraph">
          {block.map(renderSegment)}
        </p>
      ))}
    </div>
  );
}
