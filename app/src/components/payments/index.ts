/**
 * Sdílené komponenty plateb (QR Platba, zdroj platby vstupu) – docs/VSTUPY-SKUPINY-QR.md.
 * Styly: payments.css, třídy s prefixem .pay-.
 */
export { QrCode } from './QrCode';
export type { QrCodeProps } from './QrCode';
export { QrPaymentCard } from './QrPaymentCard';
export type { QrPaymentCardProps } from './QrPaymentCard';
export { QrPaymentDialog } from './QrPaymentDialog';
export type { QrPaymentDialogProps } from './QrPaymentDialog';
export { PendingPaymentsList } from './PendingPaymentsList';
export type { PendingPaymentsListProps } from './PendingPaymentsList';
export { VisitSourceBadge } from './VisitSourceBadge';
export type { VisitSourceBadgeProps } from './VisitSourceBadge';
export { copyToClipboard } from './copy';
export { QR_MARGIN, qrMatrix, qrPath } from './qrMatrix';
export type { QrMatrix } from './qrMatrix';
