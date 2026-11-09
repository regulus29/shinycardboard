import { cx } from './cx';
import './display.css';

export interface SpinnerProps {
  size?: number | string;
  /** Accessible text; omit when a surrounding element already announces the busy state. */
  label?: string;
  className?: string;
}

export function Spinner({ size = '1.25rem', label, className }: SpinnerProps) {
  return (
    <span
      className={cx('ui-spinner', className)}
      style={{ width: size, height: size }}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
