import { useEffect, useMemo, useRef, useState } from 'react';
import type { Campaign, CampaignBlock, Id, SegmentDefinition } from '../../domain/types';
import { deleteCampaign, saveCampaign } from '../../engine/commands';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { Button, Card, CardHeader, ConfirmDialog, Field, IconButton, Input, Menu, type MenuEntry } from '../../ui';
import { newBlockKey, type BlockList } from './BlockEditor';
import { EmailCard, type EditorMode } from './EmailCard';
import { cleanBlocks, formatWhen, insertAt, segmentInsight } from './lib';
import { RecipientsDrawer } from './RecipientsDrawer';
import { SegmentBuilder } from './SegmentBuilder';
import { SendCard, SentCard } from './SendCard';
import { CampaignStatusBadge, focusCaret, type Device } from './shared';

export interface CampaignDraft {
  name: string;
  subject: string;
  preheader: string;
  blocks: CampaignBlock[];
  keys: string[];
  segment: SegmentDefinition;
}

const toDraft = (c: Campaign): CampaignDraft => ({
  name: c.name,
  subject: c.subject,
  preheader: c.preheader,
  blocks: c.blocks,
  keys: c.blocks.map(() => newBlockKey()),
  segment: c.segment,
});

const AUTOSAVE_MS = 900;
const SUBJECT_IDEAL = 60;
const PREHEADER_IDEAL = 90;

interface CampaignEditorProps {
  campaign: Campaign;
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  device: Device;
  onDeviceChange: (device: Device) => void;
  onBack: () => void;
  onSelect: (id: Id) => void;
  onDeleted: () => void;
  onShowMessages: (campaignId: Id) => void;
}

/**
 * Jedna kampaň: hlavička, náhled / úprava obsahu, nastavení, příjemci a odeslání.
 * Rozpracovaný koncept se průběžně ukládá (bez tlačítka „Uložit“).
 */
export function CampaignEditor({
  campaign,
  mode,
  onModeChange,
  device,
  onDeviceChange,
  onBack,
  onSelect,
  onDeleted,
  onShowMessages,
}: CampaignEditorProps): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const readOnly = campaign.status === 'sent';

  const [draft, setDraft] = useState<CampaignDraft>(() => toDraft(campaign));
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showRecipients, setShowRecipients] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const storedRef = useRef(campaign);
  storedRef.current = campaign;
  const dirtyRef = useRef(false);

  const change = (update: (d: CampaignDraft) => CampaignDraft): void => {
    if (storedRef.current.status === 'sent') return;
    setDraft(update);
    dirtyRef.current = true;
    setDirty(true);
  };

  /** Uloží koncept do stavu kliniky. `forSend` navíc vynechá prázdné bloky. */
  const persist = (forSend = false): boolean => {
    const stored = storedRef.current;
    const d = draftRef.current;
    if (stored.status === 'sent') {
      dirtyRef.current = false;
      return false;
    }
    if (!dirtyRef.current && !forSend) return true;
    if (!d.name.trim()) return false;
    const blocks = forSend ? cleanBlocks(d.blocks) : d.blocks;
    const r = run(
      saveCampaign,
      { ...stored, name: d.name.trim(), subject: d.subject.trim(), preheader: d.preheader.trim(), blocks, segment: d.segment },
      { quiet: true },
    );
    if (r.ok) {
      dirtyRef.current = false;
      setDirty(false);
      if (forSend && blocks.length !== d.blocks.length) setDraft((cur) => ({ ...cur, blocks, keys: blocks.map(() => newBlockKey()) }));
    }
    return r.ok;
  };
  const persistRef = useRef(persist);
  persistRef.current = persist;

  // průběžné ukládání po krátké pauze v psaní
  useEffect(() => {
    if (!dirty) return undefined;
    const t = window.setTimeout(() => persistRef.current(), AUTOSAVE_MS);
    return () => window.clearTimeout(t);
  }, [draft, dirty]);

  // při odchodu z kampaně (jiná kampaň, jiná obrazovka) uložit rozepsané
  useEffect(() => () => void persistRef.current(), []);

  // Segment se přepočítá jen při změně dat, která ho ovlivňují – ne po každém uložení konceptu
  // (Immer zachovává identitu nezměněných polí).
  const insight = useMemo(
    () => segmentInsight(clinic, draft.segment, now),
    [clinic.clients, clinic.bookings, clinic.packages, clinic.ledger, clinic.makeups, clinic.categories, clinic.packageTemplates, draft.segment, now],
  );

  const messageCount = useMemo(
    () => (readOnly ? clinic.messages.filter((m) => m.campaignId === campaign.id).length : 0),
    [readOnly, clinic.messages, campaign.id],
  );

  const blockList: BlockList = { blocks: draft.blocks, keys: draft.keys };
  const setBlocks = (update: (prev: BlockList) => BlockList): void =>
    change((d) => {
      const next = update({ blocks: d.blocks, keys: d.keys });
      return { ...d, blocks: next.blocks, keys: next.keys };
    });

  const duplicate = (): void => {
    persist();
    const src = readOnly ? campaign : { ...campaign, ...draft };
    const r = run(
      saveCampaign,
      {
        ...campaign,
        id: '',
        name: `${src.name.trim() || 'Kampaň'} (kopie)`,
        subject: src.subject,
        preheader: src.preheader,
        blocks: src.blocks,
        segment: src.segment,
        status: 'draft',
        scheduledAt: null,
        sentAt: null,
        recipients: 0,
        createdAt: now,
      },
      { success: 'Vytvořen nový koncept z kopie' },
    );
    if (r.ok) onSelect(r.value);
  };

  const insertNameIntoSubject = (): void => {
    const el = subjectRef.current;
    const value = draft.subject;
    const focused = el !== null && document.activeElement === el;
    const start = focused ? (el.selectionStart ?? value.length) : value.length;
    const end = focused ? (el.selectionEnd ?? value.length) : value.length;
    const res = insertAt(value, start, end, '[jméno]');
    change((d) => ({ ...d, subject: res.value }));
    focusCaret(el, res.caret);
  };

  const nameMissing = !draft.name.trim();
  const saveLabel = readOnly ? null : nameMissing ? 'Neuloženo – doplňte název' : dirty ? 'Ukládám…' : `Uloženo ${formatWhen(campaign.updatedAt, now)}`;

  const menuItems: MenuEntry[] = [{ id: 'dup', label: 'Duplikovat', icon: 'copy', onSelect: duplicate }];
  if (!readOnly) {
    menuItems.push({ type: 'separator', id: 'sep' }, { id: 'del', label: 'Smazat kampaň', icon: 'trash', danger: true, onSelect: () => setConfirmDelete(true) });
  }

  return (
    <>
      <div className="com-camp__head">
        <Button variant="ghost" size="sm" icon="arrowLeft" className="com-camp__back" onClick={onBack}>
          Kampaně
        </Button>
        <div className="com-head">
          <div className="com-head__titles">
            <h2 className="com-head__title">{draft.name.trim() || 'Kampaň bez názvu'}</h2>
            <div className="com-head__meta">
              <CampaignStatusBadge status={campaign.status} />
              {saveLabel && <span className={nameMissing ? 'com-head__save is-error' : 'com-head__save'}>{saveLabel}</span>}
              {readOnly && campaign.sentAt && <span className="com-head__save">odesláno {formatWhen(campaign.sentAt, now)}</span>}
            </div>
          </div>
          <Menu label="Akce s kampaní" trigger={<IconButton icon="more" variant="outline" label="Další akce s kampaní" />} items={menuItems} />
        </div>
      </div>

      <div className="com-camp__main">
        <EmailCard
          clinic={clinic}
          subject={draft.subject}
          preheader={draft.preheader}
          value={blockList}
          onBlocksChange={setBlocks}
          readOnly={readOnly}
          mode={mode}
          onModeChange={onModeChange}
          device={device}
          onDeviceChange={onDeviceChange}
          recipients={insight.recipients}
        />
      </div>

      <div className="com-camp__aside">
        <Card padding="none" as="section" className="com-settings" aria-label="Nastavení kampaně">
          <CardHeader divided title="Nastavení kampaně" />
          <div className="com-settings__body">
            {readOnly ? (
              <dl className="com-readonly">
                <div>
                  <dt>Název</dt>
                  <dd>{campaign.name}</dd>
                </div>
                <div>
                  <dt>Předmět</dt>
                  <dd>{campaign.subject}</dd>
                </div>
                <div>
                  <dt>Náhledový text</dt>
                  <dd>{campaign.preheader || '—'}</dd>
                </div>
                <div>
                  <dt>Odesílatel</dt>
                  <dd>
                    {clinic.settings.senderName} &lt;{clinic.settings.senderEmail}&gt;
                  </dd>
                </div>
              </dl>
            ) : (
              <>
                <Field label="Název kampaně" hint="Vidíte ho jen vy, klienti ne." error={nameMissing ? 'Zadejte název – bez něj se kampaň neuloží.' : undefined}>
                  <Input value={draft.name} placeholder="např. Listopadový newsletter" onValueChange={(name) => change((d) => ({ ...d, name }))} />
                </Field>
                <div className="com-field">
                  <div className="com-field__head">
                    <label className="field__label" htmlFor="com-subject">
                      Předmět
                    </label>
                    <button type="button" className="com-chip-btn" onMouseDown={(e) => e.preventDefault()} onClick={insertNameIntoSubject}>
                      + [jméno]
                    </button>
                  </div>
                  <Input
                    id="com-subject"
                    ref={subjectRef}
                    value={draft.subject}
                    placeholder="Co klienta zaujme v doručené poště?"
                    aria-describedby="com-subject-hint"
                    onValueChange={(subject) => change((d) => ({ ...d, subject }))}
                  />
                  <span id="com-subject-hint" className={draft.subject.length > SUBJECT_IDEAL ? 'field__hint com-count is-over' : 'field__hint com-count'}>
                    <span>{draft.subject.length > SUBJECT_IDEAL ? 'Delší předmět se v mobilu zkrátí.' : 'Oslovení [jméno] se nahradí křestním jménem.'}</span>
                    <span className="tnum">
                      {draft.subject.length}/{SUBJECT_IDEAL}
                    </span>
                  </span>
                </div>
                <div className="com-field">
                  <label className="field__label" htmlFor="com-preheader">
                    Náhledový text
                  </label>
                  <Input
                    id="com-preheader"
                    value={draft.preheader}
                    placeholder="Krátké shrnutí za předmětem"
                    aria-describedby="com-preheader-hint"
                    onValueChange={(preheader) => change((d) => ({ ...d, preheader }))}
                  />
                  <span id="com-preheader-hint" className={draft.preheader.length > PREHEADER_IDEAL ? 'field__hint com-count is-over' : 'field__hint com-count'}>
                    <span>Zobrazí se v doručené poště za předmětem.</span>
                    <span className="tnum">
                      {draft.preheader.length}/{PREHEADER_IDEAL}
                    </span>
                  </span>
                </div>
                <div className="com-sender">
                  <span className="field__label">Odesílatel</span>
                  <span className="com-sender__value">
                    {clinic.settings.senderName} <span className="com-sender__mail">&lt;{clinic.settings.senderEmail}&gt;</span>
                  </span>
                  <span className="field__hint">Mění se v Nastavení v sekci Klinika.</span>
                </div>
              </>
            )}
          </div>
        </Card>

        {readOnly ? (
          <SentCard
            clinic={clinic}
            campaign={campaign}
            messageCount={messageCount}
            onShowMessages={() => onShowMessages(campaign.id)}
            onDuplicate={duplicate}
          />
        ) : (
          <>
            <SegmentBuilder
              clinic={clinic}
              segment={draft.segment}
              onChange={(segment) => change((d) => ({ ...d, segment }))}
              insight={insight}
              onShowRecipients={() => setShowRecipients(true)}
            />
            <SendCard campaign={campaign} draft={draft} recipients={insight.funnel.final} now={now} prepare={() => persist(true)} />
          </>
        )}
      </div>

      <RecipientsDrawer open={showRecipients} onClose={() => setShowRecipients(false)} segment={draft.segment} campaignName={draft.name.trim() || 'Kampaň'} />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        tone="danger"
        title="Smazat kampaň?"
        message={
          <>
            Koncept <strong>„{draft.name.trim() || 'Kampaň bez názvu'}“</strong> se nenávratně smaže
            {campaign.status === 'scheduled' ? ' a naplánované odeslání se zruší' : ''}.
          </>
        }
        confirmLabel="Smazat kampaň"
        onConfirm={() => {
          dirtyRef.current = false;
          const r = run(deleteCampaign, { campaignId: campaign.id }, { success: 'Kampaň smazána' });
          if (!r.ok) throw new Error(r.error);
          onDeleted();
        }}
      />
    </>
  );
}
