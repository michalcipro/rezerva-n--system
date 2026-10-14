import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Client, ClientPackage, Id, LocalDateTime, MakeupRight } from '../../domain/types';
import { setConsent } from '../../engine/commands';
import { countLabel, formatDate, formatMoney, plural } from '../../engine/format';
import { activePackages, bookingsOfClient, clientSummary, getBooking, getClient, packageUsage } from '../../engine/selectors';
import { dateOf } from '../../engine/time';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { navigate } from '../../store/session';
import {
  Avatar,
  Badge,
  Breadcrumbs,
  Button,
  Callout,
  EmptyState,
  Icon,
  IconButton,
  Menu,
  TabPanel,
  Tabs,
  cx,
  type MenuEntry,
  type TabItem,
} from '../../ui';
import { BookingDrawer, NewBookingDialog } from '../calendar';
import { CreditCard, DebtPanel, ExcusesCard, PackagesCard } from './balances';
import { EditClientDialog, TagsDialog } from './ClientForm';
import {
  AdjustCreditDialog,
  BlockDialog,
  CancelPackageDialog,
  ExtendPackageDialog,
  SellPackageDialog,
  SendMessageDialog,
  SettleDebtDialog,
  TopUpCreditDialog,
  WaiveFeeDialog,
} from './dialogs';
import { ageOf, debtItems, digitsOf, messagesOfClient, type DebtItem, type PackageInfo } from './model';
import { ClinicalNoteCard, CommsCard, ConsentsCard, InternalNoteCard, PolicyCard, RecentCard, UpcomingCard } from './OverviewTab';
import { scrollContainerToTop, useMediaQuery, usePermissions } from './parts';
import { AuditTab, BookingsTab, CommsTab, ConsentsTab, DocsTab, FinanceTab } from './tabs';

type TabId = 'prehled' | 'rezervace' | 'finance' | 'dokumentace' | 'komunikace' | 'souhlasy' | 'historie';

type DialogState =
  | { kind: 'edit' | 'tags' | 'message' | 'sell' | 'topup' | 'adjust' | 'block' }
  | { kind: 'extend' | 'cancelPkg'; pkg: ClientPackage }
  | { kind: 'settle' | 'waive'; item: DebtItem }
  | null;

interface BookingInitial {
  clientId?: Id;
  serviceId?: Id;
  therapistId?: Id;
  start?: LocalDateTime;
}

export function ClientDetailScreen({ clientId }: { clientId: Id }): JSX.Element {
  const clinic = useClinic();
  const client = getClient(clinic, clientId);
  const rootRef = useRef<HTMLDivElement>(null);

  // Detail se otevírá ze seznamu bez změny položky menu – začni nahoře.
  useEffect(() => {
    scrollContainerToTop(rootRef.current);
  }, [clientId]);

  if (!client) {
    return (
      <div className="page" ref={rootRef}>
        <Breadcrumbs items={[{ label: 'Klienti', onClick: () => navigate({ name: 'klienti' }) }, { label: 'Neznámý klient' }]} />
        <EmptyState
          icon="userX"
          title="Klient nenalezen"
          text="Karta klienta neexistuje nebo byla odstraněna (např. po smazání ukázkových dat)."
          action={
            <Button variant="primary" icon="arrowLeft" onClick={() => navigate({ name: 'klienti' })}>
              Zpět na klienty
            </Button>
          }
        />
      </div>
    );
  }
  return (
    <div ref={rootRef} className="cli-detail">
      <ClientDetail key={client.id} client={client} />
    </div>
  );
}

function ClientDetail({ client }: { client: Client }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const perms = usePermissions();
  const compact = useMediaQuery('(max-width: 640px)');
  const today = dateOf(now);
  const titleId = useId();
  const tabPrefix = 'cli-tab-' + client.id;

  const summary = useMemo(() => clientSummary(clinic, client.id, now), [clinic, client.id, now]);
  const active: PackageInfo[] = useMemo(
    () => activePackages(clinic, client.id, today).map((pkg) => ({ pkg, usage: packageUsage(clinic, pkg, today) })),
    [clinic, client.id, today],
  );
  const debts = useMemo(() => (perms.finance ? debtItems(clinic, client.id) : []), [clinic, client.id, perms.finance]);
  const bookingCount = bookingsOfClient(clinic, client.id).length;
  const messageCount = useMemo(() => messagesOfClient(clinic, client.id).length, [clinic, client.id]);

  const tabs: TabItem<TabId>[] = [
    ...(perms.finance ? [{ id: 'prehled' as const, label: 'Přehled' }] : []),
    { id: 'rezervace', label: 'Rezervace', count: bookingCount || undefined },
    ...(perms.finance ? [{ id: 'finance' as const, label: 'Permanentky a kredit' }] : []),
    { id: 'dokumentace', label: 'Dokumentace', count: perms.clinical && client.notes.length ? client.notes.length : undefined },
    ...(perms.manage ? [{ id: 'komunikace' as const, label: 'Komunikace', count: messageCount || undefined }] : []),
    { id: 'souhlasy', label: 'Souhlasy' },
    ...(perms.manage ? [{ id: 'historie' as const, label: 'Historie změn' }] : []),
  ];
  const [tab, setTab] = useState<TabId>(tabs[0].id);
  const current = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;

  const [dlg, setDlg] = useState<DialogState>(null);
  const [booking, setBooking] = useState<BookingInitial | null>(null);
  const [drawer, setDrawer] = useState<Id | null>(null);
  const close = (): void => setDlg(null);

  const name = `${client.firstName} ${client.lastName}`;
  const initials = (client.firstName.charAt(0) + client.lastName.charAt(0)).toUpperCase();

  const newBooking = (): void => setBooking({ clientId: client.id });
  const bookMakeup = (m: MakeupRight): void => {
    const src = getBooking(clinic, m.sourceBookingId);
    const serviceId = src && m.serviceIds.includes(src.serviceId) ? src.serviceId : m.serviceIds[0];
    setBooking({ clientId: client.id, serviceId, therapistId: src?.therapistId });
  };
  const goTab = (t: TabId): void => {
    setTab(t);
    requestAnimationFrame(() => document.getElementById(`${tabPrefix}-tab-${t}`)?.focus({ preventScroll: true }));
  };

  /* ---------------- akce v hlavičce ---------------- */
  const menuItems: MenuEntry[] = [];
  if (compact) {
    if (perms.manage) menuItems.push({ id: 'msg', label: 'Napsat zprávu', icon: 'mail', onSelect: () => setDlg({ kind: 'message' }) });
    if (perms.finance) {
      menuItems.push({ id: 'sell', label: 'Prodat permanentku', icon: 'ticket', onSelect: () => setDlg({ kind: 'sell' }) });
      menuItems.push({ id: 'topup', label: 'Dobít kredit', icon: 'wallet', onSelect: () => setDlg({ kind: 'topup' }) });
    }
    if (menuItems.length) menuItems.push({ type: 'separator', id: 'sep0' });
  }
  if (perms.manage) {
    menuItems.push({ id: 'edit', label: 'Upravit údaje', icon: 'edit', onSelect: () => setDlg({ kind: 'edit' }) });
    menuItems.push({ id: 'tags', label: 'Upravit štítky', icon: 'tag', onSelect: () => setDlg({ kind: 'tags' }) });
  }
  if (perms.finance) menuItems.push({ id: 'adjust', label: 'Upravit kredit', icon: 'coins', onSelect: () => setDlg({ kind: 'adjust' }) });
  if (perms.manage) {
    menuItems.push({ type: 'separator', id: 'sep1' });
    menuItems.push(
      client.blocked
        ? { id: 'unblock', label: 'Odblokovat online rezervace', icon: 'shieldCheck', onSelect: () => setDlg({ kind: 'block' }) }
        : { id: 'block', label: 'Zablokovat online rezervace', icon: 'ban', danger: true, onSelect: () => setDlg({ kind: 'block' }) },
    );
  }

  /* ---------------- souhrnné údaje ---------------- */
  const metaParts = [`Klient od ${formatDate(client.createdAt)}`];
  if (summary.visits) {
    metaParts.push(countLabel(summary.visits, ['návštěva', 'návštěvy', 'návštěv']));
    if (summary.lastVisit) metaParts.push(`poslední ${formatDate(summary.lastVisit)}`);
  } else {
    metaParts.push('zatím bez návštěvy');
  }
  const blockLimit = clinic.settings.policy.blockAfterNoShows;
  const reliabilityTone = client.blocked ? 'danger' : summary.noShows90 > 0 && blockLimit > 0 && summary.noShows90 >= blockLimit - 1 ? 'warning' : null;

  /* ---------------- obsah tabu ---------------- */
  let content: JSX.Element;
  switch (current) {
    case 'prehled':
      content = (
        <div className="split">
          <div className="split__main">
            <DebtPanel items={debts} onSettle={(item) => setDlg({ kind: 'settle', item })} onWaive={(item) => setDlg({ kind: 'waive', item })} />
            <div className="cli-balances-wrap">
            <div className="cli-balances">
              <PackagesCard
                active={active}
                today={today}
                onSell={() => setDlg({ kind: 'sell' })}
                onExtend={(pkg) => setDlg({ kind: 'extend', pkg })}
                onCancel={(pkg) => setDlg({ kind: 'cancelPkg', pkg })}
                onShowAll={() => goTab('finance')}
              />
              <CreditCard
                client={client}
                credit={summary.credit}
                onTopUp={() => setDlg({ kind: 'topup' })}
                onAdjust={() => setDlg({ kind: 'adjust' })}
                onShowAll={() => goTab('finance')}
              />
              <ExcusesCard client={client} now={now} active={active} onBookMakeup={bookMakeup} />
            </div>
            </div>
            <UpcomingCard client={client} now={now} finance={perms.finance} onOpen={setDrawer} onNew={newBooking} />
            <RecentCard client={client} now={now} finance={perms.finance} onOpen={setDrawer} onShowAll={() => goTab('rezervace')} />
          </div>
          <aside className="split__aside" aria-label="Doplňující informace">
            <ClinicalNoteCard client={client} perms={perms} onOpenDocs={() => goTab('dokumentace')} />
            <InternalNoteCard client={client} onEdit={perms.manage ? () => setDlg({ kind: 'edit' }) : undefined} />
            <ConsentsCard client={client} onManage={() => goTab('souhlasy')} />
            {perms.manage && <CommsCard client={client} onShowAll={() => goTab('komunikace')} />}
            <PolicyCard />
          </aside>
        </div>
      );
      break;
    case 'rezervace':
      content = <BookingsTab client={client} now={now} finance={perms.finance} onOpen={setDrawer} onNew={newBooking} />;
      break;
    case 'finance':
      content = (
        <FinanceTab
          client={client}
          now={now}
          credit={summary.credit}
          spent={summary.spent}
          onSell={() => setDlg({ kind: 'sell' })}
          onExtend={(pkg) => setDlg({ kind: 'extend', pkg })}
          onCancelPkg={(pkg) => setDlg({ kind: 'cancelPkg', pkg })}
          onTopUp={() => setDlg({ kind: 'topup' })}
          onAdjust={() => setDlg({ kind: 'adjust' })}
          onSettle={(item) => setDlg({ kind: 'settle', item })}
          onWaive={(item) => setDlg({ kind: 'waive', item })}
          onBookMakeup={bookMakeup}
          onOpen={setDrawer}
        />
      );
      break;
    case 'dokumentace':
      content = (
        <DocsTab
          client={client}
          perms={perms}
          onGrantHealth={() => run(setConsent, { clientId: client.id, key: 'health', value: true }, { success: 'Souhlas se zdravotní dokumentací zaznamenán' })}
        />
      );
      break;
    case 'komunikace':
      content = <CommsTab client={client} onWrite={() => setDlg({ kind: 'message' })} />;
      break;
    case 'souhlasy':
      content = <ConsentsTab client={client} />;
      break;
    default:
      content = <AuditTab client={client} onOpen={setDrawer} />;
  }

  return (
    <>
      <section className="cli-hero" aria-labelledby={titleId}>
        <Breadcrumbs items={[{ label: 'Klienti', onClick: () => navigate({ name: 'klienti' }) }, { label: name }]} />
        <div className="cli-hero__top">
          <Avatar initials={initials} tone="teal" size="lg" />
          <div className="cli-hero__titles">
            <div className="cli-hero__namerow">
              <h1 id={titleId} className="cli-hero__name">
                {name}
              </h1>
              {client.blocked && (
                <Badge tone="danger" icon="ban" size="md">
                  Online rezervace zablokované
                </Badge>
              )}
            </div>
            <span className="cli-hero__meta tnum">{metaParts.join(' · ')}</span>
          </div>
          <div className="cli-hero__actions">
            <Button variant="primary" icon="calendarPlus" onClick={newBooking}>
              Nová rezervace
            </Button>
            {!compact && perms.manage && (
              <Button icon="mail" onClick={() => setDlg({ kind: 'message' })}>
                Napsat zprávu
              </Button>
            )}
            {!compact && perms.finance && (
              <Button icon="ticket" onClick={() => setDlg({ kind: 'sell' })}>
                Prodat permanentku
              </Button>
            )}
            {!compact && perms.finance && (
              <Button icon="wallet" onClick={() => setDlg({ kind: 'topup' })}>
                Dobít kredit
              </Button>
            )}
            {menuItems.length > 0 && (
              <Menu label="Další akce s klientem" trigger={<IconButton icon="more" label="Další akce" variant="secondary" />} items={menuItems} />
            )}
          </div>
        </div>

        <div className="cli-hero__facts">
          {client.phone && (
            <a className="cli-fact tnum" href={`tel:+${digitsOf(client.phone)}`}>
              <Icon name="phone" size={16} />
              {client.phone}
            </a>
          )}
          {client.email && (
            <a className="cli-fact cli-fact--email" href={`mailto:${client.email}`}>
              <Icon name="mail" size={16} />
              <span className="truncate">{client.email}</span>
            </a>
          )}
          {client.birthDate && (
            <span className="cli-fact tnum">
              <Icon name="gift" size={16} />
              {formatDate(client.birthDate)} ({ageOf(client.birthDate, today)} {plural(ageOf(client.birthDate, today), ['rok', 'roky', 'let'])})
            </span>
          )}
          {(client.tags.length > 0 || perms.manage) && (
            <span className="cli-hero__tags">
              {client.tags.map((t) => (
                <span key={t} className="cli-taglabel">
                  {t}
                </span>
              ))}
              {perms.manage && (
                <button type="button" className="cli-tagedit" onClick={() => setDlg({ kind: 'tags' })} aria-label={client.tags.length ? 'Upravit štítky' : 'Přidat štítek'}>
                  <Icon name={client.tags.length ? 'edit' : 'plus'} size={14} />
                  {!client.tags.length && <span>Přidat štítek</span>}
                </button>
              )}
            </span>
          )}
          <span className="cli-hero__spacer" />
          <span className="cli-hero__stats">
          <span className="cli-stat">
            <span className="cli-eyebrow">Spolehlivost</span>
            <span className={cx('cli-stat__value tnum', reliabilityTone && `text-${reliabilityTone}`)}>
              {countLabel(summary.noShows90, ['nedostavení', 'nedostavení', 'nedostavení'])}
              <span className="visually-hidden"> za 90 dní</span> · {countLabel(summary.lateCancels12m, ['pozdní storno', 'pozdní storna', 'pozdních storen'])}
              <span className="visually-hidden"> za 12 měsíců</span>
            </span>
          </span>
          {perms.finance && (
            <>
              <span className="cli-stat__divider" aria-hidden="true" />
              <span className="cli-stat">
                <span className="cli-eyebrow">Celkem utraceno</span>
                <strong className="cli-stat__value tnum">{formatMoney(summary.spent)}</strong>
              </span>
            </>
          )}
          </span>
        </div>

        <Tabs aria-label="Sekce klienta" items={tabs} value={current} onChange={setTab} idPrefix={tabPrefix} className="cli-hero__tabs" />
      </section>

      <div className="cli-body">
        {client.blocked && (
          <Callout
            tone="danger"
            title="Online rezervace zablokované"
            actions={
              perms.manage ? (
                <Button size="sm" variant="secondary" icon="shieldCheck" onClick={() => setDlg({ kind: 'block' })}>
                  Odblokovat
                </Button>
              ) : undefined
            }
          >
            {client.firstName} si nemůže rezervovat přes klientský portál
            {summary.noShows90 ? ` (nedostavení za 90 dní: ${summary.noShows90})` : ''}. Termíny vytváří recepce.
          </Callout>
        )}
        <TabPanel idPrefix={tabPrefix} id={current} className="cli-panel">
          {content}
        </TabPanel>
      </div>

      {/* Dialogy a panely */}
      <NewBookingDialog open={booking !== null} onClose={() => setBooking(null)} initial={booking ?? undefined} />
      <BookingDrawer bookingId={drawer} onClose={() => setDrawer(null)} />
      {perms.manage && (
        <>
          <EditClientDialog client={client} open={dlg?.kind === 'edit'} onClose={close} />
          <TagsDialog client={client} open={dlg?.kind === 'tags'} onClose={close} />
          <SendMessageDialog client={client} open={dlg?.kind === 'message'} onClose={close} />
          <BlockDialog client={client} open={dlg?.kind === 'block'} onClose={close} />
        </>
      )}
      {perms.finance && (
        <>
          <SellPackageDialog client={client} open={dlg?.kind === 'sell'} onClose={close} />
          <TopUpCreditDialog client={client} open={dlg?.kind === 'topup'} onClose={close} />
          <AdjustCreditDialog client={client} open={dlg?.kind === 'adjust'} onClose={close} />
          <ExtendPackageDialog pkg={dlg?.kind === 'extend' ? dlg.pkg : null} open={dlg?.kind === 'extend'} onClose={close} />
          <CancelPackageDialog pkg={dlg?.kind === 'cancelPkg' ? dlg.pkg : null} open={dlg?.kind === 'cancelPkg'} onClose={close} />
          <SettleDebtDialog item={dlg?.kind === 'settle' ? dlg.item : null} open={dlg?.kind === 'settle'} onClose={close} />
          <WaiveFeeDialog item={dlg?.kind === 'waive' ? dlg.item : null} open={dlg?.kind === 'waive'} onClose={close} />
        </>
      )}
    </>
  );
}
