import { useMemo, useState } from 'react';
import type { CreditBonusRule, Id, PackageTemplate } from '../../domain/types';
import { updateSettings, upsertPackageTemplate } from '../../engine/commands';
import { countLabel, formatDate, formatMoney, formatNumber, formatPercent, plural } from '../../engine/format';
import { clientName, getService } from '../../engine/selectors';
import { dateOf } from '../../engine/time';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { navigate } from '../../store/session';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  Icon,
  IconButton,
  Input,
  KpiTile,
  Menu,
  NumberInput,
  PageHeader,
  Segmented,
  Select,
  StackedBar,
  Table,
  Tabs,
} from '../../ui';
import {
  SOLD_STATUS_LABEL,
  bonusFor,
  byOrder,
  creditBalances,
  cx,
  discountLabel,
  packagePricing,
  soldPackageRows,
  validateBonusRules,
  validityLabel,
  type SoldRow,
} from './helpers';
import { PackageTemplateEditor, newPackageTemplate } from './PackageTemplateEditor';
import { useSyncedDraft } from './shared';
import './set-packages.css';

type Tab = 'templates' | 'sold' | 'credit';
type SoldFilter = 'active' | 'expiring' | 'ended' | 'all';

const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function PackagesScreen(): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const today = dateOf(now);
  const [tab, setTab] = useState<Tab>('templates');
  const [soldFilter, setSoldFilter] = useState<SoldFilter>('active');
  const [edit, setEdit] = useState<PackageTemplate | null>(null);

  const rows = useMemo(() => soldPackageRows(clinic, today), [clinic, today]);
  const balances = useMemo(() => creditBalances(clinic), [clinic]);

  const activeRows = rows.filter((r) => r.status === 'active' || r.status === 'expiring');
  const expiring = rows.filter((r) => r.status === 'expiring');
  const openEntries = activeRows.reduce((sum, r) => sum + r.openEntries, 0);
  const openValue = activeRows.reduce((sum, r) => sum + r.openValue, 0);
  let credit = 0;
  let creditClients = 0;
  for (const v of balances.values()) {
    if (v > 0) {
      credit += v;
      creditClients++;
    }
  }

  const templates = useMemo(() => [...clinic.packageTemplates].sort(byOrder), [clinic.packageTemplates]);

  return (
    <div className="page set-page">
      <PageHeader
        title="Permanentky a kredity"
        subtitle={`${countLabel(templates.filter((t) => t.active).length, ['permanentka', 'permanentky', 'permanentek'])} v nabídce · ${countLabel(activeRows.length, ['aktivní u klientů', 'aktivní u klientů', 'aktivních u klientů'])}`}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setEdit(newPackageTemplate(clinic))}>
            Nová permanentka
          </Button>
        }
      />

      <div className="kpi-grid set-kpis" role="group" aria-label="Souhrn permanentek a kreditů">
        <KpiTile
          icon="ticket"
          label="Aktivní permanentky"
          value={formatNumber(activeRows.length)}
          hint={
            expiring.length ? (
              <button
                type="button"
                className="link"
                onClick={() => {
                  setTab('sold');
                  setSoldFilter('expiring');
                }}
              >
                {countLabel(expiring.length, ['končí', 'končí', 'končí'])} do 30 dní
              </button>
            ) : (
              'žádná nekončí do 30 dní'
            )
          }
        />
        <KpiTile
          icon="layers"
          label="Nevyčerpané vstupy"
          value={formatNumber(openEntries)}
          hint={`v hodnotě ${formatMoney(openValue)}`}
        />
        <KpiTile icon="wallet" label="Kredity klientů" value={formatMoney(credit)} hint={`u ${countLabel(creditClients, ['klienta', 'klientů', 'klientů'])}`} />
        <KpiTile icon="receipt" label="Celkový závazek" value={formatMoney(openValue + credit)} hint="předplaceno, zatím nečerpáno" />
      </div>

      <Tabs<Tab>
        aria-label="Permanentky a kredity"
        idPrefix="set-pkg"
        bordered
        value={tab}
        onChange={setTab}
        items={[
          { id: 'templates', label: 'Nabídka', count: templates.length },
          { id: 'sold', label: 'Prodané', count: rows.length },
          { id: 'credit', label: 'Kredit a bonusy' },
        ]}
      />

      {tab === 'templates' && (
        <div role="tabpanel" id="set-pkg-panel-templates" aria-labelledby="set-pkg-tab-templates">
          <TemplateGrid templates={templates} rows={rows} onEdit={setEdit} onNew={() => setEdit(newPackageTemplate(clinic))} />
        </div>
      )}
      {tab === 'sold' && (
        <div role="tabpanel" id="set-pkg-panel-sold" aria-labelledby="set-pkg-tab-sold">
          <SoldPackages rows={rows} filter={soldFilter} onFilter={setSoldFilter} />
        </div>
      )}
      {tab === 'credit' && (
        <div role="tabpanel" id="set-pkg-panel-credit" aria-labelledby="set-pkg-tab-credit" className="split">
          <div className="split__main">
            <CreditBonusCard />
          </div>
          <div className="split__aside">
            <CreditOverview balances={balances} />
          </div>
        </div>
      )}

      {edit && <PackageTemplateEditor key={edit.id || 'new'} initial={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nabídka (šablony)                                                   */
/* ------------------------------------------------------------------ */

function TemplateGrid({
  templates,
  rows,
  onEdit,
  onNew,
}: {
  templates: PackageTemplate[];
  rows: SoldRow[];
  onEdit: (t: PackageTemplate) => void;
  onNew: () => void;
}): JSX.Element {
  const clinic = useClinic();
  const run = useCommand();
  if (!templates.length) {
    return (
      <Card>
        <EmptyState
          icon="ticket"
          title="Zatím nenabízíte žádné permanentky"
          text="Permanentka je balíček vstupů za zvýhodněnou cenu (např. 10× fyzioterapie). Klienti ji koupí na recepci nebo online."
          action={
            <Button variant="primary" icon="plus" onClick={onNew}>
              Vytvořit první permanentku
            </Button>
          }
        />
      </Card>
    );
  }
  return (
    <div className="set-pkg-grid">
      {templates.map((t) => {
        const pricing = packagePricing(clinic, t);
        const discount = discountLabel(pricing);
        const soldAll = rows.filter((r) => r.pkg.templateId === t.id);
        const soldActive = soldAll.filter((r) => r.status === 'active' || r.status === 'expiring').length;
        const names = t.serviceIds.map((id) => getService(clinic, id)?.name).filter(Boolean) as string[];
        const headingId = `set-pkg-${t.id}`;
        return (
          <Card key={t.id} as="article" className={cx('set-pkg', !t.active && 'is-inactive')} aria-labelledby={headingId}>
            <div className="set-pkg__head">
              <div className="set-pkg__titles">
                <h3 id={headingId} className="set-pkg__name">
                  {t.name}
                </h3>
                {t.description && <span className="set-pkg__desc">{t.description}</span>}
              </div>
              {t.active ? (
                <Badge tone="success" dot>
                  V nabídce
                </Badge>
              ) : (
                <Badge tone="neutral" dot="ring">
                  Neprodává se
                </Badge>
              )}
              <Menu
                label={`Akce – ${t.name}`}
                trigger={<IconButton icon="more" size="sm" label={`Další akce – ${t.name}`} />}
                items={[
                  { id: 'edit', label: 'Upravit', icon: 'edit', onSelect: () => onEdit(t) },
                  { id: 'copy', label: 'Vytvořit kopii', icon: 'copy', onSelect: () => onEdit({ ...t, id: '', name: `${t.name} (kopie)`, order: templates.length }) },
                  { type: 'separator' },
                  {
                    id: 'toggle',
                    label: t.active ? 'Stáhnout z prodeje' : 'Vrátit do prodeje',
                    icon: t.active ? 'eyeOff' : 'eye',
                    onSelect: () =>
                      run(upsertPackageTemplate, { ...t, active: !t.active }, {
                        success: t.active ? `„${t.name}" se už neprodává` : `„${t.name}" je zpět v nabídce`,
                      }),
                  },
                ]}
              />
            </div>
            <div className="set-pkg__price">
              <span className="set-pkg__amount tnum">{formatMoney(t.priceCzk)}</span>
              <span className="set-pkg__per tnum">
                {countLabel(t.entries, ['vstup', 'vstupy', 'vstupů'])} · {formatMoney(pricing.perEntry)} / vstup
              </span>
            </div>
            <div className="set-pkg__discount">
              {discount && (
                <Badge tone={discount.tone} size="md">
                  {discount.text}
                </Badge>
              )}
              {pricing.singleMin !== null && (
                <span className="muted tnum">
                  jednotlivě{' '}
                  {pricing.singleMin === pricing.singleMax
                    ? formatMoney(pricing.singleMin)
                    : `${formatMoney(pricing.singleMin)}–${formatMoney(pricing.singleMax ?? 0)}`}
                  {pricing.savingsMax !== null && pricing.savingsMax > 0
                    ? ` · ušetří ${pricing.singleMin !== pricing.singleMax ? 'až ' : ''}${formatMoney(pricing.savingsMax)}`
                    : ''}
                </span>
              )}
            </div>
            <dl className="dl dl--plain set-pkg__dl">
              <div className="dl__row">
                <dt className="dl__term">Platí na</dt>
                <dd className="dl__detail">{names.length ? names.join(', ') : <span className="set-warn-text">žádnou službu</span>}</dd>
              </div>
              <div className="dl__row">
                <dt className="dl__term">Platnost</dt>
                <dd className="dl__detail">{validityLabel(t.validityDays)}</dd>
              </div>
              <div className="dl__row">
                <dt className="dl__term">Omluvenky</dt>
                <dd className="dl__detail">{t.excusesAllowed ? countLabel(t.excusesAllowed, ['omluvenka', 'omluvenky', 'omluvenek']) : 'bez omluvenek'}</dd>
              </div>
              <div className="dl__row">
                <dt className="dl__term">Prodáno</dt>
                <dd className="dl__detail tnum">
                  {soldAll.length}× · {soldActive} {plural(soldActive, ['aktivní', 'aktivní', 'aktivních'])}
                </dd>
              </div>
            </dl>
            <div className="set-pkg__foot">
              <Button size="sm" variant="secondary" icon="edit" onClick={() => onEdit(t)} aria-label={`Upravit permanentku ${t.name}`}>
                Upravit
              </Button>
            </div>
          </Card>
        );
      })}
      <button type="button" className="set-pkg-add" onClick={onNew}>
        <Icon name="plus" size={20} />
        <span>Nová permanentka</span>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Prodané permanentky                                                 */
/* ------------------------------------------------------------------ */

const PAGE = 50;

function SoldPackages({ rows, filter, onFilter }: { rows: SoldRow[]; filter: SoldFilter; onFilter: (f: SoldFilter) => void }): JSX.Element {
  const clinic = useClinic();
  const [query, setQuery] = useState('');
  const [template, setTemplate] = useState('all');
  const [limit, setLimit] = useState(PAGE);

  const counts = {
    active: rows.filter((r) => r.status === 'active' || r.status === 'expiring').length,
    expiring: rows.filter((r) => r.status === 'expiring').length,
    ended: rows.filter((r) => r.status === 'usedUp' || r.status === 'expired' || r.status === 'cancelled').length,
    all: rows.length,
  };

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    const list = rows.filter((r) => {
      if (filter === 'active' && !(r.status === 'active' || r.status === 'expiring')) return false;
      if (filter === 'expiring' && r.status !== 'expiring') return false;
      if (filter === 'ended' && !(r.status === 'usedUp' || r.status === 'expired' || r.status === 'cancelled')) return false;
      if (template !== 'all' && r.pkg.templateId !== template) return false;
      if (q && !(r.client && norm(`${r.client.firstName} ${r.client.lastName} ${r.client.email}`).includes(q))) return false;
      return true;
    });
    if (filter === 'expiring' || filter === 'active') list.sort((a, b) => (a.usage.validUntil < b.usage.validUntil ? -1 : 1));
    else list.sort((a, b) => (a.pkg.purchasedAt < b.pkg.purchasedAt ? 1 : -1));
    return list;
  }, [rows, filter, template, query]);

  const expiringEntries = rows.filter((r) => r.status === 'expiring').reduce((s, r) => s + r.usage.free, 0);
  const expiringValue = rows.filter((r) => r.status === 'expiring').reduce((s, r) => s + r.usage.free * r.usage.unitValue, 0);
  const shown = filtered.slice(0, limit);

  return (
    <div className="set-stack">
      <div className="set-toolbar">
        <Segmented<SoldFilter>
          aria-label="Stav permanentek"
          size="lg"
          value={filter}
          onChange={(f) => {
            onFilter(f);
            setLimit(PAGE);
          }}
          options={[
            { value: 'active', label: `Aktivní (${counts.active})` },
            { value: 'expiring', label: `Končí do 30 dní (${counts.expiring})` },
            { value: 'ended', label: `Ukončené (${counts.ended})` },
            { value: 'all', label: `Vše (${counts.all})` },
          ]}
          className="set-toolbar__seg"
        />
        <span className="spacer" />
        <Input
          size="sm"
          type="search"
          prefixIcon="search"
          placeholder="Hledat klienta"
          aria-label="Hledat klienta"
          value={query}
          onValueChange={(v) => {
            setQuery(v);
            setLimit(PAGE);
          }}
          className="set-toolbar__search"
        />
        <Select
          size="sm"
          inline
          prefix="Typ:"
          aria-label="Typ permanentky"
          value={template}
          onValueChange={setTemplate}
          options={[
            { value: 'all', label: 'Všechny' },
            ...[...clinic.packageTemplates].sort(byOrder).map((t) => ({ value: t.id, label: t.name })),
          ]}
        />
      </div>

      {filter === 'expiring' && counts.expiring > 0 && (
        <Callout
          tone="warning"
          title="Vstupy, které mohou propadnout"
          actions={
            <Button size="sm" variant="secondary" icon="mail" onClick={() => navigate({ name: 'komunikace' })}>
              Upravit připomínku „Permanentka brzy končí"
            </Button>
          }
        >
          {countLabel(counts.expiring, ['permanentce', 'permanentkám', 'permanentkám'])} končí do 30 dní platnost a zbývá na nich{' '}
          <strong>{countLabel(expiringEntries, ['volný vstup', 'volné vstupy', 'volných vstupů'])}</strong> v hodnotě{' '}
          <strong>{formatMoney(expiringValue)}</strong>. Připomeňte klientům, ať si termíny zarezervují – nebo platnost v detailu klienta prodlužte.
        </Callout>
      )}

      <Card padding="none">
        {filtered.length === 0 ? (
          <EmptyState
            compact
            icon="ticket"
            title={
              query.trim() || template !== 'all'
                ? 'Žádná permanentka neodpovídá filtru'
                : filter === 'expiring'
                  ? 'Žádná permanentka nekončí do 30 dní'
                  : filter === 'ended'
                    ? 'Zatím žádné ukončené permanentky'
                    : 'Zatím žádné prodané permanentky'
            }
            text={
              rows.length === 0
                ? 'Permanentku prodáte v detailu klienta (Prodat permanentku), klienti ji mohou koupit i online.'
                : undefined
            }
            action={
              rows.length === 0 ? (
                <Button size="sm" variant="secondary" icon="users" onClick={() => navigate({ name: 'klienti' })}>
                  Otevřít klienty
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table hover caption="Prodané permanentky" className="set-sold-table" minWidth={760}>
            <thead>
              <tr>
                <th scope="col">Klient</th>
                <th scope="col">Permanentka</th>
                <th scope="col">Čerpání</th>
                <th scope="col">Platnost do</th>
                <th scope="col" className="num">
                  Zbývá
                </th>
                <th scope="col">Zakoupeno</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <SoldRowView key={r.pkg.id} row={r} />
              ))}
            </tbody>
          </Table>
        )}
        {filtered.length > shown.length && (
          <div className="card__footer set-more">
            <span className="muted">
              Zobrazeno {shown.length} z {filtered.length}
            </span>
            <Button size="sm" variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
              Zobrazit dalších {Math.min(PAGE, filtered.length - shown.length)}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function SoldRowView({ row: r }: { row: SoldRow }): JSX.Element {
  const u = r.usage;
  const statusTone = r.status === 'expiring' ? 'warning' : r.status === 'active' ? 'success' : 'neutral';
  const segments = [
    { value: u.used, tone: 'neutral' as const, label: 'využité' },
    { value: u.forfeited, tone: 'danger' as const, label: 'propadlé' },
    { value: u.reserved, tone: 'accent-hatched' as const, label: 'rezervované' },
    { value: u.free, tone: r.status === 'expired' || r.status === 'cancelled' ? ('empty' as const) : ('accent' as const), label: 'volné' },
  ];
  return (
    <tr className={cx(r.status !== 'active' && r.status !== 'expiring' && 'is-ended')}>
      <td>
        {r.client ? (
          <button type="button" className="set-rowlink" onClick={() => navigate({ name: 'klient', clientId: r.client?.id as Id })}>
            {clientName(r.client)}
          </button>
        ) : (
          <span className="muted">Smazaný klient</span>
        )}
      </td>
      <td>
        <span className="set-sold-name">
          {r.pkg.name}
          {r.status !== 'active' && (
            <Badge size="sm" tone={statusTone}>
              {SOLD_STATUS_LABEL[r.status]}
            </Badge>
          )}
        </span>
      </td>
      <td className="set-sold-usage">
        <span className="set-sold-usage__bar">
          <StackedBar
            size="sm"
            cells={u.total <= 20}
            legend={false}
            segments={segments}
            label={`${u.used} využité, ${u.forfeited} propadlé, ${u.reserved} rezervované, ${u.free} volné z ${u.total}`}
          />
        </span>
        <span className="set-sold-usage__text tnum">
          {u.used + u.forfeited}/{u.total}
        </span>
      </td>
      <td className="nowrap">
        <span className="tnum">{formatDate(u.validUntil)}</span>
        <span className={cx('set-sub', r.status === 'expiring' && 'text-warning')}>
          {r.status === 'cancelled'
            ? 'zrušená'
            : r.daysLeft < 0
              ? 'prošlá'
              : r.daysLeft === 0
                ? 'končí dnes'
                : `ještě ${countLabel(r.daysLeft, ['den', 'dny', 'dní'])}`}
          {r.pkg.extendedDays ? ` · prodlouženo o ${countLabel(r.pkg.extendedDays, ['den', 'dny', 'dní'])}` : ''}
        </span>
      </td>
      <td className="num">
        {r.openEntries ? (
          <>
            <span className="tnum">{countLabel(r.openEntries, ['vstup', 'vstupy', 'vstupů'])}</span>
            <span className="set-sub tnum">{formatMoney(r.openValue)}</span>
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td className="nowrap">
        <span className="tnum">{formatDate(r.pkg.purchasedAt)}</span>
        <span className="set-sub tnum">{formatMoney(r.pkg.priceCzk)}</span>
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/* Bonusy za dobití kreditu                                            */
/* ------------------------------------------------------------------ */

function CreditBonusCard(): JSX.Element {
  const clinic = useClinic();
  const run = useCommand();
  const { draft: rules, setDraft: setRules, reset, dirty } = useSyncedDraft<CreditBonusRule[]>(clinic.settings.creditBonus);
  const [example, setExample] = useState(5000);
  const issues = validateBonusRules(rules);
  const hasError = issues.some((i) => i.error);
  const ex = bonusFor(rules, example);

  const update = (i: number, patch: Partial<CreditBonusRule>): void => setRules((cur) => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = (): void =>
    setRules((cur) => {
      const maxTop = cur.reduce((m, r) => Math.max(m, r.minTopup), 0);
      const maxPct = cur.reduce((m, r) => Math.max(m, r.pct), 0);
      return [...cur, { minTopup: maxTop ? maxTop + 2000 : 2000, pct: Math.min(50, maxPct + 5 || 5) }];
    });
  const save = (): void => {
    if (hasError) return;
    const sorted = [...rules].sort((a, b) => a.minTopup - b.minTopup).map((r) => ({ minTopup: Math.round(r.minTopup), pct: r.pct }));
    const r = run(updateSettings, { creditBonus: sorted }, { success: 'Bonusy za dobití uloženy' });
    if (r.ok) setRules(sorted);
  };

  return (
    <Card as="section" aria-label="Bonusy za dobití kreditu">
      <CardHeader size="title" title="Bonusy za dobití kreditu" subtitle="Motivace dobít víc: klient dostane procento z dobité částky navíc. Platí nejvyšší bonus, na který dosáhne." />
      {rules.length === 0 ? (
        <EmptyState
          compact
          icon="gift"
          title="Bez bonusů"
          text="Kredit se připisuje 1 : 1. Přidejte např. 5 % při dobití od 3 000 Kč."
          action={
            <Button size="sm" variant="secondary" icon="plus" onClick={add}>
              Přidat bonus
            </Button>
          }
        />
      ) : (
        <ol className="set-bonus-list">
          {rules.map((r, i) => {
            const issue = issues[i];
            return (
              <li key={i} className={cx('set-bonus', issue.error && 'has-error')}>
                <span className="set-bonus__text">Při dobití od</span>
                <NumberInput
                  size="sm"
                  className="set-bonus__amount"
                  value={r.minTopup}
                  min={0}
                  max={100000}
                  step={500}
                  suffix="Kč"
                  aria-label={`Bonus ${i + 1}: minimální dobití`}
                  invalid={!!issue.error && (r.minTopup < 100 || r.minTopup > 100000 || rules.some((o, j) => j !== i && o.minTopup === r.minTopup))}
                  onChange={(v) => update(i, { minTopup: v })}
                />
                <span className="set-bonus__text">bonus</span>
                <NumberInput
                  size="sm"
                  className="set-bonus__pct"
                  value={r.pct}
                  min={0}
                  max={100}
                  step={1}
                  suffix="%"
                  aria-label={`Bonus ${i + 1}: procento`}
                  invalid={!!issue.error && (r.pct < 1 || r.pct > 50)}
                  onChange={(v) => update(i, { pct: v })}
                />
                <span className="set-bonus__result tnum">= +{formatMoney(Math.round((r.minTopup * r.pct) / 100))}</span>
                <IconButton icon="trash" size="sm" label={`Odebrat bonus ${i + 1}`} onClick={() => setRules((cur) => cur.filter((_, j) => j !== i))} />
                {(issue.error || issue.warning) && (
                  <span className={cx('set-bonus__msg', issue.error ? 'field__error' : 'set-warn-text')} role={issue.error ? 'alert' : undefined}>
                    <Icon name={issue.error ? 'alertCircle' : 'alert'} size={14} />
                    {issue.error ?? issue.warning}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {rules.length > 0 && (
        <div>
          <Button size="sm" variant="ghost" icon="plus" onClick={add} disabled={rules.length >= 6}>
            Přidat další stupeň
          </Button>
        </div>
      )}

      <div className="set-bonus-try">
        <label className="set-bonus-try__label" htmlFor="set-bonus-example">
          Vyzkoušejte: klient dobije
        </label>
        <NumberInput id="set-bonus-example" size="sm" value={example} min={100} max={100000} step={500} suffix="Kč" onChange={setExample} className="set-bonus__amount" />
        <span className="set-bonus-try__result" aria-live="polite">
          {ex.bonus > 0 ? (
            <>
              → bonus <strong>{formatMoney(ex.bonus)}</strong> ({formatPercent(ex.pct)}), na kredit připíšeme <strong>{formatMoney(example + ex.bonus)}</strong>
            </>
          ) : (
            <>→ bez bonusu, připíšeme {formatMoney(example)}</>
          )}
        </span>
      </div>

      <div className="set-savebar set-savebar--inline">
        <span className="set-savebar__status">
          {dirty ? (
            <>
              <Icon name="edit" size={14} /> Neuložené změny
            </>
          ) : (
            <>
              <Icon name="checkCircle" size={14} /> Uloženo
            </>
          )}
        </span>
        <span className="spacer" />
        {dirty && (
          <Button size="sm" variant="ghost" onClick={reset}>
            Zahodit
          </Button>
        )}
        <Button size="sm" variant="primary" onClick={save} disabled={!dirty || hasError}>
          Uložit bonusy
        </Button>
      </div>
    </Card>
  );
}

function CreditOverview({ balances }: { balances: Map<Id, number> }): JSX.Element {
  const clinic = useClinic();
  const top = [...balances.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id, v]) => ({ client: clinic.clients.find((c) => c.id === id), balance: v }));
  return (
    <Card as="section" aria-label="Nejvyšší zůstatky kreditu">
      <CardHeader title="Nejvyšší zůstatky kreditu" />
      {top.length === 0 ? (
        <EmptyState compact icon="wallet" title="Žádný klient nemá kredit" text="Kredit dobijete v detailu klienta (Dobít kredit)." />
      ) : (
        <ul className="set-credit-list">
          {top.map(({ client, balance }) => (
            <li key={client?.id ?? balance}>
              {client ? (
                <button type="button" className="set-rowlink" onClick={() => navigate({ name: 'klient', clientId: client.id })}>
                  {clientName(client)}
                </button>
              ) : (
                <span className="muted">Neznámý klient</span>
              )}
              <span className="tnum set-strong">{formatMoney(balance)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="set-footnote">
        <Icon name="info" size={14} /> Kredit je předplacená částka klienta. Bonusy se připisují jako samostatný pohyb „Bonus za dobití".
      </p>
    </Card>
  );
}
