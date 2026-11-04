import type { VisitKind, VisitPayState, VisitPaymentInfo } from '../../engine/visits';
import { VISIT_PAY_STATE_LABEL } from '../../engine/visits';
import { Badge, type BadgeTone, type DotShape } from '../../ui';

const KIND_TONE: Record<VisitKind, BadgeTone> = {
  package: 'accent',
  credit: 'info',
  single: 'neutral',
  makeup: 'violet',
  free: 'slate',
};

const STATE_TONE: Record<Exclude<VisitPayState, 'paid'>, { tone: BadgeTone; dot: DotShape }> = {
  onsite: { tone: 'neutral', dot: 'ring' },
  qr_pending: { tone: 'warning', dot: 'ring' },
  unpaid: { tone: 'danger', dot: 'square' },
};

export interface VisitSourceBadgeProps {
  info: VisitPaymentInfo;
  /** Zobrazit i podrobnost (název permanentky, způsob platby…). */
  withDetail?: boolean;
  /** Skrýt štítek stavu „Zaplatí na místě“ (např. v kalendáři u budoucích termínů). */
  hideOnsite?: boolean;
  className?: string;
}

/** Zdroj platby vstupu: Permanentka / Kredit / Jednorázově / Náhrada / Zdarma + stav, když není zaplaceno. */
export function VisitSourceBadge({ info, withDetail, hideOnsite, className }: VisitSourceBadgeProps): JSX.Element {
  const state = info.payState !== 'paid' && !(hideOnsite && info.payState === 'onsite') ? STATE_TONE[info.payState] : null;
  return (
    <span className={['visit-src', className].filter(Boolean).join(' ')}>
      <span className="visit-src__badges">
        <Badge tone={KIND_TONE[info.kind]} size="sm">
          {info.label}
        </Badge>
        {state && (
          <Badge tone={state.tone} size="sm" dot={state.dot} plain>
            {VISIT_PAY_STATE_LABEL[info.payState]}
          </Badge>
        )}
      </span>
      {withDetail && info.detail && <span className="visit-src__detail">{info.detail}</span>}
    </span>
  );
}
