import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { ClientConsents, ClientPackage, Id, LedgerEntry, Message } from '../domain/types';
import { ClientAvatar } from '../components/domain';
import { createPaymentRequest, creditBonusFor, sellPackage, setConsent, topUpCredit, updateClient } from '../engine/commands';
import {
  countLabel,
  formatDate,
  formatDateTimeShort,
  formatDayShort,
  formatMoney,
  formatPercent,
  formatSignedMoney,
  formatTime,
} from '../engine/format';
import { isImportedPackage, type ImportedPackage } from '../engine/importer';
import { clientCredit, packagesOfClient, packageUsage } from '../engine/selectors';
import { addDays, dateOf, daysBetween } from '../engine/time';
import { SERVER_MODE } from '../api/config';
import { useClinic, useCommand, useNow } from '../store/hooks';
import { logout } from '../store/server';
import {
  ActionBar,
  Badge,
  Button,
  Callout,
  Card,
  ChoiceChips,
  EmptyState,
  Field,
  Icon,
  Input,
  NumberInput,
  RadioCards,
  StackedBar,
  Switch,
  cx,
  type IconName,
} from '../ui';
import { usePortal, type AccountView } from './context';
import { BlockedNotice } from './HomeScreen';
import { clientMessages, clientPendingRequests, MONEY_LABEL, onlinePurchase, packageSavings, packageServicesLabel, QR_ICON, topUpHint, zPrep } from './logic';
import { PolicyList, SimulatedPaymentNote, useSimulatedPayment } from './payment';
import { ListRow, Screen, SectionTitle, Sheet } from './parts';
import { PendingPaymentsSection, QR_HINT, QrStep, useQrStep } from './QrPay';
import { markInboxSeen } from './storage';

export function AccountScreen(): JSX.Element {
  const { accountView, setAccountView } = usePortal();
  const back = (): void => setAccountView('root');
  switch (accountView) {
    case 'udaje':
      return <ProfileView key="udaje" onBack={back} />;
    case 'permanentky':
      return <PackagesView key="permanentky" onBack={back} />;
    case 'kredit':
      return <CreditView key="kredit" onBack={back} />;
    case 'zpravy':
      return <InboxView key="zpravy" onBack={back} />;
    case 'souhlasy':
      return <ConsentsView key="souhlasy" onBack={back} />;
    case 'podminky':
      return (
        <Screen key="podminky" title="Storno podmínky" onBack={back}>
          <p className="por-lead">Jak zrušit, omluvit nebo přesunout termín a co se při tom stane s platbou.</p>
          <PolicyList />
        </Screen>
      );
    default:
      return <AccountRoot key="root" />;
  }
}

/* ------------------------------------------------------------------ */
/* Přehled účtu                                                        */
/* ------------------------------------------------------------------ */

function AccountRoot(): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const { client, setAccountView, accountAction, clearAccountAction } = usePortal();
  const today = dateOf(now);
  // z domovské obrazovky „Zobrazit QR“ → rovnou na čekající platby
  const [focusPayments] = useState(accountAction === 'platby');
  useEffect(() => {
    if (accountAction === 'platby') clearAccountAction();
  }, []);
  const stats = useMemo(() => {
    const pkgs = packagesOfClient(clinic, client.id).map((p) => ({ p, u: packageUsage(clinic, p, today) }));
    const active = pkgs.filter(({ u }) => !u.expired && u.free + u.reserved > 0);
    return {
      credit: clientCredit(clinic, client.id),
      active: active.length,
      freeEntries: active.reduce((sum, { u }) => sum + u.free, 0),
      messages: clientMessages(clinic, client.id).length,
    };
  }, [clinic, client.id, today]);
  const go = (v: AccountView): void => setAccountView(v);
  const purchase = onlinePurchase(clinic);
  const consentCount = [client.consents.health, client.consents.marketingEmail, client.consents.sms].filter(Boolean).length;

  return (
    <Screen title="Účet">
      <section className="por-profile" aria-label="Profil">
        <ClientAvatar client={client} size="lg" />
        <div className="por-profile__body">
          <span className="por-profile__name">
            {client.firstName} {client.lastName}
          </span>
          <span className="por-profile__line">{client.email || 'bez e-mailu'}</span>
          <span className="por-profile__line tnum">{client.phone || 'bez telefonu'}</span>
        </div>
        <Button size="sm" variant="secondary" icon="edit" onClick={() => go('udaje')}>
          Upravit
        </Button>
      </section>

      {client.blocked && <BlockedNotice />}

      <PendingPaymentsSection title="Čekající platby" focusOnMount={focusPayments} />

      <div className="por-quick">
        <button type="button" className="por-tile por-tile--button" onClick={() => go('kredit')}>
          <span className="por-tile__label">Kredit</span>
          <span className="por-tile__num tnum">{formatMoney(stats.credit)}</span>
          <span className="por-tile__hint por-tile__hint--accent">
            {purchase.any ? 'Dobít a pohyby' : 'Pohyby kreditu'} <Icon name="arrowRight" size={14} />
          </span>
        </button>
        <button type="button" className="por-tile por-tile--button" onClick={() => go('permanentky')}>
          <span className="por-tile__label">Permanentky</span>
          <span className="por-tile__num tnum">
            {stats.freeEntries}
            <span className="por-tile__of"> {stats.freeEntries === 1 ? 'volný vstup' : stats.freeEntries >= 2 && stats.freeEntries <= 4 ? 'volné vstupy' : 'volných vstupů'}</span>
          </span>
          <span className="por-tile__hint por-tile__hint--accent">
            {stats.active ? countLabel(stats.active, ['aktivní', 'aktivní', 'aktivních']) : purchase.any ? 'Koupit online' : 'Přehled'} <Icon name="arrowRight" size={14} />
          </span>
        </button>
      </div>

      <div className="por-group" role="list">
        <div role="listitem">
          <ListRow icon="ticket" label="Permanentky" hint={purchase.any ? 'Aktivní i prošlé, nákup online' : 'Aktivní i prošlé'} onClick={() => go('permanentky')} />
        </div>
        <div role="listitem">
          <ListRow
            icon="wallet"
            label="Kredit a platby"
            hint={topUpHint(clinic)}
            value={formatMoney(stats.credit)}
            onClick={() => go('kredit')}
          />
        </div>
        <div role="listitem">
          <ListRow
            icon="mail"
            label="Zprávy od kliniky"
            hint="Potvrzení, připomínky, nabídky"
            value={stats.messages ? String(stats.messages) : undefined}
            onClick={() => go('zpravy')}
          />
        </div>
        <div role="listitem">
          <ListRow icon="shieldCheck" label="Souhlasy a soukromí" hint={`${consentCount} ze 3 volitelných souhlasů`} onClick={() => go('souhlasy')} />
        </div>
        <div role="listitem">
          <ListRow icon="file" label="Storno podmínky" hint="Zrušení, omluvenky, přesun" onClick={() => go('podminky')} />
        </div>
      </div>

      {SERVER_MODE && (
        <Button variant="secondary" size="lg" full icon="logout" onClick={() => void logout()}>
          Odhlásit se
        </Button>
      )}

      <p className="por-foot">
        {clinic.settings.clinicName} · {clinic.settings.clinicTagline}
        <br />
        <a href={`mailto:${clinic.settings.senderEmail}`}>{clinic.settings.senderEmail}</a>
      </p>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Osobní údaje                                                        */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ProfileView({ onBack }: { onBack: () => void }): JSX.Element {
  const run = useCommand();
  const { client } = usePortal();
  const [form, setForm] = useState({
    firstName: client.firstName,
    lastName: client.lastName,
    email: client.email,
    phone: client.phone,
    birthDate: client.birthDate ?? '',
  });
  const [touched, setTouched] = useState(false);
  const dirty =
    form.firstName !== client.firstName ||
    form.lastName !== client.lastName ||
    form.email !== client.email ||
    form.phone !== client.phone ||
    form.birthDate !== (client.birthDate ?? '');
  const errors = {
    firstName: !form.firstName.trim() ? 'Vyplňte jméno.' : undefined,
    lastName: !form.lastName.trim() ? 'Vyplňte příjmení.' : undefined,
    email: form.email.trim() && !EMAIL_RE.test(form.email.trim()) ? 'E-mail nemá platný tvar.' : undefined,
    contact: !form.email.trim() && !form.phone.trim() ? 'Nechte nám prosím e-mail nebo telefon.' : undefined,
  };
  const valid = !errors.firstName && !errors.lastName && !errors.email && !errors.contact;
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const save = (e?: FormEvent): void => {
    e?.preventDefault();
    setTouched(true);
    if (!valid || !dirty) return;
    const r = run(
      updateClient,
      {
        clientId: client.id,
        patch: {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          birthDate: form.birthDate || null,
        },
      },
      { success: 'Údaje jsou uložené' },
    );
    if (r.ok) onBack();
  };

  return (
    <Screen
      title="Osobní údaje"
      onBack={onBack}
      backLabel="Zpět na účet"
      dock={
        <ActionBar>
          <Button type="submit" form="por-profile-form" variant="primary" size="lg" disabled={!dirty}>
            Uložit změny
          </Button>
        </ActionBar>
      }
    >
      <form id="por-profile-form" className="por-form" onSubmit={save} noValidate>
        <Field label="Jméno" error={touched ? errors.firstName : undefined}>
          <Input size="lg" value={form.firstName} onValueChange={set('firstName')} autoComplete="given-name" />
        </Field>
        <Field label="Příjmení" error={touched ? errors.lastName : undefined}>
          <Input size="lg" value={form.lastName} onValueChange={set('lastName')} autoComplete="family-name" />
        </Field>
        <Field label="E-mail" error={touched ? errors.email ?? errors.contact : undefined} hint="Sem posíláme potvrzení a připomínky.">
          <Input size="lg" type="email" inputMode="email" value={form.email} onValueChange={set('email')} autoComplete="email" />
        </Field>
        <Field label="Telefon" hint="Pro SMS připomínky a nabídky uvolněných termínů.">
          <Input size="lg" type="tel" inputMode="tel" value={form.phone} onValueChange={set('phone')} autoComplete="tel" />
        </Field>
        <Field label="Datum narození" optional>
          <Input size="lg" type="date" value={form.birthDate} onValueChange={set('birthDate')} autoComplete="bday" />
        </Field>
      </form>
      <p className="por-note">Údaje používáme jen pro vaše rezervace a komunikaci s klinikou.</p>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Souhlasy                                                            */
/* ------------------------------------------------------------------ */

const CONSENTS: { key: Exclude<keyof ClientConsents, 'gdpr'>; label: string; on: string; off: string }[] = [
  {
    key: 'health',
    label: 'Zdravotní dokumentace',
    on: 'Terapeut si vede poznámky o průběhu terapie.',
    off: 'Bez souhlasu si terapeut nemůže vést poznámky o vašem zdravotním stavu.',
  },
  { key: 'sms', label: 'SMS zprávy', on: 'Připomínky termínů a nabídky uvolněných termínů.', off: 'Připomínky a nabídky dostanete jen e-mailem.' },
  {
    key: 'marketingEmail',
    label: 'Novinky a nabídky e-mailem',
    on: 'Občas pošleme tipy na cvičení a akce kliniky.',
    off: 'Nebudeme vám posílat obchodní sdělení.',
  },
];

function ConsentsView({ onBack }: { onBack: () => void }): JSX.Element {
  const clinic = useClinic();
  const run = useCommand();
  const { client } = usePortal();
  const gdpr = client.consents.gdpr;
  return (
    <Screen title="Souhlasy a soukromí" onBack={onBack} backLabel="Zpět na účet">
      <div className="por-group por-group--pad">
        <div className="por-consent por-consent--locked">
          <span className="por-consent__icon" aria-hidden="true">
            <Icon name="lock" size={16} />
          </span>
          <span className="por-consent__body">
            <span className="por-consent__label">Zpracování osobních údajů</span>
            <span className="por-consent__desc">
              Nutné pro vedení rezervací{gdpr ? ` · uděleno ${formatDate(gdpr.at)}` : ''}. Pro výmaz účtu napište klinice.
            </span>
          </span>
        </div>
        {CONSENTS.map((c) => {
          const rec = client.consents[c.key];
          return (
            <Switch
              key={c.key}
              className="por-consent"
              checked={!!rec}
              onChange={(v) => run(setConsent, { clientId: client.id, key: c.key, value: v }, { success: v ? 'Souhlas udělen' : 'Souhlas odvolán' })}
              label={c.label}
              description={rec ? `${c.on} Uděleno ${formatDate(rec.at)} (${rec.source}).` : c.off}
            />
          );
        })}
      </div>
      <p className="por-note">
        Souhlasy můžete kdykoli změnit. Otázky k ochraně údajů: <a href={`mailto:${clinic.settings.senderEmail}`}>{clinic.settings.senderEmail}</a>
      </p>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Permanentky                                                         */
/* ------------------------------------------------------------------ */

function PackagesView({ onBack }: { onBack: () => void }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const { client, accountAction, clearAccountAction } = usePortal();
  const today = dateOf(now);
  const [buyOpen, setBuyOpen] = useState(accountAction === 'buy');
  useEffect(() => {
    if (accountAction === 'buy') clearAccountAction();
  }, []);
  const lists = useMemo(() => {
    const all = packagesOfClient(clinic, client.id).map((p) => ({ p, u: packageUsage(clinic, p, today) }));
    return {
      active: all.filter(({ u }) => !u.expired && u.free + u.reserved > 0),
      old: all.filter(({ u }) => u.expired || u.free + u.reserved === 0),
    };
  }, [clinic, client.id, today]);
  const canBuy = clinic.packageTemplates.some((t) => t.active);

  return (
    <Screen
      title="Permanentky"
      onBack={onBack}
      backLabel="Zpět na účet"
      dock={
        canBuy ? (
          <ActionBar>
            <Button variant="primary" size="lg" icon="plus" onClick={() => setBuyOpen(true)}>
              Koupit permanentku
            </Button>
          </ActionBar>
        ) : undefined
      }
    >
      <PendingPaymentsSection title="Čeká na zaplacení" purpose="package" />
      {lists.active.length ? (
        lists.active.map(({ p }) => <PackageCard key={p.id} pkg={p} />)
      ) : (
        <EmptyState
          icon="ticket"
          title="Nemáte aktivní permanentku"
          text="S permanentkou ušetříte a máte k ní omluvenky pro případ nemoci."
          action={
            canBuy ? (
              <Button variant="primary" onClick={() => setBuyOpen(true)}>
                Vybrat permanentku
              </Button>
            ) : undefined
          }
        />
      )}
      {lists.old.length > 0 && (
        <section className="por-stack por-stack--tight" aria-labelledby="por-oldpk">
          <SectionTitle id="por-oldpk">Prošlé a vyčerpané</SectionTitle>
          {lists.old.map(({ p }) => (
            <PackageCard key={p.id} pkg={p} />
          ))}
        </section>
      )}
      {buyOpen && <BuyPackageSheet onClose={() => setBuyOpen(false)} />}
    </Screen>
  );
}

function PackageCard({ pkg }: { pkg: ClientPackage }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const today = dateOf(now);
  const u = packageUsage(clinic, pkg, today);
  const done = u.expired || u.free + u.reserved === 0;
  const daysLeft = daysBetween(today, u.validUntil);
  const segments = [
    { value: u.used, tone: 'neutral' as const, label: 'využité' },
    { value: u.forfeited, tone: 'danger' as const, label: 'propadlé' },
    { value: u.reserved, tone: 'accent-hatched' as const, label: 'rezervované' },
    { value: u.free, tone: 'accent' as const, label: 'volné' },
  ];
  return (
    <Card padding="md" className={cx('por-pkg', done && 'is-done')}>
      <div className="por-pkg__head">
        <span className="por-pkg__name">{pkg.name}</span>
        {pkg.cancelled ? (
          <Badge tone="neutral">Zrušená</Badge>
        ) : u.expired ? (
          <Badge tone="neutral">Prošlá</Badge>
        ) : done ? (
          <Badge tone="neutral">Vyčerpaná</Badge>
        ) : daysLeft <= 14 ? (
          <Badge tone="warning">Končí za {countLabel(Math.max(0, daysLeft), ['den', 'dny', 'dní'])}</Badge>
        ) : (
          <Badge tone="success" dot>
            Aktivní
          </Badge>
        )}
      </div>
      <span className="por-pkg__services">{packageServicesLabel(clinic, pkg.serviceIds)}</span>
      {!done && (
        <span className="por-tile__num tnum">
          {u.free}
          <span className="por-tile__of"> volných {zPrep(u.total)} {countLabel(u.total, ['vstupu', 'vstupů', 'vstupů'])}</span>
        </span>
      )}
      <StackedBar cells size="md" segments={segments.filter((sg) => sg.value > 0 || sg.label === 'volné')} />
      <div className="por-pkg__foot tnum">
        <span>
          {u.expired ? 'Platila' : 'Platí'} do <strong>{formatDate(u.validUntil)}</strong>
          {!u.expired && !done ? ` (zbývá ${countLabel(Math.max(0, daysLeft), ['den', 'dny', 'dní'])})` : ''}
        </span>
        {pkg.excusesAllowed > 0 && (
          <span>
            Omluvenky: zbývá {u.excusesLeft} {zPrep(pkg.excusesAllowed)} {pkg.excusesAllowed}
          </span>
        )}
        <span className="por-pkg__bought">
          {isImportedPackage(pkg)
            ? `Převedeno z dřívějšího systému kliniky ${formatDate((pkg as ImportedPackage).importedAt ?? pkg.purchasedAt)}`
            : `Zakoupeno ${formatDate(pkg.purchasedAt)} za ${formatMoney(pkg.priceCzk)} ${MONEY_LABEL[pkg.paidBy] ?? ''}`}
        </span>
      </div>
    </Card>
  );
}

type PackagePay = 'online' | 'credit' | 'qr';

function BuyPackageSheet({ onClose }: { onClose: () => void }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const { client } = usePortal();
  const templates = useMemo(() => clinic.packageTemplates.filter((t) => t.active).sort((a, b) => a.order - b.order), [clinic.packageTemplates]);
  const [tplId, setTplId] = useState<string | null>(templates[0]?.id ?? null);
  const { card: cardOn, qr: qrOn } = onlinePurchase(clinic);
  const [method, setMethod] = useState<PackagePay>(cardOn ? 'online' : 'qr');
  const [qrRequestId, setQrRequestId] = useState<Id | null>(null);
  const pay = useSimulatedPayment();
  const tpl = templates.find((t) => t.id === tplId);
  const credit = clientCredit(clinic, client.id);
  const enoughCredit = !!tpl && credit >= tpl.priceCzk;
  // dostupné způsoby: karta jen se zapnutou funkcí, QR jen s účtem, kredit jen když stačí
  const available: PackagePay[] = [...(cardOn ? (['online'] as const) : []), ...(qrOn ? (['qr'] as const) : []), ...(enoughCredit ? (['credit'] as const) : [])];
  const effMethod: PackagePay | null = available.includes(method) ? method : (available[0] ?? null);
  // na stejnou permanentku už může QR platba čekat – ukážeme ji místo nové
  const waiting = tpl ? clientPendingRequests(clinic, client.id, 'package').find((r) => r.packageTemplateId === tpl.id) : undefined;

  const buy = (): void => {
    if (!tpl || !effMethod) return;
    if (effMethod === 'qr') {
      if (waiting) {
        setQrRequestId(waiting.id);
        return;
      }
      const r = run(createPaymentRequest, { clientId: client.id, purpose: 'package', packageTemplateId: tpl.id }, { quiet: true });
      if (r.ok) setQrRequestId(r.value.requestId);
      return;
    }
    const paidBy = effMethod;
    pay.run(paidBy === 'online', () => {
      const r = run(sellPackage, { clientId: client.id, templateId: tpl.id, paidBy }, { success: `Permanentka ${tpl.name} je aktivní` });
      if (r.ok) onClose();
    });
  };

  const qrStep = useQrStep(qrRequestId, 'Permanentka je aktivní', onClose);
  if (qrStep && qrRequestId) {
    return (
      <Sheet open onClose={onClose} title={qrStep.title} footer={qrStep.footer}>
        <QrStep requestId={qrRequestId} hint={QR_HINT.package} />
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Koupit permanentku"
      footer={
        <Button variant="primary" size="lg" full loading={pay.paying} disabled={!tpl || !effMethod} onClick={buy}>
          {pay.paying
            ? 'Probíhá platba…'
            : !tpl
              ? 'Vyberte permanentku'
              : !effMethod
                ? 'Koupíte na recepci'
                : effMethod === 'qr'
                ? waiting
                  ? 'Zobrazit čekající QR platbu'
                  : `Zaplatit ${formatMoney(tpl.priceCzk)} QR kódem`
                : `Zaplatit ${formatMoney(tpl.priceCzk)}${effMethod === 'credit' ? ' z kreditu' : ''}`}
        </Button>
      }
    >
      <div className="por-stack">
        <RadioCards
          legend="Permanentka"
          value={tplId}
          onChange={setTplId}
          options={templates.map((t) => {
            const save = packageSavings(clinic, t);
            return {
              value: t.id,
              title: t.name,
              description: `${t.description} · platí ${t.validityDays} dní${t.excusesAllowed ? ` · ${countLabel(t.excusesAllowed, ['omluvenka', 'omluvenky', 'omluvenek'])}` : ''}`,
              aside: formatMoney(t.priceCzk),
              badge: save > 0 ? <Badge tone="success">Ušetříte {formatMoney(save)}</Badge> : undefined,
            };
          })}
        />
        <RadioCards<PackagePay>
          legend="Platba"
          value={effMethod}
          onChange={setMethod}
          options={[
            ...(cardOn ? [{ value: 'online' as const, title: 'Kartou online', description: 'Platba proběhne hned (v ukázce jen simulace).' }] : []),
            ...(qrOn
              ? [
                  {
                    value: 'qr' as const,
                    title: 'QR platba',
                    description: 'Převodem z bankovní aplikace – naskenujete QR kód. Permanentka se aktivuje po připsání platby.',
                  },
                ]
              : []),
            {
              value: 'credit',
              title: 'Z kreditu',
              description: tpl
                ? enoughCredit
                  ? `Zůstatek ${formatMoney(credit)}, po platbě ${formatMoney(credit - tpl.priceCzk)}`
                  : `Zůstatek ${formatMoney(credit)} – nestačí`
                : `Zůstatek ${formatMoney(credit)}`,
              disabled: !enoughCredit,
            },
          ]}
        />
        {effMethod === 'online' && tpl && <SimulatedPaymentNote amount={formatMoney(tpl.priceCzk)} />}
        {!effMethod && tpl && (
          <Callout tone="info" icon="building">
            Permanentku teď koupíte na recepci – kartou, hotově nebo převodem. Z kreditu ji tu zaplatíte, až na něm budete mít aspoň {formatMoney(tpl.priceCzk)}.
          </Callout>
        )}
        {effMethod === 'qr' && waiting && (
          <Callout tone="info" icon={QR_ICON}>
            Na tuto permanentku už čeká QR platba (VS {waiting.vs}). Ukážeme vám ji znovu, ať neplatíte dvakrát.
          </Callout>
        )}
        {tpl && (
          <p className="por-note">
            {effMethod === 'qr'
              ? `Permanentka začne platit po připsání platby a platí ${countLabel(tpl.validityDays, ['den', 'dny', 'dní'])}.`
              : `Permanentka začne platit hned a platí do ${formatDate(addDays(dateOf(now), tpl.validityDays))}.`}{' '}
            Vstupy využijete na: {packageServicesLabel(clinic, tpl.serviceIds)}.
          </p>
        )}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Kredit                                                              */
/* ------------------------------------------------------------------ */

const LEDGER_LABEL: Record<LedgerEntry['kind'], string> = {
  topup: 'Dobití kreditu',
  bonus: 'Bonus za dobití',
  booking_payment: 'Platba termínu',
  refund: 'Vráceno na kredit',
  storno_fee: 'Storno poplatek',
  package_purchase: 'Nákup permanentky',
  adjustment: 'Úprava kreditu',
};

const LEDGER_ICON: Record<LedgerEntry['kind'], IconName> = {
  topup: 'plus',
  bonus: 'gift',
  booking_payment: 'calendarCheck',
  refund: 'undo',
  storno_fee: 'calendarX',
  package_purchase: 'ticket',
  adjustment: 'edit',
};

const PURPOSE_LABEL: Record<string, string> = {
  booking: 'Platba termínu',
  package: 'Permanentka',
  credit_topup: 'Dobití kreditu',
  storno_fee: 'Storno poplatek',
};

function CreditView({ onBack }: { onBack: () => void }): JSX.Element {
  const clinic = useClinic();
  const { client, accountAction, clearAccountAction } = usePortal();
  const [topupOpen, setTopupOpen] = useState(accountAction === 'topup');
  const [limit, setLimit] = useState(10);
  useEffect(() => {
    if (accountAction === 'topup') clearAccountAction();
  }, []);
  const credit = clientCredit(clinic, client.id);
  const canTopUp = onlinePurchase(clinic).any;
  const ledger = useMemo(
    () => clinic.ledger.filter((e) => e.clientId === client.id).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)),
    [clinic.ledger, client.id],
  );
  const payments = useMemo(
    () => clinic.payments.filter((p) => p.clientId === client.id).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 10),
    [clinic.payments, client.id],
  );
  const bonusRules = [...clinic.settings.creditBonus].filter((r) => r.pct > 0).sort((a, b) => a.minTopup - b.minTopup);

  return (
    <Screen
      title="Kredit a platby"
      onBack={onBack}
      backLabel="Zpět na účet"
      dock={
        canTopUp ? (
          <ActionBar>
            <Button variant="primary" size="lg" icon="plus" onClick={() => setTopupOpen(true)}>
              Dobít kredit
            </Button>
          </ActionBar>
        ) : undefined
      }
    >
      <Card padding="md" className="por-credit">
        <span className="por-tile__label">Zůstatek</span>
        <span className="por-credit__num tnum">{formatMoney(credit)}</span>
        <span className="por-credit__text">
          Kreditem zaplatíte termíny i permanentky.
          {bonusRules.length
            ? ` Bonus za dobití: ${bonusRules.map((r) => `od ${formatMoney(r.minTopup)} +${formatPercent(r.pct)}`).join(', ')}.`
            : ''}
        </span>
      </Card>

      {!canTopUp && (
        <Callout tone="info" icon="building">
          Kredit dobijete na recepci – hotově, kartou nebo převodem.
        </Callout>
      )}

      <PendingPaymentsSection title="Čeká na zaplacení" purpose="credit_topup" />

      <section className="por-stack por-stack--tight" aria-labelledby="por-ledger">
        <SectionTitle id="por-ledger">Pohyby kreditu</SectionTitle>
        {ledger.length ? (
          <div className="por-card por-card--list">
            {ledger.slice(0, limit).map((e) => (
              <div key={e.id} className="por-ledger">
                <span className={cx('por-ledger__icon', e.amount >= 0 ? 'is-plus' : 'is-minus')} aria-hidden="true">
                  <Icon name={LEDGER_ICON[e.kind]} size={16} />
                </span>
                <span className="por-ledger__body">
                  <span className="por-ledger__label">{LEDGER_LABEL[e.kind]}</span>
                  <span className="por-ledger__meta tnum">
                    {formatDateTimeShort(e.at)}
                    {e.note && e.note !== LEDGER_LABEL[e.kind] ? ` · ${e.note}` : ''}
                  </span>
                </span>
                <span className={cx('por-ledger__amount tnum', e.amount >= 0 ? 'is-plus' : 'is-minus')}>{formatSignedMoney(e.amount)}</span>
              </div>
            ))}
            {ledger.length > limit && (
              <button type="button" className="por-more" onClick={() => setLimit((l) => l + 20)}>
                Zobrazit další ({ledger.length - limit})
              </button>
            )}
          </div>
        ) : (
          <div className="por-card por-card--empty">
            <Icon name="wallet" size={20} />
            <span>Zatím žádné pohyby. Po dobití tu uvidíte platby, vratky i bonusy.</span>
          </div>
        )}
      </section>

      {payments.length > 0 && (
        <section className="por-stack por-stack--tight" aria-labelledby="por-payments">
          <SectionTitle id="por-payments">Poslední platby</SectionTitle>
          <div className="por-card por-card--list">
            {payments.map((p) => (
              <div key={p.id} className="por-ledger">
                <span className="por-ledger__icon" aria-hidden="true">
                  <Icon name={p.method === 'cash' ? 'cash' : p.method === 'qr' ? QR_ICON : 'card'} size={16} />
                </span>
                <span className="por-ledger__body">
                  <span className="por-ledger__label">{PURPOSE_LABEL[p.purpose] ?? 'Platba'}</span>
                  <span className="por-ledger__meta tnum">
                    {formatDateTimeShort(p.at)} · {MONEY_LABEL[p.method] ?? p.method}
                  </span>
                </span>
                <span className="por-ledger__amount tnum">{formatMoney(p.amount)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      {topupOpen && <TopUpSheet onClose={() => setTopupOpen(false)} />}
    </Screen>
  );
}

const PRESETS = [500, 1000, 2000, 3000, 5000, 10000];

function TopUpSheet({ onClose }: { onClose: () => void }): JSX.Element {
  const clinic = useClinic();
  const run = useCommand();
  const { client } = usePortal();
  const [amount, setAmount] = useState<number>(1000);
  const { card: cardOn, qr: qrOn } = onlinePurchase(clinic);
  const [method, setMethod] = useState<'online' | 'qr'>(cardOn ? 'online' : 'qr');
  const [qrRequestId, setQrRequestId] = useState<Id | null>(null);
  const pay = useSimulatedPayment();
  const methods: ('online' | 'qr')[] = [...(cardOn ? (['online'] as const) : []), ...(qrOn ? (['qr'] as const) : [])];
  const effMethod: 'online' | 'qr' | null = methods.includes(method) ? method : (methods[0] ?? null);
  const valid = Number.isFinite(amount) && amount >= 100 && amount <= 100000;
  const bonus = valid ? creditBonusFor(clinic, amount) : 0;
  const rules = [...clinic.settings.creditBonus].filter((r) => r.pct > 0).sort((a, b) => a.minTopup - b.minTopup);
  const nextRule = rules.find((r) => amount < r.minTopup);
  const pct = rules.filter((r) => amount >= r.minTopup).reduce((m, r) => Math.max(m, r.pct), 0);

  const submit = (): void => {
    if (!valid || !effMethod) return;
    if (effMethod === 'qr') {
      const r = run(createPaymentRequest, { clientId: client.id, purpose: 'credit_topup', amount }, { quiet: true });
      if (r.ok) setQrRequestId(r.value.requestId);
      return;
    }
    pay.run(true, () => {
      const r = run(topUpCredit, { clientId: client.id, amount, method: 'online' }, { success: `Kredit dobit o ${formatMoney(amount)}` });
      if (r.ok) onClose();
    });
  };

  const qrStep = useQrStep(qrRequestId, 'Kredit je dobitý', onClose);
  if (qrStep && qrRequestId) {
    const requested = clinic.paymentRequests.find((r) => r.id === qrRequestId);
    const requestBonus = requested ? creditBonusFor(clinic, requested.amount) : 0;
    return (
      <Sheet open onClose={onClose} title={qrStep.title} footer={qrStep.footer}>
        <QrStep
          requestId={qrRequestId}
          hint={requestBonus > 0 ? `Kredit se připíše po připsání platby, i s bonusem ${formatMoney(requestBonus)}.` : QR_HINT.credit_topup}
        />
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Dobít kredit"
      footer={
        <Button variant="primary" size="lg" full loading={pay.paying} disabled={!valid || !effMethod} onClick={submit}>
          {pay.paying ? 'Probíhá platba…' : !effMethod ? 'Dobijete na recepci' : `Zaplatit ${formatMoney(valid ? amount : 0)}${effMethod === 'qr' ? ' QR kódem' : ''}`}
        </Button>
      }
    >
      <div className="por-stack">
        <ChoiceChips
          aria-label="Částka"
          shape="tile"
          size="lg"
          columns={3}
          value={PRESETS.includes(amount) ? String(amount) : null}
          onChange={(v) => setAmount(Number(v))}
          options={PRESETS.map((v) => ({ value: String(v), label: formatMoney(v) }))}
        />
        <Field label="Jiná částka" hint="Nejméně 100 Kč, nejvýše 100 000 Kč." error={!valid ? 'Zadejte částku 100–100 000 Kč.' : undefined}>
          <NumberInput size="lg" value={amount} onChange={setAmount} min={100} max={100000} step={100} suffix="Kč" />
        </Field>
        <div className={cx('por-bonus', bonus > 0 && 'is-on')} aria-live="polite">
          <Icon name="gift" size={18} />
          <span>
            {bonus > 0 ? (
              <>
                Bonus <strong>+{formatMoney(bonus)}</strong> ({formatPercent(pct)}) – na kredit připíšeme <strong>{formatMoney(amount + bonus)}</strong>.
              </>
            ) : nextRule ? (
              <>
                Při dobití od {formatMoney(nextRule.minTopup)} získáte bonus {formatPercent(nextRule.pct)}.
              </>
            ) : (
              'Dobitý kredit můžete použít na termíny i permanentky.'
            )}
          </span>
        </div>
        {bonus > 0 && nextRule && (
          <p className="por-note">
            Od {formatMoney(nextRule.minTopup)} je bonus {formatPercent(nextRule.pct)}.
          </p>
        )}
        {methods.length > 1 && (
          <RadioCards<'online' | 'qr'>
            legend="Platba"
            value={effMethod}
            onChange={setMethod}
            options={[
              { value: 'online', title: 'Kartou online', description: 'Kredit se připíše hned (v ukázce jen simulace).' },
              { value: 'qr', title: 'QR platba', description: 'Převodem z bankovní aplikace – naskenujete QR kód. Kredit se připíše po připsání platby.' },
            ]}
          />
        )}
        {methods.length === 1 && effMethod === 'qr' && (
          <p className="por-note">Zaplatíte QR platbou z bankovní aplikace – kredit se připíše, jakmile platba dorazí.</p>
        )}
        {!effMethod && (
          <Callout tone="info" icon="building">
            Kredit teď dobijete na recepci – hotově, kartou nebo převodem.
          </Callout>
        )}
        {effMethod === 'online' && <SimulatedPaymentNote />}
        {effMethod === 'qr' && !cardOn && (
          <p className="por-note">Zaplatíte převodem z bankovní aplikace – naskenujete QR kód. Kredit se připíše po připsání platby.</p>
        )}
        {!effMethod && (
          <Callout tone="info" icon="info">
            Online teď kredit dobít nejde. Dobijete ho na recepci kartou nebo hotově.
          </Callout>
        )}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Zprávy                                                              */
/* ------------------------------------------------------------------ */

const KIND_LABEL: Partial<Record<Message['kind'], string>> = {
  booking_confirmation: 'Potvrzení rezervace',
  reminder: 'Připomínka',
  cancellation: 'Zrušení',
  excuse: 'Omluvenka',
  late_cancel: 'Pozdní zrušení',
  no_show: 'Nedostavení',
  clinic_cancel: 'Zrušeno klinikou',
  reschedule: 'Přesun termínu',
  waitlist_offer: 'Uvolněný termín',
  makeup_reminder: 'Náhradní termín',
  package_low: 'Permanentka',
  package_expiring: 'Permanentka',
  after_visit: 'Po návštěvě',
  reactivation: 'Novinky',
  birthday: 'Přání',
  campaign: 'Novinky',
  manual: 'Zpráva od kliniky',
};

function InboxView({ onBack }: { onBack: () => void }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const { client } = usePortal();
  const messages = useMemo(() => clientMessages(clinic, client.id), [clinic.messages, client.id]);
  const [limit, setLimit] = useState(30);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = messages.find((m) => m.id === openId);
  useEffect(() => {
    if (messages[0]) markInboxSeen(client.id, messages[0].at);
  }, [messages, client.id]);

  const when = (at: string): string => (dateOf(at) === dateOf(now) ? formatTime(at) : formatDayShort(at));

  return (
    <Screen title="Zprávy od kliniky" onBack={onBack} backLabel="Zpět na účet">
      {messages.length ? (
        <ul className="por-inbox">
          {messages.slice(0, limit).map((m) => (
            <li key={m.id}>
              <button type="button" className="por-msg" onClick={() => setOpenId(m.id)}>
                <span className="por-msg__icon" aria-hidden="true">
                  <Icon name={m.channel === 'sms' ? 'smartphone' : 'mail'} size={16} />
                </span>
                <span className="por-msg__body">
                  <span className="por-msg__top">
                    <span className="por-msg__kind">{KIND_LABEL[m.kind] ?? 'Zpráva'}</span>
                    <span className="por-msg__time tnum">{when(m.at)}</span>
                  </span>
                  <span className="por-msg__subject">{m.subject || 'SMS zpráva'}</span>
                  <span className="por-msg__snippet">{m.body.replace(/\s+/g, ' ').slice(0, 140)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="mail" title="Zatím žádné zprávy" text="Potvrzení rezervací, připomínky a nabídky uvolněných termínů najdete tady." />
      )}
      {messages.length > limit && (
        <Button variant="secondary" full onClick={() => setLimit((l) => l + 30)}>
          Zobrazit starší ({messages.length - limit})
        </Button>
      )}
      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open ? KIND_LABEL[open.kind] ?? 'Zpráva' : ''}>
        {open && (
          <article className="por-msgdetail">
            <h3 className="por-msgdetail__subject">{open.subject || 'SMS zpráva'}</h3>
            <span className="por-msgdetail__meta tnum">
              <Icon name={open.channel === 'sms' ? 'smartphone' : 'mail'} size={14} />
              {open.channel === 'sms' ? `SMS na ${client.phone}` : `E-mail na ${client.email}`} · {formatDateTimeShort(open.at)}
            </span>
            <div className="por-msgdetail__body">{open.body}</div>
          </article>
        )}
      </Sheet>
      {!messages.length && (
        <Callout tone="neutral" icon="info">
          Zprávy posíláme na {client.email || 'váš e-mail'}
          {client.phone ? ` a ${client.phone}` : ''}.
        </Callout>
      )}
    </Screen>
  );
}
