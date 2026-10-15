import { useMemo, useState } from 'react';
import type { Booking, Client, ClientConsents, ClientPackage, Id, LocalDateTime, MakeupRight } from '../../domain/types';
import { setConsent } from '../../engine/commands';
import { countLabel, formatDate, formatDateTimeShort, formatDayShort, formatMoney, formatTime } from '../../engine/format';
import { bookingsOfClient, getBooking, getService, packageUsage, packagesOfClient } from '../../engine/selectors';
import { dateOf } from '../../engine/time';
import { useClinic, useCommand } from '../../store/hooks';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Icon,
  Segmented,
  Select,
  Switch,
  Table,
  cx,
} from '../../ui';
import { DebtPanel, PackageBlock } from './balances';
import {
  auditOfClient,
  debtItems,
  LEDGER_KIND_LABEL,
  ledgerWithBalance,
  makeupsOfClient,
  messageKindLabel,
  messagesOfClient,
  MONEY_METHOD_LABEL,
  PAYMENT_PURPOSE_LABEL,
  type DebtItem,
} from './model';
import { BookingTable } from './OverviewTab';
import { CONSENT_META, Pagination, SignedMoney, useMediaQuery, usePaged, usePermissions } from './parts';

/* ------------------------------------------------------------------ */
/* Rezervace                                                           */
/* ------------------------------------------------------------------ */

type BookingFilter = 'all' | 'upcoming' | 'done' | 'cancelled' | 'noshow' | 'fees';

const BOOKING_FILTER_LABEL: Record<BookingFilter, string> = {
  all: 'Vše',
  upcoming: 'Nadcházející',
  done: 'Proběhlé',
  cancelled: 'Zrušené a omluvené',
  noshow: 'Nedostavení',
  fees: 'S poplatkem',
};

function matchesBookingFilter(b: Booking, f: BookingFilter, now: LocalDateTime): boolean {
  switch (f) {
    case 'upcoming':
      return b.status === 'confirmed' && b.end > now;
    case 'done':
      return b.status === 'completed' || (b.status === 'confirmed' && b.end <= now);
    case 'cancelled':
      return b.status === 'cancelled' || b.status === 'excused' || b.status === 'late_cancelled' || b.status === 'clinic_cancelled';
    case 'noshow':
      return b.status === 'no_show';
    case 'fees':
      return !!b.fee && b.fee.amount > 0;
    default:
      return true;
  }
}

export function BookingsTab({
  client,
  now,
  finance,
  onOpen,
  onNew,
}: {
  client: Client;
  now: LocalDateTime;
  finance: boolean;
  onOpen: (id: Id) => void;
  onNew: () => void;
}): JSX.Element {
  const clinic = useClinic();
  const compact = useMediaQuery('(max-width: 640px)');
  const [filter, setFilter] = useState<BookingFilter>('all');
  const all = useMemo(() => bookingsOfClient(clinic, client.id).slice().reverse(), [clinic, client.id]);
  const filters: BookingFilter[] = finance ? ['all', 'upcoming', 'done', 'cancelled', 'noshow', 'fees'] : ['all', 'upcoming', 'done', 'cancelled', 'noshow'];
  const counts = Object.fromEntries(filters.map((f) => [f, all.filter((b) => matchesBookingFilter(b, f, now)).length])) as Record<BookingFilter, number>;
  const list = all.filter((b) => matchesBookingFilter(b, filter, now));
  const { page, setPage, pageItems, pageCount } = usePaged(list, 25, filter + client.id);
  const options = filters.map((f) => ({ value: f, label: `${BOOKING_FILTER_LABEL[f]} (${counts[f]})` }));

  return (
    <Card padding="none" as="section" aria-label="Rezervace klienta">
      <CardHeader
        divided
        title="Rezervace"
        meta={countLabel(all.length, ['termín', 'termíny', 'termínů']) + ' celkem'}
        actions={
          <Button size="sm" variant="secondary" icon="calendarPlus" onClick={onNew}>
            Nová rezervace
          </Button>
        }
      />
      <div className="cli-tabtools">
        {compact ? (
          <Select aria-label="Filtr rezervací" value={filter} onValueChange={(v) => setFilter(v as BookingFilter)} options={options} size="sm" />
        ) : (
          <Segmented aria-label="Filtr rezervací" value={filter} onChange={setFilter} options={options} size="sm" />
        )}
      </div>
      {all.length === 0 ? (
        <EmptyState
          compact
          icon="calendar"
          title="Klient zatím nemá žádnou rezervaci"
          text="První termín vytvoříte tlačítkem Nová rezervace."
          action={
            <Button size="sm" variant="primary" icon="calendarPlus" onClick={onNew}>
              Nová rezervace
            </Button>
          }
        />
      ) : list.length === 0 ? (
        <EmptyState compact icon="filter" title="Žádný termín neodpovídá filtru" action={<Button size="sm" onClick={() => setFilter('all')}>Zobrazit vše</Button>} />
      ) : (
        <>
          <BookingTable bookings={pageItems} now={now} finance={finance} onOpen={onOpen} caption="Rezervace klienta" />
          <div className="cli-cardfoot">
            <Pagination page={page} pageCount={pageCount} total={list.length} pageSize={25} onChange={setPage} label="Stránkování rezervací" />
          </div>
        </>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Permanentky a kredit                                                */
/* ------------------------------------------------------------------ */

const MAKEUP_STATUS: Record<MakeupRight['status'], { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' }> = {
  open: { label: 'Otevřená', tone: 'success' },
  used: { label: 'Využitá', tone: 'neutral' },
  expired: { label: 'Propadlá', tone: 'warning' },
  cancelled: { label: 'Zrušená', tone: 'neutral' },
};

export function FinanceTab({
  client,
  now,
  credit,
  spent,
  onSell,
  onExtend,
  onCancelPkg,
  onTopUp,
  onAdjust,
  onSettle,
  onWaive,
  onBookMakeup,
  onOpen,
}: {
  client: Client;
  now: LocalDateTime;
  credit: number;
  spent: number;
  onSell: () => void;
  onExtend: (p: ClientPackage) => void;
  onCancelPkg: (p: ClientPackage) => void;
  onTopUp: () => void;
  onAdjust: () => void;
  onSettle: (i: DebtItem) => void;
  onWaive: (i: DebtItem) => void;
  onBookMakeup: (m: MakeupRight) => void;
  onOpen: (id: Id) => void;
}): JSX.Element {
  const clinic = useClinic();
  const today = dateOf(now);
  const packages = packagesOfClient(clinic, client.id).map((pkg) => ({ pkg, usage: packageUsage(clinic, pkg, today) }));
  const ledger = useMemo(() => ledgerWithBalance(clinic, client.id), [clinic, client.id]);
  const payments = useMemo(
    () => clinic.payments.filter((p) => p.clientId === client.id).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)),
    [clinic.payments, client.id],
  );
  const makeups = makeupsOfClient(clinic, client.id);
  const debts = debtItems(clinic, client.id);
  const ledgerPage = usePaged(ledger, 15, client.id);
  const payPage = usePaged(payments, 15, client.id);

  return (
    <div className="cli-stack">
      <DebtPanel items={debts} onSettle={onSettle} onWaive={onWaive} />

      <Card padding="none" as="section" aria-label="Permanentky">
        <CardHeader
          divided
          title="Permanentky"
          meta={packages.length ? countLabel(packages.length, ['permanentka', 'permanentky', 'permanentek']) : undefined}
          actions={
            <Button size="sm" variant="secondary" icon="ticket" onClick={onSell}>
              Prodat permanentku
            </Button>
          }
        />
        {packages.length === 0 ? (
          <EmptyState compact icon="ticket" title="Klient zatím nemá permanentku" text="Permanentka zvýhodní cenu vstupu a přidá omluvenky." />
        ) : (
          <ul className="cli-pkglist">
            {packages.map((info) => (
              <li key={info.pkg.id}>
                <PackageBlock info={info} today={today} onExtend={onExtend} onCancel={onCancelPkg} showState />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card padding="none" as="section" aria-label="Kredit">
        <CardHeader
          divided
          title="Kredit"
          meta={<span className="tnum">zůstatek {formatMoney(credit)}</span>}
          actions={
            <>
              <Button size="sm" variant="secondary" icon="plus" onClick={onTopUp}>
                Dobít
              </Button>
              <Button size="sm" variant="ghost" onClick={onAdjust}>
                Upravit
              </Button>
            </>
          }
        />
        {ledger.length === 0 ? (
          <EmptyState compact icon="wallet" title="Žádné pohyby kreditu" text="Dobitím kreditu si klient předplatí termíny; bonus podle pravidel kliniky." />
        ) : (
          <>
            <Table caption="Pohyby kreditu" minWidth={620} wrapperClassName="cli-tablewrap">
              <thead>
                <tr>
                  <th scope="col">Datum</th>
                  <th scope="col">Pohyb</th>
                  <th scope="col">Poznámka</th>
                  <th scope="col" className="num">
                    Částka
                  </th>
                  <th scope="col" className="num">
                    Zůstatek
                  </th>
                </tr>
              </thead>
              <tbody>
                {ledgerPage.pageItems.map(({ entry, balance }) => (
                  <tr key={entry.id}>
                    <td className="nowrap">{formatDateTimeShort(entry.at)}</td>
                    <td className="nowrap">{LEDGER_KIND_LABEL[entry.kind]}</td>
                    <td className="secondary">
                      {entry.bookingId ? (
                        <button type="button" className="link" onClick={() => onOpen(entry.bookingId as Id)}>
                          {entry.note || 'Rezervace'}
                        </button>
                      ) : (
                        entry.note
                      )}
                    </td>
                    <td className="num">
                      <SignedMoney amount={entry.amount} />
                    </td>
                    <td className="num">{formatMoney(balance)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="cli-cardfoot">
              <Pagination page={ledgerPage.page} pageCount={ledgerPage.pageCount} total={ledger.length} pageSize={15} onChange={ledgerPage.setPage} label="Stránkování pohybů kreditu" />
            </div>
          </>
        )}
      </Card>

      <Card padding="none" as="section" aria-label="Platby">
        <CardHeader divided title="Platby" meta={<span className="tnum">útrata celkem {formatMoney(spent)}</span>} />
        {payments.length === 0 ? (
          <EmptyState compact icon="receipt" title="Zatím žádné platby" text="Platby na místě, online, za permanentky i dobití kreditu se zapíšou sem." />
        ) : (
          <>
            <Table caption="Přijaté platby" minWidth={600} wrapperClassName="cli-tablewrap">
              <thead>
                <tr>
                  <th scope="col">Datum</th>
                  <th scope="col">Za co</th>
                  <th scope="col">Způsob</th>
                  <th scope="col">Poznámka</th>
                  <th scope="col" className="num">
                    Částka
                  </th>
                </tr>
              </thead>
              <tbody>
                {payPage.pageItems.map((p) => (
                  <tr key={p.id}>
                    <td className="nowrap">{formatDateTimeShort(p.at)}</td>
                    <td className="nowrap">{PAYMENT_PURPOSE_LABEL[p.purpose]}</td>
                    <td className="nowrap secondary">{MONEY_METHOD_LABEL[p.method]}</td>
                    <td className="secondary">{p.note}</td>
                    <td className="num">{formatMoney(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="cli-cardfoot">
              <Pagination page={payPage.page} pageCount={payPage.pageCount} total={payments.length} pageSize={15} onChange={payPage.setPage} label="Stránkování plateb" />
            </div>
          </>
        )}
      </Card>

      {makeups.length > 0 && (
        <Card padding="none" as="section" aria-label="Náhradní termíny">
          <CardHeader divided title="Náhradní termíny za omluvenky" meta={countLabel(makeups.length, ['náhrada', 'náhrady', 'náhrad'])} />
          <Table caption="Náhradní termíny" minWidth={640} wrapperClassName="cli-tablewrap">
            <thead>
              <tr>
                <th scope="col">Za termín</th>
                <th scope="col">Lhůta do</th>
                <th scope="col">Stav</th>
                <th scope="col">Využito</th>
                <th scope="col">
                  <span className="visually-hidden">Akce</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {makeups.map((m) => {
                const src = getBooking(clinic, m.sourceBookingId);
                const used = m.usedBookingId ? getBooking(clinic, m.usedBookingId) : undefined;
                const open = m.status === 'open' && m.validUntil > now;
                const st = MAKEUP_STATUS[m.status === 'open' && !open ? 'expired' : m.status];
                return (
                  <tr key={m.id}>
                    <td className="nowrap">
                      {src ? `${formatDayShort(src.start)} · ${getService(clinic, src.serviceId)?.name ?? ''}` : '—'}
                    </td>
                    <td className="nowrap">{formatDayShort(m.validUntil)}</td>
                    <td>
                      <Badge tone={st.tone} dot>
                        {st.label}
                      </Badge>
                    </td>
                    <td className="secondary nowrap">
                      {used ? (
                        <button type="button" className="link" onClick={() => onOpen(used.id)}>
                          {formatDayShort(used.start)} {formatTime(used.start)}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="num">
                      {open && (
                        <Button size="sm" variant="soft" onClick={() => onBookMakeup(m)}>
                          Rezervovat
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Komunikace                                                          */
/* ------------------------------------------------------------------ */

type MsgFilter = 'all' | 'email' | 'sms' | 'skipped';

export function CommsTab({ client, onWrite }: { client: Client; onWrite: () => void }): JSX.Element {
  const clinic = useClinic();
  // Zápis ze sezení obsahuje celou poznámku – jeho text vidí jen ti, kdo vidí poznámky (docs/CRM.md).
  const { clinical } = usePermissions();
  const [filter, setFilter] = useState<MsgFilter>('all');
  const all = useMemo(() => messagesOfClient(clinic, client.id), [clinic, client.id]);
  const list = all.filter((m) => (filter === 'all' ? true : filter === 'skipped' ? m.status === 'skipped' : m.channel === filter));
  const { page, setPage, pageItems, pageCount } = usePaged(list, 20, filter + client.id);
  const skipped = all.filter((m) => m.status === 'skipped').length;

  return (
    <Card padding="none" as="section" aria-label="Komunikace s klientem">
      <CardHeader
        divided
        title="Odeslané zprávy"
        meta={all.length ? countLabel(all.length, ['zpráva', 'zprávy', 'zpráv']) : undefined}
        actions={
          <Button size="sm" variant="secondary" icon="send" onClick={onWrite}>
            Napsat zprávu
          </Button>
        }
      />
      {all.length > 0 && (
        <div className="cli-tabtools">
          <Segmented
            aria-label="Filtr zpráv"
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `Vše (${all.length})` },
              { value: 'email', label: 'E-mail' },
              { value: 'sms', label: 'SMS' },
              { value: 'skipped', label: `Neodeslané (${skipped})` },
            ]}
          />
        </div>
      )}
      {all.length === 0 ? (
        <EmptyState
          compact
          icon="mail"
          title="Zatím žádná komunikace"
          text="Potvrzení, připomínky a ruční zprávy se zobrazí tady."
          action={
            <Button size="sm" variant="primary" icon="send" onClick={onWrite}>
              Napsat zprávu
            </Button>
          }
        />
      ) : list.length === 0 ? (
        <EmptyState compact icon="filter" title="Žádná zpráva neodpovídá filtru" />
      ) : (
        <>
          <ul className="cli-msgs">
            {pageItems.map((m) => (
              <li key={m.id} className="cli-msg">
                <span className={cx('cli-msg__icon', m.status === 'skipped' && 'cli-msg__icon--skipped')} aria-hidden="true">
                  <Icon name={m.channel === 'sms' ? 'smartphone' : 'mail'} size={16} />
                </span>
                <div className="cli-msg__body">
                  <div className="cli-msg__top">
                    <span className="cli-msg__title">{m.subject || messageKindLabel(clinic, m)}</span>
                    {m.status === 'sent' ? (
                      <Badge tone="success" dot>
                        Odesláno
                      </Badge>
                    ) : (
                      <Badge tone="warning" dot="square">
                        Neodesláno
                      </Badge>
                    )}
                  </div>
                  <span className="cli-msg__meta tnum">
                    {m.channel === 'sms' ? 'SMS' : 'E-mail'} · {messageKindLabel(clinic, m)} · {formatDayShort(m.at)} {formatTime(m.at)}
                  </span>
                  {m.skipReason && <span className="cli-msg__reason">Důvod: {m.skipReason}</span>}
                  {m.kind === 'session_notes' && !clinical ? (
                    <span className="cli-msg__locked">
                      <Icon name="lock" size={12} />
                      Obsah zápisu vidí jen kouči a terapeuti.
                    </span>
                  ) : (
                    <details className="cli-msg__details">
                      <summary>Zobrazit text</summary>
                      <p className="cli-msg__text">{m.body}</p>
                    </details>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="cli-cardfoot">
            <Pagination page={page} pageCount={pageCount} total={list.length} pageSize={20} onChange={setPage} label="Stránkování zpráv" />
          </div>
        </>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Souhlasy                                                            */
/* ------------------------------------------------------------------ */

export function ConsentsTab({ client }: { client: Client }): JSX.Element {
  const run = useCommand();
  const [confirm, setConfirm] = useState<keyof ClientConsents | null>(null);

  const apply = (key: keyof ClientConsents, value: boolean): boolean => {
    const meta = CONSENT_META.find((m) => m.key === key);
    const r = run(setConsent, { clientId: client.id, key, value }, { success: `${value ? 'Souhlas zaznamenán' : 'Souhlas odvolán'}: ${meta?.label.toLocaleLowerCase('cs') ?? ''}` });
    return r.ok;
  };

  const confirmMeta = CONSENT_META.find((m) => m.key === confirm);

  return (
    <Card padding="none" as="section" aria-label="Souhlasy klienta">
      <CardHeader divided title="Souhlasy" meta="změny se zapisují do historie" />
      <ul className="cli-consent-rows">
        {CONSENT_META.map((m) => {
          const rec = client.consents[m.key];
          const locked = m.key === 'gdpr' && !!rec;
          return (
            <li key={m.key} className="cli-consent-row">
              <Switch
                checked={!!rec}
                disabled={locked}
                label={m.label}
                description={
                  <>
                    {m.description}
                    <span className={cx('cli-consent-row__state tnum', rec ? 'text-success' : 'muted')}>
                      {rec ? `Uděleno ${formatDate(rec.at)} · ${rec.source}` : 'Neuděleno'}
                      {locked ? ' · nelze odebrat' : ''}
                    </span>
                  </>
                }
                onChange={(value) => {
                  if (!value && (m.key === 'health' || m.key === 'marketingEmail')) setConfirm(m.key);
                  else apply(m.key, value);
                }}
              />
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={`Odvolat souhlas: ${confirmMeta?.label.toLocaleLowerCase('cs') ?? ''}?`}
        message={
          confirm === 'health'
            ? 'Stávající záznamy zůstanou archivované podle zákona, nové klinické poznámky by se neměly zapisovat.'
            : 'Klient přestane dostávat kampaně a obchodní sdělení e-mailem. Provozní zprávy k termínům chodí dál.'
        }
        tone="danger"
        confirmLabel="Odvolat souhlas"
        onConfirm={() => {
          if (confirm && !apply(confirm, false)) throw new Error('fail');
        }}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Historie změn                                                       */
/* ------------------------------------------------------------------ */

export function AuditTab({ client, onOpen }: { client: Client; onOpen: (id: Id) => void }): JSX.Element {
  const clinic = useClinic();
  const entries = useMemo(() => auditOfClient(clinic, client.id), [clinic, client.id]);
  const { page, setPage, pageItems, pageCount } = usePaged(entries, 25, client.id);
  return (
    <Card padding="none" as="section" aria-label="Historie změn">
      <CardHeader divided title="Historie změn" meta={entries.length ? countLabel(entries.length, ['záznam', 'záznamy', 'záznamů']) : undefined} />
      {entries.length === 0 ? (
        <EmptyState compact icon="history" title="Zatím žádné změny" text="Každá změna údajů, rezervací, plateb a souhlasů se zapíše sem i s autorem." />
      ) : (
        <>
          <Table caption="Historie změn klienta" minWidth={640} wrapperClassName="cli-tablewrap">
            <thead>
              <tr>
                <th scope="col">Kdy</th>
                <th scope="col">Kdo</th>
                <th scope="col">Změna</th>
                <th scope="col">Podrobnosti</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((a) => (
                <tr key={a.id}>
                  <td className="nowrap">{formatDateTimeShort(a.at)}</td>
                  <td className="nowrap secondary">{a.actor}</td>
                  <td className="nowrap">{a.action}</td>
                  <td className="secondary">
                    {a.bookingId && getBooking(clinic, a.bookingId) ? (
                      <button type="button" className="link" onClick={() => onOpen(a.bookingId as Id)}>
                        {a.detail}
                      </button>
                    ) : (
                      a.detail
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="cli-cardfoot">
            <Pagination page={page} pageCount={pageCount} total={entries.length} pageSize={25} onChange={setPage} label="Stránkování historie změn" />
          </div>
        </>
      )}
    </Card>
  );
}
