import { useEffect, useId, useState, type FormEvent } from 'react';
import { AuthError, devLogin, requestCode, verifyCode } from '../api/auth';
import { ApiError } from '../api/client';
import { DEV_LOGIN, PLATFORM_NAME, SUPABASE_URL } from '../api/config';
import { SMS_ENABLED } from '../engine/channels';
import { useStore } from '../store/hooks';
import { logout, registerClient } from '../store/server';
import { Button, Callout, Checkbox, Field, Icon, Input } from '../ui';
import { LegalLink } from './Legal';
import './auth.css';

/** Přihlašovací a registrační obrazovky ostrého provozu. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 60;

function message(e: unknown): string {
  if (e instanceof AuthError || e instanceof ApiError) return e.message;
  return 'Něco se nepovedlo. Zkuste to prosím znovu.';
}

/** Logo nebo název provozovny podle adresy; na /platforma název platformy. */
function Brand(): JSX.Element {
  const tenant = useStore((s) => s.tenant);
  const platform = useStore((s) => s.platform);
  const name = platform ? PLATFORM_NAME : tenant?.name || '';
  return (
    <div className="auth__brand">
      {tenant?.branding.logo && !platform ? <img src={tenant.branding.logo} alt={name} className="auth__logo" /> : <span className="auth__wordmark">{name}</span>}
      <span className="auth__tagline">{platform ? 'správa platformy' : 'online rezervace'}</span>
    </div>
  );
}

const DEV_USERS: { email: string; label: string }[] = [
  { email: 'platforma@pohyb.local', label: 'Vlastník platformy' },
  { email: 'majitelka@pohyb.local', label: 'Majitelka' },
  { email: 'recepce@pohyb.local', label: 'Recepce' },
  { email: 'terapeut@pohyb.local', label: 'Terapeut' },
  { email: 'martin.dvorak@example.com', label: 'Klient Martin' },
  { email: 'novy.klient@example.com', label: 'Nový klient' },
];

export function LoginScreen(): JSX.Element {
  const platform = useStore((s) => s.platform);
  const licenseState = useStore((s) => s.tenant?.license.state);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const titleId = useId();

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const send = async (e?: FormEvent): Promise<void> => {
    e?.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) {
      setError('Zadejte prosím platný e-mail.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // lokální vývoj bez Supabase: přihlásit rovnou (žádný e-mail se neposílá)
      if (DEV_LOGIN && !SUPABASE_URL) {
        await devLogin(normalized);
        return;
      }
      await requestCode(normalized);
      setEmail(normalized);
      setStep('code');
      setCode('');
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const digits = code.replace(/\s/g, '');
    if (!/^\d{6,10}$/.test(digits)) {
      setError('Kód má 6 číslic – najdete ho v e-mailu.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifyCode(email, digits);
      // po přihlášení se aplikace načte sama (změna přihlášení)
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  };

  const dev = async (devEmail: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await devLogin(devEmail);
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <section className="auth__card" aria-labelledby={titleId}>
        <Brand />
        {step === 'email' ? (
          <form className="auth__form" onSubmit={(e) => void send(e)} noValidate>
            <h1 id={titleId} className="auth__title">
              Přihlášení
            </h1>
            <p className="auth__lead">
              {platform
                ? 'Správa provozoven a licencí. Přihlaste se e-mailem vlastníka platformy – pošleme vám jednorázový kód.'
                : 'Zadejte svůj e-mail. Pošleme vám jednorázový kód – žádné heslo si nemusíte pamatovat.'}
            </p>
            {!platform && (licenseState === 'blocked' || licenseState === 'readonly') && (
              <Callout tone="warning" icon="info">
                {licenseState === 'blocked'
                  ? 'Online rezervace jsou dočasně nedostupné. Kontaktujte prosím provozovnu.'
                  : 'Nové online rezervace teď nejdou. Přihlásit se můžete kvůli svým termínům, nebo kontaktujte provozovnu.'}
              </Callout>
            )}
            <Field label="E-mail" error={error ?? undefined}>
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                value={email}
                onValueChange={setEmail}
                placeholder="jmeno@example.cz"
                size="lg"
              />
            </Field>
            <Button type="submit" variant="primary" size="lg" full loading={busy} icon="mail">
              Poslat přihlašovací kód
            </Button>
            <p className="auth__note">Jste u nás poprvé? Stačí zadat e-mail – účet se založí po ověření kódu.</p>
          </form>
        ) : (
          <form className="auth__form" onSubmit={(e) => void verify(e)} noValidate>
            <h1 id={titleId} className="auth__title">
              Zadejte kód z e-mailu
            </h1>
            <p className="auth__lead">
              Kód jsme poslali na <strong>{email}</strong>. Pokud e-mail nevidíte, podívejte se i do složky s nevyžádanou poštou.
            </p>
            <Field label="Přihlašovací kód" error={error ?? undefined}>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                value={code}
                onValueChange={(v) => setCode(v.replace(/[^\d\s]/g, '').slice(0, 12))}
                placeholder="123456"
                size="lg"
                className="auth__code"
              />
            </Field>
            <Button type="submit" variant="primary" size="lg" full loading={busy}>
              Přihlásit se
            </Button>
            <div className="auth__row">
              <Button type="button" variant="ghost" size="sm" icon="arrowLeft" onClick={() => setStep('email')} disabled={busy}>
                Jiný e-mail
              </Button>
              <Button type="button" variant="ghost" size="sm" icon="refresh" onClick={() => void send()} disabled={busy || cooldown > 0}>
                {cooldown > 0 ? `Poslat znovu (${cooldown} s)` : 'Poslat kód znovu'}
              </Button>
            </div>
          </form>
        )}
        {DEV_LOGIN && (
          <div className="auth__dev" role="group" aria-label="Vývojové přihlášení">
            <p className="auth__dev-title">
              <Icon name="zap" size={14} /> Vývojové přihlášení (jen lokálně, bez e-mailu)
            </p>
            <div className="auth__dev-buttons">
              {DEV_USERS.map((u) => (
                <Button key={u.email} size="sm" variant="secondary" onClick={() => void dev(u.email)} disabled={busy}>
                  {u.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </section>
      <p className="auth__footer">
        <LegalLink doc="privacy">Ochrana osobních údajů</LegalLink>
        <span aria-hidden="true"> · </span>
        <LegalLink doc="terms">Obchodní podmínky</LegalLink>
      </p>
      <TenantIdentity />
    </main>
  );
}

/** Identifikace provozovny na její přihlašovací stránce (§ 435 občanského zákoníku). */
function TenantIdentity(): JSX.Element | null {
  const identity = useStore((s) => (s.platform ? undefined : s.tenant?.identity));
  if (!identity?.length) return null;
  return (
    <p className="auth__identity">
      {identity.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </p>
  );
}

export function RegisterScreen(): JSX.Element {
  const session = useStore((s) => s.session);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', birthDate: '' });
  const [consents, setConsents] = useState({ gdpr: false, health: false, marketingEmail: false, sms: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('Vyplňte prosím jméno i příjmení.');
      return;
    }
    if (!consents.gdpr) {
      setError('Bez potvrzení podmínek a zásad ochrany osobních údajů registraci nelze dokončit.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await registerClient({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        birthDate: form.birthDate || null,
        consents,
      });
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <section className="auth__card auth__card--wide" aria-labelledby={titleId}>
        <Brand />
        <form className="auth__form" onSubmit={(e) => void submit(e)} noValidate>
          <h1 id={titleId} className="auth__title">
            Dokončení registrace
          </h1>
          <p className="auth__lead">
            E-mail <strong>{session?.user.email}</strong> zatím u nás nemá kartu klienta. Doplňte prosím pár údajů – pak si můžete
            rovnou rezervovat termín.
          </p>
          <div className="auth__grid">
            <Field label="Jméno">
              <Input autoComplete="given-name" value={form.firstName} onValueChange={(v) => setForm({ ...form, firstName: v })} />
            </Field>
            <Field label="Příjmení">
              <Input autoComplete="family-name" value={form.lastName} onValueChange={(v) => setForm({ ...form, lastName: v })} />
            </Field>
            <Field label="Telefon" optional hint="Pro domluvu změn termínu.">
              <Input type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onValueChange={(v) => setForm({ ...form, phone: v })} placeholder="777 123 456" />
            </Field>
            <Field label="Datum narození" optional>
              <Input type="date" autoComplete="bday" value={form.birthDate} onValueChange={(v) => setForm({ ...form, birthDate: v })} />
            </Field>
          </div>
          <fieldset className="auth__consents">
            <legend className="auth__legend">Souhlasy</legend>
            <Checkbox
              checked={consents.gdpr}
              onChange={(v) => setConsents({ ...consents, gdpr: v })}
              label={
                <>
                  Souhlasím s{' '}
                  <LegalLink doc="terms">obchodními podmínkami</LegalLink>{' '}
                  a beru na vědomí{' '}
                  <LegalLink doc="privacy">zásady ochrany osobních údajů</LegalLink>
                  .
                </>
              }
              description="Povinné – bez toho nelze vést rezervace."
            />
            <Checkbox
              checked={consents.health}
              onChange={(v) => setConsents({ ...consents, health: v })}
              label="Souhlasím se zpracováním údajů o mém zdravotním stavu pro účely terapie."
              description="Nepovinné. Terapeutovi pomůže znát vaše obtíže předem; souhlas můžete kdykoli odvolat v účtu."
            />
            {SMS_ENABLED && (
              <Checkbox
                checked={consents.sms}
                onChange={(v) => setConsents({ ...consents, sms: v })}
                label="Chci dostávat SMS připomínky termínů."
                description="Nepovinné. Připomínky e-mailem chodí vždy."
              />
            )}
            <Checkbox
              checked={consents.marketingEmail}
              onChange={(v) => setConsents({ ...consents, marketingEmail: v })}
              label="Chci dostávat novinky a nabídky e-mailem."
              description="Nepovinné. Odhlásit se můžete jedním kliknutím v každém e-mailu nebo v účtu."
            />
          </fieldset>
          {error && (
            <p className="auth__error" role="alert">
              <Icon name="alertCircle" size={16} /> {error}
            </p>
          )}
          <Button type="submit" variant="primary" size="lg" full loading={busy}>
            Dokončit registraci
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => void logout()} disabled={busy}>
            Přihlásit se jiným e-mailem
          </Button>
        </form>
      </section>
    </main>
  );
}
