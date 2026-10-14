import { useId, useMemo, useState } from 'react';
import type { Client, ClinicState, SegmentDefinition, SegmentRule } from '../../domain/types';
import { countLabel, formatNumber, plural } from '../../engine/format';
import { defaultRule, describeRule, RULE_TYPES } from '../../engine/segments';
import { getClient } from '../../engine/selectors';
import { Avatar, Button, Card, CardHeader, cssVars, cx, Field, Icon, IconButton, Menu, NumberInput, Segmented, Select } from '../../ui';
import { tagStats, type SegmentInsight } from './lib';

type RuleList = 'rules' | 'exclude';

function ruleText(clinic: ClinicState, rule: SegmentRule): string {
  if (rule.type === 'tag' && !rule.tag.trim()) return 'Štítek (vyberte)';
  return describeRule(clinic, rule);
}

const days = (n: number): string => plural(n, ['den', 'dny', 'dní']);

/** Pole pro parametry jednoho pravidla podle jeho typu. */
function RuleFields({
  clinic,
  rule,
  onChange,
  tags,
}: {
  clinic: ClinicState;
  rule: SegmentRule;
  onChange: (rule: SegmentRule) => void;
  tags: { tag: string; count: number }[];
}): JSX.Element {
  const typeField = (
    <Field label="Podmínka">
      <Select
        size="sm"
        value={rule.type}
        options={RULE_TYPES.map((t) => ({ value: t.type, label: t.label }))}
        onValueChange={(v) => onChange(defaultRule(clinic, v as SegmentRule['type']))}
      />
    </Field>
  );
  let params: JSX.Element | null = null;
  switch (rule.type) {
    case 'visited_category':
      params = (
        <>
          <Field label="Kategorie">
            <Select
              size="sm"
              value={rule.categoryId}
              options={[...clinic.categories].sort((a, b) => a.order - b.order).map((c) => ({ value: c.id, label: c.name }))}
              onValueChange={(v) => onChange({ ...rule, categoryId: v })}
            />
          </Field>
          <Field label="Za posledních">
            <NumberInput size="sm" min={1} max={730} value={rule.withinDays} suffix={days(rule.withinDays)} onChange={(n) => onChange({ ...rule, withinDays: n })} />
          </Field>
        </>
      );
      break;
    case 'no_visit_for':
      params = (
        <Field label="Bez návštěvy aspoň" hint="Jen klienti, kteří už u vás byli a nemají budoucí termín.">
          <NumberInput size="sm" min={1} max={730} value={rule.days} suffix={days(rule.days)} onChange={(n) => onChange({ ...rule, days: n })} />
        </Field>
      );
      break;
    case 'has_active_package':
      params = (
        <Field label="Permanentka">
          <Select
            size="sm"
            value={rule.templateId ?? ''}
            options={[{ value: '', label: 'Jakákoli permanentka' }, ...clinic.packageTemplates.map((p) => ({ value: p.id, label: p.name }))]}
            onValueChange={(v) => onChange({ ...rule, templateId: v || null })}
          />
        </Field>
      );
      break;
    case 'package_expiring':
      params = (
        <Field label="Platnost končí do" hint="Jen permanentky, na kterých zbývají volné vstupy.">
          <NumberInput size="sm" min={1} max={365} value={rule.withinDays} suffix={days(rule.withinDays)} onChange={(n) => onChange({ ...rule, withinDays: n })} />
        </Field>
      );
      break;
    case 'has_upcoming_booking':
      params = (
        <Field label="Termín v příštích">
          <NumberInput size="sm" min={1} max={365} value={rule.withinDays} suffix={days(rule.withinDays)} onChange={(n) => onChange({ ...rule, withinDays: n })} />
        </Field>
      );
      break;
    case 'tag': {
      const options = tags.map((t) => ({ value: t.tag, label: `${t.tag} (${formatNumber(t.count)})` }));
      if (rule.tag && !tags.some((t) => t.tag === rule.tag)) options.unshift({ value: rule.tag, label: rule.tag });
      params = (
        <Field label="Štítek" hint={tags.length ? undefined : 'Klienti zatím nemají žádné štítky.'}>
          <Select size="sm" value={rule.tag} placeholder="Vyberte štítek" options={options} onValueChange={(v) => onChange({ ...rule, tag: v })} />
        </Field>
      );
      break;
    }
    case 'new_client':
      params = (
        <Field label="Registrace za posledních">
          <NumberInput size="sm" min={1} max={730} value={rule.withinDays} suffix={days(rule.withinDays)} onChange={(n) => onChange({ ...rule, withinDays: n })} />
        </Field>
      );
      break;
    case 'credit_balance_gt':
      params = (
        <Field label="Kredit vyšší než">
          <NumberInput size="sm" min={0} max={100000} step={100} value={rule.amount} suffix="Kč" onChange={(n) => onChange({ ...rule, amount: n })} />
        </Field>
      );
      break;
    default:
      params = null;
  }
  return (
    <div className="com-rule__fields">
      {typeField}
      <div className="com-rule__params">{params}</div>
    </div>
  );
}

interface RuleRowProps {
  clinic: ClinicState;
  rule: SegmentRule;
  count: number;
  list: RuleList;
  editing: boolean;
  editable: boolean;
  tags: { tag: string; count: number }[];
  onToggle: () => void;
  onChange: (rule: SegmentRule) => void;
  onRemove: () => void;
}

function RuleRow({ clinic, rule, count, list, editing, editable, tags, onToggle, onChange, onRemove }: RuleRowProps): JSX.Element {
  const text = ruleText(clinic, rule);
  const exclude = list === 'exclude';
  const fieldsId = useId();
  const countTitle = exclude
    ? `vyřadí ${countLabel(count, ['klienta', 'klienty', 'klientů'])}`
    : `samostatně splňuje ${countLabel(count, ['klient', 'klienti', 'klientů'])} se souhlasem`;
  return (
    <li className={cx('com-rule', exclude && 'com-rule--exclude', editing && 'is-editing')}>
      <div className="com-rule__summary">
        {editable ? (
          <button
            type="button"
            className="com-rule__main"
            aria-expanded={editing}
            aria-controls={editing ? fieldsId : undefined}
            title={editing ? 'Sbalit úpravu podmínky' : 'Upravit podmínku'}
            onClick={onToggle}
          >
            <Icon name={exclude ? 'x' : 'filter'} size={16} className="com-rule__icon" />
            <span className="com-rule__text">{text}</span>
            <span className="com-rule__count">
              <span aria-hidden="true">{exclude ? `−${formatNumber(count)}` : formatNumber(count)}</span>
              <span className="visually-hidden">, {countTitle}</span>
            </span>
            <Icon name={editing ? 'chevronUp' : 'chevronDown'} size={14} className="com-rule__chev" />
          </button>
        ) : (
          <span className="com-rule__main">
            <Icon name={exclude ? 'x' : 'filter'} size={16} className="com-rule__icon" />
            <span className="com-rule__text">{text}</span>
            <span className="com-rule__count" title={countTitle}>
              {exclude ? `−${formatNumber(count)}` : formatNumber(count)}
            </span>
          </span>
        )}
        {editable && <IconButton size="sm" icon="trash" label={`Odebrat podmínku ${text}`} onClick={onRemove} />}
      </div>
      {editing && (
        <div id={fieldsId}>
          <RuleFields clinic={clinic} rule={rule} onChange={onChange} tags={tags} />
        </div>
      )}
    </li>
  );
}

function AddRule({ label, onAdd }: { label: string; onAdd: (type: SegmentRule['type']) => void }): JSX.Element {
  return (
    <Menu
      align="start"
      label={label}
      trigger={
        <Button size="sm" variant="ghost" icon="plus" className="com-seg__add">
          {label}
        </Button>
      }
      items={RULE_TYPES.map((t) => ({ id: t.type, label: t.label, onSelect: () => onAdd(t.type) }))}
    />
  );
}

interface SegmentBuilderProps {
  clinic: ClinicState;
  segment: SegmentDefinition;
  /** Bez onChange je segment jen ke čtení. */
  onChange?: (segment: SegmentDefinition) => void;
  insight: SegmentInsight;
  onShowRecipients: () => void;
}

/** Výběr příjemců: souhlas → pravidla (všechna / kterékoli) → vyloučení, s živými počty. */
export function SegmentBuilder({ clinic, segment, onChange, insight, onShowRecipients }: SegmentBuilderProps): JSX.Element {
  const editable = !!onChange;
  const [editing, setEditing] = useState<{ list: RuleList; index: number } | null>(null);
  const tags = useMemo(() => tagStats(clinic), [clinic]);
  const { funnel } = insight;

  const setList = (list: RuleList, rules: SegmentRule[]): void => onChange?.({ ...segment, [list]: rules });
  const add = (list: RuleList, type: SegmentRule['type']): void => {
    setList(list, [...segment[list], defaultRule(clinic, type)]);
    setEditing({ list, index: segment[list].length });
  };
  const update = (list: RuleList, index: number, rule: SegmentRule): void =>
    setList(
      list,
      segment[list].map((r, i) => (i === index ? rule : r)),
    );
  const remove = (list: RuleList, index: number): void => {
    setList(
      list,
      segment[list].filter((_, i) => i !== index),
    );
    setEditing(null);
  };

  const renderRows = (list: RuleList, counts: number[]): JSX.Element | null =>
    segment[list].length ? (
      <ul className="com-seg__rules">
        {segment[list].map((rule, index) => (
          <RuleRow
            key={`${list}-${index}`}
            clinic={clinic}
            rule={rule}
            count={counts[index] ?? 0}
            list={list}
            editable={editable}
            editing={editing?.list === list && editing.index === index}
            tags={tags}
            onToggle={() => setEditing((e) => (e?.list === list && e.index === index ? null : { list, index }))}
            onChange={(r) => update(list, index, r)}
            onRemove={() => remove(list, index)}
          />
        ))}
      </ul>
    ) : null;

  const first = insight.recipients
    .slice(0, 5)
    .map((id) => getClient(clinic, id))
    .filter((c): c is Client => !!c);
  const rest = funnel.final - first.length;
  const pct = (n: number): string => `${funnel.consented ? Math.max(n ? 2 : 0, Math.round((n / funnel.consented) * 100)) : 0}%`;

  return (
    <Card padding="none" as="section" className="com-seg" aria-label="Příjemci">
      <CardHeader
        divided
        title="Příjemci"
        actions={
          <Button size="sm" variant="ghost" icon="users" onClick={onShowRecipients}>
            Seznam
          </Button>
        }
      />
      <div className="com-seg__body">
        <div className="com-seg__box">
          <div className="com-seg__base">
            <Icon name="shieldCheck" size={16} />
            <span className="com-seg__base-text">Souhlas s obchodními sděleními</span>
            <span className="com-seg__base-count">{formatNumber(funnel.consented)}</span>
          </div>

          <div className="com-seg__divider">
            <span>{segment.rules.length === 0 ? 'Bez dalších podmínek' : segment.match === 'all' ? 'A zároveň' : 'A alespoň jedno z'}</span>
            {editable && segment.rules.length >= 2 && (
              <Segmented
                size="sm"
                aria-label="Shoda podmínek"
                value={segment.match}
                onChange={(match) => onChange?.({ ...segment, match })}
                options={[
                  { value: 'all', label: 'Všechny' },
                  { value: 'any', label: 'Kterákoli' },
                ]}
              />
            )}
          </div>
          {renderRows('rules', insight.ruleCounts)}
          {editable && <AddRule label="Přidat podmínku" onAdd={(type) => add('rules', type)} />}

          {(editable || segment.exclude.length > 0) && (
            <>
              <div className="com-seg__divider com-seg__divider--exclude">
                <span>Vyloučit</span>
              </div>
              {renderRows('exclude', insight.excludeCounts)}
              {editable && <AddRule label="Vyloučit skupinu" onAdd={(type) => add('exclude', type)} />}
            </>
          )}

          <div className="com-seg__total" aria-live="polite">
            <span className="com-seg__total-num">{formatNumber(funnel.final)}</span>
            <span className="com-seg__total-label">{plural(funnel.final, ['příjemce', 'příjemci', 'příjemců'])}</span>
          </div>
        </div>

        <div className="com-funnel" role="group" aria-label="Trychtýř příjemců">
          {[
            { id: 'consent', label: 'Se souhlasem', value: funnel.consented },
            { id: 'matched', label: 'Po pravidlech', value: funnel.matched },
            { id: 'final', label: 'Po vyloučení', value: funnel.final },
          ].map((step) => (
            <div key={step.id} className={cx('com-funnel__step', `com-funnel__step--${step.id}`)}>
              <span className="com-funnel__label">{step.label}</span>
              <span className="com-funnel__track" aria-hidden="true">
                <span className="com-funnel__fill" style={cssVars({ '--w': pct(step.value) })} />
              </span>
              <span className="com-funnel__value">{formatNumber(step.value)}</span>
            </div>
          ))}
        </div>

        {first.length > 0 ? (
          <div className="com-firsts">
            <span className="com-firsts__label">První příjemci</span>
            <ul className="com-firsts__list">
              {first.map((c) => (
                <li key={c.id} className="com-firsts__item">
                  <Avatar initials={(c.firstName.charAt(0) + c.lastName.charAt(0)).toUpperCase()} size="xs" tone="slate" />
                  <span className="com-firsts__name">
                    {c.firstName} {c.lastName}
                  </span>
                  <span className="com-firsts__mail">{c.email}</span>
                </li>
              ))}
            </ul>
            {rest > 0 && (
              <button type="button" className="link com-firsts__more" onClick={onShowRecipients}>
                a {plural(rest, ['další', 'další', 'dalších'])} {formatNumber(rest)} – zobrazit všechny
              </button>
            )}
          </div>
        ) : (
          <p className="com-seg__empty">Segmentu teď neodpovídá nikdo se souhlasem. Uvolněte podmínky nebo odeberte vyloučení.</p>
        )}

        <p className="com-seg__note">
          <Icon name="shield" size={14} />
          <span>
            Bez souhlasu nebo e-mailu: {countLabel(insight.noConsent, ['klient', 'klienti', 'klientů'])} – kampaň jim nepřijde nikdy.
          </span>
        </p>
      </div>
    </Card>
  );
}
