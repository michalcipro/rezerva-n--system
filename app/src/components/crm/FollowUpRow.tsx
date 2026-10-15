import { useMemo, useRef, useState } from 'react';
import type { FollowUp, Id } from '../../domain/types';
import { deleteFollowUp, setFollowUpDone } from '../../engine/commands';
import { compareDoneFollowUps, compareOpenFollowUps, followUpDueLabel } from '../../engine/crm';
import { formatDayShort, formatTime } from '../../engine/format';
import { clientName, getClient, getTherapist, therapistShort } from '../../engine/selectors';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { navigate } from '../../store/session';
import { Checkbox, ConfirmDialog, cx, Icon, IconButton, Menu } from '../../ui';
import { FollowUpDialog } from './FollowUpDialog';
import './crm.css';

export interface FollowUpRowProps {
  followUp: FollowUp;
  /** Zobrazit jméno klienta jako odkaz na jeho kartu (seznamy přes více klientů). */
  showClient?: boolean;
  /** Kořenový element – 'li' uvnitř <ul>/<ol>. */
  as?: 'div' | 'li';
  className?: string;
}

/** Řádek follow-upu: odškrtnutí, název, termín (po termínu červeně), klient, kdo, úprava a smazání. */
export function FollowUpRow({ followUp: f, showClient, as: Tag = 'div', className }: FollowUpRowProps): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const client = getClient(clinic, f.clientId);
  const assignee = f.assigneeId ? getTherapist(clinic, f.assigneeId) : undefined;
  const due = followUpDueLabel(f, now);

  return (
    <Tag className={cx('crm-fu', f.done && 'is-done', due.overdue && 'is-overdue', className)}>
      <Checkbox
        className="crm-fu__check"
        checked={f.done}
        aria-label={f.done ? `Vrátit mezi nehotové: ${f.title}` : `Označit jako hotové: ${f.title}`}
        onChange={(done) => run(setFollowUpDone, { followUpId: f.id, done })}
      />
      <div className="crm-fu__body">
        <span className="crm-fu__title">{f.title}</span>
        <span className="crm-fu__meta">
          {f.done && f.doneAt ? (
            <span className="crm-fu__due tnum">
              <Icon name="checkCircle" size={12} />
              Hotovo {formatDayShort(f.doneAt)} {formatTime(f.doneAt)}
            </span>
          ) : (
            <span className={cx('crm-fu__due tnum', due.overdue && 'crm-fu__due--overdue')}>
              <Icon name={due.overdue ? 'alertCircle' : 'clock'} size={12} />
              {due.label}
              {due.overdueText && <span className="crm-fu__late">{due.overdueText}</span>}
            </span>
          )}
          {showClient && client && (
            <button type="button" className="link crm-fu__client" onClick={() => navigate({ name: 'klient', clientId: client.id })}>
              {clientName(client)}
            </button>
          )}
          {assignee && (
            <span className="crm-fu__assignee">
              <Icon name="user" size={12} />
              {therapistShort(assignee)}
            </span>
          )}
        </span>
        {f.note && <span className="crm-fu__note">{f.note}</span>}
      </div>
      <Menu
        align="end"
        label={`Další akce: ${f.title}`}
        trigger={<IconButton icon="more" size="sm" label={`Další akce: ${f.title}`} />}
        items={[
          { id: 'edit', label: 'Upravit', icon: 'edit', onSelect: () => setEditing(true) },
          { id: 'delete', label: 'Smazat', icon: 'trash', danger: true, onSelect: () => setConfirming(true) },
        ]}
      />
      {editing && <FollowUpDialog open onClose={() => setEditing(false)} followUp={f} />}
      {confirming && (
        <ConfirmDialog
          open
          onClose={() => setConfirming(false)}
          tone="danger"
          title="Smazat follow-up?"
          message={`Úkol „${f.title}“${client ? ` u klienta ${clientName(client)}` : ''} se smaže. Pokud je hotový, stačí ho odškrtnout.`}
          confirmLabel="Smazat follow-up"
          onConfirm={() => {
            const r = run(deleteFollowUp, { followUpId: f.id }, { success: 'Follow-up je smazaný' });
            if (!r.ok) throw new Error(r.error);
          }}
        />
      )}
    </Tag>
  );
}

/**
 * Skupiny follow-upů (např. po termínu / dnes / nadcházející / hotové), ve kterých úkol odškrtnutý nebo vrácený
 * mezi nehotové zůstane ve skupině, kde ho uživatel viděl, dokud obrazovku neopustí: řádek se nepřesune jinam,
 * fokus zůstane na zaškrtávátku a překlep jde hned vrátit (stejně jako widget v Přehledu). Pořadí ve skupině
 * se řídí podobou úkolu, v jaké ve skupině byl, takže řádek ani neposkočí.
 *   const shown = useStickyFollowUpGroups(buckets, 'done');   // buckets musí být memoizované
 */
export function useStickyFollowUpGroups<G extends Record<string, readonly FollowUp[]>>(groups: G, doneKey: keyof G & string): { [P in keyof G]: FollowUp[] } {
  type K = keyof G & string;
  const pins = useRef(new Map<Id, { group: K; seen: FollowUp }>());
  return useMemo(() => {
    const keys = Object.keys(groups) as K[];
    const rows = {} as Record<K, { seen: FollowUp; item: FollowUp }[]>;
    for (const k of keys) rows[k] = [];
    for (const k of keys) {
      for (const f of groups[k]) {
        const pin = pins.current.get(f.id);
        if (pin && pin.group !== k && pin.group in rows && pin.seen.done !== f.done) {
          // jen odškrtnutí / vrácení – úkol zůstane, kde byl
          rows[pin.group].push({ seen: pin.seen, item: f });
        } else {
          pins.current.set(f.id, { group: k, seen: f });
          rows[k].push({ seen: f, item: f });
        }
      }
    }
    const out = {} as Record<K, FollowUp[]>;
    for (const k of keys) {
      const order = k === doneKey ? compareDoneFollowUps : compareOpenFollowUps;
      out[k] = rows[k].sort((a, b) => order(a.seen, b.seen)).map((r) => r.item);
    }
    return out as { [P in keyof G]: FollowUp[] };
  }, [groups, doneKey]);
}
