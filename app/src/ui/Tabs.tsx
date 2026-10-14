import { useRef, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './utils';

export interface TabItem<T extends string = string> {
  id: T;
  label: ReactNode;
  count?: number | string;
  disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  'aria-label'?: string;
  /** Enables tab ↔ panel wiring; pair with <TabPanel idPrefix=… id=…>. */
  idPrefix?: string;
  /** Draw a hairline under the whole tab row. */
  bordered?: boolean;
  className?: string;
}

/** Underline tabs (13 px, 2 px accent underline). Arrow keys move and activate. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  idPrefix,
  bordered,
  className,
  'aria-label': ariaLabel,
}: TabsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const enabled = items.map((item, i) => (item.disabled ? -1 : i)).filter((i) => i >= 0);
    if (enabled.length === 0) return;
    const pos = enabled.indexOf(items.findIndex((item) => item.id === value));
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = enabled[pos < 0 ? 0 : (pos + 1) % enabled.length];
        break;
      case 'ArrowLeft':
        next = enabled[pos < 0 ? 0 : (pos - 1 + enabled.length) % enabled.length];
        break;
      case 'Home':
        next = enabled[0];
        break;
      case 'End':
        next = enabled[enabled.length - 1];
        break;
      default:
        return;
    }
    event.preventDefault();
    refs.current[next]?.focus();
    onChange(items[next].id);
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cx('tabs', bordered && 'tabs--bordered', className)}
      onKeyDown={onKeyDown}
    >
      {items.map((item, i) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={idPrefix ? `${idPrefix}-tab-${item.id}` : undefined}
            aria-controls={idPrefix ? `${idPrefix}-panel-${item.id}` : undefined}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            className="tab"
            onClick={() => onChange(item.id)}
          >
            {item.label}
            {item.count != null && <span className="tab__count">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps extends HTMLAttributes<HTMLDivElement> {
  idPrefix: string;
  id: string;
}

/** Panel for the tab with the same `id`; render only the active one. */
export function TabPanel({ idPrefix, id, className, children, ...rest }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${id}`}
      aria-labelledby={`${idPrefix}-tab-${id}`}
      tabIndex={0}
      className={cx('tabpanel', className)}
      {...rest}
    >
      {children}
    </div>
  );
}
