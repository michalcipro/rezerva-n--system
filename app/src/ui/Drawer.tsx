import { useId, useRef, type ReactNode, type RefObject } from 'react';
import { IconButton } from './IconButton';
import { Portal, useModal } from './overlay';
import { cx } from './utils';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Shown as the 11 px uppercase header label („Vybraná rezervace“). */
  title: ReactNode;
  description?: ReactNode;
  /** Width: sm 340 (default, as in the design) · md 420 · lg 560. */
  size?: 'sm' | 'md' | 'lg';
  /** Sticky action area at the bottom. */
  footer?: ReactNode;
  children?: ReactNode;
  /** Extra header buttons left of the close button (e.g. a <Menu>). */
  headerActions?: ReactNode;
  /** right (default) becomes a bottom sheet on phones · left stays a side sheet. */
  side?: 'right' | 'left';
  /** Remove body padding (full-bleed sections). */
  flush?: boolean;
  initialFocus?: RefObject<HTMLElement>;
  dismissible?: boolean;
  className?: string;
}

/** Side panel over the page; on phones (≤ 640 px) a right drawer turns into a bottom sheet. */
export function Drawer({
  open,
  onClose,
  title,
  description,
  size = 'sm',
  footer,
  children,
  headerActions,
  side = 'right',
  flush,
  initialFocus,
  dismissible = true,
  className,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const { onKeyDown, onBackdropMouseDown } = useModal(open, { panelRef, onClose, dismissible, initialFocus });

  if (!open) return null;

  return (
    <Portal>
      <div className={cx('overlay', 'overlay--drawer', side === 'left' && 'overlay--left')}>
        <div className="overlay__backdrop" aria-hidden="true" onMouseDown={onBackdropMouseDown} />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description != null ? descriptionId : undefined}
          tabIndex={-1}
          className={cx('drawer', size !== 'sm' && `drawer--${size}`, side === 'left' && 'drawer--left', className)}
          onKeyDown={onKeyDown}
        >
          <div className="drawer__handle" aria-hidden="true" />
          <div className="drawer__header">
            <h2 id={titleId} className="drawer__title">
              {title}
            </h2>
            {headerActions}
            {dismissible && <IconButton icon="x" label="Zavřít" size="sm" onClick={onClose} />}
          </div>
          <div className={cx('drawer__body', flush && 'drawer__body--flush')} data-overlay-body="">
            {description != null && (
              <div id={descriptionId} className="drawer__description">
                {description}
              </div>
            )}
            {children}
          </div>
          {footer != null && <div className="drawer__footer">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}
