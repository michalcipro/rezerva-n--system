import { useId, useRef, type ReactNode, type RefObject } from 'react';
import { IconButton } from './IconButton';
import { Portal, useModal } from './overlay';
import { cx } from './utils';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** sm 400 · md 520 (default) · lg 720 px max width. */
  size?: 'sm' | 'md' | 'lg';
  /** Action row (buttons). Right-aligned; stacked full-width on phones. */
  footer?: ReactNode;
  children?: ReactNode;
  /** Element to focus on open. Otherwise [data-autofocus], then the first field in the body. */
  initialFocus?: RefObject<HTMLElement>;
  /** false = Esc / backdrop / close button do nothing (forced decision). Default true. */
  dismissible?: boolean;
  className?: string;
}

/**
 * Centered modal. Renders in a portal, traps focus, restores it on close,
 * closes on Esc and backdrop press, locks page scroll. Unmounted while closed.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  children,
  initialFocus,
  dismissible = true,
  className,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const { onKeyDown, onBackdropMouseDown } = useModal(open, { panelRef, onClose, dismissible, initialFocus });

  if (!open) return null;

  return (
    <Portal>
      <div className="overlay">
        <div className="overlay__backdrop" aria-hidden="true" onMouseDown={onBackdropMouseDown} />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description != null ? descriptionId : undefined}
          tabIndex={-1}
          className={cx('dialog', size !== 'md' && `dialog--${size}`, className)}
          onKeyDown={onKeyDown}
        >
          <div className="dialog__header">
            <div className="dialog__heading">
              <h2 id={titleId} className="dialog__title">
                {title}
              </h2>
              {description != null && (
                <div id={descriptionId} className="dialog__description">
                  {description}
                </div>
              )}
            </div>
            {dismissible && <IconButton icon="x" label="Zavřít" size="sm" onClick={onClose} />}
          </div>
          {children != null && (
            <div className="dialog__body" data-overlay-body="">
              {children}
            </div>
          )}
          {footer != null && <div className="dialog__footer">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}
