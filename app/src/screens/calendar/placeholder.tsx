import type { Id, LocalDateTime } from '../../domain/types';
export function CalendarScreen(): JSX.Element { return <p>Kalendář se připravuje…</p>; }
export function NewBookingDialog(_p: { open: boolean; onClose: () => void; initial?: { clientId?: Id; serviceId?: Id; therapistId?: Id; start?: LocalDateTime; sessionId?: Id } }): JSX.Element | null { return null; }
export function BookingDrawer(_p: { bookingId: Id | null; onClose: () => void }): JSX.Element | null { return null; }
