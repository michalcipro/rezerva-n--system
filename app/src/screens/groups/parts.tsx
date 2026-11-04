import type { ReactNode } from 'react';
import type { LocalDateTime } from '../../domain/types';
import type { GroupSessionOverview } from '../../engine/groups';
import { Badge, Progress, cx, type ProgressTone } from '../../ui';
import { spotsStatus, waitingLabel, waitingSpoken, type SpotsTone } from './model';
import './groups.css';

const METER_TONE: Record<SpotsTone, ProgressTone> = {
  free: 'accent',
  almost: 'warning',
  full: 'danger',
  past: 'neutral',
  cancelled: 'neutral',
};

/** Do kolika míst kreslit jednotlivá „sedadla“ (nad tím souvislý pruh). */
const MAX_SEGMENTS = 24;

export interface SpotsMeterProps {
  row: GroupSessionOverview;
  now: LocalDateTime;
  /** sm = kompaktní (karta na přehledu) · md = obrazovka a detail. */
  size?: 'sm' | 'md';
  /** Bez pruhu, jen text („7 ze 12 · 5 volných“). */
  textOnly?: boolean;
  /** Za textem na stejném řádku (např. štítek čekací listiny). */
  extra?: ReactNode;
  className?: string;
}

/** Obsazenost termínu: pruh po místech + „7 ze 12 · 5 volných“ / „Poslední 2 místa“ / „Plno“. */
export function SpotsMeter({ row, now, size = 'md', textOnly, extra, className }: SpotsMeterProps): JSX.Element {
  const st = spotsStatus(row, now);
  if (row.cancelled) {
    return (
      <span className={cx('grp-spots', 'grp-spots--cancelled', `grp-spots--${size}`, className)}>
        <span className="grp-spots__line">
          <Badge tone="danger" dot="ring" size={size === 'sm' ? 'sm' : 'md'}>
            Zrušeno
          </Badge>
          {extra}
        </span>
      </span>
    );
  }
  return (
    <span className={cx('grp-spots', `grp-spots--${st.tone}`, `grp-spots--${size}`, className)}>
      {!textOnly && (
        <Progress
          aria-hidden="true"
          className="grp-spots__bar"
          value={row.booked}
          max={row.capacity}
          segments={row.capacity <= MAX_SEGMENTS ? row.capacity : undefined}
          size={size === 'sm' ? 'sm' : 'md'}
          tone={METER_TONE[st.tone]}
        />
      )}
      <span className="grp-spots__line">
        <span className="grp-spots__text">
          <span className="visually-hidden">Obsazeno </span>
          <span className="grp-spots__count">{st.count}</span>
          <span className="grp-spots__sep" aria-hidden="true">
            {' · '}
          </span>
          <span className="visually-hidden">, </span>
          <span className="grp-spots__status">{st.status}</span>
        </span>
        {extra}
      </span>
    </span>
  );
}

/** Štítek čekací listiny „Čekají 3“. */
export function WaitlistBadge({ count, size = 'sm' }: { count: number; size?: 'sm' | 'md' }): JSX.Element | null {
  if (count <= 0) return null;
  return (
    <Badge tone="info" size={size} icon="hourglass" className="grp-wait">
      {waitingLabel(count)}
      <span className="visually-hidden">{waitingSpoken(count)}</span>
    </Badge>
  );
}
