import { useId, useMemo, type ReactNode } from 'react';
import type { Id, Tone } from '../../domain/types';
import { CONVERSION_FROM_STAGE, CONVERSION_TO_STAGE, getStage, pipelineStats } from '../../engine/crm';
import { DEFAULT_STAGES } from '../../engine/defaults';
import { countLabel, formatNumber, plural, prepZ } from '../../engine/format';
import { dateOf } from '../../engine/time';
import { ToneDot } from '../../components/domain';
import { useClinic, useNow } from '../../store/hooks';
import { EmptyState, Icon, KpiTile, Table } from '../../ui';
import { BarList, ChartCard, type BarRow } from './charts';
import { changeDelta, daysText, pct, type DateRange } from './model';
import './stats.css';

/**
 * Statistiky – sekce „Klienti a fáze“ (docs/CRM.md): počty klientů po fázích spolupráce (stav k dnešku),
 * změny fáze, konverze Freetalk → Aktivní spolupráce a průměrná doba ve fázi za vybrané období.
 * Filtr terapeuta a kategorie se na fáze nevztahuje (fáze patří klientovi, ne termínu).
 */

export interface StagesSectionProps {
  /** Vybrané období [from, to) – stejné jako zbytek statistik. */
  range: DateRange;
  /** Srovnávací období (null = srovnání vypnuté nebo před prvními daty). */
  compare: DateRange | null;
  rangeText: string;
  /** Krátký dovětek srovnání do dlaždic („vs. září“). */
  compareShort: string;
  /** Je zapnutý filtr terapeuta nebo kategorie (na fáze se nevztahuje – řekneme to). */
  filtered: boolean;
}

/** Kolik nejčastějších přechodů ukázat v grafu (všechny jsou v tabulce). */
const TOP_TRANSITIONS = 8;

const toneClass = (tone: Tone): string => `st-c-tone-${tone}`;
const clientsText = (n: number): string => countLabel(n, ['klient', 'klienti', 'klientů']);
const transitionsText = (n: number): string => countLabel(n, ['změna fáze', 'změny fáze', 'změn fáze']);
const NA = '—';

export function StagesSection({ range, compare, rangeText, compareShort, filtered }: StagesSectionProps): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const today = dateOf(now);
  const headingId = useId();

  // drahý výpočet: jen při změně dat, období nebo dne (stejně jako ostatní statistiky)
  const pipe = useMemo(() => pipelineStats(clinic, now, range.from, range.to), [clinic, range.from, range.to, today]);
  const prev = useMemo(
    () => (compare ? pipelineStats(clinic, now, compare.from, compare.to) : null),
    [clinic, compare?.from, compare?.to, today],
  );

  const nameOf = (id: Id): string => getStage(clinic, id)?.name ?? 'Smazaná fáze';
  const toneOf = (id: Id): Tone => getStage(clinic, id)?.tone ?? 'slate';

  /* ------------------------------ KPI ------------------------------ */
  const newDelta = prev ? changeDelta(pipe.newClients, prev.newClients, true) : null;
  const top = pipe.transitions[0];
  const conv = pipe.conversion;
  const convPrev = prev?.conversion ?? null;
  const fromName = conv ? nameOf(conv.fromStageId) : '';
  const toName = conv ? nameOf(conv.toStageId) : '';
  const closedCount = pipe.total - pipe.open;
  // fáze konverze někdo smazal v Nastavení – jméno vezmeme z výchozích fází
  const missingStages = [CONVERSION_FROM_STAGE, CONVERSION_TO_STAGE]
    .filter((id) => !getStage(clinic, id))
    .map((id) => DEFAULT_STAGES.find((st) => st.id === id)?.name ?? id);
  const missingConversionText = `v nastavení chybí fáze ${missingStages.join(' a ')}`;

  // Srovnání změn fáze a konverze jen jako neutrální údaj („73 % za září“): starší období mělo na konverzi
  // víc času, barevná šipka „zhoršení“ by proto klamala. compareShort má tvar „vs. září“ (model.ts).
  const compareName = compareShort.replace(/^vs\.\s*/, '');
  const neutralHint = (text: string | null): ReactNode => (prev && text !== null ? `${text} za ${compareName}` : undefined);

  const kpis = (
    <div className="st-kpis">
      <KpiTile
        label="Noví zájemci"
        value={formatNumber(pipe.newClients)}
        delta={newDelta ?? undefined}
        hint={prev ? (newDelta ? compareShort : `beze změny ${compareShort}`) : undefined}
      >
        <span className="st-kpi-extra">klienti založení v období</span>
      </KpiTile>
      <KpiTile
        label="Změny fáze"
        value={formatNumber(pipe.transitionsTotal)}
        hint={neutralHint(prev ? formatNumber(prev.transitionsTotal) : null)}
      >
        <span className="st-kpi-extra">
          {top ? (
            <>
              nejčastěji {nameOf(top.fromStageId)} → {nameOf(top.toStageId)}
            </>
          ) : (
            'v období se nikdo nepřesunul'
          )}
        </span>
      </KpiTile>
      <KpiTile
        label="Konverze"
        value={conv && conv.rate !== null ? pct(conv.rate) : NA}
        hint={neutralHint(convPrev && convPrev.rate !== null ? pct(convPrev.rate) : null)}
      >
        <span className="st-kpi-extra">
          {!conv ? (
            missingConversionText
          ) : conv.entered > 0 ? (
            <>
              {fromName} → {toName} · <strong>{formatNumber(conv.converted)}</strong> {prepZ(conv.entered)} {formatNumber(conv.entered)}
            </>
          ) : (
            `do fáze ${fromName} v období nikdo nevstoupil`
          )}
        </span>
      </KpiTile>
      <KpiTile label="Klienti v pipeline" value={formatNumber(pipe.open)} hint="stav k dnešku">
        <span className="st-kpi-extra">
          celkem <strong>{formatNumber(pipe.total)}</strong>
          {closedCount > 0 && (
            <>
              {' · '}ukončená spolupráce <strong>{formatNumber(closedCount)}</strong>
            </>
          )}
        </span>
      </KpiTile>
    </div>
  );

  /* ------------------------- Klienti podle fáze ------------------------- */
  const countMax = pipe.stages.reduce((m, x) => Math.max(m, x.count), 0);
  const share = (n: number): number => (pipe.total > 0 ? n / pipe.total : 0);
  const entriesText = (n: number): string => countLabel(n, ['vstup', 'vstupy', 'vstupů']);
  const exitsText = (n: number): string => countLabel(n, ['odchod', 'odchody', 'odchodů']);

  const countCard = (
    <ChartCard
      headingLevel={3}
      title="Klienti podle fáze"
      subtitle="Stav k dnešnímu dni"
      meta={
        <>
          celkem <strong className="st-strong">{formatNumber(pipe.total)}</strong>
        </>
      }
      table={
        pipe.total > 0
          ? () => (
              <Table density="compact" minWidth={480} caption={`Klienti podle fáze spolupráce, vstupy a odchody za ${rangeText}`}>
                <thead>
                  <tr>
                    <th>Fáze</th>
                    <th className="num">Klienti teď</th>
                    <th className="num">Podíl</th>
                    <th className="num">Vstupy v období</th>
                    <th className="num">Odchody v období</th>
                  </tr>
                </thead>
                <tbody>
                  {pipe.stages.map((x) => (
                    <tr key={x.stage.id}>
                      <td>{x.stage.name}</td>
                      <td className="num">{formatNumber(x.count)}</td>
                      <td className="num">{pct(share(x.count))}</td>
                      <td className="num">{formatNumber(x.entered)}</td>
                      <td className="num">{formatNumber(x.left)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Celkem</td>
                    <td className="num">{formatNumber(pipe.total)}</td>
                    <td className="num">{pipe.total > 0 ? pct(1) : NA}</td>
                    <td className="num">{formatNumber(pipe.stages.reduce((s, x) => s + x.entered, 0))}</td>
                    <td className="num">{formatNumber(pipe.stages.reduce((s, x) => s + x.left, 0))}</td>
                  </tr>
                </tfoot>
              </Table>
            )
          : undefined
      }
    >
      {pipe.total === 0 || pipe.stages.length === 0 ? (
        <EmptyState
          compact
          icon="users"
          title="Zatím žádní klienti"
          text="Jakmile v Klientech založíte prvního klienta, uvidíte tu, kolik klientů je v které fázi spolupráce."
        />
      ) : (
        <BarList
          label="Klienti podle fáze spolupráce"
          max={countMax}
          columns="minmax(96px, 168px) minmax(36px, 1fr) minmax(48px, auto) 44px"
          headers={['Klienti', 'Podíl']}
          rows={pipe.stages.map(
            (x): BarRow => ({
              key: x.stage.id,
              label: (
                <>
                  <ToneDot tone={x.stage.tone} />
                  <span className="st-ellipsis">{x.stage.name}</span>
                </>
              ),
              value: x.count,
              colorClass: toneClass(x.stage.tone),
              muted: x.count === 0,
              cells: [<strong key="c">{formatNumber(x.count)}</strong>, pct(share(x.count))],
              ariaLabel:
                `${x.stage.name}: ${clientsText(x.count)}, ${pct(share(x.count))} všech klientů; ` +
                `v období ${entriesText(x.entered)} a ${exitsText(x.left)}`,
              tipTitle: x.stage.name,
              tipRows: [
                {
                  key: 'c',
                  value: formatNumber(x.count),
                  label: plural(x.count, ['klient teď', 'klienti teď', 'klientů teď']),
                  colorClass: toneClass(x.stage.tone),
                  mark: 'rect',
                },
                { key: 's', value: pct(share(x.count), 1), label: 'všech klientů' },
                { key: 'e', value: formatNumber(x.entered), label: plural(x.entered, ['vstup v období', 'vstupy v období', 'vstupů v období']) },
                { key: 'l', value: formatNumber(x.left), label: plural(x.left, ['odchod v období', 'odchody v období', 'odchodů v období']) },
              ],
            }),
          )}
        />
      )}
    </ChartCard>
  );

  /* ------------------------- Přechody mezi fázemi ------------------------- */
  const shownTransitions = pipe.transitions.slice(0, TOP_TRANSITIONS);
  const transitionsMax = shownTransitions.reduce((m, t) => Math.max(m, t.count), 0);
  const trShare = (n: number): number => (pipe.transitionsTotal > 0 ? n / pipe.transitionsTotal : 0);
  const hidden = pipe.transitions.length - shownTransitions.length;

  const transitionsCard = (
    <ChartCard
      headingLevel={3}
      title="Přechody mezi fázemi"
      subtitle="Změny fáze v období"
      meta={
        <>
          celkem <strong className="st-strong">{formatNumber(pipe.transitionsTotal)}</strong>
        </>
      }
      table={
        pipe.transitions.length > 0
          ? () => (
              <Table density="compact" minWidth={420} maxHeight={420} caption={`Přechody mezi fázemi za ${rangeText}`}>
                <thead>
                  <tr>
                    <th>Z fáze</th>
                    <th>Do fáze</th>
                    <th className="num">Počet</th>
                    <th className="num">Podíl</th>
                  </tr>
                </thead>
                <tbody>
                  {pipe.transitions.map((t) => (
                    <tr key={`${t.fromStageId}>${t.toStageId}`}>
                      <td>{nameOf(t.fromStageId)}</td>
                      <td>{nameOf(t.toStageId)}</td>
                      <td className="num">{formatNumber(t.count)}</td>
                      <td className="num">{pct(trShare(t.count))}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )
          : undefined
      }
      footer={
        hidden > 0 ? (
          <p className="st-footnote">
            Zobrazeno {formatNumber(shownTransitions.length)} nejčastějších {prepZ(pipe.transitions.length)}{' '}
            {formatNumber(pipe.transitions.length)}. Všechny přechody najdete v tabulce.
          </p>
        ) : null
      }
    >
      {shownTransitions.length === 0 ? (
        <EmptyState
          compact
          icon="repeat"
          title="Žádné změny fáze v období"
          text="Když klienta přesunete do jiné fáze, třeba v kartě klienta nebo v Pipeline, objeví se tu."
        />
      ) : (
        <BarList
          label="Nejčastější přechody mezi fázemi"
          max={transitionsMax}
          columns="minmax(132px, 260px) minmax(36px, 1fr) minmax(32px, auto)"
          rows={shownTransitions.map((t): BarRow => {
            const from = nameOf(t.fromStageId);
            const to = nameOf(t.toStageId);
            return {
              key: `${t.fromStageId}>${t.toStageId}`,
              label: (
                <>
                  <span className="st-ellipsis st-trans__stage">{from}</span>
                  <Icon name="arrowRight" size={12} className="st-trans__arrow" />
                  <span className="st-ellipsis st-trans__stage">{to}</span>
                </>
              ),
              value: t.count,
              colorClass: toneClass(toneOf(t.toStageId)),
              cells: [<strong key="c">{formatNumber(t.count)}</strong>],
              ariaLabel: `Z fáze ${from} do fáze ${to}: ${transitionsText(t.count)}, ${pct(trShare(t.count))} všech změn v období`,
              tipTitle: `${from} → ${to}`,
              tipRows: [
                {
                  key: 'c',
                  value: formatNumber(t.count),
                  label: plural(t.count, ['změna fáze', 'změny fáze', 'změn fáze']),
                  colorClass: toneClass(toneOf(t.toStageId)),
                  mark: 'rect',
                },
                { key: 's', value: pct(trShare(t.count), 1), label: 'všech změn v období' },
              ],
            };
          })}
        />
      )}
    </ChartCard>
  );

  /* ------------------------- Průměrná doba ve fázi ------------------------- */
  // ukončená fáze (Konec spolupráce) není etapa práce s klientem – doba v ní nic neříká
  const timed = pipe.stages.filter((x) => !x.stage.closed);
  const avgMax = timed.reduce((m, x) => Math.max(m, x.avgDays ?? 0), 0);
  const noExits = timed.every((x) => x.avgDays === null);

  const timeCard = (
    <ChartCard
      headingLevel={3}
      title="Průměrná doba ve fázi"
      subtitle="Do odchodu: klienti, kteří fázi v období opustili. Zatím: klienti, kteří v ní jsou teď."
      table={
        timed.length > 0 && pipe.total > 0
          ? () => (
              <Table density="compact" minWidth={520} caption={`Průměrná doba ve fázi spolupráce za ${rangeText}`}>
                <thead>
                  <tr>
                    <th>Fáze</th>
                    <th className="num">Odchody v období</th>
                    <th className="num">Průměrně do odchodu</th>
                    <th className="num">Klienti teď</th>
                    <th className="num">Průměrně zatím</th>
                  </tr>
                </thead>
                <tbody>
                  {timed.map((x) => (
                    <tr key={x.stage.id}>
                      <td>{x.stage.name}</td>
                      <td className="num">{formatNumber(x.avgDaysSamples)}</td>
                      <td className="num">{x.avgDays === null ? NA : daysText(x.avgDays)}</td>
                      <td className="num">{formatNumber(x.count)}</td>
                      <td className="num">{x.currentAvgDays === null ? NA : daysText(x.currentAvgDays)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )
          : undefined
      }
      footer={noExits && timed.length > 0 && pipe.total > 0 ? <p className="st-footnote">V období žádný klient fázi neopustil.</p> : null}
    >
      {timed.length === 0 || pipe.total === 0 ? (
        <EmptyState
          compact
          icon="hourglass"
          title="Zatím bez dat"
          text="Doba ve fázi se začne počítat, jakmile budou klienti procházet fázemi spolupráce."
        />
      ) : (
        <BarList
          label="Průměrná doba ve fázi"
          max={avgMax}
          columns="minmax(96px, 168px) minmax(36px, 1fr) minmax(72px, auto) minmax(56px, auto)"
          headers={['Do odchodu', 'Zatím']}
          rows={timed.map((x): BarRow => {
            const avg = x.avgDays;
            const cur = x.currentAvgDays;
            return {
              key: x.stage.id,
              label: (
                <>
                  <ToneDot tone={x.stage.tone} />
                  <span className="st-ellipsis">{x.stage.name}</span>
                </>
              ),
              value: avg ?? 0,
              colorClass: toneClass(x.stage.tone),
              muted: avg === null,
              cells: [avg === null ? NA : <strong key="a">{daysText(avg)}</strong>, cur === null ? NA : daysText(cur)],
              ariaLabel:
                `${x.stage.name}: ` +
                (avg === null
                  ? 'v období fázi nikdo neopustil'
                  : `průměrně ${daysText(avg)} do odchodu (${exitsText(x.avgDaysSamples)} v období)`) +
                (cur === null ? '; teď ve fázi nikdo není' : `; ${clientsText(x.count)} teď, ve fázi průměrně ${daysText(cur)}`),
              tipTitle: x.stage.name,
              tipRows: [
                {
                  key: 'a',
                  value: avg === null ? NA : daysText(avg),
                  label: `do odchodu (${exitsText(x.avgDaysSamples)})`,
                  colorClass: toneClass(x.stage.tone),
                  mark: 'rect',
                },
                { key: 'c', value: cur === null ? NA : daysText(cur), label: `zatím (${clientsText(x.count)} teď)` },
              ],
            };
          })}
        />
      )}
    </ChartCard>
  );

  return (
    <section className="st-section" aria-labelledby={headingId}>
      <div className="st-section__head">
        <h2 id={headingId} className="st-section__title">
          Klienti a fáze
        </h2>
        <p className="st-section__sub">
          Fáze spolupráce za {rangeText}
          {filtered && <span className="st-sub-muted"> · filtr terapeuta a kategorie se na fáze nevztahuje</span>}
        </p>
      </div>
      {kpis}
      <div className="st-row st-row--stages">
        {countCard}
        {transitionsCard}
        {timeCard}
      </div>
      {conv && (
        <p className="st-footnote">
          Konverze: kolik klientů, kteří v období vstoupili do fáze {fromName}, se do dneška dostalo do fáze {toName}. U nedávných
          období bývá nižší, protože klienti ještě nestihli projít dalšími fázemi.
        </p>
      )}
    </section>
  );
}
