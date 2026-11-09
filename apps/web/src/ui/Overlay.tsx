import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import { IconButton } from './Button';
import { useFocusTrap } from './useFocusTrap';
import { useModalLock } from './useModalLock';
import './surfaces.css';

interface OverlayBaseProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Short supporting text announced with the title. */
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Hide the visible title but keep it as the accessible name. */
  hideTitle?: boolean;
}

interface PanelProps extends OverlayBaseProps {
  panelClass: string;
}

/** Shared modal mechanics: portal, scrim, focus trap, escape, aria wiring. */
function ModalPanel({ open, onClose, title, description, children, footer, hideTitle, panelClass }: PanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const openerRef = useRef<HTMLElement | null>(null);
  // Order matters. Capture the opener before the lock makes the root inert (inert blurs the focused
  // element), and declare the lock before the trap: cleanups run in declaration order, so the root
  // is un-inerted BEFORE focus is restored to the opener.
  useEffect(() => {
    if (open) openerRef.current = document.activeElement as HTMLElement | null;
  }, [open]);
  useModalLock(open);
  useFocusTrap(panelRef, open, onClose, openerRef);

  if (!open) return null;
  return createPortal(
    <div className="ui-overlay">
      <div className="ui-overlay__scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx('ui-panel', panelClass)}
      >
        <header className={cx('ui-panel__header', hideTitle && 'sr-only')}>
          <div>
            <h2 id={titleId} className="ui-panel__title">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="ui-panel__desc">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton icon="close" label="Close" size="sm" onClick={onClose} />
        </header>
        <div className="ui-panel__body">{children}</div>
        {footer ? <footer className="ui-panel__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

export interface DialogProps extends OverlayBaseProps {
  size?: 'sm' | 'md' | 'lg';
}

/** Centered modal dialog. Use for confirmations and short forms. */
export function Dialog({ size = 'md', ...props }: DialogProps) {
  return <ModalPanel {...props} panelClass={cx('ui-dialog', `ui-dialog--${size}`)} />;
}

export interface DrawerProps extends OverlayBaseProps {
  /** Bottom sheet is the phone default; side drawers suit filters and detail panes. */
  side?: 'bottom' | 'left' | 'right';
}

/** Edge-anchored panel (a sheet on phones). Same accessibility behavior as Dialog. */
export function Drawer({ side = 'bottom', ...props }: DrawerProps) {
  return <ModalPanel {...props} panelClass={cx('ui-drawer', `ui-drawer--${side}`)} />;
}
