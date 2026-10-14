import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { cx } from './utils';

export interface KpiDelta {
  /** Formatted change, e.g. „+9,2 %“ or „−0,3 p. b.“. */
  value: string;
  direction: 'up' | 'down' | 'flat';
  /** Whether this change is good news (colours it success vs danger). */
  good: boolean;
}

export interface KpiTileProps {
  label: ReactNode;
  /** Formatted value, e.g. „412 300 Kč“. Rendered with tabular numerals. */
  value: ReactNode;
  delta?: KpiDelta;
  /** Muted text after the delta („vs. srpen“) or on its own line. */
  hint?: ReactNode;
  icon?: IconName;
  /** Extra content under the value, e.g. a <Progress target={85} />. */
  children?: ReactNode;
  className?: string;
}

/** Stats tile: 11 px label, 26 px value, coloured delta with arrow. */
export function KpiTile({ label, value, delta, hint, icon, children, className }: KpiTileProps) {
  return (
    <div className={cx('kpi', className)}>
      <div className="kpi__head">
        {icon && <Icon name={icon} size={14} className="kpi__icon" />}
        <span className="kpi__label">{label}</span>
      </div>
      <span className="kpi__value">{value}</span>
      {delta ? (
        <span
          className={cx(
            'kpi__delta',
            delta.direction === 'flat' ? 'kpi__delta--flat' : delta.good ? 'kpi__delta--good' : 'kpi__delta--bad',
          )}
        >
          {delta.direction !== 'flat' && (
            <Icon name={delta.direction === 'up' ? 'arrowUpRight' : 'arrowDownRight'} size={14} />
          )}
          {delta.value}
          <span className="visually-hidden">{delta.good ? ' (zlepšení)' : ' (zhoršení)'}</span>
          {hint != null && <span className="kpi__delta-hint">{hint}</span>}
        </span>
      ) : (
        hint != null && <span className="kpi__hint">{hint}</span>
      )}
      {children}
    </div>
  );
}
