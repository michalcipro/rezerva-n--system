import { useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Client, Id, LocalDate, LocalDateTime } from '../../domain/types';
import { availableSlots, nextAvailableDate, type Slot, type SlotCheck } from '../../engine/availability';
import { createClient } from '../../engine/commands';
import { countLabel, formatDayShort, formatMoney, formatTime, formatTimeRange } from '../../engine/format';
import {
  activePackages,
  clientCredit,
  clientName,
  getClient,
  getRoom,
  getService,
  getSession,
  getTherapist,
  isNewClient,
  openMakeups,
  sessionsOnDate,
  therapistInitials,
  therapistName,
} from '../../engine/selectors';
import { addDays, combine, dateOf, minutesOf, timeOf } from '../../engine/time';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Checkbox,
  ChoiceChips,
  EmptyState,
  Field,
  Icon,
  IconButton,
  Input,
  RadioCards,
  cx,
} from '../../ui';
import { PHONE_QUERY, useMediaQuery } from './hooks';
import { freeSpotsLabel, searchClients, serviceOptionLabel, type ServiceGroup } from './model';

/* ------------------------------------------------------------------ */
/* Výběr služby (nativní select se skupinami podle kategorií)          */
/* ------------------------------------------------------------------ */

export interface ServiceSelectProps {
  groups: ServiceGroup[];
  value: Id;
  onChange: (id: Id) => void;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  disabled?: boolean;
}

export function ServiceSelect({ groups, value, onChange, id, disabled, ...aria }: ServiceSelectProps): JSX.Element {
  return (
    <div className={cx('control', 'control--select', disabled && 'control--disabled')}>
      <select
        id={id}
        className="control__input control__select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={aria['aria-describedby']}
        aria-invalid={aria['aria-invalid'] || undefined}
      >
        {!value && (
          <option value="" disabled>
            Vyberte službu
          </option>
        )}
        {groups.map((g) => (
          <optgroup key={g.id} label={g.name}>
            {g.services.map((svc) => (
              <option key={svc.id} value={svc.id}>
                {serviceOptionLabel(svc, formatMoney(svc.priceCzk))}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <Icon name="chevronDown" size={16} className="control__chevron" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Klient: vyhledávání + rychlé založení                               */
/* ------------------------------------------------------------------ */

export function ClientSummaryCard({ client, onChange }: { client: Client; onChange?: () => void }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const today = dateOf(now);
  const credit = clientCredit(clinic, client.id);
  const packages = activePackages(clinic, client.id, today);
  const makeups = openMakeups(clinic, client.id, now);
  const fresh = isNewClient(clinic, client.id);
  return (
    <div className="cal-client">
      <Avatar initials={(client.firstName.charAt(0) + client.lastName.charAt(0)).toUpperCase()} tone="slate" size="md" />
      <div className="cal-client__main">
        <span className="cal-client__name">{clientName(client)}</span>
        <span className="cal-client__meta">{[client.phone, client.email].filter(Boolean).join(' · ') || 'bez kontaktu'}</span>
        <span className="cal-client__badges">
          {fresh && <Badge tone="accent">Nový klient</Badge>}
          {packages.map((p) => (
            <Badge key={p.id} tone="teal" icon="ticket">
              {p.name}
            </Badge>
          ))}
          {credit > 0 && (
            <Badge tone="neutral" icon="wallet">
              kredit {formatMoney(credit)}
            </Badge>
          )}
          {makeups.length > 0 && (
            <Badge tone="info" icon="repeat">
              {countLabel(makeups.length, ['náhrada', 'náhrady', 'náhrad'])}
            </Badge>
          )}
          {client.blocked && (
            <Badge tone="danger" icon="ban">
              online rezervace zablokované
            </Badge>
          )}
        </span>
      </div>
      {onChange && (
        <Button variant="ghost" size="sm" onClick={onChange}>
          Změnit
        </Button>
      )}
    </div>
  );
}

export interface ClientPickerProps {
  clientId: Id | null;
  onChange: (id: Id | null) => void;
  /** Klienta nelze změnit (např. přesun nebo náhrada). */
  locked?: boolean;
}

export function ClientPicker({ clientId, onChange, locked }: ClientPickerProps): JSX.Element {
  const clinic = useClinic();
  const run = useCommand();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchClients(clinic, query, 7), [clinic, query]);
  const client = clientId ? getClient(clinic, clientId) : undefined;

  if (client) return <ClientSummaryCard client={client} onChange={locked ? undefined : () => onChange(null)} />;

  if (creating) {
    const [first, ...rest] = query.trim().split(/\s+/);
    return (
      <QuickClientForm
        initialFirst={first && /\D/.test(first) && !first.includes('@') ? first : ''}
        initialLast={rest.join(' ')}
        onCancel={() => setCreating(false)}
        onCreate={(input) => {
          const r = run(createClient, input, { success: 'Klient založen' });
          if (r.ok) {
            setCreating(false);
            onChange(r.value);
          }
        }}
      />
    );
  }

  const focusResult = (index: number): void => {
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('button');
    if (!buttons || !buttons.length) return;
    const i = Math.max(0, Math.min(buttons.length - 1, index));
    buttons[i].focus();
  };

  const onListKey = (e: ReactKeyboardEvent<HTMLUListElement>): void => {
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusResult(i + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (i <= 0) inputRef.current?.focus();
      else focusResult(i - 1);
    }
  };

  const trimmed = query.trim();
  return (
    <div className="cal-picker">
      <div className="cal-picker__row">
        <Field label="Vyhledat klienta" className="cal-grow">
          <Input
            ref={inputRef}
            prefixIcon="search"
            placeholder="Jméno, e-mail nebo telefon"
            value={query}
            autoComplete="off"
            onValueChange={setQuery}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                focusResult(0);
              } else if (e.key === 'Enter' && results[0]) {
                e.preventDefault();
                onChange(results[0].id);
              }
            }}
          />
        </Field>
        <Button variant="secondary" icon="userPlus" className="cal-picker__new" onClick={() => setCreating(true)}>
          Nový klient
        </Button>
      </div>
      {trimmed.length >= 2 && (
        <ul ref={listRef} className="cal-results" aria-label="Nalezení klienti" onKeyDown={onListKey}>
          {results.length === 0 && (
            <li className="cal-results__empty">
              Nikdo neodpovídá „{trimmed}“.{' '}
              <button type="button" className="link" onClick={() => setCreating(true)}>
                Založit nového klienta
              </button>
            </li>
          )}
          {results.map((c) => (
            <li key={c.id}>
              <button type="button" className="cal-results__item" onClick={() => onChange(c.id)}>
                <Avatar initials={(c.firstName.charAt(0) + c.lastName.charAt(0)).toUpperCase()} tone="slate" size="sm" />
                <span className="cal-results__text">
                  <span className="cal-results__name">{clientName(c)}</span>
                  <span className="cal-results__meta">{[c.phone, c.email].filter(Boolean).join(' · ')}</span>
                </span>
                {c.blocked && (
                  <Badge tone="danger" size="sm">
                    blokace
                  </Badge>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {trimmed.length < 2 && <p className="cal-hint">Napište alespoň dvě písmena jména, část e-mailu nebo telefonu.</p>}
    </div>
  );
}

interface QuickClientInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  consents: { gdpr: boolean; health: boolean; marketingEmail: boolean; sms: boolean };
}

function QuickClientForm({
  initialFirst,
  initialLast,
  onCancel,
  onCreate,
}: {
  initialFirst: string;
  initialLast: string;
  onCancel: () => void;
  onCreate: (input: QuickClientInput) => void;
}): JSX.Element {
  const [firstName, setFirstName] = useState(initialFirst);
  const [lastName, setLastName] = useState(initialLast);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [gdpr, setGdpr] = useState(false);
  const [health, setHealth] = useState(false);
  const [marketingEmail, setMarketingEmail] = useState(false);
  const [sms, setSms] = useState(false);
  const [tried, setTried] = useState(false);
  const missingName = !firstName.trim() || !lastName.trim();
  const missingContact = !email.trim() && !phone.trim();
  const valid = !missingName && !missingContact && gdpr;

  return (
    <div className="cal-quick" role="group" aria-label="Nový klient">
      <div className="cal-quick__head">
        <span className="eyebrow">Nový klient</span>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Zpět na hledání
        </Button>
      </div>
      <div className="cal-grid2">
        <Field label="Jméno" error={tried && !firstName.trim() ? 'Vyplňte jméno.' : undefined}>
          <Input value={firstName} onValueChange={setFirstName} autoComplete="off" data-autofocus="" />
        </Field>
        <Field label="Příjmení" error={tried && !lastName.trim() ? 'Vyplňte příjmení.' : undefined}>
          <Input value={lastName} onValueChange={setLastName} autoComplete="off" />
        </Field>
        <Field label="E-mail" error={tried && missingContact ? 'Vyplňte e-mail nebo telefon.' : undefined}>
          <Input type="email" value={email} onValueChange={setEmail} autoComplete="off" inputMode="email" />
        </Field>
        <Field label="Telefon">
          <Input type="tel" value={phone} onValueChange={setPhone} autoComplete="off" inputMode="tel" prefix="+420" />
        </Field>
      </div>
      <div className="cal-quick__consents">
        <Checkbox
          checked={gdpr}
          onChange={setGdpr}
          label="Souhlas se zpracováním osobních údajů (povinný)"
          description={tried && !gdpr ? 'Bez souhlasu nelze klienta založit.' : 'Údaje nutné pro rezervace a připomínky.'}
        />
        <Checkbox checked={health} onChange={setHealth} label="Souhlas s vedením zdravotní dokumentace" />
        <Checkbox checked={marketingEmail} onChange={setMarketingEmail} label="Obchodní sdělení e-mailem" />
        <Checkbox checked={sms} onChange={setSms} label="SMS zprávy (připomínky termínů)" />
      </div>
      <div className="cal-quick__actions">
        <Button
          variant="primary"
          icon="userPlus"
          onClick={() => {
            setTried(true);
            if (!valid) return;
            onCreate({
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              email: email.trim(),
              phone: phone.trim() ? (phone.trim().startsWith('+') ? phone.trim() : '+420 ' + phone.trim()) : '',
              consents: { gdpr, health, marketingEmail, sms },
            });
          }}
        >
          Založit klienta
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Volné časy po 15 minutách                                           */
/* ------------------------------------------------------------------ */

const DAY_PARTS: { label: string; from: number; to: number }[] = [
  { label: 'Dopoledne', from: 0, to: 12 * 60 },
  { label: 'Odpoledne', from: 12 * 60, to: 17 * 60 },
  { label: 'Večer', from: 17 * 60, to: 24 * 60 },
];

export interface SlotPickerProps {
  serviceId: Id;
  therapistId: Id | 'any';
  date: LocalDate;
  onDateChange: (date: LocalDate) => void;
  value: LocalDateTime | null;
  valueTherapistId?: Id | null;
  onChange: (start: LocalDateTime | null, therapistId: Id | null) => void;
  clientId?: Id | null;
  ignoreBookingId?: Id;
  manual: boolean;
  onManualChange: (manual: boolean) => void;
}

export function DateStepper({ date, onChange, label = 'Datum' }: { date: LocalDate; onChange: (d: LocalDate) => void; label?: string }): JSX.Element {
  return (
    <Field label={label}>
      <div className="cal-datestep">
        <IconButton icon="chevronLeft" label="Předchozí den" variant="secondary" onClick={() => onChange(addDays(date, -1))} />
        <Input
          type="date"
          value={date}
          aria-label={label}
          onValueChange={(v) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(v)) onChange(v);
          }}
          className="cal-datestep__input"
        />
        <IconButton icon="chevronRight" label="Následující den" variant="secondary" onClick={() => onChange(addDays(date, 1))} />
        <span className="cal-datestep__day">{formatDayShort(date)}</span>
      </div>
    </Field>
  );
}

export function SlotPicker({
  serviceId,
  therapistId,
  date,
  onDateChange,
  value,
  valueTherapistId,
  onChange,
  clientId,
  ignoreBookingId,
  manual,
  onManualChange,
}: SlotPickerProps): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const today = dateOf(now);
  const slots: Slot[] = useMemo(() => {
    if (!serviceId) return [];
    const list = availableSlots(clinic, {
      serviceId,
      therapistId,
      date,
      now,
      mode: 'staff',
      clientId: clientId ?? undefined,
      ignoreBookingId,
    });
    return date === today ? list.filter((sl) => sl.start >= now) : list;
  }, [clinic, serviceId, therapistId, date, now, clientId, ignoreBookingId, today]);

  const nextDate = useMemo(() => {
    if (slots.length || !serviceId) return null;
    return nextAvailableDate(clinic, {
      serviceId,
      therapistId,
      now,
      mode: 'staff',
      clientId: clientId ?? undefined,
      ignoreBookingId,
      fromDate: addDays(date < today ? today : date, date < today ? 0 : 1),
      maxDays: 60,
    });
  }, [clinic, slots.length, serviceId, therapistId, now, clientId, ignoreBookingId, date, today]);

  const keyOf = (sl: Slot): string => sl.start + '|' + (therapistId === 'any' ? sl.therapistId : '');
  const selectedKey = value ? value + '|' + (therapistId === 'any' ? valueTherapistId ?? '' : '') : null;

  return (
    <div className="cal-slots">
      <DateStepper
        date={date}
        onChange={(d) => {
          onDateChange(d);
        }}
      />
      {!manual ? (
        <>
          {slots.length === 0 ? (
            <EmptyState
              compact
              icon="calendarX"
              title={date < today ? 'V minulosti se volné časy nenabízejí' : 'Tento den nejsou volné časy'}
              text={nextDate ? `Nejbližší volný den: ${formatDayShort(nextDate)}.` : 'V příštích 60 dnech není volný termín. Zkuste jiného terapeuta.'}
              action={
                <div className="cal-row">
                  {nextDate && (
                    <Button size="sm" variant="secondary" icon="calendar" onClick={() => onDateChange(nextDate)}>
                      Přejít na {formatDayShort(nextDate)}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon="clock" onClick={() => onManualChange(true)}>
                    Zadat čas ručně
                  </Button>
                </div>
              }
            />
          ) : (
            <div className="cal-slots__groups">
              {DAY_PARTS.map((part) => {
                const list = slots.filter((sl) => {
                  const m = minutesOf(sl.start);
                  return m >= part.from && m < part.to;
                });
                if (!list.length) return null;
                return (
                  <div key={part.label} className="cal-slots__group">
                    <span className="cal-slots__label">
                      {part.label} <span className="cal-slots__count">{list.length}</span>
                    </span>
                    <ChoiceChips
                      aria-label={`Volné časy – ${part.label.toLowerCase()}`}
                      shape="tile"
                      columns={isPhone ? 4 : 7}
                      value={selectedKey}
                      onChange={(key) => {
                        const sl = list.find((x) => keyOf(x) === key);
                        if (sl) onChange(sl.start, sl.therapistId);
                      }}
                      options={list.map((sl) => {
                        const t = getTherapist(clinic, sl.therapistId);
                        return {
                          value: keyOf(sl),
                          label:
                            therapistId === 'any' ? (
                              <span className="cal-chip">
                                {formatTime(sl.start)}
                                <span className="cal-chip__sub">{therapistInitials(t)}</span>
                              </span>
                            ) : (
                              formatTime(sl.start)
                            ),
                          ariaLabel: `${formatTimeRange(sl.start, sl.end)}${therapistId === 'any' ? ', ' + therapistName(t) : ''}`,
                        };
                      })}
                    />
                  </div>
                );
              })}
            </div>
          )}
          {slots.length > 0 && (
            <button type="button" className="link cal-slots__toggle" onClick={() => onManualChange(true)}>
              Zadat jiný čas ručně
            </button>
          )}
        </>
      ) : (
        <div className="cal-manual">
          {therapistId === 'any' ? (
            <Callout tone="info" title="Ruční čas">
              Pro ruční zadání času vyberte konkrétního terapeuta.
            </Callout>
          ) : (
            <Field label="Začátek" hint="Po 15 minutách. Mimo volné časy uvidíte upozornění.">
              <Input
                type="time"
                step={900}
                value={value ? timeOf(value) : ''}
                onValueChange={(v) => onChange(/^\d{2}:\d{2}$/.test(v) ? combine(date, v) : null, therapistId)}
                className="cal-manual__input"
              />
            </Field>
          )}
          <button type="button" className="link cal-slots__toggle" onClick={() => onManualChange(false)}>
            Vybrat z volných časů
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Skupinové lekce                                                     */
/* ------------------------------------------------------------------ */

export interface SessionPickerProps {
  serviceId: Id;
  date: LocalDate;
  onDateChange: (date: LocalDate) => void;
  value: Id | null;
  onChange: (sessionId: Id) => void;
  clientId?: Id | null;
  excludeSessionId?: Id;
  onWaitlist?: (sessionId: Id) => void;
}

export function SessionPicker({ serviceId, date, onDateChange, value, onChange, clientId, excludeSessionId, onWaitlist }: SessionPickerProps): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const svc = getService(clinic, serviceId);
  const slots = useMemo(
    () =>
      availableSlots(clinic, { serviceId, therapistId: 'any', date, now, mode: 'staff', clientId: clientId ?? undefined }).filter(
        (sl) => sl.end > now && sl.sessionId !== excludeSessionId,
      ),
    [clinic, serviceId, date, now, clientId, excludeSessionId],
  );
  const upcoming = useMemo(() => {
    const out: { id: Id; start: LocalDateTime; free: number }[] = [];
    for (let i = 0; i < 28 && out.length < 6; i++) {
      const d = addDays(dateOf(now), i);
      if (d === date) continue;
      for (const ses of sessionsOnDate(clinic, d)) {
        if (ses.serviceId !== serviceId || ses.cancelled || ses.end <= now || ses.id === excludeSessionId) continue;
        const sl = availableSlots(clinic, { serviceId, therapistId: 'any', date: d, now, mode: 'staff', clientId: clientId ?? undefined }).find((x) => x.sessionId === ses.id);
        if (!sl) continue;
        out.push({ id: ses.id, start: ses.start, free: sl.freeSpots ?? 0 });
      }
    }
    return out.slice(0, 6);
  }, [clinic, serviceId, now, date, clientId, excludeSessionId]);

  const full = slots.filter((sl) => (sl.freeSpots ?? 0) <= 0);

  return (
    <div className="cal-slots">
      <DateStepper date={date} onChange={onDateChange} />
      {slots.length === 0 ? (
        <EmptyState compact icon="calendarX" title="Tento den lekce není" text={`${svc?.name ?? 'Lekce'} se tento den nekoná nebo je klient už přihlášený.`} />
      ) : (
        <RadioCards
          aria-label="Termín lekce"
          value={value}
          onChange={onChange}
          options={slots.map((sl) => {
            const ses = sl.sessionId ? getSession(clinic, sl.sessionId) : undefined;
            const t = getTherapist(clinic, sl.therapistId);
            const room = ses ? getRoom(clinic, ses.roomId) : undefined;
            const free = sl.freeSpots ?? 0;
            return {
              value: sl.sessionId ?? sl.start,
              title: `${ses?.title ?? svc?.name ?? 'Lekce'} · ${formatTimeRange(sl.start, sl.end)}`,
              description: [therapistName(t), room?.name].filter(Boolean).join(' · '),
              aside: (
                <span className={cx('cal-spots', free <= 0 && 'is-full')}>
                  {free <= 0 ? `plno ${sl.capacity}/${sl.capacity}` : freeSpotsLabel(free)}
                </span>
              ),
              disabled: free <= 0,
            };
          })}
        />
      )}
      {full.length > 0 && onWaitlist && (
        <div className="cal-fullnote">
          {full.map((sl) => {
            const ses = sl.sessionId ? getSession(clinic, sl.sessionId) : undefined;
            return (
              <Callout
                key={sl.sessionId}
                tone="warning"
                title="Lekce je plná"
                actions={
                  <Button size="sm" variant="secondary" icon="hourglass" disabled={!clientId} onClick={() => sl.sessionId && onWaitlist(sl.sessionId)}>
                    Přidat na čekací listinu
                  </Button>
                }
              >
                {ses?.title ?? 'Lekce'} {formatTimeRange(sl.start, sl.end)} – při odhlášení někoho se místo automaticky nabídne čekajícím.
                {!clientId && ' Nejprve vyberte klienta.'}
              </Callout>
            );
          })}
        </div>
      )}
      {upcoming.length > 0 && (
        <div className="cal-slots__group">
          <span className="cal-slots__label">Další termíny lekce</span>
          <div className="cal-row">
            {upcoming.map((u) => (
              <button
                key={u.id}
                type="button"
                className="cal-pill"
                onClick={() => {
                  onDateChange(dateOf(u.start));
                  if (u.free > 0) onChange(u.id);
                }}
              >
                <span className="tnum">
                  {formatDayShort(u.start)} {formatTime(u.start)}
                </span>
                <span className={cx('cal-pill__sub', u.free <= 0 && 'is-full')}>{u.free > 0 ? freeSpotsLabel(u.free) : 'plno'}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Výsledek kontroly termínu                                           */
/* ------------------------------------------------------------------ */

export function SlotCheckNotice({
  check,
  override,
  onOverride,
  overrideLabel = 'Vytvořit i přesto',
  pending,
}: {
  check: SlotCheck | null;
  override: boolean;
  onOverride: (v: boolean) => void;
  overrideLabel?: string;
  /** Text, když kontrolu zatím nelze provést (např. chybí klient). */
  pending?: string;
}): JSX.Element | null {
  if (!check) return pending ? <p className="cal-hint">{pending}</p> : null;
  if (check.errors.length)
    return (
      <Callout tone="danger" title="Termín nelze použít">
        <ul className="cal-msgs">
          {check.errors.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </Callout>
    );
  if (check.warnings.length)
    return (
      <Callout tone="warning" title="Upozornění" icon="alert">
        <ul className="cal-msgs">
          {check.warnings.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        <div className="cal-override">
          <Checkbox checked={override} onChange={onOverride} label={overrideLabel} description="Vědomě přecházím upozornění (personál)." />
        </div>
      </Callout>
    );
  return (
    <p className="cal-okline">
      <Icon name="checkCircle" size={16} />
      Termín je volný a odpovídá pravidlům.
    </p>
  );
}
