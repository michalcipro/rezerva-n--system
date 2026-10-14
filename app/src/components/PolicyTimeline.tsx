import type { LocalDateTime } from '../domain/types';
import { formatDayShort, formatTime } from '../engine/format';
import type { CancellationEvaluation } from '../engine/policy';
import { diffMinutes } from '../engine/time';
import './components.css';

/**
 * Časová osa storno podmínek: „Zdarma → 50 % → 100 %" se značkou „teď".
 * Používá recepce (detail rezervace), klient (zrušení termínu) i nastavení (náhled pravidel).
 */
export function PolicyTimeline({
  evaluation,
  now,
  start,
  showNow = true,
  title = 'Storno podmínky tohoto termínu',
}: {
  evaluation: CancellationEvaluation;
  now: LocalDateTime;
  start: LocalDateTime;
  showNow?: boolean;
  title?: string;
}): JSX.Element {
  const segs = evaluation.segments;
  const past = evaluation.phase === 'started' || evaluation.phase === 'past';
  return (
    <figure className="ptl" aria-label={title}>
      <figcaption className="ptl__caption">{title}</figcaption>
      <ol className="ptl__track">
        {segs.map((seg, i) => {
          const isCurrent = showNow && seg.current && !past;
          const isPast = now >= seg.to;
          let markerLeft: number | null = null;
          if (isCurrent) {
            const from = seg.from ?? addFallback(seg.to);
            const total = Math.max(1, diffMinutes(seg.to, from));
            const done = Math.min(total, Math.max(0, diffMinutes(now, from)));
            markerLeft = seg.from ? Math.round((done / total) * 100) : 70;
          }
          const tone = seg.feePct === 0 ? 'free' : seg.feePct < 100 ? 'partial' : 'full';
          return (
            <li key={i} className={`ptl__seg ptl__seg--${tone}${isCurrent ? ' is-current' : ''}${isPast ? ' is-past' : ''}`}>
              <span className="ptl__bar" aria-hidden="true">
                {markerLeft !== null && (
                  <span className="ptl__marker" style={{ left: `${markerLeft}%` }}>
                    <span className="ptl__marker-label">teď {formatTime(now)}</span>
                  </span>
                )}
              </span>
              <span className="ptl__label">{seg.label}</span>
              <span className="ptl__time">
                {i === segs.length - 1 ? 'do začátku' : `do ${formatDayShort(seg.to)} ${formatTime(seg.to)}`}
                {isPast && !isCurrent ? ' · uplynulo' : ''}
              </span>
            </li>
          );
        })}
        <li className={`ptl__seg ptl__seg--start${past ? ' is-current' : ''}`}>
          <span className="ptl__bar" aria-hidden="true" />
          <span className="ptl__label">Termín</span>
          <span className="ptl__time">
            {formatDayShort(start)} {formatTime(start)}
          </span>
        </li>
      </ol>
      {past && <p className="ptl__note">Termín už začal – zrušit ho nelze, recepce může zapsat docházku nebo nedostavení.</p>}
    </figure>
  );
}

function addFallback(to: LocalDateTime): LocalDateTime {
  return to;
}
