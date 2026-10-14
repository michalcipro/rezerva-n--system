import { useMemo, useState } from 'react';
import type { Id, LocalDate, LocalDateTime } from '../../domain/types';
import { checkBookingSlot, daySchedule, type TherapistDay } from '../../engine/availability';
import { countLabel, formatDateLong, formatDayShort, formatPercent, formatTime, plural } from '../../engine/format';
import { getBooking, getRoom, therapistName, therapistShort } from '../../engine/selectors';
import { daySummary } from '../../engine/stats';
import { addDays, dateOf } from '../../engine/time';
import { TherapistAvatar } from '../../components/domain';
import { useActor, useClinic, useNow } from '../../store/hooks';
import { navigate, setSession, useSession } from '../../store/session';
import { Badge, Button, EmptyState, IconButton, Input, PageHeader, Progress, Segmented, Select, Swatch, Switch, cx, toast } from '../../ui';
import { BookingDrawer, SessionDrawer } from './BookingDrawer';
import { MoveDialog, type MoveRequest } from './MoveDialog';
import { NewBookingDialog, type NewBookingInitial } from './NewBookingDialog';
import { SidePanel } from './SidePanel';
import { TimeGrid, type GridColumn } from './TimeGrid';
import { PHONE_QUERY, useMediaQuery } from './hooks';
import { relativeDayLabel, scheduleSummary, weekDates, weekRangeLabel, type ScheduleSummary } from './model';
import './calendar.css';

type Selection = { kind: 'booking' | 'session'; id: Id } | null;

const CANCELLED_KEY = 'pohyb.cal.showCancelled';

function loadShowCancelled(): boolean {
  try {
    return localStorage.getItem(CANCELLED_KEY) !== '0';
  } catch {
    return true;
  }
}

/** Kalendář recepce: denní pohled po terapeutech, týdenní pohled jednoho terapeuta, čekací listina. */
export function CalendarScreen(): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const session = useSession();
  const actor = useActor();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const today = dateOf(now);
  const date: LocalDate = session.calendarDate ?? today;
  const view: 'day' | 'week' = session.calendarView === 'week' ? 'week' : 'day';

  const therapists = useMemo(() => clinic.therapists.filter((t) => t.active).sort((a, b) => a.order - b.order), [clinic.therapists]);
  const filter: Id | 'all' =
    session.calendarTherapist !== 'all' && therapists.some((t) => t.id === session.calendarTherapist) ? session.calendarTherapist : 'all';
  const ownId = actor.therapistId && therapists.some((t) => t.id === actor.therapistId) ? actor.therapistId : undefined;
  const focusId: Id | undefined = filter !== 'all' ? filter : ownId ?? therapists[0]?.id;
  const single = view === 'week' || filter !== 'all' || isPhone;
  const focus = therapists.find((t) => t.id === focusId);

  const [selection, setSelection] = useState<Selection>(null);
  const [create, setCreate] = useState<NewBookingInitial | null>(null);
  const [move, setMove] = useState<MoveRequest | null>(null);
  const [showCancelled, setShowCancelledState] = useState(loadShowCancelled);
  const setShowCancelled = (v: boolean): void => {
    setShowCancelledState(v);
    try {
      localStorage.setItem(CANCELLED_KEY, v ? '1' : '0');
    } catch {
      /* bez úložiště */
    }
  };

  const dates: LocalDate[] = useMemo(() => (view === 'week' ? weekDates(clinic, date, focus) : [date]), [view, clinic, date, focus]);

  const schedules = useMemo(() => {
    const map = new Map<LocalDate, TherapistDay[]>();
    for (const d of dates) map.set(d, daySchedule(clinic, d, now));
    return map;
  }, [clinic, dates, now]);

  const go = (d: LocalDate): void => setSession({ calendarDate: d === today ? null : d });
  const openWeek = (therapistId: Id): void => setSession({ calendarView: 'week', calendarTherapist: therapistId });
  const openDay = (d: LocalDate): void => setSession({ calendarView: 'day', calendarDate: d === today ? null : d });

  const columns: GridColumn[] = useMemo(() => {
    if (view === 'week') {
      const out: GridColumn[] = [];
      for (const d of dates) {
        const day = schedules.get(d)?.find((x) => x.therapist.id === focusId);
        if (!day) continue;
        out.push({
          key: d,
          date: d,
          therapist: day.therapist,
          day,
          isToday: d === today,
          label: `${formatDateLong(d, { capital: true })} – ${therapistName(day.therapist)}`,
          header: <DayHead date={d} day={day} today={today} onOpen={() => openDay(d)} />,
        });
      }
      return out;
    }
    const list = (schedules.get(date) ?? []).filter((x) => !single || x.therapist.id === focusId);
    return list.map((day) => ({
      key: day.therapist.id,
      date,
      therapist: day.therapist,
      day,
      isToday: date === today,
      label: `${therapistName(day.therapist)}, ${formatDateLong(date)}`,
      header: <TherapistHead day={day} onWeek={() => openWeek(day.therapist.id)} />,
    }));
    // openDay / openWeek jsou bezestavové funkce nad session
  }, [view, dates, schedules, focusId, today, date, single]);

  const visibleTherapistIds = useMemo(() => [...new Set(columns.map((c) => c.therapist.id))], [columns]);

  const summary: ScheduleSummary = useMemo(() => {
    if (view === 'day' && !single) {
      const ds = daySummary(clinic, date, now);
      const windows = (schedules.get(date) ?? []).reduce((n, d) => n + d.freeWindows.length, 0);
      return { ...ds, freeWindows: windows };
    }
    return scheduleSummary(clinic, visibleTherapistIds, dates, now);
  }, [view, single, clinic, date, now, schedules, visibleTherapistIds, dates]);

  const handleMove = (bookingId: Id, therapistId: Id, start: LocalDateTime): void => {
    const b = getBooking(clinic, bookingId);
    if (!b) return;
    const check = checkBookingSlot(clinic, { serviceId: b.serviceId, therapistId, start, clientId: b.clientId, now, mode: 'staff', ignoreBookingId: b.id });
    if (check.errors.length) {
      toast.error('Sem termín přesunout nelze', { description: check.errors[0] });
      return;
    }
    setMove({ bookingId, therapistId, start });
  };

  if (!therapists.length) {
    return (
      <div className="page cal-page">
        <PageHeader title="Kalendář" />
        <EmptyState
          icon="users"
          title="V kalendáři zatím nejsou žádní terapeuti"
          text="Přidejte terapeuty a jejich pracovní dobu v sekci Tým a směny – potom se tu objeví jejich sloupce."
          action={
            <Button variant="primary" onClick={() => navigate({ name: 'tym' })}>
              Otevřít Tým a směny
            </Button>
          }
        />
      </div>
    );
  }

  const step = view === 'week' ? 7 : 1;
  const unit = view === 'week' ? 'týden' : 'den';
  const isCurrent = dates.includes(today);
  const title = view === 'day' ? formatDateLong(date, { capital: true }) : weekRangeLabel(dates[0], dates[dates.length - 1]);
  const subtitle =
    view === 'day'
      ? relativeDayLabel(date, today) + (single && focus ? ` · ${therapistName(focus)}` : '')
      : `Týdenní rozvrh · ${focus ? therapistName(focus) : ''}`;

  const legend = (
    <div className="cal-legend">
      <div className="legend">
        {[...clinic.categories]
          .sort((a, b) => a.order - b.order)
          .map((c) => (
            <Swatch key={c.id} tone={c.tone}>
              {c.name}
            </Swatch>
          ))}
        <Swatch tone="break">Pauza</Swatch>
        <Swatch tone="free">Volné okno</Swatch>
      </div>
      <span className="spacer" />
      <Switch checked={showCancelled} onChange={setShowCancelled} label="Zrušené termíny" labelPosition="end" className="cal-legend__switch" />
      <span className="cal-legend__grid">Mřížka 15 min</span>
    </div>
  );

  return (
    <div className="page cal-page">
      <PageHeader
        title={<span className="cal-title">{title}</span>}
        subtitle={subtitle}
        actions={
          <div className="cal-toolbar">
            <div className="cal-nav" role="group" aria-label="Posun v kalendáři">
              <IconButton icon="chevronLeft" variant="outline" label={view === 'week' ? 'Předchozí týden' : 'Předchozí den'} onClick={() => go(addDays(date, -step))} />
              <Button variant="secondary" onClick={() => go(today)} disabled={isCurrent} title={isCurrent ? `Zobrazen aktuální ${unit}` : undefined}>
                Dnes
              </Button>
              <IconButton icon="chevronRight" variant="outline" label={view === 'week' ? 'Následující týden' : 'Následující den'} onClick={() => go(addDays(date, step))} />
            </div>
            <Input
              type="date"
              value={date}
              aria-label="Přejít na datum"
              className="cal-dateinput"
              onValueChange={(v) => {
                if (/^\d{4}-\d{2}-\d{2}$/.test(v)) go(v);
              }}
            />
            <Segmented
              aria-label="Zobrazení kalendáře"
              value={view}
              onChange={(v) => setSession({ calendarView: v })}
              options={[
                { value: 'day', label: 'Den' },
                { value: 'week', label: 'Týden' },
              ]}
            />
            {!isPhone && (
              <Select
                aria-label="Terapeut"
                prefix="Terapeut:"
                inline
                className="cal-filter"
                value={view === 'week' ? focusId ?? '' : filter}
                onValueChange={(v) => setSession({ calendarTherapist: v })}
                options={[
                  ...(view === 'day' ? [{ value: 'all', label: 'Všichni' }] : []),
                  ...therapists.map((t) => ({ value: t.id, label: therapistName(t) })),
                ]}
              />
            )}
          </div>
        }
      />

      {isPhone && focusId && (
        <Segmented
          aria-label="Terapeut"
          className="cal-phonepick"
          value={focusId}
          onChange={(id) => setSession({ calendarTherapist: id })}
          options={therapists.map((t) => ({ value: t.id, label: therapistShort(t) }))}
        />
      )}

      <SummaryLine summary={summary} showLive={isCurrent} showWindows={dates[dates.length - 1] >= today} week={view === 'week'} />

      <div className="split cal-split">
        <div className="split__main">
          {columns.length === 0 ? (
            <EmptyState icon="calendar" title="Pro tento výběr není co zobrazit" text="Terapeut je neaktivní nebo nemá v tomto týdnu žádný den." />
          ) : (
            <TimeGrid
              columns={columns}
              now={now}
              ppm={1}
              selectedId={selection?.id ?? null}
              showCancelled={showCancelled}
              colMinWidth={view === 'week' ? 118 : single ? 220 : 140}
              ariaLabel={view === 'week' ? `Týdenní rozvrh – ${focus ? therapistName(focus) : ''}` : `Rozvrh terapeutů – ${formatDateLong(date)}`}
              scrollKey={`${view}|${dates[0]}|${columns.length}`}
              footer={legend}
              onOpenBooking={(id) => setSelection({ kind: 'booking', id })}
              onOpenSession={(id) => setSelection({ kind: 'session', id })}
              onCreate={(therapistId, start) => setCreate({ therapistId, start })}
              onMove={handleMove}
            />
          )}
        </div>
        <SidePanel
          dates={dates}
          therapistIds={visibleTherapistIds.length ? visibleTherapistIds : therapists.map((t) => t.id)}
          now={now}
          onCreate={(therapistId, start) => setCreate({ therapistId, start })}
          onOpenSession={(id) => setSelection({ kind: 'session', id })}
        />
      </div>

      <BookingDrawer bookingId={selection?.kind === 'booking' ? selection.id : null} onClose={() => setSelection(null)} />
      <SessionDrawer
        sessionId={selection?.kind === 'session' ? selection.id : null}
        onClose={() => setSelection(null)}
        onOpenBooking={(id) => setSelection({ kind: 'booking', id })}
      />
      <NewBookingDialog open={!!create} initial={create ?? undefined} onClose={() => setCreate(null)} />
      <MoveDialog request={move} onClose={() => setMove(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Souhrn                                                              */
/* ------------------------------------------------------------------ */

function SummaryLine({ summary: s, showLive, showWindows, week }: { summary: ScheduleSummary; showLive: boolean; showWindows: boolean; week: boolean }): JSX.Element {
  return (
    <p className="statline cal-statline" aria-label={week ? 'Souhrn týdne' : 'Souhrn dne'}>
      <span>
        <strong>{s.bookings}</strong> {plural(s.bookings, ['rezervace', 'rezervace', 'rezervací'])}
      </span>
      {s.groupSessions > 0 && (
        <span>
          <strong>{s.groupSessions}</strong> {plural(s.groupSessions, ['skupinová lekce', 'skupinové lekce', 'skupinových lekcí'])} (
          {countLabel(s.groupParticipants, ['účastník', 'účastníci', 'účastníků'])})
        </span>
      )}
      <span>
        obsazenost <strong>{formatPercent(s.occupancy)}</strong>
      </span>
      {showWindows && (
        <span>
          volná okna <strong>{s.freeWindows}</strong>
        </span>
      )}
      <span>
        omluvenky <strong>{s.excused}</strong>
      </span>
      <span>
        nedostavení <strong className={cx(s.noShows > 0 && 'text-danger')}>{s.noShows}</strong>
      </span>
      {showLive && (
        <span className="cal-live">
          <span className="cal-dot cal-dot--accent" aria-hidden="true" />
          právě probíhá <strong>{s.inProgress}</strong>
        </span>
      )}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Hlavičky sloupců                                                    */
/* ------------------------------------------------------------------ */

function TherapistHead({ day, onWeek }: { day: TherapistDay; onWeek: () => void }): JSX.Element {
  const clinic = useClinic();
  const t = day.therapist;
  const room = getRoom(clinic, t.roomId);
  const shift = day.shift ? `${formatTime(day.shift.start)}–${formatTime(day.shift.end)}` : 'nepracuje';
  const off = day.working.length === 0;
  return (
    <div className="cal-th" title={`${t.focus}${room ? ' · ' + room.name : ''} · ${shift}`}>
      <div className="cal-th__who">
        <TherapistAvatar therapist={t} size="xs" />
        <div className="cal-th__text">
          <button type="button" className="cal-th__name" onClick={onWeek} title="Zobrazit týdenní rozvrh">
            {therapistName(t)}
          </button>
          <span className="cal-th__meta">
            {t.focus}
            {room ? ` · ${room.name}` : ''}
          </span>
        </div>
      </div>
      <div className="cal-th__occ">
        {off ? (
          <span className="cal-th__off">{day.shift ? 'Nepřítomnost' : 'Nepracuje'}</span>
        ) : (
          <>
            <Progress value={day.occupancy} size="sm" label={`Obsazenost – ${therapistName(t)}`} className="cal-th__bar" />
            <span className="cal-th__pct tnum">{formatPercent(day.occupancy)}</span>
          </>
        )}
      </div>
    </div>
  );
}

function DayHead({ date, day, today, onOpen }: { date: LocalDate; day: TherapistDay; today: LocalDate; onOpen: () => void }): JSX.Element {
  const isToday = date === today;
  const off = day.working.length === 0;
  return (
    <button type="button" className={cx('cal-dh', isToday && 'is-today', date < today && 'is-past')} onClick={onOpen} aria-label={`${formatDateLong(date, { capital: true })} – otevřít denní pohled`}>
      <span className="cal-dh__top">
        <span className="cal-dh__date tnum">{formatDayShort(date)}</span>
        {isToday && (
          <Badge tone="accent" size="sm">
            Dnes
          </Badge>
        )}
      </span>
      {off ? (
        <span className="cal-th__off">{day.shift ? 'Nepřítomnost' : 'Nepracuje'}</span>
      ) : (
        <span className="cal-th__occ">
          <Progress value={day.occupancy} size="sm" label={`Obsazenost ${formatDayShort(date)}`} className="cal-th__bar" />
          <span className="cal-th__pct tnum">{formatPercent(day.occupancy)}</span>
        </span>
      )}
    </button>
  );
}
