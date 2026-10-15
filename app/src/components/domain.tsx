import type { Booking, Client, ClinicState, Id, Therapist, Tone } from '../domain/types';
import { formatMoney } from '../engine/format';
import { paymentLabel } from '../engine/messages';
import { getCategory, getService, getTherapist, therapistInitials, therapistName } from '../engine/selectors';
import { Avatar, Badge, StatusPill } from '../ui';
import './components.css';

/** Barevná tečka kategorie / terapeuta. */
export function ToneDot({ tone, label }: { tone: Tone; label?: string }): JSX.Element {
  return <span className={`tone-dot tone-dot--${tone}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

export function TherapistAvatar({ therapist, size = 'sm' }: { therapist: Therapist | undefined; size?: 'xs' | 'sm' | 'md' | 'lg' }): JSX.Element {
  return <Avatar initials={therapistInitials(therapist)} tone={therapist?.tone ?? 'slate'} size={size} />;
}

export function ClientAvatar({ client, size = 'sm' }: { client: Pick<Client, 'firstName' | 'lastName'> | undefined; size?: 'xs' | 'sm' | 'md' | 'lg' }): JSX.Element {
  const initials = client ? (client.firstName.charAt(0) + client.lastName.charAt(0)).toUpperCase() : '?';
  return <Avatar initials={initials} tone="slate" size={size} />;
}

/** Štítek kategorie služby (např. Koučink). */
export function CategoryBadge({ clinic, serviceId }: { clinic: ClinicState; serviceId: Id }): JSX.Element | null {
  const svc = getService(clinic, serviceId);
  const cat = svc ? getCategory(clinic, svc.categoryId) : undefined;
  if (!cat) return null;
  return (
    <Badge tone={cat.tone} size="sm">
      {cat.name}
    </Badge>
  );
}

/** Stav rezervace včetně poplatku. */
export function BookingStatusBadges({ booking }: { booking: Booking }): JSX.Element {
  return (
    <span className="bk-badges">
      <StatusPill status={booking.status} />
      {booking.fee && booking.fee.status === 'due' && <Badge tone="warning" size="sm">Poplatek {formatMoney(booking.fee.amount)} k úhradě</Badge>}
      {booking.fee && booking.fee.status === 'waived' && booking.fee.waivedReason && <Badge tone="neutral" size="sm">Poplatek odpuštěn</Badge>}
      {booking.status === 'confirmed' && booking.payment.method === 'onsite' && !booking.payment.paid && <Badge tone="neutral" size="sm">Platba na místě</Badge>}
      {booking.makeupForBookingId && <Badge tone="info" size="sm">Náhradní termín</Badge>}
      {booking.fromWaitlist && <Badge tone="accent" size="sm">Z čekací listiny</Badge>}
    </span>
  );
}

export function PaymentText({ clinic, booking }: { clinic: ClinicState; booking: Booking }): JSX.Element {
  return <span className="pay-text">{paymentLabel(clinic, booking)}</span>;
}

export function TherapistName({ clinic, id }: { clinic: ClinicState; id: Id }): JSX.Element {
  return <>{therapistName(getTherapist(clinic, id))}</>;
}
