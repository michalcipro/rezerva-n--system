/**
 * Grafy pro statistiky a přehled – čisté SVG/HTML bez knihoven.
 *
 * Zásady: SVG se kreslí v pixelech změřené šířky (text se neškáluje), osy a mřížka
 * jsou vlasové čáry v barvách tokenů, sloupce max. 24 px se zaobleným koncem
 * a 2px mezerou mezi segmenty. Každý graf má souhrn (role="img" + aria-label),
 * body dosažitelné klávesnicí (jedna zastávka tabulátoru, šipky mezi body)
 * s tooltipem na hover i fokus a přepnutí na tabulku hodnot.
 */
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { formatDuration, formatNumber, plural } from '../../engine/format';
import { Card, CardHeader, IconButton, cx } from '../../ui';
import { HEAT_HOURS, heatLevel, niceScale, type HeatCell, type HourSlot } from './model';

/** Přibližná šířka znaku 11px popisku (pro rozmístění popisků bez měření). */
const CHAR_W = 6.4;
const textW = (s: string): number => s.length * CHAR_W;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const crisp = (v: number): number => Math.round(v) + 0.5;

export const WEEKDAY_SHORT6 = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So'] as const;

/* ------------------------------------------------------------------ */
/* Hooky                                                               */
/* ------------------------------------------------------------------ */

/** Šířka prvku v px (ResizeObserver), změřená před vykreslením. */
export function useElementWidth<T extends HTMLElement>(): { ref: RefObject<T>; width: number } {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = (): void => {
      const w = Math.floor(el.getBoundingClientRect().width);
      setWidth((prev) => (prev === w ? prev : w));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** Id použitelné v `url(#…)` (bez dvojteček z useId). */
export function useSvgId(prefix: string): string {
  return prefix + useId().replace(/[^a-zA-Z0-9_-]/g, '');
}

export interface ActivePoint {
  index: number;
  x: number;
  y: number;
}

interface RovingOptions {
  /** Počet sloupců mřížky (heatmapa); 0 = jednorozměrný seznam. */
  columns?: number;
  /** Kotva tooltipu pro bod (v souřadnicích kontejneru grafu). */
  anchor?: (index: number, el: HTMLElement) => { x: number; y: number };
}

/**
 * Jedna zastávka tabulátoru na graf; šipky, Home/End přesouvají fokus mezi body,
 * Esc skryje tooltip. Hover i fokus nastaví aktivní bod.
 */
export function useRoving(count: number, opts: RovingOptions = {}) {
  const [focusIdx, setFocusIdx] = useState(0);
  const [active, setActive] = useState<ActivePoint | null>(null);
  const refs = useRef<Array<HTMLElement | null>>([]);
  const tabIdx = Math.min(focusIdx, Math.max(0, count - 1));

  const activate = (index: number, el: HTMLElement): void => {
    const pos = opts.anchor ? opts.anchor(index, el) : { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop };
    setActive((a) => (a && a.index === index && a.x === pos.x && a.y === pos.y ? a : { index, ...pos }));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>, i: number): void => {
    const cols = opts.columns ?? 0;
    let n = i;
    switch (e.key) {
      case 'ArrowRight':
        n = cols ? (i % cols < cols - 1 ? i + 1 : i) : i + 1;
        break;
      case 'ArrowLeft':
        n = cols ? (i % cols > 0 ? i - 1 : i) : i - 1;
        break;
      case 'ArrowDown':
        n = cols ? i + cols : i + 1;
        break;
      case 'ArrowUp':
        n = cols ? i - cols : i - 1;
        break;
      case 'Home':
        n = cols ? i - (i % cols) : 0;
        break;
      case 'End':
        n = cols ? i - (i % cols) + cols - 1 : count - 1;
        break;
      case 'Escape':
        setActive(null);
        return;
      default:
        return;
    }
    e.preventDefault();
    if (n < 0 || n >= count || n === i) return;
    setFocusIdx(n);
    refs.current[n]?.focus();
  };

  const itemProps = (i: number) => ({
    ref: (el: HTMLElement | null) => {
      refs.current[i] = el;
    },
    tabIndex: i === tabIdx ? 0 : -1,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => onKeyDown(e, i),
    onFocus: (e: FocusEvent<HTMLElement>) => {
      setFocusIdx(i);
      activate(i, e.currentTarget);
    },
    onBlur: () => setActive((a) => (a && a.index === i ? null : a)),
    onMouseEnter: (e: ReactMouseEvent<HTMLElement>) => activate(i, e.currentTarget),
  });

  const onMouseLeave = (): void => {
    const focused = refs.current.findIndex((r) => r !== null && r === document.activeElement);
    const el = focused >= 0 ? refs.current[focused] : null;
    if (el) activate(focused, el);
    else setActive(null);
  };

  return { active, itemProps, onMouseLeave };
}

/* ------------------------------------------------------------------ */
/* Tooltip, legenda, karta grafu                                       */
/* ------------------------------------------------------------------ */

export type MarkKind = 'rect' | 'line' | 'dash' | 'hatch' | 'closed' | 'target';

export interface TipRow {
  key: string;
  value: string;
  label: string;
  colorClass?: string;
  mark?: MarkKind;
}

interface ChartTipProps {
  x: number;
  y: number;
  /** Šířka kontejneru – tooltip z něj nevyjede. */
  bounds: number;
  title: ReactNode;
  rows?: TipRow[];
  note?: ReactNode;
}

/** Tooltip: hodnota vede, popisek následuje; klíč série je krátká čára. */
export function ChartTip({ x, y, bounds, title, rows, note }: ChartTipProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.round(clamp(x - w / 2, 0, Math.max(0, bounds - w)));
    const above = y - h - 10;
    const top = Math.round(above < -48 ? y + 18 : above);
    setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
  });
  return (
    <div
      ref={ref}
      className="st-tip"
      aria-hidden="true"
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
    >
      <div className="st-tip__title">{title}</div>
      {rows && rows.length > 0 && (
        <div className="st-tip__rows">
          {rows.map((r) => (
            <div key={r.key} className="st-tip__row">
              {r.colorClass ? <span className={cx('st-mark', `st-mark--${r.mark ?? 'line'}`, r.colorClass)} /> : <span />}
              <strong className="st-tip__value">{r.value}</strong>
              <span className="st-tip__label">{r.label}</span>
            </div>
          ))}
        </div>
      )}
      {note != null && <div className="st-tip__note">{note}</div>}
    </div>
  );
}

export function LegendItem({
  colorClass,
  mark = 'rect',
  children,
}: {
  colorClass: string;
  mark?: MarkKind;
  children: ReactNode;
}): JSX.Element {
  return (
    <span className="st-key">
      <span className={cx('st-mark', `st-mark--${mark}`, colorClass)} aria-hidden="true" />
      {children}
    </span>
  );
}

interface ChartCardProps {
  title: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  legend?: ReactNode;
  /** Tabulková podoba grafu (přepínač v hlavičce). */
  table?: () => ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ChartCard({ title, subtitle, meta, legend, table, footer, children, className }: ChartCardProps): JSX.Element {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card as="section" aria-label={title} className={cx('st-card', className)}>
      <CardHeader
        title={title}
        subtitle={subtitle}
        meta={meta}
        actions={
          table ? (
            <IconButton
              icon={asTable ? 'chart' : 'list'}
              label="Zobrazit hodnoty v tabulce"
              size="sm"
              aria-pressed={asTable}
              onClick={() => setAsTable((v) => !v)}
            />
          ) : undefined
        }
      />
      {legend != null && !asTable && <div className="st-legend">{legend}</div>}
      {asTable && table ? <div className="st-tableview">{table()}</div> : children}
      {footer}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* SVG pomůcky                                                         */
/* ------------------------------------------------------------------ */

/** Obdélník se zaoblenými horními rohy (datový konec), dole rovný (základna). */
function topRounded(x: number, y: number, w: number, h: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, w / 2, h));
  return `M${x},${y + h}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h}Z`;
}

function Patterns({ id }: { id: string }): JSX.Element {
  return (
    <defs>
      <pattern id={`${id}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" className="st-pat-hatch-bg" />
        <rect width="2.5" height="6" className="st-pat-hatch-fg" />
      </pattern>
      <pattern id={`${id}-closed`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" className="st-pat-closed-bg" />
        <rect width="2" height="6" className="st-pat-closed-fg" />
      </pattern>
    </defs>
  );
}

/** Vybere indexy popisků osy X tak, aby se nepřekrývaly (přednost mají kotvy – pondělí). */
function pickLabels(anchors: boolean[], band: number, minGap: number): Set<number> {
  const out = new Set<number>();
  if (band <= 0 || anchors.length === 0) return out;
  const every = Math.max(1, Math.ceil(minGap / band));
  const useAnchors = every > 3 && every <= 7 && anchors.some(Boolean);
  let last = -Infinity;
  anchors.forEach((isAnchor, i) => {
    const candidate = useAnchors ? isAnchor : i % every === 0;
    if (candidate && i - last >= every) {
      out.add(i);
      last = i;
    }
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Skládaný sloupcový graf                                             */
/* ------------------------------------------------------------------ */

export interface ColumnSeries {
  id: string;
  label: string;
  colorClass: string;
  /** Šrafovaná výplň (rezervováno / čeká). */
  hatch?: boolean;
}

export interface ColumnDatum {
  key: string;
  axisLabel: string;
  /** Preferované místo popisku osy (pondělí). */
  anchor?: boolean;
  title: string;
  values: number[];
  closed?: boolean;
  /** Zvýrazněný popisek (dnešek). */
  strong?: boolean;
}

interface ColumnChartProps {
  data: ColumnDatum[];
  series: ColumnSeries[];
  /** Souhrn grafu pro čtečky. */
  label: string;
  /** Popis skupiny bodů („Jednotlivé dny“). */
  pointsLabel: string;
  totalText: (n: number) => string;
  height?: number;
}

export function ColumnChart({ data, series, label, pointsLabel, totalText, height = 188 }: ColumnChartProps): JSX.Element {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const uid = useSvgId('stc');
  const totals = data.map((d) => d.values.reduce((a, v) => a + v, 0));
  const maxTotal = totals.reduce((m, v) => Math.max(m, v), 0);
  const scale = niceScale(maxTotal, 4, true);
  const M = {
    top: 22,
    right: 4,
    bottom: 24,
    left: Math.ceil(Math.max(...scale.ticks.map((t) => textW(formatNumber(t))))) + 10,
  };
  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = height - M.top - M.bottom;
  const n = data.length;
  const band = n ? plotW / n : 0;
  const barW = Math.max(1, Math.min(24, band * 0.66, band - 2));
  const yOf = (v: number): number => M.top + plotH - (scale.max ? (v / scale.max) * plotH : 0);
  const xOf = (i: number): number => M.left + band * i + band / 2;
  const roving = useRoving(n, { anchor: (i) => ({ x: xOf(i), y: yOf(totals[i]) }) });
  const labels = pickLabels(
    data.map((d) => !!d.anchor),
    band,
    Math.max(...data.map((d) => textW(d.axisLabel)), 20) + 12,
  );
  const maxIdx = maxTotal > 0 ? totals.indexOf(maxTotal) : -1;
  const active = roving.active;

  const ariaFor = (d: ColumnDatum, i: number): string => {
    const parts = series.map((s, si) => (d.values[si] > 0 ? `${s.label.toLowerCase()} ${formatNumber(d.values[si])}` : '')).filter(Boolean);
    if (d.closed) return `${d.title}: zavřeno`;
    return `${d.title}: ${totalText(totals[i])}${parts.length ? ' – ' + parts.join(', ') : ''}`;
  };

  return (
    <div className="st-plot" ref={ref} style={{ height }} onMouseLeave={roving.onMouseLeave}>
      {width > 0 && (
        <>
          <svg className="st-svg" width={width} height={height} role="img" aria-label={label}>
            <Patterns id={uid} />
            {data.map((d, i) =>
              d.closed ? (
                <rect
                  key={'c' + d.key}
                  x={M.left + band * i + 1}
                  y={M.top}
                  width={Math.max(0, band - 2)}
                  height={plotH}
                  fill={`url(#${uid}-closed)`}
                />
              ) : null,
            )}
            {active && active.index < n && (
              <rect className="st-hover" x={M.left + band * active.index} y={M.top - 6} width={band} height={plotH + 6} rx={4} />
            )}
            {scale.ticks.map((t) =>
              t === 0 ? null : (
                <line key={'g' + t} className="st-gridline" x1={M.left} x2={width - M.right} y1={crisp(yOf(t))} y2={crisp(yOf(t))} />
              ),
            )}
            {data.map((d, i) => {
              const x = xOf(i) - barW / 2;
              const parts: { si: number; v: number }[] = [];
              d.values.forEach((v, si) => {
                if (v > 0) parts.push({ si, v });
              });
              let cum = 0;
              const gaps: number[] = [];
              const shapes = parts.map((p, k) => {
                const y0 = yOf(cum);
                cum += p.v;
                const y1 = yOf(cum);
                const h = Math.max(0, y0 - y1);
                const s = series[p.si];
                const style: CSSProperties | undefined = s.hatch ? { fill: `url(#${uid}-hatch)` } : undefined;
                if (k < parts.length - 1) gaps.push(y1);
                return k === parts.length - 1 ? (
                  <path key={s.id} className={cx('st-seg', s.colorClass)} style={style} d={topRounded(x, y1, barW, h, 4)} />
                ) : (
                  <rect key={s.id} className={cx('st-seg', s.colorClass)} style={style} x={x} y={y1} width={barW} height={h} />
                );
              });
              return (
                <g key={d.key}>
                  {shapes}
                  {gaps.map((gy) => (
                    <line key={gy} className="st-gap" x1={x} x2={x + barW} y1={gy} y2={gy} />
                  ))}
                </g>
              );
            })}
            <line className="st-axis" x1={M.left} x2={width - M.right} y1={crisp(yOf(0))} y2={crisp(yOf(0))} />
            {scale.ticks.map((t) => (
              <text key={'y' + t} className="st-tick" x={M.left - 8} y={yOf(t) + 4} textAnchor="end">
                {formatNumber(t)}
              </text>
            ))}
            {[...labels].map((i) => {
              const d = data[i];
              const half = textW(d.axisLabel) / 2;
              return (
                <text
                  key={'x' + d.key}
                  className={cx('st-tick', d.strong && 'st-tick--strong')}
                  x={clamp(xOf(i), half, width - half)}
                  y={height - 7}
                  textAnchor="middle"
                >
                  {d.axisLabel}
                </text>
              );
            })}
            {maxIdx >= 0 && (
              <text
                className="st-direct"
                x={clamp(xOf(maxIdx), textW(formatNumber(maxTotal)) / 2, width - textW(formatNumber(maxTotal)) / 2)}
                y={yOf(maxTotal) - 6}
                textAnchor="middle"
              >
                {formatNumber(maxTotal)}
              </text>
            )}
          </svg>
          <div className="st-hits" role="group" aria-label={pointsLabel}>
            {data.map((d, i) => (
              <div
                key={d.key}
                role="img"
                aria-label={ariaFor(d, i)}
                className="st-hit"
                style={{ left: M.left + band * i, top: M.top - 6, width: band, height: plotH + M.bottom + 6 }}
                {...roving.itemProps(i)}
              />
            ))}
          </div>
          {active && data[active.index] && (
            <ChartTip
              x={active.x}
              y={active.y}
              bounds={width}
              title={`${data[active.index].title} · ${data[active.index].closed ? 'zavřeno' : totalText(totals[active.index])}`}
              rows={series
                .map((s, si) => ({
                  key: s.id,
                  value: formatNumber(data[active.index].values[si]),
                  label: s.label,
                  colorClass: s.colorClass,
                  mark: (s.hatch ? 'hatch' : 'line') as MarkKind,
                }))
                .filter((_, si) => data[active.index].values[si] > 0)}
            />
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Vodorovné pruhy (obsazenost terapeutů, kategorie, permanentky)      */
/* ------------------------------------------------------------------ */

export interface BarRow {
  key: string;
  label: ReactNode;
  /** Hodnota v jednotkách domény (např. podíl 0–1). */
  value: number;
  cells: ReactNode[];
  ariaLabel: string;
  tipTitle: ReactNode;
  tipRows?: TipRow[];
  tipNote?: ReactNode;
  muted?: boolean;
}

interface BarListProps {
  rows: BarRow[];
  /** Horní mez domény (100 % = 1). */
  max: number;
  /** CSS grid-template-columns: popisek, pruh, buňky. */
  columns: string;
  /** Záhlaví buněk vpravo (zarovnané se sloupci). */
  headers?: string[];
  target?: { value: number; label: string };
  label: string;
  colorClass?: string;
  size?: 'md' | 'sm';
  /** Podklad pruhu = 100 % domény (jen když má 100 % význam, např. obsazenost). */
  track?: boolean;
}

export function BarList({
  rows,
  max,
  columns,
  headers,
  target,
  label,
  colorClass = 'st-c-accent',
  size = 'md',
  track = false,
}: BarListProps): JSX.Element {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const roving = useRoving(rows.length, {
    anchor: (i, el) => {
      const trackEl = el.querySelector<HTMLElement>('.st-bars__track');
      if (!trackEl) return { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop };
      const share = max > 0 && rows[i] ? clamp(rows[i].value / max, 0, 1) : 0;
      return { x: trackEl.offsetLeft + trackEl.offsetWidth * share, y: trackEl.offsetTop - 2 };
    },
  });
  const active = roving.active;
  const frac = (v: number): string => `${(max > 0 ? clamp(v / max, 0, 1) : 0) * 100}%`;
  const cellCount = Math.max(headers?.length ?? 0, ...rows.map((r) => r.cells.length), 0);
  // úzký kontejner: popisek a hodnoty na řádku, pruh pod nimi přes celou šířku
  const style = { '--st-cols': columns, '--st-cols-sm': `minmax(0, 1fr) repeat(${cellCount}, auto)` } as CSSProperties;
  return (
    <div
      className={cx('st-bars', size === 'sm' && 'st-bars--sm', track && 'st-bars--track')}
      ref={ref}
      style={style}
      onMouseLeave={roving.onMouseLeave}
    >
      {(headers || target) && (
        <div className="st-bars__head" aria-hidden="true">
          <span />
          <span className="st-bars__axis">
            {target && (
              <span className="st-bars__target-label" style={{ left: frac(target.value) }}>
                {target.label}
              </span>
            )}
          </span>
          {(headers ?? []).map((h) => (
            <span key={h} className="st-bars__cell">
              {h}
            </span>
          ))}
        </div>
      )}
      <div role="group" aria-label={label} className="st-bars__rows">
        {rows.map((r, i) => (
          <div
            key={r.key}
            role="img"
            aria-label={r.ariaLabel}
            className={cx('st-bars__row', r.muted && 'is-muted', active?.index === i && 'is-active')}
            {...roving.itemProps(i)}
          >
            <span className="st-bars__label">{r.label}</span>
            <span className="st-bars__track">
              {r.value > 0 && <span className={cx('st-bars__fill', colorClass)} style={{ width: frac(r.value) }} />}
              {target && <span className="st-bars__target" style={{ left: frac(target.value) }} />}
            </span>
            {r.cells.map((c, ci) => (
              <span key={ci} className="st-bars__cell">
                {c}
              </span>
            ))}
          </div>
        ))}
      </div>
      {active && rows[active.index] && width > 0 && (
        <ChartTip
          x={active.x}
          y={active.y}
          bounds={width}
          title={rows[active.index].tipTitle}
          rows={rows[active.index].tipRows}
          note={rows[active.index].tipNote}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Heatmapa Po–So × 7–19 h                                             */
/* ------------------------------------------------------------------ */

export function Heatmap({ cells, label }: { cells: HeatCell[]; label: string }): JSX.Element {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const cols = HEAT_HOURS.length;
  const roving = useRoving(cells.length, { columns: cols });
  const active = roving.active;
  const cell = active ? cells[active.index] : null;
  const range = (c: HeatCell): string => `${WEEKDAY_SHORT6[c.weekday]} ${c.hour}:00–${c.hour + 1}:00`;
  return (
    <div className="st-heat" ref={ref} onMouseLeave={roving.onMouseLeave}>
      <div className="st-heat__grid" role="group" aria-label={label} style={{ '--st-heat-cols': cols } as CSSProperties}>
        <span aria-hidden="true" />
        {HEAT_HOURS.map((h) => (
          <span key={h} className="st-heat__hour" aria-hidden="true">
            {h}
          </span>
        ))}
        {WEEKDAY_SHORT6.map((day, wd) => [
          <span key={'d' + wd} className="st-heat__day" aria-hidden="true">
            {day}
          </span>,
          ...HEAT_HOURS.map((_, hi) => {
            const i = wd * cols + hi;
            const c = cells[i];
            const closed = !c || c.available <= 0;
            return (
              <span
                key={i}
                role="img"
                aria-label={c ? `${range(c)}: ${closed ? 'zavřeno' : `obsazeno ${formatNumber(Math.round(c.pct * 100))} %`}` : ''}
                className={cx(
                  'st-heat__cell',
                  closed ? 'is-closed' : `st-heat__cell--${heatLevel(c.pct)}`,
                  active?.index === i && 'is-active',
                )}
                {...roving.itemProps(i)}
              />
            );
          }),
        ])}
      </div>
      {active && cell && width > 0 && (
        <ChartTip
          x={active.x}
          y={active.y}
          bounds={width}
          title={range(cell)}
          rows={cell.available > 0 ? [{ key: 'p', value: `${formatNumber(Math.round(cell.pct * 100))} %`, label: 'obsazeno' }] : undefined}
          note={
            cell.available > 0
              ? `${formatDuration(Math.round(cell.booked))} z ${formatDuration(Math.round(cell.available))} pracovní doby (součet za období)`
              : 'Mimo pracovní dobu'
          }
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Spojnicový graf (trend)                                             */
/* ------------------------------------------------------------------ */

export interface LineSeries {
  id: string;
  label: string;
  colorClass: string;
  dashed?: boolean;
  values: Array<number | null>;
}

interface LineChartProps {
  series: LineSeries[];
  labels: string[];
  shortLabels: string[];
  titles: string[];
  /** Prázdná značka (rozpracované období). */
  hollow?: boolean[];
  strongIndex?: number;
  label: string;
  pointsLabel: string;
  format: (v: number) => string;
  /** Popisky osy Y (výchozí = format). */
  tickFormat?: (v: number) => string;
  tipNote?: (i: number) => ReactNode;
  /** Nejmenší horní mez osy (aby šum nevypadal jako skok). */
  minMax?: number;
  height?: number;
}

export function LineChart({
  series,
  labels,
  shortLabels,
  titles,
  hollow = [],
  strongIndex,
  label,
  pointsLabel,
  format,
  tickFormat,
  tipNote,
  minMax = 0,
  height = 196,
}: LineChartProps): JSX.Element {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const n = labels.length;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const scale = niceScale(Math.max(minMax, ...all, 0), 4);
  const tickText = (t: number): string => (tickFormat ?? format)(t);
  const lastIdx = n - 1;
  // místo vpravo pro přímé popisky posledního bodu
  const endTexts = series
    .map((s) => s.values[lastIdx])
    .filter((v): v is number => v !== null && v !== undefined)
    .map(format);
  const endW = endTexts.length ? Math.max(...endTexts.map(textW)) + 12 : 0;
  const left = Math.ceil(Math.max(...scale.ticks.map((t) => textW(tickText(t))))) + 10;
  const band0 = n ? Math.max(0, width - left - 8) / n : 0;
  const M = {
    top: 16,
    right: Math.max(8, Math.ceil(endW - band0 / 2 + 4)),
    bottom: 24,
    left,
  };
  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = height - M.top - M.bottom;
  const band = n ? plotW / n : 0;
  const xOf = (i: number): number => M.left + band * (i + 0.5);
  const yOf = (v: number): number => M.top + plotH - (scale.max ? (v / scale.max) * plotH : 0);
  const topAt = (i: number): number => {
    const ys = series
      .map((s) => s.values[i])
      .filter((v): v is number => v !== null)
      .map(yOf);
    return ys.length ? Math.min(...ys) : M.top + plotH;
  };
  const roving = useRoving(n, { anchor: (i) => ({ x: xOf(i), y: topAt(i) - 4 }) });
  const active = roving.active;

  const longest = Math.max(...labels.map((l) => textW(l)), 0);
  const useShort = band < longest + 10;
  const shown = useShort ? shortLabels : labels;
  const every = band > 0 ? Math.max(1, Math.ceil((Math.max(...shown.map((l) => textW(l)), 0) + 8) / band)) : 1;

  const pathOf = (values: Array<number | null>): string => {
    let d = '';
    let open = false;
    values.forEach((v, i) => {
      if (v === null) {
        open = false;
        return;
      }
      d += `${open ? 'L' : 'M'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`;
      open = true;
    });
    return d;
  };

  // přímé popisky na konci čar, jen když se vejdou a nepřekrývají
  const ends = series
    .map((s) => ({ s, v: s.values[lastIdx] }))
    .filter((e): e is { s: LineSeries; v: number } => e.v !== null && e.v !== undefined)
    .map((e) => ({ ...e, y: yOf(e.v), text: format(e.v) }));
  const room = band / 2 + M.right - 12;
  const endsFit =
    ends.length > 0 &&
    ends.every((e) => textW(e.text) <= room) &&
    ends.every((e, i) => ends.every((o, j) => i === j || Math.abs(o.y - e.y) >= 15));

  return (
    <div className="st-plot" ref={ref} style={{ height }} onMouseLeave={roving.onMouseLeave}>
      {width > 0 && (
        <>
          <svg className="st-svg" width={width} height={height} role="img" aria-label={label}>
            {scale.ticks.map((t) =>
              t === 0 ? null : (
                <line key={'g' + t} className="st-gridline" x1={M.left} x2={width - M.right} y1={crisp(yOf(t))} y2={crisp(yOf(t))} />
              ),
            )}
            <line className="st-axis" x1={M.left} x2={width - M.right} y1={crisp(yOf(0))} y2={crisp(yOf(0))} />
            {scale.ticks.map((t) => (
              <text key={'y' + t} className="st-tick" x={M.left - 8} y={yOf(t) + 4} textAnchor="end">
                {tickText(t)}
              </text>
            ))}
            {shown.map((l, i) =>
              i % every === 0 || i === strongIndex ? (
                <text
                  key={'x' + i}
                  className={cx('st-tick', i === strongIndex && 'st-tick--strong')}
                  x={clamp(xOf(i), textW(l) / 2, width - textW(l) / 2)}
                  y={height - 7}
                  textAnchor="middle"
                >
                  {l}
                </text>
              ) : null,
            )}
            {labels.map((l, i) =>
              series.every((s) => s.values[i] === null) ? (
                <text key={'n' + l + i} className="st-nodata" x={xOf(i)} y={M.top + plotH / 2 + 4} textAnchor="middle">
                  bez dat
                </text>
              ) : null,
            )}
            {active && (
              <line
                className="st-crosshair"
                x1={crisp(xOf(active.index))}
                x2={crisp(xOf(active.index))}
                y1={M.top - 4}
                y2={M.top + plotH}
              />
            )}
            {series.map((s) => (
              <path key={s.id} className={cx('st-line', s.colorClass, s.dashed && 'st-line--dashed')} d={pathOf(s.values)} />
            ))}
            {series.map((s) =>
              s.values.map((v, i) =>
                v === null ? null : (
                  <circle
                    key={s.id + i}
                    className={cx('st-dot', s.colorClass, hollow[i] && 'st-dot--hollow')}
                    cx={xOf(i)}
                    cy={yOf(v)}
                    r={active?.index === i ? 5 : 4}
                  />
                ),
              ),
            )}
            {endsFit &&
              ends.map((e) => (
                <text key={'e' + e.s.id} className="st-direct st-direct--end" x={xOf(lastIdx) + 9} y={e.y + 4} textAnchor="start">
                  {e.text}
                </text>
              ))}
          </svg>
          <div className="st-hits" role="group" aria-label={pointsLabel}>
            {labels.map((l, i) => (
              <div
                key={l + i}
                role="img"
                aria-label={`${titles[i]}: ${series
                  .map((s) => `${s.label.toLowerCase()} ${s.values[i] === null ? 'bez dat' : format(s.values[i] as number)}`)
                  .join(', ')}`}
                className="st-hit"
                style={{ left: M.left + band * i, top: M.top - 6, width: band, height: plotH + M.bottom + 6 }}
                {...roving.itemProps(i)}
              />
            ))}
          </div>
          {active && (
            <ChartTip
              x={active.x}
              y={active.y}
              bounds={width}
              title={titles[active.index]}
              rows={series.map((s) => ({
                key: s.id,
                value: s.values[active.index] === null ? '—' : format(s.values[active.index] as number),
                label: s.label,
                colorClass: s.colorClass,
                mark: s.dashed ? 'dash' : 'line',
              }))}
              note={tipNote?.(active.index)}
            />
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Obsazenost dne po hodinách (Přehled)                                */
/* ------------------------------------------------------------------ */

interface HourlyChartProps {
  slots: HourSlot[];
  /** Minuty od půlnoci (čára „teď“), null = jiný den. */
  nowMinutes: number | null;
  label: string;
  height?: number;
}

export function HourlyChart({ slots, nowMinutes, label, height = 142 }: HourlyChartProps): JSX.Element {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const uid = useSvgId('sth');
  const n = slots.length;
  const M = { top: 20, right: 2, bottom: 20, left: 2 };
  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = height - M.top - M.bottom;
  const band = n ? plotW / n : 0;
  const barW = Math.max(2, Math.min(22, band * 0.64, band - 2));
  const firstHour = slots[0]?.hour ?? 7;
  const xOf = (i: number): number => M.left + band * i + band / 2;
  const ratio = (s: HourSlot): number => (s.available > 0 ? clamp(s.booked / s.available, 0, 1) : 0);
  const yOfRatio = (r: number): number => M.top + plotH - r * plotH;
  const roving = useRoving(n, { anchor: (i) => ({ x: xOf(i), y: yOfRatio(ratio(slots[i])) }) });
  const active = roving.active;
  const every = band >= 22 ? 1 : band >= 11 ? 2 : 3;
  const nowX =
    nowMinutes !== null && nowMinutes >= firstHour * 60 && nowMinutes <= (firstHour + n) * 60
      ? M.left + ((nowMinutes - firstHour * 60) / 60) * band
      : null;
  const free = (s: HourSlot): number => Math.max(0, s.available - s.booked);

  return (
    <div className="st-plot" ref={ref} style={{ height }} onMouseLeave={roving.onMouseLeave}>
      {width > 0 && (
        <>
          <svg className="st-svg" width={width} height={height} role="img" aria-label={label}>
            <Patterns id={uid} />
            {active && <rect className="st-hover" x={M.left + band * active.index} y={M.top - 4} width={band} height={plotH + 4} rx={4} />}
            {slots.map((s, i) => {
              const x = xOf(i) - barW / 2;
              if (s.available <= 0) {
                return <rect key={s.hour} x={x} y={M.top + plotH - 6} width={barW} height={6} fill={`url(#${uid}-closed)`} />;
              }
              const r = ratio(s);
              const past = nowMinutes !== null && (s.hour + 1) * 60 <= nowMinutes;
              return (
                <g key={s.hour}>
                  <path className="st-track" d={topRounded(x, M.top, barW, plotH, 4)} />
                  {r > 0 && (
                    <path className={cx('st-seg', past ? 'st-c-past' : 'st-c-accent')} d={topRounded(x, yOfRatio(r), barW, plotH * r, 4)} />
                  )}
                </g>
              );
            })}
            <line className="st-axis" x1={M.left} x2={width - M.right} y1={crisp(M.top + plotH)} y2={crisp(M.top + plotH)} />
            {slots.map((s, i) =>
              i % every === 0 ? (
                <text key={'x' + s.hour} className="st-tick" x={xOf(i)} y={height - 5} textAnchor="middle">
                  {s.hour}
                </text>
              ) : null,
            )}
            {nowX !== null && (
              <g className="st-now">
                <line x1={crisp(nowX)} x2={crisp(nowX)} y1={M.top - 2} y2={M.top + plotH} />
                <text x={clamp(nowX, 12, width - 12)} y={M.top - 7} textAnchor="middle">
                  teď
                </text>
              </g>
            )}
          </svg>
          <div className="st-hits" role="group" aria-label="Jednotlivé hodiny">
            {slots.map((s, i) => (
              <div
                key={s.hour}
                role="img"
                aria-label={
                  s.available > 0
                    ? `${s.hour}:00–${s.hour + 1}:00: obsazeno ${formatNumber(Math.round(ratio(s) * 100))} %, volno ${formatDuration(free(s))}`
                    : `${s.hour}:00–${s.hour + 1}:00: mimo pracovní dobu`
                }
                className="st-hit"
                style={{ left: M.left + band * i, top: M.top - 4, width: band, height: plotH + M.bottom + 4 }}
                {...roving.itemProps(i)}
              />
            ))}
          </div>
          {active && slots[active.index] && (
            <ChartTip
              x={active.x}
              y={active.y}
              bounds={width}
              title={`${slots[active.index].hour}:00–${slots[active.index].hour + 1}:00`}
              rows={
                slots[active.index].available > 0
                  ? [
                      {
                        key: 'p',
                        value: `${formatNumber(Math.round(ratio(slots[active.index]) * 100))} %`,
                        label: 'obsazeno',
                        colorClass: 'st-c-accent',
                      },
                      { key: 'f', value: formatDuration(free(slots[active.index])), label: 'volné kapacity' },
                    ]
                  : undefined
              }
              note={
                slots[active.index].available > 0
                  ? `${slots[active.index].staff} ${plural(slots[active.index].staff, ['terapeut', 'terapeuti', 'terapeutů'])} v práci`
                  : 'Mimo pracovní dobu'
              }
            />
          )}
        </>
      )}
    </div>
  );
}
