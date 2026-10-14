import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Id } from '../../domain/types';
import { countLabel, formatDayShort, formatMoney, formatNumber, formatRelative, formatTime } from '../../engine/format';
import { useClinic, useNow } from '../../store/hooks';
import { navigate } from '../../store/session';
import { Avatar, Badge, Button, Card, EmptyState, Icon, IconButton, Input, PageHeader, Select, Table, cx, type IconName } from '../../ui';
import { NewClientDialog } from './ClientForm';
import {
  allTags,
  buildClientRows,
  compareRows,
  DEFAULT_DIR,
  FILTER_LABEL,
  matchesFilter,
  matchesQuery,
  type ClientFilter,
  type ClientRow,
  type ClientSort,
  type SortDir,
  zeZ,
} from './model';
import { FilterChip, Pagination, useMediaQuery, usePermissions } from './parts';

const PAGE_SIZE = 50;
const FINANCE_FILTERS: ClientFilter[] = ['package', 'credit', 'debt', 'noMarketing', 'new', 'blocked'];
const BASIC_FILTERS: ClientFilter[] = ['package', 'noMarketing', 'new', 'blocked'];

interface ListState {
  query: string;
  filters: ClientFilter[];
  tag: string;
  sort: ClientSort;
  dir: SortDir;
  page: number;
}

/** Stav seznamu přežije odchod do detailu klienta a návrat (jen v paměti této záložky). */
let remembered: ListState = { query: '', filters: [], tag: '', sort: 'lastVisit', dir: 'desc', page: 0 };

const SORT_LABEL: Record<ClientSort, string> = {
  lastVisit: 'Poslední návštěva',
  name: 'Jméno',
  spent: 'Útrata',
  created: 'Datum registrace',
};

export function ClientsScreen(): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const perms = usePermissions();
  const compact = useMediaQuery('(max-width: 640px)');
  const [state, setState] = useState<ListState>(remembered);
  const [newOpen, setNewOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    remembered = state;
  }, [state]);

  const update = (patch: Partial<ListState>): void => setState((s) => ({ ...s, page: 0, ...patch }));

  const rows = useMemo(() => buildClientRows(clinic, now), [clinic, now]);
  const tags = useMemo(() => allTags(clinic), [clinic]);

  const availableFilters = perms.finance ? FINANCE_FILTERS : BASIC_FILTERS;
  const activeKey = state.filters.filter((f) => availableFilters.includes(f)).join(',');
  const activeFilters = useMemo(() => (activeKey ? (activeKey.split(',') as ClientFilter[]) : []), [activeKey]);
  const sort: ClientSort = !perms.finance && state.sort === 'spent' ? 'lastVisit' : state.sort;

  // Hledání a štítek; čipové filtry se počítají nad tímto výběrem.
  const base = useMemo(
    () => rows.filter((r) => matchesQuery(r, state.query) && (!state.tag || r.client.tags.includes(state.tag))),
    [rows, state.query, state.tag],
  );
  const counts = useMemo(() => {
    const c = {} as Record<ClientFilter, number>;
    for (const f of availableFilters) c[f] = base.filter((r) => matchesFilter(r, f)).length;
    return c;
  }, [base, availableFilters]);
  const filtered = useMemo(
    () => base.filter((r) => activeFilters.every((f) => matchesFilter(r, f))).sort((a, b) => compareRows(a, b, sort, state.dir)),
    [base, activeFilters, sort, state.dir],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(state.page, pageCount - 1);
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const totals = useMemo(
    () => ({ withPkg: rows.filter((r) => r.packages.length > 0).length, fresh: rows.filter((r) => r.isNew).length }),
    [rows],
  );

  const toggleFilter = (f: ClientFilter): void =>
    update({ filters: activeFilters.includes(f) ? activeFilters.filter((x) => x !== f) : [...activeFilters, f] });
  const setSort = (s: ClientSort): void => update({ sort: s, dir: s === sort ? (state.dir === 'asc' ? 'desc' : 'asc') : DEFAULT_DIR[s] });
  const resetAll = (): void => update({ query: '', filters: [], tag: '' });
  const anyActive = !!state.query || activeFilters.length > 0 || !!state.tag;
  const open = (id: Id): void => navigate({ name: 'klient', clientId: id });

  const sortOptions = (Object.keys(SORT_LABEL) as ClientSort[])
    .filter((s) => perms.finance || s !== 'spent')
    .map((s) => ({ value: s, label: SORT_LABEL[s] }));

  const subtitle =
    rows.length === 0
      ? 'Evidence klientů kliniky'
      : `${countLabel(rows.length, ['klient', 'klienti', 'klientů'])} · ${formatNumber(totals.withPkg)} s aktivní permanentkou · ${formatNumber(totals.fresh)} ${totals.fresh === 1 ? 'nový' : 'nových'} za 30 dní`;

  return (
    <div className="page cli-list">
      <PageHeader
        title="Klienti"
        subtitle={subtitle}
        actions={
          perms.manage ? (
            <Button variant="primary" icon="userPlus" onClick={() => setNewOpen(true)}>
              Nový klient
            </Button>
          ) : undefined
        }
      />

      <Card padding="none" className="cli-listcard">
        <div className="cli-toolbar" role="search">
          <Input
            ref={searchRef}
            type="search"
            className="cli-toolbar__search"
            prefixIcon="search"
            placeholder="Hledat jméno, e-mail nebo telefon"
            aria-label="Hledat klienta"
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
                  className="cli-toolbar__clear"
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
            className="cli-toolbar__select"
            aria-label="Filtrovat podle štítku"
            prefix={compact ? <Icon name="tag" size={14} /> : 'Štítek:'}
            value={state.tag}
            onValueChange={(v) => update({ tag: v })}
            options={[{ value: '', label: compact ? 'Všechny štítky' : 'Všechny' }, ...tags.map((t) => ({ value: t, label: t }))]}
          />
          <Select
            inline
            className="cli-toolbar__select"
            aria-label="Řadit podle"
            prefix={compact ? <Icon name="chevronsUpDown" size={14} /> : 'Řadit:'}
            value={sort}
            onValueChange={(v) => update({ sort: v as ClientSort, dir: DEFAULT_DIR[v as ClientSort] })}
            options={sortOptions}
          />
        </div>
        <div className="cli-filters" role="group" aria-label="Rychlé filtry">
          {availableFilters.map((f) => (
            <FilterChip key={f} pressed={activeFilters.includes(f)} onToggle={() => toggleFilter(f)} count={counts[f]} tone={f === 'debt' || f === 'blocked' ? 'danger' : undefined}>
              {FILTER_LABEL[f]}
            </FilterChip>
          ))}
          {anyActive && (
            <button type="button" className="link cli-filters__reset" onClick={resetAll}>
              Zrušit filtry
            </button>
          )}
        </div>
        <div className="cli-resultline" aria-live="polite">
          {anyActive ? (
            <>
              Nalezeno <strong className="tnum">{formatNumber(filtered.length)}</strong> {zeZ(rows.length)} {countLabel(rows.length, ['klienta', 'klientů', 'klientů'])}
            </>
          ) : (
            <>{countLabel(rows.length, ['klient', 'klienti', 'klientů'])}</>
          )}
          <span className="cli-resultline__sort">· řazeno: {SORT_LABEL[sort].toLocaleLowerCase('cs')}</span>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon="users"
            title="Zatím tu nejsou žádní klienti"
            text="Založte prvního klienta, nebo v testovacím panelu načtěte ukázková data."
            action={
              perms.manage ? (
                <Button variant="primary" icon="userPlus" onClick={() => setNewOpen(true)}>
                  Nový klient
                </Button>
              ) : undefined
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="search"
            title="Nikdo neodpovídá hledání"
            text={`Zkuste jiné jméno, e-mail nebo telefon${activeFilters.length || state.tag ? ', nebo zrušte filtry' : ''}.`}
            action={<Button onClick={resetAll}>Zrušit hledání a filtry</Button>}
          />
        ) : compact ? (
          <ul className="cli-mlist">
            {pageRows.map((r) => (
              <MobileRow key={r.client.id} row={r} finance={perms.finance} now={now} onOpen={open} />
            ))}
          </ul>
        ) : (
          <Table caption="Seznam klientů" hover minWidth={perms.finance ? 1060 : 860} wrapperClassName="cli-tablewrap">
            <thead>
              <tr>
                <SortTh label="Klient" sortKey="name" sort={sort} dir={state.dir} onSort={setSort} />
                <th scope="col">Kontakt</th>
                <th scope="col">Aktivní permanentka</th>
                {perms.finance && (
                  <th scope="col" className="num">
                    Kredit
                  </th>
                )}
                <SortTh label="Poslední návštěva" sortKey="lastVisit" sort={sort} dir={state.dir} onSort={setSort} />
                <th scope="col">Příští</th>
                {perms.finance && <SortTh label="Útrata" sortKey="spent" sort={sort} dir={state.dir} onSort={setSort} num />}
                <th scope="col">Upozornění</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <ClientTableRow key={r.client.id} row={r} finance={perms.finance} now={now} onOpen={open} />
              ))}
            </tbody>
          </Table>
        )}
        {filtered.length > 0 && (
          <div className="cli-cardfoot">
            <Pagination
              page={page}
              pageCount={pageCount}
              total={filtered.length}
              pageSize={PAGE_SIZE}
              onChange={(p) => setState((s) => ({ ...s, page: p }))}
              label="Stránkování klientů"
            />
          </div>
        )}
      </Card>

      <NewClientDialog open={newOpen} onClose={() => setNewOpen(false)} onCreated={open} />
    </div>
  );
}

function SortTh({
  label,
  sortKey,
  sort,
  dir,
  onSort,
  num,
}: {
  label: string;
  sortKey: ClientSort;
  sort: ClientSort;
  dir: SortDir;
  onSort: (s: ClientSort) => void;
  num?: boolean;
}): JSX.Element {
  const activeSort = sort === sortKey;
  const icon: IconName = !activeSort ? 'chevronsUpDown' : dir === 'asc' ? 'arrowUp' : 'arrowDown';
  return (
    <th scope="col" className={cx(num && 'num')} aria-sort={activeSort ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={cx('cli-sortbtn', activeSort && 'is-active')} onClick={() => onSort(sortKey)}>
        {label}
        <Icon name={icon} size={12} />
      </button>
    </th>
  );
}

function Alerts({ row, finance }: { row: ClientRow; finance: boolean }): JSX.Element | null {
  const items: ReactNode[] = [];
  if (finance && row.debt > 0)
    items.push(
      <Badge key="debt" tone="danger" dot="square">
        Dluh {formatMoney(row.debt)}
      </Badge>,
    );
  if (row.client.blocked)
    items.push(
      <Badge key="blocked" tone="danger" icon="ban">
        Online zablokováno
      </Badge>,
    );
  if (row.noShows90 > 0)
    items.push(
      <Badge key="ns" tone="warning" dot="square">
        {row.noShows90}× nedostavení
      </Badge>,
    );
  if (!items.length) return null;
  return <span className="cli-alerts">{items}</span>;
}

function PackageCell({ row }: { row: ClientRow }): JSX.Element {
  const first = row.packages[0];
  if (!first) return <span className="muted">—</span>;
  const { pkg, usage } = first;
  return (
    <span className="cli-pkgcell">
      <span className="cli-pkgcell__name">
        {pkg.name}
        {row.packages.length > 1 && <span className="muted"> +{row.packages.length - 1}</span>}
      </span>
      <span className="cli-cell-sub tnum">
        {usage.free}/{usage.total} volné{usage.reserved ? ` · ${usage.reserved} rez.` : ''}
      </span>
    </span>
  );
}

function ClientTableRow({ row, finance, now, onOpen }: { row: ClientRow; finance: boolean; now: string; onOpen: (id: Id) => void }): JSX.Element {
  const c = row.client;
  return (
    <tr data-clickable="" onClick={() => onOpen(c.id)}>
      <td>
        <span className="cli-who">
          <Avatar initials={(c.firstName.charAt(0) + c.lastName.charAt(0)).toUpperCase()} tone="slate" size="sm" />
          <span className="cli-who__text">
            <span className="cli-who__line">
              <button
                type="button"
                className="cli-rowlink cli-who__name"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(c.id);
                }}
              >
                {c.lastName} {c.firstName}
              </button>
              {row.isNew && (
                <Badge tone="accent" size="sm">
                  Nový
                </Badge>
              )}
            </span>
            {c.tags.length > 0 && (
              <span className="cli-who__tags">
                {c.tags.slice(0, 2).map((t) => (
                  <span key={t} className="cli-taglabel cli-taglabel--sm">
                    {t}
                  </span>
                ))}
                {c.tags.length > 2 && <span className="cli-cell-sub">+{c.tags.length - 2}</span>}
              </span>
            )}
          </span>
        </span>
      </td>
      <td>
        <span className="cli-contact">
          <span className="tnum nowrap">{c.phone || <span className="muted">bez telefonu</span>}</span>
          <span className="cli-cell-sub cli-contact__email">{c.email || 'bez e-mailu'}</span>
        </span>
      </td>
      <td>
        <PackageCell row={row} />
      </td>
      {finance && <td className="num">{row.credit > 0 ? formatMoney(row.credit) : <span className="muted">—</span>}</td>}
      <td className="nowrap">
        {row.lastVisit ? (
          <>
            {formatDayShort(row.lastVisit)} {row.lastVisit.slice(0, 4) !== now.slice(0, 4) ? row.lastVisit.slice(0, 4) : ''}
            <span className="cli-cell-sub">{formatRelative(row.lastVisit, now)}</span>
          </>
        ) : (
          <span className="muted">bez návštěvy</span>
        )}
      </td>
      <td className="nowrap">
        {row.next ? (
          <>
            {formatDayShort(row.next.start)} {formatTime(row.next.start)}
            <span className="cli-cell-sub">{formatRelative(row.next.start, now)}</span>
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      {finance && <td className="num">{formatMoney(row.spent)}</td>}
      <td>
        <Alerts row={row} finance={finance} />
      </td>
    </tr>
  );
}

function MobileRow({ row, finance, now, onOpen }: { row: ClientRow; finance: boolean; now: string; onOpen: (id: Id) => void }): JSX.Element {
  const c = row.client;
  const pkg = row.packages[0];
  return (
    <li>
      <button type="button" className="cli-mrow" onClick={() => onOpen(c.id)}>
        <Avatar initials={(c.firstName.charAt(0) + c.lastName.charAt(0)).toUpperCase()} tone="slate" size="sm" />
        <span className="cli-mrow__main">
          <span className="cli-mrow__name">
            {c.lastName} {c.firstName}
            {row.isNew && (
              <Badge tone="accent" size="sm">
                Nový
              </Badge>
            )}
          </span>
          <span className="cli-mrow__sub tnum">{c.phone || c.email || 'bez kontaktu'}</span>
          <span className="cli-mrow__sub tnum">
            {row.next ? `Příští ${formatDayShort(row.next.start)} ${formatTime(row.next.start)}` : row.lastVisit ? `Naposledy ${formatRelative(row.lastVisit, now)}` : 'Bez návštěvy'}
            {pkg ? ` · ${pkg.pkg.name} ${pkg.usage.free}/${pkg.usage.total}` : ''}
            {finance && row.credit > 0 ? ` · kredit ${formatMoney(row.credit)}` : ''}
          </span>
          <Alerts row={row} finance={finance} />
        </span>
        <Icon name="chevronRight" size={16} className="cli-mrow__chev" />
      </button>
    </li>
  );
}
