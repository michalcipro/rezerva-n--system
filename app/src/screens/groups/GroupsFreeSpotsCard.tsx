import { useMemo } from 'react';
import { countLabel, formatTime } from '../../engine/format';
import { groupSessionsOverview, type GroupSessionOverview } from '../../engine/groups';
import { addDays, dateOf } from '../../engine/time';
import { useClinic, useNow } from '../../store/hooks';
import { navigate } from '../../store/session';
import { Card, CardHeader, Icon, cx } from '../../ui';
import { prepareFocus } from './model';
import { SpotsMeter, WaitlistBadge } from './parts';
import './groups.css';

export interface GroupsFreeSpotsCardProps {
  /** Nejvýš tolik řádků (výchozí 6). */
  limit?: number;
  className?: string;
}

/**
 * Karta na přehled: volná místa na dnešních a zítřejších skupinových lekcích, které ještě nezačaly.
 * Klik na lekci otevře obrazovku Skupinové lekce na jejím týdnu a lekci zvýrazní.
 */
export function GroupsFreeSpotsCard({ limit = 6, className }: GroupsFreeSpotsCardProps = {}): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const today = dateOf(now);

  const rows = useMemo(() => groupSessionsOverview(clinic, today, addDays(today, 2), {}, now), [clinic, today, now]);
  const shown = rows.slice(0, Math.max(1, limit));
  const hidden = rows.length - shown.length;
  const free = rows.reduce((sum, r) => sum + r.free, 0);
  const days = [
    { date: today, label: 'Dnes', rows: shown.filter((r) => dateOf(r.session.start) === today) },
    { date: addDays(today, 1), label: 'Zítra', rows: shown.filter((r) => dateOf(r.session.start) !== today) },
  ].filter((d) => d.rows.length > 0);

  const open = (r: GroupSessionOverview): void => {
    prepareFocus(r.session.id, r.session.start, today);
    navigate({ name: 'skupiny' });
  };

  return (
    <Card as="section" aria-label="Volná místa ve skupinách" className={cx('grp-card', className)}>
      <CardHeader
        title="Volná místa ve skupinách"
        subtitle="Lekce dnes a zítra"
        meta={rows.length > 0 ? (free > 0 ? countLabel(free, ['volné místo', 'volná místa', 'volných míst']) : 'vše obsazeno') : undefined}
      />
      <div className="grp-card__body">
        {rows.length === 0 ? (
          <p className="grp-card__empty">Dnes ani zítra už žádná skupinová lekce není. Rozvrh na další dny najdete ve Skupinových lekcích.</p>
        ) : (
          days.map((d) => (
            <div key={d.date} role="group" aria-label={d.label}>
              <p className="grp-card__day" aria-hidden="true">
                {d.label}
              </p>
              <ul className="grp-mini">
                {d.rows.map((r) => (
                  <li key={r.session.id}>
                    <button type="button" className="grp-mini__row" onClick={() => open(r)}>
                      <span className="grp-mini__time">{formatTime(r.session.start)}</span>
                      <span className="grp-mini__title">{r.session.title}</span>
                      <SpotsMeter row={r} now={now} size="sm" textOnly className="grp-mini__spots" extra={<WaitlistBadge count={r.waitlist} />} />
                      <Icon name="chevronRight" size={16} className="grp-mini__chev" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
      <div className="grp-card__foot">
        <span>{hidden > 0 ? `+ ${countLabel(hidden, ['další lekce', 'další lekce', 'dalších lekcí'])}` : ''}</span>
        <button type="button" className="link" onClick={() => navigate({ name: 'skupiny' })}>
          Všechny lekce
        </button>
      </div>
    </Card>
  );
}
