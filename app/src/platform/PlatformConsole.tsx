import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PLATFORM_NAME } from '../api/config';
import { LICENSE_PLAN_LABEL, type LicensePlan, type LicenseState, type LicenseStatus } from '../api/license';
import type { CreateTenantRequest, PlatformTenant, UpdateTenantRequest } from '../api/protocol';
import { tenantUrl } from '../api/tenant';
import { countLabel, formatDate } from '../engine/format';
import { PRESETS } from '../engine/presets';
import { addDays, pragueNow } from '../engine/time';
import { useStore } from '../store/hooks';
import { logout } from '../store/server';
import { Badge, Button, Callout, Card, Checkbox, Dialog, EmptyState, Field, Icon, Input, Select, Spinner, Textarea, toast, type BadgeTone } from '../ui';
import './platform.css';

/**
 * Správa platformy pro jejího vlastníka: provozovny (zákazníci), jejich licence, adresy a napojení na banku.
 * Do každé provozovny se lze přihlásit s právy majitele (podpora a nastavení na míru).
 */

const STATE_LABEL: Record<LicenseState, { label: string; tone: BadgeTone }> = {
  ok: { label: 'Aktivní', tone: 'success' },
  expiring: { label: 'Brzy končí', tone: 'warning' },
  grace: { label: 'Po konci platnosti', tone: 'danger' },
  readonly: { label: 'Jen pro čtení', tone: 'danger' },
  blocked: { label: 'Pozastaveno', tone: 'neutral' },
};

const STATUS_LABEL: Record<LicenseStatus, string> = { active: 'Aktivní', suspended: 'Pozastavená', cancelled: 'Ukončená' };
const PLANS = Object.keys(LICENSE_PLAN_LABEL) as LicensePlan[];

function message(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Něco se nepovedlo. Zkuste to prosím znovu.';
}

/** Adresa z názvu: bez diakritiky, malá písmena, pomlčky. */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

const today = (): string => pragueNow().slice(0, 10);

/** Výchozí platnost; u doživotní licence konec zaplaceného provozu a podpory (první rok je v licenčním poplatku). */
function defaultValidUntil(plan: LicensePlan): string {
  const t = today();
  if (plan === 'trial') return addDays(t, 30);
  if (plan === 'monthly') return addDays(t, 31);
  return addDays(t, 365);
}

function licenseText(t: PlatformTenant): string {
  const v = t.licenseView;
  const plan = LICENSE_PLAN_LABEL[t.license.plan];
  if (!t.license.validUntil) return `${plan} · bez omezení`;
  const when = formatDate(t.license.validUntil);
  const what = t.license.plan === 'lifetime' ? 'provoz ' : '';
  if (v.daysLeft === null) return `${plan} · ${what}do ${when}`;
  if (v.daysLeft >= 0) return `${plan} · ${what}do ${when} (${countLabel(v.daysLeft, ['den', 'dny', 'dní'])})`;
  return `${plan} · ${t.license.plan === 'lifetime' ? 'provoz skončil' : 'skončila'} ${when}`;
}

export function PlatformConsole(): JSX.Element {
  const session = useStore((s) => s.session);
  const [tenants, setTenants] = useState<PlatformTenant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PlatformTenant | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setTenants(await api<PlatformTenant[]>('GET', '/platform/tenants'));
      setError(null);
    } catch (e) {
      setError(message(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const replace = (t: PlatformTenant): void => setTenants((list) => (list ? (list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t]) : [t]));

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = tenants ?? [];
    return q ? list.filter((t) => [t.name, t.slug, ...t.domains, ...t.owners.map((o) => o.email)].some((x) => x.toLowerCase().includes(q))) : list;
  }, [tenants, query]);

  const stats = useMemo(() => {
    const list = tenants ?? [];
    const by = (s: LicenseState): number => list.filter((t) => t.licenseView.state === s).length;
    return { total: list.length, ok: by('ok'), expiring: by('expiring'), overdue: by('grace') + by('readonly'), blocked: by('blocked') };
  }, [tenants]);

  return (
    <div className="plt">
      <header className="plt__header">
        <div className="plt__brand">
          <span className="plt__name">{PLATFORM_NAME}</span>
          <span className="plt__sub">Správa platformy</span>
        </div>
        <div className="plt__user">
          <span className="plt__email">{session?.user.email}</span>
          <Button size="sm" variant="ghost" icon="logout" onClick={() => void logout()}>
            Odhlásit
          </Button>
        </div>
      </header>

      <main className="plt__main">
        <div className="plt__stats" role="list" aria-label="Přehled licencí">
          {[
            { label: 'Provozovny', value: stats.total, tone: '' },
            { label: 'Aktivní licence', value: stats.ok, tone: 'ok' },
            { label: 'Končí do 14 dní', value: stats.expiring, tone: 'warn' },
            { label: 'Po konci platnosti', value: stats.overdue, tone: 'bad' },
            { label: 'Pozastavené', value: stats.blocked, tone: '' },
          ].map((s) => (
            <div key={s.label} role="listitem" className={`plt__stat plt__stat--${s.tone || 'plain'}`}>
              <span className="plt__stat-value tnum">{s.value}</span>
              <span className="plt__stat-label">{s.label}</span>
            </div>
          ))}
        </div>

        <div className="plt__toolbar">
          <Input prefixIcon="search" value={query} onValueChange={setQuery} placeholder="Hledat provozovnu, adresu nebo e-mail" aria-label="Hledat provozovnu" className="plt__search" />
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
            Nová provozovna
          </Button>
        </div>

        {error && (
          <Callout tone="danger" icon="alertCircle">
            {error}{' '}
            <Button size="sm" variant="ghost" onClick={() => void load()}>
              Zkusit znovu
            </Button>
          </Callout>
        )}
        {!tenants && !error && <Spinner />}
        {tenants && shown.length === 0 && (
          <Card>
            <EmptyState
              icon="building"
              title={tenants.length ? 'Nic nenalezeno' : 'Zatím žádná provozovna'}
              text={tenants.length ? 'Zkuste jiný výraz.' : 'Založte prvního zákazníka – vyberete obor a systém připraví služby, názvosloví a moduly.'}
              action={
                tenants.length ? undefined : (
                  <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
                    Nová provozovna
                  </Button>
                )
              }
            />
          </Card>
        )}
        <ul className="plt__list" aria-label="Provozovny">
          {shown.map((t) => {
            const st = STATE_LABEL[t.licenseView.state];
            return (
              <li key={t.id}>
                <Card as="article" className="plt__tenant" aria-label={t.name}>
                  <div className="plt__tenant-head">
                    <div className="plt__tenant-title">
                      <h2 className="plt__tenant-name">{t.name}</h2>
                      <Badge tone={st.tone} dot>
                        {st.label}
                      </Badge>
                    </div>
                    <div className="plt__tenant-actions">
                      <Button size="sm" variant="ghost" icon="external" onClick={() => window.open(tenantUrl(t.slug), '_blank', 'noopener')}>
                        Otevřít
                      </Button>
                      <Button size="sm" variant="secondary" icon="edit" onClick={() => setEditing(t)}>
                        Upravit
                      </Button>
                    </div>
                  </div>
                  <dl className="plt__facts">
                    <div>
                      <dt>Adresa</dt>
                      <dd>
                        /{t.slug}
                        {t.domains.length ? ` · ${t.domains.join(', ')}` : ''}
                      </dd>
                    </div>
                    <div>
                      <dt>Licence</dt>
                      <dd>{licenseText(t)}</dd>
                    </div>
                    <div>
                      <dt>Majitel</dt>
                      <dd>{t.owners.map((o) => `${o.name} <${o.email}>`).join(', ') || '—'}</dd>
                    </div>
                    <div>
                      <dt>Využití</dt>
                      <dd>
                        {countLabel(t.members, ['člověk v týmu', 'lidé v týmu', 'lidí v týmu'])} · {countLabel(t.clientAccounts, ['klientský účet', 'klientské účty', 'klientských účtů'])}
                        {t.lastChangeAt ? ` · poslední změna ${formatDate(t.lastChangeAt.slice(0, 10))}` : ''}
                      </dd>
                    </div>
                  </dl>
                  {t.license.note && <p className="plt__note">{t.license.note}</p>}
                </Card>
              </li>
            );
          })}
        </ul>
        <p className="plt__hint">
          <Icon name="info" size={14} /> Do každé provozovny se přihlásíte s právy majitele (podpora a nastavení na míru) – změny se zapisují pod vaším e-mailem s
          poznámkou „podpora platformy“.
        </p>
      </main>

      {creating && (
        <CreateTenantDialog
          onClose={() => setCreating(false)}
          onCreated={(t) => {
            replace(t);
            setCreating(false);
          }}
        />
      )}
      {editing && (
        <EditTenantDialog
          tenant={editing}
          onClose={() => setEditing(null)}
          onSaved={(t) => {
            replace(t);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function CreateTenantDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (t: PlatformTenant) => void }): JSX.Element {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [preset, setPreset] = useState<string>(PRESETS[0].id);
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [plan, setPlan] = useState<LicensePlan>('trial');
  const [validUntil, setValidUntil] = useState<string>(defaultValidUntil('trial'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effSlug = slugTouched ? slug : slugify(name);
  const presetInfo = PRESETS.find((p) => p.id === preset);

  const pickPlan = (p: LicensePlan): void => {
    setPlan(p);
    setValidUntil(defaultValidUntil(p));
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const body: CreateTenantRequest = {
        name: name.trim(),
        slug: effSlug,
        preset,
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim().toLowerCase(),
        plan,
        validUntil: validUntil || null,
      };
      const t = await api<PlatformTenant>('POST', '/platform/tenants', body);
      toast('Provozovna založená', { tone: 'success', description: `Majitel se přihlásí e-mailem ${body.ownerEmail} na ${tenantUrl(t.slug)}` });
      onCreated(t);
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Nová provozovna"
      description="Obor připraví služby, ceník, názvosloví a zapnuté moduly – vše se dá potom upravit v nastavení provozovny."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Zpět
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={busy}>
            Založit provozovnu
          </Button>
        </>
      }
    >
      <div className="plt__form">
        <Field label="Název provozovny">
          <Input value={name} onValueChange={setName} placeholder="Fyzio centrum Praha" autoFocus />
        </Field>
        <Field label="Adresa" hint={effSlug ? `Rezervace poběží na ${tenantUrl(effSlug)}` : 'Malá písmena bez diakritiky, číslice a pomlčky.'}>
          <Input
            value={effSlug}
            prefix="/"
            onValueChange={(v) => {
              setSlugTouched(true);
              setSlug(v.toLowerCase());
            }}
          />
        </Field>
        <Field label="Obor (šablona)" hint={presetInfo?.description}>
          <Select value={preset} onValueChange={setPreset} options={PRESETS.map((p) => ({ value: p.id, label: p.name }))} />
        </Field>
        <div className="plt__grid">
          <Field label="Jméno majitele">
            <Input value={ownerName} onValueChange={setOwnerName} autoComplete="off" />
          </Field>
          <Field label="E-mail majitele" hint="Přihlašuje se jím (kód z e-mailu).">
            <Input type="email" value={ownerEmail} onValueChange={setOwnerEmail} autoComplete="off" />
          </Field>
        </div>
        <div className="plt__grid">
          <Field label="Licence">
            <Select value={plan} onValueChange={(v) => pickPlan(v as LicensePlan)} options={PLANS.map((p) => ({ value: p, label: LICENSE_PLAN_LABEL[p] }))} />
          </Field>
          <Field
            label={plan === 'lifetime' ? 'Provoz a podpora zaplaceny do' : 'Platná do'}
            hint={plan === 'lifetime' ? 'Licence trvá; po tomto datu bez zaplaceného ročního poplatku jen čtení.' : undefined}
          >
            <Input type="date" value={validUntil} onValueChange={setValidUntil} />
          </Field>
        </div>
        {error && (
          <Callout tone="danger" icon="alertCircle">
            {error}
          </Callout>
        )}
      </div>
    </Dialog>
  );
}

function EditTenantDialog({ tenant, onClose, onSaved }: { tenant: PlatformTenant; onClose: () => void; onSaved: (t: PlatformTenant) => void }): JSX.Element {
  const [name, setName] = useState(tenant.name);
  const [slug, setSlug] = useState(tenant.slug);
  const [plan, setPlan] = useState<LicensePlan>(tenant.license.plan);
  const [status, setStatus] = useState<LicenseStatus>(tenant.license.status);
  const [unlimited, setUnlimited] = useState(!tenant.license.validUntil);
  const [validUntil, setValidUntil] = useState(tenant.license.validUntil ?? defaultValidUntil(tenant.license.plan));
  const [note, setNote] = useState(tenant.license.note);
  const [domains, setDomains] = useState(tenant.domains.join('\n'));
  const [fioToken, setFioToken] = useState('');
  const [fioSet, setFioSet] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ key: string }[]>('GET', `/platform/tenants/${tenant.id}/secrets`)
      .then((keys) => setFioSet(keys.some((k) => k.key === 'fio_token')))
      .catch(() => setFioSet(null));
  }, [tenant.id]);

  const extend = (days: number): void => {
    const from = validUntil && validUntil > today() ? validUntil : today();
    setUnlimited(false);
    setValidUntil(addDays(from, days));
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const patch: UpdateTenantRequest = {};
      if (name.trim() !== tenant.name) patch.name = name.trim();
      if (slug.trim() !== tenant.slug) patch.slug = slug.trim().toLowerCase();
      if (plan !== tenant.license.plan) patch.plan = plan;
      if (status !== tenant.license.status) patch.status = status;
      const nextValid = unlimited ? null : validUntil || null;
      if (nextValid !== tenant.license.validUntil) patch.validUntil = nextValid;
      if (note !== tenant.license.note) patch.note = note;
      let saved = tenant;
      if (Object.keys(patch).length) saved = await api<PlatformTenant>('PATCH', `/platform/tenants/${tenant.id}`, patch);
      const nextDomains = domains
        .split(/[\s,]+/)
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);
      if (nextDomains.join(',') !== tenant.domains.join(',')) saved = await api<PlatformTenant>('PUT', `/platform/tenants/${tenant.id}/domains`, { domains: nextDomains });
      if (fioToken.trim()) await api('PUT', `/platform/tenants/${tenant.id}/secrets`, { fioToken: fioToken.trim() });
      toast('Uloženo', { tone: 'success' });
      onSaved(saved);
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  };

  const removeFio = async (): Promise<void> => {
    try {
      await api('PUT', `/platform/tenants/${tenant.id}/secrets`, { fioToken: null });
      setFioSet(false);
      toast('Napojení na Fio odebráno', { tone: 'success' });
    } catch (e) {
      setError(message(e));
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={tenant.name}
      description={`Založeno ${formatDate(tenant.createdAt.slice(0, 10))} · ${tenantUrl(tenant.slug)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Zpět
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={busy}>
            Uložit
          </Button>
        </>
      }
    >
      <div className="plt__form">
        <h3 className="plt__section">Licence</h3>
        <div className="plt__grid">
          <Field label="Druh">
            <Select value={plan} onValueChange={(v) => setPlan(v as LicensePlan)} options={PLANS.map((p) => ({ value: p, label: LICENSE_PLAN_LABEL[p] }))} />
          </Field>
          <Field label="Stav" hint={status !== 'active' ? 'Tým ani klienti se do systému nedostanou; majitel může jen prohlížet a exportovat data.' : undefined}>
            <Select value={status} onValueChange={(v) => setStatus(v as LicenseStatus)} options={(Object.keys(STATUS_LABEL) as LicenseStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
          </Field>
        </div>
        <Checkbox
          checked={unlimited}
          onChange={setUnlimited}
          label={plan === 'lifetime' ? 'Provoz a podpora bez omezení (např. vlastní hosting)' : 'Bez omezení platnosti'}
        />
        {!unlimited && (
          <div className="plt__grid plt__grid--end">
            <Field
              label={plan === 'lifetime' ? 'Provoz a podpora zaplaceny do' : 'Platná do'}
              hint={
                plan === 'lifetime'
                  ? 'Po zaplacení ročního poplatku prodlužte o rok. Po tomto datu 14 dní vše funguje, potom jen čtení.'
                  : 'Po konci platnosti 14 dní vše funguje, potom jen čtení.'
              }
            >
              <Input type="date" value={validUntil} onValueChange={setValidUntil} />
            </Field>
            <div className="plt__extend">
              {plan !== 'lifetime' && (
                <Button size="sm" variant="secondary" onClick={() => extend(31)}>
                  + měsíc
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => extend(365)}>
                + rok
              </Button>
            </div>
          </div>
        )}
        <Field label="Poznámka" optional hint="Jen pro vás – např. číslo smlouvy, faktury, domluvená sleva.">
          <Textarea rows={2} value={note} onValueChange={setNote} />
        </Field>

        <h3 className="plt__section">Adresa</h3>
        <div className="plt__grid">
          <Field label="Název (v přehledu platformy)">
            <Input value={name} onValueChange={setName} />
          </Field>
          <Field label="Adresa" hint={slug !== tenant.slug ? 'Pozor: starý odkaz přestane fungovat.' : undefined}>
            <Input value={slug} prefix="/" onValueChange={(v) => setSlug(v.toLowerCase())} />
          </Field>
        </div>
        <Field label="Vlastní domény" optional hint="Každou na samostatný řádek, např. rezervace.klinika.cz. U domény nastavte CNAME na web aplikace a přidejte ji v Cloudflare Pages.">
          <Textarea rows={2} value={domains} onValueChange={setDomains} />
        </Field>

        <h3 className="plt__section">Banka (Fio)</h3>
        <p className="plt__muted">
          {fioSet === null ? 'Zjišťuji…' : fioSet ? 'Token je uložený (šifrovaně) – QR platby se párují automaticky.' : 'Bez napojení – QR platby potvrzuje recepce ručně.'}
        </p>
        <div className="plt__grid plt__grid--end">
          <Field label={fioSet ? 'Nový token' : 'Token „Pouze sledovat účet“'} optional>
            <Input type="password" value={fioToken} onValueChange={setFioToken} autoComplete="off" />
          </Field>
          {fioSet && (
            <Button size="sm" variant="ghost" icon="trash" onClick={() => void removeFio()}>
              Odebrat napojení
            </Button>
          )}
        </div>
        {error && (
          <Callout tone="danger" icon="alertCircle">
            {error}
          </Callout>
        )}
      </div>
    </Dialog>
  );
}
