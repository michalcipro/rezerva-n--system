import type { Booking } from '../../domain/types';
import { formatMoney } from '../../engine/format';
import { dateOf } from '../../engine/time';
import { visitPaymentInfo, VISIT_SOURCE_TONE, type VisitPaymentInfo, type VisitSource } from '../../engine/visits';
import { useClinic, useNow } from '../../store/hooks';
import { Badge, cx, type DotShape } from '../../ui';
import './payments.css';

export interface VisitSourceBadgeProps {
  /** Hotový výsledek `visitPaymentInfo` (v seznamech, kde už je spočítaný)… */
  info?: VisitPaymentInfo;
  /**
   * …nebo rezervace – zdroj platby se spočítá. Předaná spolu s `info` rozhodne jen o tónu: nezaplacený
   * plánovaný termín (platba na místě) je neutrální, červeně jen nezaplacený vstup po termínu.
   */
  booking?: Booking;
  /** Vedle štítku i detail („Koučink 10× · vstup 3 z 10“). Jinak je detail v popisku (tooltip). */
  showDetail?: boolean;
  /** Částka za detailem. */
  showAmount?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/** Tvar tečky – zdroj se nerozlišuje jen barvou (vedle je vždy text štítku). */
const DOT: Record<VisitSource, DotShape> = {
  package: 'circle',
  credit: 'circle',
  single: 'circle',
  makeup: 'circle',
  free: 'circle',
  qr_pending: 'ring',
  unpaid: 'square',
};

/** Štítek zdroje platby vstupu: Permanentka · Kredit · Jednorázově · Čeká na QR platbu · Nezaplaceno · Náhrada · Zdarma. */
export function VisitSourceBadge({ info, booking, showDetail, showAmount, size = 'sm', className }: VisitSourceBadgeProps): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const i = info ?? (booking ? visitPaymentInfo(clinic, booking, dateOf(now)) : null);
  if (!i) return null;
  const tone = i.source === 'unpaid' && booking?.status === 'confirmed' ? 'neutral' : VISIT_SOURCE_TONE[i.source];
  return (
    <span className={cx('pay-source', className)}>
      <Badge tone={tone} size={size} dot={DOT[i.source]} title={showDetail ? undefined : i.detail}>
        {i.label}
      </Badge>
      {showDetail && i.detail && <span className="pay-source__detail">{i.detail}</span>}
      {showAmount && i.amount > 0 && <span className="pay-source__amount tnum">{formatMoney(i.amount)}</span>}
    </span>
  );
}
