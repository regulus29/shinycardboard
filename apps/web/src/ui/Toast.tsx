import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';
import { IconButton, Button } from './Button';
import './surfaces.css';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds before auto dismiss. Ignored (never dismissed) for errors and toasts with an action. */
  durationMs?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastOptions {
  id: number;
}

export interface ToastApi {
  /** Show a toast; returns its id. */
  show: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const DEFAULT_DURATION_MS = 5000;
const TONE_ICON: Record<ToastTone, IconName> = { info: 'info', success: 'check', warning: 'alert', danger: 'alert' };

const ToastContext = createContext<ToastApi | null>(null);

/** Errors and actionable toasts need a human decision, so they never time out. */
export function autoDismissMs(toast: ToastOptions): number {
  if (toast.tone === 'danger' || toast.action) return 0;
  return toast.durationMs ?? DEFAULT_DURATION_MS;
}

interface ToastViewProps {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}

/** One toast with a timer that pauses while hovered or focused. */
function ToastView({ toast, onDismiss }: ToastViewProps) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(autoDismissMs(toast));

  useEffect(() => {
    if (paused || remaining.current <= 0) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => onDismiss(toast.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt;
    };
  }, [paused, toast.id, onDismiss]);

  const tone = toast.tone ?? 'info';
  return (
    <div
      className={cx('ui-toast', `ui-toast--${tone}`)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon name={TONE_ICON[tone]} className="ui-toast__icon" />
      <div className="ui-toast__text">
        <p className="ui-toast__title">{toast.title}</p>
        {toast.description ? <p className="ui-toast__desc">{toast.description}</p> : null}
      </div>
      {toast.action ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            toast.action?.onClick();
            onDismiss(toast.id);
          }}
        >
          {toast.action.label}
        </Button>
      ) : null}
      <IconButton icon="close" label="Dismiss notification" size="sm" onClick={() => onDismiss(toast.id)} />
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const show = useCallback((options: ToastOptions) => {
    const id = nextId.current++;
    setItems((current) => [...current, { ...options, id }]);
    return id;
  }, []);
  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  const polite = items.filter((item) => item.tone !== 'danger');
  const assertive = items.filter((item) => item.tone === 'danger');

  /*
   * The live regions stay mounted so screen readers register them before content arrives.
   * They are portaled to <body> so they remain operable while the app root is inert behind a modal.
   */
  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="ui-toasts">
          <div role="status" aria-live="polite" aria-label="Notifications" className="ui-toasts__region">
            {polite.map((item) => (
              <ToastView key={item.id} toast={item} onDismiss={dismiss} />
            ))}
          </div>
          <div role="alert" aria-live="assertive" aria-label="Errors" className="ui-toasts__region">
            {assertive.map((item) => (
              <ToastView key={item.id} toast={item} onDismiss={dismiss} />
            ))}
          </div>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}
