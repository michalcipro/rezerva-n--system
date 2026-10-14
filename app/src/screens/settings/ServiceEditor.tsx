import { useMemo, useState } from 'react';
import type { Service } from '../../domain/types';
import { upsertService } from '../../engine/commands';
import { countLabel, formatDuration, formatMoney } from '../../engine/format';
import { therapistName } from '../../engine/selectors';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { Button, Callout, Checkbox, Drawer, Field, Input, NumberInput, Segmented, Select, Switch, Textarea } from '../../ui';
import { TherapistAvatar } from '../../components/domain';
import { byOrder, clone, cx, deepEqual, durationOptions, validateService, type ServiceErrors } from './helpers';
import { FieldGroup } from './shared';

const BUFFERS = [0, 5, 10, 15];

export function ServiceEditor({ initial, onClose }: { initial: Service; onClose: () => void }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const [draft, setDraft] = useState<Service>(() => clone(initial));
  const [touched, setTouched] = useState<Partial<Record<keyof ServiceErrors, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const isNew = !initial.id;

  const categories = useMemo(() => [...clinic.categories].sort(byOrder), [clinic.categories]);
  const therapists = useMemo(
    () => [...clinic.therapists].sort((a, b) => Number(b.active) - Number(a.active) || a.order - b.order),
    [clinic.therapists],
  );
  const errors = validateService(draft, categories.map((c) => c.id));
  const err = (k: keyof ServiceErrors): string | undefined => (submitted || touched[k] ? errors[k] : undefined);
  const dirty = isNew || !deepEqual(draft, initial);

  const upcoming = useMemo(
    () => (isNew ? 0 : clinic.bookings.filter((b) => b.serviceId === initial.id && b.status === 'confirmed' && b.end > now).length),
    [clinic.bookings, initial.id, isNew, now],
  );

  const set = <K extends keyof Service>(key: K, value: Service[K]): void => setDraft((d) => ({ ...d, [key]: value }));
  const touch = (key: keyof ServiceErrors) => (): void => setTouched((t) => ({ ...t, [key]: true }));

  const toggleTherapist = (id: string, on: boolean): void =>
    setDraft((d) => ({ ...d, therapistIds: on ? [...d.therapistIds, id] : d.therapistIds.filter((x) => x !== id) }));

  const save = (): void => {
    setSubmitted(true);
    const firstError = (Object.keys(errors) as (keyof ServiceErrors)[])[0];
    if (firstError) {
      document.getElementById(`set-svc-${firstError}`)?.focus();
      return;
    }
    const payload: Service = {
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
      capacity: draft.kind === 'group' ? draft.capacity : 1,
      therapistIds: therapists.filter((t) => draft.therapistIds.includes(t.id)).map((t) => t.id),
    };
    const r = run(upsertService, payload, {
      success: isNew ? `Služba „${payload.name}" přidána do ceníku` : `Služba „${payload.name}" uložena`,
    });
    if (r.ok) onClose();
  };

  const bufferOptions = BUFFERS.includes(draft.bufferMin) ? BUFFERS : [...BUFFERS, draft.bufferMin].sort((a, b) => a - b);
  const blocked = draft.durationMin + draft.bufferMin;

  return (
    <Drawer
      open
      onClose={onClose}
      size="md"
      title={isNew ? 'Nová služba' : 'Úprava služby'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Zpět
          </Button>
          <span className="spacer" />
          <Button variant="primary" icon="check" onClick={save} disabled={!dirty}>
            {isNew ? 'Přidat službu' : 'Uložit změny'}
          </Button>
        </>
      }
    >
      <div className="set-form">
        <section className="set-form__section" aria-labelledby="set-svc-h-basic">
          <h3 id="set-svc-h-basic" className="set-form__title">
            Základní údaje
          </h3>
          <Field label="Název služby" error={err('name')}>
            <Input
              id="set-svc-name"
              value={draft.name}
              placeholder="např. Fyzioterapie 45 min"
              onValueChange={(v) => set('name', v)}
              onBlur={touch('name')}
              data-autofocus=""
              maxLength={80}
            />
          </Field>
          <Field label="Kategorie" error={err('categoryId')}>
            <Select
              id="set-svc-categoryId"
              value={draft.categoryId}
              placeholder="Vyberte kategorii"
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              onValueChange={(v) => set('categoryId', v)}
            />
          </Field>
          <FieldGroup
            label="Typ služby"
            hint={draft.kind === 'group' ? 'Termíny skupinové lekce určuje rozvrh lekcí.' : 'Jeden klient, jeden terapeut.'}
          >
            <Segmented
              aria-label="Typ služby"
              full
              value={draft.kind}
              onChange={(v) => setDraft((d) => ({ ...d, kind: v, capacity: v === 'group' ? Math.max(2, d.capacity > 1 ? d.capacity : 8) : 1 }))}
              options={[
                { value: 'individual', label: 'Individuální', icon: 'user' },
                { value: 'group', label: 'Skupinová lekce', icon: 'users' },
              ]}
            />
          </FieldGroup>
          {draft.kind === 'group' && (
            <Field label="Kapacita lekce" error={err('capacity')} hint="Výchozí počet míst; v rozvrhu lze upravit pro každou lekci.">
              <NumberInput
                id="set-svc-capacity"
                value={draft.capacity}
                min={2}
                max={50}
                suffix="míst"
                onChange={(v) => set('capacity', v)}
                onBlur={touch('capacity')}
              />
            </Field>
          )}
        </section>

        <section className="set-form__section" aria-labelledby="set-svc-h-time">
          <h3 id="set-svc-h-time" className="set-form__title">
            Délka a cena
          </h3>
          <div className="set-form__row">
            <Field label="Délka" error={errors.durationMin} hint="Vždy po 15 minutách">
              <Select
                id="set-svc-durationMin"
                value={String(draft.durationMin)}
                options={durationOptions(draft.durationMin)}
                onValueChange={(v) => set('durationMin', Number(v))}
              />
            </Field>
            <Field label="Cena" error={err('priceCzk')}>
              <NumberInput
                id="set-svc-priceCzk"
                value={draft.priceCzk}
                min={0}
                max={100000}
                step={10}
                suffix="Kč"
                onChange={(v) => set('priceCzk', v)}
                onBlur={touch('priceCzk')}
              />
            </Field>
          </div>
          <FieldGroup
            label="Rezerva po službě"
            error={err('bufferMin')}
            hint={
              draft.bufferMin
                ? `Čas na úklid a zápis. V kalendáři termín blokuje ${formatDuration(blocked)} (${formatDuration(draft.durationMin)} + ${formatDuration(draft.bufferMin)}).`
                : 'Čas na úklid a zápis – další klient se může objednat až po ní.'
            }
          >
            <Segmented
              aria-label="Rezerva po službě"
              full
              value={String(draft.bufferMin)}
              onChange={(v) => set('bufferMin', Number(v))}
              options={bufferOptions.map((b) => ({ value: String(b), label: b ? formatDuration(b) : 'Bez rezervy' }))}
            />
          </FieldGroup>
          {!isNew && upcoming > 0 && (draft.durationMin !== initial.durationMin || draft.priceCzk !== initial.priceCzk) && (
            <Callout tone="info" aria-live="polite">
              Na službu {upcoming === 1 ? 'je' : upcoming < 5 ? 'jsou' : 'je'}{' '}
              {countLabel(upcoming, ['nadcházející rezervace', 'nadcházející rezervace', 'nadcházejících rezervací'])}. Změna délky a ceny
              platí jen pro nové rezervace – stávající zůstávají za {formatMoney(initial.priceCzk)} v délce{' '}
              {formatDuration(initial.durationMin)}.
            </Callout>
          )}
        </section>

        <section className="set-form__section" aria-labelledby="set-svc-h-team">
          <h3 id="set-svc-h-team" className="set-form__title">
            Kdo službu poskytuje
          </h3>
          <div className="set-checklist" role="group" aria-labelledby="set-svc-h-team">
            {therapists.map((t) => (
              <Checkbox
                key={t.id}
                className={cx('set-checklist__item', !t.active && 'is-muted')}
                checked={draft.therapistIds.includes(t.id)}
                onChange={(on) => toggleTherapist(t.id, on)}
                label={
                  <span className="set-person">
                    <TherapistAvatar therapist={t} size="xs" />
                    <span>
                      {therapistName(t)}
                      {!t.active && <span className="muted"> · neaktivní</span>}
                    </span>
                  </span>
                }
                description={t.focus || undefined}
              />
            ))}
          </div>
          {draft.therapistIds.length === 0 && (
            <Callout tone="warning" icon="alert" aria-live="polite">
              Bez terapeuta si službu nikdo nezarezervuje – vyberte alespoň jednoho.
            </Callout>
          )}
        </section>

        <section className="set-form__section" aria-labelledby="set-svc-h-online">
          <h3 id="set-svc-h-online" className="set-form__title">
            Nabídka pro klienty
          </h3>
          <div className="set-switches">
            <Switch
              checked={draft.onlineBookable}
              onChange={(v) => set('onlineBookable', v)}
              label="Online rezervace"
              description="Klienti si službu mohou sami rezervovat v klientském portálu."
            />
            <Switch
              checked={draft.newClientsOnly}
              onChange={(v) => set('newClientsOnly', v)}
              label="Jen pro nové klienty"
              description="Např. vstupní vyšetření – stávajícím klientům se online nenabízí."
            />
            <Switch
              checked={draft.remote}
              onChange={(v) => set('remote', v)}
              label="Online konzultace (videohovor)"
              description="Klient nepřichází na kliniku, místnost se neobsazuje."
            />
          </div>
          <Field label="Popis pro klienty" hint="Zobrazí se při online rezervaci. Stačí jedna až dvě věty." optional>
            <Textarea
              value={draft.description}
              rows={3}
              maxLength={300}
              placeholder="Co klienta čeká, pro koho je služba vhodná…"
              onValueChange={(v) => set('description', v)}
            />
          </Field>
        </section>

        <section className="set-form__section set-form__section--last" aria-label="Stav služby">
          <Switch
            checked={draft.active}
            onChange={(v) => set('active', v)}
            label="Služba je v nabídce"
            description={
              draft.active
                ? 'Aktivní služba se zobrazuje v ceníku, kalendáři i online rezervaci.'
                : 'Skrytá služba zůstává v historii, ale nejde nově rezervovat.'
            }
          />
        </section>
      </div>
    </Drawer>
  );
}
