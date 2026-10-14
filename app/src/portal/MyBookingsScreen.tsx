import { useMemo, useState } from 'react';
import type { Booking } from '../domain/types';
import { leaveWaitlist } from '../engine/commands';
import { formatMonthYear } from '../engine/format';
import { pastBookingsOfClient, upcomingBookingsOfClient } from '../engine/selectors';
import { dateOf } from '../engine/time';
import { useClinic, useCommand, useNow } from '../store/hooks';
import { Button, EmptyState, Icon, Segmented } from '../ui';
import { usePortal } from './context';
import { clientOffers, clientWaiting, waitlistLabel } from './logic';
import { BookingRow, Screen, SectionTitle } from './parts';
import { OfferCard } from './WaitlistOffer';

const HISTORY_PAGE = 20;

function byMonth(list: Booking[]): { label: string; items: Booking[] }[] {
  const out: { label: string; items: Booking[] }[] = [];
  for (const b of list) {
    const label = formatMonthYear(dateOf(b.start));
    const last = out[out.length - 1];
    if (last && last.label === label) last.items.push(b);
    else out.push({ label, items: [b] });
  }
  return out;
}

export function MyBookingsScreen(): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const { client, go } = usePortal();
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming');
  const [limit, setLimit] = useState(HISTORY_PAGE);

  const data = useMemo(
    () => ({
      upcoming: upcomingBookingsOfClient(clinic, client.id, now),
      history: pastBookingsOfClient(clinic, client.id, now),
      offers: clientOffers(clinic, client.id, now),
      waiting: clientWaiting(clinic, client.id, now),
    }),
    [clinic, client.id, now],
  );

  const open = (b: Booking): void => go({ name: 'termin', bookingId: b.id });

  return (
    <Screen
      title="Moje termíny"
      right={
        !client.blocked ? (
          <Button size="sm" variant="ghost" icon="plus" className="por-top__action" onClick={() => go({ name: 'rezervace' })}>
            Nový
          </Button>
        ) : undefined
      }
    >
      <Segmented
        full
        size="lg"
        aria-label="Které termíny zobrazit"
        className="por-seg"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'upcoming', label: data.upcoming.length ? `Nadcházející (${data.upcoming.length})` : 'Nadcházející' },
          { value: 'history', label: 'Historie' },
        ]}
      />

      {tab === 'upcoming' ? (
        <>
          {data.offers.map((w) => (
            <OfferCard key={w.id} entry={w} />
          ))}
          {data.upcoming.length ? (
            byMonth(data.upcoming).map((g) => (
              <section key={g.label} className="por-stack por-stack--tight" aria-label={g.label}>
                <SectionTitle>{g.label}</SectionTitle>
                <div className="por-list">
                  {g.items.map((b) => (
                    <BookingRow key={b.id} booking={b} onOpen={() => open(b)} />
                  ))}
                </div>
              </section>
            ))
          ) : (
            <EmptyState
              icon="calendar"
              title="Nemáte žádný naplánovaný termín"
              text="Vyberte si službu a čas, který vám vyhovuje – potvrzení přijde e-mailem."
              action={
                !client.blocked ? (
                  <Button variant="primary" icon="calendarPlus" onClick={() => go({ name: 'rezervace' })}>
                    Rezervovat termín
                  </Button>
                ) : undefined
              }
            />
          )}
          {data.waiting.length > 0 && (
            <section className="por-stack por-stack--tight" aria-labelledby="por-mw-title">
              <SectionTitle id="por-mw-title">Hlídáte uvolnění</SectionTitle>
              <div className="por-card por-card--list">
                {data.waiting.map((w) => (
                  <div key={w.id} className="por-watch">
                    <Icon name="bell" size={16} className="por-watch__icon" />
                    <span className="por-watch__text">{waitlistLabel(clinic, w)}</span>
                    <Button size="sm" variant="ghost" onClick={() => run(leaveWaitlist, { entryId: w.id }, { success: 'Hlídání zrušeno' })}>
                      Zrušit
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : data.history.length ? (
        <>
          {byMonth(data.history.slice(0, limit)).map((g) => (
            <section key={g.label} className="por-stack por-stack--tight" aria-label={g.label}>
              <SectionTitle>{g.label}</SectionTitle>
              <div className="por-list">
                {g.items.map((b) => (
                  <BookingRow key={b.id} booking={b} onOpen={() => open(b)} />
                ))}
              </div>
            </section>
          ))}
          {data.history.length > limit && (
            <Button variant="secondary" full onClick={() => setLimit((l) => l + HISTORY_PAGE)}>
              Zobrazit starší ({data.history.length - limit})
            </Button>
          )}
        </>
      ) : (
        <EmptyState icon="history" title="Zatím žádná historie" text="Proběhlé a zrušené termíny se zobrazí tady." />
      )}
    </Screen>
  );
}
