import { useMemo, useState } from 'react';
import type { ClientPackage, Id, MoneyMethod } from '../../domain/types';
import { markWithdrawalRefunded } from '../../engine/commands';
import { countLabel, formatDate, formatMoney } from '../../engine/format';
import { clientName, getClient } from '../../engine/selectors';
import { useActor, useClinic, useCommand, useNow } from '../../store/hooks';
import { navigate } from '../../store/session';
import { Badge, Button, Card, CardHeader, ConfirmDialog, Segmented, cx } from '../../ui';
import './payments.css';

/**
 * Peníze k vrácení po odstoupení od smlouvy (permanentka koupená online). Zákon dává 14 dní –
 * karta ukazuje, komu a kolik vrátit, a recepce po odeslání převodu zapíše „Vráceno“.
 */
export function WithdrawalRefundsCard({ clientId, className }: { clientId?: Id; className?: string }): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const actor = useActor();
  const run = useCommand();
  const [refunding, setRefunding] = useState<ClientPackage | null>(null);
  const [method, setMethod] = useState<MoneyMethod>('transfer');
  const open = useMemo(
    () =>
      clinic.packages
        .filter((p) => p.withdrawal && !p.withdrawal.refundedAt && (!clientId || p.clientId === clientId))
        .sort((a, b) => (a.withdrawal!.refundDue < b.withdrawal!.refundDue ? -1 : 1)),
    [clinic.packages, clientId],
  );
  if (actor.role !== 'owner' && actor.role !== 'reception') return null;
  if (!open.length) return null;
  const today = now.slice(0, 10);

  return (
    <Card as="section" aria-label="Vrátit peníze po odstoupení od smlouvy" className={cx('pay-card', className)}>
      <CardHeader title="Vrátit peníze – odstoupení od smlouvy" meta={countLabel(open.length, ['klient', 'klienti', 'klientů'])} />
      <ul className="pay-refunds">
        {open.map((p) => {
          const w = p.withdrawal!;
          const c = getClient(clinic, p.clientId);
          const late = w.refundDue < today;
          return (
            <li key={p.id} className="pay-refunds__row">
              <div className="pay-refunds__who">
                {clientId ? (
                  <span className="pay-refunds__name">{p.name}</span>
                ) : (
                  <button type="button" className="link pay-refunds__name" onClick={() => navigate({ name: 'klient', clientId: p.clientId })}>
                    {c ? clientName(c) : 'Klient'}
                  </button>
                )}
                <span className="pay-refunds__meta">
                  {clientId ? '' : `${p.name} · `}odstoupení {formatDate(w.at)}
                  {w.usedEntries ? ` · využito ${countLabel(w.usedEntries, ['vstup', 'vstupy', 'vstupů'])}` : ''}
                </span>
              </div>
              <div className="pay-refunds__amount">
                <strong className="tnum">{formatMoney(w.refundAmount)}</strong>
                <Badge tone={late ? 'danger' : 'warning'}>{late ? 'po lhůtě' : `do ${formatDate(w.refundDue)}`}</Badge>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setRefunding(p)}>
                Vráceno
              </Button>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={!!refunding}
        onClose={() => setRefunding(null)}
        title="Zapsat vrácení peněz"
        message={refunding ? `${formatMoney(refunding.withdrawal?.refundAmount ?? 0)} za permanentku ${refunding.name}. V tržbách se objeví jako vrácená platba.` : undefined}
        confirmLabel="Zapsat vrácení"
        onConfirm={() => {
          if (refunding) run(markWithdrawalRefunded, { packageId: refunding.id, method }, { success: 'Vrácení zapsáno' });
          setRefunding(null);
        }}
      >
        <Segmented
          aria-label="Jak jsme peníze vrátili"
          size="sm"
          full
          value={method}
          onChange={(v) => setMethod(v as MoneyMethod)}
          options={[
            { value: 'transfer', label: 'Převodem' },
            { value: 'cash', label: 'Hotově' },
            { value: 'card', label: 'Na kartu' },
          ]}
        />
      </ConfirmDialog>
    </Card>
  );
}
