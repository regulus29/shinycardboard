import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';
import './surfaces.css';

const TOOLTIP_DELAY_MS = 450;

export interface TriggerApi {
  open: boolean;
  /** Spread onto the trigger element. */
  props: {
    'aria-haspopup': 'menu' | 'dialog';
    'aria-expanded': boolean;
    'aria-controls': string;
    onClick: () => void;
  };
}

interface PopoverProps {
  trigger: (api: TriggerApi) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'start' | 'end';
  /** Accessible name of the panel. */
  label: string;
  role?: 'menu' | 'dialog';
  className?: string;
  /** Called after the panel opens so menus can move focus. */
  onOpened?: (panel: HTMLElement) => void;
}

/** Anchored floating panel that closes on outside click and Escape, restoring trigger focus. */
export function Popover({ trigger, children, align = 'start', label, role = 'dialog', className, onOpened }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) rootRef.current?.querySelector<HTMLElement>('[aria-haspopup]')?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    if (panelRef.current) onOpened?.(panelRef.current);
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close, onOpened]);

  const api: TriggerApi = {
    open,
    props: {
      'aria-haspopup': role,
      'aria-expanded': open,
      'aria-controls': panelId,
      onClick: () => setOpen((value) => !value),
    },
  };

  return (
    <div ref={rootRef} className="ui-popover">
      {trigger(api)}
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role={role}
          aria-label={label}
          className={cx('ui-popover__panel', align === 'end' && 'is-end', className)}
        >
          {typeof children === 'function' ? children(() => close(true)) : children}
        </div>
      ) : null}
    </div>
  );
}

export interface MenuItem {
  label: string;
  icon?: IconName;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export interface MenuProps {
  trigger: (api: TriggerApi) => ReactNode;
  items: readonly MenuItem[];
  label: string;
  align?: 'start' | 'end';
}

/** Action menu with roving arrow-key navigation. */
export function Menu({ trigger, items, label, align = 'start' }: MenuProps) {
  const focusFirst = useCallback((panel: HTMLElement) => {
    panel.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'));
    if (nodes.length === 0) return;
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    const targets: Record<string, number> = {
      ArrowDown: (index + 1) % nodes.length,
      ArrowUp: (index - 1 + nodes.length) % nodes.length,
      Home: 0,
      End: nodes.length - 1,
    };
    nodes[targets[event.key] ?? 0]?.focus();
  };

  return (
    <Popover trigger={trigger} label={label} role="menu" align={align} onOpened={focusFirst}>
      {(close) => (
        <div className="ui-menu" onKeyDown={onKeyDown}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={cx('ui-menu__item', item.danger && 'is-danger')}
              onClick={() => {
                close();
                item.onSelect();
              }}
            >
              {item.icon ? <Icon name={item.icon} /> : null}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

export interface TooltipProps {
  label: string;
  /** A single focusable element. */
  children: ReactElement<{ 'aria-describedby'?: string }>;
  side?: 'top' | 'bottom';
}

/** Hover and focus tooltip. For icon-only controls prefer an aria-label; this adds the visual hint. */
export function Tooltip({ label, children, side = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tipId = useId();

  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(true), TOOLTIP_DELAY_MS);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setVisible(false);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <span
      className="ui-tooltip-wrap"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(event) => event.key === 'Escape' && hide()}
    >
      {cloneElement(children, { 'aria-describedby': visible ? tipId : undefined })}
      {visible ? (
        <span id={tipId} role="tooltip" className={cx('ui-tooltip', `ui-tooltip--${side}`)}>
          {label}
        </span>
      ) : null}
    </span>
  );
}
