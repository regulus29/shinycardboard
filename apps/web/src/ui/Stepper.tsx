import { cx } from './cx';
import { MAX_OWNED_QUANTITY } from '../config/constants';
import { IconButton } from './Button';
import './controls.css';

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  /** Accessible name, for example "Quantity of Vi (normal)". */
  label: string;
  min?: number;
  max?: number;
  step?: number;
  size?: 'sm' | 'md';
  className?: string;
}

/** Quantity stepper: minus, live value, plus. Values clamp to [min, max]; max defaults to MAX_OWNED_QUANTITY. */
export function Stepper({ value, onChange, label, min = 0, max = MAX_OWNED_QUANTITY, step = 1, size = 'md', className }: StepperProps) {
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)));
  return (
    <div role="group" aria-label={label} className={cx('ui-stepper', `ui-stepper--${size}`, className)}>
      <IconButton icon="minus" label="Decrease" size={size} disabled={value <= min} onClick={() => set(value - step)} />
      <output className="ui-stepper__value" aria-live="polite" aria-label={`${label}: ${value}`}>
        {value}
      </output>
      <IconButton icon="plus" label="Increase" size={size} disabled={value >= max} onClick={() => set(value + step)} />
    </div>
  );
}
