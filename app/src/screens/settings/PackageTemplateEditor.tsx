import { useMemo, useState } from 'react';
import type { ClinicState, PackageTemplate } from '../../domain/types';
import { upsertPackageTemplate } from '../../engine/commands';
import { countLabel, formatDuration, formatMoney, formatPercent } from '../../engine/format';
import { getService } from '../../engine/selectors';
import { useClinic, useCommand } from '../../store/hooks';
import { Badge, Button, Callout, Checkbox, ChoiceChips, Drawer, Field, Input, NumberInput, Switch } from '../../ui';
import { ToneDot } from '../../components/domain';
import { byOrder, clone, cx, deepEqual, discountLabel, packagePricing, validityLabel } from './helpers';
import { FieldGroup } from './shared';
import './set-packages.css';

export function newPackageTemplate(clinic: ClinicState): PackageTemplate {
  return {
    id: '',
    name: '',
    description: '',
    entries: 10,
    serviceIds: [],
    priceCzk: 0,
    validityDays: 183,
    excusesAllowed: Math.min(10, clinic.settings.policy.excuses.perPackage),
    active: true,
    order: clinic.packageTemplates.length,
  };
}

const VALIDITY_PRESETS: { days: number; label: string }[] = [
  { days: 31, label: '1 měsíc' },
  { days: 92, label: '3 měsíce' },
  { days: 183, label: '6 měsíců' },
  { days: 365, label: '1 rok' },
];

const DISCOUNTS = [0, 5, 10, 15, 20];

type Errors = Partial<Record<'name' | 'entries' | 'priceCzk' | 'validityDays' | 'serviceIds' | 'excusesAllowed', string>>;

function validate(d: PackageTemplate): Errors {
  const e: Errors = {};
  if (!d.name.trim()) e.name = 'Zadejte název permanentky.';
  if (!(d.entries >= 1 && d.entries <= 100)) e.entries = 'Počet vstupů musí být 1–100.';
  if (!(d.priceCzk > 0)) e.priceCzk = 'Zadejte cenu permanentky.';
  if (!(d.validityDays >= 7 && d.validityDays <= 730)) e.validityDays = 'Platnost musí být 7–730 dní.';
  if (!d.serviceIds.length) e.serviceIds = 'Vyberte alespoň jednu službu, na kterou permanentka platí.';
  if (!(d.excusesAllowed >= 0 && d.excusesAllowed <= d.entries)) e.excusesAllowed = 'Omluvenek může být 0 až počet vstupů.';
  return e;
}

export function PackageTemplateEditor({ initial, onClose }: { initial: PackageTemplate; onClose: () => void }): JSX.Element {
  const clinic = useClinic();
  const run = useCommand();
  const [d, setD] = useState<PackageTemplate>(() => clone(initial));
  const [submitted, setSubmitted] = useState(false);
  const isNew = !initial.id;
  const errors = validate(d);
  const err = (k: keyof Errors): string | undefined => (submitted ? errors[k] : undefined);
  const pricing = packagePricing(clinic, d);
  const discount = discountLabel(pricing);
  const dirty = isNew || !deepEqual(d, initial);
  const sold = useMemo(() => (isNew ? 0 : clinic.packages.filter((p) => p.templateId === initial.id).length), [clinic.packages, initial.id, isNew]);

  const categories = [...clinic.categories].sort(byOrder);
  const servicesOf = (catId: string) =>
    clinic.services.filter((s) => s.categoryId === catId && (s.active || d.serviceIds.includes(s.id))).sort(byOrder);

  const firstService = d.serviceIds.map((id) => getService(clinic, id)).find(Boolean);
  const suggestedDescription = firstService
    ? `${d.entries}× ${firstService.name.charAt(0).toLowerCase()}${firstService.name.slice(1)}${d.serviceIds.length > 1 ? ' a další' : ''}`
    : '';
  const singleTotal = pricing.singleMax !== null ? pricing.singleMax * d.entries : null;
  const priceFor = (pct: number): number | null => (singleTotal !== null ? Math.round((singleTotal * (100 - pct)) / 100 / 10) * 10 : null);
  const activeDiscount = DISCOUNTS.find((p) => priceFor(p) === d.priceCzk);

  const save = (): void => {
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    const payload: PackageTemplate = {
      ...d,
      name: d.name.trim(),
      description: d.description.trim() || suggestedDescription,
      serviceIds: clinic.services.filter((s) => d.serviceIds.includes(s.id)).map((s) => s.id),
    };
    const r = run(upsertPackageTemplate, payload, {
      success: isNew ? `Permanentka „${payload.name}" je v nabídce` : `Permanentka „${payload.name}" uložena`,
    });
    if (r.ok) onClose();
  };

  return (
    <Drawer
      open
      onClose={onClose}
      size="md"
      title={isNew ? 'Nová permanentka' : 'Úprava permanentky'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Zpět
          </Button>
          <span className="spacer" />
          <Button variant="primary" icon="check" onClick={save} disabled={!dirty}>
            {isNew ? 'Přidat do nabídky' : 'Uložit změny'}
          </Button>
        </>
      }
    >
      <div className="set-form">
        <div className="set-pricebox" aria-live="polite">
          <div className="set-pricebox__main">
            <span className="set-pricebox__label">Cena za vstup</span>
            <span className="set-pricebox__value tnum">{d.entries > 0 && d.priceCzk > 0 ? formatMoney(pricing.perEntry) : '—'}</span>
          </div>
          <div className="set-pricebox__side">
            {pricing.singleMin !== null ? (
              <>
                <span>
                  Jednotlivě{' '}
                  {pricing.singleMin === pricing.singleMax
                    ? formatMoney(pricing.singleMin)
                    : `${formatMoney(pricing.singleMin)}–${formatMoney(pricing.singleMax ?? 0)}`}
                </span>
                {discount && d.priceCzk > 0 && (
                  <Badge tone={discount.tone} size="md">
                    {discount.text}
                  </Badge>
                )}
                {pricing.savingsMax !== null && pricing.savingsMax > 0 && d.priceCzk > 0 && (
                  <span className="muted">
                    klient ušetří {pricing.savingsMin !== null && pricing.savingsMin !== pricing.savingsMax && pricing.savingsMin > 0 ? `${formatMoney(pricing.savingsMin)}–` : ''}
                    {formatMoney(pricing.savingsMax)}
                  </span>
                )}
              </>
            ) : (
              <span className="muted">Vyberte služby – porovnáme cenu s jednotlivými vstupy.</span>
            )}
          </div>
        </div>

        <Field label="Název" error={err('name')}>
          <Input value={d.name} maxLength={40} placeholder="např. Koučink 10×" onValueChange={(v) => setD((c) => ({ ...c, name: v }))} data-autofocus="" />
        </Field>
        <Field
          label="Popis pro klienty"
          optional
          hint={
            !d.description.trim() && suggestedDescription ? (
              <>
                Prázdný popis doplníme automaticky:{' '}
                <button type="button" className="link" onClick={() => setD((c) => ({ ...c, description: suggestedDescription }))}>
                  „{suggestedDescription}"
                </button>
              </>
            ) : undefined
          }
        >
          <Input value={d.description} maxLength={80} placeholder="např. 10 sezení mentálního koučinku" onValueChange={(v) => setD((c) => ({ ...c, description: v }))} />
        </Field>

        <section className="set-form__section" aria-labelledby="set-pkg-h-svc">
          <h3 id="set-pkg-h-svc" className="set-form__title">
            Platí na služby
          </h3>
          <div className="set-svcgroups">
            {categories.map((cat) => {
              const list = servicesOf(cat.id);
              if (!list.length) return null;
              return (
                <fieldset key={cat.id} className="set-svcgroup">
                  <legend className="set-svcgroup__legend set-svcgroup__title">
                    <ToneDot tone={cat.tone} /> {cat.name}
                  </legend>
                  <div className="set-svcgroup__list">
                    {list.map((s) => (
                      <Checkbox
                        key={s.id}
                        className={cx(!s.active && 'is-muted')}
                        checked={d.serviceIds.includes(s.id)}
                        onChange={(on) =>
                          setD((c) => ({ ...c, serviceIds: on ? [...c.serviceIds, s.id] : c.serviceIds.filter((x) => x !== s.id) }))
                        }
                        label={s.name + (s.active ? '' : ' (skrytá)')}
                        description={`${formatDuration(s.durationMin)} · ${formatMoney(s.priceCzk)}`}
                      />
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>
          {err('serviceIds') && (
            <Callout tone="danger" aria-live="polite">
              {err('serviceIds')}
            </Callout>
          )}
        </section>

        <section className="set-form__section" aria-labelledby="set-pkg-h-price">
          <h3 id="set-pkg-h-price" className="set-form__title">
            Vstupy a cena
          </h3>
          <div className="set-form__grid">
            <Field label="Počet vstupů" error={err('entries')}>
              <NumberInput
                value={d.entries}
                min={1}
                max={100}
                suffix={d.entries === 1 ? 'vstup' : d.entries < 5 ? 'vstupy' : 'vstupů'}
                onChange={(v) => setD((c) => ({ ...c, entries: v, excusesAllowed: Math.min(c.excusesAllowed, v) }))}
              />
            </Field>
            <Field label="Cena permanentky" error={err('priceCzk')}>
              <NumberInput value={d.priceCzk} min={0} max={500000} step={50} suffix="Kč" onChange={(v) => setD((c) => ({ ...c, priceCzk: v }))} />
            </Field>
          </div>
          {singleTotal !== null && (
            <FieldGroup
              label="Rychlý výpočet ceny"
              hint={`Jednotlivé vstupy by stály ${formatMoney(singleTotal)}${pricing.singleMin !== pricing.singleMax ? ' (podle nejdražší služby)' : ''}.`}
            >
              <ChoiceChips
                aria-label="Sleva oproti jednotlivým vstupům"
                value={activeDiscount !== undefined ? String(activeDiscount) : null}
                onChange={(v) => {
                  const price = priceFor(Number(v));
                  if (price !== null) setD((c) => ({ ...c, priceCzk: price }));
                }}
                options={DISCOUNTS.map((p) => ({
                  value: String(p),
                  label: p ? `−${formatPercent(p)}` : 'Bez slevy',
                  ariaLabel: p ? `Sleva ${p} procent – ${formatMoney(priceFor(p) ?? 0)}` : `Bez slevy – ${formatMoney(priceFor(0) ?? 0)}`,
                }))}
              />
            </FieldGroup>
          )}
        </section>

        <section className="set-form__section" aria-labelledby="set-pkg-h-rules">
          <h3 id="set-pkg-h-rules" className="set-form__title">
            Platnost a omluvenky
          </h3>
          <Field label="Platnost od zakoupení" error={err('validityDays')} hint={validityLabel(d.validityDays)}>
            <NumberInput value={d.validityDays} min={7} max={730} step={1} suffix="dní" onChange={(v) => setD((c) => ({ ...c, validityDays: v }))} />
          </Field>
          <ChoiceChips
            aria-label="Rychlá volba platnosti"
            value={VALIDITY_PRESETS.some((p) => p.days === d.validityDays) ? String(d.validityDays) : null}
            onChange={(v) => setD((c) => ({ ...c, validityDays: Number(v) }))}
            options={VALIDITY_PRESETS.map((p) => ({ value: String(p.days), label: p.label }))}
          />
          <Field
            label="Omluvenky"
            error={err('excusesAllowed')}
            hint={`Kolikrát může klient pozdě zrušený termín omluvit, aniž by vstup propadl. Výchozí počet v nastavení: ${clinic.settings.policy.excuses.perPackage}.`}
          >
            <NumberInput
              value={d.excusesAllowed}
              min={0}
              max={Math.max(0, d.entries)}
              suffix={d.excusesAllowed === 1 ? 'omluvenka' : d.excusesAllowed > 1 && d.excusesAllowed < 5 ? 'omluvenky' : 'omluvenek'}
              onChange={(v) => setD((c) => ({ ...c, excusesAllowed: v }))}
            />
          </Field>
        </section>

        <Switch
          checked={d.active}
          onChange={(v) => setD((c) => ({ ...c, active: v }))}
          label="Nabízet k prodeji"
          description={d.active ? 'Recepce ji může prodat a klienti koupit online.' : 'Permanentka se už neprodává; prodané zůstávají platné.'}
        />
        {!isNew && sold > 0 && dirty && (
          <Callout tone="info">
            Změny platí jen pro nově prodané permanentky. {countLabel(sold, ['prodaná permanentka zůstává', 'prodané permanentky zůstávají', 'prodaných permanentek zůstává'])} beze
            změny.
          </Callout>
        )}
      </div>
    </Drawer>
  );
}
