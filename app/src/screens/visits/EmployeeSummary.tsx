import type { ClinicState, Id } from '../../domain/types';
import { countLabel, formatMoney, formatNumber } from '../../engine/format';
import { getTherapist, therapistName } from '../../engine/selectors';
import type { VisitSummary } from '../../engine/visits';
import { TherapistAvatar } from '../../components/domain';
import { Badge, Icon, Table, cx } from '../../ui';
import { fromControl, useWidth } from './hooks';

interface Column {
  key: string;
  label: string;
  value: (s: VisitSummary) => number;
  money?: boolean;
  /** Nenulová hodnota je upozornění (nezaplacené vstupy). */
  alert?: boolean;
}

const TOTAL: Column = { key: 'total', label: 'Vstupy', value: (s) => s.total };

/** Počty podle zdroje platby + nezaplacené (pořadí jako VISIT_KINDS). */
const COUNT_COLUMNS: Column[] = [
  { key: 'package', label: 'Permanentka', value: (s) => s.byKind.package },
  { key: 'credit', label: 'Kredit', value: (s) => s.byKind.credit },
  { key: 'single', label: 'Jednorázově', value: (s) => s.byKind.single },
  { key: 'makeup', label: 'Náhrada', value: (s) => s.byKind.makeup },
  { key: 'free', label: 'Zdarma', value: (s) => s.byKind.free },
  { key: 'unpaid', label: 'Nezaplaceno', value: (s) => s.unpaid, alert: true },
];

const MONEY_COLUMNS: Column[] = [
  { key: 'singleRevenue', label: 'Tržba jednorázově', value: (s) => s.singleRevenue, money: true },
  { key: 'prepaidValue', label: 'Hodnota předplacených', value: (s) => s.prepaidValue, money: true },
];

const COLUMNS: Column[] = [TOTAL, ...COUNT_COLUMNS, ...MONEY_COLUMNS];

const VSTUP: [string, string, string] = ['vstup', 'vstupy', 'vstupů'];

/** Od jaké šířky karty se vejde celá tabulka (užší místo = kartičky v mřížce, na telefonu pod sebou). */
const TABLE_MIN_WIDTH = 976;

function CellValue({ col, s }: { col: Column; s: VisitSummary }): JSX.Element {
  const v = col.value(s);
  const text = col.money ? formatMoney(v) : formatNumber(v);
  if (v === 0) return <span className="vis-zero">{text}</span>;
  if (col.alert) return <span className="vis-alert">{text}</span>;
  return <>{text}</>;
}

/** Jméno zaměstnance s odznakem, když už v týmu není. */
function EmployeeName({ clinic, id }: { clinic: ClinicState; id: Id }): JSX.Element {
  const t = getTherapist(clinic, id);
  return (
    <>
      {therapistName(t)}
      {t && !t.active && (
        <Badge size="sm">
          Neaktivní
        </Badge>
      )}
    </>
  );
}

/** Avatar; u vybraného zaměstnance fajfka na jeho místě (výběr nestojí jen na barvě a nic se neposune). */
function EmployeeMark({ clinic, id, selected }: { clinic: ClinicState; id: Id; selected: boolean }): JSX.Element {
  if (selected)
    return (
      <span className="vis-emp__mark">
        <Icon name="check" size={14} strokeWidth={2.25} />
      </span>
    );
  return <TherapistAvatar therapist={getTherapist(clinic, id)} size="xs" />;
}

export interface EmployeeSummaryProps {
  clinic: ClinicState;
  rows: VisitSummary[];
  totals: VisitSummary;
  selected: Id | null;
  /** null = výběr není k dispozici (přehled je už zúžený na jednoho zaměstnance). */
  onSelect: ((therapistId: Id) => void) | null;
}

/** „Podle zaměstnanců“: tabulka s řádkem za každého zaměstnance a součtem; v úzkém místě kartičky. */
export function EmployeeSummary(props: EmployeeSummaryProps): JSX.Element {
  const [ref, width] = useWidth<HTMLDivElement>();
  return (
    <div ref={ref} className="vis-measure">
      {width >= TABLE_MIN_WIDTH ? <SummaryTable {...props} /> : <SummaryCards {...props} />}
    </div>
  );
}

function SummaryTable({ clinic, rows, totals, selected, onSelect }: EmployeeSummaryProps): JSX.Element {
  return (
    <Table caption="Vstupy podle zaměstnanců a zdroje platby" hover={!!onSelect} minWidth={TABLE_MIN_WIDTH - 20} wrapperClassName="vis-emp-table">
      <thead>
        <tr>
          <th scope="col">Zaměstnanec</th>
          {COLUMNS.map((c) => (
            <th key={c.key} scope="col" className={cx('num', c.money && 'vis-th-wrap')}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => {
          const id = s.therapistId ?? '';
          const isSel = selected === id;
          return (
            <tr
              key={id}
              className={cx(isSel && 'is-selected')}
              data-clickable={onSelect ? '' : undefined}
              onClick={onSelect ? (e) => !fromControl(e) && onSelect(id) : undefined}
            >
              <td>
                <span className="vis-emp">
                  <EmployeeMark clinic={clinic} id={id} selected={isSel} />
                  {onSelect ? (
                    <button type="button" className="vis-emp__btn" aria-pressed={isSel} onClick={() => onSelect(id)}>
                      <EmployeeName clinic={clinic} id={id} />
                    </button>
                  ) : (
                    <span className="vis-emp__name">
                      <EmployeeName clinic={clinic} id={id} />
                    </span>
                  )}
                </span>
              </td>
              {COLUMNS.map((c) => (
                <td key={c.key} className="num">
                  <CellValue col={c} s={s} />
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
      {rows.length > 1 && (
        <tfoot>
          <tr>
            <td>Celkem</td>
            {COLUMNS.map((c) => (
              <td key={c.key} className="num">
                <CellValue col={c} s={totals} />
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </Table>
  );
}

function SummaryCards({ clinic, rows, totals, selected, onSelect }: EmployeeSummaryProps): JSX.Element {
  return (
    <ul className="vis-ecards">
      {rows.map((s) => {
        const id = s.therapistId ?? '';
        const isSel = selected === id;
        const body = (
          <>
            <span className="vis-ecard__head">
              <EmployeeMark clinic={clinic} id={id} selected={isSel} />
              <span className="vis-ecard__name">
                <EmployeeName clinic={clinic} id={id} />
              </span>
              <span className="vis-ecard__total">{countLabel(s.total, VSTUP)}</span>
            </span>
            <CardStats s={s} />
          </>
        );
        return (
          <li key={id}>
            {onSelect ? (
              <button type="button" className={cx('vis-ecard', 'vis-ecard--button', isSel && 'is-selected')} aria-pressed={isSel} onClick={() => onSelect(id)}>
                {body}
              </button>
            ) : (
              <div className="vis-ecard">{body}</div>
            )}
          </li>
        );
      })}
      {rows.length > 1 && (
        <li>
          <div className="vis-ecard vis-ecard--total">
            <span className="vis-ecard__head">
              <span className="vis-ecard__name">Celkem</span>
              <span className="vis-ecard__total">{countLabel(totals.total, VSTUP)}</span>
            </span>
            <CardStats s={totals} />
          </div>
        </li>
      )}
    </ul>
  );
}

function CardStats({ s }: { s: VisitSummary }): JSX.Element {
  return (
    <>
      <span className="vis-ecard__grid">
        {COUNT_COLUMNS.map((c) => (
          <span key={c.key} className="vis-ecard__stat">
            <span className="vis-ecard__label">{c.label}</span>
            <span className="vis-ecard__value">
              <CellValue col={c} s={s} />
            </span>
          </span>
        ))}
      </span>
      <span className="vis-ecard__money">
        {MONEY_COLUMNS.map((c) => (
          <span key={c.key} className="vis-ecard__moneyrow">
            <span>{c.label}</span>
            <span className="vis-ecard__moneyvalue">
              <CellValue col={c} s={s} />
            </span>
          </span>
        ))}
      </span>
    </>
  );
}
