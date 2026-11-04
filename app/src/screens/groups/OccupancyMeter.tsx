import type { GroupSessionOverview } from '../../engine/groups';
import { sessionFill } from '../../engine/groups';
import { Badge, cx } from '../../ui';
import { occupancyAria, occupancyText } from './model';
import './groups.css';

export interface OccupancyMeterProps {
  booked: number;
  capacity: number;
  /** Zrušený termín – ukazatel se ztlumí a ukáže „Zrušeno“. */
  cancelled?: boolean;
  /** compact = užší varianta (widget na Přehledu). */
  compact?: boolean;
  /** Text se schová (např. když je obsazenost napsaná jinde). */
  hideText?: boolean;
  className?: string;
}

/** Nejvyšší kapacita, při které se místa kreslí jednotlivě (jinak souvislý pruh). */
const MAX_SEATS = 16;

/**
 * Ukazatel obsazenosti skupinového termínu: pruh (u menších lekcí po místech), text „7 ze 12 · 5 volných“
 * a u plného termínu výrazný štítek „Plno“. Pro čtečky role="meter" s celou větou v aria-valuetext.
 */
export function OccupancyMeter({ booked, capacity, cancelled, compact, hideText, className }: OccupancyMeterProps): JSX.Element {
  const fill: GroupSessionOverview['fill'] = sessionFill(capacity, booked);
  const ratio = capacity > 0 ? Math.min(1, Math.max(0, booked / capacity)) : 0;
  const seats = capacity > 0 && capacity <= MAX_SEATS;
  const aria = occupancyAria(booked, capacity, cancelled);
  const taken = Math.min(booked, capacity);
  return (
    <div className={cx('grp-meter', `grp-meter--${cancelled ? 'cancelled' : fill}`, compact && 'grp-meter--compact', className)}>
      <div
        className="grp-meter__bar"
        role="meter"
        aria-label="Obsazenost"
        aria-valuemin={0}
        aria-valuemax={Math.max(capacity, booked)}
        aria-valuenow={booked}
        aria-valuetext={aria}
      >
        {seats ? (
          <span className="grp-meter__seats" aria-hidden="true">
            {Array.from({ length: capacity }, (_, i) => (
              <span key={i} className={cx('grp-meter__seat', i < taken && 'is-taken')} />
            ))}
          </span>
        ) : (
          <span className="grp-meter__track" aria-hidden="true">
            <span className="grp-meter__fill" style={{ width: `${ratio * 100}%` }} />
          </span>
        )}
      </div>
      {!hideText && (
        <span className="grp-meter__text tnum" aria-hidden="true">
          {cancelled ? 'Zrušeno' : occupancyText(booked, capacity)}
          {!cancelled && fill === 'full' && (
            <Badge tone="danger" size="sm" dot="square" className="grp-meter__full">
              Plno
            </Badge>
          )}
        </span>
      )}
    </div>
  );
}
