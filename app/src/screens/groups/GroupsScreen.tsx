import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Id, LocalDate } from '../../domain/types';
import { ToneDot } from '../../components/domain';
import { countLabel, formatDateLong, formatDuration, formatNumber, formatPercent, formatTimeRange, plural, prepZ } from '../../engine/format';
import { groupSessionsOverview, type GroupSessionOverview } from '../../engine/groups';
import { getRoom, getService, getTherapist, serviceCategoryTone, therapistShort } from '../../engine/selectors';
import { addDays, dateOf, diffMinutes } from '../../engine/time';
import { useActor, useClinic, useNow } from '../../store/hooks';
import { navigate } from '../../store/session';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  KpiTile,
  PageHeader,
  PeriodNav,
  Segmented,
  Select,
  Switch,
  cx,
} from '../../ui';
import { NewBookingDialog, type NewBookingInitial } from '../calendar';
import {
  RANGE_OPTIONS,
  clampCustom,
  dayMeta,
  defaultRange,
  groupByDay,
  groupServices,
  groupTrainers,
  isBookable,
  leadsGroups,
  resolveRange,
  summarize,
  waitlistText,
  type RangePreset,
  type RangeState,
} from './model';
import { OccupancyMeter } from './OccupancyMeter';
import { ParticipantsDrawer } from './ParticipantsDrawer';
import './groups.css';

/**
 * Skupinové lekce (docs/VSTUPY-SKUPINY-QR.md, část 2): volná místa v termínech skupinových lekcí po dnech,
 * filtry lekce a trenéra, přihlášení klienta a panel účastníků se zdrojem platby.
 */

interface ScreenState {
  range: RangeState | null;
  /** '' = všechny lekce. */
  serviceId: Id;
  /** '' = všichni trenéři. */
  therapistId: Id;
  /** null = výchozí podle role (terapeut vidí své lekce). */
  mine: boolean | null;
  onlyFree: boolean;
  showPast: boolean;
}

/** Filtry přežijí odchod na kartu klienta a návrat (jen v paměti této záložky). */
let remembered: ScreenState = { range: null, serviceId: '', therapistId: '', mine: null, onlyFree: false, showPast: false };

export function GroupsScreen(): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const actor = useActor();
  const today = dateOf(now);

  const [state, setState] = useState<ScreenState>(remembered);
  const [booking, setBooking] = useState<NewBookingInitial | null>(null);
  const [participantsOf, setParticipantsOf] = useState<Id | null>(null);

  useEffect(() => {
    remembered = state;
  }, [state]);
  const update = (patch: Partial<ScreenState>): void => setState((s) => ({ ...s, ...patch }));

  const range = useMemo(() => state.range ?? defaultRange(today), [state.range, today]);
  const resolved = useMemo(() => resolveRange(range, today), [range, today]);
  const setRange = (patch: Partial<RangeState>): void => update({ range: { ...range, ...patch } });

  const services = useMemo(() => groupServices(clinic), [clinic]);
  const trainers = useMemo(() => groupTrainers(clinic), [clinic]);
  const myId = actor.therapistId ?? null;
  const showMine = !!myId && (actor.role === 'therapist' || leadsGroups(clinic, myId));
  const mine = showMine && (state.mine ?? actor.role === 'therapist');
  const serviceId = services.some((s) => s.id === state.serviceId) ? state.serviceId : '';
  const therapistId = mine && myId ? myId : trainers.some((t) => t.id === state.therapistId) ? state.therapistId : '';
  const filtered = !!serviceId || (!mine && !!therapistId);

  const all = useMemo(
    () => groupSessionsOverview(clinic, resolved.from, resolved.to, { serviceId: serviceId || null, therapistId: therapistId || null }, now),
    [clinic, resolved.from, resolved.to, serviceId, therapistId, now],
  );
  const inScope = useMemo(() => (state.showPast ? all : all.filter((g) => !g.past)), [all, state.showPast]);
  const summary = useMemo(() => summarize(inScope), [inScope]);
  const visible = useMemo(() => (state.onlyFree ? inScope.filter((g) => !g.cancelled && g.free > 0) : inScope), [inScope, state.onlyFree]);
  const days = useMemo(() => groupByDay(visible), [visible]);

  const pastHidden = all.length - inScope.length;
  const fullHidden = inScope.length - visible.length;

  const resetFilters = (): void => update({ serviceId: '', therapistId: '' });
  const openBooking = (g: GroupSessionOverview): void => setBooking({ sessionId: g.session.id, serviceId: g.session.serviceId });
  const openBookingById = (id: Id): void => {
    const g = all.find((x) => x.session.id === id);
    setBooking(g ? { sessionId: id, serviceId: g.session.serviceId } : { sessionId: id });
  };
  const staffSettings = actor.role === 'owner' || actor.role === 'reception';

  /* --------------------------- hlavička --------------------------- */
  const subtitle = (
    <>
      {resolved.text}
      {mine && <span className="grp-sub-muted"> · vaše lekce</span>}
      {!mine && therapistId && <span className="grp-sub-muted"> · {therapistShort(getTherapist(clinic, therapistId))}</span>}
      {serviceId && <span className="grp-sub-muted"> · {getService(clinic, serviceId)?.name}</span>}
    </>
  );

  if (services.length === 0) {
    return (
      <div className="page grp-page">
        <PageHeader title="Skupinové lekce" subtitle="Volná místa na kruhových trénincích, workshopech a dalších skupinových lekcích" />
        <EmptyState
          icon="users"
          title="Zatím žádné skupinové lekce"
          text="Skupinovou lekci (např. kruhový trénink nebo workshop) založíte v části Služby a ceník jako službu typu skupina a k ní pravidelné termíny. Pak tu uvidíte, kolik míst je ještě volných."
          action={
            staffSettings ? (
              <Button variant="primary" icon="briefcase" onClick={() => navigate({ name: 'sluzby' })}>
                Služby a ceník
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const custom = range.preset === 'custom' ? clampCustom(range.customFrom, range.customTo, today) : null;
  const setCustom = (from: string, to: string): void => {
    const c = clampCustom(from, to, today);
    setRange({ preset: 'custom', offset: 0, customFrom: c.from, customTo: c.to });
  };
  const changePreset = (p: RangePreset): void => {
    if (p === 'custom') {
      // vlastní rozsah začne tím, co je právě vidět
      setRange({ preset: 'custom', offset: 0, customFrom: resolved.from, customTo: resolved.last });
    } else setRange({ preset: p, offset: 0 });
  };
  const pastHint =
    range.preset === 'custom' ? 'Zobrazte je, nebo zvolte jiný rozsah.' : `Zobrazte je, nebo přejděte na ${range.preset === 'week' ? 'další týden' : 'dalších 14 dní'}.`;

  /* --------------------------- prázdné stavy --------------------------- */
  let empty: JSX.Element | null = null;
  if (all.length === 0) {
    empty = mine ? (
      <EmptyState
        icon="calendar"
        title="V tomto rozsahu nevedete žádnou lekci"
        text="Zobrazte si lekce ostatních trenérů – i na ně můžete přihlásit své klienty."
        action={<Button onClick={() => update({ mine: false })}>Zobrazit všechny lekce</Button>}
      />
    ) : (
      <EmptyState
        icon="calendar"
        title="V tomto rozsahu nejsou žádné termíny"
        text={
          filtered
            ? 'Zvolená lekce nebo trenér v tomto rozsahu nemá žádný termín. Zkuste zrušit filtry nebo vybrat jiný rozsah.'
            : 'Skupinové lekce se v těchto dnech nekonají. Zkuste jiný rozsah, třeba příštích 14 dní.'
        }
        action={
          filtered ? (
            <Button onClick={resetFilters}>Zrušit filtry</Button>
          ) : range.preset !== 'next14' || range.offset !== 0 ? (
            <Button onClick={() => setRange({ preset: 'next14', offset: 0 })}>Příštích 14 dní</Button>
          ) : undefined
        }
      />
    );
  } else if (inScope.length === 0) {
    empty = (
      <EmptyState
        icon="checkCircle"
        title="Všechny termíny v rozsahu už proběhly"
        text={`Proběhlé termíny (${formatNumber(pastHidden)}) jsou skryté. ${pastHint}`}
        action={
          <Button onClick={() => update({ showPast: true })} icon="eye">
            Zobrazit proběhlé
          </Button>
        }
      />
    );
  } else if (visible.length === 0) {
    empty = (
      <EmptyState
        icon="users"
        title="Žádný termín nemá volné místo"
        text={`Všechny termíny v rozsahu jsou plné nebo zrušené (${formatNumber(fullHidden)}). Zájemce můžete přidat na čekací listinu u plného termínu.`}
        action={<Button onClick={() => update({ onlyFree: false })}>Zobrazit i plné termíny</Button>}
      />
    );
  }

  const occupancy = summary.capacity > 0 ? Math.round((summary.booked / summary.capacity) * 100) : 0;
  const scopeWord = state.showPast ? 'v rozsahu' : 'nadcházející v rozsahu';

  return (
    <div className="page grp-page">
      <PageHeader title="Skupinové lekce" subtitle={subtitle} />

      <div className="grp-filters" role="group" aria-label="Rozsah a filtry lekcí">
        <div className="grp-filters__row">
          <Segmented<RangePreset>
            className="grp-presets"
            aria-label="Rozsah"
            size="lg"
            value={range.preset}
            onChange={changePreset}
            options={RANGE_OPTIONS}
          />
          {range.preset !== 'custom' ? (
            <PeriodNav
              className="grp-period"
              label={resolved.label}
              onPrev={() => setRange({ offset: range.offset - 1 })}
              onNext={() => setRange({ offset: range.offset + 1 })}
              prevLabel={range.preset === 'week' ? 'Předchozí týden' : 'Předchozích 14 dní'}
              nextLabel={range.preset === 'week' ? 'Další týden' : 'Dalších 14 dní'}
            />
          ) : (
            custom && (
              <div className="grp-custom">
                <Input
                  type="date"
                  size="sm"
                  prefix="Od"
                  aria-label="Začátek rozsahu"
                  value={custom.from}
                  max={custom.to}
                  onValueChange={(v) => v && setCustom(v, custom.to)}
                />
                <Input
                  type="date"
                  size="sm"
                  prefix="Do"
                  aria-label="Konec rozsahu (včetně)"
                  value={custom.to}
                  min={custom.from}
                  max={addDays(custom.from, 91)}
                  onValueChange={(v) => v && setCustom(custom.from, v)}
                />
              </div>
            )
          )}
        </div>
        <div className="grp-filters__row">
          <Select
            inline
            className="grp-filters__select"
            prefix="Lekce:"
            aria-label="Lekce"
            value={serviceId}
            onValueChange={(v) => update({ serviceId: v })}
            options={[{ value: '', label: 'Všechny' }, ...services.map((s) => ({ value: s.id, label: s.name }))]}
          />
          {showMine && (
            <Switch className="grp-filters__switch" labelPosition="end" label="Jen moje lekce" checked={mine} onChange={(v) => update({ mine: v })} />
          )}
          {!mine && (
            <Select
              inline
              className="grp-filters__select"
              prefix="Trenér:"
              aria-label="Trenér"
              value={therapistId}
              onValueChange={(v) => update({ therapistId: v })}
              options={[{ value: '', label: 'Všichni' }, ...trainers.map((t) => ({ value: t.id, label: therapistShort(t) }))]}
            />
          )}
          <Switch
            className="grp-filters__switch"
            labelPosition="end"
            label="Jen s volnými místy"
            checked={state.onlyFree}
            onChange={(v) => update({ onlyFree: v })}
          />
          <Switch
            className="grp-filters__switch"
            labelPosition="end"
            label="Zobrazit proběhlé"
            checked={state.showPast}
            onChange={(v) => update({ showPast: v })}
          />
          {filtered && (
            <Button variant="ghost" size="sm" icon="x" onClick={resetFilters}>
              Zrušit filtry
            </Button>
          )}
        </div>
      </div>

      {all.length > 0 && inScope.length > 0 && (
        <div className="grp-summary" aria-label="Souhrn rozsahu">
          <KpiTile label="Termíny" value={formatNumber(summary.sessions)} hint={summary.cancelled ? `${scopeWord} · zrušené ${formatNumber(summary.cancelled)}` : scopeWord} />
          <KpiTile
            label="Volná místa"
            value={formatNumber(summary.freeSpots)}
            hint={summary.capacity > 0 ? `${prepZ(summary.capacity)} ${countLabel(summary.capacity, ['místa', 'míst', 'míst'])} · obsazeno ${formatPercent(occupancy)}` : undefined}
          />
          <KpiTile
            label="Plné termíny"
            value={formatNumber(summary.fullSessions)}
            hint={summary.almostSessions ? `skoro plné ${formatNumber(summary.almostSessions)}` : 'žádný skoro plný'}
          />
          <KpiTile label="Čekací listina" value={formatNumber(summary.waiting)} hint={summary.waiting ? plural(summary.waiting, ['čeká na místo', 'čekají na místo', 'čeká na místo']) : 'nikdo nečeká'} />
        </div>
      )}

      {(pastHidden > 0 || fullHidden > 0) && visible.length > 0 && (
        <p className="grp-resultline" aria-live="polite">
          Zobrazeno <strong className="tnum">{formatNumber(visible.length)}</strong> {prepZ(all.length)} {formatNumber(all.length)}{' '}
          {plural(all.length, ['termínu', 'termínů', 'termínů'])}
          {' · skryté '}
          {[pastHidden > 0 ? `proběhlé: ${formatNumber(pastHidden)}` : null, fullHidden > 0 ? `plné nebo zrušené: ${formatNumber(fullHidden)}` : null]
            .filter(Boolean)
            .join(', ')}
        </p>
      )}

      {empty ?? (
        <div className="grp-days">
          {days.map((day) => (
            <DaySection key={day.date} date={day.date} today={today} meta={dayMeta(day)}>
              {day.items.map((g) => (
                <SessionRow
                  key={g.session.id}
                  item={g}
                  now={now}
                  waitlistEnabled={clinic.settings.waitlist.enabled}
                  onBook={() => openBooking(g)}
                  onParticipants={() => setParticipantsOf(g.session.id)}
                />
              ))}
            </DaySection>
          ))}
        </div>
      )}

      <ParticipantsDrawer sessionId={participantsOf} onClose={() => setParticipantsOf(null)} onAddClient={openBookingById} />
      <NewBookingDialog open={!!booking} onClose={() => setBooking(null)} initial={booking ?? undefined} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Den                                                                 */
/* ------------------------------------------------------------------ */

function DaySection({ date, today, meta, children }: { date: LocalDate; today: LocalDate; meta: string; children: ReactNode }): JSX.Element {
  const headingId = `grp-day-${date}`;
  const rel = date === today ? 'Dnes' : date === addDays(today, 1) ? 'Zítra' : null;
  return (
    <section className={cx('grp-day', date < today && 'is-past')} aria-labelledby={headingId}>
      <div className="grp-day__head">
        <h2 id={headingId} className="grp-day__title">
          {formatDateLong(date, { capital: true, year: false })}
        </h2>
        {rel && (
          <Badge tone="accent" size="sm">
            {rel}
          </Badge>
        )}
        <span className="grp-day__meta tnum">{meta}</span>
      </div>
      <Card padding="none" className="grp-day__card">
        <ul className="grp-list">{children}</ul>
      </Card>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Termín                                                              */
/* ------------------------------------------------------------------ */

function SessionRow({
  item: g,
  now,
  waitlistEnabled,
  onBook,
  onParticipants,
}: {
  item: GroupSessionOverview;
  now: string;
  waitlistEnabled: boolean;
  onBook: () => void;
  onParticipants: () => void;
}): JSX.Element {
  const clinic = useClinic();
  const ses = g.session;
  const therapist = getTherapist(clinic, g.therapistId);
  const room = getRoom(clinic, ses.roomId);
  const running = !g.past && ses.start <= now;
  const full = g.fill === 'full';
  const canBook = isBookable(g) && (!full || waitlistEnabled);
  const titleId = `grp-ses-${ses.id}`;
  const showService = g.serviceName && g.serviceName !== ses.title;

  return (
    <li className={cx('grp-ses', g.cancelled && 'is-cancelled', g.past && 'is-past', full && !g.cancelled && 'is-full')}>
      <div className="grp-ses__time tnum">
        <span className="grp-ses__clock">{formatTimeRange(ses.start, ses.end)}</span>
        <span className="grp-ses__dur">{formatDuration(Math.max(0, diffMinutes(ses.end, ses.start)))}</span>
      </div>

      <div className="grp-ses__main">
        <span className="grp-ses__head">
          <h3 id={titleId} className="grp-ses__title">
            {ses.title}
          </h3>
          {g.cancelled && (
            <Badge tone="danger" size="sm" dot="ring">
              Zrušeno
            </Badge>
          )}
          {running && !g.cancelled && (
            <Badge tone="accent" size="sm" dot>
              Probíhá
            </Badge>
          )}
          {g.past && !g.cancelled && (
            <Badge tone="neutral" size="sm">
              Proběhlo
            </Badge>
          )}
        </span>
        <span className="grp-ses__meta">
          <ToneDot tone={serviceCategoryTone(clinic, ses.serviceId)} />
          {showService && (
            <>
              <span>{g.serviceName}</span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span>{therapistShort(therapist)}</span>
          {room && (
            <>
              <span aria-hidden="true">·</span>
              <span>{room.name}</span>
            </>
          )}
        </span>
      </div>

      <div className="grp-ses__occ">
        <OccupancyMeter booked={g.booked} capacity={g.capacity} cancelled={g.cancelled} />
        {g.waitlist > 0 && !g.cancelled && (
          <span className="grp-ses__wait">
            <Badge tone="info" size="sm" icon="hourglass">
              {waitlistText(g.waitlist)}
            </Badge>
          </span>
        )}
      </div>

      <div className="grp-ses__actions">
        {canBook && (
          <Button size="sm" variant={full ? 'secondary' : 'soft'} icon={full ? 'hourglass' : 'userPlus'} onClick={onBook} aria-describedby={titleId}>
            {full ? 'Na čekací listinu' : 'Přihlásit klienta'}
          </Button>
        )}
        <Button size="sm" variant="ghost" icon="users" onClick={onParticipants} aria-describedby={titleId}>
          Účastníci{g.booked > 0 ? ` (${formatNumber(g.booked)})` : ''}
        </Button>
      </div>
    </li>
  );
}
