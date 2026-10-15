import { useEffect, useMemo, useRef, useState } from 'react';
import type { Campaign, Id, LocalDateTime } from '../../domain/types';
import { saveCampaign, updateTemplate } from '../../engine/commands';
import { formatDate, formatDayShort, formatNumber, formatTime, plural } from '../../engine/format';
import { segmentFunnel } from '../../engine/segments';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { Button, Card, CardHeader, Dialog, EmptyState, Field, Icon, IconButton, Input, RadioCards, Switch } from '../../ui';
import { CampaignEditor } from './CampaignEditor';
import type { EditorMode } from './EmailCard';
import { CAMPAIGN_PRESETS, channelsLabel, emptyCampaign, formatWhen, isManualTemplate, recipientsLabel, templateTiming } from './lib';
import { CampaignStatusBadge, revealElement, type Device } from './shared';

/* ------------------------------------------------------------------ */
/* Seznam kampaní                                                      */
/* ------------------------------------------------------------------ */

function campaignMeta(c: Campaign, now: LocalDateTime): string {
  if (c.status === 'sent' && c.sentAt) {
    const day = c.sentAt.slice(0, 4) === now.slice(0, 4) ? formatDayShort(c.sentAt) : formatDate(c.sentAt);
    return `${day} · ${recipientsLabel(c.recipients)}`;
  }
  if (c.status === 'scheduled' && c.scheduledAt) return `${formatDayShort(c.scheduledAt)} v ${formatTime(c.scheduledAt)}`;
  return `upraveno ${formatWhen(c.updatedAt, now)}`;
}

const GROUPS: { id: Campaign['status']; label: string }[] = [
  { id: 'scheduled', label: 'Naplánované' },
  { id: 'draft', label: 'Koncepty' },
  { id: 'sent', label: 'Odeslané' },
];

export function sortCampaigns(list: readonly Campaign[]): Campaign[] {
  const rank: Record<Campaign['status'], number> = { scheduled: 0, draft: 1, sent: 2 };
  return [...list].sort((a, b) => {
    if (a.status !== b.status) return rank[a.status] - rank[b.status];
    if (a.status === 'sent') return (b.sentAt ?? '').localeCompare(a.sentAt ?? '');
    if (a.status === 'scheduled') return (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? '');
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

function CampaignList({
  campaigns,
  activeId,
  now,
  onSelect,
  onNew,
}: {
  campaigns: Campaign[];
  activeId: Id | null;
  now: LocalDateTime;
  onSelect: (id: Id) => void;
  onNew: () => void;
}): JSX.Element {
  return (
    <Card padding="none" as="section" className="com-clist" aria-label="Kampaně">
      <CardHeader
        divided
        title="Kampaně"
        meta={campaigns.length ? formatNumber(campaigns.length) : undefined}
        actions={<IconButton size="sm" icon="plus" label="Nová kampaň" onClick={onNew} />}
      />
      {campaigns.length === 0 ? (
        <EmptyState
          compact
          icon="mail"
          title="Zatím žádná kampaň"
          text="Koncepty, naplánované i odeslané kampaně se zobrazí tady."
        />
      ) : (
        GROUPS.map((g) => {
          const items = campaigns.filter((c) => c.status === g.id);
          if (!items.length) return null;
          return (
            <div key={g.id} className="com-clist__group">
              <h3 className="com-clist__label">
                {g.label}
                <span className="com-clist__count">{items.length}</span>
              </h3>
              <ul className="com-clist__items">
                {items.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="com-clist__item" aria-current={c.id === activeId ? 'true' : undefined} onClick={() => onSelect(c.id)}>
                      <span className="com-clist__name">{c.name || 'Kampaň bez názvu'}</span>
                      <span className="com-clist__meta">
                        <CampaignStatusBadge status={c.status} plain />
                        <span className="com-clist__when">{campaignMeta(c, now)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Automatické zprávy – rychlé přepínače                               */
/* ------------------------------------------------------------------ */

function AutomationCard({ onManage }: { onManage: () => void }): JSX.Element {
  const clinic = useClinic();
  const run = useCommand();
  // ručně posílané šablony (zápis ze sezení) nemají vypínač – mezi automatické nepatří
  const automatic = clinic.templates.filter((t) => !isManualTemplate(t.key));
  const enabled = automatic.filter((t) => t.enabled).length;
  return (
    <Card padding="none" as="section" className="com-auto" aria-label="Automatické zprávy">
      <CardHeader divided title="Automatické zprávy" meta={`${enabled} z ${automatic.length} zapnuto`} />
      <ul className="com-auto__list">
        {automatic.map((t) => (
          <li key={t.key} className="com-auto__item">
            <Switch
              checked={t.enabled}
              label={t.name}
              description={`${channelsLabel(t.channels)} · ${templateTiming(t, clinic)}`}
              onChange={(value) =>
                run(updateTemplate, { key: t.key, patch: { enabled: value } }, { success: `${t.name}: ${value ? 'zapnuto' : 'vypnuto'}` })
              }
            />
          </li>
        ))}
      </ul>
      <div className="com-auto__foot">
        <button type="button" className="link" onClick={onManage}>
          Upravit texty a kanály
          <Icon name="arrowRight" size={14} />
        </button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Nová kampaň                                                         */
/* ------------------------------------------------------------------ */

function NewCampaignDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: Id) => void }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const [preset, setPreset] = useState(CAMPAIGN_PRESETS[0].id);
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) {
      setPreset(CAMPAIGN_PRESETS[0].id);
      setName('');
    }
  }, [open]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    if (!open) return out;
    for (const p of CAMPAIGN_PRESETS) out[p.id] = segmentFunnel(clinic, p.build(clinic).segment, now).final;
    return out;
  }, [open, clinic, now]);

  const chosen = CAMPAIGN_PRESETS.find((p) => p.id === preset) ?? CAMPAIGN_PRESETS[0];

  const create = (): void => {
    const r = run(
      saveCampaign,
      { ...emptyCampaign(now), ...chosen.build(clinic), name: name.trim() || chosen.name },
      { success: 'Koncept kampaně vytvořen' },
    );
    if (r.ok) {
      onCreated(r.value);
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nová kampaň"
      description="Vyberte, od čeho začít. Obsah i příjemce potom libovolně upravíte."
      footer={
        <>
          <Button onClick={onClose}>Zpět</Button>
          <Button variant="primary" icon="plus" onClick={create}>
            Vytvořit koncept
          </Button>
        </>
      }
    >
      <form
        className="com-newform"
        onSubmit={(event) => {
          event.preventDefault();
          create();
        }}
      >
        <Field label="Název kampaně" optional hint="Jen pro vás – klienti ho neuvidí.">
          <Input value={name} placeholder={chosen.name} onValueChange={setName} data-autofocus="" />
        </Field>
        <RadioCards
          legend="Začít od"
          value={preset}
          onChange={setPreset}
          options={CAMPAIGN_PRESETS.map((p) => ({
            value: p.id,
            title: p.title,
            description: p.description,
            aside: (
              <span className="com-preset__count" title="Odhad příjemců podle dnešních dat">
                <strong className="tnum">{formatNumber(counts[p.id] ?? 0)}</strong>
                <span>{plural(counts[p.id] ?? 0, ['příjemce', 'příjemci', 'příjemců'])}</span>
              </span>
            ),
          }))}
        />
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Záložka Kampaně                                                     */
/* ------------------------------------------------------------------ */

interface CampaignsTabProps {
  selectedId: Id | null;
  onSelect: (id: Id | null) => void;
  newOpen: boolean;
  onNewOpenChange: (open: boolean) => void;
  onManageTemplates: () => void;
  onShowMessages: (campaignId: Id) => void;
}

export function CampaignsTab({ selectedId, onSelect, newOpen, onNewOpenChange, onManageTemplates, onShowMessages }: CampaignsTabProps): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const sorted = useMemo(() => sortCampaigns(clinic.campaigns), [clinic.campaigns]);
  const active = sorted.find((c) => c.id === selectedId) ?? sorted.find((c) => c.status !== 'sent') ?? sorted[0] ?? null;
  const [detail, setDetail] = useState(false);
  const [mode, setMode] = useState<EditorMode>('preview');
  const [device, setDevice] = useState<Device>('desktop');

  const wrapRef = useRef<HTMLDivElement>(null);
  /** Na telefonu (seznam a detail se střídají) posune stránku na začátek zobrazené části. */
  const reveal = (part: 'detail' | 'list'): void => {
    requestAnimationFrame(() => {
      const root = wrapRef.current;
      const list = root?.querySelector<HTMLElement>('.com-camp__list');
      if (!root || !list) return;
      const phone = getComputedStyle(part === 'detail' ? list : (root.querySelector<HTMLElement>('.com-camp__main') ?? list)).display === 'none';
      if (!phone) return;
      revealElement(part === 'detail' ? root.querySelector<HTMLElement>('.com-camp__head') : list, part === 'detail' ? 'start' : 'nearest');
    });
  };

  const select = (id: Id): void => {
    onSelect(id);
    setDetail(true);
    reveal('detail');
  };

  return (
    <div className="com-campwrap" ref={wrapRef}>
      <div className={detail ? 'com-camp is-detail' : 'com-camp'}>
        <div className="com-camp__list">
          <CampaignList campaigns={sorted} activeId={active?.id ?? null} now={now} onSelect={select} onNew={() => onNewOpenChange(true)} />
          <AutomationCard onManage={onManageTemplates} />
        </div>
        {active ? (
          <CampaignEditor
            key={active.id}
            campaign={active}
            mode={mode}
            onModeChange={setMode}
            device={device}
            onDeviceChange={setDevice}
            onBack={() => {
              setDetail(false);
              reveal('list');
            }}
            onSelect={(id) => {
              onSelect(id);
              setMode('edit');
            }}
            onDeleted={() => {
              onSelect(null);
              setDetail(false);
            }}
            onShowMessages={onShowMessages}
          />
        ) : (
          <div className="com-camp__main">
            <Card className="com-camp__empty">
              <EmptyState
                icon="mail"
                title="Newslettery jen pro klienty se souhlasem"
                text="Vytvořte kampaň, vyberte příjemce podle návštěv, permanentek nebo štítků a zkontrolujte náhled na počítači i v mobilu."
                action={
                  <Button variant="primary" icon="plus" onClick={() => onNewOpenChange(true)}>
                    Nová kampaň
                  </Button>
                }
              />
            </Card>
          </div>
        )}
      </div>
      <NewCampaignDialog
        open={newOpen}
        onClose={() => onNewOpenChange(false)}
        onCreated={(id) => {
          onSelect(id);
          setMode('edit');
          setDetail(true);
          reveal('detail');
        }}
      />
    </div>
  );
}
