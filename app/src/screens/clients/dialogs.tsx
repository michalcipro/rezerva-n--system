import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import type { Channel, Client, ClientPackage, Id, MoneyMethod } from '../../domain/types';
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
  type CreatePaymentRequestInput,
} from '../../engine/commands';
import { countLabel, formatDate, formatDateTimeShort, formatMoney, formatNumber, formatPercent, formatSignedMoney } from '../../engine/format';
import { pendingRequestOfBooking } from '../../engine/payments';
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
  type SegmentedOption,
} from '../../ui';
import { QrPaymentDialog } from '../../components/payments';
import { useQrOption, type QrOption } from '../calendar';
import type { DebtItem } from './model';

type PayMethod = MoneyMethod | 'credit';

const PAY_OPTIONS: { value: PayMethod; label: string }[] = [
  { value: 'card', label: 'Kartou' },
  { value: 'cash', label: 'Hotově' },
  { value: 'transfer', label: 'Převodem' },
  { value: 'credit', label: 'Z kreditu' },
];

/**
 * Volba „QR platba“ do výběru způsobu platby: se zapnutou QR platbou a platným účtem, majitelce bez účtu
 * jako nedostupná (vysvětlení v nápovědě pole). Jinak se nenabízí.
 */
function qrSegment<T extends string>(qr: QrOption): SegmentedOption<T>[] {
  if (qr.available) return [{ value: 'qr' as T, label: 'QR platba', icon: 'qr' }];
  if (qr.setupHint) return [{ value: 'qr' as T, label: 'QR platba', icon: 'qr', disabled: true }];
  return [];
}

/** Co ukázat v QR dialogu: už vystavenou výzvu, nebo údaje pro novou (vznikne při otevření). */
type QrHandoffTarget = { requestId: Id } | { create: CreatePaymentRequestInput };

/**
 * Dialog s QR platbou, který zůstane otevřený i po zavření dialogu, ze kterého vznikl. Už čekající výzvu otevírej
 * přes `requestId` – vystavení nové výzvy vyžaduje zapnutou QR platbu s účtem, zobrazení a potvrzení existující ne.
 */
function useQrHandoff(): { open: (target: QrHandoffTarget) => void; dialog: JSX.Element | null } {
  const [target, setTarget] = useState<QrHandoffTarget | null>(null);
  return {
    open: setTarget,
    dialog: target ? (
      <QrPaymentDialog
        open
        onClose={() => setTarget(null)}
        requestId={'requestId' in target ? target.requestId : undefined}
        create={'create' in target ? target.create : undefined}
      />
    ) : null,
  };
}

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
  const qr = useQrOption();
  const qrHandoff = useQrHandoff();

  useEffect(() => {
    if (!open) return;
    setTemplateId(templates[0]?.id ?? null);
    setMethod('card');
    setStartDate(today);
  }, [open, templates, today]);

  const tpl = templates.find((t) => t.id === templateId);
  const creditShort = !!tpl && method === 'credit' && credit < tpl.priceCzk;
  const validStart = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : today;

  const byQr = method === 'qr' && qr.available;

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (!tpl || creditShort) return;
    if (method === 'qr') {
      // Permanentka vznikne až po připsání platby (potvrzení výzvy) – teď se jen vystaví QR platba.
      if (!byQr) return;
      qrHandoff.open({ create: { clientId: client.id, purpose: 'package', packageTemplateId: tpl.id } });
      onClose();
      return;
    }
    const r = run(
      sellPackage,
      { clientId: client.id, templateId: tpl.id, paidBy: method, startDate: validStart },
      { success: `Permanentka ${tpl.name} prodána za ${formatMoney(tpl.priceCzk)}` },
    );
    if (r.ok) onClose();
  };

  const submitLabel = !tpl ? 'Prodat' : byQr ? `Vystavit QR platbu ${formatMoney(tpl.priceCzk)}` : `Prodat za ${formatMoney(tpl.priceCzk)}`;

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="Prodat permanentku"
        description={`${client.firstName} ${client.lastName}`}
        size="lg"
        footer={<DialogFooter onClose={onClose} submitLabel={submitLabel} formId={formId} disabled={!tpl || creditShort || (method === 'qr' && !byQr)} />}
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
          <Field label="Platba" hint={!qr.available ? qr.setupHint ?? undefined : undefined}>
            <Segmented
              aria-label="Způsob platby"
              className="cli-paymethods"
              value={method}
              onChange={setMethod}
              options={[...PAY_OPTIONS.map((o) => ({ ...o, disabled: o.value === 'credit' && credit <= 0 })), ...qrSegment<PayMethod>(qr)]}
            />
          </Field>
          <div className="cli-form-grid">
            {byQr ? (
              <Field label="Platnost od" hint={tpl ? `Platí ${countLabel(tpl.validityDays, ['den', 'dny', 'dní'])} ode dne připsání platby` : undefined}>
                <Input value="Po připsání platby" disabled readOnly />
              </Field>
            ) : (
              <Field label="Platnost od" hint={tpl ? `Platí do ${formatDate(addDays(validStart, tpl.validityDays))}` : undefined}>
                <Input type="date" value={startDate} min={today} onValueChange={setStartDate} />
              </Field>
            )}
          </div>
          {byQr && tpl && (
            <Callout tone="info" icon="qr" title="QR platba převodem">
              Ukážete klientovi QR kód (nebo mu pošlete platební údaje e-mailem). Permanentka za {formatMoney(tpl.priceCzk)} se vystaví,
              až platbu potvrdíte tlačítkem „Platba přijata“ – do té doby je mezi čekajícími QR platbami klienta.
            </Callout>
          )}
          {method === 'credit' && tpl && (
            <Callout tone={creditShort ? 'danger' : 'neutral'} icon="wallet">
              Na kreditu je {formatMoney(credit)}
              {creditShort ? ` – na permanentku za ${formatMoney(tpl.priceCzk)} nestačí.` : `, po nákupu zůstane ${formatMoney(credit - tpl.priceCzk)}.`}
            </Callout>
          )}
        </form>
      </Dialog>
      {qrHandoff.dialog}
    </>
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
  const qr = useQrOption();
  const qrHandoff = useQrHandoff();

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
  const byQr = method === 'qr' && qr.available;

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (invalid) return;
    if (method === 'qr') {
      // Kredit (i s bonusem) se připíše až po potvrzení přijaté platby.
      if (!byQr) return;
      qrHandoff.open({ create: { clientId: client.id, purpose: 'credit_topup', amount } });
      onClose();
      return;
    }
    const r = run(topUpCredit, { clientId: client.id, amount, method }, { success: `Kredit dobit o ${formatMoney(amount)}` });
    if (r.ok) onClose();
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="Dobít kredit"
        description={`Současný zůstatek ${formatMoney(balance)}`}
        footer={
          <DialogFooter
            onClose={onClose}
            submitLabel={byQr ? `Vystavit QR platbu ${formatMoney(amount)}` : `Dobít ${formatMoney(amount)}`}
            formId={formId}
            disabled={invalid || (method === 'qr' && !byQr)}
          />
        }
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
          <Field label="Platba" hint={!qr.available ? qr.setupHint ?? undefined : undefined}>
            <Segmented
              aria-label="Způsob platby"
              className="cli-paymethods"
              value={method}
              onChange={setMethod}
              options={[
                { value: 'card', label: 'Kartou' },
                { value: 'cash', label: 'Hotově' },
                { value: 'transfer', label: 'Převodem' },
                ...qrSegment<MoneyMethod>(qr),
              ]}
            />
          </Field>
          <DescriptionList
            termWidth={150}
            items={[
              { term: 'Dobití', detail: <span className="tnum">{formatMoney(amount)}</span> },
              { term: 'Bonus', detail: <span className="tnum">{bonus > 0 ? formatSignedMoney(bonus) : 'bez bonusu'}</span> },
              {
                term: 'Nový zůstatek',
                detail: (
                  <span>
                    <strong className="tnum">{formatMoney(balance + (invalid ? 0 : amount + bonus))}</strong>
                    {byQr && <span className="muted"> po připsání platby</span>}
                  </span>
                ),
              },
            ]}
          />
          {byQr && (
            <Callout tone="info" icon="qr" title="QR platba převodem">
              Kredit{bonus > 0 ? ' i s bonusem' : ''} se připíše, až platbu potvrdíte tlačítkem „Platba přijata“. Do té doby je mezi čekajícími QR
              platbami klienta.
            </Callout>
          )}
          {nextRule && (
            <p className="cli-hint">
              Při dobití od {formatMoney(nextRule.minTopup)} získá klient bonus {formatPercent(nextRule.pct)}.
            </p>
          )}
        </form>
      </Dialog>
      {qrHandoff.dialog}
    </>
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
  const qr = useQrOption();
  const qrHandoff = useQrHandoff();
  const purpose = item?.kind === 'fee' ? 'storno_fee' : 'booking';
  // Už vystavená QR platba k této položce (např. klientem v portálu) – dialog ji nabídne jako výchozí.
  const pending = item ? pendingRequestOfBooking(clinic, item.booking.id, purpose) : undefined;

  useEffect(() => {
    if (open) setMethod(pending ? 'qr' : 'card');
    // výchozí způsob jen při otevření (ne při každé změně čekajících výzev)
  }, [open]);

  // QR dialog zůstane i po zavření tohoto dialogu (položka dluhu pak už není vybraná).
  if (!item) return qrHandoff.dialog;
  const credit = clientCredit(clinic, item.booking.clientId);
  const creditShort = method === 'credit' && credit < item.amount;
  const qrUsable = qr.available || !!pending;
  const byQr = method === 'qr' && qrUsable;

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (creditShort) return;
    if (method === 'qr') {
      if (!byQr) return;
      // Už čekající výzvu jen ukázat (jde i s vypnutou QR platbou nebo bez účtu – potvrdit ji lze vždy), jinak vystavit novou.
      qrHandoff.open(pending ? { requestId: pending.id } : { create: { clientId: item.booking.clientId, purpose, bookingId: item.booking.id } });
      onClose();
      return;
    }
    const r =
      item.kind === 'fee'
        ? run(payFee, { bookingId: item.booking.id, method }, { success: `Poplatek ${formatMoney(item.amount)} uhrazen` })
        : run(settleBooking, { bookingId: item.booking.id, method }, { success: `Termín uhrazen (${formatMoney(item.amount)})` });
    if (r.ok) onClose();
  };

  const qrOptions: SegmentedOption<PayMethod>[] = pending ? [{ value: 'qr', label: 'QR platba', icon: 'qr' }] : qrSegment<PayMethod>(qr);

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={item.kind === 'fee' ? 'Uhradit poplatek' : 'Uhradit termín'}
        description={item.label}
        size={qrOptions.length ? 'md' : 'sm'}
        footer={
          <DialogFooter
            onClose={onClose}
            submitLabel={byQr ? (pending ? 'Zobrazit QR platbu' : `Vystavit QR platbu ${formatMoney(item.amount)}`) : `Přijmout ${formatMoney(item.amount)}`}
            formId={formId}
            disabled={creditShort || (method === 'qr' && !byQr)}
          />
        }
      >
        <form id={formId} className="cli-form" onSubmit={submit} noValidate>
          <Field label="Způsob úhrady" hint={!qrUsable ? qr.setupHint ?? undefined : undefined}>
            <Segmented
              aria-label="Způsob úhrady"
              className="cli-paymethods"
              value={method}
              onChange={setMethod}
              options={[...PAY_OPTIONS.map((o) => ({ ...o, disabled: o.value === 'credit' && credit <= 0 })), ...qrOptions]}
            />
          </Field>
          {pending && (
            <Callout tone="info" icon="qr" title="Čeká na QR platbu">
              Výzva VS {pending.vs} na {formatMoney(pending.amount)}, splatnost {formatDateTimeShort(pending.dueAt)}.
              {method === 'qr' ? ' Po připsání platby ji potvrďte tlačítkem „Platba přijata“.' : ' Při úhradě jiným způsobem se QR platba zruší.'}
            </Callout>
          )}
          {byQr && !pending && (
            <p className="cli-hint">Klientovi ukážete QR kód nebo mu pošlete platební údaje e-mailem. Platbu potvrdíte po připsání na účet.</p>
          )}
          {method === 'credit' && (
            <Callout tone={creditShort ? 'danger' : 'neutral'} icon="wallet">
              Na kreditu je {formatMoney(credit)}
              {creditShort ? ' – na úhradu nestačí.' : `, po úhradě zůstane ${formatMoney(credit - item.amount)}.`}
            </Callout>
          )}
        </form>
      </Dialog>
      {qrHandoff.dialog}
    </>
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
