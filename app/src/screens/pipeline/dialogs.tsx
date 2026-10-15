import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { Id } from '../../domain/types';
import { FollowUpDialog, StageBadge } from '../../components/crm';
import { clientStage, stagesSorted } from '../../engine/crm';
import { clientName, getClient } from '../../engine/selectors';
import { useClinic, useNow } from '../../store/hooks';
import { Button, ChoiceChips, Dialog, Field, Input, Textarea, cx } from '../../ui';
import { recentSessionClients, searchClients, STAGE_NOTE_MAX } from './model';
import './pipeline.css';

/* ------------------------------------------------------------------ */
/* Přesun do fáze s poznámkou                                          */
/* ------------------------------------------------------------------ */

export interface MoveStageDialogProps {
  clientId: Id;
  onClose: () => void;
  /** Provede přesun (vrací true při úspěchu – dialog se pak zavře). */
  onMove: (clientId: Id, stageId: Id, note: string) => boolean;
}

/** Přesun klienta do jiné fáze s volitelnou poznámkou (uloží se do historie fází). */
export function MoveStageDialog({ clientId, onClose, onMove }: MoveStageDialogProps): JSX.Element | null {
  const clinic = useClinic();
  const formId = useId();
  const client = getClient(clinic, clientId);
  const stages = stagesSorted(clinic);
  const current = client ? clientStage(clinic, client) : undefined;
  const [target, setTarget] = useState<Id | null>(() => {
    const idx = stages.findIndex((st) => st.id === current?.id);
    return stages[idx + 1]?.id ?? stages.find((st) => st.id !== current?.id)?.id ?? null;
  });
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);

  if (!client || !current) return null;

  const error = !target || target === current.id ? 'Vyberte novou fázi.' : undefined;
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    setTouched(true);
    if (error || !target) return;
    if (onMove(client.id, target, note.trim())) onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Přesunout do jiné fáze"
      description={`${clientName(client)} · teď ve fázi ${current.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Zpět
          </Button>
          <Button variant="primary" type="submit" form={formId} icon="arrowRight">
            Přesunout
          </Button>
        </>
      }
    >
      <form id={formId} className="pip-form" onSubmit={submit} noValidate>
        <fieldset className="pip-form__set">
          <legend className="pip-form__legend">Nová fáze</legend>
          <ChoiceChips
            aria-label="Nová fáze"
            value={target}
            onChange={(v) => setTarget(v)}
            options={stages.map((st) => ({
              value: st.id,
              label: st.id === current.id ? `${st.name} (teď)` : st.name,
              disabled: st.id === current.id,
            }))}
          />
          {touched && error && <p className="pip-form__error">{error}</p>}
        </fieldset>
        <Field label="Poznámka ke změně" optional hint="Uloží se do historie fází v kartě klienta.">
          <Textarea
            rows={3}
            value={note}
            maxLength={STAGE_NOTE_MAX}
            placeholder="Např. po freetalku chce začít diagnostikou"
            onValueChange={setNote}
          />
        </Field>
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Nový follow-up s vyhledáním klienta                                 */
/* ------------------------------------------------------------------ */

const RESULT_LIMIT = 8;

export interface NewFollowUpFlowProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Nový follow-up: nejdřív vyhledání klienta (combobox), pak FollowUpDialog nad ním.
 * „Zpět“ ve formuláři follow-upu vrátí k výběru klienta, uložení zavře obojí.
 */
export function NewFollowUpFlow({ open, onClose }: NewFollowUpFlowProps): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<Id | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setPicked(null);
    }
  }, [open]);

  const searching = query.trim().length > 0;
  const results = useMemo(() => (open && searching ? searchClients(clinic, query, RESULT_LIMIT) : []), [clinic, query, open, searching]);
  const recent = useMemo(() => (open && !searching ? recentSessionClients(clinic, now, 6) : []), [clinic, now, open, searching]);
  const list = searching ? results : recent;
  const activeIndex = Math.min(active, Math.max(0, list.length - 1));

  if (!open) return null;

  const optionId = (i: number): string => `${listId}-opt-${i}`;
  const pick = (id: Id): void => setPicked(id);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(Math.min(activeIndex + 1, list.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === 'Home' && list.length) {
      setActive(0);
    } else if (e.key === 'End' && list.length) {
      setActive(list.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = list[activeIndex];
      if (c) pick(c.id);
    }
  };

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title="Nový follow-up"
        description="Ke kterému klientovi úkol patří?"
        initialFocus={inputRef}
        footer={
          <Button variant="secondary" onClick={onClose}>
            Zpět
          </Button>
        }
      >
        <div className="pip-picker">
          <label htmlFor={`${listId}-input`} className="visually-hidden">
            Hledat klienta
          </label>
          <Input
            ref={inputRef}
            id={`${listId}-input`}
            type="search"
            prefixIcon="search"
            placeholder="Jméno, e-mail nebo telefon"
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={list.length > 0}
            aria-controls={listId}
            aria-activedescendant={list.length ? optionId(activeIndex) : undefined}
            value={query}
            onValueChange={(v) => {
              setQuery(v);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
          <p className="pip-picker__caption" id={`${listId}-caption`}>
            {searching
              ? results.length
                ? 'Výsledky hledání'
                : ''
              : recent.length
                ? 'Naposledy na sezení'
                : 'Začněte psát jméno klienta.'}
          </p>
          {searching && results.length === 0 ? (
            <p className="pip-picker__empty" role="status">
              Žádný klient neodpovídá „{query.trim()}“. Zkuste příjmení nebo část e-mailu.
            </p>
          ) : (
            <ul id={listId} className="pip-picker__list" role="listbox" aria-labelledby={`${listId}-caption`}>
              {list.map((c, i) => (
                <li key={c.id} id={optionId(i)} role="option" aria-selected={i === activeIndex}>
                  <button
                    type="button"
                    tabIndex={-1}
                    className={cx('pip-picker__option', i === activeIndex && 'is-active')}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(c.id)}
                  >
                    <span className="pip-picker__name">{clientName(c)}</span>
                    <span className="pip-picker__meta">{c.email || c.phone}</span>
                    <StageBadge stageId={clientStage(clinic, c).id} className="pip-picker__stage" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>
      {picked && (
        <FollowUpDialog
          open
          clientId={picked}
          onClose={() => setPicked(null)}
          onSaved={() => onClose()}
        />
      )}
    </>
  );
}
