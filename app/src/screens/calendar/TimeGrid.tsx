import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { Id, LocalDate, LocalDateTime } from '../../domain/types';
import { checkBookingSlot, type SlotCheck } from '../../engine/availability';
import { formatTime, formatTimeRange } from '../../engine/format';
import { getBooking, getTherapist, therapistShort } from '../../engine/selectors';
import { addMinutes, combine, diffMinutes, timeFromMinutes } from '../../engine/time';
import { useClinic } from '../../store/hooks';
import { cssVars, cx } from '../../ui';
import { BlockedBlock, BookingBlock, FreeBlock, GhostBlock, SessionBlock } from './blocks';
import {
  GUTTER_PX,
  STEP_MIN,
  activeOfferGroups,
  clamp,
  columnLayout,
  floorStep,
  gridRange,
  minuteIn,
  offerKey,
  snap,
  type ColumnModel,
  type GridRange,
} from './model';

export interface GridColumn extends ColumnModel {
  header: ReactNode;
  isToday: boolean;
  /** Přístupný název sloupce, např. „Mgr. Tereza Malá, středa 14. října“. */
  label: string;
}

export interface TimeGridProps {
  columns: GridColumn[];
  now: LocalDateTime;
  /** Pixely na minutu (1 = 60 px na hodinu). */
  ppm: number;
  selectedId: Id | null;
  showCancelled: boolean;
  colMinWidth: number;
  ariaLabel: string;
  /** Změna klíče posune rozvrh na aktuální čas (nebo začátek dne). */
  scrollKey: string;
  footer?: ReactNode;
  onOpenBooking: (id: Id) => void;
  onOpenSession: (id: Id) => void;
  onCreate: (therapistId: Id, start: LocalDateTime) => void;
  onMove: (bookingId: Id, therapistId: Id, start: LocalDateTime) => void;
}

interface DropTarget {
  colKey: string;
  therapistId: Id;
  date: LocalDate;
  startMin: number;
}

interface DragData {
  bookingId: Id;
  pointerId: number;
  originX: number;
  originY: number;
  grabOffsetMin: number;
  durationMin: number;
  originColKey: string;
  originStartMin: number;
  active: boolean;
  lastX: number;
  lastY: number;
  target: DropTarget | null;
}

const sameTarget = (a: DropTarget | null, b: DropTarget | null): boolean =>
  a === b || (!!a && !!b && a.colKey === b.colKey && a.startMin === b.startMin);

const DRAG_THRESHOLD = 5;
const EDGE = 44;

export function TimeGrid(props: TimeGridProps): JSX.Element {
  const { columns, now, ppm, selectedId, showCancelled, colMinWidth, ariaLabel, scrollKey, footer } = props;
  const clinic = useClinic();
  const hintId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef(new Map<string, HTMLDivElement>());
  const [hover, setHover] = useState<{ colKey: string; startMin: number } | null>(null);
  const [dragView, setDragView] = useState<{ bookingId: Id; target: DropTarget | null } | null>(null);
  const suppressClick = useRef(false);

  const range: GridRange = useMemo(() => gridRange(columns), [columns]);
  const offers = useMemo(() => new Map(activeOfferGroups(clinic, now).map((g) => [g.key, g])), [clinic, now]);
  const layouts = useMemo(
    () => columns.map((col) => columnLayout(clinic, col, range, now, { showCancelled, offers })),
    [clinic, columns, range, now, showCancelled, offers],
  );

  const topOf = (min: number): number => (min - range.startMin) * ppm;
  const heightOf = (startMin: number, endMin: number): number => Math.max(11, (endMin - startMin) * ppm - 2);
  const place = (startMin: number, endMin: number, mode: 'full' | 'left' | 'right' = 'full', lane = 0, lanes = 1): CSSProperties => {
    const base: CSSProperties = { position: 'absolute', top: topOf(startMin) + 1, height: heightOf(startMin, endMin) };
    if (mode === 'right') return { ...base, left: '55%', right: 3, width: 'auto' };
    if (mode === 'left') return { ...base, left: 3, right: 'calc(45% + 2px)', width: 'auto' };
    if (lanes <= 1) return { ...base, left: 3, right: 3, width: 'auto' };
    return {
      ...base,
      left: `calc(3px + (100% - 6px) * ${lane / lanes})`,
      width: `calc((100% - 6px) / ${lanes} - 2px)`,
    };
  };

  /* ---------------- přetahování (pointer events) ---------------- */
  const live = useRef({ props, range, ppm, columns });
  live.current = { props, range, ppm, columns };
  const drag = useRef<DragData | null>(null);
  const raf = useRef<number | null>(null);

  const dnd = useMemo(() => {
    const targetAt = (x: number, y: number): DropTarget | null => {
      const d = drag.current;
      if (!d) return null;
      const { columns: cols, range: r, ppm: scale } = live.current;
      for (const col of cols) {
        const el = colRefs.current.get(col.key);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (x < rect.left || x >= rect.right) continue;
        const raw = r.startMin + (y - rect.top) / scale - d.grabOffsetMin;
        const startMin = clamp(snap(raw, STEP_MIN), r.startMin, r.endMin - Math.min(d.durationMin, r.endMin - r.startMin));
        return { colKey: col.key, therapistId: col.therapist.id, date: col.date, startMin };
      }
      return null;
    };
    const update = (): void => {
      const d = drag.current;
      if (!d || !d.active) return;
      const t = targetAt(d.lastX, d.lastY);
      if (!sameTarget(t, d.target)) {
        d.target = t;
        setDragView({ bookingId: d.bookingId, target: t });
      }
    };
    const tick = (): void => {
      const d = drag.current;
      const sc = scrollRef.current;
      if (!d || !d.active || !sc) {
        raf.current = null;
        return;
      }
      const rect = sc.getBoundingClientRect();
      let dx = 0;
      let dy = 0;
      const leftEdge = rect.left + GUTTER_PX;
      if (d.lastX < leftEdge + EDGE) dx = -Math.ceil((leftEdge + EDGE - d.lastX) / 4);
      else if (d.lastX > rect.right - EDGE) dx = Math.ceil((d.lastX - (rect.right - EDGE)) / 4);
      if (d.lastY < rect.top + EDGE + 60) dy = -Math.ceil((rect.top + EDGE + 60 - d.lastY) / 5);
      else if (d.lastY > rect.bottom - EDGE) dy = Math.ceil((d.lastY - (rect.bottom - EDGE)) / 5);
      if (dx || dy) {
        const beforeL = sc.scrollLeft;
        const beforeT = sc.scrollTop;
        sc.scrollLeft += clamp(dx, -18, 18);
        sc.scrollTop += clamp(dy, -18, 18);
        if (sc.scrollLeft !== beforeL || sc.scrollTop !== beforeT) update();
      }
      raf.current = requestAnimationFrame(tick);
    };
    const teardown = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey, true);
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
      document.body.classList.remove('cal-is-dragging');
    };
    const finish = (commit: boolean): void => {
      const d = drag.current;
      drag.current = null;
      teardown();
      if (!d) return;
      if (d.active) {
        suppressClick.current = true;
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 0);
        setDragView(null);
        if (commit && d.target && (d.target.colKey !== d.originColKey || d.target.startMin !== d.originStartMin)) {
          live.current.props.onMove(d.bookingId, d.target.therapistId, combine(d.target.date, timeFromMinutes(d.target.startMin)));
        }
      }
    };
    function onMove(e: PointerEvent): void {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      if (!d.active) {
        if (Math.hypot(e.clientX - d.originX, e.clientY - d.originY) < DRAG_THRESHOLD) return;
        d.active = true;
        document.body.classList.add('cal-is-dragging');
        setHover(null);
        if (raf.current === null) raf.current = requestAnimationFrame(tick);
      }
      e.preventDefault();
      update();
    }
    function onUp(e: PointerEvent): void {
      if (drag.current && e.pointerId === drag.current.pointerId) finish(true);
    }
    function onCancel(): void {
      finish(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && drag.current) {
        e.preventDefault();
        e.stopPropagation();
        finish(false);
      }
    }
    const start = (e: ReactPointerEvent<HTMLElement>, info: { bookingId: Id; colKey: string; startMin: number; durationMin: number }): void => {
      if (e.button !== 0 || e.pointerType === 'touch' || drag.current) return;
      const colEl = colRefs.current.get(info.colKey);
      if (!colEl) return;
      const rect = colEl.getBoundingClientRect();
      const pointerMin = live.current.range.startMin + (e.clientY - rect.top) / live.current.ppm;
      drag.current = {
        bookingId: info.bookingId,
        pointerId: e.pointerId,
        originX: e.clientX,
        originY: e.clientY,
        grabOffsetMin: pointerMin - info.startMin,
        durationMin: info.durationMin,
        originColKey: info.colKey,
        originStartMin: info.startMin,
        active: false,
        lastX: e.clientX,
        lastY: e.clientY,
        target: null,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* starší prohlížeče */
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('keydown', onKey, true);
    };
    return { start, cancel: () => finish(false) };
  }, []);

  useEffect(() => () => dnd.cancel(), [dnd]);

  const preview = useMemo(() => {
    if (!dragView?.target) return null;
    const b = getBooking(clinic, dragView.bookingId);
    if (!b) return null;
    const t = dragView.target;
    const start = combine(t.date, timeFromMinutes(t.startMin));
    const duration = diffMinutes(b.end, b.start);
    const check: SlotCheck = checkBookingSlot(clinic, {
      serviceId: b.serviceId,
      therapistId: t.therapistId,
      start,
      clientId: b.clientId,
      now,
      mode: 'staff',
      ignoreBookingId: b.id,
    });
    const moved = t.therapistId !== b.therapistId;
    return { target: t, start, end: addMinutes(start, duration), duration, check, moved };
  }, [dragView, clinic, now]);

  /* ---------------- posun na aktuální čas ---------------- */
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc || sc.scrollHeight <= sc.clientHeight + 4) return;
    const today = live.current.columns.find((c) => c.isToday);
    let target = live.current.range.startMin;
    if (today) target = minuteIn(now, today.date) - 60;
    sc.scrollTop = Math.max(0, (target - live.current.range.startMin) * live.current.ppm);
    // Posun jen při změně dne / pohledu, ne každou minutu.
  }, [scrollKey]);

  /* ---------------- vykreslení ---------------- */
  const totalMin = range.endMin - range.startMin;
  const bodyHeight = totalMin * ppm;
  const hours: number[] = [];
  for (let m = range.startMin; m < range.endMin; m += 60) hours.push(m);
  const lines: number[] = [];
  for (let m = range.startMin + STEP_MIN; m < range.endMin; m += STEP_MIN) lines.push(m);
  const allToday = columns.length > 0 && columns.every((c) => c.isToday);
  const todayCol = columns.find((c) => c.isToday);
  const nowMin = todayCol ? minuteIn(now, todayCol.date) : -1;
  const nowVisible = !!todayCol && nowMin >= range.startMin && nowMin <= range.endMin;

  const gridVars = cssVars({
    '--cal-cols': columns.length,
    '--cal-col-min': `${colMinWidth}px`,
    '--cal-gutter': `${GUTTER_PX}px`,
  });

  const onColumnMove = (e: ReactMouseEvent<HTMLDivElement>, col: GridColumn): void => {
    if (drag.current?.active) return;
    if ((e.target as HTMLElement).closest('.event')) {
      if (hover) setHover(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const min = floorStep(range.startMin + (e.clientY - rect.top) / ppm);
    const startMin = clamp(min, range.startMin, range.endMin - STEP_MIN);
    if (!hover || hover.colKey !== col.key || hover.startMin !== startMin) setHover({ colKey: col.key, startMin });
  };

  const onColumnClick = (e: ReactMouseEvent<HTMLDivElement>, col: GridColumn): void => {
    if (suppressClick.current) return;
    if ((e.target as HTMLElement).closest('.event')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const min = clamp(floorStep(range.startMin + (e.clientY - rect.top) / ppm), range.startMin, range.endMin - STEP_MIN);
    props.onCreate(col.therapist.id, combine(col.date, timeFromMinutes(min)));
  };

  const open = (fn: () => void) => () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    fn();
  };

  return (
    <div className="cal-board">
      <p id={hintId} className="visually-hidden">
        Termín lze přesunout přetažením myší. Z klávesnice otevřete detail rezervace a zvolte Přesunout.
      </p>
      <div
        ref={scrollRef}
        className={cx('cal-scroll', dragView && 'is-dragging')}
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
        style={gridVars}
      >
        <div className="cal-canvas">
          <div className="cal-head">
            <div className="cal-corner" aria-hidden="true" />
            {columns.map((col) => (
              <div key={col.key} className={cx('cal-head__cell', col.isToday && !allToday && 'is-today')}>
                {col.header}
              </div>
            ))}
          </div>

          <div className="cal-body" style={{ height: bodyHeight }}>
            <div className="cal-gutter" aria-hidden="true">
              {hours.map((m) => (
                <span key={m} className="cal-hour-label" style={{ top: topOf(m) + 3 }}>
                  {formatTime(timeFromMinutes(m))}
                </span>
              ))}
              {nowVisible && (
                <span className="cal-now-badge" style={{ top: topOf(nowMin) - 9, left: 4 }}>
                  {formatTime(now)}
                </span>
              )}
            </div>

            <div className="cal-lines" aria-hidden="true">
              {lines.map((m) => (
                <div key={m} className={cx('cal-line', m % 60 === 0 && 'cal-line--hour')} style={{ top: topOf(m) }} />
              ))}
            </div>

            {columns.map((col, ci) => {
              const lay = layouts[ci];
              return (
                <div
                  key={col.key}
                  ref={(el) => {
                    if (el) colRefs.current.set(col.key, el);
                    else colRefs.current.delete(col.key);
                  }}
                  className={cx('cal-col', col.isToday && !allToday && 'is-today', lay.closedLabel && 'is-closed')}
                  role="group"
                  aria-label={col.label}
                  onMouseMove={(e) => onColumnMove(e, col)}
                  onMouseLeave={() => setHover(null)}
                  onClick={(e) => onColumnClick(e, col)}
                >
                  {lay.offhours.map((s) => (
                    <div key={'o' + s.startMin} className="cal-offhours" style={{ top: topOf(s.startMin), height: (s.endMin - s.startMin) * ppm }} aria-hidden="true" />
                  ))}
                  {lay.closedLabel && lay.items.length === 0 && (
                    <div className="cal-col__closed" aria-hidden="true">
                      {lay.closedLabel}
                    </div>
                  )}
                  {lay.timeOff.map((s) => (
                    <BlockedBlock
                      key={'t' + s.startMin}
                      label={s.label}
                      minutes={s.endMin - s.startMin}
                      timeRange={s.endMin - s.startMin >= 600 ? 'celý den' : `${formatTime(timeFromMinutes(s.startMin))}–${formatTime(timeFromMinutes(s.endMin))}`}
                      ppm={ppm}
                      style={place(s.startMin, s.endMin)}
                    />
                  ))}
                  {lay.breaks.map((s) => (
                    <BlockedBlock
                      key={'b' + s.startMin}
                      label={s.label}
                      minutes={s.endMin - s.startMin}
                      timeRange={`${formatTime(timeFromMinutes(s.startMin))}–${formatTime(timeFromMinutes(s.endMin))}`}
                      ppm={ppm}
                      style={place(s.startMin, s.endMin)}
                    />
                  ))}
                  {lay.frees.map((f) => (
                    <FreeBlock
                      key={'f' + f.startMin}
                      start={f.start}
                      end={f.end}
                      ppm={ppm}
                      style={place(f.startMin, f.endMin, f.narrow ? 'left' : 'full')}
                      onOpen={open(() => props.onCreate(col.therapist.id, f.start))}
                    />
                  ))}
                  {lay.ghosts.map((g) => (
                    <GhostBlock
                      key={g.booking.id}
                      booking={g.booking}
                      offer={g.offer}
                      ppm={ppm}
                      now={now}
                      selected={selectedId === g.booking.id}
                      style={place(g.startMin, g.endMin, 'right')}
                      onOpen={open(() => props.onOpenBooking(g.booking.id))}
                    />
                  ))}
                  {lay.items.map((p) => {
                    if (p.item.kind === 'session') {
                      const ses = p.item.session;
                      return (
                        <SessionBlock
                          key={ses.id}
                          session={ses}
                          offer={offers.get(offerKey(ses.therapistId, ses.start)) ?? null}
                          ppm={ppm}
                          now={now}
                          selected={selectedId === ses.id}
                          style={place(p.startMin, p.endMin, 'full', p.lane, p.lanes)}
                          onOpen={open(() => props.onOpenSession(ses.id))}
                        />
                      );
                    }
                    const b = p.item.booking;
                    const draggable = b.status === 'confirmed';
                    return (
                      <BookingBlock
                        key={b.id}
                        booking={b}
                        ppm={ppm}
                        now={now}
                        selected={selectedId === b.id}
                        draggable={draggable}
                        dragging={dragView?.bookingId === b.id}
                        describedBy={hintId}
                        style={place(p.startMin, p.endMin, 'full', p.lane, p.lanes)}
                        onOpen={open(() => props.onOpenBooking(b.id))}
                        onPointerDown={
                          draggable
                            ? (e) => dnd.start(e, { bookingId: b.id, colKey: col.key, startMin: p.startMin, durationMin: p.endMin - p.startMin })
                            : undefined
                        }
                      />
                    );
                  })}

                  {hover && hover.colKey === col.key && !dragView && (
                    <div className="cal-hover" style={{ top: topOf(hover.startMin) + 1, height: STEP_MIN * ppm - 1 }} aria-hidden="true">
                      <span className="cal-hover__label">+ {formatTime(timeFromMinutes(hover.startMin))}</span>
                    </div>
                  )}

                  {preview && preview.target.colKey === col.key && (
                    <div
                      className={cx(
                        'cal-drop',
                        preview.check.errors.length ? 'is-invalid' : preview.check.warnings.length ? 'is-warning' : 'is-valid',
                        topOf(preview.target.startMin) < 28 && 'is-top',
                      )}
                      style={{ top: topOf(preview.target.startMin) + 1, height: heightOf(preview.target.startMin, preview.target.startMin + preview.duration) }}
                      aria-hidden="true"
                    >
                      <span className="cal-drop__tag">
                        <strong>{formatTimeRange(preview.start, preview.end)}</strong>
                        {preview.moved && <span> · {therapistShort(getTherapist(clinic, preview.target.therapistId))}</span>}
                        {preview.check.errors[0] ? (
                          <span className="cal-drop__msg"> · {preview.check.errors[0]}</span>
                        ) : preview.check.warnings[0] ? (
                          <span className="cal-drop__msg"> · {preview.check.warnings[0]}</span>
                        ) : null}
                      </span>
                    </div>
                  )}

                  {col.isToday && !allToday && nowVisible && <div className="cal-now-line" style={{ top: topOf(nowMin) - 1 }} aria-hidden="true" />}
                </div>
              );
            })}

            {allToday && nowVisible && (
              <div className="cal-now-line cal-now-line--all" style={{ top: topOf(nowMin) - 1, left: GUTTER_PX - 4 }} aria-hidden="true" />
            )}
          </div>
        </div>
      </div>
      {footer}
      <div className="visually-hidden" aria-live="polite">
        {preview
          ? `${formatTimeRange(preview.start, preview.end)}${preview.check.errors[0] ? ', ' + preview.check.errors[0] : ''}`
          : ''}
      </div>
    </div>
  );
}
