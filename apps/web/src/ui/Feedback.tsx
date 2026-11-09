import type { CSSProperties, ReactNode } from 'react';
import { cx } from './cx';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Illustration, type IllustrationKind } from './Illustration';
import './display.css';

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  shape?: 'rect' | 'text' | 'circle';
  className?: string;
  style?: CSSProperties;
}

/** Shimmering placeholder. Decorative: hidden from assistive tech. */
export function Skeleton({ width, height, shape = 'rect', className, style }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cx('ui-skeleton', `ui-skeleton--${shape}`, className)}
      style={{ width, height, ...style }}
    />
  );
}

export interface EmptyStateProps {
  icon?: IconName;
  /** Richer spot illustration; replaces the icon tile when provided. */
  illustration?: IllustrationKind;
  title: string;
  description?: ReactNode;
  /** Call to action, usually a Button. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon = 'sparkles', illustration, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cx('ui-state', className)}>
      {illustration ? (
        <Illustration kind={illustration} />
      ) : (
        <span className="ui-state__icon" aria-hidden="true">
          <Icon name={icon} size="1.6rem" />
        </span>
      )}
      <h2 className="ui-state__title">{title}</h2>
      {description ? <p className="ui-state__desc">{description}</p> : null}
      {action ? <div className="ui-state__action">{action}</div> : null}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  message?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  className,
}: ErrorStateProps) {
  return (
    <div className={cx('ui-state', 'ui-state--error', className)} role="alert">
      <span className="ui-state__icon" aria-hidden="true">
        <Icon name="alert" size="1.6rem" />
      </span>
      <h2 className="ui-state__title">{title}</h2>
      {message ? <p className="ui-state__desc">{message}</p> : null}
      {onRetry ? (
        <div className="ui-state__action">
          <Button icon="sync" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export interface ProgressBarProps {
  value: number;
  max?: number;
  /** Accessible name, for example "Unleashed completion". */
  label: string;
  tone?: 'accent' | 'success';
  size?: 'sm' | 'md';
  /** Show "value / max" text beside the bar. */
  showValue?: boolean;
  className?: string;
}

export function ProgressBar({ value, max = 100, label, tone = 'accent', size = 'md', showValue, className }: ProgressBarProps) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className={cx('ui-progress', `ui-progress--${size}`, `ui-progress--${tone}`, className)}>
      <div
        className="ui-progress__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <div className="ui-progress__fill" style={{ width: `${ratio * 100}%` }} />
      </div>
      {showValue ? (
        <span className="ui-progress__text">
          {value} / {max}
        </span>
      ) : null}
    </div>
  );
}
