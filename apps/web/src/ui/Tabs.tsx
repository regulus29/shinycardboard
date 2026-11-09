import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';
import './surfaces.css';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  /** Optional count shown in a small pill. */
  count?: number;
  /** Panel content; omit to use Tabs purely as a switcher and render content yourself. */
  content?: ReactNode;
}

export interface TabsProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  items: readonly TabItem<T>[];
  label: string;
  className?: string;
}

/** Accessible tab list with roving focus (arrow keys, Home, End). */
export function Tabs<T extends string>({ value, onValueChange, items, label, className }: TabsProps<T>) {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex((item) => item.value === value);
    const moves: Record<string, number> = {
      ArrowRight: (index + 1) % items.length,
      ArrowLeft: (index - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const next = items[target];
    if (!next) return;
    onValueChange(next.value);
    listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[target]?.focus();
  };

  const active = items.find((item) => item.value === value);

  return (
    <div className={cx('ui-tabs', className)}>
      <div ref={listRef} role="tablist" aria-label={label} className="ui-tabs__list" onKeyDown={onKeyDown}>
        {items.map((item) => {
          const selected = item.value === value;
          return (
            <button
              key={item.value}
              id={`${baseId}-tab-${item.value}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.value}`}
              tabIndex={selected ? 0 : -1}
              className={cx('ui-tabs__tab', selected && 'is-selected')}
              onClick={() => onValueChange(item.value)}
            >
              {item.icon ? <Icon name={item.icon} /> : null}
              {item.label}
              {item.count !== undefined ? <span className="ui-tabs__count">{item.count}</span> : null}
            </button>
          );
        })}
      </div>
      {active?.content !== undefined ? (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${active.value}`}
          aria-labelledby={`${baseId}-tab-${active.value}`}
          tabIndex={0}
          className="ui-tabs__panel"
        >
          {active.content}
        </div>
      ) : null}
    </div>
  );
}
