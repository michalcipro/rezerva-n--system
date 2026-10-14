import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

/* ---------------------------------------------------------------------------
 * Portal
 * ------------------------------------------------------------------------- */
export function Portal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

/* ---------------------------------------------------------------------------
 * Overlay stack: one global Escape handler that only talks to the top layer,
 * so Esc in a menu inside a dialog closes just the menu.
 * ------------------------------------------------------------------------- */
interface StackEntry {
  id: number;
  onEscape: () => void;
}

const stack: StackEntry[] = [];
let sequence = 0;

function handleDocumentKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  const top = stack[stack.length - 1];
  if (!top) return;
  event.preventDefault();
  top.onEscape();
}

function pushLayer(onEscape: () => void): number {
  if (stack.length === 0) document.addEventListener('keydown', handleDocumentKeyDown);
  const id = ++sequence;
  stack.push({ id, onEscape });
  return id;
}

function popLayer(id: number) {
  const index = stack.findIndex((entry) => entry.id === id);
  if (index >= 0) stack.splice(index, 1);
  if (stack.length === 0) document.removeEventListener('keydown', handleDocumentKeyDown);
}

/** Registers an open layer; `onEscape` fires only while it is the top-most one. */
export function useLayer(open: boolean, onEscape: () => void) {
  const handler = useRef(onEscape);
  handler.current = onEscape;
  useEffect(() => {
    if (!open) return;
    const id = pushLayer(() => handler.current());
    return () => popLayer(id);
  }, [open]);
}

/* ---------------------------------------------------------------------------
 * Body scroll lock (reference counted)
 * ------------------------------------------------------------------------- */
let lockCount = 0;
let savedOverflow = '';
let savedPaddingRight = '';

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (lockCount === 0) {
      const body = document.body;
      const scrollbar = window.innerWidth - document.documentElement.clientWidth;
      savedOverflow = body.style.overflow;
      savedPaddingRight = body.style.paddingRight;
      body.style.overflow = 'hidden';
      if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    }
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        document.body.style.overflow = savedOverflow;
        document.body.style.paddingRight = savedPaddingRight;
      }
    };
  }, [active]);
}

/* ---------------------------------------------------------------------------
 * Focus helpers
 * ------------------------------------------------------------------------- */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

export function getFocusable(root: Element | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('inert') && el.getClientRects().length > 0,
  );
}

/** Keeps Tab / Shift+Tab inside `container`. Use as onKeyDown of the panel. */
export function trapTab(event: ReactKeyboardEvent<HTMLElement>, container: HTMLElement | null) {
  if (event.key !== 'Tab' || !container) return;
  const items = getFocusable(container);
  if (items.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === container)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

/* ---------------------------------------------------------------------------
 * Modal behaviour shared by Dialog, Drawer and the mobile nav sheet
 * ------------------------------------------------------------------------- */
export interface ModalOptions {
  panelRef: RefObject<HTMLElement>;
  onClose: () => void;
  dismissible?: boolean;
  initialFocus?: RefObject<HTMLElement>;
}

export function useModal(open: boolean, { panelRef, onClose, dismissible = true, initialFocus }: ModalOptions) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;

  useLayer(open, () => {
    if (dismissibleRef.current) closeRef.current();
  });
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      const target =
        initialFocus?.current ??
        panel.querySelector<HTMLElement>('[data-autofocus]') ??
        getFocusable(panel.querySelector('[data-overlay-body]'))[0] ??
        panel;
      target.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      if (previous && previous.isConnected) previous.focus({ preventScroll: true });
    };
    // Focus is captured once per opening; refs are stable, so `open` is the only dependency.
  }, [open]);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => trapTab(event, panelRef.current),
    [panelRef],
  );

  const onBackdropMouseDown = useCallback(() => {
    if (dismissibleRef.current) closeRef.current();
  }, []);

  return { onKeyDown, onBackdropMouseDown };
}

/* ---------------------------------------------------------------------------
 * Anchored positioning for menus and popovers (fixed, flips, clamps)
 * ------------------------------------------------------------------------- */
export type FloatingAlign = 'start' | 'end';

export interface FloatingPosition {
  top: number;
  left: number;
  maxHeight: number;
  minWidth: number;
}

export function useAnchoredPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement>,
  floatingRef: RefObject<HTMLElement>,
  align: FloatingAlign,
): FloatingPosition | null {
  const [position, setPosition] = useState<FloatingPosition | null>(null);

  const update = useCallback(() => {
    const anchor = anchorRef.current;
    const floating = floatingRef.current;
    if (!anchor || !floating) return;
    const rect = anchor.getBoundingClientRect();
    const viewportW = document.documentElement.clientWidth;
    const viewportH = window.innerHeight;
    const margin = 8;
    const gap = 4;
    const width = floating.offsetWidth;
    const height = floating.scrollHeight;
    const below = viewportH - rect.bottom - gap - margin;
    const above = rect.top - gap - margin;
    const placeBelow = height <= below || below >= above;
    const maxHeight = Math.max(120, Math.floor(placeBelow ? below : above));
    const shown = Math.min(height, maxHeight);
    const top = placeBelow ? rect.bottom + gap : rect.top - gap - shown;
    const preferred = align === 'end' ? rect.right - width : rect.left;
    const left = Math.max(margin, Math.min(preferred, viewportW - width - margin));
    const minWidth = Math.round(rect.width);
    setPosition((prev) =>
      prev && prev.top === top && prev.left === left && prev.maxHeight === maxHeight && prev.minWidth === minWidth
        ? prev
        : { top, left, maxHeight, minWidth },
    );
  }, [align, anchorRef, floatingRef]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, update]);

  return position;
}

/** Calls `onOutside` for pointer presses outside every given element. */
export function useOutsidePress(
  active: boolean,
  refs: Array<RefObject<HTMLElement>>,
  onOutside: () => void,
) {
  const handler = useRef(onOutside);
  handler.current = onOutside;
  const refsRef = useRef(refs);
  refsRef.current = refs;
  useEffect(() => {
    if (!active) return;
    const listener = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (refsRef.current.some((ref) => ref.current?.contains(target))) return;
      handler.current();
    };
    document.addEventListener('pointerdown', listener, true);
    return () => document.removeEventListener('pointerdown', listener, true);
  }, [active]);
}
