import { useId, useMemo, useRef, useState } from 'react';
import type { FollowUp, Id } from '../../domain/types';
import { FollowUpDialog, FollowUpRow } from '../../components/crm';
import { ToneDot } from '../../components/domain';
import { clientsByStage, followUpBuckets, stagesSorted } from '../../engine/crm';
import { countLabel, formatNumber } from '../../engine/format';
import { dateOf } from '../../engine/time';
import { useClinic, useNow } from '../../store/hooks';
import { navigate } from '../../store/session';
import { Button, Card, CardHeader, EmptyState, Icon, IconButton, StackedBar, cx } from '../../ui';
import './stats.css';

/**
 * Přehled – CRM widgety (docs/CRM.md): follow-upy po termínu a na dnes, souhrn klientů po fázích spolupráce.
 */

/** Kolik úkolů ve skupině je vidět, než ji uživatel rozbalí. */
const GROUP_INITIAL = 3;

const tasksText = (n: number): string => countLabel(n, ['úkol', 'úkoly', 'úkolů']);
const dueKey = (f: FollowUp): string => f.due + 'T' + (f.dueTime ?? '99:99');
const byDue = (a: FollowUp, b: FollowUp): number => {
  const ka = dueKey(a);
  const kb = dueKey(b);
  return ka < kb ? -1 : ka > kb ? 1 : a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1;
};
const clientsText = (n: number): string => countLabel(n, ['klient', 'klienti', 'klientů']);

/* ------------------------------------------------------------------ */
/* Follow-upy                                                          */
/* ------------------------------------------------------------------ */

function FollowUpGroup({
  title,
  items,
  open,
  danger,
}: {
  title: string;
  /** Řádky skupiny včetně úkolů, které uživatel právě odškrtl. */
  items: FollowUp[];
  /** Počet neodškrtnutých úkolů (číslo u nadpisu). */
  open: number;
  danger?: boolean;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const headingId = useId();
  const listId = useId();
  const shown = expanded ? items : items.slice(0, GROUP_INITIAL);
  return (
    <div className="st-fu__group">
      <h3 id={headingId} className={cx('st-fu__label', danger && 'st-fu__label--danger')}>
        {danger && <Icon name="alertCircle" size={14} />}
        {title}
        <span className="st-fu__count">{formatNumber(open)}</span>
      </h3>
      <ul id={listId} className={cx('st-fu__list', expanded && items.length > 8 && 'is-scroll')} aria-labelledby={headingId}>
        {shown.map((f) => (
          <FollowUpRow key={f.id} followUp={f} showClient as="li" />
        ))}
      </ul>
      {items.length > GROUP_INITIAL && (
        <button
          type="button"
          className="link st-fu__more"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Zobrazit méně' : `Zobrazit všechny (${formatNumber(items.length)})`}
        </button>
      )}
    </div>
  );
}

export interface FollowUpsCardProps {
  /** Terapeut vidí jen své úkoly (id kouče); null = všechny follow-upy. */
  assigneeId: Id | null;
}

/** Follow-upy po termínu a na dnešek s odškrtnutím, přidáním a odkazem na celý přehled. */
export function FollowUpsCard({ assigneeId }: FollowUpsCardProps): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const today = dateOf(now);
  const [adding, setAdding] = useState(false);

  const buckets = useMemo(() => followUpBuckets(clinic, today, assigneeId ?? undefined), [clinic.followUps, today, assigneeId]);
  const count = buckets.overdue.length + buckets.today.length;
  const upcoming = buckets.upcoming.length;
  const own = assigneeId !== null;

  // Úkol odškrtnutý tady zůstane do odchodu z Přehledu vidět přeškrtnutý – překlep jde hned vrátit.
  const shown = useRef(new Set<Id>());
  for (const f of buckets.overdue) shown.current.add(f.id);
  for (const f of buckets.today) shown.current.add(f.id);
  const groups = useMemo(() => {
    const doneHere = buckets.done.filter((f) => shown.current.has(f.id) && f.due <= today);
    return {
      overdue: [...buckets.overdue, ...doneHere.filter((f) => f.due < today)].sort(byDue),
      today: [...buckets.today, ...doneHere.filter((f) => f.due === today)].sort(byDue),
    };
  }, [buckets, today]);
  const listed = groups.overdue.length + groups.today.length;

  return (
    <Card as="section" aria-label="Follow-upy" className="st-card">
      <CardHeader
        title="Follow-upy"
        subtitle={own ? 'Vaše úkoly po termínu a na dnes' : 'Po termínu a na dnes'}
        meta={count > 0 ? tasksText(count) : undefined}
        actions={<IconButton icon="plus" size="sm" label="Nový follow-up" onClick={() => setAdding(true)} />}
      />
      {listed === 0 ? (
        <EmptyState
          compact
          icon="checkCircle"
          title="Na dnešek nic nečeká"
          text={
            (own ? 'Nemáte žádný follow-up po termínu ani na dnešek.' : 'Žádný follow-up po termínu ani na dnešek.') +
            (upcoming > 0 ? ` Naplánováno dál: ${tasksText(upcoming)}.` : ' Úkol ke klientovi přidáte tlačítkem níže.')
          }
          action={
            <Button size="sm" icon="plus" onClick={() => setAdding(true)}>
              Přidat follow-up
            </Button>
          }
        />
      ) : (
        <div className="st-fu__groups">
          {groups.overdue.length > 0 && (
            <FollowUpGroup title="Po termínu" items={groups.overdue} open={buckets.overdue.length} danger={buckets.overdue.length > 0} />
          )}
          {groups.today.length > 0 && <FollowUpGroup title="Dnes" items={groups.today} open={buckets.today.length} />}
        </div>
      )}
      <div className="st-fu__foot">
        <span>{upcoming > 0 ? <>Nadcházející: <strong>{formatNumber(upcoming)}</strong></> : 'Žádné nadcházející úkoly'}</span>
        <button type="button" className="link" onClick={() => navigate({ name: 'followupy' })}>
          Všechny follow-upy
        </button>
      </div>
      {adding && <FollowUpDialog open onClose={() => setAdding(false)} />}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Fáze spolupráce                                                     */
/* ------------------------------------------------------------------ */

export interface StagesCardProps {
  /** Prázdný stav: založení prvního klienta. */
  onNewClient: () => void;
}

/** Kolik klientů je v které fázi spolupráce; řádek otevře Pipeline. */
export function StagesCard({ onNewClient }: StagesCardProps): JSX.Element {
  const clinic = useClinic();
  const rows = useMemo(() => {
    const byStage = clientsByStage(clinic);
    return stagesSorted(clinic).map((stage) => ({ stage, count: byStage.get(stage.id)?.length ?? 0 }));
  }, [clinic.clients, clinic.settings.stages]);
  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <Card as="section" aria-label="Fáze spolupráce" className="st-card">
      <CardHeader title="Fáze spolupráce" meta={total > 0 ? clientsText(total) : undefined} />
      {total === 0 ? (
        <EmptyState
          compact
          icon="users"
          title="Zatím žádní klienti"
          text="Po založení prvního klienta tu uvidíte, kolik klientů je v které fázi spolupráce."
          action={
            <Button size="sm" icon="userPlus" onClick={onNewClient}>
              Nový klient
            </Button>
          }
        />
      ) : (
        <>
          <StackedBar
            legend={false}
            label={`Klienti podle fáze: ${rows.map((r) => `${r.stage.name} ${formatNumber(r.count)}`).join(', ')}`}
            segments={rows.map((r) => ({ value: r.count, tone: r.stage.tone, label: r.stage.name }))}
          />
          <ul className="st-stages">
            {rows.map((r) => (
              <li key={r.stage.id}>
                <button
                  type="button"
                  className={cx('st-stages__row', r.stage.closed && 'is-closed')}
                  aria-label={`${r.stage.name}: ${clientsText(r.count)}. Otevřít Pipeline`}
                  onClick={() => navigate({ name: 'pipeline' })}
                >
                  <ToneDot tone={r.stage.tone} />
                  <span className="st-stages__name">{r.stage.name}</span>
                  <span className="st-stages__count">{formatNumber(r.count)}</span>
                  <Icon name="chevronRight" size={14} className="st-stages__chev" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
