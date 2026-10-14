import { useEffect, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  message?: ReactNode;
  /** Extra content under the message (e.g. a checkbox „Poslat klientovi e-mail“). */
  children?: ReactNode;
  confirmLabel?: string;
  /** Default „Zpět“ — never „Zrušit“, which is ambiguous next to cancelling a booking. */
  cancelLabel?: string;
  /** danger = red confirm, focus starts on the safe button. */
  tone?: 'danger' | 'primary';
  /** May return a promise: the button shows a spinner and the dialog closes when it resolves. */
  onConfirm: () => void | Promise<unknown>;
  confirmDisabled?: boolean;
}

/** In-page replacement for window.confirm (which does nothing in the host). */
export function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  children,
  confirmLabel = 'Potvrdit',
  cancelLabel = 'Zpět',
  tone = 'primary',
  onConfirm,
  confirmDisabled,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setBusy(false);
  }, [open]);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      // Caller reports the failure (e.g. via toast); keep the dialog open.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={title}
      description={message}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy} data-autofocus={tone === 'danger' ? '' : undefined}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={handleConfirm}
            loading={busy}
            disabled={confirmDisabled}
            data-autofocus={tone === 'danger' ? undefined : ''}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
