import type { CSSProperties, ReactNode } from 'react';
import type { Domain } from '@sc/core';
import { cx } from './cx';
import { Icon } from './Icon';
import { domainColorVar, rarityColorVar } from './domains';
import { DomainGlyph } from './DomainGlyph';
import './display.css';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

/** Small status label. */
export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return <span className={cx('ui-badge', `ui-badge--${tone}`, className)}>{children}</span>;
}

export interface ChipProps {
  children: ReactNode;
  selected?: boolean;
  /** Makes the chip a toggle button. */
  onClick?: () => void;
  /** Adds a remove button (for tags and active filters). */
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
}

/** Filter or tag chip: static, toggleable, or removable. */
export function Chip({ children, selected = false, onClick, onRemove, removeLabel = 'Remove', className }: ChipProps) {
  const body = onClick ? (
    <button type="button" className="ui-chip__main" aria-pressed={selected} onClick={onClick}>
      {children}
    </button>
  ) : (
    <span className="ui-chip__main">{children}</span>
  );
  return (
    <span className={cx('ui-chip', selected && 'is-selected', onRemove && 'has-remove', className)}>
      {body}
      {onRemove ? (
        <button type="button" className="ui-chip__remove" aria-label={`${removeLabel} ${typeof children === 'string' ? children : ''}`.trim()} onClick={onRemove}>
          <Icon name="close" size="0.9em" />
        </button>
      ) : null}
    </span>
  );
}

export interface DomainBadgeProps {
  domain: Domain;
  /** Dot only, with the name kept as an accessible label. */
  compact?: boolean;
  className?: string;
}

export function DomainBadge({ domain, compact = false, className }: DomainBadgeProps) {
  const style = { '--badge-color': domainColorVar(domain) } as CSSProperties;
  return (
    <span
      className={cx('ui-domain', compact && 'ui-domain--compact', className)}
      style={style}
      title={compact ? domain : undefined}
    >
      <DomainGlyph domain={domain} className="ui-domain__glyph" />
      {compact ? <span className="sr-only">{domain}</span> : domain}
    </span>
  );
}

export interface RarityBadgeProps {
  rarity: string;
  className?: string;
}

export function RarityBadge({ rarity, className }: RarityBadgeProps) {
  const style = { '--badge-color': rarityColorVar(rarity) } as CSSProperties;
  return (
    <span className={cx('ui-rarity', className)} style={style}>
      <span className="ui-rarity__gem" aria-hidden="true" />
      {rarity}
    </span>
  );
}
