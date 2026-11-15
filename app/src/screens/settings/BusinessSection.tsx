import { useMemo, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { SERVER_MODE } from '../../api/config';
import type { AresCompany } from '../../api/protocol';
import type { BusinessProfile, PostalAddress } from '../../domain/types';
import {
  addressEmpty,
  businessErrors,
  businessIdentity,
  businessMissing,
  emptyAddress,
  emptyBusinessProfile,
  icoProblem,
  normalizeBusiness,
  normalizeIco,
  type BusinessField,
} from '../../engine/business';
import { updateSettings } from '../../engine/commands';
import { onlineOpen } from '../../engine/launch';
import { useClinic, useCommand, useTerms } from '../../store/hooks';
import { Button, Callout, Card, Field, Input, Segmented, Switch, Textarea, toast } from '../../ui';
import { FieldGroup, useSyncedDraft } from './shared';

/**
 * Fakturační údaje provozovny – identifikace podnikatele v patičce e-mailů a v portálu, faktury od platformy.
 * Mění je jen majitel; ukládají se samostatně (mimo koncept ostatních nastavení). V ostrém provozu je doplní
 * „Načíst z ARES“ podle IČO, v testovací verzi bez serveru se tlačítko nenabízí.
 */

const REGISTRY_EXAMPLES = [
  'Společnost zapsaná v obchodním rejstříku vedeném Krajským soudem v Brně, oddíl C, vložka 12345',
  'Fyzická osoba zapsaná v živnostenském rejstříku',
  'Fyzická osoba zapsaná v Národním registru poskytovatelů zdravotních služeb',
  'Spolek zapsaný ve spolkovém rejstříku vedeném Městským soudem v Praze, oddíl L, vložka 1234',
];

type AddressKey = 'registeredAddress' | 'placeAddress';

export function BusinessSection({ headingId }: { headingId: string }): JSX.Element {
  const clinic = useClinic();
  const run = useCommand();
  const words = useTerms();
  const saved = useMemo(() => clinic.settings.business ?? emptyBusinessProfile(), [clinic.settings.business]);
  const { draft, setDraft, reset, dirty } = useSyncedDraft<BusinessProfile>(saved);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [showErrors, setShowErrors] = useState(false);
  const [aresBusy, setAresBusy] = useState(false);
  const [aresError, setAresError] = useState<string | null>(null);

  const placeOn = placeOpen || !addressEmpty(draft.placeAddress);
  const errors = businessErrors(draft);
  const err = (field: BusinessField): string | undefined => (showErrors || touched.has(field) ? errors[field] : undefined);
  const touch = (field: BusinessField) => (): void => setTouched((t) => new Set(t).add(field));
  const set = (patch: Partial<BusinessProfile>): void => setDraft((d) => ({ ...d, ...patch }));
  const setAddress = (key: AddressKey, patch: Partial<PostalAddress>): void => setDraft((d) => ({ ...d, [key]: { ...d[key], ...patch } }));
  const person = draft.legalForm === 'person';
  const identity = businessIdentity(normalizeBusiness(draft));
  const missing = businessMissing(normalizeBusiness(draft));
  const open = onlineOpen(clinic);

  const loadAres = async (): Promise<void> => {
    const problem = icoProblem(draft.ico);
    if (problem) {
      setAresError(problem);
      return;
    }
    setAresBusy(true);
    setAresError(null);
    try {
      const company = await api<AresCompany>('GET', `/ares?ico=${encodeURIComponent(normalizeIco(draft.ico))}`);
      setDraft((d) => ({ ...d, ...company, registeredAddress: { ...company.registeredAddress }, registryNote: company.registryNote || d.registryNote }));
      toast.success('Údaje z ARES doplněny', { description: 'Zkontrolujte je a uložte.' });
    } catch (e) {
      setAresError(e instanceof ApiError ? e.message : 'Údaje z ARES se nepodařilo načíst. Zkuste to prosím znovu.');
    } finally {
      setAresBusy(false);
    }
  };

  const save = (): void => {
    const next = normalizeBusiness(placeOn ? draft : { ...draft, placeAddress: emptyAddress() });
    if (Object.keys(businessErrors(next)).length) {
      setShowErrors(true);
      toast.error('Fakturační údaje nelze uložit', { description: 'Opravte zvýrazněná pole.' });
      return;
    }
    const r = run(updateSettings, { business: next }, { success: 'Fakturační údaje uloženy' });
    if (r.ok) {
      setDraft(next);
      setPlaceOpen(false);
      setShowErrors(false);
      setTouched(new Set());
    }
  };

  const discard = (): void => {
    reset();
    setPlaceOpen(false);
    setShowErrors(false);
    setTouched(new Set());
    setAresError(null);
  };

  /** Ulice, obec a PSČ; `of` odliší popisky adresy provozovny od sídla („Obec kliniky“). */
  const addressFields = (key: AddressKey, of = ''): JSX.Element => {
    const a = draft[key];
    return (
      <div className="set-form__grid set-form__grid--3">
        <Field label={`Ulice a číslo${of}`} error={err(`${key}.street`)}>
          <Input value={a.street} maxLength={120} autoComplete="street-address" placeholder="např. Křenová 12" onValueChange={(v) => setAddress(key, { street: v })} onBlur={touch(`${key}.street`)} />
        </Field>
        <Field label={`Obec${of}`} error={err(`${key}.city`)}>
          <Input value={a.city} maxLength={80} autoComplete="address-level2" placeholder="např. Brno" onValueChange={(v) => setAddress(key, { city: v })} onBlur={touch(`${key}.city`)} />
        </Field>
        <Field label={`PSČ${of}`} error={err(`${key}.zip`)}>
          <Input value={a.zip} maxLength={6} inputMode="numeric" autoComplete="postal-code" placeholder="602 00" onValueChange={(v) => setAddress(key, { zip: v })} onBlur={touch(`${key}.zip`)} />
        </Field>
      </div>
    );
  };

  return (
    <Card className="set-section-card">
      <div className="set-section-heading">
        <h2 id={headingId} className="set-section-heading__title" tabIndex={-1}>
          Fakturační údaje
        </h2>
        <p className="set-section-heading__subtitle">
          Kdo {words.business.acc} provozuje: uvádí se v patičce automatických e-mailů a v klientském portálu, na e-mail pro faktury posíláme faktury za
          systém.
        </p>
      </div>
      <div className="set-form set-biz">
        {missing.length > 0 && (
          <Callout tone="info" icon="info">
            {open
              ? `Chybí: ${missing.join(', ')}. Bez nich se identifikace ${words.business.gen} neukáže v patičce e-mailů ani v portálu.`
              : `Ke spuštění online rezervací chybí: ${missing.join(', ')}.`}
          </Callout>
        )}

        <section className="set-form__section" aria-labelledby="set-biz-h-who">
          <h3 id="set-biz-h-who" className="set-form__title">
            Podnikatel
          </h3>
          <FieldGroup label="Právní forma">
            <Segmented
              aria-label="Právní forma"
              className="set-biz__form"
              value={draft.legalForm}
              onChange={(v) => set({ legalForm: v })}
              options={[
                { value: 'person', label: 'Fyzická osoba podnikatel', icon: 'user' },
                { value: 'company', label: 'Právnická osoba', icon: 'building' },
              ]}
            />
          </FieldGroup>
          <div className="set-biz__ico">
            <Field label="IČO" error={err('ico')} hint={SERVER_MODE ? 'Podle IČO doplníte název, sídlo, DIČ a zápis v rejstříku z ARES.' : undefined}>
              <Input
                value={draft.ico}
                maxLength={12}
                inputMode="numeric"
                placeholder="8 číslic"
                onValueChange={(v) => set({ ico: v })}
                onBlur={touch('ico')}
              />
            </Field>
            {SERVER_MODE && (
              <Button variant="secondary" icon="download" loading={aresBusy} onClick={() => void loadAres()}>
                Načíst z ARES
              </Button>
            )}
          </div>
          {aresError && (
            <Callout tone="danger" icon="alertCircle">
              {aresError}
            </Callout>
          )}
          <Field
            label={person ? 'Jméno a příjmení' : 'Obchodní firma'}
            error={err('legalName')}
            hint={person ? 'Jak jste zapsaní v živnostenském rejstříku, případně s dodatkem, např. Jana Nováková – Studio Lotos.' : 'Přesně podle obchodního rejstříku, např. Pohyb s.r.o.'}
          >
            <Input value={draft.legalName} maxLength={160} onValueChange={(v) => set({ legalName: v })} onBlur={touch('legalName')} />
          </Field>
          <div className="set-row set-row--switch">
            <Switch checked={draft.vatPayer} onChange={(v) => set({ vatPayer: v })} label="Plátce DPH" description="Plátce DPH musí mít vyplněné DIČ." />
          </div>
          <Field label="DIČ" optional={!draft.vatPayer} error={err('dic')} hint="CZ a 8–10 číslic, u právnické osoby obvykle CZ + IČO.">
            <Input value={draft.dic} maxLength={14} placeholder="CZ12345678" className="set-ctl-md" onValueChange={(v) => set({ dic: v })} onBlur={touch('dic')} />
          </Field>
          <Field
            label="Údaj o zápisu do rejstříku"
            error={err('registryNote')}
            hint="Povinný údaj na fakturách, dokladech a webu spolu s názvem, sídlem a IČO (§ 435 občanského zákoníku)."
          >
            <Textarea rows={2} value={draft.registryNote} maxLength={400} onValueChange={(v) => set({ registryNote: v })} onBlur={touch('registryNote')} />
          </Field>
          <div className="set-biz__examples">
            <span className="set-biz__examples-title">Příklady zápisu</span>
            <ul className="set-bullets">
              {REGISTRY_EXAMPLES.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="set-form__section" aria-labelledby="set-biz-h-seat">
          <h3 id="set-biz-h-seat" className="set-form__title">
            {person ? 'Místo podnikání (sídlo)' : 'Sídlo'}
          </h3>
          {addressFields('registeredAddress')}
          <div className="set-row set-row--switch">
            <Switch
              checked={placeOn}
              onChange={(v) => {
                setPlaceOpen(v);
                if (!v) set({ placeAddress: emptyAddress() });
              }}
              label={`${words.Business.nom} je jinde než sídlo`}
              description="Adresu provozovny uvidí klienti v portálu; bez ní se ukazuje sídlo."
            />
          </div>
          {placeOn && addressFields('placeAddress', ` ${words.business.gen}`)}
        </section>

        <section className="set-form__section" aria-labelledby="set-biz-h-contact">
          <h3 id="set-biz-h-contact" className="set-form__title">
            Kontakt pro klienty
          </h3>
          <div className="set-form__grid set-form__grid--3">
            <Field label="Telefon" optional error={err('phone')}>
              <Input value={draft.phone} type="tel" maxLength={40} autoComplete="tel" placeholder="+420 777 123 456" onValueChange={(v) => set({ phone: v })} onBlur={touch('phone')} />
            </Field>
            <Field label="E-mail" optional error={err('email')} hint="Bez něj se ukazuje e-mail odesílatele.">
              <Input value={draft.email} type="email" maxLength={254} autoComplete="email" onValueChange={(v) => set({ email: v })} onBlur={touch('email')} />
            </Field>
            <Field label="Web" optional error={err('web')}>
              <Input value={draft.web} maxLength={200} placeholder="www.example.cz" onValueChange={(v) => set({ web: v })} onBlur={touch('web')} />
            </Field>
          </div>
        </section>

        <section className="set-form__section" aria-labelledby="set-biz-h-invoice">
          <h3 id="set-biz-h-invoice" className="set-form__title">
            Faktury od platformy
          </h3>
          <Field label="E-mail pro faktury" optional error={err('invoiceEmail')} hint="Kam posíláme faktury za rezervační systém. Klienti ho nevidí.">
            <Input value={draft.invoiceEmail} type="email" maxLength={254} className="set-ctl-lg" onValueChange={(v) => set({ invoiceEmail: v })} onBlur={touch('invoiceEmail')} />
          </Field>
        </section>

        <div className="set-mailpreview" aria-label="Náhled patičky e-mailů">
          <span className="set-mailpreview__label">Patička automatických e-mailů</span>
          <p className="set-biz__footer">
            {identity.length ? identity.map((line) => <span key={line}>{line}</span>) : <span className="muted">Zobrazí se, až vyplníte název, IČO a sídlo.</span>}
          </p>
        </div>

        <div className="set-brand__actions">
          {dirty && (
            <Button variant="ghost" onClick={discard}>
              Zahodit změny
            </Button>
          )}
          <Button variant="primary" icon="check" onClick={save} disabled={!dirty}>
            Uložit fakturační údaje
          </Button>
        </div>
      </div>
    </Card>
  );
}
