import { useEffect, useMemo, useRef, useState } from 'react';
import type { Id, Stage, Tone } from '../../domain/types';
import { CONVERSION_FROM_STAGE, CONVERSION_TO_STAGE, STAGE_NAME_MAX } from '../../engine/crm';
import { countLabel, plural } from '../../engine/format';
import { newId } from '../../engine/ids';
import { useClinic } from '../../store/hooks';
import { navigate } from '../../store/session';
import { Badge, Button, Callout, Checkbox, Icon, IconButton, Input, Popover } from '../../ui';
import { STAGES_MAX, TONE_OPTIONS, cx, reorderStages, toneLabel, type SettingsErrors } from './helpers';
import { TonePicker } from './shared';

/** Kam po změně seznamu přesunout fokus (řádek se mohl přesunout nebo zmizet). */
type FocusTarget = { id: Id; part: 'up' | 'down' | 'name' } | { id: null; part: 'add' };

const stageLabel = (st: Stage, index: number): string => `„${st.name.trim() || `${index + 1}. fáze`}“`;

/** Barva pro novou fázi: první dosud nepoužitá, jinak nejméně používaná. */
function nextTone(stages: readonly Stage[]): Tone {
  const used = new Map<Tone, number>();
  for (const st of stages) used.set(st.tone, (used.get(st.tone) ?? 0) + 1);
  let best: Tone = TONE_OPTIONS[0].value;
  let bestCount = Infinity;
  for (const t of TONE_OPTIONS) {
    const n = used.get(t.value) ?? 0;
    if (n < bestCount) {
      best = t.value;
      bestCount = n;
    }
  }
  return best;
}

/**
 * Editor fází spolupráce (Nastavení → Fáze spolupráce). Pracuje nad konceptem nastavení;
 * ukládá se společně s ostatními sekcemi tlačítkem „Uložit změny“ (příkaz saveStages).
 */
export function StagesEditor({
  stages,
  onChange,
  errors,
}: {
  stages: Stage[];
  onChange: (stages: Stage[]) => void;
  errors: SettingsErrors;
}): JSX.Element {
  const clinic = useClinic();
  const listRef = useRef<HTMLOListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const [focus, setFocus] = useState<FocusTarget | null>(null);

  /** Počet klientů podle uložené fáze (smazat jde jen fázi bez klientů – stejně jako v příkazu saveStages). */
  const counts = useMemo(() => {
    const m = new Map<Id, number>();
    for (const c of clinic.clients) m.set(c.stageId, (m.get(c.stageId) ?? 0) + 1);
    return m;
  }, [clinic.clients]);

  const saved = clinic.settings.stages ?? [];
  const removedConversion = saved.filter(
    (st) => (st.id === CONVERSION_FROM_STAGE || st.id === CONVERSION_TO_STAGE) && !stages.some((x) => x.id === st.id),
  );

  useEffect(() => {
    if (!focus) return;
    setFocus(null);
    if (focus.id === null) {
      addRef.current?.focus();
      return;
    }
    const row = listRef.current?.querySelector<HTMLElement>(`[data-stage-id="${focus.id}"]`);
    if (!row) return;
    if (focus.part === 'name') {
      row.querySelector<HTMLInputElement>('input[type="text"], input:not([type])')?.focus();
      return;
    }
    const wanted = row.querySelector<HTMLButtonElement>(`[data-focus="${focus.part}"]`);
    const other = row.querySelector<HTMLButtonElement>(`[data-focus="${focus.part === 'up' ? 'down' : 'up'}"]`);
    (wanted && !wanted.disabled ? wanted : other)?.focus();
  }, [focus]);

  const update = (index: number, patch: Partial<Stage>): void =>
    onChange(
      stages.map((st, i) => {
        if (i !== index) return st;
        const next: Stage = { ...st, ...patch };
        if (!next.closed) delete next.closed;
        return next;
      }),
    );

  const move = (index: number, dir: -1 | 1): void => {
    const to = index + dir;
    if (to < 0 || to >= stages.length) return;
    const next = [...stages];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(reorderStages(next));
    setFocus({ id: stages[index].id, part: dir < 0 ? 'up' : 'down' });
  };

  const remove = (index: number): void => {
    const next = stages.filter((_, i) => i !== index);
    onChange(reorderStages(next));
    const neighbour = next[index] ?? next[index - 1];
    setFocus(neighbour ? { id: neighbour.id, part: 'name' } : { id: null, part: 'add' });
  };

  const add = (): void => {
    // nová fáze patří před ukončené fáze na konci seznamu
    let at = stages.length;
    while (at > 0 && stages[at - 1].closed) at--;
    const stage: Stage = { id: newId('st'), name: '', tone: nextTone(stages), order: at };
    onChange(reorderStages([...stages.slice(0, at), stage, ...stages.slice(at)]));
    setFocus({ id: stage.id, part: 'name' });
  };

  const blockedCount = stages.filter((st) => (counts.get(st.id) ?? 0) > 0).length;

  return (
    <div className="set-stages">
      {stages.length > 0 ? (
        <ol className="set-stages__list" ref={listRef} aria-label="Fáze spolupráce v pořadí">
          {stages.map((st, i) => {
            const count = counts.get(st.id) ?? 0;
            const label = stageLabel(st, i);
            const error = errors[`stages.${i}.empty`] ?? errors[`stages.${i}.name`];
            const errorId = `set-stage-err-${st.id}`;
            const blocked =
              count > 0
                ? `Fázi nelze smazat – ${plural(count, ['je', 'jsou', 'je'])} v ní ${countLabel(count, ['klient', 'klienti', 'klientů'])}.`
                : stages.length <= 1
                  ? 'Fázi nelze smazat – musí zůstat aspoň jedna.'
                  : null;
            return (
              <li key={st.id} className={cx('set-stage', st.closed && 'is-closed', error && 'has-error')} data-stage-id={st.id}>
                <span className="set-stage__num tnum" aria-hidden="true">
                  {i + 1}
                </span>
                <StageTone stage={st} label={label} onChange={(tone) => update(i, { tone })} />
                <Input
                  className="set-stage__name"
                  value={st.name}
                  maxLength={STAGE_NAME_MAX}
                  placeholder="Název fáze"
                  aria-label={`Název ${i + 1}. fáze`}
                  aria-describedby={error ? errorId : undefined}
                  invalid={!!error}
                  onValueChange={(name) => update(i, { name })}
                />
                <span className="set-stage__break" aria-hidden="true" />
                <Checkbox
                  className="set-stage__closed"
                  label={
                    <>
                      Ukončená<span className="set-stage__closed-rest"> fáze</span>
                    </>
                  }
                  aria-label={`${label} – ukončená fáze`}
                  checked={!!st.closed}
                  onChange={(closed) => update(i, { closed })}
                />
                <span className={cx('set-stage__count tnum', count === 0 && 'is-empty')}>
                  {count > 0 ? countLabel(count, ['klient', 'klienti', 'klientů']) : 'bez klientů'}
                </span>
                <span className="set-stage__actions">
                  <IconButton size="sm" icon="arrowUp" label={`Posunout fázi ${label} výš`} data-focus="up" disabled={i === 0} onClick={() => move(i, -1)} />
                  <IconButton
                    size="sm"
                    icon="arrowDown"
                    label={`Posunout fázi ${label} níž`}
                    data-focus="down"
                    disabled={i === stages.length - 1}
                    onClick={() => move(i, 1)}
                  />
                  <IconButton
                    size="sm"
                    icon="trash"
                    label={blocked ? `Smazat fázi ${label}. ${blocked}` : `Smazat fázi ${label}`}
                    title={blocked ?? undefined}
                    disabled={!!blocked}
                    onClick={() => remove(i)}
                  />
                </span>
                {error && (
                  <span id={errorId} className="field__error set-stage__error">
                    <Icon name="alertCircle" size={14} />
                    <span>{error}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="set-stages__empty">
          <Icon name="layers" size={20} />
          <span>Zatím tu není žádná fáze. Přidejte aspoň jednu, aby šlo klienty zařadit.</span>
        </div>
      )}
      {errors['stages.list'] && (
        <span className="field__error" role="alert">
          <Icon name="alertCircle" size={14} />
          <span>{errors['stages.list']}</span>
        </span>
      )}

      <div className="set-stages__foot">
        <Button ref={addRef} size="sm" variant="ghost" icon="plus" onClick={add} disabled={stages.length >= STAGES_MAX}>
          Přidat fázi
        </Button>
        <p className="set-stages__hint">
          {stages.length >= STAGES_MAX ? (
            `Fází může být nejvýše ${STAGES_MAX}.`
          ) : blockedCount > 0 ? (
            <>
              Smazat jde jen fázi bez klientů. Klienty nejdřív přesuňte do jiné fáze –{' '}
              <button type="button" className="link" onClick={() => navigate({ name: 'pipeline' })}>
                v Pipeline
              </button>{' '}
              nebo na kartě klienta.
            </>
          ) : (
            'Nová fáze se přidá před ukončené fáze; pořadí změníte šipkami.'
          )}
        </p>
      </div>

      {removedConversion.length > 0 && (
        <Callout tone="warning" title="Statistika konverze">
          Bez {removedConversion.length === 1 ? 'fáze' : 'fází'} {removedConversion.map((st) => `„${st.name}“`).join(' a ')} se ve
          statistikách nebude počítat konverze z Freetalku do aktivní spolupráce.
        </Callout>
      )}

      {stages.length > 0 && (
        <div className="set-stages__preview">
          <span className="set-stages__preview-label" id="set-stages-preview">
            Náhled pořadí
          </span>
          <ol className="set-stages__flow" aria-labelledby="set-stages-preview">
            {stages.map((st, i) => (
              <li key={st.id} className="set-stages__step">
                {i > 0 && <Icon name="chevronRight" size={12} className="set-stages__sep" />}
                <Badge tone={st.tone} dot={st.closed ? 'ring' : true}>
                  {st.name.trim() || 'Bez názvu'}
                </Badge>
              </li>
            ))}
          </ol>
          <span className="set-stages__legend">Prázdný kroužek označuje ukončenou fázi.</span>
        </div>
      )}
    </div>
  );
}

/** Barevný vzorek fáze; po kliknutí výběr barvy (stejný jako u kategorií). */
function StageTone({ stage, label, onChange }: { stage: Stage; label: string; onChange: (tone: Tone) => void }): JSX.Element {
  // výběr myší popover zavře, klávesnicí (šipky) ne – uživatel by jinak nemohl barvy procházet
  const pointer = useRef(false);
  return (
    <Popover
      label={`Barva fáze ${label}`}
      width={286}
      trigger={
        <button
          type="button"
          className={cx('set-stage__tone', `set-tone--${stage.tone}`)}
          aria-label={`Barva fáze ${label}: ${toneLabel(stage.tone)}. Změnit`}
          title={`Barva: ${toneLabel(stage.tone)}`}
        >
          <span className="set-stage__swatch" aria-hidden="true" />
          <Icon name="chevronDown" size={12} />
        </button>
      }
    >
      {(close) => (
        <div
          onPointerDown={() => (pointer.current = true)}
          onKeyDown={() => (pointer.current = false)}
        >
          <TonePicker
            legend="Barva fáze"
            value={stage.tone}
            hint={`Vybraná barva: ${toneLabel(stage.tone)}`}
            onChange={(tone) => {
              onChange(tone);
              if (pointer.current) close();
            }}
          />
        </div>
      )}
    </Popover>
  );
}
