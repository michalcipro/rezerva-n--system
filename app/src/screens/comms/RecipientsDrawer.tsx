import { useEffect, useMemo, useState } from 'react';
import type { Client, Id, SegmentDefinition } from '../../domain/types';
import { formatNumber } from '../../engine/format';
import { getClient } from '../../engine/selectors';
import { useClinic, useNow } from '../../store/hooks';
import { navigate } from '../../store/session';
import { Avatar, Button, Drawer, EmptyState, Icon, Input, Tabs } from '../../ui';
import { fold, segmentGroups } from './lib';

type Group = 'recipients' | 'excluded' | 'noConsent';
const PAGE = 100;

interface Row {
  client: Client;
  note: string;
}

interface RecipientsDrawerProps {
  open: boolean;
  onClose: () => void;
  segment: SegmentDefinition;
  campaignName: string;
}

/** Úplný přehled: kdo kampaň dostane, koho vyřadila pravidla a kdo nemá souhlas. */
export function RecipientsDrawer({ open, onClose, segment, campaignName }: RecipientsDrawerProps): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const [group, setGroup] = useState<Group>('recipients');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    if (open) {
      setGroup('recipients');
      setQ('');
      setLimit(PAGE);
    }
  }, [open]);
  useEffect(() => setLimit(PAGE), [group, q]);

  const groups = useMemo(() => (open ? segmentGroups(clinic, segment, now) : null), [open, clinic, segment, now]);

  const rows = useMemo((): Row[] => {
    if (!groups) return [];
    const toRow = (id: Id, note: string): Row | null => {
      const client = getClient(clinic, id);
      return client ? { client, note } : null;
    };
    let list: (Row | null)[];
    if (group === 'recipients') list = groups.recipients.map((id) => toRow(id, getClient(clinic, id)?.email ?? ''));
    else if (group === 'excluded') list = groups.excluded.map((id) => toRow(id, 'Vyřazen pravidlem pro vyloučení'));
    else list = groups.noConsent.map((x) => toRow(x.id, x.reason));
    const term = fold(q.trim());
    return list
      .filter((r): r is Row => !!r)
      .filter((r) => !term || fold(`${r.client.firstName} ${r.client.lastName} ${r.client.email}`).includes(term));
  }, [groups, group, q, clinic]);

  const counts = groups ? { recipients: groups.recipients.length, excluded: groups.excluded.length, noConsent: groups.noConsent.length } : null;

  const empty: Record<Group, { title: string; text: string }> = {
    recipients: { title: 'Nikdo neodpovídá', text: 'Segmentu teď neodpovídá žádný klient se souhlasem. Uvolněte podmínky.' },
    excluded: { title: 'Nikdo není vyloučen', text: 'Pravidla pro vyloučení nikoho nevyřadila.' },
    noConsent: { title: 'Všichni mají souhlas', text: 'Každý klient s e-mailem souhlasí s obchodními sděleními.' },
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="md"
      title="Příjemci kampaně"
      description={
        <>
          <strong>{campaignName}</strong> – kampaň dostanou jen klienti se souhlasem s obchodními sděleními. Kliknutím otevřete detail
          klienta.
        </>
      }
    >
      <div className="com-people">
        <Tabs
          bordered
          aria-label="Skupiny klientů"
          value={group}
          onChange={setGroup}
          items={[
            { id: 'recipients', label: 'Příjemci', count: counts ? formatNumber(counts.recipients) : undefined },
            { id: 'excluded', label: 'Vyloučení', count: counts ? formatNumber(counts.excluded) : undefined },
            { id: 'noConsent', label: 'Bez souhlasu', count: counts ? formatNumber(counts.noConsent) : undefined },
          ]}
        />
        <Input prefixIcon="search" size="sm" placeholder="Hledat jméno nebo e-mail" aria-label="Hledat v seznamu" value={q} onValueChange={setQ} />
        {rows.length === 0 ? (
          <EmptyState compact icon={q ? 'search' : 'users'} title={q ? 'Nic nenalezeno' : empty[group].title} text={q ? `Žádný klient neodpovídá „${q}“.` : empty[group].text} />
        ) : (
          <>
            <ul className="com-people__list">
              {rows.slice(0, limit).map(({ client, note }) => (
                <li key={client.id}>
                  <button
                    type="button"
                    className="com-person"
                    onClick={() => {
                      onClose();
                      navigate({ name: 'klient', clientId: client.id });
                    }}
                  >
                    <Avatar initials={(client.firstName.charAt(0) + client.lastName.charAt(0)).toUpperCase()} size="sm" tone="slate" />
                    <span className="com-person__text">
                      <span className="com-person__name">
                        {client.firstName} {client.lastName}
                      </span>
                      <span className="com-person__meta">{note || 'bez e-mailu'}</span>
                    </span>
                    <Icon name="chevronRight" size={16} className="com-person__chev" />
                  </button>
                </li>
              ))}
            </ul>
            {rows.length > limit && (
              <Button variant="secondary" full onClick={() => setLimit((l) => l + PAGE)}>
                Zobrazit další (zbývá {formatNumber(rows.length - limit)})
              </Button>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}
