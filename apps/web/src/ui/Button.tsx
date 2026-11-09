import type { ComponentPropsWithRef } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Spinner';
import './controls.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ControlSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  size?: ControlSize;
  /** Leading icon. */
  icon?: IconName;
  /** Shows a spinner and blocks clicks while keeping the layout stable. */
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('ui-btn', `ui-btn--${variant}`, `ui-btn--${size}`, fullWidth && 'ui-btn--full', className)}
      disabled={disabled}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      {...rest}
      onClick={loading ? undefined : rest.onClick}
    >
      {loading ? <Spinner size="1em" /> : icon ? <Icon name={icon} /> : null}
      {children ? <span className="ui-btn__label">{children}</span> : null}
    </button>
  );
}

export interface IconButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'children'> {
  icon: IconName;
  /** Required accessible name; also shown as the native tooltip. */
  label: string;
  variant?: Exclude<ButtonVariant, 'primary'> | 'primary';
  size?: ControlSize;
  /** Highlights the button as an active toggle (pair with aria-pressed). */
  active?: boolean;
}

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  active = false,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx('ui-btn', 'ui-btn--icon', `ui-btn--${variant}`, `ui-btn--${size}`, active && 'is-active', className)}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}
