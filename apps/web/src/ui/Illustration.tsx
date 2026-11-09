import { useId, type ReactNode } from 'react';
import './display.css';

export type IllustrationKind = 'cards' | 'deck' | 'search' | 'sets' | 'offline';

const CARD = { x: -26, y: -38, w: 52, h: 76, r: 7 };

/** One tilted card face. Children draw the emblem inside it. */
function Card({ angle, dx, dy, fill, children }: { angle: number; dx: number; dy: number; fill: string; children?: ReactNode }) {
  return (
    <g transform={`translate(${100 + dx} ${68 + dy}) rotate(${angle})`}>
      <rect x={CARD.x} y={CARD.y} width={CARD.w} height={CARD.h} rx={CARD.r} fill={fill} stroke="var(--control-border)" strokeWidth="1.2" />
      <rect x={CARD.x + 4} y={CARD.y + 4} width={CARD.w - 8} height={CARD.h - 8} rx={CARD.r - 3} fill="none" stroke="var(--border-strong)" strokeWidth="1" />
      {children}
    </g>
  );
}

function Diamond({ size = 9 }: { size?: number }) {
  return <path d={`M0 ${-size} ${size * 0.85} 0 0 ${size} ${-size * 0.85} 0z`} fill="var(--accent)" />;
}

function Sparkle({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return <path transform={`translate(${x} ${y}) scale(${s})`} d="M0 -6 1.6 -1.6 6 0 1.6 1.6 0 6 -1.6 1.6 -6 0 -1.6 -1.6z" fill="var(--accent)" opacity="0.9" />;
}

/** Inline SVG spot illustrations for empty states. Theme-aware, decorative. */
export function Illustration({ kind }: { kind: IllustrationKind }) {
  const gradId = useId();
  const foil = `url(#${gradId})`;
  return (
    <svg className="ui-illustration" viewBox="0 0 200 136" width="200" height="136" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent-hover)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.06" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="124" rx="62" ry="6" fill="var(--text)" opacity="0.07" />
      {kind === 'sets' ? (
        <g>
          {[0, 1, 2].map((col) =>
            [0, 1].map((row) => (
              <g key={`${col}${row}`} transform={`translate(${52 + col * 48} ${44 + row * 52})`}>
                <rect x="-18" y="-22" width="36" height="44" rx="5" fill="var(--bg-raised)" stroke="var(--control-border)" strokeWidth="1.2" />
                {col + row < 3 ? <rect x="-18" y="-22" width="36" height="44" rx="5" fill={foil} /> : null}
                {col + row < 3 ? <Diamond size={6} /> : null}
              </g>
            )),
          )}
        </g>
      ) : (
        <>
          <Card angle={-14} dx={-34} dy={6} fill="var(--bg-surface)" />
          <Card angle={12} dx={34} dy={6} fill="var(--bg-surface)" />
          <Card angle={0} dx={0} dy={-2} fill="var(--bg-raised)">
            <rect x={CARD.x} y={CARD.y} width={CARD.w} height={CARD.h} rx={CARD.r} fill={foil} />
            {kind === 'deck' ? (
              <>
                <Diamond size={11} />
                <circle cx="-12" cy="22" r="3.2" fill="none" stroke="var(--accent)" />
                <circle cx="0" cy="22" r="3.2" fill="none" stroke="var(--accent)" />
                <circle cx="12" cy="22" r="3.2" fill="none" stroke="var(--accent)" />
              </>
            ) : kind === 'offline' ? (
              <path d="M-12 8a8 8 0 0 1 1-16 11 11 0 0 1 21 3 7 7 0 0 1-1 13z M-16 -14 16 18" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <Diamond size={12} />
            )}
          </Card>
        </>
      )}
      {kind === 'search' ? (
        <g transform="translate(138 92)">
          <circle r="15" fill="var(--bg-surface)" fillOpacity="0.9" stroke="var(--accent)" strokeWidth="3" />
          <path d="m11 11 14 14" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
        </g>
      ) : null}
      <Sparkle x={28} y={26} s={1.1} />
      <Sparkle x={172} y={38} s={0.8} />
      <Sparkle x={160} y={14} s={0.5} />
    </svg>
  );
}
