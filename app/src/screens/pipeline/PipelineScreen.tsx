import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import type { Id, LocalDateTime, Stage } from '../../domain/types';
import { FollowUpDialog } from '../../components/crm';
import { setClientStage } from '../../engine/commands';
import { followUpDueLabel, getStage, stagesSorted } from '../../engine/crm';
import { countLabel, formatNumber, plural, prepZ } from '../../engine/format';
import { clientName, getClient, getTherapist, therapistShort } from '../../engine/selectors';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { navigate } from '../../store/session';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  IconButton,
  Input,
  Menu,
  PageHeader,
  Select,
  Switch,
  cx,
  toast,
  type MenuEntry,
} from '../../ui';
import { MoveStageDialog } from './dialogs';
import {
  buildPipelineCards,
  CARD_SORT_LABEL,
  coachOptions,
  daysInStageLabel,
  groupColumns,
  NONE,
  sessionLabel,
  showMoreLabel,
  type CardSort,
  type PipelineCardData,
  type StageColumn,
} from './model';
import './pipeline.css';

/** Kolik karet sloupec ukáže najednou (další přes tlačítko pod sloupcem). */
const COLUMN_PAGE = 30;
const MAX_TAGS = 3;
const DRAG_TYPE = 'application/x-pipeline-client';

interface BoardState {
  query: string;
  coach: string;
  hideClosed: boolean;
  sort: CardSort;
}

/** Filtry přežijí odchod do karty klienta a návrat (jen v paměti této záložky). */
let remembered: BoardState = { query: '', coach: '', hideClosed: false, sort: 'name' };

interface DragState {
  clientId: Id;
  fromStageId: Id;
}

/* ------------------------------------------------------------------ */
/* Obrazovka                                                           */
/* ------------------------------------------------------------------ */

export function PipelineScreen(): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const searchRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<BoardState>(remembered);
  const [limits, setLimits] = useState<Record<Id, number>>({});
  const [drag, setDrag] = useState<DragState | null>(null);
  const [over, setOver] = useState<Id | null>(null);
  const [moving, setMoving] = useState<Id | null>(null);
  const [followUpFor, setFollowUpFor] = useState<Id | null>(null);
  // Po přesunu z nabídky (bez myši) se karta vykreslí v jiném sloupci – fokus se pak vrátí na ni.
  const [focusAfterMove, setFocusAfterMove] = useState<{ clientId: Id; fromStageId: Id; toStageId: Id } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    remembered = state;
  }, [state]);

  const update = (patch: Partial<BoardState>): void => {
    setState((s) => ({ ...s, ...patch }));
    if ('query' in patch || 'coach' in patch || 'sort' in patch) setLimits({});
  };

  // Nejčerstvější data pro obslužné funkce (aby karty mohly zůstat memo a callbacky stabilní).
  const clinicRef = useRef(clinic);
  clinicRef.current = clinic;

  const stages = stagesSorted(clinic);
  const cards = useMemo(() => buildPipelineCards(clinic, now), [clinic, now]);
  const coachIds = useMemo(() => new Set(cards.map((c) => c.coachId).filter((id): id is Id => !!id)), [cards]);
  const coaches = useMemo(() => coachOptions(clinic, coachIds), [clinic, coachIds]);
  const coach = state.coach === NONE || coaches.some((o) => o.value === state.coach) ? state.coach : '';
  const columns = useMemo(
    () => groupColumns(stages, cards, { query: state.query, coach }, state.sort),
    [stages, cards, state.query, coach, state.sort],
  );
  const visibleColumns = useMemo(() => (state.hideClosed ? columns.filter((c) => !c.stage.closed) : columns), [columns, state.hideClosed]);
  const hiddenCount = useMemo(() => columns.filter((c) => c.stage.closed).reduce((n, c) => n + c.cards.length, 0), [columns]);

  const totals = useMemo(() => {
    let open = 0;
    let overdue = 0;
    const closed = new Set(stages.filter((st) => st.closed).map((st) => st.id));
    for (const c of cards) {
      if (!closed.has(c.stageId)) open++;
      overdue += c.overdueFollowUps;
    }
    return { open, overdue };
  }, [cards, stages]);

  const filtering = !!state.query.trim() || !!coach;
  const shown = visibleColumns.reduce((n, c) => n + c.cards.length, 0);

  /* ---- akce ---- */

  const open = useCallback((clientId: Id) => navigate({ name: 'klient', clientId }), []);

  const move = useCallback(
    (clientId: Id, stageId: Id, note?: string, opts: { restoreFocus?: boolean } = {}): boolean => {
      const s = clinicRef.current;
      const client = getClient(s, clientId);
      const target = getStage(s, stageId);
      if (!client || !target) return false;
      const prevId = client.stageId;
      if (prevId === stageId) return false;
      const r = run(setClientStage, { clientId, stageId, note: note || undefined });
      if (!r.ok) return false;
      if (opts.restoreFocus) setFocusAfterMove({ clientId, fromStageId: prevId, toStageId: stageId });
      const name = clientName(client);
      const prev = getStage(s, prevId);
      const entry = r.value;
      toast('Fáze spolupráce je změněná', {
        tone: 'success',
        description: `${name} je teď ve fázi ${target.name}.`,
        action:
          prev && entry
            ? {
                label: 'Vrátit zpět',
                onClick: () => {
                  // skutečné vrácení: záznam přesunu z historie zmizí (statistiky ani „ve fázi od“ ho nepočítají)
                  const u = run(setClientStage, { clientId, stageId: prev.id, undo: entry }, { success: `${name} je zpět ve fázi ${prev.name}.` });
                  if (u.ok) setFocusAfterMove({ clientId, fromStageId: stageId, toStageId: prev.id });
                },
              }
            : undefined,
      });
      return true;
    },
    [run],
  );

  const moveFromMenu = useCallback((clientId: Id, stageId: Id): boolean => move(clientId, stageId, undefined, { restoreFocus: true }), [move]);

  useEffect(() => {
    if (!focusAfterMove) return;
    setFocusAfterMove(null);
    const board = boardRef.current;
    if (!board) return;
    // Fokus držený mimo nástěnku (např. v jiném dialogu) nepřebíráme.
    const active = document.activeElement;
    if (active && active !== document.body && !board.contains(active) && !active.closest('.toaster')) return;
    const esc = (v: string): string => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(v) : v.replace(/["\\]/g, '\\$&'));
    const card = board.querySelector<HTMLElement>(`.pip-card[data-client-id="${esc(focusAfterMove.clientId)}"]`);
    // Karta v novém sloupci; když není vidět (skrytá ukončená fáze, mimo stránku sloupce), nadpis sloupce.
    const target =
      card?.querySelector<HTMLElement>('.pip-card__menu') ??
      board.querySelector<HTMLElement>(`[data-stage-id="${esc(focusAfterMove.toStageId)}"] .pip-col__title`) ??
      board.querySelector<HTMLElement>(`[data-stage-id="${esc(focusAfterMove.fromStageId)}"] .pip-col__title`);
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [focusAfterMove]);

  /* ---- tažení myší ---- */

  const onCardDragStart = useCallback((e: DragEvent<HTMLElement>, card: PipelineCardData) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(DRAG_TYPE, card.client.id);
    setDrag({ clientId: card.client.id, fromStageId: card.stageId });
  }, []);

  const onCardDragEnd = useCallback(() => {
    setDrag(null);
    setOver(null);
  }, []);

  const onColumnDragOver = useCallback(
    (e: DragEvent<HTMLElement>, stageId: Id) => {
      if (!drag || drag.fromStageId === stageId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setOver(stageId);
    },
    [drag],
  );

  const onColumnDragLeave = useCallback((e: DragEvent<HTMLElement>, stageId: Id) => {
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    setOver((o) => (o === stageId ? null : o));
  }, []);

  const onColumnDrop = useCallback(
    (e: DragEvent<HTMLElement>, stageId: Id) => {
      e.preventDefault();
      const clientId = e.dataTransfer.getData(DRAG_TYPE) || drag?.clientId;
      setDrag(null);
      setOver(null);
      if (clientId) move(clientId, stageId);
    },
    [drag, move],
  );

  const showMore = useCallback((stageId: Id) => {
    setLimits((l) => ({ ...l, [stageId]: (l[stageId] ?? COLUMN_PAGE) + COLUMN_PAGE }));
  }, []);

  const resetFilters = (): void => update({ query: '', coach: '' });

  /* ---- vykreslení ---- */

  const subtitle =
    cards.length === 0
      ? 'Fáze spolupráce s klienty'
      : `${countLabel(totals.open, ['klient', 'klienti', 'klientů'])} v otevřených fázích` +
        (totals.overdue ? ` · ${countLabel(totals.overdue, ['follow-up', 'follow-upy', 'follow-upů'])} po termínu` : '');

  return (
    <div className="page pip-page">
      <PageHeader
        title="Pipeline"
        subtitle={subtitle}
        actions={
          <Button icon="checkCircle" onClick={() => navigate({ name: 'followupy' })}>
            Follow-upy
          </Button>
        }
      />

      {cards.length === 0 ? (
        <EmptyState
          icon="users"
          title="Zatím tu nejsou žádní klienti"
          text="Pipeline ukazuje klienty podle fáze spolupráce – od potenciálního klienta po konec spolupráce. Jakmile založíte prvního klienta, objeví se tady."
          action={
            <Button variant="primary" icon="users" onClick={() => navigate({ name: 'klienti' })}>
              Otevřít seznam klientů
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
              placeholder="Hledat podle jména"
              aria-label="Hledat klienta podle jména"
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
            <Select
              inline
              className="pip-toolbar__select"
              aria-label="Filtrovat podle kouče"
              prefix="Kouč:"
              value={coach}
              onValueChange={(v) => update({ coach: v })}
              options={[{ value: '', label: 'Všichni' }, ...coaches, { value: NONE, label: 'Bez kouče' }]}
            />
            <Select
              inline
              className="pip-toolbar__select"
              aria-label="Řadit karty"
              prefix="Řadit:"
              value={state.sort}
              onValueChange={(v) => update({ sort: v as CardSort })}
              options={(Object.keys(CARD_SORT_LABEL) as CardSort[]).map((s) => ({ value: s, label: CARD_SORT_LABEL[s] }))}
            />
            <Switch
              className="pip-toolbar__switch"
              labelPosition="end"
              label="Skrýt ukončené"
              checked={state.hideClosed}
              onChange={(v) => update({ hideClosed: v })}
            />
          </div>

          <p className="pip-resultline" aria-live="polite">
            {filtering ? (
              <>
                Zobrazeno <strong className="tnum">{formatNumber(shown)}</strong> {prepZ(cards.length)} {formatNumber(cards.length)}{' '}
                {plural(cards.length, ['klienta', 'klientů', 'klientů'])}
              </>
            ) : (
              <>{countLabel(shown, ['klient', 'klienti', 'klientů'])} na nástěnce</>
            )}
            {state.hideClosed && hiddenCount > 0 && (
              <span className="pip-resultline__extra"> · skryto v ukončených fázích: {formatNumber(hiddenCount)}</span>
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
          <p className="pip-hint">
            <Icon name="info" size={14} />
            Kartu přesunete tažením do jiného sloupce, nebo přes nabídku <Icon name="more" size={14} /> u karty.
          </p>

          {visibleColumns.length === 0 ? (
            <EmptyState
              icon="layers"
              title="Všechny fáze jsou skryté"
              text="Zobrazují se jen otevřené fáze a žádná taková není. Vypněte „Skrýt ukončené“, nebo upravte fáze v Nastavení."
              action={<Button onClick={() => update({ hideClosed: false })}>Zobrazit ukončené</Button>}
            />
          ) : (
            <div ref={boardRef} className="pip-board" role="region" aria-label="Klienti podle fází spolupráce" tabIndex={0}>
              {visibleColumns.map((col) => (
                <PipelineColumn
                  key={col.stage.id}
                  column={col}
                  stages={stages}
                  now={now}
                  limit={limits[col.stage.id] ?? COLUMN_PAGE}
                  filtering={filtering}
                  draggingId={drag?.clientId ?? null}
                  canDrop={!!drag && drag.fromStageId !== col.stage.id}
                  isOver={over === col.stage.id}
                  onOpen={open}
                  onMove={moveFromMenu}
                  onMoveWithNote={setMoving}
                  onAddFollowUp={setFollowUpFor}
                  onCardDragStart={onCardDragStart}
                  onCardDragEnd={onCardDragEnd}
                  onDragOver={onColumnDragOver}
                  onDragLeave={onColumnDragLeave}
                  onDrop={onColumnDrop}
                  onShowMore={showMore}
                />
              ))}
            </div>
          )}
        </>
      )}

      {moving && (
        <MoveStageDialog clientId={moving} onClose={() => setMoving(null)} onMove={(id, stageId, note) => move(id, stageId, note, { restoreFocus: true })} />
      )}
      {followUpFor && <FollowUpDialog open clientId={followUpFor} onClose={() => setFollowUpFor(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sloupec                                                             */
/* ------------------------------------------------------------------ */

interface CardHandlers {
  onOpen: (clientId: Id) => void;
  onMove: (clientId: Id, stageId: Id) => boolean;
  onMoveWithNote: (clientId: Id) => void;
  onAddFollowUp: (clientId: Id) => void;
  onCardDragStart: (e: DragEvent<HTMLElement>, card: PipelineCardData) => void;
  onCardDragEnd: () => void;
}

interface PipelineColumnProps extends CardHandlers {
  column: StageColumn;
  stages: Stage[];
  now: LocalDateTime;
  limit: number;
  filtering: boolean;
  draggingId: Id | null;
  canDrop: boolean;
  isOver: boolean;
  onDragOver: (e: DragEvent<HTMLElement>, stageId: Id) => void;
  onDragLeave: (e: DragEvent<HTMLElement>, stageId: Id) => void;
  onDrop: (e: DragEvent<HTMLElement>, stageId: Id) => void;
  onShowMore: (stageId: Id) => void;
}

const PipelineColumn = memo(function PipelineColumn({
  column,
  stages,
  now,
  limit,
  filtering,
  draggingId,
  canDrop,
  isOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onShowMore,
  ...handlers
}: PipelineColumnProps): JSX.Element {
  const headingId = useId();
  const { stage, cards, total } = column;
  const visible = cards.length > limit ? cards.slice(0, limit) : cards;
  const rest = cards.length - visible.length;

  return (
    <section
      className={cx('pip-col', canDrop && 'is-droppable', isOver && 'is-over', stage.closed && 'pip-col--closed')}
      data-tone={stage.tone}
      data-stage-id={stage.id}
      aria-labelledby={headingId}
      onDragOver={(e) => onDragOver(e, stage.id)}
      onDragEnter={(e) => onDragOver(e, stage.id)}
      onDragLeave={(e) => onDragLeave(e, stage.id)}
      onDrop={(e) => onDrop(e, stage.id)}
    >
      <header className="pip-col__head">
        <span className="pip-col__dot" aria-hidden="true" />
        <h2 id={headingId} className="pip-col__title" tabIndex={-1}>
          {stage.name}
        </h2>
        <span className="pip-col__count tnum">
          <span aria-hidden="true">
            {filtering && cards.length !== total ? `${formatNumber(cards.length)} / ${formatNumber(total)}` : formatNumber(cards.length)}
          </span>
          <span className="visually-hidden">
            {filtering && cards.length !== total
              ? `${countLabel(cards.length, ['klient', 'klienti', 'klientů'])} z ${formatNumber(total)}`
              : countLabel(cards.length, ['klient', 'klienti', 'klientů'])}
          </span>
        </span>
      </header>
      <div className="pip-col__body">
        {cards.length === 0 ? (
          <div className="pip-col__empty">
            <EmptyState
              compact
              icon={filtering && total > 0 ? 'search' : 'users'}
              title={filtering && total > 0 ? 'Filtru tu nikdo neodpovídá' : 'Zatím tu nikdo není'}
              text={
                canDrop
                  ? 'Pusťte kartu sem.'
                  : filtering && total > 0
                    ? `Ve fázi je ${countLabel(total, ['klient', 'klienti', 'klientů'])} mimo filtr.`
                    : 'Přetáhněte sem kartu klienta, nebo ji přesuňte přes nabídku u karty.'
              }
            />
          </div>
        ) : (
          <ul className="pip-col__list">
            {visible.map((card) => (
              <PipelineCard key={card.client.id} card={card} stages={stages} now={now} closed={!!stage.closed} dragging={draggingId === card.client.id} {...handlers} />
            ))}
          </ul>
        )}
        {rest > 0 && (
          <button type="button" className="pip-col__more" onClick={() => onShowMore(stage.id)}>
            {showMoreLabel(rest, COLUMN_PAGE)}
          </button>
        )}
      </div>
    </section>
  );
});

/* ------------------------------------------------------------------ */
/* Karta klienta                                                       */
/* ------------------------------------------------------------------ */

interface PipelineCardProps extends CardHandlers {
  card: PipelineCardData;
  stages: Stage[];
  now: LocalDateTime;
  closed: boolean;
  dragging: boolean;
}

const PipelineCard = memo(function PipelineCard({
  card,
  stages,
  now,
  closed,
  dragging,
  onOpen,
  onMove,
  onMoveWithNote,
  onAddFollowUp,
  onCardDragStart,
  onCardDragEnd,
}: PipelineCardProps): JSX.Element {
  const clinic = useClinic();
  const { client, name } = card;
  const coach = card.coachId ? getTherapist(clinic, card.coachId) : undefined;
  const fu = card.nextFollowUp;
  const due = fu ? followUpDueLabel(fu, now) : null;
  const tags = client.tags.slice(0, MAX_TAGS);
  const moreTags = client.tags.length - tags.length;

  const items: MenuEntry[] = [
    { type: 'label', label: 'Přesunout do…' },
    ...stages
      .filter((st) => st.id !== card.stageId)
      .map((st) => ({ id: `move-${st.id}`, label: st.name, icon: 'arrowRight' as const, onSelect: () => onMove(client.id, st.id) })),
    { id: 'move-note', label: 'Přesunout s poznámkou…', icon: 'edit', onSelect: () => onMoveWithNote(client.id) },
    { type: 'separator' },
    { id: 'follow-up', label: 'Přidat follow-up', icon: 'plus', onSelect: () => onAddFollowUp(client.id) },
    { id: 'open', label: 'Otevřít kartu klienta', icon: 'user', onSelect: () => onOpen(client.id) },
  ];

  const onClick = (e: MouseEvent<HTMLLIElement>): void => {
    const target = e.target as HTMLElement;
    // Události z portálu (nabídka) a z ovládacích prvků karty kartu neotevírají.
    if (!e.currentTarget.contains(target) || target.closest('button, a, input, select, textarea')) return;
    onOpen(client.id);
  };

  return (
    <li
      className={cx('pip-card', dragging && 'is-dragging')}
      data-client-id={client.id}
      draggable
      onDragStart={(e) => onCardDragStart(e, card)}
      onDragEnd={onCardDragEnd}
      onClick={onClick}
    >
      <div className="pip-card__head">
        <button type="button" className="pip-card__name" onClick={() => onOpen(client.id)}>
          {name}
        </button>
        <Menu
          align="end"
          label={`Přesunout do… – ${name}`}
          trigger={<IconButton icon="more" size="sm" className="pip-card__menu" label={`Přesunout a další akce: ${name}`} />}
          items={items}
        />
      </div>
      <div className="pip-card__meta">
        <span className="tnum">{daysInStageLabel(card.days)}</span>
        {coach && (
          <span className="pip-card__coach">
            <Icon name="user" size={12} />
            <span className="visually-hidden">Kouč: </span>
            {therapistShort(coach)}
          </span>
        )}
      </div>
      {card.nextSessionAt ? (
        <div className="pip-card__line">
          <Icon name="calendar" size={12} />
          <span className="truncate">
            <span className="pip-card__label">Příští schůzka </span>
            <span className="tnum">{sessionLabel(card.nextSessionAt, now)}</span>
          </span>
        </div>
      ) : (
        !closed && (
          <div className="pip-card__line pip-card__line--muted">
            <Icon name="calendarX" size={12} />
            <span>Bez naplánované schůzky</span>
          </div>
        )
      )}
      {fu && due && (
        <div className={cx('pip-card__fu', due.overdue && 'is-overdue')}>
          <Icon name={due.overdue ? 'alertCircle' : 'clock'} size={12} className="pip-card__fu-icon" />
          <span className="pip-card__fu-title" title={fu.title}>
            <span className="visually-hidden">Follow-up: </span>
            {fu.title}
          </span>
          <span className="pip-card__fu-sub">
            <span className="pip-card__fu-due tnum">{due.label}</span>
            {due.overdueText && <span className="pip-card__late">{due.overdueText}</span>}
            {card.openFollowUps > 1 && (
              <span className="pip-card__fu-more tnum" title={countLabel(card.openFollowUps, ['otevřený follow-up', 'otevřené follow-upy', 'otevřených follow-upů'])}>
                <span aria-hidden="true">+{formatNumber(card.openFollowUps - 1)}</span>
                <span className="visually-hidden">a {countLabel(card.openFollowUps - 1, ['další', 'další', 'dalších'])}</span>
              </span>
            )}
          </span>
        </div>
      )}
      {tags.length > 0 && (
        <div className="pip-card__tags">
          {tags.map((t) => (
            <Badge key={t} size="sm" outline>
              {t}
            </Badge>
          ))}
          {moreTags > 0 && (
            <span className="pip-card__more-tags tnum" title={client.tags.slice(MAX_TAGS).join(', ')}>
              +{formatNumber(moreTags)}
            </span>
          )}
        </div>
      )}
    </li>
  );
});
