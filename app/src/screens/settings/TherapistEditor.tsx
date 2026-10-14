import { useMemo, useState } from 'react';
import type { ClinicState, Id, Therapist } from '../../domain/types';
import { setServiceTherapists, upsertTherapist } from '../../engine/commands';
import { countLabel, formatDayShort, formatDuration, formatMoney, formatTime } from '../../engine/format';
import { therapistName } from '../../engine/selectors';
import { dateOf } from '../../engine/time';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { Avatar, Button, Callout, Checkbox, Drawer, Field, Icon, Input, Select, Switch, Tabs } from '../../ui';
import { ToneDot } from '../../components/domain';
import { WEEKDAYS, byOrder, clone, cx, deepEqual, emptyWeek, hoursLabel, isEmail, templateEnd, validateWeek, weekMinutes, weekdayName } from './helpers';
import { TonePicker } from './shared';
import { WeekScheduleEditor } from './WeekScheduleEditor';
import './set-team.css';

export type TherapistTab = 'profile' | 'hours' | 'services';

export function newTherapist(clinic: ClinicState): Therapist {
  const used = new Set(clinic.therapists.map((t) => t.tone));
  const tone = (['teal', 'blue', 'rose', 'sand', 'violet', 'olive', 'slate'] as const).find((t) => !used.has(t)) ?? 'slate';
  const week = emptyWeek();
  for (const wd of [0, 1, 2, 3, 4] as const) week[wd] = [{ start: '08:00', end: '16:30' }];
  const breaks = emptyWeek();
  for (const wd of [0, 1, 2, 3, 4] as const) breaks[wd] = [{ start: '12:00', end: '12:30' }];
  return {
    id: '',
    title: '',
    firstName: '',
    lastName: '',
    focus: '',
    roomId: clinic.rooms[0]?.id ?? '',
    tone,
    email: '',
    workingHours: week,
    breaks,
    active: true,
    order: clinic.therapists.length,
  };
}

type ProfileErrors = Partial<Record<'firstName' | 'lastName' | 'email' | 'active', string>>;

const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));

export function TherapistEditor({
  initial,
  initialTab = 'profile',
  onClose,
}: {
  initial: Therapist;
  initialTab?: TherapistTab;
  onClose: () => void;
}): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const isNew = !initial.id;
  const [t, setT] = useState<Therapist>(() => clone(initial));
  const initialServices = useMemo(
    () => (isNew ? [] : clinic.services.filter((s) => s.therapistIds.includes(initial.id)).map((s) => s.id)),
    // jen při otevření editoru
    [],
  );
  const [serviceIds, setServiceIds] = useState<Id[]>(initialServices);
  const [tab, setTab] = useState<TherapistTab>(initialTab);
  const [submitted, setSubmitted] = useState(false);

  const futureBookings = useMemo(
    () =>
      isNew
        ? []
        : clinic.bookings
            .filter((b) => b.therapistId === initial.id && b.status === 'confirmed' && b.end > now && !b.sessionId)
            .sort((a, b) => (a.start < b.start ? -1 : 1)),
    [clinic.bookings, initial.id, isNew, now],
  );
  const lessons = useMemo(
    () =>
      clinic.groupTemplates
        .filter((g) => g.therapistId === initial.id && g.active && (!g.validTo || g.validTo >= dateOf(now)))
        .sort((a, b) => a.weekday - b.weekday || (a.start < b.start ? -1 : 1)),
    [clinic.groupTemplates, initial.id, now],
  );

  const weekValidation = validateWeek(t);
  const hoursError = Object.values(weekValidation).some((v) => v.hasError);
  const profile: ProfileErrors = {};
  if (!t.firstName.trim()) profile.firstName = 'Zadejte jméno.';
  if (!t.lastName.trim()) profile.lastName = 'Zadejte příjmení.';
  if (t.email.trim() && !isEmail(t.email)) profile.email = 'E-mail nemá platný tvar.';
  if (initial.active && !t.active && futureBookings.length)
    profile.active = `Má ${countLabel(futureBookings.length, ['nadcházející rezervaci', 'nadcházející rezervace', 'nadcházejících rezervací'])} (první ${formatDayShort(futureBookings[0].start)} ${formatTime(futureBookings[0].start)}). Nejdřív je přesuňte k jinému terapeutovi nebo zrušte – jinak by zmizely z kalendáře.`;
  const profileError = Object.keys(profile).length > 0;
  const show = (k: keyof ProfileErrors): string | undefined => (submitted || k === 'active' ? profile[k] : undefined);

  const dirty = isNew || !deepEqual(t, initial) || !sameSet(serviceIds, initialServices);
  const weekly = weekMinutes(t);
  const days = WEEKDAYS.filter((wd) => (t.workingHours[wd] ?? []).length > 0).length;
  const fullName = therapistName({ title: t.title.trim(), firstName: t.firstName.trim() || 'Nový', lastName: t.lastName.trim() || 'terapeut' });

  const save = (): void => {
    setSubmitted(true);
    if (profileError) {
      setTab('profile');
      return;
    }
    if (hoursError) {
      setTab('hours');
      return;
    }
    const payload: Therapist = {
      ...t,
      title: t.title.trim(),
      firstName: t.firstName.trim(),
      lastName: t.lastName.trim(),
      focus: t.focus.trim(),
      email: t.email.trim().toLowerCase(),
    };
    const r = run(upsertTherapist, payload, {
      success: isNew ? `${therapistName(payload)} je nově v týmu` : `Změny u ${therapistName(payload)} uloženy`,
    });
    if (!r.ok) return;
    const id = r.value;
    for (const svc of clinic.services) {
      const had = !isNew && svc.therapistIds.includes(id);
      const want = serviceIds.includes(svc.id);
      if (had === want) continue;
      run(
        setServiceTherapists,
        { serviceId: svc.id, therapistIds: want ? [...svc.therapistIds, id] : svc.therapistIds.filter((x) => x !== id) },
        { quiet: true },
      );
    }
    onClose();
  };

  const categories = [...clinic.categories].sort(byOrder);
  const servicesOf = (catId: string) =>
    clinic.services.filter((s) => s.categoryId === catId && (s.active || serviceIds.includes(s.id))).sort(byOrder);

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      title={isNew ? 'Nový člen týmu' : 'Úprava terapeuta'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Zpět
          </Button>
          <span className="spacer" />
          <Button variant="primary" icon="check" onClick={save} disabled={!dirty}>
            {isNew ? 'Přidat do týmu' : 'Uložit změny'}
          </Button>
        </>
      }
    >
      <div className="set-person-head">
        <Avatar initials={(t.firstName.charAt(0) + t.lastName.charAt(0)).toUpperCase() || '?'} tone={t.tone} size="lg" />
        <div className="set-person-head__text">
          <span className="set-person-head__name">{fullName}</span>
          <span className="set-person-head__meta">
            {t.focus.trim() || 'Zaměření nevyplněno'} · {hoursLabel(weekly)} týdně · {countLabel(serviceIds.length, ['služba', 'služby', 'služeb'])}
          </span>
        </div>
      </div>

      <Tabs<TherapistTab>
        aria-label="Části profilu"
        idPrefix="set-th"
        bordered
        value={tab}
        onChange={setTab}
        className="set-drawer-tabs"
        items={[
          { id: 'profile', label: <TabLabel text="Profil" error={profileError && submitted} /> },
          { id: 'hours', label: <TabLabel text="Pracovní doba" error={hoursError} /> },
          { id: 'services', label: 'Služby', count: serviceIds.length },
        ]}
      />

      {tab === 'profile' && (
        <div role="tabpanel" id="set-th-panel-profile" aria-labelledby="set-th-tab-profile" className="set-form set-tabpanel">
          <div className="set-form__grid set-form__grid--name">
            <Field label="Titul" optional>
              <Input value={t.title} maxLength={12} placeholder="Mgr." onValueChange={(v) => setT((c) => ({ ...c, title: v }))} />
            </Field>
            <Field label="Jméno" error={show('firstName')}>
              <Input value={t.firstName} maxLength={40} onValueChange={(v) => setT((c) => ({ ...c, firstName: v }))} data-autofocus={isNew ? '' : undefined} />
            </Field>
            <Field label="Příjmení" error={show('lastName')}>
              <Input value={t.lastName} maxLength={40} onValueChange={(v) => setT((c) => ({ ...c, lastName: v }))} />
            </Field>
          </div>
          <Field label="Zaměření" hint="Zobrazí se klientům při výběru terapeuta, např. „Sportovní fyzioterapie“.">
            <Input value={t.focus} maxLength={80} onValueChange={(v) => setT((c) => ({ ...c, focus: v }))} />
          </Field>
          <div className="set-form__grid">
            <Field label="E-mail" error={show('email')} optional>
              <Input type="email" value={t.email} maxLength={80} onValueChange={(v) => setT((c) => ({ ...c, email: v }))} />
            </Field>
            <Field label="Výchozí místnost">
              <Select
                value={t.roomId}
                placeholder="Vyberte místnost"
                options={clinic.rooms.map((r) => ({ value: r.id, label: r.name }))}
                onValueChange={(v) => setT((c) => ({ ...c, roomId: v }))}
              />
            </Field>
          </div>
          <TonePicker legend="Barva v kalendáři" value={t.tone} onChange={(tone) => setT((c) => ({ ...c, tone }))} />
          <Switch
            checked={t.active}
            onChange={(v) => setT((c) => ({ ...c, active: v }))}
            label="Aktivní člen týmu"
            description={
              t.active
                ? 'Zobrazuje se v kalendáři a klienti si ho mohou vybrat online.'
                : 'Neaktivní terapeut se nezobrazuje v kalendáři ani v online rezervaci.'
            }
          />
          {profile.active && (
            <Callout tone="danger" aria-live="polite">
              {show('active')}
            </Callout>
          )}
        </div>
      )}

      {tab === 'hours' && (
        <div role="tabpanel" id="set-th-panel-hours" aria-labelledby="set-th-tab-hours" className="set-form set-tabpanel">
          <p className="set-lead">
            Pravidelný týdenní rozvrh. Online rezervace nabízí jen časy v pracovní době mimo pauzy. Dovolenou, nemoc nebo lékaře zadejte jako{' '}
            <strong>nepřítomnost</strong>.
          </p>
          <WeekScheduleEditor
            value={{ workingHours: t.workingHours, breaks: t.breaks }}
            validation={weekValidation}
            onChange={(next) => setT((c) => ({ ...c, workingHours: next.workingHours, breaks: next.breaks }))}
          />
          <div className="set-week-total" aria-live="polite">
            <span>
              Celkem <strong>{formatDuration(weekly)}</strong> týdně
            </span>
            <span className="muted">· {countLabel(days, ['pracovní den', 'pracovní dny', 'pracovních dnů'])}</span>
          </div>
          {lessons.length > 0 && (
            <Callout tone="info" title="Skupinové lekce v rozvrhu">
              {lessons.map((g) => `${weekdayName(g.weekday)} ${formatTime(g.start)}–${formatTime(templateEnd(clinic, g))} ${g.title}`).join(' · ')}
            </Callout>
          )}
        </div>
      )}

      {tab === 'services' && (
        <div role="tabpanel" id="set-th-panel-services" aria-labelledby="set-th-tab-services" className="set-form set-tabpanel">
          <p className="set-lead">Vyberte služby, které {t.firstName.trim() || 'terapeut'} poskytuje. Klienti si ho mohou objednat jen na ně.</p>
          {categories.map((cat) => {
            const list = servicesOf(cat.id);
            if (!list.length) return null;
            const selected = list.filter((s) => serviceIds.includes(s.id)).length;
            return (
              <fieldset key={cat.id} className="set-svcgroup">
                <legend className="set-svcgroup__legend">
                  <Checkbox
                    checked={selected === list.length}
                    indeterminate={selected > 0 && selected < list.length}
                    onChange={(on) =>
                      setServiceIds((cur) => (on ? [...new Set([...cur, ...list.map((s) => s.id)])] : cur.filter((id) => !list.some((s) => s.id === id))))
                    }
                    label={
                      <span className="set-svcgroup__title">
                        <ToneDot tone={cat.tone} /> {cat.name}
                        <span className="muted">
                          {' '}
                          · {selected}/{list.length}
                        </span>
                      </span>
                    }
                  />
                </legend>
                <div className="set-svcgroup__list">
                  {list.map((s) => (
                    <Checkbox
                      key={s.id}
                      className={cx(!s.active && 'is-muted')}
                      checked={serviceIds.includes(s.id)}
                      onChange={(on) => setServiceIds((cur) => (on ? [...cur, s.id] : cur.filter((x) => x !== s.id)))}
                      label={s.name + (s.active ? '' : ' (skrytá)')}
                      description={`${formatDuration(s.durationMin)} · ${formatMoney(s.priceCzk)}${s.kind === 'group' ? ' · skupinová' : ''}`}
                    />
                  ))}
                </div>
              </fieldset>
            );
          })}
          {serviceIds.length === 0 && (
            <Callout tone="warning" icon="alert">
              Bez služeb si terapeuta nikdo nezarezervuje.
            </Callout>
          )}
        </div>
      )}
    </Drawer>
  );
}

function TabLabel({ text, error }: { text: string; error: boolean }): JSX.Element {
  return (
    <span className="set-tablabel">
      {text}
      {error && <Icon name="alertCircle" size={14} className="text-danger" title="Obsahuje chybu" />}
    </span>
  );
}
