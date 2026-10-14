import { useEffect, useId, useState, type FormEvent } from 'react';
import type { Id } from '../../domain/types';
import { createClient } from '../../engine/commands';
import { useCommand } from '../../store/hooks';
import { Button, Checkbox, Dialog, Field, Input } from '../../ui';

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gdpr: boolean;
  health: boolean;
  marketingEmail: boolean;
  sms: boolean;
}

const EMPTY: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  gdpr: false,
  health: false,
  marketingEmail: false,
  sms: false,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Rychlé založení klienta z Přehledu (minimum údajů, souhlasy). */
export function NewClientDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (clientId: Id) => void;
}): JSX.Element {
  const run = useCommand();
  const formId = useId();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setTouched(false);
    }
  }, [open]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void => setForm((f) => ({ ...f, [key]: value }));
  const email = form.email.trim();
  const errors = {
    firstName: form.firstName.trim() ? undefined : 'Vyplňte jméno.',
    lastName: form.lastName.trim() ? undefined : 'Vyplňte příjmení.',
    email: email && !EMAIL_RE.test(email) ? 'E-mail nemá platný tvar.' : undefined,
    contact: email || form.phone.trim() ? undefined : 'Vyplňte e-mail nebo telefon.',
    gdpr: form.gdpr ? undefined : 'Bez souhlasu se zpracováním údajů nelze kartu založit.',
  };
  const invalid = Object.values(errors).some(Boolean);

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    setTouched(true);
    if (invalid) return;
    const name = `${form.firstName.trim()} ${form.lastName.trim()}`;
    const r = run(
      createClient,
      {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        source: 'recepce',
        consents: { gdpr: form.gdpr, health: form.health, marketingEmail: form.marketingEmail, sms: form.sms },
      },
      { success: `Klient ${name} je založený` },
    );
    if (r.ok) {
      onClose();
      onCreated?.(r.value);
    }
  };

  const show = (msg: string | undefined): string | undefined => (touched ? msg : undefined);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nový klient"
      description="Stačí jméno a kontakt. Ostatní údaje doplníte v kartě klienta."
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
      <form id={formId} className="st-form" onSubmit={submit} noValidate>
        <div className="st-form__row">
          <Field label="Jméno" error={show(errors.firstName)}>
            <Input value={form.firstName} autoComplete="given-name" onValueChange={(v) => set('firstName', v)} />
          </Field>
          <Field label="Příjmení" error={show(errors.lastName)}>
            <Input value={form.lastName} autoComplete="family-name" onValueChange={(v) => set('lastName', v)} />
          </Field>
        </div>
        <div className="st-form__row">
          <Field label="E-mail" error={show(errors.email ?? errors.contact)}>
            <Input type="email" value={form.email} autoComplete="email" inputMode="email" onValueChange={(v) => set('email', v)} />
          </Field>
          <Field label="Telefon" hint="Stačí e-mail, nebo telefon.">
            <Input type="tel" value={form.phone} autoComplete="tel" inputMode="tel" onValueChange={(v) => set('phone', v)} />
          </Field>
        </div>
        <fieldset className="st-form__consents">
          <legend className="st-section-label">Souhlasy</legend>
          <Checkbox
            label="Zpracování osobních údajů"
            description="Povinné pro vedení karty klienta (GDPR)."
            checked={form.gdpr}
            aria-invalid={touched && !!errors.gdpr}
            onChange={(v) => set('gdpr', v)}
          />
          {touched && errors.gdpr && <span className="st-form__error">{errors.gdpr}</span>}
          <Checkbox label="Vedení zdravotní dokumentace" checked={form.health} onChange={(v) => set('health', v)} />
          <Checkbox label="Obchodní sdělení e-mailem" checked={form.marketingEmail} onChange={(v) => set('marketingEmail', v)} />
          <Checkbox label="Připomínky a zprávy SMS" checked={form.sms} onChange={(v) => set('sms', v)} />
        </fieldset>
      </form>
    </Dialog>
  );
}
