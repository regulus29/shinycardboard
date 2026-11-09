import { IconButton, Tooltip, cx } from '../../ui';
import type { AddCheck } from './deckModel';

interface QtyControlProps {
  name: string;
  count: number;
  check: AddCheck;
  onAdd: () => void;
  onRemove: () => void;
  size?: 'sm' | 'md';
  className?: string;
}

/** Add and remove buttons around a count. A blocked add stays focusable and explains why in a tooltip. */
export function QtyControl({ name, count, check, onAdd, onRemove, size = 'sm', className }: QtyControlProps) {
  const blocked = !check.ok;
  const reason = check.ok ? '' : check.reason;
  const plus = (
    <IconButton
      icon="plus"
      size={size}
      label={blocked ? `Add ${name}, unavailable: ${reason}` : `Add ${name}`}
      aria-disabled={blocked || undefined}
      className={cx(blocked && 'is-blocked')}
      onClick={blocked ? undefined : onAdd}
    />
  );
  return (
    <div role="group" aria-label={`${name} copies`} className={cx('dk-qty', className)}>
      <IconButton icon="minus" size={size} label={`Remove ${name}`} disabled={count <= 0} onClick={onRemove} />
      <output className="dk-qty__value" aria-label={`${name} count`}>
        {count}
      </output>
      <Tooltip label={blocked ? reason : 'Add one copy'}>{plus}</Tooltip>
    </div>
  );
}
