import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { Client, Id } from '../../domain/types';
import { createClient, updateClient } from '../../engine/commands';
import { stagesSorted } from '../../engine/crm';
import { clientName } from '../../engine/selectors';
import { dateOf } from '../../engine/time';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { navigate } from '../../store/session';
import { Button, Callout, Checkbox, Dialog, Field, Input, Select, Textarea } from '../../ui';
import { allTags, digitsOf, normalize, SOURCE_LABEL } from './model';
import { CONSENT_META, TagInput } from './parts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** „777123456“ → „+420 777 123 456“; jiné tvary nechá, jak jsou. */
export function prettyPhone(raw: string): string {
  const d = digitsOf(raw);
  const local = d.length === 9 ? d : d.length === 12 && d.startsWith('420') ? d.slice(3) : null;
  if (!local || (raw.trim().startsWith('+') && !raw.trim().startsWith('+420'))) return raw.trim();
  return `+420 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

interface ContactDraft {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: string;
  tags: string[];
  source: Client['source'];
  internalNote: string;
}

type Errors = Partial<Record<'firstName' | 'lastName' | 'email' | 'phone' | 'birthDate' | 'gdpr', string>>;

function validate(d: ContactDraft, today: string): Errors {
  const e: Errors = {};
  if (!d.firstName.trim()) e.firstName = 'Vyplňte jméno.';
  if (!d.lastName.trim()) e.lastName = 'Vyplňte příjmení.';
  const email = d.email.trim();
  if (email && !EMAIL_RE.test(email)) e.email = 'E-mail nemá platný tvar, např. jana.novakova@email.cz.';
  if (!email && !d.phone.trim()) e.phone = 'Vyplňte e-mail nebo telefon, ať se klientovi můžeme ozvat.';
  if (d.phone.trim() && digitsOf(d.phone).length < 9) e.phone = 'Telefon má málo číslic.';
  if (d.birthDate && (d.birthDate > today || d.birthDate < '1900-01-01')) e.birthDate = 'Zkontrolujte datum narození.';
  return e;
}

function ContactFields({
  draft,
  set,
  errors,
  tagSuggestions,
  today,
  extra,
}: {
  draft: ContactDraft;
  set: (patch: Partial<ContactDraft>) => void;
  errors: Errors;
  tagSuggestions: string[];
  today: string;
  /** Další pole v mřížce (např. fáze spolupráce u nového klienta). */
  extra?: ReactNode;
}): JSX.Element {
  return (
    <>
      <div className="cli-form-grid">
        <Field label="Jméno" error={errors.firstName}>
          <Input value={draft.firstName} onValueChange={(v) => set({ firstName: v })} autoComplete="given-name" required />
        </Field>
        <Field label="Příjmení" error={errors.lastName}>
          <Input value={draft.lastName} onValueChange={(v) => set({ lastName: v })} autoComplete="family-name" required />
        </Field>
        <Field label="E-mail" error={errors.email} optional={!!draft.phone.trim()}>
          <Input type="email" inputMode="email" value={draft.email} onValueChange={(v) => set({ email: v })} autoComplete="email" prefixIcon="mail" />
        </Field>
        <Field label="Telefon" error={errors.phone} optional={!!draft.email.trim()}>
          <Input
            type="tel"
            inputMode="tel"
            value={draft.phone}
            onValueChange={(v) => set({ phone: v })}
            onBlur={() => set({ phone: prettyPhone(draft.phone) })}
            autoComplete="tel"
            prefixIcon="phone"
          />
        </Field>
        <Field label="Datum narození" optional error={errors.birthDate}>
          <Input type="date" value={draft.birthDate} max={today} onValueChange={(v) => set({ birthDate: v })} />
        </Field>
        <Field label="Odkud klient přišel">
          <Select
            value={draft.source}
            onValueChange={(v) => set({ source: v as Client['source'] })}
            options={(Object.keys(SOURCE_LABEL) as Client['source'][]).map((k) => ({ value: k, label: SOURCE_LABEL[k] }))}
          />
        </Field>
        {extra}
      </div>
      <Field label="Štítky" optional hint="Zaměření, preference nebo omezení – Enter přidá štítek.">
        <TagInput value={draft.tags} onChange={(tags) => set({ tags })} suggestions={tagSuggestions} />
      </Field>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Nový klient                                                         */
/* ------------------------------------------------------------------ */

const EMPTY: ContactDraft = { firstName: '', lastName: '', email: '', phone: '', birthDate: '', tags: [], source: 'recepce', internalNote: '' };

export function NewClientDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (id: Id) => void }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const formId = useId();
  const today = dateOf(now);
  const [draft, setDraft] = useState<ContactDraft>(EMPTY);
  const [consents, setConsents] = useState({ gdpr: false, health: false, marketingEmail: false, sms: false });
  const [tried, setTried] = useState(false);
  const tagSuggestions = useMemo(() => allTags(clinic), [clinic]);
  const stages = stagesSorted(clinic);
  const [stageId, setStageId] = useState<string>(stages[0]?.id ?? '');

  useEffect(() => {
    if (open) {
      setDraft(EMPTY);
      setConsents({ gdpr: false, health: false, marketingEmail: false, sms: false });
      setStageId(stagesSorted(clinic)[0]?.id ?? '');
      setTried(false);
    }
  }, [open]);

  const errors: Errors = validate(draft, today);
  if (!consents.gdpr) errors.gdpr = 'Bez souhlasu se zpracováním osobních údajů nelze kartu klienta založit.';
  const shown: Errors = tried ? errors : {};

  // Možné duplicity: stejný e-mail, telefon nebo jméno.
  const dupes = useMemo(() => {
    const email = draft.email.trim().toLowerCase();
    const phone = digitsOf(draft.phone);
    const name = normalize(draft.firstName + ' ' + draft.lastName);
    if (!email && phone.length < 9 && name.length < 5) return [];
    return clinic.clients
      .filter(
        (c) =>
          (email && c.email === email) ||
          (phone.length >= 9 && digitsOf(c.phone).endsWith(phone.slice(-9))) ||
          (draft.firstName.trim() && draft.lastName.trim() && normalize(c.firstName + ' ' + c.lastName) === name),
      )
      .slice(0, 3);
  }, [clinic.clients, draft.email, draft.phone, draft.firstName, draft.lastName]);

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(errors).length) return;
    const name = `${draft.firstName.trim()} ${draft.lastName.trim()}`;
    const r = run(
      createClient,
      {
        firstName: draft.firstName,
        lastName: draft.lastName,
        email: draft.email,
        phone: prettyPhone(draft.phone),
        birthDate: draft.birthDate || null,
        tags: draft.tags,
        source: draft.source,
        consents,
        internalNote: draft.internalNote.trim(),
        stageId: stages.some((st) => st.id === stageId) ? stageId : undefined,
      },
      { success: `Založena karta klienta ${name}` },
    );
    if (r.ok) {
      onClose();
      onCreated?.(r.value);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nový klient"
      description="Kontakt stačí jeden – e-mail nebo telefon. Souhlas se zpracováním údajů je povinný."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Zpět
          </Button>
          <Button variant="primary" type="submit" form={formId} icon="userPlus">
            Založit klienta
          </Button>
        </>
      }
    >
      <form id={formId} className="cli-form" onSubmit={submit} noValidate>
        <ContactFields
          draft={draft}
          set={(p) => setDraft((d) => ({ ...d, ...p }))}
          errors={shown}
          tagSuggestions={tagSuggestions}
          today={today}
          extra={
            stages.length > 0 ? (
              <Field label="Fáze spolupráce" hint="Kde ve spolupráci klient právě je – později ji změníte v kartě klienta.">
                <Select value={stageId} onValueChange={setStageId} options={stages.map((st) => ({ value: st.id, label: st.name }))} />
              </Field>
            ) : undefined
          }
        />

        {dupes.length > 0 && (
          <Callout tone="warning" title="Možná duplicita" icon="users">
            Podobný klient už v evidenci je:{' '}
            {dupes.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ', '}
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    onClose();
                    navigate({ name: 'klient', clientId: c.id });
                  }}
                >
                  {clientName(c)}
                </button>
                {c.phone || c.email ? <span className="muted"> ({c.phone || c.email})</span> : null}
              </span>
            ))}
            .
          </Callout>
        )}

        <fieldset className="cli-consents-fieldset">
          <legend className="cli-eyebrow">Souhlasy</legend>
          <div className="cli-consents-grid">
            {CONSENT_META.map((m) => (
              <Checkbox
                key={m.key}
                checked={consents[m.key]}
                onChange={(v) => setConsents((c) => ({ ...c, [m.key]: v }))}
                label={
                  <>
                    {m.label}
                    {m.key === 'gdpr' && <span className="cli-required"> (povinné)</span>}
                  </>
                }
                description={m.key === 'gdpr' ? 'Nutné pro vedení klienta, rezervace a vyúčtování.' : m.description}
                aria-invalid={m.key === 'gdpr' && !!shown.gdpr ? true : undefined}
              />
            ))}
          </div>
          {shown.gdpr && (
            <p className="cli-field-error" role="alert">
              {shown.gdpr}
            </p>
          )}
        </fieldset>

        <Field label="Interní poznámka" optional hint="Vidí jen personál, klient ji neuvidí.">
          <Textarea value={draft.internalNote} onValueChange={(v) => setDraft((d) => ({ ...d, internalNote: v }))} rows={2} placeholder="Např. preferuje termíny po 16. hodině" />
        </Field>
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Úprava údajů                                                        */
/* ------------------------------------------------------------------ */

function draftOf(c: Client): ContactDraft {
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    birthDate: c.birthDate ?? '',
    tags: [...c.tags],
    source: c.source,
    internalNote: c.internalNote,
  };
}

export function EditClientDialog({ client, open, onClose }: { client: Client; open: boolean; onClose: () => void }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const formId = useId();
  const today = dateOf(now);
  const [draft, setDraft] = useState<ContactDraft>(() => draftOf(client));
  const [tried, setTried] = useState(false);
  const tagSuggestions = useMemo(() => allTags(clinic), [clinic]);

  useEffect(() => {
    if (open) {
      setDraft(draftOf(client));
      setTried(false);
    }
    // Při otevření převezmi aktuální údaje (záměrně jen při otevření).
  }, [open]);

  const errors = validate(draft, today);
  const shown = tried ? errors : {};

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(errors).length) return;
    const r = run(
      updateClient,
      {
        clientId: client.id,
        patch: {
          firstName: draft.firstName,
          lastName: draft.lastName,
          email: draft.email,
          phone: prettyPhone(draft.phone),
          birthDate: draft.birthDate || null,
          tags: draft.tags,
          internalNote: draft.internalNote.trim(),
        },
      },
      { success: 'Údaje klienta uloženy' },
    );
    if (r.ok) onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Upravit údaje klienta"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Zpět
          </Button>
          <Button variant="primary" type="submit" form={formId}>
            Uložit změny
          </Button>
        </>
      }
    >
      <form id={formId} className="cli-form" onSubmit={submit} noValidate>
        <ContactFields draft={draft} set={(p) => setDraft((d) => ({ ...d, ...p }))} errors={shown} tagSuggestions={tagSuggestions} today={today} />
        <Field label="Interní poznámka" optional hint="Vidí jen personál, klient ji neuvidí.">
          <Textarea value={draft.internalNote} onValueChange={(v) => setDraft((d) => ({ ...d, internalNote: v }))} rows={3} />
        </Field>
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Rychlá úprava štítků                                                */
/* ------------------------------------------------------------------ */

export function TagsDialog({ client, open, onClose }: { client: Client; open: boolean; onClose: () => void }): JSX.Element {
  const clinic = useClinic();
  const run = useCommand();
  const [tags, setTags] = useState<string[]>(client.tags);
  const suggestions = useMemo(() => allTags(clinic), [clinic]);

  useEffect(() => {
    if (open) setTags(client.tags);
  }, [open]);

  const save = (): void => {
    const r = run(updateClient, { clientId: client.id, patch: { tags } }, { success: 'Štítky uloženy' });
    if (r.ok) onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Štítky klienta"
      description="Štítky pomáhají při hledání a cílení kampaní (např. Běžec, Po operaci)."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Zpět
          </Button>
          <Button variant="primary" onClick={save}>
            Uložit štítky
          </Button>
        </>
      }
    >
      <Field label="Štítky" hint="Enter nebo čárka přidá štítek, Backspace odebere poslední.">
        <TagInput value={tags} onChange={setTags} suggestions={suggestions} />
      </Field>
    </Dialog>
  );
}
