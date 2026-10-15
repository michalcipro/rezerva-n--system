import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { FollowUp } from '../../domain/types';
import { FollowUpRow, useStickyFollowUpGroups } from '../../components/crm';
import { followUpBuckets } from '../../engine/crm';
import { countLabel, formatNumber, plural, prepZ } from '../../engine/format';
import { dateOf } from '../../engine/time';
import { useActor, useClinic, useNow } from '../../store/hooks';
import { navigate } from '../../store/session';
import { Button, Card, CardHeader, EmptyState, IconButton, Input, PageHeader, Select, Switch, cx, type IconName } from '../../ui';
import { NewFollowUpFlow } from './dialogs';
import { coachOptions, matchesFollowUp, NONE, showMoreLabel } from './model';
import './pipeline.css';

/** Kolik řádků nadcházejících a hotových úkolů se ukáže najednou. */
const UPCOMING_PAGE = 20;
const DONE_PAGE = 10;

interface ListState {
  /** null = výchozí podle role (terapeut vidí jen svoje). */
  mine: boolean | null;
  assignee: string;
  query: string;
  showDone: boolean;
}

/** Filtry přežijí odchod do karty klienta a návrat (jen v paměti této záložky). */
let remembered: ListState = { mine: null, assignee: '', query: '', showDone: false };

export function FollowUpsScreen(): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const actor = useActor();
  const searchRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ListState>(remembered);
  const [adding, setAdding] = useState(false);
  const [upcomingLimit, setUpcomingLimit] = useState(UPCOMING_PAGE);
  const [doneLimit, setDoneLimit] = useState(DONE_PAGE);

  useEffect(() => {
    remembered = state;
  }, [state]);

  const update = (patch: Partial<ListState>): void => {
    setState((s) => ({ ...s, ...patch }));
    setUpcomingLimit(UPCOMING_PAGE);
    setDoneLimit(DONE_PAGE);
  };

  const myId = actor.therapistId ?? null;
  const mine = myId !== null && (state.mine ?? actor.role === 'therapist');
  const today = dateOf(now);

  const assigneeIds = useMemo(() => new Set((clinic.followUps ?? []).map((f) => f.assigneeId).filter((id): id is string => !!id)), [clinic]);
  const coaches = useMemo(() => coachOptions(clinic, assigneeIds), [clinic, assigneeIds]);
  const assignee = mine && myId ? myId : state.assignee === NONE || coaches.some((o) => o.value === state.assignee) ? state.assignee : '';

  const all = useMemo(() => followUpBuckets(clinic, today), [clinic, today]);
  const buckets = useMemo(() => {
    const filter = { assignee, query: state.query };
    const keep = (list: FollowUp[]): FollowUp[] => (assignee || filter.query.trim() ? list.filter((f) => matchesFollowUp(clinic, f, filter)) : list);
    return { overdue: keep(all.overdue), today: keep(all.today), upcoming: keep(all.upcoming), done: keep(all.done) };
  }, [all, clinic, assignee, state.query]);

  // Odškrtnutý úkol zůstane do odchodu z obrazovky ve své skupině (fokus se neztratí, překlep jde vrátit).
  const shown = useStickyFollowUpGroups(buckets, 'done');

  const totalAll = all.overdue.length + all.today.length + all.upcoming.length + all.done.length;
  const totalShown = buckets.overdue.length + buckets.today.length + buckets.upcoming.length + buckets.done.length;
  const filtering = !!assignee || !!state.query.trim();
  const openCount = buckets.overdue.length + buckets.today.length + buckets.upcoming.length;

  const resetFilters = (): void => update({ assignee: '', query: '', mine: myId ? false : null });

  const subtitle =
    totalAll === 0
      ? 'Úkoly s termínem ke klientům'
      : [
          buckets.overdue.length ? `${formatNumber(buckets.overdue.length)} po termínu` : null,
          `${formatNumber(buckets.today.length)} na dnes`,
          `${formatNumber(buckets.upcoming.length)} ${plural(buckets.upcoming.length, ['nadcházející', 'nadcházející', 'nadcházejících'])}`,
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <div className="page pip-page">
      <PageHeader
        title="Follow-upy"
        subtitle={subtitle}
        actions={
          <>
            <Button icon="layers" onClick={() => navigate({ name: 'pipeline' })}>
              Pipeline
            </Button>
            <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
              Nový follow-up
            </Button>
          </>
        }
      />

      {totalAll === 0 ? (
        <EmptyState
          icon="checkCircle"
          title="Zatím žádné follow-upy"
          text="Follow-up je úkol s termínem ke klientovi – třeba zavolat po freetalku, poslat materiály nebo domluvit vyhodnocení. Přidejte první a nezapomenete na něj."
          action={
            <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
              Přidat první follow-up
            </Button>
          }
        />
      ) : (
        <>
          <div className="pip-toolbar" role="search">
            <Input
              ref={searchRef}
              type="search"
              className="pip-toolbar__search"
              prefixIcon="search"
              placeholder="Hledat úkol nebo klienta"
              aria-label="Hledat follow-up nebo klienta"
              value={state.query}
              onValueChange={(v) => update({ query: v })}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && state.query) {
                  e.preventDefault();
                  update({ query: '' });
                }
              }}
              suffix={
                state.query ? (
                  <IconButton
                    icon="x"
                    label="Vymazat hledání"
                    size="sm"
                    className="pip-toolbar__clear"
                    onClick={() => {
                      update({ query: '' });
                      searchRef.current?.focus();
                    }}
                  />
                ) : undefined
              }
            />
            {myId && (
              <Switch className="pip-toolbar__switch" labelPosition="end" label="Jen moje" checked={mine} onChange={(v) => update({ mine: v })} />
            )}
            {!mine && (
              <Select
                inline
                className="pip-toolbar__select"
                aria-label="Filtrovat podle kouče"
                prefix="Kouč:"
                value={assignee}
                onValueChange={(v) => update({ assignee: v })}
                options={[{ value: '', label: 'Všichni' }, ...coaches, { value: NONE, label: 'Bez přiřazení' }]}
              />
            )}
          </div>

          <p className="pip-resultline" aria-live="polite">
            {filtering ? (
              <>
                {mine && !state.query.trim() ? 'Přiřazené vám: ' : 'Zobrazeno '}
                <strong className="tnum">{formatNumber(totalShown)}</strong> {prepZ(totalAll)} {formatNumber(totalAll)}{' '}
                {plural(totalAll, ['follow-upu', 'follow-upů', 'follow-upů'])}
              </>
            ) : (
              <>
                {countLabel(totalAll, ['follow-up', 'follow-upy', 'follow-upů'])}, z toho {countLabel(openCount, ['otevřený', 'otevřené', 'otevřených'])}
              </>
            )}
            {filtering && (
              <>
                {' '}
                <button type="button" className="link pip-resultline__reset" onClick={resetFilters}>
                  Zrušit filtry
                </button>
              </>
            )}
          </p>

          {filtering && totalShown === 0 ? (
            <EmptyState
              icon="search"
              title={mine ? 'Nemáte žádné follow-upy' : 'Filtru neodpovídá žádný follow-up'}
              text={mine ? 'Úkoly přiřazené vám se objeví tady. Ostatní uvidíte po vypnutí „Jen moje“.' : 'Zkuste upravit hledání nebo zvolit jiného kouče.'}
              action={<Button onClick={resetFilters}>Zrušit filtry</Button>}
            />
          ) : (
            <div className="pip-fu-grid">
              <Bucket
                id="overdue"
                title="Po termínu"
                icon="alertCircle"
                tone="danger"
                items={shown.overdue}
                count={buckets.overdue.length}
                empty="Nic po termínu. Výborně."
              />
              <Bucket id="today" title="Dnes" icon="clock" items={shown.today} count={buckets.today.length} empty="Na dnešek nic nezbývá." />
              <Bucket
                id="upcoming"
                title="Nadcházející"
                icon="calendar"
                items={shown.upcoming}
                count={buckets.upcoming.length}
                limit={upcomingLimit}
                step={UPCOMING_PAGE}
                onMore={() => setUpcomingLimit((l) => l + UPCOMING_PAGE)}
                empty="Žádné další naplánované úkoly."
              />
              <Bucket
                id="done"
                title="Hotové"
                icon="checkCircle"
                items={shown.done}
                count={buckets.done.length}
                collapsed={!state.showDone}
                onToggle={() => {
                  setState((s) => ({ ...s, showDone: !s.showDone }));
                  setDoneLimit(DONE_PAGE);
                }}
                limit={doneLimit}
                step={DONE_PAGE}
                onMore={() => setDoneLimit((l) => l + DONE_PAGE)}
                empty="Zatím nic hotového."
              />
            </div>
          )}
        </>
      )}

      <NewFollowUpFlow open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Skupina follow-upů                                                  */
/* ------------------------------------------------------------------ */

function Bucket({
  id,
  title,
  icon,
  tone,
  items,
  count,
  empty,
  limit,
  step,
  onMore,
  collapsed,
  onToggle,
}: {
  id: string;
  title: string;
  icon: IconName;
  tone?: 'danger';
  /** Řádky skupiny včetně úkolů, které uživatel právě odškrtl (nebo vrátil). */
  items: FollowUp[];
  /** Počet úkolů, které do skupiny opravdu patří (číslo u nadpisu). */
  count: number;
  empty: ReactNode;
  /** Kolik řádků je vidět. */
  limit?: number;
  /** O kolik řádků přidá „Zobrazit další“. */
  step?: number;
  onMore?: () => void;
  /** Sbalená skupina (hotové) – ukáže jen počet a tlačítko. */
  collapsed?: boolean;
  onToggle?: () => void;
}): JSX.Element {
  const listId = `pip-fu-${id}`;
  const visible = limit && items.length > limit ? items.slice(0, limit) : items;
  const rest = items.length - visible.length;
  const hot = tone === 'danger' && count > 0;

  return (
    <Card as="section" padding="none" className={cx('pip-bucket', hot && 'pip-bucket--danger', `pip-bucket--${id}`)}>
      <CardHeader
        divided
        icon={icon}
        title={
          <span className="pip-bucket__title">
            {title}
            <span className={cx('pip-bucket__count tnum', hot && 'pip-bucket__count--danger')}>{formatNumber(count)}</span>
          </span>
        }
        actions={
          onToggle && items.length > 0 && !collapsed ? (
            <button type="button" className="link pip-bucket__toggle" aria-expanded aria-controls={listId} onClick={onToggle}>
              Skrýt
            </button>
          ) : undefined
        }
      />
      {collapsed ? (
        count > 0 ? (
          <p className="pip-bucket__collapsed">
            Hotové úkoly jsou skryté.{' '}
            <button type="button" className="link" aria-expanded={false} onClick={onToggle}>
              Zobrazit {countLabel(count, ['hotový úkol', 'hotové úkoly', 'hotových úkolů'])}
            </button>
          </p>
        ) : (
          <p className="pip-bucket__empty">{empty}</p>
        )
      ) : items.length === 0 ? (
        <p className="pip-bucket__empty">{empty}</p>
      ) : (
        <>
          <ul className="pip-fu-list" id={listId}>
            {visible.map((f) => (
              <FollowUpRow key={f.id} followUp={f} showClient as="li" />
            ))}
          </ul>
          {rest > 0 && onMore && (
            <div className="pip-bucket__more">
              <button type="button" className="link" onClick={onMore}>
                {showMoreLabel(rest, step ?? rest)}
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
