import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Id, LocalDate } from '../../domain/types';
import { downloadFile, downloadNotice } from '../../app/download';
import { countLabel, formatMoney, formatNumber, formatPercent, plural } from '../../engine/format';
import { pendingPaymentRequests } from '../../engine/qr';
import { clientName, getClient, getTherapist, therapistName } from '../../engine/selectors';
import { dateOf } from '../../engine/time';
import { VISIT_KINDS, VISIT_KIND_LABEL, visitsCsv, visitsOverview, type VisitFilters } from '../../engine/visits';
import { ToneDot } from '../../components/domain';
import { PendingPaymentsList } from '../../components/payments';
import { useActor, useClinic, useNow } from '../../store/hooks';
import { navigate } from '../../store/session';
import {
  Button,
  Card,
  CardHeader,
  ChoiceChips,
  EmptyState,
  Icon,
  Input,
  KpiTile,
  PageHeader,
  PeriodNav,
  Progress,
  Segmented,
  Select,
  Switch,
  toast,
  type ChoiceOption,
} from '../../ui';
import { BookingDrawer } from '../calendar';
import { EmployeeSummary } from './EmployeeSummary';
import { PHONE_QUERY, useMediaQuery } from './hooks';
import {
  PERIOD_PRESETS,
  STATUS_OPTIONS,
  applyPreset,
  clampCustom,
  csvFileName,
  defaultPeriod,
  prepaidMakeups,
  presetOf,
  resolvePeriod,
  rowStats,
  setCustomRange,
  shareOf,
  shiftPeriod,
  type KindFilter,
  type PeriodState,
  type PresetId,
  type StatusFilter,
} from './model';
import { LIST_PAGE, VisitList } from './VisitList';
import './visits.css';

const VSTUP: [string, string, string] = ['vstup', 'vstupy', 'vstupů'];
const PLATBA: [string, string, string] = ['platba', 'platby', 'plateb'];
/** Terapeut bez přiřazeného profilu nevidí nic (nikdy ne cizí vstupy). */
const NO_ONE = '__nikdo__';
const MORE_FILTERS_ID = 'vis-more-filters';

interface ViewState {
  period: PeriodState;
  /** '' = všichni zaměstnanci */
  therapistId: Id;
  /** '' = všechny služby */
  serviceId: Id;
  kind: KindFilter;
  status: StatusFilter;
  unpaidOnly: boolean;
  /** Zaměstnanec vybraný v tabulce „Podle zaměstnanců“ – zužuje jen seznam vstupů. */
  selected: Id | null;
  /** Kolik vstupů seznam ukazuje. */
  shown: number;
}

const initialState = (today: LocalDate): ViewState => ({
  period: defaultPeriod(today),
  therapistId: '',
  serviceId: '',
  kind: 'all',
  status: 'all',
  unpaidOnly: false,
  selected: null,
  shown: LIST_PAGE,
});

/** Volby přežijí odchod na kartu klienta a návrat (jen v paměti této záložky). */
let remembered: ViewState | null = null;

const pctText = (share: number | null): string => (share === null ? '—' : formatPercent(Math.round(share * 100)));

/** Řádek „proběhlo 127 · plánováno 100“ – dvojice popisek + hodnota se nerozdělí na dva řádky. */
function StatLine({ items }: { items: (readonly [string, string] | false)[] }): JSX.Element {
  const shown = items.filter((x): x is readonly [string, string] => x !== false);
  return (
    <span className="vis-kpi-extra">
      {shown.map(([label, value], i) => (
        <Fragment key={label}>
          {i > 0 && ' · '}
          <span className="vis-pair">
            {label} <strong>{value}</strong>
          </span>
        </Fragment>
      ))}
    </span>
  );
}

const NAV_LABELS: Record<PeriodState['unit'], [string, string]> = {
  week: ['Předchozí týden', 'Následující týden'],
  month: ['Předchozí měsíc', 'Následující měsíc'],
  custom: ['Předchozí období', 'Následující období'],
};

/** Přehled vstupů: z čeho klienti platí (permanentka, kredit, jednorázově…) po zaměstnancích. */
export function VisitsScreen(): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const actor = useActor();
  const today = dateOf(now);
  const compact = useMediaQuery(PHONE_QUERY);
  const [state, setState] = useState<ViewState>(() => remembered ?? initialState(today));
  const [drawerId, setDrawerId] = useState<Id | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    remembered = state;
  }, [state]);

  /** Změna filtru vrací seznam na prvních 50 vstupů. */
  const update = (patch: Partial<ViewState>): void => setState((s) => ({ ...s, shown: LIST_PAGE, ...patch }));

  const locked = actor.role === 'therapist' ? (actor.therapistId ?? NO_ONE) : null;
  const finance = actor.role === 'owner' || actor.role === 'reception';

  const therapists = useMemo(() => clinic.therapists.filter((t) => t.active).sort((a, b) => a.order - b.order), [clinic.therapists]);
  const services = useMemo(() => {
    const catOrder = new Map(clinic.categories.map((c) => [c.id, c.order]));
    return clinic.services
      .filter((s) => s.active)
      .sort((a, b) => (catOrder.get(a.categoryId) ?? 0) - (catOrder.get(b.categoryId) ?? 0) || a.order - b.order);
  }, [clinic.services, clinic.categories]);

  // volba, která mezitím zmizela (neaktivní terapeut / služba), se tiše ignoruje
  const therapistId = locked ?? (therapists.some((t) => t.id === state.therapistId) ? state.therapistId : '');
  const serviceId = services.some((s) => s.id === state.serviceId) ? state.serviceId : '';

  const period = useMemo(() => resolvePeriod(state.period, today), [state.period, today]);
  const filters = useMemo<VisitFilters>(
    () => ({
      from: period.from,
      to: period.to,
      therapistId: therapistId || null,
      serviceId: serviceId || null,
      kinds: state.kind === 'all' ? null : [state.kind],
      status: state.status,
      unpaidOnly: state.unpaidOnly,
    }),
    [period.from, period.to, therapistId, serviceId, state.kind, state.status, state.unpaidOnly],
  );

  // drahé výpočty jen při změně dat, filtrů nebo času
  const overview = useMemo(() => visitsOverview(clinic, filters, today, now), [clinic, filters, today, now]);
  const kindCounts = useMemo(
    () => (filters.kinds ? visitsOverview(clinic, { ...filters, kinds: null }, today, now).totals.byKind : overview.totals.byKind),
    [clinic, filters, today, now, overview],
  );
  const stats = useMemo(() => rowStats(overview.rows), [overview.rows]);

  const selectable = !therapistId && overview.byEmployee.length > 1;
  const selected = selectable && state.selected && overview.byEmployee.some((e) => e.therapistId === state.selected) ? state.selected : null;
  const listRows = useMemo(
    () => (selected ? overview.rows.filter((r) => r.booking.therapistId === selected) : overview.rows),
    [overview.rows, selected],
  );
  const selectedTherapist = selected ? getTherapist(clinic, selected) : undefined;

  const pending = useMemo(() => (finance ? pendingPaymentRequests(clinic) : []), [clinic, finance]);
  const pendingTotal = useMemo(() => pending.reduce((sum, r) => sum + r.amount, 0), [pending]);

  /* ------------------------------ akce ------------------------------ */
  const setPeriod = (p: PeriodState): void => update({ period: p });
  const toggleSelected = (id: Id): void => update({ selected: selected === id ? null : id });
  const clearSelected = (): void => update({ selected: null });
  const activeFilters = [!locked && !!therapistId, !!serviceId, state.kind !== 'all', state.status !== 'all', state.unpaidOnly].filter(Boolean).length;
  const anyFilter = activeFilters > 0;
  const resetFilters = (): void => update({ therapistId: '', serviceId: '', kind: 'all', status: 'all', unpaidOnly: false, selected: null });

  const exportCsv = async (): Promise<void> => {
    const csv = visitsCsv(clinic, listRows, {
      client: (id) => clientName(getClient(clinic, id)),
      therapist: (id) => therapistName(getTherapist(clinic, id)),
    });
    const notice = downloadNotice(await downloadFile(csvFileName(period.from, period.to), csv, 'text/csv;charset=utf-8'));
    if (notice) toast.info(notice);
  };

  /* ------------------------------ filtry ------------------------------ */
  const preset = presetOf(state.period);
  const custom = state.period.unit === 'custom' ? clampCustom(state.period.customFrom, state.period.customTo) : null;
  const [prevLabel, nextLabel] = NAV_LABELS[state.period.unit];

  const kindTotal = VISIT_KINDS.reduce((n, k) => n + kindCounts[k], 0);
  const chipLabel = (label: string, count: number): ReactNode => (
    <>
      {label}
      <span className="vis-chip-count">
        {formatNumber(count)}
        <span className="visually-hidden"> {plural(count, VSTUP)}</span>
      </span>
    </>
  );
  const kindOptions: ChoiceOption<KindFilter>[] = [
    { value: 'all', label: chipLabel('Vše', kindTotal) },
    ...VISIT_KINDS.map((k) => ({ value: k, label: chipLabel(VISIT_KIND_LABEL[k], kindCounts[k]) })),
  ];

  const lockedName = locked ? therapistName(getTherapist(clinic, locked)) : '';
  const employeeSelect = (
    <Select
      className="vis-select"
      aria-label="Zaměstnanec"
      title={locked ? 'Terapeut vidí jen své vstupy' : undefined}
      disabled={!!locked}
      prefix={locked ? <Icon name="lock" size={14} /> : undefined}
      value={therapistId}
      onValueChange={(v) => update({ therapistId: v, selected: null })}
      options={
        locked
          ? [{ value: locked, label: lockedName }]
          : [{ value: '', label: 'Všichni zaměstnanci' }, ...therapists.map((t) => ({ value: t.id, label: therapistName(t) }))]
      }
    />
  );
  const serviceSelect = (
    <Select
      className="vis-select"
      aria-label="Služba"
      value={serviceId}
      onValueChange={(v) => update({ serviceId: v })}
      options={[{ value: '', label: 'Všechny služby' }, ...services.map((s) => ({ value: s.id, label: s.name }))]}
    />
  );

  // na telefonu jsou filtry (kromě období) schované pod tlačítkem, ať je přehled hned vidět
  const filtersHidden = compact && !filtersOpen;

  const filterBar = (
    <div className="vis-filters" role="group" aria-label="Období a filtry">
      <div className="vis-filters__row">
        {compact ? (
          <>
            <Select
              className="vis-period-select"
              aria-label="Období"
              value={preset}
              placeholder="Jiné období"
              onValueChange={(v) => v && setPeriod(applyPreset(state.period, v as PresetId, today))}
              options={PERIOD_PRESETS}
            />
            <Button
              className="vis-filter-toggle"
              icon="filter"
              iconRight={filtersOpen ? 'chevronUp' : 'chevronDown'}
              aria-expanded={filtersOpen}
              aria-controls={MORE_FILTERS_ID}
              onClick={() => setFiltersOpen((o) => !o)}
            >
              Filtry
              {activeFilters > 0 && (
                <span className="vis-filter-count">
                  {activeFilters}
                  <span className="visually-hidden"> {plural(activeFilters, ['aktivní', 'aktivní', 'aktivních'])}</span>
                </span>
              )}
            </Button>
          </>
        ) : (
          <Segmented<PresetId | ''>
            aria-label="Období"
            size="lg"
            value={preset}
            onChange={(v) => v && setPeriod(applyPreset(state.period, v, today))}
            options={PERIOD_PRESETS}
          />
        )}
        <PeriodNav
          className="vis-periodnav"
          label={period.navLabel}
          prevLabel={prevLabel}
          nextLabel={nextLabel}
          onPrev={() => setPeriod(shiftPeriod(state.period, -1))}
          onNext={() => setPeriod(shiftPeriod(state.period, 1))}
        />
        {custom && (
          <div className="vis-custom">
            <Input
              type="date"
              prefix="Od"
              aria-label="Začátek období"
              value={custom.from}
              max={custom.to}
              onValueChange={(v) => setPeriod(setCustomRange(state.period, v, custom.to))}
            />
            <Input
              type="date"
              prefix="Do"
              aria-label="Konec období"
              value={custom.to}
              min={custom.from}
              onValueChange={(v) => setPeriod(setCustomRange(state.period, custom.from, v))}
            />
          </div>
        )}
      </div>
      <div id={MORE_FILTERS_ID} className="vis-filters__more" hidden={filtersHidden}>
        <div className="vis-filters__row">
          <div className="vis-selects">
            {employeeSelect}
            {serviceSelect}
          </div>
          {compact ? (
            <Select
              className="vis-status-select"
              aria-label="Stav termínu"
              value={state.status}
              onValueChange={(v) => update({ status: v as StatusFilter })}
              options={STATUS_OPTIONS.map((o) => (o.value === 'all' ? { value: o.value, label: 'Všechny stavy' } : o))}
            />
          ) : (
            <Segmented<StatusFilter> aria-label="Stav termínu" size="lg" value={state.status} onChange={(v) => update({ status: v })} options={STATUS_OPTIONS} />
          )}
        </div>
        <div className="vis-filters__row vis-filters__row--kinds">
          <span className="vis-filter-label" aria-hidden="true">
            Zdroj platby
          </span>
          <ChoiceChips<KindFilter> className="vis-kinds" aria-label="Zdroj platby" value={state.kind} onChange={(v) => update({ kind: v })} options={kindOptions} />
          <Switch className="vis-unpaid" checked={state.unpaidOnly} onChange={(v) => update({ unpaidOnly: v })} label="Jen nezaplacené" labelPosition="end" />
          {anyFilter && (
            <Button variant="ghost" size="sm" icon="x" className="vis-reset" onClick={resetFilters}>
              Zrušit filtry
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  /* ------------------------------ KPI ------------------------------ */
  const T = overview.totals;
  const prepaidShare = shareOf(T.prepaid, T.total);
  const singleShare = shareOf(T.single, T.total);
  const kpis = (
    <div className="vis-kpis">
      <KpiTile label="Vstupy celkem" value={formatNumber(T.total)}>
        <StatLine
          items={[
            ['proběhlo', formatNumber(stats.done)],
            ['plánováno', formatNumber(stats.planned)],
            stats.missed > 0 && ['nedostavení a storna', formatNumber(stats.missed)],
          ]}
        />
      </KpiTile>
      <KpiTile label="Předplacené" value={formatNumber(T.prepaid)}>
        <span className="vis-kpi-share">
          <Progress value={Math.round((prepaidShare ?? 0) * 100)} label={`Podíl předplacených vstupů ${pctText(prepaidShare)}`} />
          <span className="vis-kpi-extra">
            <strong>{pctText(prepaidShare)}</strong> vstupů
          </span>
        </span>
        <StatLine
          items={[
            ['permanentka', formatNumber(T.byKind.package)],
            ['kredit', formatNumber(T.byKind.credit)],
            prepaidMakeups(T) > 0 && ['náhrada', formatNumber(prepaidMakeups(T))],
          ]}
        />
      </KpiTile>
      <KpiTile label="Jednorázově" value={formatNumber(T.single)}>
        <span className="vis-kpi-share">
          <Progress value={Math.round((singleShare ?? 0) * 100)} tone="neutral" label={`Podíl jednorázových vstupů ${pctText(singleShare)}`} />
          <span className="vis-kpi-extra">
            <strong>{pctText(singleShare)}</strong> vstupů
          </span>
        </span>
        <StatLine items={[['tržba', formatMoney(T.singleRevenue)]]} />
      </KpiTile>
      <KpiTile label="Nezaplaceno" value={<span className={T.unpaid > 0 ? 'vis-kpi-alert' : undefined}>{formatNumber(T.unpaid)}</span>}>
        <StatLine
          items={[
            ['k úhradě', formatMoney(stats.unpaidAmount)],
            stats.qrPending > 0 && [`z toho ${plural(stats.qrPending, ['čeká', 'čekají', 'čeká'])} na QR`, formatNumber(stats.qrPending)],
          ]}
        />
        <StatLine items={[['zaplatí na místě', formatNumber(T.onsite)]]} />
      </KpiTile>
    </div>
  );

  /* ------------------------------ karty ------------------------------ */
  const employeeCard = (
    <Card as="section" padding="none" className="vis-card" aria-label={locked ? 'Souhrn vašich vstupů' : 'Vstupy podle zaměstnanců'}>
      <CardHeader
        divided
        title={locked ? 'Vaše vstupy podle zdroje platby' : 'Podle zaměstnanců'}
        subtitle={selectable ? 'Vyberte zaměstnance a v seznamu níže uvidíte jen jeho vstupy.' : undefined}
        meta={period.rangeText}
        actions={
          selected ? (
            <button type="button" className="link vis-clear" onClick={clearSelected}>
              Zrušit výběr
            </button>
          ) : undefined
        }
      />
      <EmployeeSummary
        clinic={clinic}
        rows={overview.byEmployee}
        totals={T}
        selected={selected}
        onSelect={selectable ? toggleSelected : null}
      />
    </Card>
  );

  const qrCard = finance ? (
    <Card as="section" padding="none" className="vis-card" aria-label="Čekající QR platby">
      <CardHeader
        divided
        title="Čekající QR platby"
        subtitle="Nezávisí na vybraném období. Přijetí potvrďte podle variabilního symbolu ve výpisu z účtu."
        meta={pending.length ? `${countLabel(pending.length, PLATBA)} · ${formatMoney(pendingTotal)}` : undefined}
      />
      <div className="card__body vis-qr">
        <PendingPaymentsList requests={pending} showClient limit={6} />
      </div>
    </Card>
  ) : null;

  const listEmpty =
    clinic.bookings.length === 0 ? (
      <EmptyState
        icon="calendar"
        title="Zatím tu nejsou žádné vstupy"
        text="Vstupy se tu objeví s prvními rezervacemi. Vytvoříte je v kalendáři."
        action={
          <Button variant="primary" icon="calendar" onClick={() => navigate({ name: 'kalendar' })}>
            Otevřít kalendář
          </Button>
        }
      />
    ) : selected && overview.rows.length > 0 ? (
      <EmptyState
        icon="user"
        title={`${therapistName(selectedTherapist)} nemá v tomto výběru žádné vstupy`}
        text="Vyberte jiného zaměstnance nebo zobrazte vstupy všech."
        action={<Button onClick={clearSelected}>Zobrazit všechny zaměstnance</Button>}
      />
    ) : anyFilter ? (
      <EmptyState
        icon="filter"
        title="Filtrům neodpovídá žádný vstup"
        text="Zkuste některý filtr zrušit nebo vyberte jiné období."
        action={<Button onClick={resetFilters}>Zrušit filtry</Button>}
      />
    ) : (
      <EmptyState
        icon="receipt"
        title="V tomto období nejsou žádné vstupy"
        text="Zkuste jiné období – třeba to předchozí."
        action={<Button onClick={() => setPeriod(shiftPeriod(state.period, -1))}>{prevLabel}</Button>}
      />
    );

  const visitCard = (
    <Card as="section" padding="none" className="vis-card" aria-label="Seznam vstupů">
      <CardHeader
        divided
        title="Vstupy"
        meta={countLabel(listRows.length, VSTUP)}
        actions={
          selected ? (
            <button type="button" className="vis-selchip" onClick={clearSelected}>
              <ToneDot tone={selectedTherapist?.tone ?? 'slate'} />
              <span className="vis-selchip__name">{therapistName(selectedTherapist)}</span>
              <Icon name="x" size={14} />
              <span className="visually-hidden"> – zrušit výběr zaměstnance</span>
            </button>
          ) : undefined
        }
      />
      {listRows.length === 0 ? (
        listEmpty
      ) : (
        <VisitList
          clinic={clinic}
          rows={listRows}
          shown={state.shown}
          onShowMore={() => setState((s) => ({ ...s, shown: s.shown + LIST_PAGE }))}
          onOpen={setDrawerId}
          showTherapist={!locked}
          today={today}
        />
      )}
    </Card>
  );

  return (
    <div className="page">
      <PageHeader
        title="Vstupy a platby"
        subtitle={
          locked
            ? 'Z čeho platí vaši klienti – z permanentky, z kreditu nebo jednorázově.'
            : 'Z čeho klienti platí – z permanentky, z kreditu nebo jednorázově. Přehled u všech zaměstnanců.'
        }
        actions={
          <Button icon="download" onClick={() => void exportCsv()} disabled={listRows.length === 0}>
            Export CSV
          </Button>
        }
      />
      {filterBar}
      {kpis}
      {employeeCard}
      {qrCard}
      {visitCard}
      <BookingDrawer bookingId={drawerId} onClose={() => setDrawerId(null)} />
    </div>
  );
}
