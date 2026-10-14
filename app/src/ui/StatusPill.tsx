import type { BookingStatus } from '../domain/types';
import { Badge, type BadgeProps, type BadgeTone, type DotShape } from './Badge';

export interface BookingStatusMeta {
  label: string;
  tone: BadgeTone;
  shape: DotShape;
}

/** Czech label + visual tone for every booking status (shape never relies on colour alone). */
export const BOOKING_STATUS_META: Record<BookingStatus, BookingStatusMeta> = {
  confirmed: { label: 'Potvrzeno', tone: 'success', shape: 'circle' },
  completed: { label: 'Proběhlo', tone: 'neutral', shape: 'circle' },
  no_show: { label: 'Nedostavil/a se', tone: 'danger', shape: 'square' },
  cancelled: { label: 'Zrušeno', tone: 'neutral', shape: 'ring' },
  late_cancelled: { label: 'Pozdní storno', tone: 'warning', shape: 'square' },
  excused: { label: 'Omluveno', tone: 'accent', shape: 'ring' },
  clinic_cancelled: { label: 'Zrušeno klinikou', tone: 'info', shape: 'ring' },
};

export interface StatusPillProps extends Omit<BadgeProps, 'tone' | 'dot' | 'children' | 'plain'> {
  status: BookingStatus;
  /** Override the default label, e.g. gendered „Nedostavila se“. */
  label?: string;
  /** pill = soft background (default) · plain = dot + text only. */
  appearance?: 'pill' | 'plain';
}

export function StatusPill({ status, label, appearance = 'pill', ...rest }: StatusPillProps) {
  const meta = BOOKING_STATUS_META[status];
  return (
    <Badge tone={meta.tone} dot={meta.shape} plain={appearance === 'plain'} {...rest}>
      {label ?? meta.label}
    </Badge>
  );
}
