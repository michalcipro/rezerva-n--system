import { useEffect, useMemo, useState } from 'react';
import type { GroupSession, Id, LocalDateTime } from '../../domain/types';
import { NBSP, countLabel, formatDayShort, formatNumber, formatTime, formatTimeRange } from '../../engine/format';
import { groupServices, groupSessionsOverview, groupTotals, type GroupSessionOverview } from '../../engine/groups';
import { getRoom, getTherapist, therapistName } from '../../engine/selectors';
import { addDays, dateOf } from '../../engine/time';
import { useActor, useClinic, useNow } from '../../store/hooks';
import { navigate } from '../../store/session';
import { Badge, Button, EmptyState, Input, KpiTile, PageHeader, PeriodNav, Segmented, Select, Switch, cx, type SegmentedOption } from '../../ui';
import { BookingDrawer, NewBookingDialog } from '../calendar';
import {
  clampCustom,
  dayHeading,
  groupByDay,
  groupTrainers,
  occupancyLabel,
  relativeDayLabel,
  rememberPrefs,
  rememberedPrefs,
  resolveRange,
  rowDomId,
  takePendingFocus,
  type DayGroup,
  type GroupsPrefs,
  type RangeMode,
} from './model';
import { ParticipantsDrawer } from './ParticipantsDrawer';
import { SpotsMeter, WaitlistBadge } from './parts';
import './groups.css';

const PRESETS: SegmentedOption<RangeMode>[] = [
  { value: 'week', label: 'Tento týden' },
  { value: 'next14', label: 'Příštích 14 dní' },
  { value: 'custom', label: 'Vlastní' },
];

const isDate = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Obsazenost skupinových lekcí: volná místa, plné termíny, čekací listina, přihlášení klientů. */
export function GroupsScreen(): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const actor = useActor();
  const today = dateOf(now);

  const [prefs, setPrefsState] = useState<GroupsPrefs>(() => rememberedPrefs(today));
  const setPrefs = (patch: Partial<GroupsPrefs>): void => setPrefsState((p) => ({ ...p, ...patch }));
  useEffect(() => rememberPrefs(prefs), [prefs]);

  const [bookFor, setBookFor] = useState<GroupSession | null>(null);
  const [peopleFor, setPeopleFor] = useState<Id | null>(null);
  const [bookingId, setBookingId] = useState<Id | null>(null);
  const [highlight, setHighlight] = useState<Id | null>(null);

  // Příchod z karty na přehledu: posunout pohled na vybraný termín a krátce ho zvýraznit.
  useEffect(() => {
    const id = takePendingFocus();
    if (id) setHighlight(id);
  }, []);
  useEffect(() => {
    if (!highlight) return undefined;
    const scroll = setTimeout(() => document.getElementById(rowDomId(highlight))?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
    const clear = setTimeout(() => setHighlight(null), 2600);
    return () => {
      clearTimeout(scroll);
      clearTimeout(clear);
    };
  }, [highlight]);

  const services = useMemo(() => groupServices(clinic), [clinic]);
  const trainers = useMemo(() => groupTrainers(clinic), [clinic]);
  // Uložený filtr mohl mezitím zmizet (vypnutá lekce) – pak platí „všechny“.
  const serviceId = services.some((s) => s.id === prefs.serviceId) ? prefs.serviceId : '';
  const therapistId = trainers.some((t) => t.id === prefs.therapistId) ? prefs.therapistId : '';
  const filtered = !!serviceId || !!therapistId;
  const range = useMemo(() => resolveRange(prefs, today), [prefs, today]);

  // Všechny termíny období (i proběhlé a zrušené) – zobrazení a souhrn se z nich jen filtrují.
  const all = useMemo(
    () =>
      groupSessionsOverview(
        clinic,
        range.from,
        range.to,
        { serviceId: serviceId || null, therapistId: therapistId || null, includePast: true, includeCancelled: true },
        now,
      ),
    [clinic, range.from, range.to, serviceId, therapistId, now],
  );
  const rows = useMemo(() => all.filter((r) => (prefs.showPast || !r.past) && (!prefs.onlyFree || r.free > 0)), [all, prefs.showPast, prefs.onlyFree]);
  const days = useMemo(() => groupByDay(rows), [rows]);
  const upcoming = useMemo(() => all.filter((r) => !r.past), [all]);
  const totals = useMemo(() => groupTotals(upcoming), [upcoming]);
  const waitingSessions = upcoming.filter((r) => !r.cancelled && r.waitlist > 0).length;
  const occupancy = totals.capacity > 0 ? Math.round((totals.booked / totals.capacity) * 100) : 0;

  const applyPreset = (mode: RangeMode): void => {
    if (mode === 'custom') {
      if (prefs.mode !== 'custom') setPrefs({ mode, customFrom: range.from, customTo: addDays(range.to, -1) });
      return;
    }
    setPrefs({ mode, offset: 0 });
  };
  const custom = prefs.mode === 'custom' ? clampCustom(prefs.customFrom, prefs.customTo) : null;
  const setCustom = (from: string, to: string): void => {
    if (!isDate(from) || !isDate(to)) return;
    const c = clampCustom(from, to);
    setPrefs({ customFrom: c.from, customTo: c.to });
  };
  const resetFilters = (): void => setPrefs({ serviceId: '', therapistId: '' });

  const openBooking = (row: GroupSessionOverview): void => setBookFor(row.session);
  const subtitle = services.some((s) => s.name.toLocaleLowerCase('cs').startsWith('kruhov'))
    ? 'Kolik je volných míst na kruhovém tréninku a dalších lekcích.'
    : 'Kolik je volných míst na skupinových lekcích.';
  const canEditSchedule = actor.role === 'owner' || actor.role === 'reception';

  /* --------------------------- prázdné stavy --------------------------- */
  let empty: JSX.Element | null = null;
  if (services.length === 0) {
    empty = (
      <EmptyState
        icon="users"
        title="Zatím tu nejsou žádné skupinové lekce"
        text="Pravidelné lekce, jako je kruhový trénink nebo pilates, se nastavují ve Službách a ceníku v rozvrhu skupinových lekcí. Pak tu uvidíte jejich obsazenost."
        action={
          canEditSchedule ? (
            <Button variant="primary" icon="settings" onClick={() => navigate({ name: 'sluzby' })}>
              Nastavit rozvrh lekcí
            </Button>
          ) : undefined
        }
      />
    );
  } else if (rows.length === 0) {
    const anyUpcoming = all.some((r) => !r.past);
    if (all.length === 0) {
      empty = (
        <EmptyState
          icon="calendarX"
          title={filtered ? 'Vybraná lekce v tomto období není' : 'V tomto období nejsou žádné lekce'}
          text={filtered ? 'Zkuste zrušit filtr lekce nebo trenéra, případně vyberte jiné období.' : 'V rozvrhu na tyto dny nic není. Vyberte jiné období.'}
          action={
            filtered ? (
              <Button variant="primary" onClick={resetFilters}>
                Zrušit filtry
              </Button>
            ) : prefs.mode !== 'custom' ? (
              <Button variant="primary" iconRight="arrowRight" onClick={() => setPrefs({ offset: prefs.offset + 1 })}>
                {range.nextLabel}
              </Button>
            ) : undefined
          }
        />
      );
    } else if (!anyUpcoming && !prefs.showPast) {
      empty = (
        <EmptyState
          icon="history"
          title="Všechny lekce v tomto období už proběhly"
          text="Proběhlé lekce si zobrazíte přepínačem, volná místa najdete v dalších dnech."
          action={
            <span className="grp-empty-actions">
              {prefs.mode !== 'custom' && (
                <Button variant="primary" iconRight="arrowRight" onClick={() => setPrefs({ offset: prefs.offset + 1 })}>
                  {range.nextLabel}
                </Button>
              )}
              <Button onClick={() => setPrefs({ showPast: true })}>Zobrazit proběhlé</Button>
            </span>
          }
        />
      );
    } else {
      empty = (
        <EmptyState
          icon="users"
          title="Žádné volné místo"
          text="Na nadcházejících lekcích v tomto období je plno. Klienta můžete zapsat na čekací listinu v Účastnících plné lekce."
          action={<Button onClick={() => setPrefs({ onlyFree: false })}>Zobrazit i plné lekce</Button>}
        />
      );
    }
  }

  return (
    <div className="page grp-root">
      <PageHeader title="Skupinové lekce" subtitle={subtitle} />

      {services.length > 0 && (
        <div className="grp-filters" role="group" aria-label="Období a filtry lekcí">
          <div className="grp-filters__row">
            <Segmented<RangeMode | ''>
              aria-label="Období"
              size="lg"
              className="grp-presets"
              value={range.preset}
              onChange={(v) => v && applyPreset(v)}
              options={PRESETS}
            />
            {custom ? (
              <div className="grp-custom">
                <Input
                  type="date"
                  prefix="Od"
                  aria-label="Začátek období"
                  value={custom.from}
                  onValueChange={(v) => setCustom(v, v > custom.to ? v : custom.to)}
                />
                <Input
                  type="date"
                  prefix="Do"
                  aria-label="Konec období"
                  value={custom.to}
                  min={custom.from}
                  max={addDays(custom.from, 91)}
                  onValueChange={(v) => setCustom(custom.from, v)}
                />
              </div>
            ) : (
              <PeriodNav
                className="grp-period"
                label={range.navLabel}
                prevLabel={range.prevLabel}
                nextLabel={range.nextLabel}
                onPrev={() => setPrefs({ offset: prefs.offset - 1 })}
                onNext={() => setPrefs({ offset: prefs.offset + 1 })}
              />
            )}
          </div>
          <div className="grp-filters__row">
            <Select
              inline
              className="grp-filter"
              aria-label="Lekce"
              value={serviceId}
              onValueChange={(v) => setPrefs({ serviceId: v })}
              options={[{ value: '', label: 'Všechny lekce' }, ...services.map((s) => ({ value: s.id, label: s.name }))]}
            />
            {trainers.length > 0 && (
              <Select
                inline
                className="grp-filter"
                aria-label="Trenér"
                value={therapistId}
                onValueChange={(v) => setPrefs({ therapistId: v })}
                options={[{ value: '', label: 'Všichni trenéři' }, ...trainers.map((t) => ({ value: t.id, label: therapistName(t) }))]}
              />
            )}
            <div className="grp-switches">
              <Switch checked={prefs.onlyFree} onChange={(v) => setPrefs({ onlyFree: v })} label="Jen s volnými místy" labelPosition="end" />
              <Switch checked={prefs.showPast} onChange={(v) => setPrefs({ showPast: v })} label="Zobrazit proběhlé" labelPosition="end" />
            </div>
          </div>
        </div>
      )}

      {totals.sessions > 0 && (
        <section className="grp-kpis" aria-label={`Souhrn nadcházejících lekcí, ${range.text}`}>
          <KpiTile
            label="Termíny"
            value={formatNumber(totals.sessions)}
            hint={`${prefs.showPast ? 'nadcházející · ' : ''}obsazenost ${occupancy}${NBSP}%`}
          />
          <KpiTile label="Volná místa" value={formatNumber(totals.freeSpots)} hint={`obsazeno ${occupancyLabel(totals.booked, totals.capacity)}`} />
          <KpiTile
            label="Plné termíny"
            value={formatNumber(totals.full)}
            hint={totals.almost > 0 ? `+ ${countLabel(totals.almost, ['téměř plný', 'téměř plné', 'téměř plných'])}` : 'žádný téměř plný'}
          />
          <KpiTile
            label="Čeká na místo"
            value={formatNumber(totals.waitlist)}
            hint={totals.waitlist > 0 ? `u ${countLabel(waitingSessions, ['termínu', 'termínů', 'termínů'])}` : 'nikdo nečeká'}
          />
        </section>
      )}

      {empty ?? (
        <div className="grp-days">
          {days.map((d) => (
            <DaySection
              key={d.date}
              day={d}
              today={today}
              now={now}
              highlight={highlight}
              onBook={openBooking}
              onParticipants={setPeopleFor}
            />
          ))}
        </div>
      )}

      <ParticipantsDrawer sessionId={peopleFor} onClose={() => setPeopleFor(null)} onBook={openBooking} onOpenBooking={setBookingId} />
      <BookingDrawer bookingId={bookingId} onClose={() => setBookingId(null)} />
      <NewBookingDialog
        open={!!bookFor}
        onClose={() => setBookFor(null)}
        initial={bookFor ? { serviceId: bookFor.serviceId, sessionId: bookFor.id, therapistId: bookFor.therapistId, start: bookFor.start } : undefined}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Den a řádek termínu                                                 */
/* ------------------------------------------------------------------ */

function DaySection({
  day,
  today,
  now,
  highlight,
  onBook,
  onParticipants,
}: {
  day: DayGroup;
  today: string;
  now: LocalDateTime;
  highlight: Id | null;
  onBook: (row: GroupSessionOverview) => void;
  onParticipants: (sessionId: Id) => void;
}): JSX.Element {
  const rel = relativeDayLabel(day.date, today);
  const active = day.rows.filter((r) => !r.cancelled);
  const open = active.filter((r) => !r.past);
  const free = open.reduce((sum, r) => sum + r.free, 0);
  const headingId = `grp-day-${day.date}`;
  let meta = countLabel(active.length, ['lekce', 'lekce', 'lekcí']);
  if (open.length > 0) meta += free > 0 ? ` · ${countLabel(free, ['volné místo', 'volná místa', 'volných míst'])}` : ' · vše obsazeno';
  if (active.length === 0) meta = 'jen zrušené lekce';

  return (
    <section className="grp-day" aria-labelledby={headingId}>
      <div className="grp-day__head">
        <h2 id={headingId} className="grp-day__title">
          {dayHeading(day.date)}
          {(rel === 'dnes' || rel === 'zítra') && (
            <Badge tone={rel === 'dnes' ? 'accent' : 'neutral'} size="sm" className="grp-day__rel">
              {rel === 'dnes' ? 'Dnes' : 'Zítra'}
            </Badge>
          )}
        </h2>
        <span className="grp-day__meta">{meta}</span>
      </div>
      <ul className="grp-list">
        {day.rows.map((r) => (
          <SessionRow
            key={r.session.id}
            row={r}
            now={now}
            highlighted={highlight === r.session.id}
            onBook={onBook}
            onParticipants={onParticipants}
          />
        ))}
      </ul>
    </section>
  );
}

function SessionRow({
  row,
  now,
  highlighted,
  onBook,
  onParticipants,
}: {
  row: GroupSessionOverview;
  now: LocalDateTime;
  highlighted: boolean;
  onBook: (row: GroupSessionOverview) => void;
  onParticipants: (sessionId: Id) => void;
}): JSX.Element {
  const clinic = useClinic();
  const ses = row.session;
  const therapist = getTherapist(clinic, ses.therapistId);
  const room = getRoom(clinic, ses.roomId);
  const bookable = !row.past && !row.cancelled;
  const full = row.free <= 0;
  const when = `${ses.title} ${formatDayShort(ses.start)} ${formatTime(ses.start)}`;

  return (
    <li
      id={rowDomId(ses.id)}
      className={cx('grp-row', row.past && 'is-past', row.cancelled && 'is-cancelled', highlighted && 'is-highlighted')}
    >
      <span className="grp-row__time tnum">
        {formatTimeRange(ses.start, ses.end)}
        {row.cancelled && <span className="visually-hidden"> (zrušeno)</span>}
      </span>
      <div className="grp-row__main">
        <span className="grp-row__title">{ses.title}</span>
        <span className="grp-row__meta">{[therapistName(therapist), room?.name].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="grp-row__fill">
        <SpotsMeter row={row} now={now} extra={!row.cancelled && !row.past ? <WaitlistBadge count={row.waitlist} /> : undefined} />
      </div>
      <div className="grp-row__actions">
        {bookable && (
          <Button
            size="sm"
            icon="userPlus"
            disabled={full}
            title={full ? 'Lekce je plná. Klienta přidáte na čekací listinu v Účastnících.' : undefined}
            aria-label={`Přihlásit klienta – ${when}`}
            onClick={() => onBook(row)}
          >
            Přihlásit klienta
          </Button>
        )}
        <Button size="sm" variant="ghost" icon="users" aria-label={`Účastníci – ${when}`} onClick={() => onParticipants(ses.id)}>
          Účastníci
        </Button>
      </div>
    </li>
  );
}
