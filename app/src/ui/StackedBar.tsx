import type { Tone } from '../domain/types';
import { cssVars, cx, formatNumber } from './utils';

export type BarTone =
  | 'accent'
  /** Hatched accent — reserved / pending. */
  | 'accent-hatched'
  /** Mid grey — used / consumed. */
  | 'neutral'
  | 'neutral-strong'
  /** Hairline grey — empty slot. */
  | 'empty'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | Tone;

export interface StackedSegment {
  value: number;
  tone: BarTone;
  /** Legend text, e.g. „využité“ → „4 využité“. */
  label: string;
}

export interface StackedBarProps {
  segments: StackedSegment[];
  /** Render one cell per unit (permanentka entries). Values must be whole numbers. */
  cells?: boolean;
  /** sm 6 · md 8 (default) · lg 14 px. */
  size?: 'sm' | 'md' | 'lg';
  /** Show the legend under the bar. Default true. */
  legend?: boolean;
  /** Accessible summary; defaults to „4 využité, 2 rezervované, 4 volné“. */
  label?: string;
  className?: string;
}

/** Proportional (or per-entry) composition bar, e.g. permanentka used / reserved / free. */
export function StackedBar({ segments, cells, size = 'md', legend = true, label, className }: StackedBarProps) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const summary = label ?? segments.map((s) => `${formatNumber(s.value)} ${s.label}`).join(', ');
  const visible = segments.filter((s) => s.value > 0);

  return (
    <div className={cx('stacked', size !== 'md' && `stacked--${size}`, className)}>
      {cells ? (
        <div
          className="stacked__cells"
          role="img"
          aria-label={summary}
          style={cssVars({ '--cells': Math.max(1, Math.round(total)) })}
        >
          {visible.flatMap((s, si) =>
            Array.from({ length: Math.round(s.value) }, (_, i) => (
              <span key={`${si}-${i}`} className={cx('stacked__cell', `seg--${s.tone}`)} />
            )),
          )}
        </div>
      ) : (
        <div className="stacked__bar" role="img" aria-label={summary}>
          {visible.map((s, i) => (
            <span
              key={i}
              className={cx('stacked__seg', `seg--${s.tone}`)}
              style={{ flex: `${s.value} 1 0` }}
            />
          ))}
        </div>
      )}
      {legend && (
        <div className="stacked__legend" aria-hidden="true">
          {segments.map((s, i) => (
            <span key={i} className="stacked__legend-item">
              <span className={cx('stacked__swatch', `seg--${s.tone}`)} />
              {formatNumber(s.value)} {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
