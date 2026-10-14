import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { IconButton } from './IconButton';
import { Portal } from './overlay';
import { cx } from './utils';

export type ToastTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface ToastOptions {
  tone?: ToastTone;
  description?: ReactNode;
  /** Milliseconds before auto-dismiss. Default 4000; 0 keeps it until closed. */
  duration?: number;
  /** One inline action, e.g. „Vrátit zpět“. */
  action?: { label: string; onClick: () => void };
}

interface ToastRecord {
  id: string;
  message: ReactNode;
  tone: ToastTone;
  duration: number;
  description?: ReactNode;
  action?: ToastOptions['action'];
}

const MAX_VISIBLE = 4;
let records: ToastRecord[] = [];
let counter = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return records;
}

function show(message: ReactNode, options: ToastOptions = {}): string {
  counter += 1;
  const id = `toast-${counter}`;
  records = [
    ...records,
    {
      id,
      message,
      tone: options.tone ?? 'neutral',
      duration: options.duration ?? 4000,
      description: options.description,
      action: options.action,
    },
  ].slice(-MAX_VISIBLE);
  emit();
  return id;
}

function dismiss(id?: string) {
  records = id ? records.filter((record) => record.id !== id) : [];
  emit();
}

/**
 * Imperative notifications: `toast('Uloženo', { tone: 'success' })`.
 * Shortcuts: toast.success / toast.error / toast.warning / toast.info, toast.dismiss(id?).
 * Requires one <Toaster /> mounted near the app root.
 */
export const toast = Object.assign(show, {
  dismiss,
  success: (message: ReactNode, options?: Omit<ToastOptions, 'tone'>) => show(message, { ...options, tone: 'success' }),
  error: (message: ReactNode, options?: Omit<ToastOptions, 'tone'>) => show(message, { ...options, tone: 'danger' }),
  warning: (message: ReactNode, options?: Omit<ToastOptions, 'tone'>) => show(message, { ...options, tone: 'warning' }),
  info: (message: ReactNode, options?: Omit<ToastOptions, 'tone'>) => show(message, { ...options, tone: 'info' }),
});

const TONE_ICON: Record<ToastTone, IconName | null> = {
  neutral: null,
  success: 'checkCircle',
  warning: 'alert',
  danger: 'xCircle',
  info: 'info',
};

function ToastView({ record }: { record: ToastRecord }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || record.duration <= 0) return;
    const timer = window.setTimeout(() => dismiss(record.id), record.duration);
    return () => window.clearTimeout(timer);
  }, [paused, record.id, record.duration]);

  const icon = TONE_ICON[record.tone];
  return (
    <li
      className={cx('toast', `toast--${record.tone}`)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {icon && <Icon name={icon} size={18} className="toast__icon" />}
      <div className="toast__body">
        <span className="toast__title">{record.message}</span>
        {record.description != null && <span className="toast__description">{record.description}</span>}
        {record.action && (
          <button
            type="button"
            className="link toast__action"
            onClick={() => {
              record.action?.onClick();
              dismiss(record.id);
            }}
          >
            {record.action.label}
          </button>
        )}
      </div>
      <IconButton icon="x" label="Zavřít oznámení" size="sm" tooltip={false} onClick={() => dismiss(record.id)} />
    </li>
  );
}

/** Mount once (e.g. next to <AppShell>). Polite live region, bottom-right (bottom on phones). */
export function Toaster({ label = 'Oznámení' }: { label?: string }) {
  const items = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return (
    <Portal>
      <section className="toaster" aria-label={label}>
        <ol className="toaster__list" aria-live="polite" aria-relevant="additions text">
          {items.map((record) => (
            <ToastView key={record.id} record={record} />
          ))}
        </ol>
      </section>
    </Portal>
  );
}
