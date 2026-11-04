import type { ClinicState, Id, LocalDate } from '../../domain/types';
import { formatDayShort, formatMoney, formatNumber, formatTime, prepZ } from '../../engine/format';
import { clientName, getClient, getService, getTherapist, therapistShort } from '../../engine/selectors';
import type { VisitRow } from '../../engine/visits';
import { ToneDot } from '../../components/domain';
import { VisitSourceBadge } from '../../components/payments';
import { navigate } from '../../store/session';
import { Button, StatusPill, Table, cx } from '../../ui';
import { fromControl, useWidth } from './hooks';

export const LIST_PAGE = 50;

/** Užší místo než tohle = kartičky místo tabulky (telefon, úzký tablet); užší tabulka potřebuje ~680 px. */
const CARDS_BELOW = 690;
/** Od této šířky mají zaměstnanec a stav vlastní sloupce; v užší tabulce jsou pod službou a časem. */
const FULL_FROM = 880;
const FULL_FROM_SOLO = 760;

export interface VisitListProps {
  clinic: ClinicState;
  /** Všechny vyfiltrované vstupy (zobrazí se prvních `shown`). */
  rows: VisitRow[];
  shown: number;
  onShowMore: () => void;
  onOpen: (bookingId: Id) => void;
  /** Zaměstnanec u vstupu (terapeut vidí jen sebe – tam je zbytečný). */
  showTherapist: boolean;
  today: LocalDate;
}

const dayOf = (row: VisitRow): string => row.booking.start.slice(0, 10);

/** Poslední vstup dne (další řádek je jiný den) – silnější oddělovač mezi dny. */
const isDayEnd = (rows: VisitRow[], i: number): boolean => i < rows.length - 1 && dayOf(rows[i + 1]) !== dayOf(rows[i]);

/** „St 4. 11.“ (+ rok, když není letošní). */
function dayText(start: string, today: LocalDate): string {
  const day = formatDayShort(start);
  return start.slice(0, 4) === today.slice(0, 4) ? day : `${day} ${start.slice(0, 4)}`;
}

function Who({ clinic, therapistId }: { clinic: ClinicState; therapistId: Id }): JSX.Element {
  const t = getTherapist(clinic, therapistId);
  return (
    <span className="vis-who">
      <ToneDot tone={t?.tone ?? 'slate'} />
      {therapistShort(t)}
    </span>
  );
}

/** Seznam vstupů: tabulka (v úzkém místě kartičky), klik otevře detail rezervace. */
export function VisitList({ clinic, rows, shown, onShowMore, onOpen, showTherapist, today }: VisitListProps): JSX.Element {
  const [ref, width] = useWidth<HTMLDivElement>();
  const mode = width < CARDS_BELOW ? 'cards' : width < (showTherapist ? FULL_FROM : FULL_FROM_SOLO) ? 'narrow' : 'full';
  const full = mode === 'full';
  const visible = rows.slice(0, shown);
  const rest = rows.length - visible.length;
  const openClient = (clientId: Id): void => navigate({ name: 'klient', clientId });

  const list =
    mode === 'cards' ? (
      <ul className="vis-vcards">
        {visible.map((row, i) => {
          const b = row.booking;
          return (
            <li key={b.id} className={cx('vis-vcard', isDayEnd(visible, i) && 'vis-dayend')}>
              <span className="vis-vcard__top">
                <button type="button" className="vis-vcard__open" onClick={() => onOpen(b.id)}>
                  <span className="visually-hidden">Detail termínu </span>
                  {dayText(b.start, today)} · {formatTime(b.start)}
                </button>
                <span className={cx('vis-vcard__amount tnum', row.info.amount === 0 && 'vis-zero')}>{formatMoney(row.info.amount)}</span>
              </span>
              <span className="vis-vcard__line">
                <button type="button" className="vis-link vis-vcard__client" onClick={() => openClient(b.clientId)}>
                  {clientName(getClient(clinic, b.clientId))}
                </button>
                <span className="vis-vcard__service">{getService(clinic, b.serviceId)?.name ?? 'Služba'}</span>
              </span>
              <span className="vis-vcard__line vis-vcard__meta">
                {showTherapist && <Who clinic={clinic} therapistId={b.therapistId} />}
                <StatusPill status={b.status} appearance="plain" />
              </span>
              <VisitSourceBadge info={row.info} withDetail className="vis-vcard__source" />
            </li>
          );
        })}
      </ul>
    ) : (
      <Table caption="Seznam vstupů" hover minWidth={CARDS_BELOW - 20} wrapperClassName="vis-visit-table">
        <thead>
          <tr>
            <th scope="col">{full ? 'Datum a čas' : 'Datum, čas a stav'}</th>
            <th scope="col">Klient</th>
            <th scope="col">{full || !showTherapist ? 'Služba' : 'Služba a zaměstnanec'}</th>
            {full && showTherapist && <th scope="col">Zaměstnanec</th>}
            {full && <th scope="col">Stav</th>}
            <th scope="col">Zdroj platby</th>
            <th scope="col" className="num">
              Částka
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row, i) => {
            const b = row.booking;
            const firstOfDay = i === 0 || dayOf(visible[i - 1]) !== dayOf(row);
            const status = <StatusPill status={b.status} appearance="plain" />;
            return (
              <tr key={b.id} data-clickable="" className={cx(isDayEnd(visible, i) && 'vis-dayend')} onClick={(e) => !fromControl(e) && onOpen(b.id)}>
                <td className="nowrap">
                  <button type="button" className="vis-link vis-when" onClick={() => onOpen(b.id)}>
                    <span className="visually-hidden">Detail termínu </span>
                    <span className={cx('vis-when__day', !firstOfDay && 'is-repeat')}>{dayText(b.start, today)}</span>{' '}
                    <span className="vis-when__time">{formatTime(b.start)}</span>
                  </button>
                  {!full && <span className="vis-subline">{status}</span>}
                </td>
                <td>
                  <button type="button" className="vis-link vis-client" onClick={() => openClient(b.clientId)}>
                    {clientName(getClient(clinic, b.clientId))}
                  </button>
                </td>
                <td className="vis-service">
                  {getService(clinic, b.serviceId)?.name ?? 'Služba'}
                  {b.sessionId && <span className="vis-sub">skupinová lekce</span>}
                  {!full && showTherapist && (
                    <span className="vis-subline">
                      <Who clinic={clinic} therapistId={b.therapistId} />
                    </span>
                  )}
                </td>
                {full && showTherapist && (
                  <td className="nowrap">
                    <Who clinic={clinic} therapistId={b.therapistId} />
                  </td>
                )}
                {full && <td className="nowrap">{status}</td>}
                <td className="vis-source">
                  <VisitSourceBadge info={row.info} withDetail />
                </td>
                <td className={cx('num', row.info.amount === 0 && 'vis-zero')}>{formatMoney(row.info.amount)}</td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    );

  return (
    <div ref={ref} className="vis-measure">
      {list}
      {rows.length > LIST_PAGE && (
        <div className="vis-more">
          <span className="vis-more__info tnum" aria-live="polite">
            {rest > 0
              ? `Zobrazeno ${formatNumber(visible.length)} ${prepZ(rows.length)} ${formatNumber(rows.length)}`
              : `Zobrazeny všechny vstupy (${formatNumber(rows.length)})`}
          </span>
          {rest > 0 && (
            <Button size="sm" icon="chevronDown" onClick={onShowMore}>
              Zobrazit dalších {formatNumber(Math.min(LIST_PAGE, rest))}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
