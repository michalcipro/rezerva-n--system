import { useRef } from 'react';
import type { TimeRange, Weekday, WeekSchedule } from '../../domain/types';
import { formatDuration } from '../../engine/format';
import { minutesOfDay, timeFromMinutes } from '../../engine/time';
import { Button, Icon, IconButton, Menu, Switch, type MenuEntry } from '../../ui';
import { WEEKDAYS, cx, dayMinutes, weekdayName, type DayValidation } from './helpers';
import { TimeSelect } from './shared';

export interface WeekValue {
  workingHours: WeekSchedule;
  breaks: WeekSchedule;
}

const WORKDAYS: Weekday[] = [0, 1, 2, 3, 4];
const DEFAULT_SHIFT: TimeRange = { start: '08:00', end: '16:00' };
const LAST = 23 * 60;

const copyRanges = (r: readonly TimeRange[]): TimeRange[] => r.map((x) => ({ start: x.start, end: x.end }));
const clampMin = (m: number): number => Math.max(5 * 60, Math.min(LAST, Math.round(m / 15) * 15));

/** Pracovní doba po dnech: více bloků za den, pauzy, kopírování mezi dny. */
export function WeekScheduleEditor({
  value,
  onChange,
  validation,
}: {
  value: WeekValue;
  onChange: (next: WeekValue) => void;
  validation: Record<Weekday, DayValidation>;
}): JSX.Element {
  // Při vypnutí dne si pamatujeme jeho rozvrh, aby se po opětovném zapnutí obnovil.
  const parked = useRef<Partial<Record<Weekday, { work: TimeRange[]; breaks: TimeRange[] }>>>({});

  const update = (wd: Weekday, work: TimeRange[], breaks: TimeRange[]): void =>
    onChange({
      workingHours: { ...value.workingHours, [wd]: work },
      breaks: { ...value.breaks, [wd]: breaks },
    });

  const toggleDay = (wd: Weekday, on: boolean): void => {
    if (!on) {
      parked.current[wd] = { work: copyRanges(value.workingHours[wd] ?? []), breaks: copyRanges(value.breaks[wd] ?? []) };
      update(wd, [], []);
      return;
    }
    const saved = parked.current[wd];
    if (saved && saved.work.length) {
      update(wd, saved.work, saved.breaks);
      return;
    }
    // jinak převzít nejbližší předchozí pracovní den, případně výchozí směnu
    for (let i = 1; i < 7; i++) {
      const prev = ((wd - i + 7) % 7) as Weekday;
      const w = value.workingHours[prev] ?? [];
      if (w.length) {
        update(wd, copyRanges(w), copyRanges(value.breaks[prev] ?? []));
        return;
      }
    }
    update(wd, [{ ...DEFAULT_SHIFT }], []);
  };

  const copyTo = (from: Weekday, targets: Weekday[]): void => {
    const wh = { ...value.workingHours };
    const br = { ...value.breaks };
    for (const t of targets) {
      if (t === from) continue;
      wh[t] = copyRanges(value.workingHours[from] ?? []);
      br[t] = copyRanges(value.breaks[from] ?? []);
    }
    onChange({ workingHours: wh, breaks: br });
  };

  const setRange = (wd: Weekday, kind: 'work' | 'break', index: number, patch: Partial<TimeRange>): void => {
    const work = copyRanges(value.workingHours[wd] ?? []);
    const breaks = copyRanges(value.breaks[wd] ?? []);
    const list = kind === 'work' ? work : breaks;
    list[index] = { ...list[index], ...patch };
    update(wd, work, breaks);
  };

  const removeRange = (wd: Weekday, kind: 'work' | 'break', index: number): void => {
    const work = copyRanges(value.workingHours[wd] ?? []);
    const breaks = copyRanges(value.breaks[wd] ?? []);
    if (kind === 'work') work.splice(index, 1);
    else breaks.splice(index, 1);
    update(wd, work, work.length ? breaks : []);
  };

  const addBlock = (wd: Weekday): void => {
    const work = copyRanges(value.workingHours[wd] ?? []);
    const lastEnd = work.reduce((m, r) => Math.max(m, minutesOfDay(r.end)), 0);
    const start = clampMin(lastEnd ? lastEnd + 60 : 8 * 60);
    const end = clampMin(start + 4 * 60);
    work.push(start < end ? { start: timeFromMinutes(start), end: timeFromMinutes(end) } : { start: '17:00', end: '20:00' });
    update(wd, work, copyRanges(value.breaks[wd] ?? []));
  };

  const addBreak = (wd: Weekday): void => {
    const work = value.workingHours[wd] ?? [];
    const breaks = copyRanges(value.breaks[wd] ?? []);
    const longest = [...work].sort((a, b) => minutesOfDay(b.end) - minutesOfDay(b.start) - (minutesOfDay(a.end) - minutesOfDay(a.start)))[0];
    let start = 12 * 60;
    if (longest) {
      const a = minutesOfDay(longest.start);
      const z = minutesOfDay(longest.end);
      if (!(a <= start && start + 30 <= z)) start = clampMin(a + (z - a) / 2 - 15);
    }
    breaks.push({ start: timeFromMinutes(start), end: timeFromMinutes(start + 30) });
    update(wd, copyRanges(work), breaks);
  };

  return (
    <div className="set-days">
      {WEEKDAYS.map((wd) => {
        const work = value.workingHours[wd] ?? [];
        const breaks = value.breaks[wd] ?? [];
        const on = work.length > 0;
        const v = validation[wd];
        const name = weekdayName(wd);
        const copyMenu: MenuEntry[] = [
          { type: 'label', label: `Použít rozvrh – ${name.toLowerCase()}` },
          { id: 'workdays', label: 'Na všechny pracovní dny (Po–Pá)', icon: 'copy', onSelect: () => copyTo(wd, WORKDAYS) },
          { id: 'all', label: 'Na celý týden (Po–Ne)', icon: 'copy', onSelect: () => copyTo(wd, [...WEEKDAYS]) },
          { type: 'separator' },
          ...WEEKDAYS.filter((x) => x !== wd).map(
            (x): MenuEntry => ({ id: `d${x}`, label: `Jen na ${weekdayName(x).toLowerCase()}`, onSelect: () => copyTo(wd, [x]) }),
          ),
        ];
        return (
          <div key={wd} className={cx('set-day', !on && 'is-off', v.hasError && 'has-error')} role="group" aria-label={name}>
            <div className="set-day__head">
              <Switch checked={on} onChange={(c) => toggleDay(wd, c)} label={name} labelPosition="end" className="set-day__switch" />
              <span className="set-day__total tnum">{on ? formatDuration(dayMinutes(work, breaks)) : 'Volno'}</span>
              <Menu
                label={`Kopírovat rozvrh – ${name.toLowerCase()}`}
                trigger={<IconButton icon="copy" size="sm" label={`Kopírovat rozvrh – ${name.toLowerCase()}`} disabled={!on} />}
                items={copyMenu}
              />
            </div>
            {on && (
              <div className="set-day__body">
                {work.map((r, i) => (
                  <RangeRow
                    key={`w${i}`}
                    kind="work"
                    range={r}
                    error={v.work[i]}
                    label={`${name} – ${work.length > 1 ? `${i + 1}. blok` : 'pracovní doba'}`}
                    onChange={(p) => setRange(wd, 'work', i, p)}
                    onRemove={() => removeRange(wd, 'work', i)}
                  />
                ))}
                {breaks.map((r, i) => (
                  <RangeRow
                    key={`b${i}`}
                    kind="break"
                    range={r}
                    error={v.breaks[i]}
                    label={`${name} – pauza${breaks.length > 1 ? ` ${i + 1}` : ''}`}
                    onChange={(p) => setRange(wd, 'break', i, p)}
                    onRemove={() => removeRange(wd, 'break', i)}
                  />
                ))}
                <div className="set-day__add">
                  <Button size="sm" variant="ghost" icon="plus" onClick={() => addBlock(wd)} aria-label={`Přidat další blok práce – ${name.toLowerCase()}`}>
                    Další blok
                  </Button>
                  <Button size="sm" variant="ghost" icon="pause" onClick={() => addBreak(wd)} aria-label={`Přidat pauzu – ${name.toLowerCase()}`}>
                    Pauza
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RangeRow({
  kind,
  range,
  error,
  label,
  onChange,
  onRemove,
}: {
  kind: 'work' | 'break';
  range: TimeRange;
  error: string | null;
  label: string;
  onChange: (patch: Partial<TimeRange>) => void;
  onRemove: () => void;
}): JSX.Element {
  return (
    <div className={cx('set-range', `set-range--${kind}`)}>
      <span className="set-range__kind" aria-hidden="true">
        {kind === 'work' ? 'Práce' : 'Pauza'}
      </span>
      <span className="set-range__times">
        <TimeSelect value={range.start} label={`${label} – od`} invalid={!!error} onChange={(start) => onChange({ start })} />
        <span className="set-range__dash" aria-hidden="true">
          –
        </span>
        <TimeSelect value={range.end} label={`${label} – do`} invalid={!!error} onChange={(end) => onChange({ end })} />
      </span>
      <IconButton icon="x" size="sm" label={`Odebrat: ${label}`} onClick={onRemove} />
      {error && (
        <span className="set-range__error field__error" role="alert">
          <Icon name="alertCircle" size={14} />
          <span>{error}</span>
        </span>
      )}
    </div>
  );
}
