import type { Client, ClientPackage, LocalDateTime, MakeupRight } from '../../domain/types';
import { countLabel, formatDate, formatDayShort, formatMoney, plural } from '../../engine/format';
import { getBooking, getPackageTemplate, getService, type PackageUsage } from '../../engine/selectors';
import { dateOf, daysBetween } from '../../engine/time';
import { useClinic } from '../../store/hooks';
import { Badge, Button, Card, CardHeader, Icon, StackedBar, cx } from '../../ui';
import {
  clientExcuses,
  daysLeftLabel,
  LEDGER_KIND_LABEL,
  ledgerOfClient,
  MONEY_METHOD_LABEL,
  PACKAGE_STATE_LABEL,
  packageState,
  shortDate,
  zeZ,
  type DebtItem,
  type PackageInfo,
} from './model';
import { Eyebrow, SignedMoney } from './parts';

/* ------------------------------------------------------------------ */
/* Permanentka                                                         */
/* ------------------------------------------------------------------ */

export function packageSegments(u: PackageUsage) {
  return [
    { value: u.used, tone: 'neutral' as const, label: plural(u.used, ['využitý', 'využité', 'využitých']) },
    ...(u.forfeited > 0 ? [{ value: u.forfeited, tone: 'warning' as const, label: plural(u.forfeited, ['propadlý', 'propadlé', 'propadlých']) }] : []),
    { value: u.reserved, tone: 'accent-hatched' as const, label: plural(u.reserved, ['rezervovaný', 'rezervované', 'rezervovaných']) },
    { value: u.free, tone: 'accent' as const, label: plural(u.free, ['volný', 'volné', 'volných']) },
  ];
}

const PAID_BY: Record<ClientPackage['paidBy'], string> = { ...MONEY_METHOD_LABEL };

/** Jedna permanentka: zbývající vstupy, pruh vstupů, platnost, omluvenky, akce. */
export function PackageBlock({
  info,
  today,
  onExtend,
  onCancel,
  showState,
}: {
  info: PackageInfo;
  today: string;
  onExtend?: (p: ClientPackage) => void;
  onCancel?: (p: ClientPackage) => void;
  showState?: boolean;
}): JSX.Element {
  const clinic = useClinic();
  const { pkg, usage: u } = info;
  const tpl = getPackageTemplate(clinic, pkg.templateId);
  const state = packageState(pkg, u);
  const remaining = u.free + u.reserved;
  const active = state === 'active';
  const days = daysBetween(today, u.validUntil);
  const ending = active && days <= 14;
  return (
    <div className={cx('cli-pkg', !active && 'cli-pkg--inactive')}>
      <div className="cli-pkg__head">
        <Eyebrow as="h3">Permanentka „{pkg.name}“</Eyebrow>
        {tpl?.description && <span className="cli-pkg__desc">{tpl.description}</span>}
        {showState && (
          <Badge tone={active ? 'success' : state === 'cancelled' ? 'danger' : 'neutral'} dot={active ? true : 'ring'}>
            {PACKAGE_STATE_LABEL[state]}
          </Badge>
        )}
      </div>
      {active && (
        <div className="cli-big">
          <span className="cli-big__num tnum">{remaining}</span>
          <span className="cli-big__text">
            {plural(remaining, ['zbývá', 'zbývají', 'zbývá'])} {zeZ(u.total)} {countLabel(u.total, ['vstupu', 'vstupů', 'vstupů'])}
            {u.reserved > 0 && ` (z toho ${u.reserved} ${plural(u.reserved, ['rezervovaný', 'rezervované', 'rezervovaných'])})`}
          </span>
        </div>
      )}
      <StackedBar cells={u.total <= 30} segments={packageSegments(u)} label={`Vstupy permanentky ${pkg.name}`} />
      <p className="cli-pkg__foot tnum">
        Zakoupeno {formatDate(pkg.purchasedAt)} za {formatMoney(pkg.priceCzk)} {PAID_BY[pkg.paidBy]} ·{' '}
        {state === 'cancelled' ? (
          'zrušena'
        ) : (
          <>
            platnost do <strong>{formatDate(u.validUntil)}</strong>
            {active ? <span className={cx(ending && 'text-warning')}> ({daysLeftLabel(u.validUntil, today)})</span> : ''}
          </>
        )}
        {pkg.extendedDays > 0 && ` · prodlouženo o ${countLabel(pkg.extendedDays, ['den', 'dny', 'dní'])}`}
      </p>
      {(pkg.excusesAllowed > 0 || (active && (onExtend || onCancel))) && (
        <div className="cli-pkg__meta">
          {pkg.excusesAllowed > 0 && (
            <span className="cli-pkg__excuses tnum">
              Omluvenky {u.excusesUsed} {zeZ(pkg.excusesAllowed)} {pkg.excusesAllowed}
            </span>
          )}
          {active && (onExtend || onCancel) && (
            <span className="cli-pkg__actions">
              {onExtend && (
                <Button size="sm" variant="ghost" icon="calendarPlus" onClick={() => onExtend(pkg)}>
                  Prodloužit
                </Button>
              )}
              {onCancel && (
                <Button size="sm" variant="ghost" icon="xCircle" onClick={() => onCancel(pkg)}>
                  Zrušit
                </Button>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function PackagesCard({
  active,
  today,
  onSell,
  onExtend,
  onCancel,
  onShowAll,
}: {
  active: PackageInfo[];
  today: string;
  onSell: () => void;
  onExtend: (p: ClientPackage) => void;
  onCancel: (p: ClientPackage) => void;
  onShowAll: () => void;
}): JSX.Element {
  const shown = active.slice(0, 2);
  return (
    <Card as="article" className="cli-balance cli-balance--pkg" aria-label="Permanentky">
      {shown.length === 0 ? (
        <>
          <Eyebrow as="h3">Permanentka</Eyebrow>
          <p className="cli-balance__empty">Žádná aktivní permanentka. S permanentkou klient ušetří a má k dispozici omluvenky.</p>
          <div>
            <Button size="sm" icon="ticket" onClick={onSell}>
              Prodat permanentku
            </Button>
          </div>
        </>
      ) : (
        shown.map((info) => <PackageBlock key={info.pkg.id} info={info} today={today} onExtend={onExtend} onCancel={onCancel} />)
      )}
      {active.length > shown.length && (
        <button type="button" className="link cli-balance__more" onClick={onShowAll}>
          + {countLabel(active.length - shown.length, ['další aktivní permanentka', 'další aktivní permanentky', 'dalších aktivních permanentek'])}
        </button>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Kredit                                                              */
/* ------------------------------------------------------------------ */

export function CreditCard({ client, credit, onTopUp, onAdjust, onShowAll }: { client: Client; credit: number; onTopUp: () => void; onAdjust: () => void; onShowAll: () => void }): JSX.Element {
  const clinic = useClinic();
  const last = ledgerOfClient(clinic, client.id).slice(0, 5);
  return (
    <Card as="article" className="cli-balance" aria-label="Kredit">
      <Eyebrow as="h3">Kredit (peněženka)</Eyebrow>
      <span className="cli-big__num tnum">{formatMoney(credit)}</span>
      {last.length > 0 ? (
        <ul className="cli-ledger-mini">
          {last.map((e) => (
            <li key={e.id}>
              <span className="cli-ledger-mini__label" title={e.note}>
                {LEDGER_KIND_LABEL[e.kind].toLocaleLowerCase('cs')} {shortDate(e.at)}
              </span>
              <SignedMoney amount={e.amount} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="cli-balance__empty">Zatím žádné pohyby. Kredit lze dobít předem a platit z něj termíny.</p>
      )}
      <div className="cli-balance__actions">
        <Button size="sm" icon="plus" onClick={onTopUp}>
          Dobít kredit
        </Button>
        <Button size="sm" variant="ghost" onClick={onAdjust}>
          Upravit
        </Button>
        {last.length > 0 && (
          <button type="button" className="link cli-balance__all" onClick={onShowAll}>
            Všechny pohyby
          </button>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Omluvenky a náhrady                                                 */
/* ------------------------------------------------------------------ */

function usedWord(n: number): string {
  return n === 1 ? 'využita' : n >= 2 && n <= 4 ? 'využity' : 'využito';
}

export function ExcusesCard({
  client,
  now,
  active,
  onBookMakeup,
}: {
  client: Client;
  now: LocalDateTime;
  active: PackageInfo[];
  onBookMakeup: (m: MakeupRight) => void;
}): JSX.Element {
  const clinic = useClinic();
  const policy = clinic.settings.policy.excuses;
  const ex = clientExcuses(clinic, client.id, now, active);
  const makeups = clinic.makeups.filter((m) => m.clientId === client.id);
  const open = makeups.filter((m) => m.status === 'open' && m.validUntil > now).sort((a, b) => (a.validUntil < b.validUntil ? -1 : 1));
  const expired = makeups.filter((m) => m.status === 'expired').length;
  const primary = ex.packages[0];
  const status = primary
    ? { used: primary.used, total: primary.total, remaining: primary.remaining, scope: `Platí pro permanentku ${primary.pkg.name}` }
    : {
        used: ex.perClient.used,
        total: ex.perClient.total,
        remaining: ex.perClient.remaining,
        scope: `Bez permanentky: ${countLabel(ex.perClient.total, ['omluvenka', 'omluvenky', 'omluvenek'])} za ${countLabel(ex.perClient.months, ['měsíc', 'měsíce', 'měsíců'])}`,
      };

  return (
    <Card as="article" className="cli-balance" aria-label="Omluvenky a náhrady">
      <Eyebrow as="h3">Omluvenky a náhrady</Eyebrow>
      {!policy.enabled ? (
        <p className="cli-balance__empty">Omluvenky jsou v nastavení vypnuté.</p>
      ) : (
        <>
          <div className="cli-big">
            <span className="cli-big__num tnum">{status.used}</span>
            <span className="cli-big__text">
              {zeZ(status.total)} {status.total} {usedWord(status.used)} (zbývá {status.remaining})
            </span>
          </div>
          {status.total > 0 && status.total <= 12 && (
            <div className="cli-excuse-dots" aria-hidden="true">
              {Array.from({ length: status.total }, (_, i) => (
                <span key={i} className={cx('cli-excuse-dot', i < status.used ? 'is-used' : 'is-free')}>
                  {i < status.used && <Icon name="check" size={14} />}
                </span>
              ))}
            </div>
          )}
          <span className="cli-balance__note">
            {status.scope} · náhradní termín do {countLabel(policy.makeupDays, ['dne', 'dnů', 'dnů'])}
          </span>
        </>
      )}
      {open.length > 0 && (
        <ul className="cli-makeups">
          {open.map((m) => {
            const src = getBooking(clinic, m.sourceBookingId);
            const daysLeft = daysBetween(dateOf(now), dateOf(m.validUntil));
            return (
              <li key={m.id} className="cli-makeup">
                <span className="cli-makeup__text">
                  <strong>Náhrada{src ? ` za ${formatDayShort(src.start)}` : ''}</strong>
                  <span className={cx('cli-makeup__due tnum', daysLeft <= 3 && 'text-warning')}>
                    do {formatDayShort(m.validUntil)} · {daysLeft <= 0 ? 'končí dnes' : `zbývá ${countLabel(daysLeft, ['den', 'dny', 'dní'])}`}
                  </span>
                </span>
                <Button size="sm" variant="soft" icon="calendarPlus" onClick={() => onBookMakeup(m)}>
                  Rezervovat náhradu
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {expired > 0 && <span className="cli-balance__note text-warning">Propadlé náhrady: {expired}</span>}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Dluh                                                                */
/* ------------------------------------------------------------------ */

export function DebtPanel({ items, onSettle, onWaive }: { items: DebtItem[]; onSettle: (i: DebtItem) => void; onWaive: (i: DebtItem) => void }): JSX.Element | null {
  const clinic = useClinic();
  if (!items.length) return null;
  const total = items.reduce((s, i) => s + i.amount, 0);
  return (
    <Card padding="none" className="cli-debt" aria-label="K úhradě">
      <CardHeader
        divided
        icon="alertCircle"
        title={`K úhradě ${formatMoney(total)}`}
        meta={countLabel(items.length, ['položka', 'položky', 'položek'])}
      />
      <ul className="cli-debt__list">
        {items.map((item) => {
          const svc = getService(clinic, item.booking.serviceId);
          return (
            <li key={item.kind + item.booking.id} className="cli-debt__item">
              <span className="cli-debt__text">
                <span>{item.kind === 'fee' ? (item.booking.fee?.reason === 'no_show' ? 'Poplatek za nedostavení' : 'Storno poplatek') : 'Neuhrazený termín'}</span>
                <span className="cli-debt__sub tnum">
                  {svc?.name ?? 'Termín'} · {formatDayShort(item.booking.start)}
                  {item.kind === 'fee' && item.booking.fee ? ` · ${item.booking.fee.pct} % z ceny` : ''}
                </span>
              </span>
              <strong className="cli-debt__amount tnum">{formatMoney(item.amount)}</strong>
              <span className="cli-debt__actions">
                <Button size="sm" variant="secondary" onClick={() => onSettle(item)}>
                  Uhradit
                </Button>
                {item.kind === 'fee' && (
                  <Button size="sm" variant="ghost" onClick={() => onWaive(item)}>
                    Odpustit
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
