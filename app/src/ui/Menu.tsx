import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { Icon, type IconName } from './Icon';
import {
  Portal,
  getFocusable,
  useAnchoredPosition,
  useLayer,
  useOutsidePress,
  type FloatingAlign,
} from './overlay';
import { cx, mergeRefs } from './utils';

export interface MenuAction {
  id: string;
  label: string;
  icon?: IconName;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Right-aligned hint, e.g. a shortcut. */
  hint?: string;
}

export type MenuEntry = MenuAction | { type: 'separator'; id?: string } | { type: 'label'; label: string; id?: string };

interface TriggerProps {
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
}

function triggerRefOf(trigger: ReactElement): Ref<HTMLElement> | undefined {
  return (trigger as unknown as { ref?: Ref<HTMLElement> }).ref;
}

function isAction(entry: MenuEntry): entry is MenuAction {
  return !('type' in entry);
}

export interface MenuProps {
  /** The button that opens the menu, e.g. <IconButton icon="more" label="Další akce" />. */
  trigger: ReactElement;
  items: MenuEntry[];
  /** Align the menu's start or end edge with the trigger. Default end. */
  align?: FloatingAlign;
  /** Accessible name of the menu. */
  label?: string;
  className?: string;
}

/**
 * Action menu anchored to a trigger. Arrow keys / Home / End / typeahead move
 * focus, Enter or Space activates, Esc closes and returns focus, Tab closes.
 */
export function Menu({ trigger, items, align = 'end', label, className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusTarget = useRef<'first' | 'last'>('first');
  const typeahead = useRef({ text: '', at: 0 });
  const menuId = useId();
  const position = useAnchoredPosition(open, anchorRef, menuRef, align);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) anchorRef.current?.focus();
  }, []);

  useLayer(open, () => close(true));
  useOutsidePress(open, [anchorRef, menuRef], () => close(false));

  const enabledIndexes = () =>
    items.map((entry, i) => (isAction(entry) && !entry.disabled ? i : -1)).filter((i) => i >= 0);

  const ready = position !== null;
  useEffect(() => {
    if (!open || !ready) return;
    const enabled = enabledIndexes();
    if (enabled.length === 0) {
      menuRef.current?.focus();
      return;
    }
    const index = focusTarget.current === 'last' ? enabled[enabled.length - 1] : enabled[0];
    itemRefs.current[index]?.focus({ preventScroll: true });
    // Runs once per opening, after the menu has been positioned.
  }, [open, ready]);

  const moveFocus = (delta: 1 | -1 | 'first' | 'last') => {
    const enabled = enabledIndexes();
    if (enabled.length === 0) return;
    const current = enabled.indexOf(itemRefs.current.findIndex((el) => el === document.activeElement));
    let next: number;
    if (delta === 'first') next = 0;
    else if (delta === 'last') next = enabled.length - 1;
    else next = current < 0 ? 0 : (current + delta + enabled.length) % enabled.length;
    itemRefs.current[enabled[next]]?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveFocus(1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        moveFocus(-1);
        return;
      case 'Home':
        event.preventDefault();
        moveFocus('first');
        return;
      case 'End':
        event.preventDefault();
        moveFocus('last');
        return;
      case 'Tab':
        // Return to the trigger instead of letting focus escape from the portal.
        event.preventDefault();
        close(true);
        return;
      default:
        break;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      const state = typeahead.current;
      state.text = now - state.at > 600 ? event.key.toLocaleLowerCase('cs') : state.text + event.key.toLocaleLowerCase('cs');
      state.at = now;
      const match = items.findIndex(
        (entry) => isAction(entry) && !entry.disabled && entry.label.toLocaleLowerCase('cs').startsWith(state.text),
      );
      if (match >= 0) itemRefs.current[match]?.focus();
    }
  };

  const original = trigger.props as TriggerProps;
  const triggerElement = cloneElement(trigger, {
    ref: mergeRefs(anchorRef, triggerRefOf(trigger)),
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: (event: MouseEvent<HTMLElement>) => {
      original.onClick?.(event);
      if (event.defaultPrevented) return;
      focusTarget.current = 'first';
      setOpen((value) => !value);
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      original.onKeyDown?.(event);
      if (event.defaultPrevented) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        focusTarget.current = event.key === 'ArrowUp' ? 'last' : 'first';
        setOpen(true);
      }
    },
  });

  return (
    <>
      {triggerElement}
      {open && (
        <Portal>
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            className={cx('floating', 'menu', className)}
            style={
              position
                ? { top: position.top, left: position.left, maxHeight: position.maxHeight }
                : { top: 0, left: 0, visibility: 'hidden' }
            }
            onKeyDown={onMenuKeyDown}
          >
            {items.map((entry, i) => {
              if (!isAction(entry)) {
                return entry.type === 'separator' ? (
                  <div key={entry.id ?? `sep-${i}`} role="separator" className="menu__separator" />
                ) : (
                  <div key={entry.id ?? `label-${i}`} role="presentation" className="menu__label">
                    {entry.label}
                  </div>
                );
              }
              return (
                <button
                  key={entry.id}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  disabled={entry.disabled}
                  className={cx('menu__item', entry.danger && 'menu__item--danger')}
                  onClick={() => {
                    close(true);
                    entry.onSelect?.();
                  }}
                >
                  {entry.icon && <Icon name={entry.icon} size={16} />}
                  <span className="menu__item-label">{entry.label}</span>
                  {entry.hint && <span className="menu__item-hint">{entry.hint}</span>}
                </button>
              );
            })}
          </div>
        </Portal>
      )}
    </>
  );
}

export interface PopoverProps {
  trigger: ReactElement;
  /** Content, or a render function receiving `close`. */
  children: ReactNode | ((close: () => void) => ReactNode);
  /** Accessible name of the popover panel. */
  label: string;
  align?: FloatingAlign;
  /** Fixed panel width in px (default: content width, at least the trigger width). */
  width?: number;
  /** Controlled mode. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

/** Non-modal panel anchored to a trigger (filters, quick forms). Esc / outside press / Tab-out close it. */
export function Popover({
  trigger,
  children,
  label,
  align = 'start',
  width,
  open: controlledOpen,
  onOpenChange,
  className,
}: PopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const anchorRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const position = useAnchoredPosition(open, anchorRef, panelRef, align);

  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );

  const close = useCallback(
    (returnFocus = true) => {
      setOpen(false);
      if (returnFocus) anchorRef.current?.focus();
    },
    [setOpen],
  );

  useLayer(open, () => close(true));
  useOutsidePress(open, [anchorRef, panelRef], () => close(false));

  const ready = position !== null;
  useEffect(() => {
    if (!open || !ready) return;
    const panel = panelRef.current;
    if (!panel) return;
    const target = panel.querySelector<HTMLElement>('[data-autofocus]') ?? getFocusable(panel)[0] ?? panel;
    target.focus({ preventScroll: true });
  }, [open, ready]);

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && !panelRef.current?.contains(next) && !anchorRef.current?.contains(next)) close(false);
  };

  const original = trigger.props as TriggerProps;
  const triggerElement = cloneElement(trigger, {
    ref: mergeRefs(anchorRef, triggerRefOf(trigger)),
    'aria-haspopup': 'dialog',
    'aria-expanded': open,
    'aria-controls': open ? panelId : undefined,
    onClick: (event: MouseEvent<HTMLElement>) => {
      original.onClick?.(event);
      if (!event.defaultPrevented) setOpen(!open);
    },
  });

  return (
    <>
      {triggerElement}
      {open && (
        <Portal>
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label={label}
            tabIndex={-1}
            className={cx('floating', 'popover', className)}
            style={
              position
                ? { top: position.top, left: position.left, maxHeight: position.maxHeight, width, minWidth: position.minWidth }
                : { top: 0, left: 0, width, visibility: 'hidden' }
            }
            onBlur={onBlur}
          >
            {typeof children === 'function' ? children(() => close(true)) : children}
          </div>
        </Portal>
      )}
    </>
  );
}
