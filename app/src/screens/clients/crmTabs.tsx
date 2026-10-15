import { useMemo, useState } from 'react';
import type { Client, Id, LocalDateTime } from '../../domain/types';
import { clientCrmStats, clientStage, daysInStage, filesOfClient, followUpsOfClient, notesOfClient, stageSince } from '../../engine/crm';
import { countLabel, formatDate, formatDayShort, formatMoney, formatNumber, formatRelative, formatTime } from '../../engine/format';
import { dateOf } from '../../engine/time';
import { FilesPanel, FollowUpDialog, FollowUpRow, NotesPanel, StageBadge, useStickyFollowUpGroups } from '../../components/crm';
import { useClinic } from '../../store/hooks';
import { Badge, Button, Callout, Card, CardHeader, EmptyState, Icon, cx, type IconName } from '../../ui';
import type { Permissions } from './parts';

/* ------------------------------------------------------------------ */
/* Poznámky                                                            */
/* ------------------------------------------------------------------ */

export function NotesTab({
  client,
  perms,
  focusNoteId,
  onOpenBooking,
  onGrantHealth,
}: {
  client: Client;
  perms: Permissions;
  focusNoteId: Id | null;
  onOpenBooking: (bookingId: Id) => void;
  onGrantHealth: () => void;
}): JSX.Element {
  const clinic = useClinic();
  if (!perms.clinical) {
    const n = notesOfClient(clinic, client.id).length;
    return (
      <Card>
        <EmptyState
          icon="lock"
          title="Poznámky ke klientovi vidí jen kouči a terapeuti"
          text={n ? `Klient má ${countLabel(n, ['záznam', 'záznamy', 'záznamů'])}. Obsah je důvěrný.` : 'Zápisy ze sezení a poznámky píšou a čtou kouči a terapeuti.'}
        />
      </Card>
    );
  }
  return (
    <div className="cli-stack">
      {!client.consents.health && (
        <Callout
          tone="warning"
          title="Chybí souhlas se zpracováním citlivých údajů"
          actions={
            <Button size="sm" variant="secondary" onClick={onGrantHealth}>
              Zaznamenat souhlas
            </Button>
          }
        >
          Před zápisem průběhu terapie nebo koučinku si nechte od klienta potvrdit souhlas se zdravotní dokumentací.
        </Callout>
      )}
      <NotesPanel clientId={client.id} onOpenBooking={onOpenBooking} focusNoteId={focusNoteId} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Soubory a fotky                                                     */
/* ------------------------------------------------------------------ */

export function FilesTab({ client, perms, onOpenNote }: { client: Client; perms: Permissions; onOpenNote: (noteId: Id) => void }): JSX.Element {
  const clinic = useClinic();
  if (!perms.clinical) {
    const n = filesOfClient(clinic, client.id).length;
    return (
      <Card>
        <EmptyState
          icon="lock"
          title="Soubory klienta vidí jen kouči a terapeuti"
          text={n ? `Klient má ${countLabel(n, ['soubor', 'soubory', 'souborů'])}. Nahrávky, přepisy a dokumenty jsou důvěrné.` : 'Nahrávky, přepisy a dokumenty ukládají kouči a terapeuti.'}
        />
      </Card>
    );
  }
  return <FilesPanel clientId={client.id} onOpenNote={onOpenNote} />;
}

/* ------------------------------------------------------------------ */
/* Follow-upy                                                          */
/* ------------------------------------------------------------------ */

export function FollowUpsTab({ client, now }: { client: Client; now: LocalDateTime }): JSX.Element {
  const clinic = useClinic();
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const all = followUpsOfClient(clinic, client.id);
  const groups = useMemo(() => ({ open: all.filter((f) => !f.done), done: all.filter((f) => f.done) }), [all]);
  const { open, done } = groups;
  // Odškrtnutý úkol zůstane do odchodu z karty v seznamu, kde byl (fokus se neztratí, překlep jde vrátit).
  const shown = useStickyFollowUpGroups(groups, 'done');
  const today = dateOf(now);
  const overdue = open.filter((f) => f.due < today).length;

  const add = (
    <Button size="sm" variant="primary" icon="plus" onClick={() => setAdding(true)}>
      Přidat follow-up
    </Button>
  );

  return (
    <Card padding="none" as="section" aria-label="Follow-upy klienta" className="cli-fucard">
      <CardHeader
        divided
        title="Follow-upy"
        meta={
          all.length
            ? [countLabel(open.length, ['otevřený', 'otevřené', 'otevřených']), done.length ? countLabel(done.length, ['hotový', 'hotové', 'hotových']) : null]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
        actions={all.length ? add : undefined}
      />
      {all.length === 0 ? (
        <EmptyState
          icon="clock"
          title="Žádné follow-upy"
          text="Follow-up je úkol s termínem – třeba zavolat po freetalku nebo poslat klientovi materiály. Úkoly po termínu uvidíte i v přehledu."
          action={
            <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
              Přidat follow-up
            </Button>
          }
        />
      ) : (
        <>
          <section className="cli-fu" aria-labelledby={`cli-fu-open-${client.id}`}>
            <h3 className="cli-fu__head" id={`cli-fu-open-${client.id}`}>
              Otevřené ({open.length})
              {overdue > 0 && (
                <Badge tone="danger" size="sm" dot="square">
                  {countLabel(overdue, ['po termínu', 'po termínu', 'po termínu'])}
                </Badge>
              )}
            </h3>
            {shown.open.length ? (
              <ul className="cli-fu__list">
                {shown.open.map((f) => (
                  <FollowUpRow key={f.id} followUp={f} as="li" />
                ))}
              </ul>
            ) : (
              <p className="cli-fu__empty">
                <Icon name="checkCircle" size={16} /> Všechno je hotové. Další krok přidáte tlačítkem Přidat follow-up.
              </p>
            )}
          </section>
          {shown.done.length > 0 && (
            <section className="cli-fu cli-fu--done" aria-label="Hotové follow-upy">
              <button type="button" className="cli-fu__toggle" aria-expanded={showDone} onClick={() => setShowDone((x) => !x)}>
                <Icon name={showDone ? 'chevronDown' : 'chevronRight'} size={14} />
                Hotové ({done.length})
              </button>
              {showDone && (
                <ul className="cli-fu__list">
                  {shown.done.map((f) => (
                    <FollowUpRow key={f.id} followUp={f} as="li" />
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
      <FollowUpDialog open={adding} onClose={() => setAdding(false)} clientId={client.id} />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Přehled: karta spolupráce (CRM statistiky)                          */
/* ------------------------------------------------------------------ */

type CrmTab = 'poznamky' | 'soubory' | 'followupy' | 'rezervace';

export function CrmCard({
  client,
  now,
  finance,
  onGo,
}: {
  client: Client;
  now: LocalDateTime;
  finance: boolean;
  onGo: (tab: CrmTab) => void;
}): JSX.Element {
  const clinic = useClinic();
  const stats = useMemo(() => clientCrmStats(clinic, client.id, now), [clinic, client.id, now]);
  const stage = clientStage(clinic, client);
  const days = daysInStage(client, now);
  const since = stats.stageSince ?? stageSince(client);
  const year = (dt: string): string => (dt.slice(0, 4) !== now.slice(0, 4) ? ' ' + dt.slice(0, 4) : '');

  const items: { term: string; value: string; sub?: string; tone?: 'muted' }[] = [
    { term: 'Proběhlá sezení', value: formatNumber(stats.completedSessions) },
    { term: 'Naplánovaná', value: formatNumber(stats.upcomingSessions) },
    ...(finance ? [{ term: 'Tržby', value: formatMoney(stats.revenueCzk) }] : []),
    {
      term: 'První sezení',
      value: stats.firstSessionAt ? formatDate(stats.firstSessionAt) : 'zatím žádné',
      tone: stats.firstSessionAt ? undefined : 'muted',
    },
    {
      term: 'Poslední sezení',
      value: stats.lastSessionAt ? formatDayShort(stats.lastSessionAt) + year(stats.lastSessionAt) : 'zatím žádné',
      sub: stats.lastSessionAt ? formatRelative(stats.lastSessionAt, now) : undefined,
      tone: stats.lastSessionAt ? undefined : 'muted',
    },
    {
      term: 'Příští sezení',
      value: stats.nextSessionAt ? `${formatDayShort(stats.nextSessionAt)}${year(stats.nextSessionAt)} ${formatTime(stats.nextSessionAt)}` : 'nenaplánováno',
      sub: stats.nextSessionAt ? formatRelative(stats.nextSessionAt, now) : undefined,
      tone: stats.nextSessionAt ? undefined : 'muted',
    },
  ];

  const links: { tab: CrmTab; icon: IconName; text: string; alert?: string }[] = [
    { tab: 'poznamky', icon: 'edit', text: stats.notesCount ? countLabel(stats.notesCount, ['poznámka', 'poznámky', 'poznámek']) : 'Bez poznámek' },
    { tab: 'soubory', icon: 'layers', text: stats.filesCount ? countLabel(stats.filesCount, ['soubor', 'soubory', 'souborů']) : 'Bez souborů' },
    {
      tab: 'followupy',
      icon: 'clock',
      text: stats.openFollowUps
        ? countLabel(stats.openFollowUps, ['otevřený follow-up', 'otevřené follow-upy', 'otevřených follow-upů'])
        : 'Žádný otevřený follow-up',
      alert: stats.overdueFollowUps ? `${stats.overdueFollowUps} po termínu` : undefined,
    },
  ];

  return (
    <Card padding="none" as="section" aria-label="Spolupráce s klientem" className="cli-crm">
      <CardHeader divided title="Spolupráce" />
      <div className="cli-crm__stage">
        <StageBadge stageId={stage.id} size="md" />
        <span className="cli-crm__since tnum">
          {days === 0 ? 've fázi od dneška' : `${countLabel(days, ['den', 'dny', 'dní'])} ve fázi · od ${formatDate(since)}`}
        </span>
      </div>
      <dl className="cli-crm__grid">
        {items.map((it) => (
          <div key={it.term} className="cli-crm__item">
            <dt className="cli-eyebrow">{it.term}</dt>
            <dd className={cx('cli-crm__value tnum', it.tone === 'muted' && 'cli-crm__value--muted')}>
              {it.value}
              {it.sub && <span className="cli-cell-sub">{it.sub}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <div className="cli-crm__links">
        {links.map((l) => (
          <button key={l.tab} type="button" className={cx('cli-crm__link', l.alert && 'cli-crm__link--alert')} onClick={() => onGo(l.tab)}>
            <Icon name={l.icon} size={14} />
            <span>{l.text}</span>
            {l.alert && (
              <Badge tone="danger" size="sm" dot="square">
                {l.alert}
              </Badge>
            )}
            <Icon name="chevronRight" size={14} className="cli-crm__chev" />
          </button>
        ))}
      </div>
    </Card>
  );
}
