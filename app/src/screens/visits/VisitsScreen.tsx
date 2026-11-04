import { useEffect, useMemo, useState } from 'react';
import type { Id } from '../../domain/types';
import { PendingPaymentsList } from '../../components/payments';
import { countLabel, formatMoney, formatNumber, formatPercent } from '../../engine/format';
import { pendingPaymentRequests } from '../../engine/payments';
import { getService, getTherapist, therapistName, therapistShort } from '../../engine/selectors';
import { dateOf, isValidLocalDate } from '../../engine/time';
import { emptyVisitSummary, visitsOverview, type EmployeeVisitSummary, type VisitFilters, type VisitSource } from '../../engine/visits';
import { useActor, useClinic, useNow } from '../../store/hooks';
import { navigate } from '../../store/session';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Icon,
  Input,
  KpiTile,
  Menu,
  PageHeader,
  PeriodNav,
  Segmented,
  Select,
  toast,
} from '../../ui';
import { BookingDrawer } from '../calendar';
import { downloadTextFile } from './download';
import {
  applyPreset,
  clampCustom,
  csvFileName,
  employeeName,
  loadPrefs,
  presetOf,
  resolvePeriod,
  savePrefs,
  shiftPeriod,
  STATUS_FILTER_OPTIONS,
  summaryCsv,
  visitsCsv,
  type PeriodPreset,
  type PeriodState,
  type VisitPrefs,
} from './model';
import { EmployeeSummaryTable, Pager, SourceChips, useMediaQuery, VisitCards, VisitTable } from './parts';
import './visits.css';

const PAGE_SIZE = 25;

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: 'week', label: 'Tento týden' },
  { value: 'month', label: 'Tento měsíc' },
  { value: 'lastMonth', label: 'Minulý měsíc' },
  { value: 'custom', label: 'Vlastní' },
];

const VSTUP: [string, string, string] = ['vstup', 'vstupy', 'vstupů'];

/**
 * Přehled vstupů (docs/VSTUPY-SKUPINY-QR.md, část 1): u každé rezervace všech zaměstnanců zdroj platby –
 * permanentka, kredit, jednorázově, čekající QR platba, nezaplaceno, náhrada, zdarma. Souhrn po zaměstnancích,
 * seznam vstupů se stránkováním, export CSV a čekající QR platby. Terapeut vidí jen své vstupy.
 */
export function VisitsScreen(): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const actor = useActor();
  const today = dateOf(now);
  const compact = useMediaQuery('(max-width: 760px)');

  const locked = actor.role !== 'owner' && actor.role !== 'reception';
  const ownId: Id | null = locked ? actor.therapistId ?? null : null;
  const isStaff = !locked;

  const [prefs, setPrefs] = useState<VisitPrefs>(() => loadPrefs(today));
  useEffect(() => savePrefs(prefs), [prefs]);
  const update = (patch: Partial<VisitPrefs>): void => setPrefs((p) => ({ ...p, ...patch }));
  const setPeriod = (period: PeriodState): void => update({ period });

  const [page, setPage] = useState(0);
  const [drawerId, setDrawerId] = useState<Id | null>(null);
  const [exporting, setExporting] = useState(false);

  /* ------------------------------ volby filtrů ------------------------------ */
  const therapists = useMemo(() => [...clinic.therapists].sort((a, b) => a.order - b.order), [clinic.therapists]);
  const services = useMemo(() => [...clinic.services].sort((a, b) => a.order - b.order), [clinic.services]);
  const selectedId: Id | null = locked ? ownId : therapists.some((t) => t.id === prefs.therapistId) ? prefs.therapistId : null;
  const serviceId: Id | null = services.some((s) => s.id === prefs.serviceId) ? prefs.serviceId : null;
  const sources: VisitSource[] | null = prefs.sources.length ? prefs.sources : null;

  const range = useMemo(() => resolvePeriod(prefs.period, today), [prefs.period, today]);
  const preset = presetOf(prefs.period);
  const custom = prefs.period.unit === 'custom' ? clampCustom(prefs.period.customFrom, prefs.period.customTo) : null;
  const setCustom = (from: string, to: string): void => {
    if (!isValidLocalDate(from) || !isValidLocalDate(to)) return;
    const c = clampCustom(from, to);
    setPeriod({ ...prefs.period, unit: 'custom', offset: 0, customFrom: c.from, customTo: c.to });
  };

  /* ------------------------------ výpočet ------------------------------ */
  // Souhrn vždy za všechny zaměstnance (terapeut jen za sebe); vybraný zaměstnanec filtruje jen seznam.
  const engineTherapist: Id | null = locked ? ownId ?? '__nikdo__' : null;
  const baseFilters = useMemo<VisitFilters>(
    () => ({ from: range.from, to: range.to, therapistId: engineTherapist, serviceId, sources: null, status: prefs.status }),
    [range.from, range.to, engineTherapist, serviceId, prefs.status],
  );
  // drahý výpočet: jen při změně dat, období, filtrů nebo dne
  const base = useMemo(() => visitsOverview(clinic, baseFilters, today), [clinic, baseFilters, today]);
  const overview = useMemo(
    () => (sources ? visitsOverview(clinic, { ...baseFilters, sources }, today) : base),
    [clinic, baseFilters, sources, today, base],
  );
  const listRows = useMemo(
    () => (!locked && selectedId ? overview.rows.filter((r) => r.booking.therapistId === selectedId) : overview.rows),
    [overview, locked, selectedId],
  );
  const scopeOf = (o: typeof overview): EmployeeVisitSummary =>
    !locked && selectedId ? o.byEmployee.find((x) => x.therapistId === selectedId) ?? emptyVisitSummary(selectedId) : o.totals;
  const scope = scopeOf(overview);
  const chipCounts = scopeOf(base).bySource;

  // Nezaplacené vstupy rozdělené bez překryvu: po termínu (dluh), plánované na místě a čekající na QR platbu –
  // části dávají dohromady číslo na dlaždici.
  const kpi = useMemo(() => {
    let planned = 0;
    let duePlanned = 0;
    let dueDone = 0;
    let dueDoneAmount = 0;
    let qrPending = 0;
    for (const r of listRows) {
      const confirmed = r.booking.status === 'confirmed';
      if (confirmed) planned++;
      if (r.info.source === 'qr_pending') qrPending++;
      else if (r.info.source === 'unpaid') {
        if (confirmed) duePlanned++;
        else {
          dueDone++;
          dueDoneAmount += r.info.amount;
        }
      }
    }
    return { planned, duePlanned, dueDone, dueDoneAmount, qrPending, dueCount: duePlanned + dueDone + qrPending };
  }, [listRows]);

  // nezaplacené vstupy po termínu podle zaměstnance – v souhrnu červeně jen tyto, plánované na místě ne
  const overdueUnpaid = useMemo(() => {
    const m = new Map<Id, number>();
    for (const r of overview.rows) {
      if (r.info.source !== 'unpaid' || r.booking.status === 'confirmed') continue;
      m.set(r.booking.therapistId, (m.get(r.booking.therapistId) ?? 0) + 1);
      m.set('', (m.get('') ?? 0) + 1);
    }
    return m;
  }, [overview]);

  const pending = useMemo(() => (isStaff ? pendingPaymentRequests(clinic) : []), [clinic, isStaff]);

  /* ------------------------------ stránkování ------------------------------ */
  const filterKey = [range.from, range.to, selectedId, serviceId, (sources ?? []).join(','), prefs.status].join('|');
  useEffect(() => setPage(0), [filterKey]);
  const pageCount = Math.max(1, Math.ceil(listRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = listRows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  /* ------------------------------ popisky ------------------------------ */
  const selectedTherapist = selectedId ? getTherapist(clinic, selectedId) : undefined;
  const service = serviceId ? getService(clinic, serviceId) : undefined;
  const statusLabel = STATUS_FILTER_OPTIONS.find((o) => o.value === prefs.status)?.label ?? '';
  const filtersActive = (!locked && !!selectedId) || !!serviceId || !!sources || prefs.status !== 'all';
  const resetFilters = (): void => update({ therapistId: locked ? prefs.therapistId : '', serviceId: '', sources: [], status: 'all' });
  const selectEmployee = (id: Id | null): void => update({ therapistId: id ?? '' });

  /* ------------------------------ export ------------------------------ */
  const doExport = async (kind: 'list' | 'summary'): Promise<void> => {
    if (exporting) return;
    setExporting(true);
    try {
      const content = kind === 'list' ? visitsCsv(clinic, listRows) : summaryCsv(clinic, overview.byEmployee, overview.totals);
      // seznam vybraného zaměstnance (a vše u terapeuta) nese v názvu souboru jeho příjmení
      const who = (kind === 'list' || locked) && selectedTherapist ? selectedTherapist.lastName : undefined;
      const name = csvFileName(kind === 'list' ? 'vstupy' : 'vstupy-souhrn', range.from, range.to, who);
      const r = await downloadTextFile(name, content);
      if (r.ok) toast(`Export ${name} je připravený`, { tone: 'success' });
      else if (!r.cancelled) toast(r.reason, { tone: 'danger' });
    } finally {
      setExporting(false);
    }
  };

  /* ------------------------------ prázdné stavy ------------------------------ */
  if (locked && !ownId) {
    return (
      <div className="page vis-root">
        <PageHeader title="Vstupy" />
        <EmptyState
          icon="lock"
          title="Není vybraný zaměstnanec"
          text="Vstupy terapeut vidí jen u sebe. V testovacím panelu vyberte, za koho jste přihlášeni."
        />
      </div>
    );
  }

  if (clinic.bookings.length === 0) {
    return (
      <div className="page vis-root">
        <PageHeader title="Vstupy" subtitle="Přehled vstupů všech zaměstnanců a zdroje jejich platby" />
        <EmptyState
          icon="ticket"
          title="Zatím tu nejsou žádné vstupy"
          text="Vstupy se objeví s prvními rezervacemi. U každého pak uvidíte, jestli je z permanentky, z kreditu, nebo zaplacený jednorázově."
          action={
            <Button variant="primary" icon="calendar" onClick={() => navigate({ name: 'kalendar' })}>
              Otevřít kalendář
            </Button>
          }
        />
      </div>
    );
  }

  /* ------------------------------ obrazovka ------------------------------ */
  const prepaidShare = scope.total > 0 ? formatPercent(Math.round((scope.prepaidCount / scope.total) * 100)) : null;
  const dueCount = kpi.dueCount;
  const showEmployeeColumn = !locked && !selectedId;

  const subtitle = (
    <>
      {range.rangeText}
      {selectedTherapist && <span className="vis-sub-muted"> · {therapistName(selectedTherapist)}</span>}
      {service && <span className="vis-sub-muted"> · {service.name}</span>}
      {prefs.status !== 'all' && <span className="vis-sub-muted"> · {statusLabel.toLocaleLowerCase('cs')}</span>}
    </>
  );

  const exportMenu = (
    <Menu
      label="Export CSV"
      align="end"
      trigger={
        <Button icon="download" loading={exporting}>
          Export CSV
        </Button>
      }
      items={[
        { type: 'label', label: range.rangeText },
        {
          id: 'list',
          label: 'Seznam vstupů',
          icon: 'list',
          hint: formatNumber(listRows.length),
          disabled: listRows.length === 0,
          onSelect: () => void doExport('list'),
        },
        { id: 'summary', label: locked ? 'Souhrn' : 'Souhrn po zaměstnancích', icon: 'users', onSelect: () => void doExport('summary') },
      ]}
    />
  );

  return (
    <div className="page vis-root">
      <PageHeader title="Vstupy" subtitle={subtitle} actions={exportMenu} />

      <div className="vis-filters" role="group" aria-label="Období a filtry vstupů">
        <div className="vis-filters__row">
          <div className="vis-presets">
            <Segmented<PeriodPreset | ''>
              aria-label="Období"
              size="lg"
              value={preset}
              onChange={(v) => v && setPeriod(applyPreset(prefs.period, v, today))}
              options={PRESETS}
            />
          </div>
          <Select
            className="vis-presets-select"
            aria-label="Období"
            value={preset}
            placeholder="Jiné období"
            onValueChange={(v) => v && setPeriod(applyPreset(prefs.period, v as PeriodPreset, today))}
            options={PRESETS}
          />
          <PeriodNav
            className="vis-periodnav"
            label={range.navLabel}
            prevLabel="Předchozí období"
            nextLabel="Další období"
            onPrev={() => setPeriod(shiftPeriod(prefs.period, -1))}
            onNext={() => setPeriod(shiftPeriod(prefs.period, 1))}
          />
          {custom && (
            <div className="vis-custom">
              <Input
                type="date"
                size="sm"
                prefix="Od"
                aria-label="Začátek období"
                value={custom.from}
                max={custom.to}
                onValueChange={(v) => setCustom(v, custom.to)}
              />
              <Input
                type="date"
                size="sm"
                prefix="Do"
                aria-label="Konec období (včetně)"
                value={custom.to}
                min={custom.from}
                onValueChange={(v) => setCustom(custom.from, v)}
              />
            </div>
          )}
        </div>

        <div className="vis-filters__row">
          {locked ? (
            <span className="vis-locked">
              <Select
                inline
                disabled
                prefix="Zaměstnanec:"
                aria-label="Zaměstnanec"
                value={ownId ?? ''}
                options={[{ value: ownId ?? '', label: selectedTherapist ? therapistShort(selectedTherapist) : 'Já' }]}
              />
              <span className="vis-locked__note">
                <Icon name="lock" size={14} />
                Vidíte jen své vstupy
              </span>
            </span>
          ) : (
            <Select
              inline
              prefix="Zaměstnanec:"
              aria-label="Zaměstnanec"
              value={selectedId ?? ''}
              onValueChange={(v) => selectEmployee(v || null)}
              options={[
                { value: '', label: 'Všichni' },
                ...therapists
                  .filter((t) => t.active || t.id === selectedId)
                  .map((t) => ({ value: t.id, label: therapistShort(t) + (t.active ? '' : ' (neaktivní)') })),
              ]}
            />
          )}
          <Select
            inline
            prefix="Služba:"
            aria-label="Služba"
            value={serviceId ?? ''}
            onValueChange={(v) => update({ serviceId: v })}
            options={[
              { value: '', label: 'Všechny' },
              ...services.map((s) => ({ value: s.id, label: s.name + (s.active ? '' : ' (nenabízí se)') })),
            ]}
          />
          <Select
            inline
            prefix="Stav:"
            aria-label="Stav vstupu"
            value={prefs.status}
            onValueChange={(v) => update({ status: v as VisitPrefs['status'] })}
            options={STATUS_FILTER_OPTIONS}
          />
          {filtersActive && (
            <Button variant="ghost" size="sm" icon="x" onClick={resetFilters}>
              Zrušit filtry
            </Button>
          )}
        </div>

        <SourceChips value={prefs.sources} counts={chipCounts} onChange={(next) => update({ sources: next })} />
      </div>

      <div className="vis-kpis">
        <KpiTile label="Vstupy" value={formatNumber(scope.total)}>
          <span className="vis-kpi-extra">
            {prefs.status === 'all' ? (
              <>
                proběhlé a účtované <strong>{formatNumber(scope.total - kpi.planned)}</strong> · plánované <strong>{formatNumber(kpi.planned)}</strong>
              </>
            ) : (
              statusLabel.toLocaleLowerCase('cs')
            )}
          </span>
        </KpiTile>
        <KpiTile label="Předplacené" value={formatNumber(scope.prepaidCount)}>
          <span className="vis-kpi-extra">
            {prepaidShare ? (
              <>
                {prepaidShare} vstupů · hodnota <strong>{formatMoney(scope.prepaidValue)}</strong>
              </>
            ) : (
              'permanentky, kredit a náhrady'
            )}
          </span>
        </KpiTile>
        <KpiTile label="Jednorázově" value={formatNumber(scope.singleCount)}>
          <span className="vis-kpi-extra">
            tržba <strong>{formatMoney(scope.singleRevenue)}</strong>
          </span>
        </KpiTile>
        <KpiTile label="Nezaplaceno" value={formatNumber(dueCount)}>
          <span className="vis-kpi-extra">
            {dueCount === 0 ? (
              'vše zaplaceno nebo předplaceno'
            ) : (
              <>
                {kpi.dueDone > 0 && (
                  <span className="vis-kpi-part vis-kpi-part--danger">
                    po termínu <strong>{formatNumber(kpi.dueDone)}</strong> za <strong>{formatMoney(kpi.dueDoneAmount)}</strong>
                  </span>
                )}
                {kpi.duePlanned > 0 && (
                  <span className="vis-kpi-part">
                    plánované <strong>{formatNumber(kpi.duePlanned)}</strong>
                  </span>
                )}
                {kpi.qrPending > 0 && (
                  <span className="vis-kpi-part">
                    čeká na QR <strong>{formatNumber(kpi.qrPending)}</strong>
                  </span>
                )}
              </>
            )}
          </span>
        </KpiTile>
      </div>

      <Card as="section" padding="none" className="vis-card" aria-labelledby="vis-summary-title">
        <CardHeader
          divided
          size="title"
          headingLevel={2}
          title={<span id="vis-summary-title">{locked ? 'Souhrn' : 'Po zaměstnancích'}</span>}
          meta={
            locked ? undefined : selectedId ? (
              <button type="button" className="link" onClick={() => selectEmployee(null)}>
                Zobrazit všechny zaměstnance
              </button>
            ) : (
              <span className="vis-hint">Kliknutím na řádek zobrazíte vstupy zaměstnance</span>
            )
          }
        />
        <EmployeeSummaryTable
          clinic={clinic}
          byEmployee={overview.byEmployee}
          totals={overview.totals}
          selected={locked ? null : selectedId}
          onSelect={selectEmployee}
          locked={locked}
          overdueUnpaid={overdueUnpaid}
        />
        <p className="vis-note">
          Předplacené = permanentka, kredit a náhrada za předplacený vstup (hodnota = poměrná cena vstupu). Jednorázově = zaplaceno na
          místě, online, převodem nebo QR platbou. Nezaplaceno zahrnuje i plánované termíny s platbou na místě – červeně je číslo jen
          tehdy, když jsou mezi nimi vstupy po termínu. Zrušené a omluvené termíny se nepočítají.
        </p>
      </Card>

      <Card as="section" padding="none" className="vis-card" aria-labelledby="vis-list-title">
        <CardHeader
          divided
          size="title"
          headingLevel={2}
          title={<span id="vis-list-title">Seznam vstupů</span>}
          meta={countLabel(listRows.length, VSTUP)}
          actions={
            !locked && selectedTherapist ? (
              <Badge tone="accent" size="md" className="vis-filterbadge">
                {therapistShort(selectedTherapist)}
                <button type="button" className="vis-filterbadge__x" aria-label={`Zrušit filtr zaměstnance ${employeeName(clinic, selectedTherapist.id)}`} onClick={() => selectEmployee(null)}>
                  <Icon name="x" size={12} />
                </button>
              </Badge>
            ) : undefined
          }
        />
        {listRows.length === 0 ? (
          <EmptyState
            compact
            icon="search"
            title="V tomto výběru nejsou žádné vstupy"
            text={
              filtersActive
                ? 'Pro zvolené filtry tu nic není. Zrušte filtry nebo vyberte jiné období.'
                : 'Ve vybraném období nejsou žádné rezervace. Vyberte jiné období nebo vytvořte rezervaci v kalendáři.'
            }
            action={
              filtersActive ? (
                <Button onClick={resetFilters}>Zrušit filtry</Button>
              ) : (
                <Button icon="calendar" onClick={() => navigate({ name: 'kalendar' })}>
                  Otevřít kalendář
                </Button>
              )
            }
          />
        ) : compact ? (
          <VisitCards clinic={clinic} rows={pageRows} showEmployee={showEmployeeColumn} onOpen={setDrawerId} />
        ) : (
          <VisitTable clinic={clinic} rows={pageRows} showEmployee={showEmployeeColumn} onOpen={setDrawerId} />
        )}
        <Pager page={safePage} pageCount={pageCount} total={listRows.length} pageSize={PAGE_SIZE} onChange={setPage} label="Stránkování vstupů" />
      </Card>

      {isStaff && (
        <Card as="section" className="vis-card" aria-labelledby="vis-pending-title">
          <CardHeader
            size="title"
            headingLevel={2}
            title={<span id="vis-pending-title">Čekající QR platby</span>}
            subtitle="Nepotvrzené výzvy k platbě QR převodem, bez ohledu na vybrané období. Potvrďte je podle variabilního symbolu na výpisu z účtu."
            meta={pending.length > 0 ? countLabel(pending.length, ['platba', 'platby', 'plateb']) : undefined}
          />
          <PendingPaymentsList limit={5} searchable />
        </Card>
      )}

      <BookingDrawer bookingId={drawerId} onClose={() => setDrawerId(null)} />
    </div>
  );
}
