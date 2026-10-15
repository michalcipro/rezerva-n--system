import { useMemo, useState } from 'react';
import type { Id, TemplateKey } from '../../domain/types';
import { countLabel, formatNumber } from '../../engine/format';
import { useClinic } from '../../store/hooks';
import { Button, PageHeader, TabPanel, Tabs } from '../../ui';
import { CampaignsTab } from './CampaignsTab';
import { DEFAULT_OUTBOX_FILTER, OutboxTab, type OutboxFilter } from './OutboxTab';
import { TemplatesTab, type TemplateDrafts } from './TemplatesTab';
import './comms.css';

type CommsTab = 'kampane' | 'automaticke' | 'odeslane';

const TAB_KEY = 'winningminds.comms.tab';
const TABS: readonly CommsTab[] = ['kampane', 'automaticke', 'odeslane'];

function readTab(): CommsTab {
  try {
    const v = sessionStorage.getItem(TAB_KEY);
    if (v && (TABS as readonly string[]).includes(v)) return v as CommsTab;
  } catch {
    /* úložiště nemusí být dostupné */
  }
  return 'kampane';
}

function storeTab(tab: CommsTab): void {
  try {
    sessionStorage.setItem(TAB_KEY, tab);
  } catch {
    /* ignorovat */
  }
}

/** Komunikace: newsletterové kampaně, automatické zprávy a odeslaná pošta. */
export function CommsScreen(): JSX.Element {
  const clinic = useClinic();
  const [tab, setTabState] = useState<CommsTab>(readTab);
  const [campaignId, setCampaignId] = useState<Id | null>(null);
  const [newCampaign, setNewCampaign] = useState(false);
  const [template, setTemplate] = useState<TemplateKey>('booking_confirmation');
  const [drafts, setDrafts] = useState<TemplateDrafts>({});
  const [outboxFilter, setOutboxFilter] = useState<OutboxFilter>(DEFAULT_OUTBOX_FILTER);
  const [compose, setCompose] = useState<{ open: boolean; clientId: Id | null }>({ open: false, clientId: null });

  const setTab = (next: CommsTab): void => {
    setTabState(next);
    storeTab(next);
  };

  const consented = useMemo(() => clinic.clients.filter((c) => c.consents.marketingEmail && c.email).length, [clinic.clients]);
  const enabled = clinic.templates.filter((t) => t.enabled).length;

  const actions =
    tab === 'kampane' ? (
      <Button variant="primary" icon="plus" onClick={() => setNewCampaign(true)}>
        Nová kampaň
      </Button>
    ) : tab === 'odeslane' ? (
      <Button variant="primary" icon="send" onClick={() => setCompose({ open: true, clientId: null })}>
        Napsat zprávu
      </Button>
    ) : undefined;

  return (
    <div className="page com-page">
      <PageHeader
        title="Komunikace"
        subtitle={
          <>
            {countLabel(consented, ['klient', 'klienti', 'klientů'])} se souhlasem s obchodními sděleními · {enabled} z {clinic.templates.length}{' '}
            automatických zpráv zapnuto · odesílání je v prototypu simulované
          </>
        }
        actions={actions}
      />

      <Tabs
        idPrefix="com"
        bordered
        aria-label="Komunikace"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'kampane', label: 'Kampaně', count: clinic.campaigns.length || undefined },
          { id: 'automaticke', label: 'Automatické zprávy', count: `${enabled}/${clinic.templates.length}` },
          { id: 'odeslane', label: 'Odeslané', count: formatNumber(clinic.messages.length) },
        ]}
      />

      <TabPanel idPrefix="com" id={tab} className="com-panel">
        {tab === 'kampane' && (
          <CampaignsTab
            selectedId={campaignId}
            onSelect={setCampaignId}
            newOpen={newCampaign}
            onNewOpenChange={setNewCampaign}
            onManageTemplates={() => setTab('automaticke')}
            onShowMessages={(id) => {
              setOutboxFilter({ ...DEFAULT_OUTBOX_FILTER, campaignId: id });
              setTab('odeslane');
            }}
          />
        )}
        {tab === 'automaticke' && (
          <TemplatesTab
            selected={template}
            onSelect={setTemplate}
            drafts={drafts}
            onDraftsChange={setDrafts}
            onShowMessages={(key) => {
              setOutboxFilter({ ...DEFAULT_OUTBOX_FILTER, kind: key });
              setTab('odeslane');
            }}
          />
        )}
        {tab === 'odeslane' && (
          <OutboxTab
            filter={outboxFilter}
            onFilterChange={setOutboxFilter}
            composeOpen={compose.open}
            composeClientId={compose.clientId}
            onCompose={(clientId) => setCompose({ open: true, clientId })}
            onComposeClose={() => setCompose({ open: false, clientId: null })}
            onOpenCampaign={(id) => {
              setCampaignId(id);
              setTab('kampane');
            }}
          />
        )}
      </TabPanel>
    </div>
  );
}
