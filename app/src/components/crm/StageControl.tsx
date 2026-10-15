import { useEffect, useId, useState, type FormEvent } from 'react';
import type { Id, StageChange } from '../../domain/types';
import { setClientStage } from '../../engine/commands';
import { clientStage, daysInStage, getStage, STAGE_NOTE_MAX, stageSince, stagesSorted } from '../../engine/crm';
import { countLabel, formatDate, formatNumber, formatTime } from '../../engine/format';
import { clientName, getClient } from '../../engine/selectors';
import { dateOf, daysBetween } from '../../engine/time';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { Button, Dialog, EmptyState, Field, Menu, Select, Textarea, cx, type MenuEntry } from '../../ui';
import { StageBadge } from './StageBadge';
import './crm.css';


export interface StageControlProps {
  clientId: Id;
  /** Jen štítek a historie, bez změny fáze. */
  readOnly?: boolean;
  className?: string;
}

/** Fáze spolupráce v hlavičce karty klienta: štítek, dny ve fázi, změna fáze s poznámkou, historie fází. */
export function StageControl({ clientId, readOnly, className }: StageControlProps): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const client = getClient(clinic, clientId);
  const [target, setTarget] = useState<Id | null>(null);
  const [history, setHistory] = useState(false);
  if (!client) return null;

  const stage = clientStage(clinic, client);
  const days = daysInStage(client, now);
  const since = stageSince(client);
  const stages = stagesSorted(clinic);

  const items: MenuEntry[] = readOnly
    ? []
    : [
        { type: 'label', id: 'lbl', label: 'Přesunout do fáze' },
        ...stages.map((st) => ({
          id: st.id,
          label: st.name,
          disabled: st.id === stage.id,
          hint: st.id === stage.id ? 'teď' : undefined,
          onSelect: () => setTarget(st.id),
        })),
        { type: 'separator', id: 'sep' },
      ];
  items.push({ id: 'history', label: 'Historie fází', icon: 'history', onSelect: () => setHistory(true) });

  return (
    <div className={cx('crm-stagectl', className)}>
      <StageBadge stageId={stage.id} size="md" />
      <span className="crm-stagectl__days tnum" title={`Ve fázi od ${formatDate(since)}`}>
        {days === 0 ? 'od dneška' : `${countLabel(days, ['den', 'dny', 'dní'])} ve fázi`}
      </span>
      <Menu
        align="start"
        label="Fáze spolupráce"
        trigger={
          <Button size="sm" variant="ghost" iconRight="chevronDown" className="crm-stagectl__btn">
            {readOnly ? 'Historie' : 'Změnit fázi'}
          </Button>
        }
        items={items}
      />
      {target && <ChangeStageDialog clientId={client.id} initialStageId={target} onClose={() => setTarget(null)} />}
      {history && <StageHistoryDialog clientId={client.id} onClose={() => setHistory(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Změna fáze                                                          */
/* ------------------------------------------------------------------ */

export function ChangeStageDialog({ clientId, initialStageId, onClose }: { clientId: Id; initialStageId: Id; onClose: () => void }): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const formId = useId();
  const client = getClient(clinic, clientId);
  const [stageId, setStageId] = useState(initialStageId);
  const [note, setNote] = useState('');
  useEffect(() => setStageId(initialStageId), [initialStageId]);
  if (!client) return null;

  const current = clientStage(clinic, client);
  const target = getStage(clinic, stageId);
  const tooLong = note.trim().length > STAGE_NOTE_MAX;
  const same = stageId === current.id;

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (same || tooLong || !target) return;
    const r = run(setClientStage, { clientId, stageId, note: note.trim() || undefined }, { success: `Fáze změněna: ${target.name}` });
    if (r.ok) onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Změnit fázi spolupráce"
      description={clientName(client)}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Zpět
          </Button>
          <Button variant="primary" type="submit" form={formId} icon="check" disabled={same || tooLong}>
            Změnit fázi
          </Button>
        </>
      }
    >
      <form id={formId} className="crm-form" onSubmit={submit} noValidate>
        <p className="crm-stagechange">
          <span className="crm-hint">Teď:</span> <StageBadge stageId={current.id} />{' '}
          <span className="crm-hint tnum">od {formatDate(stageSince(client))} ({countLabel(daysInStage(client, now), ['den', 'dny', 'dní'])})</span>
        </p>
        <Field label="Nová fáze" error={same ? 'Klient už v této fázi je – vyberte jinou.' : undefined}>
          <Select
            value={stageId}
            onValueChange={setStageId}
            options={stagesSorted(clinic).map((st) => ({ value: st.id, label: st.id === current.id ? `${st.name} (teď)` : st.name }))}
          />
        </Field>
        <Field
          label="Poznámka ke změně"
          optional
          hint={`Uloží se do historie fází. ${formatNumber(note.trim().length)} / ${STAGE_NOTE_MAX} znaků`}
          error={tooLong ? `Poznámka může mít nejvýše ${STAGE_NOTE_MAX} znaků.` : undefined}
        >
          <Textarea rows={3} value={note} onValueChange={setNote} placeholder="Např. po freetalku domluvena diagnostika na příští týden" />
        </Field>
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Historie fází                                                       */
/* ------------------------------------------------------------------ */

/** 'zatím 12 dní', 'od dneška', '7 dní ve fázi', 'méně než den'. */
function stayLabel(days: number, current: boolean): string {
  if (current) return days === 0 ? 'od dneška' : `zatím ${countLabel(days, ['den', 'dny', 'dní'])}`;
  return days === 0 ? 'méně než den' : `${countLabel(days, ['den', 'dny', 'dní'])} ve fázi`;
}

export function StageHistoryDialog({ clientId, onClose }: { clientId: Id; onClose: () => void }): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const client = getClient(clinic, clientId);
  if (!client) return null;
  const history: StageChange[] = client.stageHistory ?? [];
  const rows = history
    .map((h, i) => {
      const next = history[i + 1];
      const end = next ? next.at : now;
      return { h, current: !next, days: Math.max(0, daysBetween(dateOf(h.at), dateOf(end))), key: `${h.at}-${i}` };
    })
    .reverse();

  return (
    <Dialog open onClose={onClose} title="Historie fází spolupráce" description={clientName(client)} size="md" footer={<Button onClick={onClose}>Zavřít</Button>}>
      {rows.length === 0 ? (
        <EmptyState compact icon="history" title="Zatím bez historie" text="Každá změna fáze se zapíše sem i s datem a autorem." />
      ) : (
        <ol className="crm-stagehist">
          {rows.map(({ h, current, days, key }) => (
            <li key={key} className={cx('crm-stagehist__item', current && 'is-current')}>
              <span className="crm-stagehist__dot" aria-hidden="true" />
              <div className="crm-stagehist__body">
                <div className="crm-stagehist__top">
                  <StageBadge stageId={h.stageId} />
                  <span className="crm-stagehist__when tnum">
                    {formatDate(h.at)} {formatTime(h.at)}
                  </span>
                </div>
                <span className="crm-stagehist__meta tnum">
                  {stayLabel(days, current)}
                  {h.actor ? ` · ${h.actor}` : ''}
                </span>
                {h.note && <p className="crm-stagehist__note">{h.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}
