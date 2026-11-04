import { useMemo, useState } from 'react';
import type { Id } from '../../domain/types';
import { PendingPaymentsList } from '../../components/payments';
import { countLabel, formatDayShort, formatMoney, formatNumber, formatTime, plural } from '../../engine/format';
import { groupSessionsOverview, type GroupSessionOverview } from '../../engine/groups';
import { pendingPaymentRequests, qrAvailable } from '../../engine/payments';
import { getRoom, getTherapist, therapistShort } from '../../engine/selectors';
import { addDays, dateOf } from '../../engine/time';
import { useClinic, useNow } from '../../store/hooks';
import { navigate } from '../../store/session';
import { Card, CardHeader, EmptyState, IconButton, cx } from '../../ui';
import { NewBookingDialog, type NewBookingInitial } from '../calendar';
import { freeSpotsText, leadsGroups, OccupancyMeter } from '../groups';
import './stats.css';

/**
 * Přehled – widgety k docs/VSTUPY-SKUPINY-QR.md: volná místa na dnešních a zítřejších skupinových lekcích
 * a čekající QR platby.
 */

/* ------------------------------------------------------------------ */
/* Volná místa na skupinových lekcích                                  */
/* ------------------------------------------------------------------ */

/** Kolik termínů je vidět, než uživatel widget rozbalí. */
const SPOTS_INITIAL = 4;

export interface GroupSpotsCardProps {
  /** Terapeut vidí jen své lekce (id trenéra); null = všechny. */
  therapistId: Id | null;
}

/** Dnešní a zítřejší termíny skupinových lekcí s volnými místy; přihlášení klienta přímo z řádku. */
export function GroupSpotsCard({ therapistId }: GroupSpotsCardProps): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const today = dateOf(now);
  const tomorrow = addDays(today, 1);
  const [booking, setBooking] = useState<NewBookingInitial | null>(null);
  const [expanded, setExpanded] = useState(false);

  const data = useMemo(() => {
    const upcoming = groupSessionsOverview(clinic, today, addDays(today, 2), { therapistId }, now).filter((g) => !g.past && !g.cancelled);
    const withFree = upcoming.filter((g) => g.free > 0);
    // Když dnes a zítra nic volného není, poradíme nejbližší volný termín v dalších dvou týdnech.
    const next = withFree.length
      ? null
      : (groupSessionsOverview(clinic, addDays(today, 2), addDays(today, 16), { therapistId, onlyFree: true }, now)[0] ?? null);
    return {
      total: upcoming.length,
      full: upcoming.length - withFree.length,
      withFree,
      freeSpots: withFree.reduce((s, g) => s + g.free, 0),
      next,
    };
  }, [clinic, today, therapistId, now]);

  // Bez skupinových lekcí (nebo terapeut, který žádnou nevede) widget nezobrazujeme.
  const hasGroups = therapistId
    ? leadsGroups(clinic, therapistId)
    : clinic.groupTemplates.some((t) => t.active) && clinic.services.some((s) => s.kind === 'group' && s.active);
  if (!hasGroups) return null;

  const own = therapistId !== null;
  const shown = expanded ? data.withFree : data.withFree.slice(0, SPOTS_INITIAL);
  const sections: { label: string; items: GroupSessionOverview[] }[] = [
    { label: 'Dnes', items: shown.filter((g) => dateOf(g.session.start) === today) },
    { label: 'Zítra', items: shown.filter((g) => dateOf(g.session.start) === tomorrow) },
  ].filter((x) => x.items.length > 0);

  return (
    <Card as="section" aria-label="Volná místa na skupinových lekcích" className="st-card">
      <CardHeader
        title="Volná místa na skupinových lekcích"
        subtitle={own ? 'Vaše lekce dnes a zítra' : 'Dnes a zítra'}
        meta={data.freeSpots > 0 ? freeSpotsText(data.freeSpots) : undefined}
      />
      {data.total === 0 ? (
        <EmptyState
          compact
          icon="calendar"
          title="Dnes ani zítra žádná lekce"
          text={
            <>
              {own ? 'Dnes ani zítra nevedete žádnou skupinovou lekci.' : 'Dnes ani zítra se nekoná žádná skupinová lekce.'}
              {data.next && <NextFree item={data.next} />}
            </>
          }
        />
      ) : data.withFree.length === 0 ? (
        <EmptyState
          compact
          icon="users"
          title="Vše obsazeno"
          text={
            <>
              {plural(data.total, [
                'Jediná lekce dnes a zítra je plně obsazená.',
                `Všechny ${formatNumber(data.total)} lekce dnes a zítra jsou plně obsazené.`,
                `Všech ${formatNumber(data.total)} lekcí dnes a zítra je plně obsazených.`,
              ])}{' '}
              Další zájemce můžete přidat na čekací listinu.
              {data.next && <NextFree item={data.next} />}
            </>
          }
        />
      ) : (
        <div className="st-gs">
          {sections.map((sec) => (
            <div key={sec.label} className="st-gs__group">
              <h3 className="st-gs__label">{sec.label}</h3>
              <ul className="st-gs__list">
                {sec.items.map((g) => (
                  <GroupSpotRow key={g.session.id} item={g} onBook={() => setBooking({ sessionId: g.session.id, serviceId: g.session.serviceId })} />
                ))}
              </ul>
            </div>
          ))}
          {data.withFree.length > SPOTS_INITIAL && (
            <button type="button" className="link st-gs__more" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Zobrazit méně' : `Zobrazit všechny (${formatNumber(data.withFree.length)})`}
            </button>
          )}
        </div>
      )}
      <div className="st-wfoot">
        <span>{data.full > 0 ? <>Plně obsazené: <strong>{formatNumber(data.full)}</strong></> : data.total > 0 ? 'Žádný termín není plný' : ''}</span>
        <button type="button" className="link" onClick={() => navigate({ name: 'skupiny' })}>
          Všechny skupinové lekce
        </button>
      </div>
      <NewBookingDialog open={!!booking} onClose={() => setBooking(null)} initial={booking ?? undefined} />
    </Card>
  );
}

/** „Nejbližší volné místo: So 7. 11. 9:00 · Workshop mentální odolnosti (8 volných míst)“ */
function NextFree({ item: g }: { item: GroupSessionOverview }): JSX.Element {
  return (
    <span className="st-gs__next">
      Nejbližší volné místo:{' '}
      <strong className="tnum">
        {formatDayShort(g.session.start)} {formatTime(g.session.start)}
      </strong>{' '}
      · {g.session.title} ({freeSpotsText(g.free)})
    </span>
  );
}

function GroupSpotRow({ item: g, onBook }: { item: GroupSessionOverview; onBook: () => void }): JSX.Element {
  const clinic = useClinic();
  const ses = g.session;
  const room = getRoom(clinic, ses.roomId);
  return (
    <li className={cx('st-gs__item', g.fill === 'almost' && 'is-almost')}>
      <div className="st-gs__main">
        <span className="st-gs__title">
          <span className="st-gs__time tnum">{formatTime(ses.start)}</span>
          <span className="st-gs__name">{ses.title}</span>
        </span>
        <span className="st-gs__meta">{[therapistShort(getTherapist(clinic, g.therapistId)), room?.name].filter(Boolean).join(' · ')}</span>
        <OccupancyMeter compact booked={g.booked} capacity={g.capacity} className="st-gs__meter" />
      </div>
      <IconButton icon="userPlus" size="sm" variant="secondary" label={`Přihlásit klienta – ${ses.title} ${formatTime(ses.start)}`} onClick={onBook} />
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Čekající QR platby                                                  */
/* ------------------------------------------------------------------ */

/** Kolik výzev widget ukáže najednou. */
const QR_LIMIT = 3;

/** Čekající QR platby (majitelka a recepce): pár nejbližších podle splatnosti, počet, součet a odkaz na Vstupy. */
export function PendingQrCard(): JSX.Element | null {
  const clinic = useClinic();
  const pending = useMemo(() => pendingPaymentRequests(clinic), [clinic]);
  const total = useMemo(() => pending.reduce((s, r) => s + r.amount, 0), [pending]);

  // QR platba vypnutá a nic nečeká → widget nepřekáží.
  if (!qrAvailable(clinic) && pending.length === 0) return null;

  return (
    <Card as="section" aria-label="Čekající QR platby" className="st-card">
      <CardHeader
        title="Čekající QR platby"
        subtitle="Potvrďte podle variabilního symbolu na výpisu z účtu"
        meta={pending.length > 0 ? countLabel(pending.length, ['platba', 'platby', 'plateb']) : undefined}
      />
      <PendingPaymentsList
        limit={QR_LIMIT}
        expandable={false}
        emptyText="Když klient zvolí platbu QR převodem v portálu nebo ji vystavíte na recepci, objeví se tady, dokud ji nepotvrdíte."
      />
      <div className="st-wfoot">
        <span>
          {pending.length > 0 ? (
            <>
              Celkem čeká <strong>{formatMoney(total)}</strong>
            </>
          ) : (
            'Vše zaplaceno'
          )}
        </span>
        <button type="button" className="link" onClick={() => navigate({ name: 'vstupy' })}>
          Vstupy a platby
        </button>
      </div>
    </Card>
  );
}
