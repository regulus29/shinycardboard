import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Card, Printing } from '@sc/core';
import { cx } from './cx';
import { CardImage } from './CardImage';
import { DomainBadge } from './Badge';
import { domainColorVar, rarityColorVar } from './domains';
import './display.css';

export interface CardTileProps {
  card: Pick<Card, 'name' | 'domains'>;
  printing: Pick<Printing, 'imageUrl' | 'rarity' | 'variantLabel'>;
  /** Total owned copies; shown as a badge when greater than zero. */
  owned?: number;
  /** Render the art with the foil sheen (for example when a foil copy is owned). */
  foil?: boolean;
  /** Dim the tile (card not owned in an all-cards view, or missing from a deck). */
  dimmed?: boolean;
  selected?: boolean;
  /** Small text under the name, for example "OGN-042". */
  subtitle?: ReactNode;
  /** Navigate on click. Mutually exclusive with onClick. */
  to?: string;
  onClick?: () => void;
  /** Extra controls rendered under the art (for example a Stepper). */
  footer?: ReactNode;
  className?: string;
}

/** A card in a grid: art, rarity glow, name, domain dots and an owned count. */
export function CardTile({
  card,
  printing,
  owned = 0,
  foil = false,
  dimmed = false,
  selected = false,
  subtitle,
  to,
  onClick,
  footer,
  className,
}: CardTileProps) {
  const art = (
    <div className="ui-tile__art" style={{ '--tile-glow': rarityColorVar(printing.rarity), '--tile-domain': card.domains[0] ? domainColorVar(card.domains[0]) : undefined } as CSSProperties}>
      <CardImage src={printing.imageUrl} alt={card.name} foil={foil} rarity={printing.rarity} />
      {owned > 0 ? (
        <span className="ui-tile__owned" aria-label={`${owned} owned`}>
          {owned}
        </span>
      ) : null}
    </div>
  );
  const caption = (
    <div className="ui-tile__caption">
      <span className="ui-tile__name">{card.name}</span>
      {subtitle ? <span className="ui-tile__sub">{subtitle}</span> : null}
      {card.domains.length ? (
        <span className="ui-tile__domains">
          {card.domains.map((domain) => (
            <DomainBadge key={domain} domain={domain} compact />
          ))}
        </span>
      ) : null}
    </div>
  );
  const classes = cx('ui-tile', dimmed && 'is-dimmed', selected && 'is-selected', className);

  return (
    <div className={classes}>
      {to ? (
        <Link to={to} className="ui-tile__main" aria-label={card.name}>
          {art}
          {caption}
        </Link>
      ) : onClick ? (
        <button type="button" className="ui-tile__main" onClick={onClick} aria-pressed={selected}>
          {art}
          {caption}
        </button>
      ) : (
        <div className="ui-tile__main">
          {art}
          {caption}
        </div>
      )}
      {footer ? <div className="ui-tile__footer">{footer}</div> : null}
    </div>
  );
}
