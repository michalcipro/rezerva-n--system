import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Campaign, ClinicState, LocalDate, LocalDateTime } from '../../domain/types';
import { saveCampaign } from '../../engine/commands';
import {
  NBSP,
  countLabel,
  formatDate,
  formatDayMonth,
  formatDayShort,
  formatMoney,
  formatMonthYear,
  formatNumber,
  plural,
} from '../../engine/format';
import { therapistName, therapistShort } from '../../engine/selectors';
import { computeStats, type StatsCore, type StatsResult } from '../../engine/stats';
import { addDays, daysBetween, dateOf, isValidLocalDate, weekdayOf } from '../../engine/time';
import { ToneDot } from '../../components/domain';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { navigate } from '../../store/session';
import {
  Button,
  Callout,
  DescriptionList,
  EmptyState,
  Input,
  KpiTile,
  PageHeader,
  PeriodNav,
  Progress,
  Segmented,
  Select,
  StackedBar,
  Switch,
  Table,
  type KpiDelta,
} from '../../ui';
import { BarList, ChartCard, ColumnChart, Heatmap, LegendItem, LineChart, WEEKDAY_SHORT6, type BarRow, type ColumnSeries } from './charts';
import {
  applyPreset,
  bucketize,
  capacityModel,
  changeDelta,
  clampCustom,
  countSoloCompleted,
  dailySeries,
  firstBookingDate,
  granularityFor,
  hoursText,
  monthName,
  monthShort,
  moneyCompact,
  pct,
  pointsDelta,
  presetOf,
  resolvePeriod,
  rowTotal,
  shiftPeriod,
  trendSeries,
  HEAT_HOURS,
  type Bucket,
  type CapacityModel,
  type Granularity,
  type PeriodState,
  type PresetId,
  type ResolvedPeriod,
  type StatsFilters,
  type TrendPoint,
} from './model';
import './stats.css';

/* ------------------------------------------------------------------ */
/* Model obrazovky                                                     */
/* ------------------------------------------------------------------ */

interface StatsModel {
  stats: StatsResult;
  /** Ukazatele srovnávacího období (null = srovnání vypnuto). */
  cmp: StatsCore | null;
  cap: CapacityModel;
  capPrev: CapacityModel | null;
  buckets: Bucket[];
  granularity: Granularity;
  trend: TrendPoint[];
  /** Proběhlé individuální návštěvy (základ rebookingu) v období a ve srovnání. */
  solo: number;
  soloPrev: number;
}

const coreOf = (r: StatsResult): StatsCore => r;

function buildModel(s: ClinicState, p: ResolvedPeriod, f: StatsFilters, compare: boolean, now: LocalDateTime): StatsModel {
  const q = { from: p.range.from, to: p.range.to, therapistId: f.therapistId, categoryId: f.categoryId };
  const stats = computeStats(s, q, now);
  const days = daysBetween(p.range.from, p.range.to);
  let cmp: StatsCore | null = null;
  let capPrev: CapacityModel | null = null;
  if (compare) {
    // engine počítá „předchozích N dní“; jinak (měsíc do dneška…) dopočítáme srovnatelné období
    const same = p.compare.to === p.range.from && daysBetween(p.compare.from, p.compare.to) === Math.max(1, days);
    cmp = same ? stats.previous : coreOf(computeStats(s, { ...q, from: p.compare.from, to: p.compare.to }, now));
    capPrev = capacityModel(s, p.compare, f);
  }
  const cap = capacityModel(s, p.range, f);
  const granularity = granularityFor(days);
  const buckets = bucketize(dailySeries(s, p.range, f, cap.availableByDay), granularity, p.range);
  const solo = countSoloCompleted(s, p.range, f);
  const soloPrev = compare ? countSoloCompleted(s, p.compare, f) : 0;
  return { stats, cmp, cap, capPrev, buckets, granularity, trend: trendSeries(s, f, now), solo, soloPrev };
}

/* ------------------------------------------------------------------ */
/* Uložené volby (jen pohodlí v tomto prohlížeči)                       */
/* ------------------------------------------------------------------ */

const PREFS_KEY = 'pohyb.stats.v1';

interface Prefs {
  period: PeriodState;
  therapistId: string;
  categoryId: string;
  compare: boolean;
}

function defaultPrefs(today: LocalDate): Prefs {
  return {
    period: { unit: 'month', offset: 0, customFrom: today.slice(0, 8) + '01', customTo: today },
    therapistId: '',
    categoryId: '',
    compare: true,
  };
}

function loadPrefs(today: LocalDate): Prefs {
  const base = defaultPrefs(today);
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return base;
    const v = JSON.parse(raw) as Partial<Prefs>;
    const p = v.period;
    const period: PeriodState =
      p &&
      ['week', 'month', 'd90', 'custom'].includes(p.unit) &&
      typeof p.offset === 'number' &&
      isValidLocalDate(p.customFrom) &&
      isValidLocalDate(p.customTo)
        ? { unit: p.unit, offset: Math.min(0, Math.round(p.offset)), customFrom: p.customFrom, customTo: p.customTo }
        : base.period;
    return {
      period,
      therapistId: typeof v.therapistId === 'string' ? v.therapistId : '',
      categoryId: typeof v.categoryId === 'string' ? v.categoryId : '',
      compare: v.compare !== false,
    };
  } catch {
    return base;
  }
}

function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* prohlížeč bez úložiště */
  }
}

/* ------------------------------------------------------------------ */
/* Drobné komponenty                                                   */
/* ------------------------------------------------------------------ */

/** Částka v dlaždici: na úzkém displeji kompaktně, čtečka vždy slyší celou částku. */
function Money({ value }: { value: number }): JSX.Element {
  const full = formatMoney(value);
  const compact = moneyCompact(value);
  if (full === compact) return <>{full}</>;
  return (
    <span className="st-money">
      <span className="st-money__wide">{full}</span>
      <span className="st-money__narrow" aria-hidden="true">
        {compact}
      </span>
    </span>
  );
}

const PRESETS: { value: PresetId; label: string }[] = [
  { value: 'week', label: 'Tento týden' },
  { value: 'month', label: 'Tento měsíc' },
  { value: 'lastMonth', label: 'Minulý měsíc' },
  { value: 'd90', label: '90 dní' },
  { value: 'custom', label: 'Vlastní' },
];

const SERIES: ColumnSeries[] = [
  { id: 'completed', label: 'Proběhlo', colorClass: 'st-c-completed' },
  { id: 'noshow', label: 'Nedostavení', colorClass: 'st-c-noshow' },
  { id: 'upcoming', label: 'Nadcházející', colorClass: 'st-c-upcoming', hatch: true },
  { id: 'cancelled', label: 'Zrušeno', colorClass: 'st-c-cancelled' },
];

const dm = (date: LocalDate): string => `${Number(date.slice(8, 10))}.${NBSP}${Number(date.slice(5, 7))}.`;
const rez = (n: number): string => countLabel(n, ['rezervace', 'rezervace', 'rezervací']);

function bucketTitle(b: Bucket, g: Granularity): string {
  if (g === 'day') return formatDayShort(b.from);
  if (g === 'week') return 'Týden ' + (daysBetween(b.from, b.to) === 1 ? dm(b.from) : `${dm(b.from)}${NBSP}– ${dm(addDays(b.to, -1))}`);
  const full = Number(b.from.slice(8, 10)) === 1 && daysBetween(b.from, b.to) >= 28;
  return full ? formatMonthYear(b.from) : `${dm(b.from)}${NBSP}– ${dm(addDays(b.to, -1))}`;
}

/* ------------------------------------------------------------------ */
/* Obrazovka                                                           */
/* ------------------------------------------------------------------ */

export function StatsScreen(): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const today = dateOf(now);
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs(today));
  useEffect(() => savePrefs(prefs), [prefs]);

  const therapists = useMemo(() => clinic.therapists.filter((t) => t.active).sort((a, b) => a.order - b.order), [clinic.therapists]);
  const categories = useMemo(() => [...clinic.categories].sort((a, b) => a.order - b.order), [clinic.categories]);
  const therapistId = therapists.some((t) => t.id === prefs.therapistId) ? prefs.therapistId : '';
  const categoryId = categories.some((c) => c.id === prefs.categoryId) ? prefs.categoryId : '';
  const filtered = Boolean(therapistId || categoryId);

  const resolved = useMemo(() => resolvePeriod(prefs.period, today), [prefs.period, today]);
  const filters = useMemo<StatsFilters>(
    () => ({ therapistId: therapistId || null, categoryId: categoryId || null }),
    [therapistId, categoryId],
  );
  const dataStart = useMemo(() => firstBookingDate(clinic), [clinic]);
  // drahý výpočet: jen při změně dat, období, filtrů nebo dne
  const model = useMemo(() => buildModel(clinic, resolved, filters, prefs.compare, now), [clinic, resolved, filters, prefs.compare, today]);
  const { stats, cap, capPrev, buckets, granularity, trend } = model;

  const compareUsable = prefs.compare && model.cmp !== null && dataStart !== null && resolved.compare.to > dataStart;
  const cmp = compareUsable ? model.cmp : null;
  const prevCap = compareUsable ? capPrev : null;

  const setPeriod = (period: PeriodState): void => setPrefs((p) => ({ ...p, period }));
  const preset = presetOf(prefs.period);
  const empty = stats.bookings === 0 && stats.revenue === 0 && stats.packages.soldTotal === 0;

  /* ------------------------------ KPI ------------------------------ */
  // podíly se zobrazují jen s nenulovým jmenovatelem, srovnání jen když ho mají obě období
  const ok = {
    util: cap.available > 0,
    utilPrev: !!prevCap && prevCap.available > 0,
    rph: cap.booked > 0 && stats.completed > 0,
    rphPrev: !!cmp && !!prevCap && prevCap.booked > 0 && cmp.completed > 0,
    cancel: stats.bookings > 0,
    cancelPrev: !!cmp && cmp.bookings > 0,
    noShow: stats.completed + stats.noShow > 0,
    noShowPrev: !!cmp && cmp.completed + cmp.noShow > 0,
    rebook: model.solo > 0,
    rebookPrev: !!cmp && model.soloPrev > 0,
  };
  const rph = ok.rph ? Math.round(stats.deliveredValue / (cap.booked / 60)) : 0;
  const rphPrev = ok.rphPrev && cmp && prevCap ? Math.round(cmp.deliveredValue / (prevCap.booked / 60)) : 0;
  const hintFor = (d: KpiDelta | null, comparable: boolean): ReactNode => {
    if (!cmp) return undefined;
    if (!comparable) return 'nelze srovnat';
    return d ? resolved.compareShort : `beze změny ${resolved.compareShort}`;
  };
  const kpi = (d: KpiDelta | null, comparable = true): { delta?: KpiDelta; hint?: ReactNode } => ({
    delta: comparable && d ? d : undefined,
    hint: hintFor(d, comparable),
  });
  const NA = '—';
  const category = categories.find((c) => c.id === categoryId);
  const therapist = therapists.find((t) => t.id === therapistId);

  const kpis = (
    <div className="st-kpis">
      <KpiTile label="Rezervace" value={formatNumber(stats.bookings)} {...kpi(cmp && changeDelta(stats.bookings, cmp.bookings, true))}>
        <span className="st-kpi-extra">
          proběhlo <strong>{formatNumber(stats.completed)}</strong>
          {stats.upcoming > 0 && (
            <>
              {' · '}nadcházející <strong>{formatNumber(stats.upcoming)}</strong>
            </>
          )}
        </span>
      </KpiTile>
      <KpiTile
        label="Obsazenost"
        value={ok.util ? pct(cap.utilization) : NA}
        {...kpi(prevCap && pointsDelta(cap.utilization, prevCap.utilization, true), ok.util && ok.utilPrev)}
      >
        <span className="st-kpi-progress">
          <Progress value={Math.round(cap.utilization * 100)} target={85} label={`Obsazenost ${pct(cap.utilization)}, cíl 85 %`} />
          <span className="st-kpi-extra">cíl 85{NBSP}%</span>
        </span>
      </KpiTile>
      <KpiTile
        label={filtered ? 'Hodnota termínů' : 'Tržby'}
        value={<Money value={stats.revenue} />}
        {...kpi(cmp && changeDelta(stats.revenue, cmp.revenue, true, formatMoney))}
      >
        <span className="st-kpi-extra">{filtered ? 'proběhlé termíny ve filtru' : 'přijaté platby'}</span>
      </KpiTile>
      <KpiTile
        label="Tržba za hodinu"
        value={ok.rph ? formatMoney(rph) : NA}
        {...kpi(cmp && changeDelta(rph, rphPrev, true, formatMoney), ok.rph && ok.rphPrev)}
      >
        <span className="st-kpi-extra">na obsazenou hodinu</span>
      </KpiTile>
      <KpiTile
        label="Noví klienti"
        value={formatNumber(stats.newClients)}
        {...kpi(cmp && changeDelta(stats.newClients, cmp.newClients, true))}
      >
        <span className="st-kpi-extra">
          vracející se <strong>{formatNumber(stats.returningClients)}</strong>
        </span>
      </KpiTile>
      <KpiTile
        label="Míra storna"
        value={ok.cancel ? pct(stats.cancellationRate, 1) : NA}
        {...kpi(cmp && pointsDelta(stats.cancellationRate, cmp.cancellationRate, false), ok.cancel && ok.cancelPrev)}
      >
        <span className="st-kpi-extra">
          z toho pozdní <strong>{pct(stats.lateRate, 1)}</strong>
        </span>
      </KpiTile>
      <KpiTile
        label="Nedostavení"
        value={ok.noShow ? pct(stats.noShowRate, 1) : NA}
        {...kpi(cmp && pointsDelta(stats.noShowRate, cmp.noShowRate, false), ok.noShow && ok.noShowPrev)}
      >
        <span className="st-kpi-extra">{countLabel(stats.noShow, ['termín', 'termíny', 'termínů'])}</span>
      </KpiTile>
      <KpiTile
        label="Rebooking do 30 dní"
        value={ok.rebook ? pct(stats.rebookingRate) : NA}
        {...kpi(cmp && pointsDelta(stats.rebookingRate, cmp.rebookingRate, true), ok.rebook && ok.rebookPrev)}
      >
        <span className="st-kpi-extra">{ok.rebook ? 'další termín po návštěvě' : 'jen po individuálních návštěvách'}</span>
      </KpiTile>
    </div>
  );

  /* ------------------------- Rezervace po dnech ------------------------- */
  const sums = SERIES.map((_, si) => buckets.reduce((sum, b) => sum + [b.completed, b.noShow, b.upcoming, b.cancelled][si], 0));
  const columns = buckets.map((b) => ({
    key: b.key,
    axisLabel: granularity === 'month' ? monthShort(b.key) : dm(b.from),
    anchor: granularity === 'day' ? weekdayOf(b.from) === 0 : true,
    title: bucketTitle(b, granularity),
    values: [b.completed, b.noShow, b.upcoming, b.cancelled],
    closed: b.closed,
    strong: b.from <= today && today < b.to,
  }));
  const maxBucket = buckets.reduce<Bucket | null>((m, b) => (!m || rowTotal(b) > rowTotal(m) ? b : m), null);
  const dailyTitle =
    granularity === 'day' ? 'Rezervace po dnech' : granularity === 'week' ? 'Rezervace po týdnech' : 'Rezervace po měsících';
  const dailyCard = (
    <ChartCard
      title={dailyTitle}
      meta={
        <>
          celkem <strong className="st-strong">{formatNumber(stats.bookings)}</strong>
        </>
      }
      legend={
        <>
          {SERIES.map((s, si) =>
            sums[si] > 0 || si === 0 ? (
              <LegendItem key={s.id} colorClass={s.colorClass} mark={s.hatch ? 'hatch' : 'rect'}>
                {s.label} <span className="st-key__value">{formatNumber(sums[si])}</span>
              </LegendItem>
            ) : null,
          )}
          {buckets.some((b) => b.closed) && (
            <LegendItem colorClass="" mark="closed">
              zavřeno
            </LegendItem>
          )}
        </>
      }
      table={() => (
        <Table density="compact" minWidth={480} maxHeight={340} caption={`${dailyTitle} – ${resolved.rangeText}`}>
          <thead>
            <tr>
              <th>{granularity === 'day' ? 'Den' : granularity === 'week' ? 'Týden' : 'Měsíc'}</th>
              {SERIES.map((s) => (
                <th key={s.id} className="num">
                  {s.label}
                </th>
              ))}
              <th className="num">Celkem</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.key}>
                <td className="nowrap">{bucketTitle(b, granularity)}</td>
                <td className="num">{b.completed}</td>
                <td className="num">{b.noShow}</td>
                <td className="num">{b.upcoming}</td>
                <td className="num">{b.cancelled}</td>
                <td className="num">{b.closed ? 'zavřeno' : rowTotal(b)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Celkem</td>
              {sums.map((v, i) => (
                <td key={i} className="num">
                  {formatNumber(v)}
                </td>
              ))}
              <td className="num">{formatNumber(stats.bookings)}</td>
            </tr>
          </tfoot>
        </Table>
      )}
    >
      <ColumnChart
        height={236}
        data={columns}
        series={SERIES}
        totalText={rez}
        pointsLabel={granularity === 'day' ? 'Jednotlivé dny' : granularity === 'week' ? 'Jednotlivé týdny' : 'Jednotlivé měsíce'}
        label={
          `Sloupcový graf, ${rez(stats.bookings)} za ${resolved.rangeText}: proběhlo ${sums[0]}, nedostavení ${sums[1]}, ` +
          `nadcházející ${sums[2]}, zrušeno ${sums[3]}.` +
          (maxBucket && rowTotal(maxBucket) > 0 ? ` Nejvíce ${rez(rowTotal(maxBucket))}: ${bucketTitle(maxBucket, granularity)}.` : '')
        }
      />
    </ChartCard>
  );

  /* ------------------------- Tržby podle kategorií ------------------------- */
  const catRows = [...stats.byCategory].sort((a, b) => b.value - a.value || b.count - a.count);
  const catTotal = catRows.reduce((s, c) => s + c.value, 0);
  const catMax = catRows.reduce((m, c) => Math.max(m, c.value), 0);
  const share = (v: number): number => (catTotal > 0 ? v / catTotal : 0);
  const purpose: { key: keyof StatsResult['revenueByPurpose']; label: string }[] = [
    { key: 'booking', label: 'Platby za termíny' },
    { key: 'package', label: 'Prodej permanentek' },
    { key: 'credit_topup', label: 'Dobití kreditu' },
    { key: 'storno_fee', label: 'Storno poplatky' },
  ];
  const categoryCard = (
    <ChartCard
      title="Tržby podle kategorií"
      subtitle="Hodnota proběhlých termínů, u permanentek poměrná cena vstupu"
      meta={
        <>
          celkem <strong className="st-strong">{formatMoney(catTotal)}</strong>
        </>
      }
      table={() => (
        <Table density="compact" minWidth={440} caption="Tržby podle kategorií">
          <thead>
            <tr>
              <th>Kategorie</th>
              <th className="num">Hodnota</th>
              <th className="num">Podíl</th>
              <th className="num">Rezervace</th>
            </tr>
          </thead>
          <tbody>
            {catRows.map((c) => (
              <tr key={c.categoryId}>
                <td>{c.name}</td>
                <td className="num">{formatMoney(c.value)}</td>
                <td className="num">{pct(share(c.value))}</td>
                <td className="num">{formatNumber(c.count)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      footer={
        !filtered && stats.revenue > 0 ? (
          <div className="st-purpose">
            <span className="st-section-label">Přijaté platby v období</span>
            <ul className="st-purpose__list">
              {purpose.map((p) => (
                <li key={p.key}>
                  <span>{p.label}</span>
                  <strong>{formatMoney(stats.revenueByPurpose[p.key])}</strong>
                </li>
              ))}
            </ul>
          </div>
        ) : null
      }
    >
      {catRows.length === 0 ? (
        <EmptyState
          compact
          icon="chart"
          title="Žádné termíny v období"
          text="Jakmile proběhnou první termíny, uvidíte tu rozdělení podle kategorií."
        />
      ) : (
        <BarList
          label="Tržby podle kategorií"
          max={catMax}
          columns="minmax(96px, 168px) minmax(36px, 1fr) minmax(76px, auto) 40px"
          headers={['Hodnota', 'Podíl']}
          rows={catRows.map(
            (c): BarRow => ({
              key: c.categoryId,
              label: (
                <>
                  <ToneDot tone={c.tone} />
                  <span className="st-ellipsis">{c.name}</span>
                </>
              ),
              value: c.value,
              cells: [<strong key="v">{formatMoney(c.value)}</strong>, pct(share(c.value))],
              ariaLabel: `${c.name}: ${formatMoney(c.value)}, ${pct(share(c.value))} hodnoty, ${rez(c.count)}`,
              tipTitle: c.name,
              tipRows: [
                { key: 'v', value: formatMoney(c.value), label: 'hodnota proběhlých', colorClass: 'st-c-accent' },
                { key: 's', value: pct(share(c.value), 1), label: 'podíl' },
                { key: 'c', value: formatNumber(c.count), label: 'rezervací' },
              ],
            }),
          )}
        />
      )}
    </ChartCard>
  );

  /* ------------------------- Obsazenost terapeutů ------------------------- */
  const shown = therapists.filter((t) => !therapistId || t.id === therapistId);
  const byTher = new Map(stats.byTherapist.map((x) => [x.therapistId, x]));
  const therRows = shown.map((t): BarRow => {
    const c = cap.byTherapist[t.id] ?? { booked: 0, available: 0 };
    const util = c.available > 0 ? c.booked / c.available : 0;
    const prev = prevCap?.byTherapist[t.id];
    const prevUtil = prev && prev.available > 0 ? prev.booked / prev.available : null;
    const extra = byTher.get(t.id);
    const noShift = c.available <= 0;
    return {
      key: t.id,
      label: <span className="st-ellipsis">{therapistShort(t)}</span>,
      value: util,
      muted: noShift,
      cells: [<strong key="p">{noShift ? '—' : pct(util)}</strong>],
      ariaLabel: noShift
        ? `${therapistName(t)}: v období bez směn`
        : `${therapistName(t)}: obsazenost ${pct(util)}, ${hoursText(c.booked)} z ${hoursText(c.available)}` +
          (prevUtil !== null ? `, minulé období ${pct(prevUtil)}` : ''),
      tipTitle: therapistName(t),
      tipRows: noShift
        ? undefined
        : [
            { key: 'u', value: pct(util), label: 'obsazeno', colorClass: 'st-c-accent' },
            { key: 'h', value: `${hoursText(c.booked)} z ${hoursText(c.available)}`, label: 'pracovní doby' },
            ...(extra
              ? [
                  { key: 'c', value: formatNumber(extra.completed), label: 'proběhlých termínů' },
                  { key: 'm', value: formatMoney(extra.value), label: 'hodnota' },
                ]
              : []),
          ],
      tipNote: noShift ? 'V období bez směn' : prevUtil !== null ? `Srovnávací období: ${pct(prevUtil)}` : undefined,
    };
  });
  const therapistCard = (
    <ChartCard
      title="Obsazenost terapeutů"
      subtitle={category ? `Podíl pracovní doby věnovaný kategorii ${category.name}` : 'Obsazený čas z pracovní doby'}
      meta={
        <LegendItem colorClass="" mark="target">
          cíl 85{NBSP}%
        </LegendItem>
      }
      table={() => (
        <Table density="compact" minWidth={480} caption="Obsazenost terapeutů">
          <thead>
            <tr>
              <th>Terapeut</th>
              <th className="num">Obsazenost</th>
              <th className="num">Obsazeno</th>
              <th className="num">Pracovní doba</th>
              {prevCap && <th className="num">Srovnání</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => {
              const c = cap.byTherapist[t.id] ?? { booked: 0, available: 0 };
              const p = prevCap?.byTherapist[t.id];
              return (
                <tr key={t.id}>
                  <td>{therapistName(t)}</td>
                  <td className="num">{c.available > 0 ? pct(c.booked / c.available) : '—'}</td>
                  <td className="num">{hoursText(c.booked)}</td>
                  <td className="num">{hoursText(c.available)}</td>
                  {prevCap && <td className="num">{p && p.available > 0 ? pct(p.booked / p.available) : '—'}</td>}
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    >
      <BarList
        label="Obsazenost terapeutů"
        track
        max={1}
        target={{ value: 0.85, label: 'cíl' }}
        columns="minmax(84px, 136px) minmax(0, 1fr) 48px"
        rows={therRows}
      />
    </ChartCard>
  );

  /* ------------------------- Storna a nedostavení ------------------------- */
  const lastFull = [...trend].reverse().find((t) => !t.partial && t.total > 0);
  const trendCard = (
    <ChartCard
      title="Storna a nedostavení"
      subtitle="Posledních 6 měsíců, jen termíny, které už začaly"
      legend={
        <>
          <LegendItem colorClass="st-c-storno" mark="line">
            Storno <span className="st-key__hint">(vč. pozdních a omluvených)</span>
          </LegendItem>
          <LegendItem colorClass="st-c-noshow" mark="dash">
            Nedostavení
          </LegendItem>
        </>
      }
      table={() => (
        <Table density="compact" minWidth={440} caption="Storna a nedostavení po měsících">
          <thead>
            <tr>
              <th>Měsíc</th>
              <th className="num">Termíny</th>
              <th className="num">Storno</th>
              <th className="num">Pozdní</th>
              <th className="num">Nedostavení</th>
            </tr>
          </thead>
          <tbody>
            {trend.map((t) => (
              <tr key={t.month}>
                <td>
                  {formatMonthYear(t.month)}
                  {t.partial ? ` (do ${formatDayMonth(today)})` : ''}
                </td>
                <td className="num">{formatNumber(t.total)}</td>
                <td className="num">{t.cancelRate === null ? '—' : pct(t.cancelRate, 1)}</td>
                <td className="num">{formatNumber(t.late)}</td>
                <td className="num">{t.noShowRate === null ? '—' : pct(t.noShowRate, 1)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      footer={
        <p className="st-footnote">
          Prázdný bod = rozpracovaný měsíc (do {formatDayMonth(today)}).
          {lastFull && (
            <>
              {' '}
              {capitalize(monthName(lastFull.month))}: storno <strong>{pct(lastFull.cancelRate ?? 0, 1)}</strong>, nedostavení{' '}
              <strong>{pct(lastFull.noShowRate ?? 0, 1)}</strong>.
            </>
          )}
        </p>
      }
    >
      <LineChart
        label={`Spojnicový graf storen a nedostavení za posledních 6 měsíců: ${trend
          .map(
            (t) =>
              `${monthName(t.month)} storno ${t.cancelRate === null ? 'bez dat' : pct(t.cancelRate, 1)}, nedostavení ${t.noShowRate === null ? 'bez dat' : pct(t.noShowRate, 1)}`,
          )
          .join('; ')}.`}
        pointsLabel="Jednotlivé měsíce"
        labels={trend.map((t) => monthName(t.month))}
        shortLabels={trend.map((t) => monthShort(t.month))}
        titles={trend.map((t) => formatMonthYear(t.month) + (t.partial ? ` (do ${formatDayMonth(today)})` : ''))}
        hollow={trend.map((t) => t.partial)}
        strongIndex={trend.length - 1}
        format={(v) => pct(v, 1)}
        tickFormat={(v) => pct(v, v > 0 && v < 0.01 ? 1 : 0)}
        minMax={0.05}
        series={[
          { id: 'cancel', label: 'Storno', colorClass: 'st-c-storno', values: trend.map((t) => t.cancelRate) },
          { id: 'noshow', label: 'Nedostavení', colorClass: 'st-c-noshow', dashed: true, values: trend.map((t) => t.noShowRate) },
        ]}
        tipNote={(i) =>
          trend[i].total > 0
            ? `${countLabel(trend[i].total, ['termín', 'termíny', 'termínů'])}, ${countLabel(trend[i].cancels, ['storno', 'storna', 'storen'])}, ${countLabel(trend[i].noShows, ['nedostavení', 'nedostavení', 'nedostavení'])}`
            : 'Bez dat'
        }
      />
    </ChartCard>
  );

  /* ------------------------- Heatmapa ------------------------- */
  const open = cap.heat.filter((c) => c.available >= 60);
  const busiest = open.reduce<(typeof open)[number] | null>((m, c) => (!m || c.pct > m.pct ? c : m), null);
  const calmest = open.reduce<(typeof open)[number] | null>((m, c) => (!m || c.pct < m.pct ? c : m), null);
  const cellText = (c: { weekday: number; hour: number; pct: number }): string =>
    `${WEEKDAY_SHORT6[c.weekday]} ${c.hour}–${c.hour + 1}${NBSP}h · ${pct(c.pct)}`;
  const heatCard = (
    <ChartCard
      className="st-wide"
      title="Obsazenost podle dne a hodiny"
      subtitle={therapist ? therapistName(therapist) : 'Celý tým, Po–So'}
      legend={
        <span className="st-scale">
          <span>0{NBSP}%</span>
          {[1, 2, 3, 4, 5].map((l) => (
            <span key={l} className={`st-scale__chip st-heat__cell--${l}`} aria-hidden="true" />
          ))}
          <span>100{NBSP}%</span>
          <span className="st-scale__sep" aria-hidden="true" />
          <span className="st-scale__chip is-closed" aria-hidden="true" />
          <span>zavřeno</span>
        </span>
      }
      table={() => (
        <Table density="compact" minWidth={420} maxHeight={360} caption="Obsazenost podle dne a hodiny v procentech">
          <thead>
            <tr>
              <th>Hodina</th>
              {WEEKDAY_SHORT6.map((d) => (
                <th key={d} className="num">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HEAT_HOURS.map((h, hi) => (
              <tr key={h}>
                <td className="nowrap">
                  {h}:00–{h + 1}:00
                </td>
                {WEEKDAY_SHORT6.map((d, wd) => {
                  const c = cap.heat[wd * HEAT_HOURS.length + hi];
                  return (
                    <td key={d} className="num">
                      {c.available > 0 ? pct(c.pct) : '–'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      footer={
        busiest && calmest ? (
          <div className="statline">
            <span>
              Nejvytíženější: <strong>{cellText(busiest)}</strong>
            </span>
            <span>
              Nejvíc volna: <strong>{cellText(calmest)}</strong>
            </span>
          </div>
        ) : null
      }
    >
      <Heatmap cells={cap.heat} label="Obsazenost podle dne v týdnu a hodiny, procházejte šipkami" />
    </ChartCard>
  );

  /* ------------------------- Zdroj rezervací ------------------------- */
  const ch = stats.byChannel;
  const chTotal = ch.online + ch.recepce + ch.telefon;
  const channels = [
    { key: 'online', label: 'Online (web a aplikace)', value: ch.online, tone: 'accent' as const, cls: 'st-c-online' },
    { key: 'recepce', label: 'Recepce', value: ch.recepce, tone: 'neutral' as const, cls: 'st-c-recepce' },
    { key: 'telefon', label: 'Telefon', value: ch.telefon, tone: 'neutral-strong' as const, cls: 'st-c-telefon' },
  ];
  const chShare = (v: number): string => pct(chTotal ? v / chTotal : 0);
  const channelCard = (
    <ChartCard title="Zdroj rezervací" meta={rez(chTotal)}>
      {chTotal === 0 ? (
        <EmptyState compact icon="chart" title="Žádné rezervace v období" />
      ) : (
        <>
          <StackedBar
            size="lg"
            legend={false}
            label={`Zdroj rezervací: ${channels.map((c) => `${c.label} ${chShare(c.value)}`).join(', ')}`}
            segments={channels.map((c) => ({ value: c.value, tone: c.tone, label: c.label }))}
          />
          <ul className="st-channels">
            {channels.map((c) => (
              <li key={c.key}>
                <span className={`st-mark st-mark--rect ${c.cls}`} aria-hidden="true" />
                <span className="st-channels__label">{c.label}</span>
                <span className="st-channels__count">{formatNumber(c.value)}</span>
                <strong>{chShare(c.value)}</strong>
              </li>
            ))}
          </ul>
        </>
      )}
    </ChartCard>
  );

  /* ------------------------- Permanentky ------------------------- */
  const pk = stats.packages;
  const soldMax = pk.sold.reduce((m, x) => Math.max(m, x.count), 0);
  const remind = (): void => {
    const draft: Campaign = {
      id: '',
      name: 'Připomínka: končící permanentky',
      subject: 'Vaše permanentka brzy končí',
      preheader: 'Nevyčerpané vstupy můžete ještě využít.',
      blocks: [
        { type: 'heading', text: 'Permanentka vám brzy končí' },
        {
          type: 'text',
          text: 'Dobrý den, [jméno], na vaší permanentce zbývají nevyčerpané vstupy a platnost brzy skončí. Rezervujte si termín, ať o ně nepřijdete.',
        },
        { type: 'button', label: 'Rezervovat termín', url: '#' },
      ],
      segment: { match: 'all', rules: [{ type: 'package_expiring', withinDays: 30 }], exclude: [] },
      status: 'draft',
      scheduledAt: null,
      sentAt: null,
      recipients: 0,
      createdAt: now,
      updatedAt: now,
    };
    const r = run(saveCampaign, draft, { success: 'Koncept připomínky je připravený v Komunikaci' });
    if (r.ok) navigate({ name: 'komunikace' });
  };
  const packagesCard = (
    <ChartCard
      title="Permanentky"
      meta={
        <>
          prodáno <strong className="st-strong">{formatNumber(pk.soldTotal)}</strong>
        </>
      }
      table={
        pk.sold.length
          ? () => (
              <Table density="compact" minWidth={360} caption="Prodané permanentky podle typu">
                <thead>
                  <tr>
                    <th>Typ</th>
                    <th className="num">Prodáno</th>
                    <th className="num">Tržba</th>
                  </tr>
                </thead>
                <tbody>
                  {pk.sold.map((x) => (
                    <tr key={x.templateId}>
                      <td>{x.name}</td>
                      <td className="num">{formatNumber(x.count)}</td>
                      <td className="num">{formatMoney(x.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )
          : undefined
      }
    >
      <div className="st-pk">
        <div className="st-pk__col">
          <span className="st-section-label">Prodané v období podle typu</span>
          {pk.sold.length === 0 ? (
            <p className="st-muted-text">V období se neprodala žádná permanentka.</p>
          ) : (
            <BarList
              label="Prodané permanentky podle typu"
              size="sm"
              max={soldMax}
              columns="minmax(84px, 1fr) minmax(40px, 1.2fr) 32px minmax(84px, auto)"
              headers={['Ks', 'Tržba']}
              rows={pk.sold.map(
                (x): BarRow => ({
                  key: x.templateId,
                  label: <span className="st-ellipsis">{x.name}</span>,
                  value: x.count,
                  cells: [<strong key="c">{formatNumber(x.count)}</strong>, formatMoney(x.revenue)],
                  ariaLabel: `${x.name}: prodáno ${formatNumber(x.count)}, tržba ${formatMoney(x.revenue)}`,
                  tipTitle: x.name,
                  tipRows: [
                    { key: 'c', value: formatNumber(x.count), label: 'prodáno', colorClass: 'st-c-accent' },
                    { key: 'r', value: formatMoney(x.revenue), label: 'tržba' },
                  ],
                }),
              )}
            />
          )}
        </div>
        <div className="st-pk__col">
          {pk.expiringSoon > 0 ? (
            <Callout
              tone="warning"
              title="Končí do 30 dní"
              actions={
                <Button size="sm" icon="mail" onClick={remind}>
                  Poslat připomínku
                </Button>
              }
            >
              {countLabel(pk.expiringSoon, ['permanentka', 'permanentky', 'permanentek'])} ·{' '}
              {countLabel(pk.expiringEntries, ['nevyčerpaný vstup', 'nevyčerpané vstupy', 'nevyčerpaných vstupů'])}
            </Callout>
          ) : (
            <Callout tone="success" title="Končí do 30 dní">
              Žádná platná permanentka s volnými vstupy v nejbližších 30 dnech nekončí.
            </Callout>
          )}
          <div>
            <span className="st-section-label">Závazek k dnešnímu dni</span>
            <DescriptionList
              termWidth={150}
              items={[
                {
                  term: 'Nevyčerpané vstupy',
                  detail: (
                    <span className="st-dl-value">
                      {formatMoney(pk.liabilityValue)}
                      <span className="st-muted-text"> · {countLabel(pk.liabilityEntries, ['vstup', 'vstupy', 'vstupů'])}</span>
                    </span>
                  ),
                },
                { term: 'Kredity klientů', detail: <span className="st-dl-value">{formatMoney(pk.creditLiability)}</span> },
                {
                  term: 'Celkem',
                  detail: <strong className="st-dl-value">{formatMoney(pk.liabilityValue + pk.creditLiability)}</strong>,
                },
              ]}
            />
          </div>
        </div>
      </div>
    </ChartCard>
  );

  /* ------------------------- Omluvenky a náhrady ------------------------- */
  const ex = stats.excuses;
  const decided = ex.makeupsUsed + ex.makeupsExpired;
  const excusesCard = (
    <ChartCard title="Omluvenky a náhrady" subtitle="Náhrady vzniklé z omluvenek v období">
      <div className="st-figures">
        <div className="st-figure">
          <span className="st-figure__value">{formatNumber(ex.used)}</span>
          <span className="st-figure__label">{plural(ex.used, ['omluvený termín', 'omluvené termíny', 'omluvených termínů'])}</span>
        </div>
        <div className="st-figure">
          <span className="st-figure__value">{decided > 0 ? pct(ex.makeupsUsed / decided) : '—'}</span>
          <span className="st-figure__label">náhrad využito (z uzavřených)</span>
        </div>
      </div>
      {ex.makeupsUsed + ex.makeupsOpen + ex.makeupsExpired > 0 ? (
        <>
          <StackedBar
            size="lg"
            legend={false}
            label={`Náhrady: využité ${ex.makeupsUsed}, otevřené ${ex.makeupsOpen}, propadlé ${ex.makeupsExpired}`}
            segments={[
              { value: ex.makeupsUsed, tone: 'accent', label: 'využité' },
              { value: ex.makeupsOpen, tone: 'accent-hatched', label: 'otevřené' },
              { value: ex.makeupsExpired, tone: 'neutral', label: 'propadlé' },
            ]}
          />
          <div className="st-legend st-legend--inline">
            <LegendItem colorClass="st-c-completed">
              Využité <span className="st-key__value">{formatNumber(ex.makeupsUsed)}</span>
            </LegendItem>
            <LegendItem colorClass="st-c-upcoming" mark="hatch">
              Otevřené <span className="st-key__value">{formatNumber(ex.makeupsOpen)}</span>
            </LegendItem>
            <LegendItem colorClass="st-c-cancelled">
              Propadlé <span className="st-key__value">{formatNumber(ex.makeupsExpired)}</span>
            </LegendItem>
          </div>
        </>
      ) : (
        <p className="st-muted-text">V období nevznikla žádná náhrada.</p>
      )}
    </ChartCard>
  );

  /* ------------------------- Hlavička a filtry ------------------------- */
  const coverage: string[] = [];
  if (dataStart && resolved.range.to <= dataStart)
    coverage.push(`Záznamy v systému začínají ${formatDate(dataStart)}, vybrané období je celé před nimi.`);
  else if (dataStart && resolved.range.from < dataStart)
    coverage.push(`Záznamy v systému začínají ${formatDate(dataStart)}, dny před tím jsou v období bez dat.`);
  if (prefs.compare && dataStart && resolved.range.to > dataStart && resolved.compare.to <= dataStart)
    coverage.push(`Srovnávací období (${resolved.compareText}) je celé před prvním záznamem, rozdíly se proto nezobrazují.`);
  else if (prefs.compare && dataStart && resolved.compare.from < dataStart)
    coverage.push('Srovnávací období začíná před prvním záznamem, rozdíly mohou být zkreslené.');

  const custom = prefs.period.unit === 'custom' ? clampCustom(prefs.period.customFrom, prefs.period.customTo) : null;
  const setCustom = (from: string, to: string): void => {
    if (!isValidLocalDate(from) || !isValidLocalDate(to)) return;
    const c = clampCustom(from, to);
    setPeriod({ ...prefs.period, unit: 'custom', offset: 0, customFrom: c.from, customTo: c.to });
  };

  return (
    <div className="page st-root st-stats">
      <PageHeader
        title="Statistiky"
        subtitle={
          <>
            {resolved.rangeText}
            {prefs.compare && <span className="st-sub-muted"> · srovnání s obdobím {resolved.compareText}</span>}
            {(therapist || category) && (
              <span className="st-sub-muted"> · {[therapist && therapistName(therapist), category?.name].filter(Boolean).join(', ')}</span>
            )}
          </>
        }
      />

      <div className="st-filters" role="group" aria-label="Období a filtry statistik">
        <div className="st-filters__row">
          <div className="st-presets">
            <Segmented<PresetId | ''>
              aria-label="Období"
              size="lg"
              value={preset}
              onChange={(v) => v && setPeriod(applyPreset(prefs.period, v, today))}
              options={PRESETS}
            />
          </div>
          <Select
            className="st-presets-select"
            aria-label="Období"
            value={preset}
            placeholder="Jiné období"
            onValueChange={(v) => v && setPeriod(applyPreset(prefs.period, v as PresetId, today))}
            options={PRESETS}
          />
          <PeriodNav
            label={resolved.navLabel}
            onPrev={() => setPeriod(shiftPeriod(prefs.period, -1))}
            onNext={() => setPeriod(shiftPeriod(prefs.period, 1))}
            nextDisabled={!resolved.canNext}
          />
          {custom && (
            <div className="st-custom">
              <Input
                type="date"
                size="sm"
                prefix="Od"
                aria-label="Začátek období"
                value={custom.from}
                max={custom.to}
                onValueChange={(v) => setCustom(v, custom.to)}
              />
              <Input
                type="date"
                size="sm"
                prefix="Do"
                aria-label="Konec období"
                value={custom.to}
                min={custom.from}
                onValueChange={(v) => setCustom(custom.from, v)}
              />
            </div>
          )}
        </div>
        <div className="st-filters__row">
          <Select
            inline
            prefix="Terapeut:"
            aria-label="Terapeut"
            value={therapistId}
            onValueChange={(v) => setPrefs((p) => ({ ...p, therapistId: v }))}
            options={[{ value: '', label: 'Všichni' }, ...therapists.map((t) => ({ value: t.id, label: therapistShort(t) }))]}
          />
          <Select
            inline
            prefix="Kategorie:"
            aria-label="Kategorie služeb"
            value={categoryId}
            onValueChange={(v) => setPrefs((p) => ({ ...p, categoryId: v }))}
            options={[{ value: '', label: 'Všechny' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
          />
          {filtered && (
            <Button variant="ghost" size="sm" icon="x" onClick={() => setPrefs((p) => ({ ...p, therapistId: '', categoryId: '' }))}>
              Zrušit filtry
            </Button>
          )}
          <span className="spacer" />
          <Switch
            checked={prefs.compare}
            onChange={(v) => setPrefs((p) => ({ ...p, compare: v }))}
            label="Srovnat s předchozím obdobím"
            labelPosition="end"
          />
        </div>
      </div>

      {coverage.length > 0 && (
        <Callout tone="info" title="Rozsah dat">
          {coverage.join(' ')}
        </Callout>
      )}

      {empty ? (
        <>
          <EmptyState
            icon="chart"
            title="V tomto období nejsou žádná data"
            text={
              filtered
                ? 'Pro vybraného terapeuta nebo kategorii tu nejsou žádné rezervace ani platby. Zkuste zrušit filtry nebo vybrat jiné období.'
                : 'Ve vybraném období nejsou žádné rezervace ani platby. Vyberte jiné období.'
            }
            action={
              filtered ? (
                <Button variant="primary" onClick={() => setPrefs((p) => ({ ...p, therapistId: '', categoryId: '' }))}>
                  Zrušit filtry
                </Button>
              ) : (
                <Button variant="primary" onClick={() => setPeriod(applyPreset(prefs.period, 'd90', today))}>
                  Zobrazit posledních 90 dní
                </Button>
              )
            }
          />
          <div className="st-grid">{trendCard}</div>
        </>
      ) : (
        <>
          {kpis}
          <div className="st-grid">
            {dailyCard}
            {categoryCard}
          </div>
          <div className="st-grid">
            {therapistCard}
            {trendCard}
          </div>
          <div className="st-row">
            {heatCard}
            <div className="st-stack">
              {channelCard}
              {excusesCard}
            </div>
          </div>
          {packagesCard}
        </>
      )}
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
