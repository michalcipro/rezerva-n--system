import { useId, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import type { ClinicState, LocalDateTime } from '../../domain/types';
import { countLabel, formatDate, formatMoney, formatNumber, plural } from '../../engine/format';
import {
  IMPORT_COLUMNS,
  IMPORT_TEMPLATE_FILENAME,
  checkClientRows,
  checkCreditRows,
  checkPackageRows,
  importClients,
  importCredits,
  importPackages,
  importTemplateCsv,
  parseCsv,
  readImportFile,
  summarizeChecks,
  toCsv,
  type ClientImportRow,
  type ClientRowCheck,
  type CreditImportRow,
  type CreditRowCheck,
  type CsvDelimiter,
  type ImportFile,
  type ImportKind,
  type ImportResult,
  type PackageImportRow,
  type PackageRowCheck,
  type RowAction,
  type RowIssue,
} from '../../engine/importer';
import { downloadFile, downloadNotice } from '../../app/download';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { Badge, Button, Callout, ChoiceChips, ConfirmDialog, Icon, RadioCards, Table, Textarea, toast, cx, type BadgeTone } from '../../ui';
import { ENCODING_LABEL, ImportFileError, readCsvFile, type CsvEncoding } from './importFile';
import './set-import.css';

/* ------------------------------------------------------------------ */
/* Kroky                                                               */
/* ------------------------------------------------------------------ */

const KINDS: readonly ImportKind[] = ['clients', 'packages', 'credits'];

const STEP: Record<ImportKind, { title: string; sub: string; intro: string; noun: [string, string, string] }> = {
  clients: {
    title: 'Klienti',
    sub: 'kontakty a souhlasy',
    intro: 'Jméno a příjmení, e-mail nebo telefon; nepovinně datum narození, souhlasy, štítky a poznámka.',
    noun: ['klienta', 'klienty', 'klientů'],
  },
  packages: {
    title: 'Permanentky',
    sub: 'zbývající vstupy',
    intro: 'Aktivní permanentky klientů, kteří už jsou v systému: název permanentky, kolik vstupů zbývá a do kdy platí.',
    noun: ['permanentku', 'permanentky', 'permanentek'],
  },
  credits: {
    title: 'Kredity',
    sub: 'zůstatky kreditu',
    intro: 'Zůstatky kreditu klientů, kteří už jsou v systému.',
    noun: ['kredit', 'kredity', 'kreditů'],
  },
};

const DELIMITER_LABEL: Record<CsvDelimiter, string> = { ';': 'středník', ',': 'čárka', '\t': 'tabulátor' };

interface Source {
  name: string;
  text: string;
  /** null = vložený text */
  encoding: CsvEncoding | null;
}

interface StepState {
  source: Source | null;
  result: ImportResult | null;
  onDuplicate: 'skip' | 'update';
}

const EMPTY_STEP: StepState = { source: null, result: null, onDuplicate: 'skip' };

type AnyCheck = ClientRowCheck | PackageRowCheck | CreditRowCheck;

function checkRows(kind: ImportKind, file: ImportFile<ImportKind>, clinic: ClinicState, now: LocalDateTime, onDuplicate: 'skip' | 'update'): AnyCheck[] {
  if (kind === 'clients') return checkClientRows(clinic, file.rows as ClientImportRow[], onDuplicate, now);
  if (kind === 'packages') return checkPackageRows(clinic, file.rows as PackageImportRow[], now);
  return checkCreditRows(clinic, file.rows as CreditImportRow[]);
}

/** Import dat ze stávajícího systému: Klienti → Permanentky → Kredity. */
export function ImportSection(): JSX.Element {
  const [kind, setKind] = useState<ImportKind>('clients');
  const [steps, setSteps] = useState<Record<ImportKind, StepState>>({ clients: EMPTY_STEP, packages: EMPTY_STEP, credits: EMPTY_STEP });
  const panelId = useId();
  const update = (k: ImportKind, patch: Partial<StepState>): void => setSteps((s) => ({ ...s, [k]: { ...s[k], ...patch } }));

  return (
    <div className="set-imp">
      <ol className="set-imp-steps" aria-label="Kroky importu">
        {KINDS.map((k, i) => {
          const done = steps[k].result;
          const current = k === kind;
          return (
            <li key={k} className="set-imp-steps__item">
              <button
                type="button"
                className={cx('set-imp-step', current && 'is-current', done && 'is-done')}
                aria-current={current ? 'step' : undefined}
                aria-controls={panelId}
                onClick={() => setKind(k)}
              >
                <span className="set-imp-step__num" aria-hidden="true">
                  {done ? <Icon name="check" size={14} strokeWidth={2.25} /> : i + 1}
                </span>
                <span className="set-imp-step__text">
                  <span className="set-imp-step__title">{STEP[k].title}</span>
                  <span className="set-imp-step__sub">
                    {done ? `hotovo · ${countLabel(done.created + done.updated, STEP[k].noun)}` : STEP[k].sub}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div id={panelId} className="set-imp-panel" role="region" aria-label={`Import – ${STEP[kind].title}`}>
        <ImportStep
          key={kind}
          kind={kind}
          state={steps[kind]}
          onState={(patch) => update(kind, patch)}
          onNext={kind !== 'credits' ? () => setKind(KINDS[KINDS.indexOf(kind) + 1]) : undefined}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Jeden krok                                                          */
/* ------------------------------------------------------------------ */

type RowFilter = 'all' | 'ok' | 'warnings' | 'errors';
const PAGE = 50;

function ImportStep({
  kind,
  state,
  onState,
  onNext,
}: {
  kind: ImportKind;
  state: StepState;
  onState: (patch: Partial<StepState>) => void;
  onNext?: () => void;
}): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const meta = STEP[kind];
  const [filter, setFilter] = useState<RowFilter>('all');
  const [limit, setLimit] = useState(PAGE);
  const [confirm, setConfirm] = useState(false);

  const file = useMemo(() => (state.source ? readImportFile(kind, state.source.text) : null), [kind, state.source]);
  const checks = useMemo(
    () => (file && !file.errors.length ? checkRows(kind, file, clinic, now, state.onDuplicate) : null),
    [kind, file, clinic, now, state.onDuplicate],
  );
  const summary = checks ? summarizeChecks(checks) : null;
  const toImport = summary ? summary.created + summary.updated : 0;

  const setSource = (source: Source | null): void => {
    onState({ source, result: null });
    setFilter('all');
    setLimit(PAGE);
  };

  const downloadTemplate = async (): Promise<void> => {
    const res = await downloadFile(IMPORT_TEMPLATE_FILENAME[kind], importTemplateCsv(kind, clinic), 'text/csv;charset=utf-8');
    const notice = downloadNotice(res);
    if (notice) toast(notice, { tone: 'warning' });
  };

  const downloadFailed = async (): Promise<void> => {
    if (!state.source || !checks) return;
    const table = parseCsv(state.source.text);
    const byRow = new Map(checks.filter((c) => c.action === 'error').map((c) => [c.row, c.issues.filter((i) => i.level === 'error').map((i) => i.text).join(' ')]));
    const rows = [[...table.header, 'Chyba'], ...table.records.filter((r) => byRow.has(r.row)).map((r) => [...table.header.map((_, i) => r.cells[i] ?? ''), byRow.get(r.row) ?? ''])];
    const base = state.source.name.replace(/\.(csv|txt)$/i, '') || 'import';
    const res = await downloadFile(`${base}-chyby.csv`, '﻿' + toCsv(rows), 'text/csv;charset=utf-8');
    const notice = downloadNotice(res);
    if (notice) toast(notice, { tone: 'warning' });
  };

  const doImport = (): void => {
    if (!file) return;
    const opts = { quiet: true };
    const r =
      kind === 'clients'
        ? run(importClients, { rows: file.rows as ClientImportRow[], onDuplicate: state.onDuplicate }, opts)
        : kind === 'packages'
          ? run(importPackages, { rows: file.rows as PackageImportRow[] }, opts)
          : run(importCredits, { rows: file.rows as CreditImportRow[] }, opts);
    if (!r.ok) throw new Error(r.error);
    onState({ source: null, result: r.value });
    toast.success('Import dokončen', { description: resultText(kind, r.value) });
  };

  return (
    <div className="set-imp-step-body">
      <div className="set-imp-head">
        <div className="set-imp-head__text">
          <h3 className="set-imp-head__title">
            {KINDS.indexOf(kind) + 1}. {meta.title}
          </h3>
          <p className="set-imp-head__intro">{meta.intro}</p>
        </div>
        <Button size="sm" icon="download" onClick={() => void downloadTemplate()}>
          Stáhnout šablonu CSV
        </Button>
      </div>

      <ExcelHelp kind={kind} />

      {kind !== 'clients' && clinic.clients.length === 0 && (
        <Callout tone="warning" title="Nejdřív klienti">
          V systému zatím nejsou žádní klienti. {meta.title} se přiřazují ke klientům podle e-mailu nebo telefonu – nejdřív proto naimportujte klienty.
        </Callout>
      )}

      {kind === 'clients' && <ConsentNote />}
      {kind === 'packages' && (
        <Callout tone="neutral" title="Jak permanentky převedeme">
          Každá vznikne s počtem zbývajících vstupů; hodnota vstupu odpovídá šabloně (cena / počet vstupů). V názvu bude „(převod)“, platba se nezapíše –
          peníze přijal stávající systém. Prošlé a vyčerpané permanentky přeskočíme.
        </Callout>
      )}
      {kind === 'credits' && (
        <Callout tone="neutral" title="Jak kredity převedeme">
          Zůstatek se připíše jako pohyb kreditu „Převod zůstatku ze stávajícího systému“ – bez platby a bez bonusu za dobití. Každému klientovi jen jednou.
        </Callout>
      )}

      {state.result && !state.source && <ResultCallout kind={kind} result={state.result} onNext={onNext} onAgain={() => onState({ result: null })} />}

      {!state.source && !state.result && <SourcePicker onLoad={setSource} />}

      {state.source && file && (
        <>
          <FileBar source={state.source} file={file} onClear={() => setSource(null)} />
          {file.errors.length > 0 && (
            <Callout tone="danger" title="Soubor nejde importovat">
              <ul className="set-imp-list">
                {file.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Callout>
          )}
          {file.warnings.length > 0 && (
            <Callout tone="warning" title="Upozornění k souboru" icon="alert">
              <ul className="set-imp-list">
                {file.warnings.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Callout>
          )}
          {kind === 'clients' && !file.errors.length && (
            <RadioCards<'skip' | 'update'>
              legend="Klient, který už v systému je"
              columns={2}
              value={state.onDuplicate}
              onChange={(onDuplicate) => onState({ onDuplicate })}
              options={[
                {
                  value: 'skip',
                  title: 'Přeskočit',
                  description: 'Klienta se stejným e-mailem (nebo telefonem a jménem) necháme beze změny.',
                },
                {
                  value: 'update',
                  title: 'Doplnit údaje ze souboru',
                  description: 'Doplníme telefon, datum narození, štítky, poznámku a udělené souhlasy. Jméno ani odvolané souhlasy neměníme.',
                },
              ]}
            />
          )}
          {checks && summary && (
            <Preview
              kind={kind}
              file={file}
              checks={checks}
              filter={filter}
              onFilter={(f) => {
                setFilter(f);
                setLimit(PAGE);
              }}
              limit={limit}
              onMore={() => setLimit((l) => l + PAGE)}
              onDownloadFailed={() => void downloadFailed()}
            />
          )}
          {summary && (
            <div className="set-imp-actions">
              <p className="set-imp-actions__summary" aria-live="polite">
                {toImport
                  ? `${kind === 'clients' ? 'Naimportujeme' : 'Převedeme'} ${countLabel(toImport, meta.noun)}${summary.skipped ? `, přeskočíme ${countLabel(summary.skipped, ['řádek', 'řádky', 'řádků'])}` : ''}${summary.errors ? `, ${countLabel(summary.errors, ['řádek', 'řádky', 'řádků'])} s chybou se neimportuje` : ''}.`
                  : 'V souboru není nic k importu – opravte chyby, nebo nahrajte jiný soubor.'}
              </p>
              <Button variant="primary" icon="upload" disabled={!toImport} onClick={() => setConfirm(true)}>
                Importovat{toImport ? ` ${countLabel(toImport, meta.noun)}` : ''}
              </Button>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Importovat ${countLabel(toImport, meta.noun)}?`}
        message={summary ? confirmText(kind, summary) : undefined}
        confirmLabel="Importovat"
        onConfirm={doImport}
      />
    </div>
  );
}

function confirmText(kind: ImportKind, s: { created: number; updated: number; skipped: number; errors: number }): string {
  const parts: string[] = [];
  if (kind === 'clients') {
    if (s.created) parts.push(`Založíme ${countLabel(s.created, ['nového klienta', 'nové klienty', 'nových klientů'])}`);
    if (s.updated) parts.push(`${s.created ? 'doplníme' : 'Doplníme'} údaje u ${countLabel(s.updated, ['existujícího', 'existujících', 'existujících'])}`);
  } else parts.push(`Převedeme ${countLabel(s.created, STEP[kind].noun)}`);
  let text = parts.join(' a ') + '.';
  if (s.skipped) text += ` Přeskočíme ${countLabel(s.skipped, ['řádek', 'řádky', 'řádků'])}.`;
  if (s.errors) text += ` ${countLabel(s.errors, ['řádek', 'řádky', 'řádků'])} s chybou se neimportuje.`;
  return text + ' Import nic neodesílá klientům a zapíše se do historie změn.';
}

function resultText(kind: ImportKind, r: ImportResult): string {
  return [
    `${kind === 'clients' ? 'Vytvořeno' : 'Převedeno'} ${formatNumber(r.created)}`,
    ...(r.updated ? [`doplněno ${formatNumber(r.updated)}`] : []),
    `přeskočeno ${formatNumber(r.skipped)}`,
    `s chybou ${formatNumber(r.errors)}`,
  ].join(', ') + '.';
}

/* ------------------------------------------------------------------ */
/* Nápověda a souhlasy                                                 */
/* ------------------------------------------------------------------ */

function ExcelHelp({ kind }: { kind: ImportKind }): JSX.Element {
  const columns = IMPORT_COLUMNS[kind];
  return (
    <details className="set-imp-help">
      <summary className="set-imp-help__summary">
        <Icon name="info" size={16} />
        Jak připravit soubor v Excelu
      </summary>
      <div className="set-imp-help__body">
        <ol className="set-imp-help__steps">
          <li>Otevřete export ze stávajícího systému v Excelu, nebo si stáhněte naši šablonu a údaje do ní zkopírujte.</li>
          <li>První řádek musí obsahovat názvy sloupců. Stačí ty, které máte; na pořadí ani velikosti písmen nezáleží.</li>
          <li>
            Zvolte <strong>Soubor → Uložit jako</strong> a typ <strong>CSV UTF-8 (s oddělovači) (*.csv)</strong>.
          </li>
          <li>Soubor nahrajte sem. Poradíme si i se starším „CSV (s oddělovači)“ ve windows-1250 a s buňkami zkopírovanými přímo z tabulky.</li>
        </ol>
        <dl className="set-imp-cols" aria-label="Rozpoznané sloupce">
          {columns.map((c) => (
            <div key={c.field} className="set-imp-cols__item">
              <dt>
                {c.label} <span className={cx('set-imp-cols__req', c.requirement && 'is-required')}>{c.requirement ?? 'nepovinné'}</span>
              </dt>
              <dd>{c.hint}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}

function ConsentNote(): JSX.Element {
  return (
    <Callout tone="info" title="Souhlasy klientů" icon="shieldCheck">
      Každému importovanému klientovi zapíšeme souhlas se zpracováním údajů pro rezervace se zdrojem „import ze stávajícího systému“. Souhlas
      s obchodními sděleními a SMS jen tam, kde soubor uvádí „ano“ (nebo datum udělení). Obchodní sdělení smíte posílat, jen když souhlas umíte
      doložit – kdy a jak ho klient dal. Pokud ho ve stávajícím systému zaznamenaný nemáte, nechte sloupec prázdný.
    </Callout>
  );
}

/* ------------------------------------------------------------------ */
/* Výběr souboru / vložený text                                        */
/* ------------------------------------------------------------------ */

function SourcePicker({ onLoad }: { onLoad: (s: Source) => void }): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [paste, setPaste] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const textId = useId();

  const load = async (f: File | undefined): Promise<void> => {
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      const decoded = await readCsvFile(f);
      onLoad({ name: f.name, text: decoded.text, encoding: decoded.encoding });
    } catch (e) {
      setError(e instanceof ImportFileError ? e.message : 'Soubor se nepodařilo načíst. Zkuste ho uložit znovu jako CSV UTF-8.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDrag(false);
    void load(e.dataTransfer.files?.[0]);
  };

  if (paste !== null) {
    return (
      <div className="set-imp-paste">
        <label htmlFor={textId} className="set-imp-paste__label">
          Vložte obsah souboru CSV nebo buňky zkopírované z Excelu (včetně řádku s názvy sloupců)
        </label>
        <Textarea id={textId} rows={8} value={paste} onValueChange={setPaste} spellCheck={false} className="set-imp-paste__text" placeholder={'Jméno;Příjmení;E-mail;Telefon\nJana;Nováková;jana@example.cz;777 123 456'} />
        <div className="set-imp-paste__actions">
          <Button variant="ghost" onClick={() => setPaste(null)}>
            Zpět
          </Button>
          <Button variant="primary" icon="check" disabled={!paste.trim()} onClick={() => onLoad({ name: 'Vložený text', text: paste, encoding: null })}>
            Načíst text
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cx('set-imp-drop', drag && 'is-drag')}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
    >
      <span className="set-imp-drop__icon" aria-hidden="true">
        <Icon name="upload" size={20} />
      </span>
      <div className="set-imp-drop__text">
        <strong>Přetáhněte sem soubor CSV</strong>
        <span>nebo ho vyberte z počítače. Data se nikam neodesílají, dokud import nepotvrdíte.</span>
      </div>
      <div className="set-imp-drop__actions">
        <Button variant="primary" icon="file" loading={busy} onClick={() => inputRef.current?.click()}>
          Vybrat soubor
        </Button>
        <Button variant="ghost" icon="clipboard" onClick={() => setPaste('')}>
          Vložit text
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        className="visually-hidden"
        tabIndex={-1}
        aria-label="Soubor CSV k importu"
        onChange={(e) => void load(e.target.files?.[0])}
      />
      {error && (
        <p className="field__error set-imp-drop__error" role="alert">
          <Icon name="alertCircle" size={14} />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

function FileBar({ source, file, onClear }: { source: Source; file: ImportFile<ImportKind>; onClear: () => void }): JSX.Element {
  return (
    <div className="set-imp-file">
      <div className="set-imp-file__main">
        <Icon name="file" size={16} className="set-imp-file__icon" />
        <span className="set-imp-file__name truncate">{source.name}</span>
        <span className="set-imp-file__meta tnum">
          {countLabel(file.rows.length, ['řádek', 'řádky', 'řádků'])}
          {source.encoding ? ` · ${ENCODING_LABEL[source.encoding]}` : ''} · oddělovač {DELIMITER_LABEL[file.delimiter]}
        </span>
        <Button size="sm" variant="ghost" icon="x" onClick={onClear} className="set-imp-file__clear">
          Jiný soubor
        </Button>
      </div>
      {file.header.length > 0 && (
        <div className="set-imp-file__cols">
          {file.map.recognized.length > 0 && (
            <span className="set-imp-file__group">
              <span className="set-imp-file__label">Rozpoznané sloupce</span>
              {file.map.recognized.map((c) => (
                <Badge key={c.field} tone="success" size="sm" title={c.header !== c.label ? `Sloupec „${c.header}“` : undefined}>
                  {c.label}
                </Badge>
              ))}
            </span>
          )}
          {file.map.ignored.length > 0 && (
            <span className="set-imp-file__group">
              <span className="set-imp-file__label">Nepoužijeme</span>
              {file.map.ignored.map((h) => (
                <Badge key={h} tone="neutral" size="sm" outline>
                  {h}
                </Badge>
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Náhled                                                              */
/* ------------------------------------------------------------------ */

const ACTION: Record<RowAction, { label: (k: ImportKind) => string; tone: BadgeTone }> = {
  create: { label: (k) => (k === 'clients' ? 'Nový klient' : 'Převést'), tone: 'success' },
  update: { label: () => 'Doplnit údaje', tone: 'info' },
  skip: { label: () => 'Přeskočit', tone: 'neutral' },
  error: { label: () => 'Chyba', tone: 'danger' },
};

interface PreviewRow {
  row: number;
  action: RowAction;
  issues: RowIssue[];
  cells: ReactNode[];
}

const dash = <span className="muted">—</span>;

function previewRows(kind: ImportKind, file: ImportFile<ImportKind>, checks: AnyCheck[]): { columns: { label: string; num?: boolean }[]; rows: PreviewRow[] } {
  if (kind === 'clients') {
    return {
      columns: [{ label: 'Klient' }, { label: 'Narození' }, { label: 'Souhlasy' }, { label: 'Štítky' }],
      rows: (checks as ClientRowCheck[]).map((c) => {
        const d = c.data;
        const name = [d.firstName, d.lastName].filter(Boolean).join(' ');
        const consents = [d.consents.marketingEmail && 'E-mail', d.consents.sms && 'SMS', d.consents.health && 'Zdravotní'].filter(Boolean) as string[];
        return {
          row: c.row,
          action: c.action,
          issues: c.issues,
          cells: [
            <span key="who" className="set-imp-who">
              <span className="set-imp-who__name">{name || '—'}</span>
              <span className="set-imp-who__sub">{[d.email, d.phone].filter(Boolean).join(' · ') || 'bez platného kontaktu'}</span>
            </span>,
            d.birthDate ? <span className="tnum nowrap">{formatDate(d.birthDate)}</span> : dash,
            consents.length ? (
              <span className="set-imp-chips">
                {consents.map((x) => (
                  <Badge key={x} size="sm" tone="accent">
                    {x}
                  </Badge>
                ))}
              </span>
            ) : (
              dash
            ),
            d.tags.length ? d.tags.join(', ') : dash,
          ],
        };
      }),
    };
  }
  if (kind === 'packages') {
    const raw = file.rows as PackageImportRow[];
    return {
      columns: [{ label: 'Klient' }, { label: 'Permanentka' }, { label: 'Zbývá', num: true }, { label: 'Platí do' }, { label: 'Hodnota vstupu', num: true }],
      rows: (checks as PackageRowCheck[]).map((c, i) => ({
        row: c.row,
        action: c.action,
        issues: c.issues,
        cells: [
          <span key="who" className="set-imp-who__name">{c.clientLabel}</span>,
          c.packageName ?? (raw[i]?.template ? String(raw[i].template) : dash),
          c.remaining !== null ? formatNumber(c.remaining) : dash,
          c.validUntil ? <span className="tnum nowrap">{formatDate(c.validUntil)}</span> : dash,
          c.unitValue !== null ? <span className="nowrap">{formatMoney(c.unitValue)}</span> : dash,
        ],
      })),
    };
  }
  const raw = file.rows as CreditImportRow[];
  return {
    columns: [{ label: 'Klient' }, { label: 'Kredit', num: true }, { label: 'Poznámka' }],
    rows: (checks as CreditRowCheck[]).map((c, i) => ({
      row: c.row,
      action: c.action,
      issues: c.issues,
      cells: [
        <span key="who" className="set-imp-who__name">{c.clientLabel}</span>,
        c.amount !== null ? <span className="nowrap">{formatMoney(c.amount)}</span> : raw[i]?.amount !== undefined && String(raw[i].amount) ? String(raw[i].amount) : dash,
        c.note || dash,
      ],
    })),
  };
}

function Preview({
  kind,
  file,
  checks,
  filter,
  onFilter,
  limit,
  onMore,
  onDownloadFailed,
}: {
  kind: ImportKind;
  file: ImportFile<ImportKind>;
  checks: AnyCheck[];
  filter: RowFilter;
  onFilter: (f: RowFilter) => void;
  limit: number;
  onMore: () => void;
  onDownloadFailed: () => void;
}): JSX.Element {
  const { columns, rows } = useMemo(() => previewRows(kind, file, checks), [kind, file, checks]);
  const s = summarizeChecks(checks);
  const matches = (r: PreviewRow): boolean =>
    filter === 'all' ||
    (filter === 'errors' && r.action === 'error') ||
    (filter === 'warnings' && r.action !== 'error' && r.issues.some((i) => i.level === 'warning')) ||
    (filter === 'ok' && (r.action === 'create' || r.action === 'update'));
  const list = rows.filter(matches);
  const shown = list.slice(0, limit);
  const ok = s.created + s.updated;

  return (
    <section className="set-imp-preview" aria-label="Náhled importu">
      <div className="set-imp-stats statline" aria-live="polite">
        <span>
          <strong>{formatNumber(s.total)}</strong> {plural(s.total, ['řádek', 'řádky', 'řádků'])} v souboru
        </span>
        <span>
          <strong className="text-success">{formatNumber(s.created)}</strong> {kind === 'clients' ? 'k založení' : 'k převodu'}
        </span>
        {kind === 'clients' && (
          <span>
            <strong className={s.updated ? 'text-info' : undefined}>{formatNumber(s.updated)}</strong> k doplnění
          </span>
        )}
        <span>
          <strong>{formatNumber(s.skipped)}</strong> k přeskočení
        </span>
        <span>
          <strong className={s.errors ? 'text-danger' : undefined}>{formatNumber(s.errors)}</strong> s chybou
        </span>
      </div>
      <div className="set-imp-tools">
        <ChoiceChips<RowFilter>
          aria-label="Filtr řádků náhledu"
          value={filter}
          onChange={onFilter}
          options={[
            { value: 'all', label: `Vše (${formatNumber(s.total)})` },
            { value: 'ok', label: `K importu (${formatNumber(ok)})` },
            { value: 'warnings', label: `S upozorněním (${formatNumber(s.warnings)})`, disabled: !s.warnings },
            { value: 'errors', label: `S chybou (${formatNumber(s.errors)})`, disabled: !s.errors },
          ]}
        />
        {s.errors > 0 && (
          <Button size="sm" variant="ghost" icon="download" onClick={onDownloadFailed}>
            Stáhnout řádky s chybou
          </Button>
        )}
      </div>
      {list.length === 0 ? (
        <p className="set-imp-empty">Žádný řádek neodpovídá filtru.</p>
      ) : (
        <>
        {/* úzký displej: karty místo široké tabulky (výsledek řádku je vidět hned) */}
        <ul className="set-imp-cards" aria-label={`Náhled importu – ${STEP[kind].title.toLocaleLowerCase('cs')}`}>
          {shown.map((r) => (
            <li key={r.row} className={cx('set-imp-card', r.action === 'error' && 'is-error')}>
              <div className="set-imp-card__top">
                <span className="set-imp-card__row tnum">ř. {r.row}</span>
                <span className="set-imp-card__title">{r.cells[0]}</span>
                <Badge tone={ACTION[r.action].tone} size="sm" dot={r.action === 'error' ? 'square' : r.action === 'skip' ? 'ring' : true}>
                  {ACTION[r.action].label(kind)}
                </Badge>
              </div>
              <dl className="set-imp-card__meta">
                {r.cells.slice(1).map((cell, i) => (
                  <div key={i} className="set-imp-card__item">
                    <dt>{columns[i + 1].label}</dt>
                    <dd>{cell}</dd>
                  </div>
                ))}
              </dl>
              {r.issues.length > 0 && (
                <ul className="set-imp-issues">
                  {r.issues.map((i, n) => (
                    <li key={n} className={cx('set-imp-issue', i.level === 'error' ? 'is-error' : 'is-warning')}>
                      <Icon name={i.level === 'error' ? 'alertCircle' : 'alert'} size={12} />
                      <span>{i.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        <Table caption={`Náhled importu – ${STEP[kind].title.toLocaleLowerCase('cs')}`} minWidth={kind === 'clients' ? 860 : 760} maxHeight={560} density="compact" wrapperClassName="set-imp-table">
          <thead>
            <tr>
              <th scope="col" className="num">
                Řádek
              </th>
              {columns.map((c) => (
                <th key={c.label} scope="col" className={c.num ? 'num' : undefined}>
                  {c.label}
                </th>
              ))}
              <th scope="col">Výsledek</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.row} className={cx(r.action === 'error' && 'set-imp-row--error', r.action === 'skip' && 'set-imp-row--skip')}>
                <td className="num tnum">{r.row}</td>
                {r.cells.map((cell, i) => (
                  <td key={i} className={columns[i].num ? 'num tnum' : undefined}>
                    {cell}
                  </td>
                ))}
                <td className="set-imp-result">
                  <Badge tone={ACTION[r.action].tone} size="sm" dot={r.action === 'error' ? 'square' : r.action === 'skip' ? 'ring' : true}>
                    {ACTION[r.action].label(kind)}
                  </Badge>
                  {r.issues.length > 0 && (
                    <ul className="set-imp-issues">
                      {r.issues.map((i, n) => (
                        <li key={n} className={cx('set-imp-issue', i.level === 'error' ? 'is-error' : 'is-warning')}>
                          <Icon name={i.level === 'error' ? 'alertCircle' : 'alert'} size={12} />
                          <span>{i.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        </>
      )}
      {list.length > shown.length && (
        <div className="set-imp-more">
          <Button size="sm" variant="secondary" onClick={onMore}>
            Zobrazit dalších {formatNumber(Math.min(PAGE, list.length - shown.length))} z {formatNumber(list.length - shown.length)}
          </Button>
        </div>
      )}
    </section>
  );
}

function ResultCallout({ kind, result, onNext, onAgain }: { kind: ImportKind; result: ImportResult; onNext?: () => void; onAgain: () => void }): JSX.Element {
  const next = onNext ? STEP[KINDS[KINDS.indexOf(kind) + 1]].title : null;
  return (
    <Callout
      tone="success"
      title="Import dokončen"
      actions={
        <>
          {onNext && next && (
            <Button size="sm" variant="primary" iconRight="arrowRight" onClick={onNext}>
              Pokračovat: {next}
            </Button>
          )}
          <Button size="sm" variant="secondary" icon="upload" onClick={onAgain}>
            Importovat další soubor
          </Button>
        </>
      }
    >
      {resultText(kind, result)} Změny najdete v historii změn klientů{kind === 'clients' ? '; nikomu se nic neodeslalo' : ''}.
    </Callout>
  );
}
