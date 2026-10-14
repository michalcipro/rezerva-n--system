import { useMemo, useState } from 'react';
import type { Id, Therapist, TimeOff } from '../../domain/types';
import { removeTimeOff } from '../../engine/commands';
import { WEEKDAY_SHORT, countLabel, formatDayShort, formatPercent } from '../../engine/format';
import { getRoom, getTherapist, therapistName } from '../../engine/selectors';
import { addDays, dateOf, startOfWeek } from '../../engine/time';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Icon,
  IconButton,
  Menu,
  PageHeader,
  PeriodNav,
  Progress,
  Segmented,
  Switch,
  Table,
} from '../../ui';
import { TherapistAvatar } from '../../components/domain';
import {
  WEEKDAYS,
  byOrder,
  cx,
  dayMinutes,
  describeRange,
  hoursLabel,
  rangesLabel,
  timeOffImpact,
  weekCapacity,
  weekMinutes,
  weekdayName,
} from './helpers';
import { ShiftBar } from './shared';
import { TherapistEditor, newTherapist, type TherapistTab } from './TherapistEditor';
import { TimeOffDialog } from './TimeOffDialog';

export function TeamScreen(): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const [edit, setEdit] = useState<{ therapist: Therapist; tab?: TherapistTab } | null>(null);
  const [timeOffFor, setTimeOffFor] = useState<{ therapistId?: Id | null } | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const therapists = useMemo(() => [...clinic.therapists].sort(byOrder), [clinic.therapists]);
  const active = therapists.filter((t) => t.active);
  const inactiveCount = therapists.length - active.length;
  const shown = showInactive ? therapists : active;
  const weekly = active.reduce((sum, t) => sum + weekMinutes(t), 0);

  const upcomingOff = useMemo(() => {
    const limit = addDays(now, 30);
    const m = new Map<Id, TimeOff[]>();
    for (const o of clinic.timeOff) {
      if (o.end <= now || o.start > limit) continue;
      const key = o.therapistId ?? '__clinic';
      m.set(key, [...(m.get(key) ?? []), o].sort((a, b) => (a.start < b.start ? -1 : 1)));
    }
    return m;
  }, [clinic.timeOff, now]);
  const serviceCount = useMemo(() => {
    const m = new Map<Id, number>();
    for (const s of clinic.services) if (s.active) for (const id of s.therapistIds) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [clinic.services]);

  return (
    <div className="page set-page">
      <PageHeader
        title="Tým a směny"
        subtitle={`${countLabel(active.length, ['aktivní terapeut', 'aktivní terapeuti', 'aktivních terapeutů'])} · ${hoursLabel(weekly)} pracovní doby týdně`}
        actions={
          <>
            <Button variant="secondary" icon="calendarX" onClick={() => setTimeOffFor({})}>
              Přidat nepřítomnost
            </Button>
            <Button variant="primary" icon="userPlus" onClick={() => setEdit({ therapist: newTherapist(clinic) })}>
              Nový terapeut
            </Button>
          </>
        }
      />

      <section className="set-stack" aria-labelledby="set-team-h">
        <div className="set-section-head">
          <h2 id="set-team-h" className="eyebrow">
            Terapeuti a pracovní doba
          </h2>
          {inactiveCount > 0 && (
            <Switch checked={showInactive} onChange={setShowInactive} label={`Zobrazit neaktivní (${inactiveCount})`} labelPosition="end" />
          )}
        </div>
        {shown.length === 0 ? (
          <Card>
            <EmptyState
              icon="users"
              title="V týmu zatím nikdo není"
              text="Přidejte terapeuty s jejich pracovní dobou – teprve pak půjde vytvářet rezervace."
              action={
                <Button variant="primary" icon="userPlus" onClick={() => setEdit({ therapist: newTherapist(clinic) })}>
                  Přidat prvního terapeuta
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="set-team-grid">
            {shown.map((t) => (
              <TherapistCard
                key={t.id}
                therapist={t}
                roomName={getRoom(clinic, t.roomId)?.name ?? 'Bez místnosti'}
                services={serviceCount.get(t.id) ?? 0}
                off={[...(upcomingOff.get(t.id) ?? []), ...(upcomingOff.get('__clinic') ?? [])]}
                onEdit={(tab) => setEdit({ therapist: t, tab })}
                onTimeOff={() => setTimeOffFor({ therapistId: t.id })}
              />
            ))}
          </div>
        )}
      </section>

      <div className="split">
        <div className="split__main">
          <CapacityCard />
        </div>
        <div className="split__aside">
          <TimeOffCard onAdd={(therapistId) => setTimeOffFor({ therapistId })} />
        </div>
      </div>

      {edit && <TherapistEditor key={edit.therapist.id || 'new'} initial={edit.therapist} initialTab={edit.tab} onClose={() => setEdit(null)} />}
      {timeOffFor && <TimeOffDialog therapistId={timeOffFor.therapistId} onClose={() => setTimeOffFor(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Karta terapeuta                                                     */
/* ------------------------------------------------------------------ */

function TherapistCard({
  therapist: t,
  roomName,
  services,
  off,
  onEdit,
  onTimeOff,
}: {
  therapist: Therapist;
  roomName: string;
  services: number;
  off: TimeOff[];
  onEdit: (tab?: TherapistTab) => void;
  onTimeOff: () => void;
}): JSX.Element {
  const headingId = `set-th-${t.id}`;
  const weekly = weekMinutes(t);
  const nextOff = [...off].sort((a, b) => (a.start < b.start ? -1 : 1))[0];
  return (
    <Card as="article" className={cx('set-person-card', !t.active && 'is-inactive')} aria-labelledby={headingId}>
      <div className="set-person-card__head">
        <TherapistAvatar therapist={t} size="md" />
        <div className="set-person-card__titles">
          <h3 id={headingId} className="set-person-card__name">
            {therapistName(t)}
          </h3>
          <span className="set-person-card__focus">{t.focus || 'Zaměření nevyplněno'}</span>
        </div>
        {!t.active && <Badge tone="neutral">Neaktivní</Badge>}
        <Menu
          label={`Akce – ${therapistName(t)}`}
          trigger={<IconButton icon="more" size="sm" label={`Další akce – ${therapistName(t)}`} />}
          items={[
            { id: 'profile', label: 'Upravit profil', icon: 'user', onSelect: () => onEdit('profile') },
            { id: 'hours', label: 'Upravit pracovní dobu', icon: 'clock', onSelect: () => onEdit('hours') },
            { id: 'services', label: 'Služby terapeuta', icon: 'briefcase', onSelect: () => onEdit('services') },
            { type: 'separator' },
            { id: 'off', label: 'Přidat nepřítomnost', icon: 'calendarX', onSelect: onTimeOff, disabled: !t.active },
          ]}
        />
      </div>

      <div className="set-person-card__meta">
        <span>
          <Icon name="pin" size={14} /> {roomName}
        </span>
        {t.email && (
          <span className="truncate">
            <Icon name="mail" size={14} /> {t.email}
          </span>
        )}
      </div>

      <div className="set-week-mini" role="list" aria-label={`Pracovní doba – ${therapistName(t)}`}>
        {WEEKDAYS.map((wd) => {
          const work = t.workingHours[wd] ?? [];
          const breaks = t.breaks[wd] ?? [];
          const minutes = dayMinutes(work, breaks);
          const label = work.length
            ? `${weekdayName(wd)}: ${rangesLabel(work)}${breaks.length ? `, pauza ${rangesLabel(breaks)}` : ''}`
            : `${weekdayName(wd)}: volno`;
          return (
            <div key={wd} className={cx('set-week-mini__row', !work.length && 'is-off')} role="listitem">
              <span className="set-week-mini__day" aria-hidden="true">
                {WEEKDAY_SHORT[wd]}
              </span>
              <ShiftBar work={work} breaks={breaks} label={label} />
              <span className="set-week-mini__h tnum" aria-hidden="true">
                {minutes ? hoursLabel(minutes) : '—'}
              </span>
            </div>
          );
        })}
        <div className="set-week-mini__axis" aria-hidden="true">
          <span>6:00</span>
          <span>12:00</span>
          <span>18:00</span>
        </div>
      </div>

      <div className="set-person-card__foot">
        <span className="statline">
          <span>
            <strong>{hoursLabel(weekly)}</strong> týdně
          </span>
          <button type="button" className="link" onClick={() => onEdit('services')}>
            {countLabel(services, ['služba', 'služby', 'služeb'])}
          </button>
        </span>
        {nextOff && (
          <Badge tone={nextOff.therapistId === null ? 'info' : 'warning'} icon="calendarX" title={nextOff.reason}>
            {nextOff.therapistId === null ? 'Zavřeno ' : ''}
            {describeRange(nextOff.start, nextOff.end).split(' · ')[0]}
          </Badge>
        )}
        <span className="spacer" />
        <Button size="sm" variant="secondary" icon="clock" onClick={() => onEdit('hours')} aria-label={`Upravit směny – ${therapistName(t)}`}>
          Upravit směny
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Týdenní kapacita                                                    */
/* ------------------------------------------------------------------ */

function CapacityCard(): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const today = dateOf(now);
  const thisWeek = startOfWeek(today);
  const [weekStart, setWeekStart] = useState(thisWeek);
  const rows = useMemo(() => weekCapacity(clinic, weekStart), [clinic, weekStart]);
  const dates = WEEKDAYS.map((i) => addDays(weekStart, i));
  const dayTotals = dates.map((_, i) => rows.reduce((sum, r) => sum + r.days[i].minutes, 0));
  const total = rows.reduce((sum, r) => sum + r.total, 0);
  const booked = rows.reduce((sum, r) => sum + r.booked, 0);
  const nominal = rows.reduce((sum, r) => sum + r.nominal, 0);
  const closed = dates.map((_, i) => rows.length > 0 && rows.every((r) => r.days[i].closed));

  return (
    <Card padding="none" as="section" aria-label="Týdenní kapacita">
      <CardHeader
        divided
        title="Týdenní kapacita"
        subtitle={
          total < nominal
            ? `Nepřítomnosti ubírají ${hoursLabel(nominal - total)} z plánovaných ${hoursLabel(nominal)}`
            : 'Pracovní doba bez pauz a nepřítomností'
        }
        actions={
          <div className="set-cap-nav">
            {weekStart !== thisWeek && (
              <Button size="sm" variant="ghost" onClick={() => setWeekStart(thisWeek)}>
                Tento týden
              </Button>
            )}
            <PeriodNav
              label={`${formatDayShort(weekStart)} – ${formatDayShort(addDays(weekStart, 6))}`}
              onPrev={() => setWeekStart(addDays(weekStart, -7))}
              onNext={() => setWeekStart(addDays(weekStart, 7))}
              prevLabel="Předchozí týden"
              nextLabel="Následující týden"
            />
          </div>
        }
      />
      {rows.length === 0 ? (
        <EmptyState compact icon="clock" title="Žádní aktivní terapeuti" />
      ) : (
        <Table caption="Pracovní hodiny terapeutů v týdnu" className="set-cap-table" minWidth={640}>
          <thead>
            <tr>
              <th scope="col">Terapeut</th>
              {dates.map((d, i) => (
                <th key={d} scope="col" className={cx('num', d === today && 'is-today')}>
                  <span className="set-cap-dow">{WEEKDAY_SHORT[i]}</span>
                  <span className="set-cap-date">{Number(d.slice(8, 10))}.</span>
                </th>
              ))}
              <th scope="col" className="num">
                Celkem
              </th>
              <th scope="col" className="set-cap-occ">
                Obsazeno
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const occ = r.total ? Math.min(100, Math.round((r.booked / r.total) * 100)) : 0;
              return (
                <tr key={r.therapist.id}>
                  <th scope="row" className="set-cap-name">
                    <span className="set-person">
                      <TherapistAvatar therapist={r.therapist} size="xs" />
                      <span className="truncate">{therapistName(r.therapist)}</span>
                    </span>
                  </th>
                  {r.days.map((d) => (
                    <td
                      key={d.date}
                      className={cx('num', 'set-cap-cell', d.date === today && 'is-today', (d.off || d.closed) && 'is-off')}
                      title={
                        d.closed ? 'Klinika zavřená' : d.off ? `Nepřítomnost – plánováno ${hoursLabel(d.nominal)}` : undefined
                      }
                    >
                      {d.closed && d.minutes === 0 ? (
                        <span className="set-cap-tag">zavřeno</span>
                      ) : d.off && d.minutes === 0 ? (
                        <span className="set-cap-tag">volno</span>
                      ) : d.minutes ? (
                        <>
                          {hoursLabel(d.minutes)}
                          {(d.off || d.closed) && d.minutes < d.nominal && <span className="visually-hidden"> (zkráceno nepřítomností)</span>}
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  ))}
                  <td className="num set-strong">{hoursLabel(r.total)}</td>
                  <td className="set-cap-occ">
                    <Progress
                      size="sm"
                      value={occ}
                      target={85}
                      showValue
                      label={`Obsazenost – ${therapistName(r.therapist)}`}
                      tone={occ >= 85 ? 'success' : 'accent'}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Celkem</th>
              {dayTotals.map((m, i) => (
                <td key={dates[i]} className={cx('num', dates[i] === today && 'is-today')}>
                  {closed[i] ? <span className="set-cap-tag">zavřeno</span> : m ? hoursLabel(m) : '—'}
                </td>
              ))}
              <td className="num">{hoursLabel(total)}</td>
              <td className="set-cap-occ">{total ? formatPercent(Math.min(100, Math.round((booked / total) * 100))) : '—'}</td>
            </tr>
          </tfoot>
        </Table>
      )}
      <p className="set-cap-legend">
        <span>
          <span className="set-cap-tag">volno</span> nepřítomnost
        </span>
        <span>Obsazeno = rezervované hodiny z pracovní doby (cíl 85 %)</span>
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Nepřítomnosti a zavírací dny                                        */
/* ------------------------------------------------------------------ */

function TimeOffCard({ onAdd }: { onAdd: (therapistId?: Id | null) => void }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming');
  const [removing, setRemoving] = useState<TimeOff | null>(null);

  const upcoming = useMemo(
    () => clinic.timeOff.filter((o) => o.end > now).sort((a, b) => (a.start < b.start ? -1 : 1)),
    [clinic.timeOff, now],
  );
  const past = useMemo(
    () =>
      clinic.timeOff
        .filter((o) => o.end <= now)
        .sort((a, b) => (a.start < b.start ? 1 : -1))
        .slice(0, 30),
    [clinic.timeOff, now],
  );
  const list = view === 'upcoming' ? upcoming : past;
  const conflicts = useMemo(() => {
    const m = new Map<Id, number>();
    for (const o of upcoming) {
      const imp = timeOffImpact(clinic, o.therapistId, o.start, o.end, now);
      m.set(o.id, imp.bookings.length);
    }
    return m;
  }, [clinic, upcoming, now]);

  return (
    <Card padding="none" as="section" aria-label="Nepřítomnosti a zavřeno">
      <CardHeader
        divided
        title="Nepřítomnosti a zavřeno"
        actions={
          <Menu
            label="Přidat"
            trigger={
              <Button size="sm" variant="secondary" icon="plus" iconRight="chevronDown">
                Přidat
              </Button>
            }
            items={[
              { id: 'person', label: 'Nepřítomnost terapeuta', icon: 'user', onSelect: () => onAdd(undefined) },
              { id: 'clinic', label: 'Zavřít celou kliniku', icon: 'building', onSelect: () => onAdd(null) },
            ]}
          />
        }
      />
      <div className="card__body set-stack set-stack--sm">
        <Segmented
          aria-label="Období"
          size="sm"
          full
          value={view}
          onChange={setView}
          options={[
            { value: 'upcoming', label: `Nadcházející (${upcoming.length})` },
            { value: 'past', label: 'Proběhlé' },
          ]}
        />
        {list.length === 0 ? (
          <EmptyState
            compact
            icon="calendarCheck"
            title={view === 'upcoming' ? 'Žádné plánované nepřítomnosti' : 'Žádné proběhlé nepřítomnosti'}
            text={view === 'upcoming' ? 'Dovolenou, školení nebo státní svátek zadejte předem – online rezervace je pak nenabídne.' : undefined}
            action={
              view === 'upcoming' ? (
                <Button size="sm" variant="secondary" icon="plus" onClick={() => onAdd(undefined)}>
                  Přidat nepřítomnost
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="set-offlist">
            {list.map((o) => {
              const t = o.therapistId ? getTherapist(clinic, o.therapistId) : undefined;
              const running = o.start <= now && now < o.end;
              const n = conflicts.get(o.id) ?? 0;
              return (
                <li key={o.id} className={cx('set-offlist__item', view === 'past' && 'is-past')}>
                  {o.therapistId === null ? (
                    <span className="set-offlist__icon" aria-hidden="true">
                      <Icon name="building" size={16} />
                    </span>
                  ) : (
                    <TherapistAvatar therapist={t} size="sm" />
                  )}
                  <div className="set-offlist__text">
                    <span className="set-offlist__who">
                      {o.therapistId === null ? 'Celá klinika – zavřeno' : t ? therapistName(t) : 'Neznámý terapeut'}
                    </span>
                    <span className="set-offlist__range tnum">{describeRange(o.start, o.end)}</span>
                    <span className="set-offlist__badges">
                      {o.reason && <span className="set-offlist__reason">{o.reason}</span>}
                      {running && (
                        <Badge size="sm" tone="accent" dot>
                          Právě probíhá
                        </Badge>
                      )}
                      {view === 'upcoming' && n > 0 && (
                        <Badge size="sm" tone="warning" icon="alert">
                          {countLabel(n, ['rezervace', 'rezervace', 'rezervací'])} v kolizi
                        </Badge>
                      )}
                    </span>
                  </div>
                  <IconButton icon="trash" size="sm" label={`Odebrat – ${describeRange(o.start, o.end)}`} onClick={() => setRemoving(o)} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        tone="danger"
        title={removing?.therapistId === null ? 'Zrušit zavření kliniky?' : 'Odebrat nepřítomnost?'}
        message={
          removing
            ? `${removing.therapistId === null ? 'Celá klinika' : therapistName(getTherapist(clinic, removing.therapistId))} · ${describeRange(removing.start, removing.end)}${removing.reason ? ` · ${removing.reason}` : ''}. Čas se znovu uvolní pro online rezervace.`
            : undefined
        }
        confirmLabel="Odebrat"
        onConfirm={() => {
          if (!removing) return;
          const r = run(removeTimeOff, { id: removing.id }, { success: 'Nepřítomnost odebrána – čas je opět volný' });
          if (!r.ok) throw new Error(r.error);
        }}
      />
    </Card>
  );
}
