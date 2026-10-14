import { useMemo, useState } from 'react';
import type { ClinicState, GroupTemplate, LocalDate, Weekday } from '../../domain/types';
import { upsertGroupTemplate } from '../../engine/commands';
import { countLabel, formatDate, formatDayShort, formatDuration, formatMoney, formatTime } from '../../engine/format';
import { getRoom, getService, getTherapist, therapistName } from '../../engine/selectors';
import { addDays, dateOf, isValidLocalDate, maxStr } from '../../engine/time';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { Button, Callout, Checkbox, Dialog, EmptyState, Field, Input, NumberInput, Select, Switch } from '../../ui';
import { WEEKDAYS, byOrder, clone, deepEqual, rangesLabel, templateBookings, templateEnd, weekdayName } from './helpers';
import { TimeSelect } from './shared';

const LESSON_FROM = 6 * 60;
const LESSON_TO = 21 * 60 + 45;

export function newGroupTemplate(clinic: ClinicState, weekday: Weekday, today: LocalDate): GroupTemplate {
  const svc = clinic.services.filter((s) => s.kind === 'group' && s.active).sort(byOrder)[0];
  const trainerId =
    svc?.therapistIds.find((id) => getTherapist(clinic, id)?.active) ?? clinic.therapists.find((t) => t.active)?.id ?? '';
  const trainer = getTherapist(clinic, trainerId);
  return {
    id: '',
    serviceId: svc?.id ?? '',
    therapistId: trainerId,
    roomId: trainer?.roomId ?? clinic.rooms[0]?.id ?? '',
    weekday,
    start: '17:00',
    title: svc?.name ?? '',
    capacity: svc?.capacity ?? 8,
    validFrom: today,
    validTo: null,
    active: true,
  };
}

type Errors = Partial<Record<'serviceId' | 'title' | 'therapistId' | 'capacity' | 'validFrom' | 'validTo' | 'active', string>>;

export function GroupTemplateEditor({
  initial,
  onClose,
  onCreateService,
}: {
  initial: GroupTemplate;
  onClose: () => void;
  onCreateService: () => void;
}): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const today = dateOf(now);
  const [d, setD] = useState<GroupTemplate>(() => clone(initial));
  const [submitted, setSubmitted] = useState(false);
  const isNew = !initial.id;

  const groupServices = useMemo(
    () => clinic.services.filter((s) => s.kind === 'group' && (s.active || s.id === initial.serviceId)).sort(byOrder),
    [clinic.services, initial.serviceId],
  );
  const trainers = useMemo(() => clinic.therapists.filter((t) => t.active || t.id === initial.therapistId).sort(byOrder), [clinic.therapists, initial.therapistId]);
  const svc = getService(clinic, d.serviceId);
  const therapist = getTherapist(clinic, d.therapistId);
  const end = templateEnd(clinic, d);

  const future = useMemo(() => (isNew ? [] : templateBookings(clinic, initial.id, now)), [clinic, initial.id, isNew, now]);
  const firstDate = future.length ? dateOf(future[0].start) : null;
  const lastDate = future.length ? dateOf(future[future.length - 1].start) : null;
  const structural = !isNew && (d.serviceId !== initial.serviceId || d.weekday !== initial.weekday || d.start !== initial.start);
  const split = structural && lastDate !== null;
  const splitFrom = split && lastDate ? maxStr(d.validFrom, addDays(lastDate, 1)) : null;
  const dirty = isNew || !deepEqual(d, initial);

  const errors: Errors = {};
  if (!svc || svc.kind !== 'group') errors.serviceId = 'Vyberte skupinovou službu.';
  if (!d.title.trim()) errors.title = 'Zadejte název lekce, jak se má zobrazit v rozvrhu.';
  if (!therapist) errors.therapistId = 'Vyberte trenéra.';
  if (!(d.capacity >= 1)) errors.capacity = 'Kapacita musí být alespoň 1 místo.';
  if (!isValidLocalDate(d.validFrom)) errors.validFrom = 'Zadejte datum začátku platnosti.';
  if (d.validTo !== null && !isValidLocalDate(d.validTo)) errors.validTo = 'Zadejte platné datum, nebo zvolte „Bez omezení".';
  else if (d.validTo !== null && d.validTo < (splitFrom ?? d.validFrom)) errors.validTo = 'Konec platnosti musí být po jejím začátku.';
  if (!split && firstDate && lastDate) {
    const who = countLabel(future.length, ['přihlášený klient', 'přihlášení klienti', 'přihlášených klientů']);
    if (!d.active)
      errors.active = `Na nadcházející termíny ${future.length === 1 ? 'je' : future.length < 5 ? 'jsou' : 'je'} ${who} (poslední ${formatDayShort(lastDate)}). Pozastavit lekci lze, až proběhnou – nebo nastavte konec platnosti.`;
    if (d.validTo && d.validTo < lastDate)
      errors.validTo = `Platnost musí trvat alespoň do ${formatDayShort(lastDate)} – na tento termín jsou přihlášení klienti.`;
    if (d.validFrom > firstDate)
      errors.validFrom = `Platnost musí začínat nejpozději ${formatDayShort(firstDate)} – na tento termín jsou přihlášení klienti.`;
  }
  const err = (k: keyof Errors): string | undefined => (submitted || k === 'active' || k === 'validTo' || k === 'validFrom' ? errors[k] : undefined);

  const warnings: string[] = [];
  if (svc && therapist && !svc.therapistIds.includes(therapist.id))
    warnings.push(`${therapistName(therapist)} službu „${svc.name}" v katalogu neposkytuje. Přidejte ho ke službě v ceníku.`);
  if (therapist) {
    const work = therapist.workingHours[d.weekday] ?? [];
    if (!work.some((r) => r.start <= d.start && end <= r.end)) {
      warnings.push(
        work.length
          ? `Lekce je mimo pracovní dobu trenéra (${weekdayName(d.weekday).toLowerCase()} ${rangesLabel(work)}).`
          : `${therapistName(therapist)} v tento den podle rozvrhu nepracuje.`,
      );
    }
    const br = (therapist.breaks[d.weekday] ?? []).find((r) => r.start < end && d.start < r.end);
    if (br) warnings.push(`Lekce zasahuje do pauzy trenéra (${formatTime(br.start)}–${formatTime(br.end)}).`);
  }
  for (const o of clinic.groupTemplates) {
    if (o.id === initial.id || !o.active || o.weekday !== d.weekday) continue;
    const oEnd = templateEnd(clinic, o);
    if (!(o.start < end && d.start < oEnd)) continue;
    const aTo = d.validTo ?? '9999-12-31';
    const bTo = o.validTo ?? '9999-12-31';
    if (!(d.validFrom <= bTo && o.validFrom <= aTo)) continue;
    if (o.therapistId === d.therapistId)
      warnings.push(`${therapistName(therapist)} má ve stejný čas lekci „${o.title}" (${formatTime(o.start)}–${formatTime(oEnd)}).`);
    else if (o.roomId === d.roomId)
      warnings.push(`${getRoom(clinic, d.roomId)?.name ?? 'Místnost'} je ve stejný čas obsazená lekcí „${o.title}".`);
  }
  if (!split && future.length) {
    const perSession = new Map<string, number>();
    for (const b of future) perSession.set(b.sessionId ?? '', (perSession.get(b.sessionId ?? '') ?? 0) + 1);
    const maxTaken = Math.max(0, ...perSession.values());
    if (d.capacity < maxTaken)
      warnings.push(`Na některý termín je přihlášeno už ${maxTaken} klientů – víc, než je nová kapacita. Nikoho neodhlásíme, jen se nebudou přijímat další.`);
    if (d.therapistId !== initial.therapistId)
      warnings.push('U klientů, kteří už jsou přihlášení, zůstane v rezervaci uvedený původní trenér.');
  }

  const changeService = (serviceId: string): void => {
    const next = getService(clinic, serviceId);
    setD((cur) => {
      const prev = getService(clinic, cur.serviceId);
      const keepTrainer = next?.therapistIds.includes(cur.therapistId);
      const trainerId = keepTrainer ? cur.therapistId : next?.therapistIds.find((id) => getTherapist(clinic, id)?.active) ?? cur.therapistId;
      return {
        ...cur,
        serviceId,
        title: !cur.title.trim() || cur.title === prev?.name ? next?.name ?? cur.title : cur.title,
        capacity: !prev || cur.capacity === prev.capacity ? next?.capacity ?? cur.capacity : cur.capacity,
        therapistId: trainerId,
      };
    });
  };

  const changeTrainer = (therapistId: string): void => {
    setD((cur) => {
      const prevRoom = getTherapist(clinic, cur.therapistId)?.roomId;
      const nextRoom = getTherapist(clinic, therapistId)?.roomId;
      return { ...cur, therapistId, roomId: cur.roomId === prevRoom && nextRoom ? nextRoom : cur.roomId };
    });
  };

  const save = (): void => {
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    const payload: GroupTemplate = { ...d, title: d.title.trim() };
    if (split && lastDate && splitFrom) {
      const closeOld = run(upsertGroupTemplate, { ...initial, validTo: lastDate }, { quiet: true });
      if (!closeOld.ok) return;
      const r = run(upsertGroupTemplate, { ...payload, id: '', validFrom: splitFrom }, {
        success: `Lekce uložena – nový čas platí od ${formatDayShort(splitFrom)}`,
      });
      if (r.ok) onClose();
      return;
    }
    const r = run(upsertGroupTemplate, payload, { success: isNew ? `Lekce „${payload.title}" přidána do rozvrhu` : 'Lekce uložena' });
    if (r.ok) onClose();
  };

  if (!groupServices.length) {
    return (
      <Dialog open onClose={onClose} size="sm" title="Nová lekce v rozvrhu">
        <EmptyState
          compact
          icon="users"
          title="Nejdřív založte skupinovou službu"
          text="Lekce v rozvrhu vychází ze skupinové služby v ceníku (délka, cena, kapacita)."
          action={
            <Button variant="primary" icon="plus" onClick={onCreateService}>
              Nová skupinová služba
            </Button>
          }
        />
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={isNew ? 'Nová lekce v rozvrhu' : `Lekce ${initial.title}`}
      description={
        svc
          ? `${svc.name} · ${formatDuration(svc.durationMin)} · ${formatMoney(svc.priceCzk)} za lekci`
          : 'Pravidelná lekce – termíny se v kalendáři vytvoří každý týden.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Zpět
          </Button>
          <Button variant="primary" icon="check" onClick={save} disabled={!dirty}>
            {isNew ? 'Přidat do rozvrhu' : 'Uložit lekci'}
          </Button>
        </>
      }
    >
      <div className="set-form">
        <div className="set-form__grid">
          <Field label="Skupinová služba" error={err('serviceId')}>
            <Select
              value={d.serviceId}
              placeholder="Vyberte službu"
              options={groupServices.map((s) => ({ value: s.id, label: s.name + (s.active ? '' : ' (neaktivní)') }))}
              onValueChange={changeService}
            />
          </Field>
          <Field label="Název v rozvrhu" error={err('title')}>
            <Input value={d.title} maxLength={60} onValueChange={(v) => setD((c) => ({ ...c, title: v }))} />
          </Field>
          <Field label="Den v týdnu">
            <Select
              value={String(d.weekday)}
              options={WEEKDAYS.map((wd) => ({ value: String(wd), label: weekdayName(wd) }))}
              onValueChange={(v) => setD((c) => ({ ...c, weekday: Number(v) as Weekday }))}
            />
          </Field>
          <Field label="Začátek" hint={svc ? `Konec v ${formatTime(end)} (${formatDuration(svc.durationMin)})` : undefined}>
            <TimeSelect value={d.start} from={LESSON_FROM} to={LESSON_TO} onChange={(v) => setD((c) => ({ ...c, start: v }))} />
          </Field>
          <Field label="Trenér" error={err('therapistId')}>
            <Select
              value={d.therapistId}
              placeholder="Vyberte trenéra"
              options={trainers.map((t) => ({
                value: t.id,
                label: therapistName(t) + (svc && !svc.therapistIds.includes(t.id) ? ' – službu neposkytuje' : ''),
              }))}
              onValueChange={changeTrainer}
            />
          </Field>
          <Field label="Místnost">
            <Select
              value={d.roomId}
              options={clinic.rooms.map((r) => ({ value: r.id, label: r.name }))}
              onValueChange={(v) => setD((c) => ({ ...c, roomId: v }))}
            />
          </Field>
          <Field label="Kapacita" error={err('capacity')} hint={svc ? `Výchozí kapacita služby: ${svc.capacity}` : undefined}>
            <NumberInput value={d.capacity} min={1} max={60} suffix="míst" onChange={(v) => setD((c) => ({ ...c, capacity: v }))} />
          </Field>
          <div className="set-form__spacer" aria-hidden="true" />
          <Field label="Platí od" error={err('validFrom')}>
            <Input type="date" value={d.validFrom} onValueChange={(v) => setD((c) => ({ ...c, validFrom: v }))} />
          </Field>
          <div className="set-validto">
            <Field label="Platí do" error={err('validTo')}>
              <Input
                type="date"
                value={d.validTo ?? ''}
                disabled={d.validTo === null}
                min={d.validFrom}
                onValueChange={(v) => setD((c) => ({ ...c, validTo: v || null }))}
              />
            </Field>
            <Checkbox
              checked={d.validTo === null}
              onChange={(on) => setD((c) => ({ ...c, validTo: on ? null : maxStr(addDays(today, 90), c.validFrom) }))}
              label="Bez omezení"
            />
          </div>
        </div>

        <Switch
          checked={d.active}
          onChange={(v) => setD((c) => ({ ...c, active: v }))}
          label="Lekce probíhá"
          description={d.active ? 'Termíny se zobrazují v kalendáři a v online rezervaci.' : 'Pozastavená lekce se v rozvrhu nezobrazuje.'}
        />
        {errors.active && (
          <Callout
            tone="danger" aria-live="polite"
            actions={
              lastDate ? (
                <Button size="sm" variant="secondary" onClick={() => setD((c) => ({ ...c, active: true, validTo: lastDate }))}>
                  Ukončit po {formatDayShort(lastDate)}
                </Button>
              ) : undefined
            }
          >
            {errors.active}
          </Callout>
        )}

        {split && lastDate && splitFrom && (
          <Callout tone="info" title="Lekce s přihlášenými klienty" aria-live="polite">
            Na nadcházející termíny {future.length === 1 ? 'je' : future.length < 5 ? 'jsou' : 'je'} přihlášeno{' '}
            {countLabel(future.length, ['klient', 'klienti', 'klientů'])} (poslední {formatDayShort(lastDate)}). Dosavadní termíny proto
            proběhnou beze změny a nový čas začne platit od {formatDate(splitFrom)} – v rozvrhu vznikne navazující lekce.
          </Callout>
        )}
        {warnings.length > 0 && (
          <Callout tone="warning" icon="alert" title="Zkontrolujte" aria-live="polite">
            <ul className="set-bullets">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Callout>
        )}
      </div>
    </Dialog>
  );
}
