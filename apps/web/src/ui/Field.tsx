import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';
import { IconButton } from './Button';
import './controls.css';

interface FieldFrameProps {
  id: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Visually hide the label but keep it for screen readers. */
  hideLabel?: boolean;
  children: ReactNode;
}

/** Shared label, hint and error chrome for form controls. */
function FieldFrame({ id, label, hint, error, hideLabel, children }: FieldFrameProps) {
  return (
    <div className="ui-field">
      {label ? (
        <label htmlFor={id} className={cx('ui-field__label', hideLabel && 'sr-only')}>
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className="ui-field__error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="ui-field__hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint: ReactNode, error: ReactNode): string | undefined {
  if (error) return `${id}-error`;
  return hint ? `${id}-hint` : undefined;
}

export interface TextFieldProps extends Omit<ComponentPropsWithRef<'input'>, 'size'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  hideLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function TextField({ label, hint, error, hideLabel, size = 'md', className, id, ...rest }: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldFrame id={fieldId} label={label} hint={hint} error={error} hideLabel={hideLabel}>
      <input
        id={fieldId}
        className={cx('ui-input', `ui-input--${size}`, className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        {...rest}
      />
    </FieldFrame>
  );
}

export interface SearchFieldProps extends Omit<ComponentPropsWithRef<'input'>, 'size' | 'onChange' | 'value' | 'type'> {
  value: string;
  onValueChange: (value: string) => void;
  /** Accessible name; the field is always label-less visually. */
  label: string;
  size?: 'sm' | 'md' | 'lg';
  /** Fired on Enter with the current value. */
  onSearch?: (value: string) => void;
  /** Slot rendered inside the field after the input (for example a keyboard hint). */
  trailing?: ReactNode;
}

/** Search input with leading icon, clear button, Enter to submit and Esc to clear. */
export function SearchField({
  value,
  onValueChange,
  label,
  size = 'md',
  onSearch,
  trailing,
  className,
  onKeyDown,
  ...rest
}: SearchFieldProps) {
  return (
    <div className={cx('ui-search', `ui-search--${size}`, className)} role="search">
      <Icon name="search" className="ui-search__icon" />
      <input
        type="search"
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        value={value}
        className="ui-search__input"
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (event.key === 'Escape' && value) {
            event.preventDefault();
            onValueChange('');
          } else if (event.key === 'Enter') {
            onSearch?.(value);
          }
        }}
        {...rest}
      />
      {value ? (
        <IconButton
          icon="close"
          label="Clear search"
          size="sm"
          onClick={() => onValueChange('')}
          className="ui-search__clear"
        />
      ) : (
        trailing
      )}
    </div>
  );
}

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string>
  extends Omit<ComponentPropsWithRef<'select'>, 'onChange' | 'value' | 'size'> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  hideLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

/** Native select (best mobile behavior) with themed chrome. */
export function Select<T extends string = string>({
  value,
  onValueChange,
  options,
  label,
  hint,
  error,
  hideLabel,
  size = 'md',
  className,
  id,
  ...rest
}: SelectProps<T>) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldFrame id={fieldId} label={label} hint={hint} error={error} hideLabel={hideLabel}>
      <div className={cx('ui-select', `ui-input--${size}`, className)}>
        <select
          id={fieldId}
          value={value}
          onChange={(event) => onValueChange(event.target.value as T)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, hint, error)}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" className="ui-select__chevron" />
      </div>
    </FieldFrame>
  );
}
