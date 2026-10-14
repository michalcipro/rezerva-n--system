import { useEffect, useMemo, useState } from 'react';
import type { Channel, Client, ClinicState, Id, Message, MessageTemplate } from '../../domain/types';
import { sendManualMessage } from '../../engine/commands';
import { formatDateLong, formatNumber, formatSlot, formatTime, plural } from '../../engine/format';
import { getBooking, getClient, getService } from '../../engine/selectors';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { navigate } from '../../store/session';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  Checkbox,
  DescriptionList,
  Dialog,
  Drawer,
  EmptyState,
  Field,
  Icon,
  IconButton,
  Input,
  Segmented,
  Select,
  Table,
  Textarea,
} from '../../ui';
import { fold, formatWhen, kindLabel, skipAdvice } from './lib';

export interface OutboxFilter {
  q: string;
  channel: 'all' | Channel;
  kind: 'all' | Message['kind'];
  unsentOnly: boolean;
  campaignId: Id | null;
}

export const DEFAULT_OUTBOX_FILTER: OutboxFilter = { q: '', channel: 'all', kind: 'all', unsentOnly: false, campaignId: null };

const PAGE = 50;

function clientLabel(c: Client | undefined): string {
  return c ? `${c.firstName} ${c.lastName}` : 'Bez klienta';
}

function initialsOf(c: Client | undefined): string {
  return c ? (c.firstName.charAt(0) + c.lastName.charAt(0)).toUpperCase() : '?';
}

function StatusBadge({ m }: { m: Message }): JSX.Element {
  return m.status === 'sent' ? (
    <Badge tone="success" dot plain>
      Odesláno
    </Badge>
  ) : (
    <Badge tone="warning" dot="square" plain>
      Neodesláno
    </Badge>
  );
}

function ChannelLabel({ channel }: { channel: Channel }): JSX.Element {
  return (
    <span className="com-chan">
      <Icon name={channel === 'sms' ? 'smartphone' : 'mail'} size={14} />
      {channel === 'sms' ? 'SMS' : 'E-mail'}
    </span>
  );
}

/** Jednořádkové shrnutí zprávy: předmět e-mailu, nebo začátek SMS. */
function summaryOf(m: Message): string {
  if (m.subject) return m.subject;
  return m.body.replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ */
/* Detail zprávy                                                       */
/* ------------------------------------------------------------------ */

function MessageDrawer({
  message,
  onClose,
  onOpenCampaign,
  onReply,
}: {
  message: Message | null;
  onClose: () => void;
  onOpenCampaign: (id: Id) => void;
  onReply: (clientId: Id) => void;
}): JSX.Element {
  const clinic = useClinic();
  const m = message;
  const client = m?.clientId ? getClient(clinic, m.clientId) : undefined;
  const booking = m?.bookingId ? getBooking(clinic, m.bookingId) : undefined;
  const campaign = m?.campaignId ? clinic.campaigns.find((c) => c.id === m.campaignId) : undefined;

  return (
    <Drawer
      open={!!m}
      onClose={onClose}
      size="md"
      title="Detail zprávy"
      footer={
        m && client ? (
          <>
            <Button
              icon="user"
              onClick={() => {
                onClose();
                navigate({ name: 'klient', clientId: client.id });
              }}
            >
              Otevřít klienta
            </Button>
            <Button
              variant="primary"
              icon="send"
              onClick={() => {
                onClose();
                onReply(client.id);
              }}
            >
              Napsat klientovi
            </Button>
          </>
        ) : undefined
      }
    >
      {m && (
        <div className="com-msg">
          {m.status === 'sent' ? (
            <Callout tone="success" title="Odesláno (simulace)">
              {formatDateLong(m.at, { capital: true })} v {formatTime(m.at)}. V ostrém provozu by zprávu doručila{' '}
              {m.channel === 'sms' ? 'SMS brána' : 'e-mailová služba'}.
            </Callout>
          ) : (
            <Callout tone="warning" title="Neodesláno">
              <strong>{m.skipReason ?? 'Důvod nebyl zaznamenán.'}</strong> {skipAdvice(m.skipReason)}
            </Callout>
          )}

          <DescriptionList
            termWidth={96}
            items={[
              {
                term: 'Klient',
                detail: client ? (
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      onClose();
                      navigate({ name: 'klient', clientId: client.id });
                    }}
                  >
                    {clientLabel(client)}
                  </button>
                ) : (
                  '—'
                ),
              },
              { term: 'Kontakt', detail: client ? (m.channel === 'sms' ? client.phone || 'chybí telefon' : client.email || 'chybí e-mail') : '—' },
              { term: 'Kanál', detail: <ChannelLabel channel={m.channel} /> },
              { term: 'Typ', detail: kindLabel(m.kind, clinic.templates) },
              { term: 'Čas', detail: <span className="tnum">{`${formatDateLong(m.at, { capital: true })} ${formatTime(m.at)}`}</span> },
              ...(booking
                ? [
                    {
                      term: 'Rezervace',
                      detail: `${getService(clinic, booking.serviceId)?.name ?? 'Služba'} · ${formatSlot(booking.start, booking.end)}`,
                    },
                  ]
                : []),
              ...(campaign || m.campaignId
                ? [
                    {
                      term: 'Kampaň',
                      detail: campaign ? (
                        <button
                          type="button"
                          className="link"
                          onClick={() => {
                            onClose();
                            onOpenCampaign(campaign.id);
                          }}
                        >
                          {campaign.name}
                        </button>
                      ) : (
                        'smazaná kampaň'
                      ),
                    },
                  ]
                : []),
            ]}
          />

          <div className={m.channel === 'sms' ? 'com-msg__body com-msg__body--sms' : 'com-msg__body'}>
            {m.subject && <p className="com-msg__subject">{m.subject}</p>}
            <p className="com-msg__text">{m.body}</p>
          </div>
        </div>
      )}
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Ruční zpráva                                                        */
/* ------------------------------------------------------------------ */

function ClientPicker({ clinic, value, onChange }: { clinic: ClinicState; value: Client | undefined; onChange: (id: Id | null) => void }): JSX.Element {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const term = fold(q.trim());
    if (term.length < 2) return [];
    const digits = q.replace(/\D/g, '');
    return clinic.clients
      .filter(
        (c) =>
          fold(`${c.firstName} ${c.lastName}`).includes(term) ||
          fold(`${c.lastName} ${c.firstName}`).includes(term) ||
          c.email.toLowerCase().includes(term) ||
          (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits)),
      )
      .slice(0, 6);
  }, [q, clinic.clients]);

  if (value) {
    return (
      <div className="com-picked">
        <Avatar initials={initialsOf(value)} size="sm" tone="slate" />
        <span className="com-picked__text">
          <span className="com-picked__name">{clientLabel(value)}</span>
          <span className="com-picked__meta">{[value.email, value.phone].filter(Boolean).join(' · ')}</span>
        </span>
        <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
          Změnit
        </Button>
      </div>
    );
  }
  return (
    <div className="com-picker">
      <Field label="Klient">
        <Input prefixIcon="search" value={q} placeholder="Jméno, e-mail nebo telefon" autoComplete="off" onValueChange={setQ} data-autofocus="" />
      </Field>
      {q.trim().length >= 2 && (
        <ul className="com-picker__results" aria-label="Nalezení klienti">
          {results.length === 0 && <li className="com-picker__none">Žádný klient neodpovídá „{q}“.</li>}
          {results.map((c) => (
            <li key={c.id}>
              <button type="button" className="com-person" onClick={() => onChange(c.id)}>
                <Avatar initials={initialsOf(c)} size="sm" tone="slate" />
                <span className="com-person__text">
                  <span className="com-person__name">{clientLabel(c)}</span>
                  <span className="com-person__meta">{c.email || c.phone}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ComposeDialog({
  open,
  onClose,
  onSent,
  clientId,
}: {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
  clientId: Id | null;
}): JSX.Element {
  const clinic = useClinic();
  const run = useCommand();
  const [picked, setPicked] = useState<Id | null>(clientId);
  const [channel, setChannel] = useState<Channel>('email');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (open) {
      setPicked(clientId);
      setChannel('email');
      setSubject('');
      setBody('');
    }
  }, [open, clientId]);

  const client = picked ? getClient(clinic, picked) : undefined;
  const canEmail = !!client?.email;
  const canSms = !!client?.phone;
  useEffect(() => {
    if (!client) return;
    if (channel === 'email' && !canEmail && canSms) setChannel('sms');
    if (channel === 'sms' && !canSms && canEmail) setChannel('email');
  }, [client, channel, canEmail, canSms]);

  const ready = !!client && !!body.trim() && (channel === 'email' ? canEmail : canSms);
  const send = (): void => {
    if (!client) return;
    const r = run(
      sendManualMessage,
      { clientId: client.id, channel, subject: channel === 'email' ? subject : '', body },
      { success: `Zpráva odeslána (simulace): ${clientLabel(client)}`, quiet: true },
    );
    if (r.ok) {
      onSent();
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Napsat zprávu klientovi"
      description="Provozní zpráva jednomu klientovi (např. změna termínu, doplnění údajů). Pro obchodní sdělení použijte kampaň."
      footer={
        <>
          <Button onClick={onClose}>Zpět</Button>
          <Button variant="primary" icon="send" disabled={!ready} onClick={send}>
            Odeslat
          </Button>
        </>
      }
    >
      <form
        className="com-compose"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) send();
        }}
      >
        <ClientPicker clinic={clinic} value={client} onChange={setPicked} />
        {client && (
          <>
            <div className="com-compose__channel">
              <span className="field__label" id="com-compose-channel">
                Kanál
              </span>
              <Segmented
                aria-label="Kanál zprávy"
                value={channel}
                onChange={setChannel}
                options={[
                  { value: 'email', label: 'E-mail', icon: 'mail', disabled: !canEmail },
                  { value: 'sms', label: 'SMS', icon: 'smartphone', disabled: !canSms },
                ]}
              />
            </div>
            {channel === 'sms' && !client.consents.sms && (
              <Callout tone="warning" title="Bez souhlasu se SMS">
                Klient nedal souhlas se SMS. Pošlete jen nezbytnou informaci k jeho termínu, nebo raději použijte e-mail.
              </Callout>
            )}
            {channel === 'email' && (
              <Field label="Předmět" optional>
                <Input value={subject} onValueChange={setSubject} placeholder={`Zpráva z kliniky ${clinic.settings.clinicName}`} />
              </Field>
            )}
            <Field label="Text zprávy" hint={channel === 'sms' ? `${formatNumber(body.length)} znaků` : undefined}>
              <Textarea rows={channel === 'sms' ? 4 : 7} value={body} onValueChange={setBody} placeholder={`Dobrý den, ${client.firstName}, …`} />
            </Field>
            <p className="com-compose__sim">
              <Icon name="info" size={14} />
              Simulace: zpráva se reálně neodešle, uloží se do Odeslaných a do komunikace klienta.
            </p>
          </>
        )}
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Záložka Odeslané                                                    */
/* ------------------------------------------------------------------ */

interface OutboxTabProps {
  filter: OutboxFilter;
  onFilterChange: (filter: OutboxFilter) => void;
  composeOpen: boolean;
  composeClientId: Id | null;
  onCompose: (clientId: Id | null) => void;
  onComposeClose: () => void;
  onOpenCampaign: (id: Id) => void;
}

function kindOptions(templates: readonly MessageTemplate[], messages: readonly Message[]): { value: string; label: string }[] {
  const present = new Set(messages.map((m) => m.kind));
  const opts = [
    { value: 'all', label: 'Všechny typy' },
    { value: 'campaign', label: 'Kampaně' },
    { value: 'manual', label: 'Ruční zprávy' },
  ];
  for (const t of templates) opts.push({ value: t.key, label: present.has(t.key) ? t.name : `${t.name} (žádné)` });
  return opts;
}

export function OutboxTab({ filter, onFilterChange, composeOpen, composeClientId, onCompose, onComposeClose, onOpenCampaign }: OutboxTabProps): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<Id | null>(null);
  const set = (patch: Partial<OutboxFilter>): void => onFilterChange({ ...filter, ...patch });

  useEffect(() => setPage(0), [filter]);

  const all = clinic.messages;
  const list = useMemo(() => {
    const term = fold(filter.q.trim());
    const out: Message[] = [];
    for (const m of all) {
      if (filter.channel !== 'all' && m.channel !== filter.channel) continue;
      if (filter.kind !== 'all' && m.kind !== filter.kind) continue;
      if (filter.unsentOnly && m.status !== 'skipped') continue;
      if (filter.campaignId && m.campaignId !== filter.campaignId) continue;
      if (term) {
        const c = m.clientId ? getClient(clinic, m.clientId) : undefined;
        const hay = fold(`${c ? `${c.firstName} ${c.lastName} ${c.email}` : ''} ${m.subject} ${m.body}`);
        if (!hay.includes(term)) continue;
      }
      out.push(m);
    }
    return out.reverse().sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  }, [all, filter, clinic]);

  const totals = useMemo(() => {
    let skipped = 0;
    let sms = 0;
    for (const m of all) {
      if (m.status === 'skipped') skipped++;
      if (m.channel === 'sms') sms++;
    }
    return { all: all.length, skipped, sms, email: all.length - sms };
  }, [all]);

  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const current = Math.min(page, pages - 1);
  const rows = list.slice(current * PAGE, current * PAGE + PAGE);
  const openMessage = openId ? (all.find((m) => m.id === openId) ?? null) : null;
  const campaign = filter.campaignId ? clinic.campaigns.find((c) => c.id === filter.campaignId) : undefined;
  const filtered = filter.q || filter.channel !== 'all' || filter.kind !== 'all' || filter.unsentOnly || filter.campaignId;

  return (
    <div className="com-outbox">
      <div className="com-outbox__stats statline">
        <span>
          <strong>{formatNumber(totals.all)}</strong> {plural(totals.all, ['zpráva', 'zprávy', 'zpráv'])} celkem
        </span>
        <span>
          <strong>{formatNumber(totals.email)}</strong> {plural(totals.email, ['e-mail', 'e-maily', 'e-mailů'])}
        </span>
        <span>
          <strong>{formatNumber(totals.sms)}</strong> SMS
        </span>
        <span>
          <strong className={totals.skipped ? 'text-warning' : undefined}>{formatNumber(totals.skipped)}</strong> neodesláno
        </span>
        <span className="com-outbox__simnote">Simulace – zprávy se reálně neodesílají.</span>
      </div>

      <Card padding="none" className="com-outbox__card">
        <div className="com-filters" role="search" aria-label="Filtr odeslaných zpráv">
          <Input
            className="com-filters__search"
            prefixIcon="search"
            size="sm"
            placeholder="Hledat klienta, předmět nebo text"
            aria-label="Hledat ve zprávách"
            value={filter.q}
            onValueChange={(q) => set({ q })}
          />
          <Segmented
            size="sm"
            aria-label="Kanál"
            value={filter.channel}
            onChange={(channel) => set({ channel })}
            options={[
              { value: 'all', label: 'Vše' },
              { value: 'email', label: 'E-mail' },
              { value: 'sms', label: 'SMS' },
            ]}
          />
          <Select
            size="sm"
            inline
            aria-label="Typ zprávy"
            value={filter.kind}
            onValueChange={(kind) => set({ kind: kind as OutboxFilter['kind'] })}
            options={kindOptions(clinic.templates, all)}
          />
          <Checkbox label="Jen neodeslané" checked={filter.unsentOnly} onChange={(unsentOnly) => set({ unsentOnly })} />
          {campaign && (
            <span className="com-filters__chip">
              Kampaň: {campaign.name}
              <IconButton size="sm" icon="x" label="Zrušit filtr kampaně" onClick={() => set({ campaignId: null })} />
            </span>
          )}
          {filtered && (
            <Button size="sm" variant="ghost" onClick={() => onFilterChange(DEFAULT_OUTBOX_FILTER)}>
              Zrušit filtry
            </Button>
          )}
        </div>

        {list.length === 0 ? (
          <EmptyState
            icon={filtered ? 'filter' : 'mail'}
            title={filtered ? 'Žádná zpráva neodpovídá filtru' : 'Zatím žádné odeslané zprávy'}
            text={
              filtered
                ? 'Zkuste upravit hledání nebo zrušit filtry.'
                : 'Potvrzení rezervací, připomínky i kampaně se tu objeví hned, jak je systém odešle.'
            }
            action={
              filtered ? (
                <Button onClick={() => onFilterChange(DEFAULT_OUTBOX_FILTER)}>Zrušit filtry</Button>
              ) : (
                <Button variant="primary" icon="send" onClick={() => onCompose(null)}>
                  Napsat zprávu
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="com-outbox__table">
              <Table hover caption="Odeslané zprávy, novější nahoře" minWidth={760}>
                <thead>
                  <tr>
                    <th scope="col">Čas</th>
                    <th scope="col">Klient</th>
                    <th scope="col">Kanál</th>
                    <th scope="col">Typ</th>
                    <th scope="col">Předmět / text</th>
                    <th scope="col">Stav</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => {
                    const c = m.clientId ? getClient(clinic, m.clientId) : undefined;
                    return (
                      <tr key={m.id} data-clickable="" onClick={() => setOpenId(m.id)}>
                        <td className="nowrap tnum com-cell-time">{formatWhen(m.at, now)}</td>
                        <td className="com-cell-client">
                          <span className="truncate">{clientLabel(c)}</span>
                        </td>
                        <td className="nowrap">
                          <ChannelLabel channel={m.channel} />
                        </td>
                        <td className="com-cell-kind">
                          <span className="truncate">{kindLabel(m.kind, clinic.templates)}</span>
                        </td>
                        <td className="com-cell-subject">
                          <button
                            type="button"
                            className="com-rowbtn"
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpenId(m.id);
                            }}
                          >
                            <span className="truncate">{summaryOf(m)}</span>
                          </button>
                        </td>
                        <td className="com-cell-status">
                          <StatusBadge m={m} />
                          {m.status === 'skipped' && m.skipReason && <span className="com-cell-reason truncate">{m.skipReason}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>

            <ul className="com-outbox__list" aria-label="Odeslané zprávy, novější nahoře">
              {rows.map((m) => {
                const c = m.clientId ? getClient(clinic, m.clientId) : undefined;
                return (
                  <li key={m.id}>
                    <button type="button" className="com-mrow" onClick={() => setOpenId(m.id)}>
                      <span className="com-mrow__top">
                        <Icon name={m.channel === 'sms' ? 'smartphone' : 'mail'} size={14} />
                        <span className="com-mrow__client truncate">{clientLabel(c)}</span>
                        <span className="com-mrow__time tnum">{formatWhen(m.at, now)}</span>
                      </span>
                      <span className="com-mrow__subject">{summaryOf(m)}</span>
                      <span className="com-mrow__meta">
                        <StatusBadge m={m} />
                        <span className="truncate">{m.status === 'skipped' ? m.skipReason : kindLabel(m.kind, clinic.templates)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="com-pager">
              <span className="com-pager__info tnum">
                {formatNumber(current * PAGE + 1)}–{formatNumber(current * PAGE + rows.length)} z {formatNumber(list.length)}
              </span>
              <IconButton icon="chevronLeft" label="Novější zprávy" variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)} />
              <IconButton
                icon="chevronRight"
                label="Starší zprávy"
                variant="outline"
                size="sm"
                disabled={current >= pages - 1}
                onClick={() => setPage(current + 1)}
              />
            </div>
          </>
        )}
      </Card>

      <MessageDrawer message={openMessage} onClose={() => setOpenId(null)} onOpenCampaign={onOpenCampaign} onReply={(id) => onCompose(id)} />
      <ComposeDialog
        open={composeOpen}
        onClose={onComposeClose}
        clientId={composeClientId}
        onSent={() => {
          if (filtered) onFilterChange(DEFAULT_OUTBOX_FILTER);
        }}
      />
    </div>
  );
}
