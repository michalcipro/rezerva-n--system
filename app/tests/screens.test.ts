import { describe, expect, it } from 'vitest';
import type { GroupSession } from '../src/domain/types';
import { prepZ } from '../src/engine/format';
import type { GroupSessionOverview } from '../src/engine/groups';
import { emptyVisitSummary } from '../src/engine/visits';
import {
  clampCustom as clampGroupRange,
  dayMeta,
  freeShort,
  freeSpotsText,
  groupByDay,
  occupancyAria,
  occupancyText,
  resolveRange,
} from '../src/screens/groups/model';
import {
  applyPreset,
  clampCustom as clampVisitPeriod,
  csvCell,
  csvFileName,
  defaultPeriod,
  formatRangeText,
  parsePrefs,
  resolvePeriod,
  shiftPeriod,
  summaryCsv,
  toCsv,
} from '../src/screens/visits/model';
import { createBaseState } from '../src/engine/defaults';

const sp = (x: string): string => x.replace(/[\u00a0\u202f]/g, ' ');
const TODAY = '2026-11-04'; // středa

describe('předložka z / ze před číslem', () => {
  it('řídí se výslovností číslovky', () => {
    const ze = [2, 3, 4, 6, 7, 12, 13, 14, 16, 17, 20, 34, 47, 60, 72, 100, 120, 199, 200, 300, 2000, 12000, 100000, 120000];
    const z = [0, 1, 5, 8, 9, 10, 11, 15, 18, 19, 50, 58, 80, 95, 500, 800, 1000, 1200, 1999, 5000, 10000, 15000, 1000000];
    for (const n of ze) expect([n, prepZ(n)]).toEqual([n, 'ze']);
    for (const n of z) expect([n, prepZ(n)]).toEqual([n, 'z']);
  });
});

/* ------------------------------------------------------------------ */
/* Skupinové lekce                                                     */
/* ------------------------------------------------------------------ */

function overview(start: string, capacity: number, booked: number, extra: Partial<GroupSessionOverview> = {}): GroupSessionOverview {
  const session = { id: 'ses_' + start, start, end: start, serviceId: 's_g', therapistId: 't_x', title: 'Lekce', capacity, roomId: null } as unknown as GroupSession;
  const free = Math.max(0, capacity - booked);
  return { session, serviceName: 'Lekce', therapistId: 't_x', capacity, booked, free, waitlist: 0, cancelled: false, past: false, fill: free === 0 ? 'full' : 'free', ...extra };
}

describe('Skupinové lekce – texty a rozsah', () => {
  it('obsazenost a volná místa česky', () => {
    expect(sp(occupancyText(7, 12))).toBe('7 ze 12 · 5 volných');
    expect(sp(occupancyText(5, 6))).toBe('5 ze 6 · 1 volné');
    expect(sp(occupancyText(8, 10))).toBe('8 z 10 · 2 volná');
    expect(sp(occupancyText(12, 12))).toBe('12 ze 12');
    expect(freeShort(0)).toBe('plno');
    expect(sp(freeSpotsText(1))).toBe('1 volné místo');
    expect(sp(freeSpotsText(3))).toBe('3 volná místa');
    expect(sp(freeSpotsText(8))).toBe('8 volných míst');
    expect(sp(occupancyAria(7, 12))).toBe('Obsazeno 7 míst ze 12, 5 volných míst');
    expect(sp(occupancyAria(5, 5))).toBe('Obsazeno 5 míst z 5, plně obsazeno');
    expect(occupancyAria(3, 6, true)).toBe('Termín je zrušený');
  });

  it('rozsah: tento týden, příštích 14 dní a omezený vlastní rozsah', () => {
    const week = resolveRange({ preset: 'week', offset: 0, customFrom: TODAY, customTo: TODAY }, TODAY);
    expect(week).toMatchObject({ from: '2026-11-02', to: '2026-11-09', last: '2026-11-08', label: 'Tento týden' });
    expect(resolveRange({ preset: 'week', offset: 1, customFrom: TODAY, customTo: TODAY }, TODAY).label).toBe('Příští týden');
    const next14 = resolveRange({ preset: 'next14', offset: 0, customFrom: TODAY, customTo: TODAY }, TODAY);
    expect(next14).toMatchObject({ from: TODAY, to: '2026-11-18', last: '2026-11-17', label: 'Příštích 14 dní' });
    // obrácený nebo neplatný konec → jeden den; víc než 92 dní se zkrátí
    expect(clampGroupRange('2026-11-10', '2026-11-01', TODAY)).toEqual({ from: '2026-11-10', to: '2026-11-10' });
    expect(clampGroupRange('nesmysl', '', TODAY)).toEqual({ from: TODAY, to: TODAY });
    expect(clampGroupRange('2026-11-01', '2027-06-01', TODAY)).toEqual({ from: '2026-11-01', to: '2027-01-31' });
  });

  it('termíny po dnech: zrušené se do volných míst nepočítají', () => {
    const days = groupByDay([
      overview('2026-11-04T16:00', 6, 4),
      overview('2026-11-04T18:00', 12, 12),
      overview('2026-11-05T08:00', 6, 1, { cancelled: true }),
    ]);
    expect(days.map((d) => [d.date, d.sessions, d.free])).toEqual([
      ['2026-11-04', 2, 2],
      ['2026-11-05', 0, 0],
    ]);
    expect(sp(dayMeta(days[0]))).toBe('2 termíny · 2 volná místa');
    expect(dayMeta(days[1])).toBe('jen zrušené termíny');
  });
});

/* ------------------------------------------------------------------ */
/* Vstupy                                                              */
/* ------------------------------------------------------------------ */

describe('Vstupy – období a export CSV', () => {
  it('období: měsíc, minulý měsíc, týden, posun a vlastní rozsah', () => {
    const p = defaultPeriod(TODAY);
    expect(resolvePeriod(p, TODAY)).toMatchObject({ from: '2026-11-01', to: '2026-12-01' });
    expect(sp(resolvePeriod(p, TODAY).rangeText)).toBe('1.–30. listopadu 2026');
    expect(resolvePeriod(applyPreset(p, 'lastMonth', TODAY), TODAY)).toMatchObject({ from: '2026-10-01', to: '2026-11-01' });
    const week = applyPreset(p, 'week', TODAY);
    expect(resolvePeriod(week, TODAY)).toMatchObject({ from: '2026-11-02', to: '2026-11-09', navLabel: 'Tento týden' });
    expect(resolvePeriod(shiftPeriod(week, -1), TODAY)).toMatchObject({ from: '2026-10-26', navLabel: 'Minulý týden' });
    const custom = applyPreset(week, 'custom', TODAY);
    expect(custom).toMatchObject({ unit: 'custom', customFrom: '2026-11-02', customTo: '2026-11-08' });
    expect(resolvePeriod(shiftPeriod(custom, 1), TODAY)).toMatchObject({ from: '2026-11-09', to: '2026-11-16' });
    expect(clampVisitPeriod('2027-12-31', '2026-01-01')).toEqual({ from: '2026-12-31', to: '2027-12-31' });
    expect(sp(formatRangeText('2026-12-28', '2027-01-04'))).toBe('28. 12. 2026 – 3. 1. 2027');
    expect(sp(formatRangeText(TODAY, '2026-11-05'))).toBe('4. listopadu 2026');
  });

  it('uložené volby: poškozený záznam vrátí výchozí hodnoty', () => {
    expect(parsePrefs(null, TODAY)).toEqual(parsePrefs('{nesmysl', TODAY));
    expect(parsePrefs(JSON.stringify({ status: 'jiný', sources: ['package', 'xxx'] }), TODAY).status).toBe(parsePrefs(null, TODAY).status);
  });

  it('CSV: středník, uvozovky, ochrana proti vzorcům, BOM a CRLF', () => {
    expect(csvCell('Nováková; Jana')).toBe('"Nováková; Jana"');
    expect(csvCell('řekla "ano"')).toBe('"řekla ""ano"""');
    expect(csvCell('=SUMA(A1:A2)')).toBe("'=SUMA(A1:A2)");
    expect(csvCell('-5')).toBe("'-5");
    expect(csvCell('+420 777 111 222')).toBe("'+420 777 111 222");
    expect(csvCell('1 690 Kč')).toBe('1 690 Kč');
    expect(csvCell(1690.4)).toBe('1690');
    const csv = toCsv([
      ['A', 'B'],
      ['x', 2],
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('A;B\r\nx;2\r\n');
    expect(csvFileName('vstupy', '2026-11-01', '2026-12-01', 'Mgr. Tereza Malá')).toBe('vstupy-mgr-tereza-mala-2026-11-01-2026-11-30.csv');
    expect(csvFileName('vstupy-souhrn', '2026-11-01', '2026-12-01')).toBe('vstupy-souhrn-2026-11-01-2026-11-30.csv');
  });

  it('CSV souhrnu po zaměstnancích má řádek Celkem jen u více zaměstnanců', () => {
    const s = createBaseState('2026-01-01');
    const [a, b] = s.therapists;
    const x = { ...emptyVisitSummary(a.id), total: 3, singleRevenue: 2400 };
    const y = { ...emptyVisitSummary(b.id), total: 1 };
    const totals = { ...emptyVisitSummary(''), total: 4, singleRevenue: 2400 };
    const both = summaryCsv(s, [x, y], totals).trim().split('\r\n');
    expect(both).toHaveLength(4);
    expect(both[3].startsWith('Celkem;4;')).toBe(true);
    expect(summaryCsv(s, [x], x).trim().split('\r\n')).toHaveLength(2);
  });
});
