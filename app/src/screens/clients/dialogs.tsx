import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import type { Channel, Client, ClientPackage, MoneyMethod } from '../../domain/types';
import {
  adjustCredit,
  cancelPackage,
  creditBonusFor,
  extendPackage,
  payFee,
  sellPackage,
  sendManualMessage,
  settleBooking,
  topUpCredit,
  updateClient,
  waiveFee,
} from '../../engine/commands';
import { countLabel, formatDate, formatMoney, formatNumber, formatSignedMoney } from '../../engine/format';
import { clientCredit, getService, packageUsage } from '../../engine/selectors';
import { addDays, dateOf } from '../../engine/time';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  ChoiceChips,
  ConfirmDialog,
  DescriptionList,
  Dialog,
  Field,
  Input,
  NumberInput,
  RadioCards,
  Segmented,
  Textarea,
} from '../../ui';
import type { DebtItem } from './model';

type PayMethod = MoneyMethod | 'credit';

const PAY_OPTIONS: { value: PayMethod; label: string }[] = [
  { value: 'card', label: 'Kartou' },
  { value: 'cash', label: 'Hotově' },
  { value: 'transfer', label: 'Převodem' },
  { value: 'credit', label: 'Z kreditu' },
];

function DialogFooter({ onClose, submitLabel, formId, disabled, tone = 'primary' }: { onClose: () => void; submitLabel: string; formId: string; disabled?: boolean; tone?: 'primary' | 'danger' }): JSX.Element {
  return (
    <>
      <Button variant="secondary" onClick={onClose}>
        Zpět
      </Button>
      <Button variant={tone} type="submit" form={formId} disabled={disabled}>
        {submitLabel}
      </Button>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Zpráva klientovi                                                    */
/* ------------------------------------------------------------------ */

export function SendMessageDialog({ client, open, onClose }: { client: Client; open: boolean; onClose: () => void }): JSX.Element {
  const clinic = useClinic();
  const run = useCommand();
  const formId = useId();
  const canEmail = !!client.email;
  const canSms = !!client.phone;
  const [channel, setChannel] = useState<Channel>(canEmail ? 'email' : 'sms');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChannel(canEmail ? 'email' : 'sms');
    setSubject(`Zpráva z kliniky ${clinic.settings.clinicName}`);
    setBody(`Dobrý den, ${client.firstName},\n\n`);
    setTried(false);
  }, [open, canEmail, clinic.settings.clinicName, client.firstName]);

  const smsParts = Math.max(1, Math.ceil(body.length / 160));
  const bodyEmpty = body.replace(`Dobrý den, ${client.firstName},`, '').trim().length === 0;
  const subjectMissing = channel === 'email' && !subject.trim();

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    setTried(true);
    if (bodyEmpty || subjectMissing) return;
    const r = run(
      sendManualMessage,
      { clientId: client.id, channel, subject: channel === 'email' ? subject : '', body },
      { success: channel === 'email' ? 'E-mail odeslán (simulace)' : 'SMS odeslána (simulace)', quiet: true },
    );
    if (r.ok) onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Zpráva pro ${client.firstName} ${client.lastName}`}
      description="Zprávy se v prototypu reálně neodesílají – uloží se do komunikace klienta."
      footer={<DialogFooter onClose={onClose} submitLabel={channel === 'email' ? 'Odeslat e-mail' : 'Odeslat SMS'} formId={formId} />}
    >
      <form id={formId} className="cli-form" onSubmit={submit} noValidate>
        {!canEmail && !canSms ? (
          <Callout tone="danger">Klient nemá e-mail ani telefon. Doplňte kontakt v jeho údajích.</Callout>
        ) : (
          <>
            <Segmented
              aria-label="Kanál"
              value={channel}
              onChange={setChannel}
              options={[
                { value: 'email', label: 'E-mail', icon: 'mail', disabled: !canEmail },
                { value: 'sms', label: 'SMS', icon: 'smartphone', disabled: !canSms },
              ]}
            />
            <p className="cli-to tnum">
              Komu: <strong>{channel === 'email' ? client.email || '—' : client.phone || '—'}</strong>
            </p>
            {channel === 'sms' && !client.consents.sms && (
              <Callout tone="warning" title="Bez souhlasu se SMS">
                Posílejte jen provozní zprávy k termínům klienta (změna času, zrušení), ne nabídky.
              </Callout>
            )}
            {channel === 'email' && (
              <Field label="Předmět" error={tried && subjectMissing ? 'Doplňte předmět e-mailu.' : undefined}>
                <Input value={subject} onValueChange={setSubject} />
              </Field>
            )}
            <Field
              label="Text zprávy"
              error={tried && bodyEmpty ? 'Napište text zprávy.' : undefined}
              hint={channel === 'sms' ? `${formatNumber(body.length)} znaků · ${countLabel(smsParts, ['SMS', 'SMS', 'SMS'])}` : 'Obchodní sdělení posílejte jen klientům se souhlasem s marketingem.'}
            >
              <Textarea value={body} onValueChange={setBody} rows={channel === 'sms' ? 4 : 7} />
            </Field>
          </>
        )}
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Prodej permanentky                                                  */
/* ------------------------------------------------------------------ */

export function SellPackageDialog({ client, open, onClose }: { client: Client; open: boolean; onClose: () => void }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const formId = useId();
  const today = dateOf(now);
  const templates = useMemo(() => clinic.packageTemplates.filter((t) => t.active).sort((a, b) => a.order - b.order), [clinic.packageTemplates]);
  const credit = clientCredit(clinic, client.id);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [method, setMethod] = useState<PayMethod>('card');
  const [startDate, setStartDate] = useState(today);

  useEffect(() => {
    if (!open) return;
    setTemplateId(templates[0]?.id ?? null);
    setMethod('card');
    setStartDate(today);
  }, [open, templates, today]);

  const tpl = templates.find((t) => t.id === templateId);
  const creditShort = !!tpl && method === 'credit' && credit < tpl.priceCzk;
  const validStart = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : today;

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (!tpl || creditShort) return;
    const r = run(
      sellPackage,
      { clientId: client.id, templateId: tpl.id, paidBy: method, startDate: validStart },
      { success: `Permanentka ${tpl.name} prodána za ${formatMoney(tpl.priceCzk)}` },
    );
    if (r.ok) onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Prodat permanentku"
      description={`${client.firstName} ${client.lastName}`}
      size="lg"
      footer={<DialogFooter onClose={onClose} submitLabel={tpl ? `Prodat za ${formatMoney(tpl.priceCzk)}` : 'Prodat'} formId={formId} disabled={!tpl || creditShort} />}
    >
      <form id={formId} className="cli-form" onSubmit={submit} noValidate>
        {templates.length === 0 ? (
          <Callout tone="info">V nabídce není žádná aktivní permanentka. Přidejte ji v části Permanentky a kredity.</Callout>
        ) : (
          <RadioCards
            legend="Permanentka"
            value={templateId}
            onChange={setTemplateId}
            columns={2}
            options={templates.map((t) => {
              const services = t.serviceIds.map((id) => getService(clinic, id)?.name).filter(Boolean) as string[];
              const unit = Math.round(t.priceCzk / Math.max(1, t.entries));
              const single = Math.max(0, ...t.serviceIds.map((id) => getService(clinic, id)?.priceCzk ?? 0));
              const saving = single > 0 ? Math.round((1 - unit / single) * 100) : 0;
              return {
                value: t.id,
                title: t.name,
                badge: saving >= 5 ? <Badge tone="success">−{saving} %</Badge> : undefined,
                description: (
                  <>
                    {countLabel(t.entries, ['vstup', 'vstupy', 'vstupů'])} · platnost {countLabel(t.validityDays, ['den', 'dny', 'dní'])} ·{' '}
                    {countLabel(t.excusesAllowed, ['omluvenka', 'omluvenky', 'omluvenek'])}
                    <br />
                    <span className="muted">{services.slice(0, 3).join(', ')}{services.length > 3 ? ' a další' : ''}</span>
                  </>
                ),
                aside: (
                  <span className="cli-price">
                    <strong className="tnum">{formatMoney(t.priceCzk)}</strong>
                    <span className="muted tnum">{formatMoney(unit)} / vstup</span>
                  </span>
                ),
              };
            })}
          />
        )}
        <div className="cli-form-grid">
          <Field label="Platba">
            <Segmented
              aria-label="Způsob platby"
              value={method}
              onChange={setMethod}
              options={PAY_OPTIONS.map((o) => ({ ...o, disabled: o.value === 'credit' && credit <= 0 }))}
            />
          </Field>
          <Field label="Platnost od" hint={tpl ? `Platí do ${formatDate(addDays(validStart, tpl.validityDays))}` : undefined}>
            <Input type="date" value={startDate} min={today} onValueChange={setStartDate} />
          </Field>
        </div>
        {method === 'credit' && tpl && (
          <Callout tone={creditShort ? 'danger' : 'neutral'} icon="wallet">
            Na kreditu je {formatMoney(credit)}
            {creditShort ? ` – na permanentku za ${formatMoney(tpl.priceCzk)} nestačí.` : `, po nákupu zůstane ${formatMoney(credit - tpl.priceCzk)}.`}
          </Callout>
        )}
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Prodloužení a zrušení permanentky                                    */
/* ------------------------------------------------------------------ */

const EXTEND_REASONS = ['Nemoc klienta', 'Dovolená terapeuta', 'Kompenzace', 'Jiný důvod'] as const;

export function ExtendPackageDialog({ pkg, open, onClose }: { pkg: ClientPackage | null; open: boolean; onClose: () => void }): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const formId = useId();
  const [days, setDays] = useState(14);
  const [reason, setReason] = useState<(typeof EXTEND_REASONS)[number]>('Nemoc klienta');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setDays(14);
    setReason('Nemoc klienta');
    setNote('');
  }, [open]);

  if (!pkg) return null;
  const usage = packageUsage(clinic, pkg, dateOf(now));
  const nextUntil = addDays(usage.validUntil, days);
  const fullReason = [reason, note.trim()].filter(Boolean).join(' – ');

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const r = run(extendPackage, { packageId: pkg.id, days, reason: fullReason }, { success: `Platnost prodloužena do ${formatDate(nextUntil)}` });
    if (r.ok) onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Prodloužit permanentku ${pkg.name}`}
      description={`Současná platnost do ${formatDate(usage.validUntil)}.`}
      footer={<DialogFooter onClose={onClose} submitLabel="Prodloužit platnost" formId={formId} disabled={days < 1} />}
    >
      <form id={formId} className="cli-form" onSubmit={submit} noValidate>
        <Field label="O kolik dní" hint={`Nová platnost do ${formatDate(nextUntil)}`}>
          <NumberInput value={days} onChange={setDays} min={1} max={365} suffix="dní" />
        </Field>
        <ChoiceChips
          aria-label="Rychlá volba počtu dní"
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          options={[7, 14, 30, 60].map((n) => ({ value: String(n), label: `+${n} dní` }))}
        />
        <Field label="Důvod">
          <ChoiceChips aria-label="Důvod prodloužení" value={reason} onChange={setReason} options={EXTEND_REASONS.map((r) => ({ value: r, label: r }))} />
        </Field>
        <Field label="Poznámka" optional>
          <Input value={note} onValueChange={setNote} placeholder="Např. lékařská zpráva doložena" />
        </Field>
      </form>
    </Dialog>
  );
}

export function CancelPackageDialog({ pkg, open, onClose }: { pkg: ClientPackage | null; open: boolean; onClose: () => void }): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const [refund, setRefund] = useState(true);

  useEffect(() => {
    if (open) setRefund(true);
  }, [open]);

  if (!pkg) return null;
  const u = packageUsage(clinic, pkg, dateOf(now));
  const refundAmount = u.free * u.unitValue;
  const blocked = u.reserved > 0;

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={`Zrušit permanentku ${pkg.name}?`}
      message={
        blocked
          ? undefined
          : `Permanentka přestane platit. Využito ${u.used} z ${u.total}, volných ${countLabel(u.free, ['vstup', 'vstupy', 'vstupů'])}.`
      }
      tone="danger"
      confirmLabel="Zrušit permanentku"
      confirmDisabled={blocked}
      onConfirm={() => {
        const r = run(
          cancelPackage,
          { packageId: pkg.id, refundToCredit: refund },
          { success: refund && refundAmount > 0 ? `Permanentka zrušena, ${formatMoney(refundAmount)} vráceno na kredit` : 'Permanentka zrušena' },
        );
        if (!r.ok) throw new Error(r.error);
      }}
    >
      {blocked ? (
        <Callout tone="danger" title="Nejdřív termíny">
          Na permanentku {u.reserved === 1 ? 'je rezervovaný 1 termín' : `jsou rezervované ${countLabel(u.reserved, ['termín', 'termíny', 'termínů'])}`}. Zrušte je nebo změňte jejich platbu v kalendáři.
        </Callout>
      ) : u.free > 0 ? (
        <Checkbox
          checked={refund}
          onChange={setRefund}
          label={`Vrátit nevyčerpané vstupy na kredit (${formatMoney(refundAmount)})`}
          description={`${countLabel(u.free, ['vstup', 'vstupy', 'vstupů'])} × ${formatMoney(u.unitValue)} (cena za vstup)`}
        />
      ) : (
        <p className="muted">Na permanentce nezbývají volné vstupy, nic se nevrací.</p>
      )}
    </ConfirmDialog>
  );
}

/* ------------------------------------------------------------------ */
/* Kredit                                                              */
/* ------------------------------------------------------------------ */

export function TopUpCreditDialog({ client, open, onClose }: { client: Client; open: boolean; onClose: () => void }): JSX.Element {
  const clinic = useClinic();
  const run = useCommand();
  const formId = useId();
  const [amount, setAmount] = useState(1000);
  const [method, setMethod] = useState<MoneyMethod>('card');

  useEffect(() => {
    if (!open) return;
    setAmount(1000);
    setMethod('card');
  }, [open]);

  const balance = clientCredit(clinic, client.id);
  const bonus = creditBonusFor(clinic, amount);
  const rules = [...clinic.settings.creditBonus].sort((a, b) => a.minTopup - b.minTopup);
  const nextRule = rules.find((r) => r.minTopup > amount);
  const invalid = amount < 100 || amount > 100000;

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (invalid) return;
    const r = run(topUpCredit, { clientId: client.id, amount, method }, { success: `Kredit dobit o ${formatMoney(amount)}` });
    if (r.ok) onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Dobít kredit"
      description={`Současný zůstatek ${formatMoney(balance)}`}
      footer={<DialogFooter onClose={onClose} submitLabel={`Dobít ${formatMoney(amount)}`} formId={formId} disabled={invalid} />}
    >
      <form id={formId} className="cli-form" onSubmit={submit} noValidate>
        <Field label="Částka" error={invalid ? 'Dobít lze 100 až 100 000 Kč.' : undefined}>
          <NumberInput value={amount} onChange={setAmount} min={0} max={100000} step={100} suffix="Kč" />
        </Field>
        <ChoiceChips
          aria-label="Rychlá volba částky"
          value={String(amount)}
          onChange={(v) => setAmount(Number(v))}
          options={[500, 1000, 2000, 3000, 5000].map((n) => ({ value: String(n), label: formatMoney(n) }))}
        />
        <Field label="Platba">
          <Segmented
            aria-label="Způsob platby"
            value={method}
            onChange={setMethod}
            options={[
              { value: 'card', label: 'Kartou' },
              { value: 'cash', label: 'Hotově' },
              { value: 'transfer', label: 'Převodem' },
            ]}
          />
        </Field>
        <DescriptionList
          termWidth={150}
          items={[
            { term: 'Dobití', detail: <span className="tnum">{formatMoney(amount)}</span> },
            { term: 'Bonus', detail: <span className="tnum">{bonus > 0 ? formatSignedMoney(bonus) : 'bez bonusu'}</span> },
            { term: 'Nový zůstatek', detail: <strong className="tnum">{formatMoney(balance + (invalid ? 0 : amount + bonus))}</strong> },
          ]}
        />
        {nextRule && (
          <p className="cli-hint">
            Při dobití od {formatMoney(nextRule.minTopup)} získá klient bonus {nextRule.pct} %.
          </p>
        )}
      </form>
    </Dialog>
  );
}

export function AdjustCreditDialog({ client, open, onClose }: { client: Client; open: boolean; onClose: () => void }): JSX.Element {
  const clinic = useClinic();
  const run = useCommand();
  const formId = useId();
  const [direction, setDirection] = useState<'add' | 'sub'>('add');
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDirection('add');
    setAmount(0);
    setNote('');
    setTried(false);
  }, [open]);

  const balance = clientCredit(clinic, client.id);
  const delta = direction === 'add' ? amount : -amount;
  const next = balance + delta;
  const errAmount = amount <= 0 ? 'Zadejte částku.' : next < 0 ? `Zůstatek nesmí být záporný (na kreditu je ${formatMoney(balance)}).` : undefined;
  const errNote = !note.trim() ? 'Uveďte důvod – zobrazí se v pohybech kreditu.' : undefined;

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    setTried(true);
    if (errAmount || errNote) return;
    const r = run(adjustCredit, { clientId: client.id, amount: delta, note }, { success: `Kredit upraven na ${formatMoney(next)}` });
    if (r.ok) onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Upravit kredit"
      description="Ruční oprava zůstatku (kompenzace, oprava chyby). Nejde o platbu – tržby se nemění."
      footer={<DialogFooter onClose={onClose} submitLabel="Uložit úpravu" formId={formId} />}
    >
      <form id={formId} className="cli-form" onSubmit={submit} noValidate>
        <Segmented
          aria-label="Směr úpravy"
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'add', label: 'Přičíst', icon: 'plus' },
            { value: 'sub', label: 'Odečíst', icon: 'minus' },
          ]}
        />
        <Field label="Částka" error={tried ? errAmount : undefined}>
          <NumberInput value={amount} onChange={setAmount} min={0} max={100000} step={50} suffix="Kč" />
        </Field>
        <Field label="Důvod" error={tried ? errNote : undefined}>
          <Input value={note} onValueChange={setNote} placeholder="Např. kompenzace za zrušený termín" />
        </Field>
        <DescriptionList
          termWidth={150}
          items={[
            { term: 'Současný zůstatek', detail: <span className="tnum">{formatMoney(balance)}</span> },
            { term: 'Nový zůstatek', detail: <strong className={next < 0 ? 'text-danger tnum' : 'tnum'}>{formatMoney(next)}</strong> },
          ]}
        />
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Dluh: úhrada a odpuštění                                            */
/* ------------------------------------------------------------------ */

export function SettleDebtDialog({ item, open, onClose }: { item: DebtItem | null; open: boolean; onClose: () => void }): JSX.Element | null {
  const clinic = useClinic();
  const run = useCommand();
  const formId = useId();
  const [method, setMethod] = useState<PayMethod>('card');

  useEffect(() => {
    if (open) setMethod('card');
  }, [open]);

  if (!item) return null;
  const credit = clientCredit(clinic, item.booking.clientId);
  const creditShort = method === 'credit' && credit < item.amount;

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (creditShort) return;
    const r =
      item.kind === 'fee'
        ? run(payFee, { bookingId: item.booking.id, method }, { success: `Poplatek ${formatMoney(item.amount)} uhrazen` })
        : run(settleBooking, { bookingId: item.booking.id, method }, { success: `Termín uhrazen (${formatMoney(item.amount)})` });
    if (r.ok) onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={item.kind === 'fee' ? 'Uhradit poplatek' : 'Uhradit termín'}
      description={item.label}
      size="sm"
      footer={<DialogFooter onClose={onClose} submitLabel={`Přijmout ${formatMoney(item.amount)}`} formId={formId} disabled={creditShort} />}
    >
      <form id={formId} className="cli-form" onSubmit={submit} noValidate>
        <Field label="Způsob úhrady">
          <Segmented aria-label="Způsob úhrady" value={method} onChange={setMethod} options={PAY_OPTIONS.map((o) => ({ ...o, disabled: o.value === 'credit' && credit <= 0 }))} />
        </Field>
        {method === 'credit' && (
          <Callout tone={creditShort ? 'danger' : 'neutral'} icon="wallet">
            Na kreditu je {formatMoney(credit)}
            {creditShort ? ' – na úhradu nestačí.' : `, po úhradě zůstane ${formatMoney(credit - item.amount)}.`}
          </Callout>
        )}
      </form>
    </Dialog>
  );
}

const WAIVE_REASONS = ['Doložená nemoc', 'Vyšší moc', 'Chyba kliniky', 'Dobrý vztah s klientem'] as const;

export function WaiveFeeDialog({ item, open, onClose }: { item: DebtItem | null; open: boolean; onClose: () => void }): JSX.Element | null {
  const run = useCommand();
  const formId = useId();
  const [reason, setReason] = useState<string>(WAIVE_REASONS[0]);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setReason(WAIVE_REASONS[0]);
    setNote('');
  }, [open]);

  if (!item) return null;

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const full = [reason, note.trim()].filter(Boolean).join(' – ');
    const r = run(waiveFee, { bookingId: item.booking.id, reason: full }, { success: `Poplatek ${formatMoney(item.amount)} odpuštěn`, quiet: true });
    if (r.ok) onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Odpustit poplatek"
      description={item.label}
      size="sm"
      footer={<DialogFooter onClose={onClose} submitLabel="Odpustit poplatek" formId={formId} />}
    >
      <form id={formId} className="cli-form" onSubmit={submit} noValidate>
        <Field label="Důvod">
          <ChoiceChips aria-label="Důvod odpuštění" value={reason} onChange={setReason} options={WAIVE_REASONS.map((r) => ({ value: r, label: r }))} />
        </Field>
        <Field label="Poznámka" optional>
          <Input value={note} onValueChange={setNote} />
        </Field>
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Blokace online rezervací                                            */
/* ------------------------------------------------------------------ */

export function BlockDialog({ client, open, onClose }: { client: Client; open: boolean; onClose: () => void }): JSX.Element {
  const run = useCommand();
  const block = !client.blocked;
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={block ? 'Zablokovat online rezervace?' : 'Odblokovat online rezervace?'}
      message={
        block
          ? `${client.firstName} si nebude moci rezervovat přes klientský portál a uvidí výzvu, ať kontaktuje recepci. Rezervace přes recepci fungují dál.`
          : `${client.firstName} si bude moci znovu rezervovat termíny online.`
      }
      tone={block ? 'danger' : 'primary'}
      confirmLabel={block ? 'Zablokovat' : 'Odblokovat'}
      onConfirm={() => {
        const r = run(updateClient, { clientId: client.id, patch: { blocked: block } }, { success: block ? 'Online rezervace zablokovány' : 'Online rezervace odblokovány' });
        if (!r.ok) throw new Error(r.error);
      }}
    />
  );
}
