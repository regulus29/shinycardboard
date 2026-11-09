import { useId, useRef, type ComponentPropsWithRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';
import './controls.css';

export interface CheckboxProps extends Omit<ComponentPropsWithRef<'input'>, 'type' | 'onChange' | 'checked'> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  /** Mixed state, for example a "select all" with partial selection. */
  indeterminate?: boolean;
}

export function Checkbox({ checked, onCheckedChange, label, indeterminate, className, id, ...rest }: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label htmlFor={inputId} className={cx('ui-check', className)}>
      <input
        id={inputId}
        type="checkbox"
        className="ui-check__input"
        checked={checked}
        ref={(node) => {
          if (node) node.indeterminate = Boolean(indeterminate);
        }}
        onChange={(event) => onCheckedChange(event.target.checked)}
        {...rest}
      />
      <span className="ui-check__box" aria-hidden="true">
        <Icon name={indeterminate ? 'minus' : 'check'} strokeWidth={3} />
      </span>
      <span className="ui-check__label">{label}</span>
    </label>
  );
}

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function Switch({ checked, onCheckedChange, label, description, disabled, id, className }: SwitchProps) {
  const autoId = useId();
  const switchId = id ?? autoId;
  return (
    <div className={cx('ui-switch', className)}>
      <div className="ui-switch__text">
        <label htmlFor={switchId} className="ui-switch__label">
          {label}
        </label>
        {description ? (
          <p id={`${switchId}-desc`} className="ui-switch__desc">
            {description}
          </p>
        ) : null}
      </div>
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${switchId}-desc` : undefined}
        disabled={disabled}
        className="ui-switch__track"
        onClick={() => onCheckedChange(!checked)}
      >
        <span className="ui-switch__thumb" />
      </button>
    </div>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  /** Accessible name for the group. */
  label: string;
  size?: 'sm' | 'md';
  /** Show only icons (labels remain as accessible names). */
  iconOnly?: boolean;
  className?: string;
}

/** Single-choice radio group rendered as a pill toggle. Arrow keys move the selection. */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  label,
  size = 'md',
  iconOnly = false,
  className,
}: SegmentedControlProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null);

  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    if (!forward && !backward) return;
    event.preventDefault();
    const index = options.findIndex((option) => option.value === value);
    const next = options[(index + (forward ? 1 : -1) + options.length) % options.length];
    if (!next) return;
    onValueChange(next.value);
    const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[options.indexOf(next)]?.focus();
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={label}
      className={cx('ui-seg', `ui-seg--${size}`, className)}
      onKeyDown={handleKey}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={iconOnly ? option.label : undefined}
            title={iconOnly ? option.label : undefined}
            tabIndex={selected ? 0 : -1}
            className={cx('ui-seg__item', selected && 'is-selected')}
            onClick={() => onValueChange(option.value)}
          >
            {option.icon ? <Icon name={option.icon} /> : null}
            {iconOnly ? null : <span>{option.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
