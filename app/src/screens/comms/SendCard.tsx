import { useMemo, useState } from 'react';
import type { Campaign, ClinicState, LocalDateTime, SegmentRule } from '../../domain/types';
import { countLabel, formatDateLong, formatDayShort, formatNumber, formatRelative, formatTime, plural } from '../../engine/format';
import { describeRule } from '../../engine/segments';
import { scheduleCampaign, sendCampaign } from '../../engine/commands';
import { addDays, combine, dateOf, isValidLocalDateTime, timeOf } from '../../engine/time';
import { useCommand } from '../../store/hooks';
import { Button, Callout, Card, CardHeader, ConfirmDialog, cx, Field, Icon, Input, Segmented } from '../../ui';
import { campaignChecks, recipientsLabel, type CheckItem } from './lib';
import type { CampaignDraft } from './CampaignEditor';

const dative = (n: number): string => countLabel(n, ['příjemci', 'příjemcům', 'příjemcům']);

export function SimulationNote({ compact }: { compact?: boolean }): JSX.Element {
  return (
    <Callout tone="neutral" icon="info" className={cx('com-sim', compact && 'com-sim--compact')}>
      <strong>Simulace odesílání.</strong> V tomto prototypu se e-maily reálně neodesílají – zprávy se jen uloží do Odeslaných. V ostrém
      provozu je doručí napojená e-mailová služba.
    </Callout>
  );
}

function Checklist({ items }: { items: CheckItem[] }): JSX.Element {
  return (
    <ul className="com-checks" aria-label="Kontrola před odesláním">
      {items.map((c) => (
        <li key={c.id} className={cx('com-check', `com-check--${c.state}`)}>
          <Icon
            name={c.state === 'ok' ? 'checkCircle' : c.state === 'warn' ? 'alert' : 'xCircle'}
            size={16}
            title={c.state === 'ok' ? 'Splněno' : c.state === 'warn' ? 'Doporučení' : 'Chybí'}
          />
          <span className="com-check__text">
            <span className="com-check__label">{c.label}</span>
            {c.hint && <span className="com-check__hint">{c.hint}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface SendCardProps {
  campaign: Campaign;
  draft: CampaignDraft;
  recipients: number;
  now: LocalDateTime;
  /** Uloží koncept (bez prázdných bloků) těsně před odesláním. */
  prepare: () => boolean;
}

/** Pravý sloupec dole: odeslat teď / naplánovat, kontrolní seznam, potvrzení. */
export function SendCard({ campaign, draft, recipients, now, prepare }: SendCardProps): JSX.Element {
  const run = useCommand();
  const scheduled = campaign.status === 'scheduled' && campaign.scheduledAt;
  const initial = campaign.scheduledAt ?? combine(addDays(dateOf(now), 1), '08:30');
  const [when, setWhen] = useState<'now' | 'later'>(scheduled ? 'later' : 'now');
  const [date, setDate] = useState(dateOf(initial));
  const [time, setTime] = useState(timeOf(initial));
  const [reschedule, setReschedule] = useState(false);
  const [confirm, setConfirm] = useState<'send' | 'schedule' | null>(null);

  const checks = useMemo(
    () => campaignChecks({ subject: draft.subject, preheader: draft.preheader, blocks: draft.blocks }, recipients),
    [draft.subject, draft.preheader, draft.blocks, recipients],
  );
  const errors = checks.filter((c) => c.state === 'error');
  const warnings = checks.filter((c) => c.state === 'warn');
  const at = combine(date, time);
  const atValid = isValidLocalDateTime(at) && at > now;
  const nameMissing = !draft.name.trim();
  const blocked = errors.length > 0 || nameMissing;
  const showPicker = !scheduled || reschedule;

  const doSend = (): void => {
    if (!prepare()) throw new Error('Koncept se nepodařilo uložit.');
    const r = run(sendCampaign, { campaignId: campaign.id }, { success: 'Kampaň odeslána' });
    if (!r.ok) throw new Error(r.error);
  };
  const doSchedule = (): void => {
    if (!prepare()) throw new Error('Koncept se nepodařilo uložit.');
    const r = run(scheduleCampaign, { campaignId: campaign.id, at }, { success: `Kampaň naplánována na ${formatDayShort(at)} ${formatTime(at)}` });
    if (!r.ok) throw new Error(r.error);
    setReschedule(false);
  };
  const unschedule = (): void => {
    const r = run(scheduleCampaign, { campaignId: campaign.id, at: null }, { success: 'Plánované odeslání zrušeno, kampaň je znovu koncept' });
    if (r.ok) {
      setWhen('now');
      setReschedule(false);
    }
  };

  return (
    <Card padding="none" as="section" className="com-send" aria-label="Odeslání">
      <CardHeader divided title="Odeslání" />
      <div className="com-send__body">
        {scheduled && !reschedule && campaign.scheduledAt && (
          <Callout tone="info" icon="clock" title="Naplánováno">
            Odešle se <strong>{formatDateLong(campaign.scheduledAt)} v {formatTime(campaign.scheduledAt)}</strong> ({formatRelative(campaign.scheduledAt, now)}).
            Příjemce systém vybere až v okamžiku odeslání – teď by to bylo {recipientsLabel(recipients)}.
            <span className="com-send__tip">Tip: posuňte testovací hodiny v horním panelu a kampaň se odešle sama.</span>
          </Callout>
        )}

        {showPicker && (
          <>
            {!scheduled && (
              <Segmented
                full
                aria-label="Kdy odeslat"
                value={when}
                onChange={setWhen}
                options={[
                  { value: 'now', label: 'Odeslat hned', icon: 'send' },
                  { value: 'later', label: 'Naplánovat', icon: 'clock' },
                ]}
              />
            )}
            {(when === 'later' || reschedule) && (
              <div className="com-send__when">
                <Field label="Datum" error={!atValid ? 'Zvolte čas v budoucnosti.' : undefined}>
                  <Input type="date" size="sm" value={date} min={dateOf(now)} onValueChange={setDate} />
                </Field>
                <Field label="Čas">
                  <Input type="time" size="sm" step={300} value={time} onValueChange={setTime} />
                </Field>
              </div>
            )}
          </>
        )}

        <Checklist items={checks} />
        <SimulationNote compact />

        <div className="com-send__actions">
          {scheduled && !reschedule ? (
            <>
              <Button variant="primary" icon="send" full disabled={blocked} onClick={() => setConfirm('send')}>
                Odeslat hned
              </Button>
              <div className="com-send__row">
                <Button icon="clock" onClick={() => setReschedule(true)}>
                  Změnit čas
                </Button>
                <Button variant="danger-secondary" onClick={unschedule}>
                  Zrušit plán
                </Button>
              </div>
            </>
          ) : when === 'later' || reschedule ? (
            <>
              <Button variant="primary" icon="clock" full disabled={blocked || !atValid} onClick={() => setConfirm('schedule')}>
                {atValid ? `Naplánovat na ${formatDayShort(at)} ${formatTime(at)}` : 'Naplánovat odeslání'}
              </Button>
              {reschedule && (
                <Button variant="ghost" full onClick={() => setReschedule(false)}>
                  Ponechat původní čas
                </Button>
              )}
            </>
          ) : (
            <Button variant="primary" icon="send" full disabled={blocked} onClick={() => setConfirm('send')}>
              {recipients > 0 ? `Odeslat ${dative(recipients)}` : 'Odeslat kampaň'}
            </Button>
          )}
          {blocked && (
            <p className="com-send__blocked">
              Před odesláním: {[...(nameMissing ? ['Doplňte název kampaně.'] : []), ...errors.map((e) => e.hint ?? e.label)].join(' ')}
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'send'}
        onClose={() => setConfirm(null)}
        title="Odeslat kampaň teď?"
        message={
          <>
            E-mail <strong>„{draft.subject.trim()}“</strong> dostane <strong>{recipientsLabel(recipients)}</strong> se souhlasem s obchodními
            sděleními. Odeslání nelze vrátit.
          </>
        }
        confirmLabel={`Odeslat ${dative(recipients)}`}
        onConfirm={doSend}
      >
        <div className="com-confirm">
          {warnings.length > 0 && (
            <Callout tone="warning" title="Doporučení">
              {warnings.map((w) => w.hint ?? w.label).join(' ')}
            </Callout>
          )}
          <SimulationNote compact />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === 'schedule'}
        onClose={() => setConfirm(null)}
        title="Naplánovat odeslání?"
        message={
          <>
            Kampaň <strong>„{draft.name.trim()}“</strong> se odešle{' '}
            <strong>
              {formatDateLong(at)} v {formatTime(at)}
            </strong>
            . Příjemce systém vybere v okamžiku odeslání – teď segmentu odpovídá {recipientsLabel(recipients)}.
          </>
        }
        confirmLabel="Naplánovat"
        onConfirm={doSchedule}
      >
        <div className="com-confirm">
          {warnings.length > 0 && (
            <Callout tone="warning" title="Doporučení">
              {warnings.map((w) => w.hint ?? w.label).join(' ')}
            </Callout>
          )}
          <SimulationNote compact />
        </div>
      </ConfirmDialog>
    </Card>
  );
}

function RuleLines({ clinic, rules, exclude }: { clinic: ClinicState; rules: SegmentRule[]; exclude?: boolean }): JSX.Element | null {
  if (!rules.length) return null;
  return (
    <ul className={cx('com-sentrules', exclude && 'com-sentrules--exclude')}>
      {rules.map((r, i) => (
        <li key={i}>
          <Icon name={exclude ? 'x' : 'filter'} size={14} />
          {describeRule(clinic, r)}
        </li>
      ))}
    </ul>
  );
}

interface SentCardProps {
  clinic: ClinicState;
  campaign: Campaign;
  messageCount: number;
  onShowMessages: () => void;
  onDuplicate: () => void;
}

/** Souhrn odeslané kampaně (místo nastavení odeslání). */
export function SentCard({ clinic, campaign, messageCount, onShowMessages, onDuplicate }: SentCardProps): JSX.Element {
  const seg = campaign.segment;
  return (
    <Card padding="none" as="section" className="com-send" aria-label="Odeslaná kampaň">
      <CardHeader divided title="Odesláno" />
      <div className="com-send__body">
        <div className="com-sent__big">
          <span className="com-sent__num">{formatNumber(campaign.recipients)}</span>
          <span className="com-sent__label">
            {plural(campaign.recipients, ['příjemce', 'příjemci', 'příjemců'])}
            {campaign.sentAt && (
              <>
                {' · '}
                {formatDateLong(campaign.sentAt)} v {formatTime(campaign.sentAt)}
              </>
            )}
          </span>
        </div>
        <div className="com-sent__target">
          <span className="com-sent__eyebrow">Cílení</span>
          <p className="com-sent__line">
            <Icon name="shieldCheck" size={14} /> Klienti se souhlasem s obchodními sděleními
          </p>
          {seg.rules.length > 1 && <p className="com-sent__match">{seg.match === 'all' ? 'a zároveň všechny podmínky:' : 'a alespoň jedna z podmínek:'}</p>}
          <RuleLines clinic={clinic} rules={seg.rules} />
          {seg.exclude.length > 0 && <p className="com-sent__match">vyloučeno:</p>}
          <RuleLines clinic={clinic} rules={seg.exclude} exclude />
        </div>
        <Callout tone="neutral" icon="chart">
          Otevření a prokliky uvidíte po napojení e-mailové služby. V prototypu se e-maily jen zapisují do Odeslaných.
        </Callout>
        <div className="com-send__actions">
          <Button icon="mail" full onClick={onShowMessages} disabled={messageCount === 0}>
            {messageCount > 0 ? `Zobrazit v Odeslaných (${formatNumber(messageCount)})` : 'Zprávy už nejsou v historii'}
          </Button>
          <Button variant="ghost" icon="copy" full onClick={onDuplicate}>
            Duplikovat jako nový koncept
          </Button>
        </div>
      </div>
    </Card>
  );
}
