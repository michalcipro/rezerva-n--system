import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { Channel, MessageTemplate, TemplateKey } from '../../domain/types';
import { updateTemplate } from '../../engine/commands';
import { countLabel, formatNumber } from '../../engine/format';
import { DEFAULT_TEMPLATES, MARKETING_TEMPLATES, renderTemplate } from '../../engine/messages';
import { addDays } from '../../engine/time';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { navigate, useSession } from '../../store/session';
import { Badge, Button, Callout, Card, Checkbox, cx, Field, Icon, Input, Switch, TabPanel, Tabs, Textarea, toast } from '../../ui';
import {
  channelsLabel,
  insertAt,
  isManualTemplate,
  NOT_AUTOMATED,
  smsInfo,
  TEMPLATE_GROUPS,
  templateIssues,
  templateSampleVars,
  templateTiming,
  templateVariableKeys,
  variableLabel,
} from './lib';
import { EmailFrame, focusCaret, MarketingFooter, Paragraphs, Personalized, revealElement, ServiceFooter } from './shared';

export type TemplateDraft = Pick<MessageTemplate, 'subject' | 'body' | 'smsBody' | 'channels'>;
export type TemplateDrafts = Partial<Record<TemplateKey, TemplateDraft>>;

const pickDraft = (t: TemplateDraft): TemplateDraft => ({ subject: t.subject, body: t.body, smsBody: t.smsBody, channels: [...t.channels] });

const sameDraft = (a: TemplateDraft, b: TemplateDraft): boolean =>
  a.subject === b.subject &&
  a.body === b.body &&
  a.smsBody === b.smsBody &&
  a.channels.length === b.channels.length &&
  a.channels.every((c) => b.channels.includes(c));

type FieldName = 'subject' | 'body' | 'smsBody';

/* ------------------------------------------------------------------ */
/* Seznam šablon                                                       */
/* ------------------------------------------------------------------ */

function TemplateList({
  selected,
  drafts,
  onSelect,
}: {
  selected: TemplateKey;
  drafts: TemplateDrafts;
  onSelect: (key: TemplateKey) => void;
}): JSX.Element {
  const clinic = useClinic();
  const run = useCommand();
  return (
    <Card padding="none" as="section" className="com-tlist" aria-label="Šablony zpráv">
      {TEMPLATE_GROUPS.map((g) => {
        const items = g.keys.map((k) => clinic.templates.find((t) => t.key === k)).filter((t): t is MessageTemplate => !!t);
        if (!items.length) return null;
        return (
          <div key={g.id} className="com-tlist__group">
            <h3 className="com-tlist__label">{g.label}</h3>
            <ul className="com-tlist__items">
              {items.map((t) => (
                <li key={t.key} className={cx('com-tlist__row', t.key === selected && 'is-active')}>
                  <button type="button" className="com-tlist__main" aria-current={t.key === selected ? 'true' : undefined} onClick={() => onSelect(t.key)}>
                    <span className="com-tlist__name">
                      {t.name}
                      {drafts[t.key] && !sameDraft(drafts[t.key] as TemplateDraft, t) && (
                        <span className="com-tlist__dirty" title="Neuložené změny">
                          <span className="visually-hidden">(neuložené změny)</span>
                        </span>
                      )}
                    </span>
                    <span className="com-tlist__meta">
                      {channelsLabel(t.channels)} · {templateTiming(t, clinic)}
                    </span>
                  </button>
                  {isManualTemplate(t.key) ? (
                    <Badge className="com-tlist__manual" icon="send" title="Neposílá se automaticky – odesílá se ručně">
                      Ručně
                    </Badge>
                  ) : (
                    <Switch
                      className="com-tlist__switch"
                      checked={t.enabled}
                      aria-label={t.name}
                      onChange={(value) => run(updateTemplate, { key: t.key, patch: { enabled: value } }, { success: `${t.name}: ${value ? 'zapnuto' : 'vypnuto'}` })}
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Editor šablony                                                      */
/* ------------------------------------------------------------------ */

/** Krátká ukázková hodnota proměnné do nápovědy (na jeden řádek). */
function sampleText(value: string | undefined): string {
  const flat = (value ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > 60 ? `${flat.slice(0, 57).trimEnd()}…` : flat;
}

/** Pole textu zprávy: u šablon s jedním kanálem bez karet, jinak panel karty kanálu. */
function ChannelPanel({ manual, idPrefix, channel, children }: { manual: boolean; idPrefix: string; channel: Channel; children: ReactNode }): JSX.Element {
  if (manual) return <div className="com-tedit__panel">{children}</div>;
  return (
    <TabPanel idPrefix={idPrefix} id={channel} className="com-tedit__panel">
      {children}
    </TabPanel>
  );
}

interface TemplateEditorProps {
  tpl: MessageTemplate;
  draft: TemplateDraft | undefined;
  onDraft: (draft: TemplateDraft | undefined) => void;
  onBack: () => void;
  onShowMessages: (key: TemplateKey) => void;
}

function TemplateEditor({ tpl, draft, onDraft, onBack, onShowMessages }: TemplateEditorProps): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const session = useSession();
  const value: TemplateDraft = draft ?? pickDraft(tpl);
  const dirty = !!draft && !sameDraft(draft, tpl);
  const [channel, setChannel] = useState<Channel>(tpl.channels[0] ?? 'email');
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const smsRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<FieldName | null>(null);

  const vars = useMemo(() => templateSampleVars(clinic, now, tpl.key), [clinic, now, tpl.key]);
  const allowed = templateVariableKeys(tpl.key);
  const issues = templateIssues(tpl.key, value);
  const marketing = MARKETING_TEMPLATES.includes(tpl.key);
  /** Posílá se ručně (zápis ze sezení): jen e-mail, bez vypínače. */
  const manual = isManualTemplate(tpl.key);
  const automated = !manual && !NOT_AUTOMATED.includes(tpl.key);
  const activeChannel: Channel = manual ? 'email' : channel;
  const weekAgo = addDays(now, -7);
  const stats = useMemo(() => {
    let sent = 0;
    let skipped = 0;
    for (const m of clinic.messages) {
      if (m.kind !== tpl.key || m.at < weekAgo) continue;
      if (m.status === 'sent') sent++;
      else skipped++;
    }
    return { sent, skipped };
  }, [clinic.messages, tpl.key, weekAgo]);
  const smsConsent = useMemo(() => clinic.clients.filter((c) => c.consents.sms && c.phone).length, [clinic.clients]);
  const sms = smsInfo(renderTemplate(value.smsBody, vars));

  const set = (patch: Partial<TemplateDraft>): void => {
    const next = { ...value, ...patch };
    onDraft(sameDraft(next, tpl) ? undefined : next);
  };

  const refFor = (name: FieldName): HTMLInputElement | HTMLTextAreaElement | null =>
    name === 'subject' ? subjectRef.current : name === 'body' ? bodyRef.current : smsRef.current;

  const insertVariable = (key: string): void => {
    const target: FieldName = activeChannel === 'sms' ? 'smsBody' : lastField.current === 'subject' ? 'subject' : 'body';
    const el = refFor(target);
    const current = value[target];
    const useCaret = lastField.current === target && el !== null;
    const start = useCaret ? (el.selectionStart ?? current.length) : current.length;
    const end = useCaret ? (el.selectionEnd ?? current.length) : current.length;
    const res = insertAt(current, start, end, `[${key}]`);
    const patch: Partial<TemplateDraft> = {};
    patch[target] = res.value;
    set(patch);
    lastField.current = target;
    focusCaret(el, res.caret);
  };

  const toggleChannel = (c: Channel, on: boolean): void => {
    const channels = on ? [...value.channels.filter((x) => x !== c), c] : value.channels.filter((x) => x !== c);
    set({ channels: (['email', 'sms'] as Channel[]).filter((x) => channels.includes(x)) });
  };

  const save = (): void => {
    const r = run(updateTemplate, { key: tpl.key, patch: value }, { success: `Šablona „${tpl.name}“ uložena` });
    if (r.ok) onDraft(undefined);
  };

  const resetToDefault = (): void => {
    const def = DEFAULT_TEMPLATES.find((t) => t.key === tpl.key);
    if (!def) return;
    const next = pickDraft(def);
    if (sameDraft(next, tpl)) {
      onDraft(undefined);
      toast.info('Šablona už má výchozí text.');
      return;
    }
    onDraft(next);
    toast.info('Načten výchozí text', { description: 'Změnu potvrďte tlačítkem Uložit změny.' });
  };

  const settingsLink = session.role === 'owner' && (tpl.key === 'reminder' || tpl.key === 'waitlist_offer');

  return (
    <Card padding="none" as="section" className="com-tedit" aria-label={`Šablona ${tpl.name}`}>
      <div className="com-tedit__head">
        <Button variant="ghost" size="sm" icon="arrowLeft" className="com-tpl__back" onClick={onBack}>
          Všechny šablony
        </Button>
        <div className="com-tedit__titles">
          <h2 className="com-tedit__title">{tpl.name}</h2>
          <p className="com-tedit__desc">{tpl.description}</p>
        </div>
        {manual ? (
          <Badge className="com-tedit__switch" icon="send" size="md">
            Posílá se ručně
          </Badge>
        ) : (
          <Switch
            className="com-tedit__switch"
            checked={tpl.enabled}
            label={tpl.enabled ? 'Zapnuto' : 'Vypnuto'}
            onChange={(v) => run(updateTemplate, { key: tpl.key, patch: { enabled: v } }, { success: `${tpl.name}: ${v ? 'zapnuto' : 'vypnuto'}` })}
          />
        )}
      </div>

      <div className="com-tedit__facts">
        <Badge icon="clock" size="md">
          {templateTiming(tpl, clinic)}
        </Badge>
        {marketing ? (
          <Badge tone="warning" icon="shield" size="md">
            Obchodní sdělení – jen se souhlasem
          </Badge>
        ) : (
          <Badge tone="neutral" icon="shieldCheck" size="md">
            Provozní zpráva
          </Badge>
        )}
        <span className="com-tedit__stats">
          Za posledních 7 dní: odesláno {formatNumber(stats.sent)}
          {stats.skipped > 0 && <> · neodesláno {formatNumber(stats.skipped)}</>}
          {stats.sent + stats.skipped > 0 && (
            <>
              {' · '}
              <button type="button" className="link" onClick={() => onShowMessages(tpl.key)}>
                Zobrazit
              </button>
            </>
          )}
        </span>
        {settingsLink && (
          <button type="button" className="link com-tedit__settings" onClick={() => navigate({ name: 'nastaveni' })}>
            {tpl.key === 'reminder' ? 'Nastavení připomínek' : 'Nastavení čekací listiny'}
            <Icon name="arrowUpRight" size={14} />
          </button>
        )}
      </div>

      {manual && (
        <div className="com-tedit__notice">
          <Callout tone="info" icon="send" title="Odesílá kouč ručně">
            Zápis ze sezení pošlete klientovi z karty klienta (Poznámky) nebo z detailu schůzky v kalendáři. Před odesláním
            uvidíte náhled a text můžete ještě upravit – tady nastavujete jen výchozí předmět a text e-mailu. Proměnná [poznámky]
            vloží text zápisu, [datum] datum sezení.
          </Callout>
        </div>
      )}
      {!automated && !manual && (
        <div className="com-tedit__notice">
          <Callout tone="warning" title="Zatím bez automatického odeslání">
            V prototypu se tato zpráva sama neodesílá.{' '}
            {tpl.key === 'reactivation'
              ? 'Klienty bez návštěvy zatím oslovte kampaní „Dlouho jsme se neviděli“.'
              : 'Přání zatím pošlete jako kampaň nebo ruční zprávu.'}
          </Callout>
        </div>
      )}
      {!tpl.enabled && automated && (
        <div className="com-tedit__notice">
          <Callout tone="neutral" icon="pause">
            Šablona je vypnutá – systém tuto zprávu klientům neposílá. Texty můžete upravit i tak.
          </Callout>
        </div>
      )}

      <div className="com-tedit__grid">
        <div className="com-tedit__form">
          {manual ? (
            <p className="com-tedit__only">
              <Icon name="mail" size={16} />
              <span>Posílá se jen e-mailem.</span>
            </p>
          ) : (
            <fieldset className="com-tedit__channels">
              <legend className="field__label">Kanály</legend>
              <Checkbox label="E-mail" checked={value.channels.includes('email')} onChange={(on) => toggleChannel('email', on)} />
              <Checkbox
                label="SMS"
                description={`Jen klientům se souhlasem se SMS (${formatNumber(smsConsent)} z ${formatNumber(clinic.clients.length)})`}
                checked={value.channels.includes('sms')}
                onChange={(on) => toggleChannel('sms', on)}
              />
            </fieldset>
          )}

          {!manual && (
            <Tabs
              idPrefix={`com-tch-${tpl.key}`}
              bordered
              aria-label="Text zprávy podle kanálu"
              value={channel}
              onChange={setChannel}
              items={[
                { id: 'email', label: value.channels.includes('email') ? 'E-mail' : 'E-mail (vypnuto)' },
                { id: 'sms', label: value.channels.includes('sms') ? 'SMS' : 'SMS (vypnuto)' },
              ]}
            />
          )}
          <ChannelPanel manual={manual} idPrefix={`com-tch-${tpl.key}`} channel={activeChannel}>
            {activeChannel === 'email' ? (
              <>
                <Field label="Předmět">
                  <Input
                    ref={subjectRef}
                    value={value.subject}
                    onFocus={() => (lastField.current = 'subject')}
                    onValueChange={(subject) => set({ subject })}
                  />
                </Field>
                <Field
                  label="Text e-mailu"
                  hint={manual ? 'Prázdný řádek začne nový odstavec. Text zápisu vloží proměnná [poznámky].' : 'Prázdný řádek začne nový odstavec.'}
                >
                  <Textarea
                    ref={bodyRef}
                    rows={10}
                    value={value.body}
                    onFocus={() => (lastField.current = 'body')}
                    onValueChange={(body) => set({ body })}
                  />
                </Field>
              </>
            ) : (
              <Field
                label="Text SMS"
                hint={
                  <span className="com-count">
                    <span>
                      {sms.unicode ? 'S diakritikou se vejde 70 znaků do jedné SMS.' : 'Bez diakritiky se vejde 160 znaků do jedné SMS.'}
                    </span>
                    <span className="tnum">
                      {formatNumber(sms.length)} zn. · {countLabel(sms.parts, ['SMS', 'SMS', 'SMS'])}
                    </span>
                  </span>
                }
              >
                <Textarea
                  ref={smsRef}
                  rows={5}
                  value={value.smsBody}
                  placeholder="Text SMS (bez textu se SMS neodešle)"
                  onFocus={() => (lastField.current = 'smsBody')}
                  onValueChange={(smsBody) => set({ smsBody })}
                />
              </Field>
            )}
          </ChannelPanel>

          <div className="com-vars">
            <span className="com-vars__label" id={`com-vars-${tpl.key}`}>
              Vložit proměnnou
            </span>
            <div className="com-vars__list" role="group" aria-labelledby={`com-vars-${tpl.key}`}>
              {allowed.map((key) => (
                <button
                  key={key}
                  type="button"
                  className="com-var-chip"
                  title={variableLabel(key, tpl.key)}
                  aria-label={`Vložit ${variableLabel(key, tpl.key)}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertVariable(key)}
                >
                  [{key}]
                </button>
              ))}
            </div>
            <details className="com-vars__help" open={manual || undefined}>
              <summary>Co proměnné znamenají</summary>
              <dl className="com-vars__defs">
                {allowed.map((key) => (
                  <div key={key} className="com-vars__def">
                    <dt>[{key}]</dt>
                    <dd>
                      {variableLabel(key, tpl.key)}
                      {sampleText(vars[key]) && <span className="com-vars__sample"> – např. {sampleText(vars[key])}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          </div>

          {issues.length > 0 && (
            <Callout tone="warning" title="Zkontrolujte">
              <ul className="com-issues">
                {issues.map((i) => (
                  <li key={i.id}>{i.text}</li>
                ))}
              </ul>
            </Callout>
          )}
        </div>

        <div className="com-tedit__preview">
          <span className="com-tedit__eyebrow">Náhled s ukázkovými údaji</span>
          {activeChannel === 'email' ? (
            <div className="com-stage com-stage--compact">
              <div className="com-tsubject">
                <span className="com-tsubject__label">Předmět</span>
                <span className="com-tsubject__text">
                  {value.subject.trim() ? <Personalized text={value.subject} vars={vars} /> : <em>bez předmětu</em>}
                </span>
              </div>
              <EmailFrame
                clinic={clinic}
                device="mobile"
                label={`Náhled e-mailu ${tpl.name}`}
                footer={marketing ? <MarketingFooter clinic={clinic} /> : <ServiceFooter clinic={clinic} />}
              >
                {value.body.trim() ? <Paragraphs text={value.body} vars={vars} className="com-email__p" /> : <p className="com-email__placeholder">Text e-mailu je prázdný.</p>}
              </EmailFrame>
            </div>
          ) : (
            <div className="com-phone" aria-label={`Náhled SMS ${tpl.name}`} role="group">
              <span className="com-phone__from">{clinic.settings.clinicName}</span>
              {value.smsBody.trim() ? (
                <p className="com-phone__bubble">
                  <Personalized text={value.smsBody} vars={vars} />
                </p>
              ) : (
                <p className="com-phone__empty">Text SMS je prázdný – SMS se neodešle.</p>
              )}
            </div>
          )}
          <p className="com-tedit__sample">
            Ukázka: {vars['jméno']} {vars['příjmení']}
            {allowed.includes('služba') && (
              <>
                , {vars['služba']} {vars['datum']} v {vars['čas']}
              </>
            )}
            {manual && <>, sezení {vars['datum']}, ukázkový text zápisu</>}. Zvýrazněné části doplní systém.
          </p>
        </div>
      </div>

      <div className="com-tedit__foot">
        <Button variant="ghost" icon="refresh" onClick={resetToDefault}>
          Výchozí text
        </Button>
        <span className="spacer" />
        {dirty && <span className="com-tedit__unsaved">Neuložené změny</span>}
        <Button disabled={!dirty} onClick={() => onDraft(undefined)}>
          Zahodit
        </Button>
        <Button variant="primary" disabled={!dirty} onClick={save}>
          Uložit změny
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Záložka                                                             */
/* ------------------------------------------------------------------ */

interface TemplatesTabProps {
  selected: TemplateKey;
  onSelect: (key: TemplateKey) => void;
  drafts: TemplateDrafts;
  onDraftsChange: (update: (drafts: TemplateDrafts) => TemplateDrafts) => void;
  onShowMessages: (key: TemplateKey) => void;
}

export function TemplatesTab({ selected, onSelect, drafts, onDraftsChange, onShowMessages }: TemplatesTabProps): JSX.Element {
  const clinic = useClinic();
  const [detail, setDetail] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tpl = clinic.templates.find((t) => t.key === selected) ?? clinic.templates[0];

  /** Na telefonu (seznam a editor se střídají) posune stránku na začátek zobrazené části. */
  const reveal = (part: 'detail' | 'list'): void => {
    requestAnimationFrame(() => {
      const root = wrapRef.current;
      const list = root?.querySelector<HTMLElement>('.com-tpl__list');
      const editor = root?.querySelector<HTMLElement>('.com-tpl__detail');
      if (!root || !list || !editor) return;
      const shown = part === 'detail' ? editor : list;
      const hidden = part === 'detail' ? list : editor;
      if (getComputedStyle(hidden).display === 'none') revealElement(shown, part === 'detail' ? 'start' : 'nearest');
    });
  };

  return (
    <div className="com-tplwrap" ref={wrapRef}>
      <div className={detail ? 'com-tpl is-detail' : 'com-tpl'}>
        <div className="com-tpl__list">
          <TemplateList
            selected={tpl?.key ?? selected}
            drafts={drafts}
            onSelect={(key) => {
              onSelect(key);
              setDetail(true);
              reveal('detail');
            }}
          />
        </div>
        <div className="com-tpl__detail">
          {tpl ? (
            <TemplateEditor
              key={tpl.key}
              tpl={tpl}
              draft={drafts[tpl.key]}
              onDraft={(d) =>
                onDraftsChange((all) => {
                  const next = { ...all };
                  if (d) next[tpl.key] = d;
                  else delete next[tpl.key];
                  return next;
                })
              }
              onBack={() => {
                setDetail(false);
                reveal('list');
              }}
              onShowMessages={onShowMessages}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
