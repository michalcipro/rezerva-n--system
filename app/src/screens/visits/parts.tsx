import { useSyncExternalStore, type ReactNode } from 'react';
import type { ClinicState, Id } from '../../domain/types';
import { VisitSourceBadge } from '../../components/payments';
import { TherapistAvatar } from '../../components/domain';
import { formatDayShort, formatMoney, formatNumber, formatTimeRange, prepZ } from '../../engine/format';
import { clientName, getClient, getTherapist, therapistShort } from '../../engine/selectors';
import { VISIT_SOURCE_LABEL, VISIT_SOURCES, type EmployeeVisitSummary, type VisitRow, type VisitSource } from '../../engine/visits';
import { navigate } from '../../store/session';
import { cx, Icon, IconButton, StatusPill, Table } from '../../ui';
import { employeeName, SUMMARY_SOURCE_COLUMNS, visitServiceTitle } from './model';
import './visits.css';

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

/** Odpovídá mediální dotaz (např. telefon)? */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
      const mq = window.matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

/* ------------------------------------------------------------------ */
/* Stránkování                                                         */
/* ------------------------------------------------------------------ */

export function Pager({
  page,
  pageCount,
  total,
  pageSize,
  onChange,
  label,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
  label: string;
}): JSX.Element | null {
  if (total <= pageSize) return null;
  const from = page * pageSize + 1;
  const to = Math.min(total, from + pageSize - 1);
  return (
    <nav className="vis-pager" aria-label={label}>
      <span className="vis-pager__info tnum">
        {formatNumber(from)}–{formatNumber(to)} {prepZ(total)} {formatNumber(total)}
      </span>
      <span className="vis-pager__controls">
        <IconButton icon="chevronLeft" label="Předchozí stránka" variant="secondary" size="sm" disabled={page <= 0} onClick={() => onChange(page - 1)} />
        <span className="vis-pager__page tnum" aria-live="polite">
          Strana {page + 1} {prepZ(pageCount)} {pageCount}
        </span>
        <IconButton
          icon="chevronRight"
          label="Další stránka"
          variant="secondary"
          size="sm"
          disabled={page >= pageCount - 1}
          onClick={() => onChange(page + 1)}
        />
      </span>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Filtr zdroje platby (lze vybrat více)                               */
/* ------------------------------------------------------------------ */

export function SourceChips({
  value,
  counts,
  onChange,
}: {
  value: readonly VisitSource[];
  counts: Record<VisitSource, number>;
  onChange: (next: VisitSource[]) => void;
}): JSX.Element {
  const toggle = (src: VisitSource): void => {
    const next = value.includes(src) ? value.filter((x) => x !== src) : [...value, src];
    // v pořadí VISIT_SOURCES; všechny vybrané = bez filtru
    const ordered = VISIT_SOURCES.filter((x) => next.includes(x));
    onChange(ordered.length === VISIT_SOURCES.length ? [] : ordered);
  };
  return (
    <div className="vis-sources" role="group" aria-label="Zdroj platby (lze vybrat více)">
      <span className="vis-sources__label" aria-hidden="true">
        Zdroj platby:
      </span>
      {VISIT_SOURCES.map((src) => {
        const pressed = value.includes(src);
        return (
          <button
            key={src}
            type="button"
            className={cx('vis-chip', `vis-chip--${src}`, counts[src] === 0 && !pressed && 'is-empty')}
            aria-pressed={pressed}
            onClick={() => toggle(src)}
          >
            {pressed && <Icon name="check" size={14} />}
            <span>{VISIT_SOURCE_LABEL[src]}</span>
            <span className="vis-chip__count tnum">{formatNumber(counts[src])}</span>
          </button>
        );
      })}
      {value.length > 0 && (
        <button type="button" className="link vis-sources__reset" onClick={() => onChange([])}>
          Všechny zdroje
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Souhrn po zaměstnancích                                             */
/* ------------------------------------------------------------------ */

const Num = ({ value, tone }: { value: number; tone?: 'warning' | 'danger' }): JSX.Element =>
  value === 0 ? <span className="vis-zero">0</span> : <span className={cx(tone && `vis-num--${tone}`)}>{formatNumber(value)}</span>;

const Money = ({ value }: { value: number }): JSX.Element =>
  value === 0 ? <span className="vis-zero">{formatMoney(0)}</span> : <>{formatMoney(value)}</>;

/** Nezaplacené jsou červeně jen tehdy, když jsou mezi nimi vstupy po termínu (dluh), ne jen plánované na místě. */
const toneOf = (src: VisitSource, overdue: number): 'warning' | 'danger' | undefined =>
  src === 'qr_pending' ? 'warning' : src === 'unpaid' && overdue > 0 ? 'danger' : undefined;

function SummaryCells({ x, overdue }: { x: EmployeeVisitSummary; overdue: number }): JSX.Element {
  return (
    <>
      <td className="num fw-semibold">
        <Num value={x.total} />
      </td>
      {SUMMARY_SOURCE_COLUMNS.map((c) => (
        <td key={c.source} className="num">
          <Num value={x.bySource[c.source]} tone={toneOf(c.source, overdue)} />
          {c.source === 'unpaid' && x.bySource.unpaid > 0 && (
            <span className="visually-hidden">, z toho po termínu {formatNumber(overdue)}</span>
          )}
        </td>
      ))}
      <td className="num">
        <Money value={x.singleRevenue} />
      </td>
      <td className="num">
        <Money value={x.prepaidValue} />
      </td>
    </>
  );
}

export function EmployeeSummaryTable({
  clinic,
  byEmployee,
  totals,
  selected,
  onSelect,
  locked,
  overdueUnpaid,
}: {
  clinic: ClinicState;
  byEmployee: readonly EmployeeVisitSummary[];
  totals: EmployeeVisitSummary;
  /** Zaměstnanec, podle kterého je filtrovaný seznam vstupů. */
  selected: Id | null;
  /** Klik na řádek: filtrovat seznam (opětovný klik filtr zruší). */
  onSelect: (therapistId: Id | null) => void;
  /** Terapeut vidí jen sebe – řádek se nevybírá. */
  locked: boolean;
  /** Nezaplacené vstupy po termínu podle zaměstnance (klíč '' = celkem). */
  overdueUnpaid: ReadonlyMap<Id, number>;
}): JSX.Element {
  return (
    <Table caption="Vstupy po zaměstnancích podle zdroje platby" hover={!locked} minWidth={940} wrapperClassName="vis-summary" density="compact">
      <thead>
        <tr>
          <th scope="col">Zaměstnanec</th>
          <th scope="col" className="num">
            Celkem
          </th>
          {SUMMARY_SOURCE_COLUMNS.map((c) => (
            <th key={c.source} scope="col" className="num">
              {c.label}
            </th>
          ))}
          <th scope="col" className="num">
            Tržba jednorázově
          </th>
          <th scope="col" className="num">
            Hodnota předplacených
          </th>
        </tr>
      </thead>
      <tbody>
        {byEmployee.map((x) => {
          const t = getTherapist(clinic, x.therapistId);
          const name = employeeName(clinic, x.therapistId);
          const isSel = selected === x.therapistId;
          return (
            <tr
              key={x.therapistId}
              className={cx(isSel && 'is-selected', t && !t.active && 'vis-row--inactive')}
              data-clickable={locked ? undefined : ''}
              onClick={locked ? undefined : () => onSelect(isSel ? null : x.therapistId)}
            >
              <th scope="row" className="vis-summary__who">
                <span className="vis-who">
                  <TherapistAvatar therapist={t} size="xs" />
                  {locked ? (
                    <span className="vis-who__name">{name}</span>
                  ) : (
                    <button
                      type="button"
                      className="vis-rowlink vis-who__name"
                      aria-pressed={isSel}
                      title={isSel ? 'Zobrazit vstupy všech zaměstnanců' : 'Zobrazit jen vstupy tohoto zaměstnance'}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(isSel ? null : x.therapistId);
                      }}
                    >
                      {name}
                    </button>
                  )}
                  {t && !t.active && <span className="vis-who__note">neaktivní</span>}
                </span>
              </th>
              <SummaryCells x={x} overdue={overdueUnpaid.get(x.therapistId) ?? 0} />
            </tr>
          );
        })}
      </tbody>
      {byEmployee.length > 1 && (
        <tfoot>
          <tr>
            <th scope="row" className="vis-summary__who">
              Celkem
            </th>
            <SummaryCells x={totals} overdue={overdueUnpaid.get('') ?? 0} />
          </tr>
        </tfoot>
      )}
    </Table>
  );
}

/* ------------------------------------------------------------------ */
/* Seznam vstupů                                                       */
/* ------------------------------------------------------------------ */

interface ListProps {
  clinic: ClinicState;
  rows: readonly VisitRow[];
  showEmployee: boolean;
  onOpen: (bookingId: Id) => void;
}

function ClientLink({ clinic, clientId }: { clinic: ClinicState; clientId: Id }): JSX.Element {
  const c = getClient(clinic, clientId);
  if (!c) return <span className="muted">Neznámý klient</span>;
  return (
    <button
      type="button"
      className="vis-rowlink"
      title="Otevřít kartu klienta"
      onClick={(e) => {
        e.stopPropagation();
        navigate({ name: 'klient', clientId });
      }}
    >
      {clientName(c)}
    </button>
  );
}

function ServiceCell({ clinic, row }: { clinic: ClinicState; row: VisitRow }): JSX.Element {
  const svc = visitServiceTitle(clinic, row);
  return (
    <span className="vis-service">
      <span className="vis-service__title">
        {svc.group && <Icon name="users" size={14} className="vis-service__icon" />}
        {svc.title}
      </span>
      {svc.group && svc.title !== svc.service && <span className="vis-sub">{svc.service}</span>}
    </span>
  );
}

const amountOf = (row: VisitRow): ReactNode =>
  row.info.amount === 0 ? <span className="vis-zero">{formatMoney(0)}</span> : formatMoney(row.info.amount);

export function VisitTable({ clinic, rows, showEmployee, onOpen }: ListProps): JSX.Element {
  return (
    <Table caption="Seznam vstupů" hover minWidth={showEmployee ? 1040 : 900} wrapperClassName="vis-tablewrap">
      <thead>
        <tr>
          <th scope="col">Datum a čas</th>
          <th scope="col">Klient</th>
          <th scope="col">Služba</th>
          {showEmployee && <th scope="col">Zaměstnanec</th>}
          <th scope="col">Stav</th>
          <th scope="col">Zdroj platby</th>
          <th scope="col" className="num">
            Částka
          </th>
          <th scope="col">
            <span className="visually-hidden">Akce</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const b = r.booking;
          return (
            <tr key={b.id} data-clickable="" onClick={() => onOpen(b.id)}>
              <td className="nowrap">
                <span className="vis-when">
                  <span>{formatDayShort(b.start)}</span>
                  <span className="vis-sub tnum">{formatTimeRange(b.start, b.end)}</span>
                </span>
              </td>
              <td>
                <ClientLink clinic={clinic} clientId={b.clientId} />
              </td>
              <td>
                <ServiceCell clinic={clinic} row={r} />
              </td>
              {showEmployee && <td className="nowrap">{therapistShort(getTherapist(clinic, b.therapistId))}</td>}
              <td className="nowrap">
                <StatusPill status={b.status} size="sm" appearance="plain" />
              </td>
              <td className="vis-sourcecell">
                <VisitSourceBadge info={r.info} booking={r.booking} showDetail />
              </td>
              <td className="num">{amountOf(r)}</td>
              <td className="vis-actioncell">
                <IconButton
                  icon="chevronRight"
                  size="sm"
                  label={`Detail rezervace ${formatDayShort(b.start)} ${formatTimeRange(b.start, b.end)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(b.id);
                  }}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

/** Seznam vstupů na telefonu (karty místo široké tabulky). */
export function VisitCards({ clinic, rows, showEmployee, onOpen }: ListProps): JSX.Element {
  return (
    <ul className="vis-mlist">
      {rows.map((r) => {
        const b = r.booking;
        const svc = visitServiceTitle(clinic, r);
        return (
          <li key={b.id} className="vis-mrow">
            <div className="vis-mrow__main">
              <div className="vis-mrow__line">
                <ClientLink clinic={clinic} clientId={b.clientId} />
                <span className="vis-mrow__amount tnum">{amountOf(r)}</span>
              </div>
              <span className="vis-sub tnum">
                {formatDayShort(b.start)} · {formatTimeRange(b.start, b.end)}
              </span>
              <span className="vis-sub">
                {svc.title}
                {showEmployee ? ` · ${therapistShort(getTherapist(clinic, b.therapistId))}` : ''}
              </span>
              <span className="vis-mrow__badges">
                <StatusPill status={b.status} size="sm" appearance="plain" />
                <VisitSourceBadge info={r.info} booking={r.booking} showDetail />
              </span>
            </div>
            <IconButton
              icon="chevronRight"
              size="sm"
              className="vis-mrow__open"
              label={`Detail rezervace ${formatDayShort(b.start)} ${formatTimeRange(b.start, b.end)}`}
              onClick={() => onOpen(b.id)}
            />
          </li>
        );
      })}
    </ul>
  );
}
