import { useMemo } from 'react';
import type { ClientPackage, MakeupRight } from '../domain/types';
import { TherapistAvatar } from '../components/domain';
import { leaveWaitlist } from '../engine/commands';
import { countLabel, formatDate, formatDateLong, formatDayShort, formatMoney, formatTimeRange } from '../engine/format';
import {
  activePackages,
  bookingsOfClient,
  clientCredit,
  getBooking,
  getCategory,
  getService,
  getTherapist,
  openMakeups,
  packageUsage,
  therapistName,
  upcomingBookingsOfClient,
} from '../engine/selectors';
import { dateOf, daysBetween } from '../engine/time';
import { useClinic, useCommand, useNow } from '../store/hooks';
import { Button, Callout, Icon, IconButton, StackedBar, cx } from '../ui';
import { usePortal } from './context';
import {
  bookableServices,
  bookingTitle,
  cancelState,
  clientExcuses,
  clientMessages,
  clientOffers,
  clientWaiting,
  greetingFor,
  placeLabel,
  startsIn,
  vocative,
  waitlistLabel,
  whenLabel,
} from './logic';
import { DateBadge, Screen, SectionTitle, StateChip } from './parts';
import { inboxSeen } from './storage';
import { OfferCard } from './WaitlistOffer';

export function ClinicBrand(): JSX.Element {
  const clinic = useClinic();
  return (
    <div className="por-brand">
      <span className="wordmark wordmark--sm">
        {clinic.settings.clinicName}
        <span className="wordmark__dot">.</span>
      </span>
      <span className="por-brand__tag">{clinic.settings.clinicTagline}</span>
    </div>
  );
}

export function HomeScreen(): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const { client, go, openAccount } = usePortal();
  const today = dateOf(now);

  const data = useMemo(() => {
    const upcoming = upcomingBookingsOfClient(clinic, client.id, now);
    const all = bookingsOfClient(clinic, client.id);
    const lastDone = [...all].reverse().find((b) => b.status === 'completed');
    const bookable = new Set(bookableServices(clinic, client.id).map((s) => s.id));
    const messages = clientMessages(clinic, client.id);
    return {
      upcoming,
      offers: clientOffers(clinic, client.id, now),
      waiting: clientWaiting(clinic, client.id, now),
      makeups: openMakeups(clinic, client.id, now),
      packages: activePackages(clinic, client.id, today),
      credit: clientCredit(clinic, client.id),
      excuses: clientExcuses(clinic, client.id, now),
      fees: all.filter((b) => b.fee?.status === 'due'),
      rebook: lastDone && bookable.has(lastDone.serviceId) ? lastDone : undefined,
      latestMessage: messages[0]?.at ?? null,
    };
  }, [clinic, client.id, now, today]);

  const next = data.upcoming[0];
  const unread = !!data.latestMessage && data.latestMessage > (inboxSeen(client.id) ?? '');
  const excusesOn = clinic.settings.policy.excuses.enabled;

  return (
    <Screen
      brand={<ClinicBrand />}
      right={
        <IconButton
          icon="mail"
          size="lg"
          label={unread ? 'Zprávy od kliniky, máte novou zprávu' : 'Zprávy od kliniky'}
          dot={unread}
          onClick={() => openAccount('zpravy')}
        />
      }
    >
      <section className="por-hello" aria-labelledby="por-hello-title">
        <p className="por-hello__date">{formatDateLong(now, { capital: true, year: false })}</p>
        <h1 id="por-hello-title" className="por-hello__title" tabIndex={-1}>
          {greetingFor(now)}, {vocative(client.firstName)}
        </h1>
        <p className="por-hello__sub">
          {next ? `Příští termín máte ${whenLabel(next.start, now)}.` : 'Teď nemáte naplánovaný žádný termín.'}
        </p>
        {!client.blocked && (
          <div className="por-hello__actions">
            <Button variant="primary" size="lg" icon="calendarPlus" full onClick={() => go({ name: 'rezervace' })}>
              Rezervovat termín
            </Button>
            {data.rebook && (
              <button type="button" className="por-rebook" onClick={() => go({ name: 'rezervace', serviceId: data.rebook!.serviceId })}>
                <Icon name="repeat" size={16} />
                <span className="por-rebook__text">
                  Znovu {getService(clinic, data.rebook.serviceId)?.name}
                  <span className="por-rebook__who"> · {therapistName(getTherapist(clinic, data.rebook.therapistId))}</span>
                </span>
                <Icon name="chevronRight" size={16} />
              </button>
            )}
          </div>
        )}
      </section>

      {client.blocked && <BlockedNotice />}

      {data.offers.map((w) => (
        <OfferCard key={w.id} entry={w} />
      ))}

      {data.fees.length > 0 && (
        <Callout tone="warning" title="K úhradě">
          {data.fees.map((b) => (
            <span key={b.id} className="por-block">
              {b.fee?.reason === 'no_show' ? 'Poplatek za nedostavení' : 'Storno poplatek'} {formatMoney(b.fee?.amount ?? 0)} ·{' '}
              {bookingTitle(clinic, b)} {formatDayShort(b.start)}
            </span>
          ))}
          <span className="por-block">Uhradíte ho na recepci při příští návštěvě.</span>
        </Callout>
      )}

      <section className="por-stack por-stack--tight" aria-labelledby="por-next-title">
        <SectionTitle
          id="por-next-title"
          action={
            data.upcoming.length > 1 ? (
              <button type="button" className="link por-sect__link" onClick={() => go({ name: 'moje' })}>
                Všechny ({data.upcoming.length})
              </button>
            ) : undefined
          }
        >
          Nejbližší termín
        </SectionTitle>
        {next ? (
          <NextBookingCard bookingId={next.id} />
        ) : (
          <div className="por-card por-card--empty">
            <Icon name="calendar" size={20} />
            <span>Až si něco zarezervujete, uvidíte to tady i s podmínkami zrušení.</span>
          </div>
        )}
      </section>

      {data.makeups.length > 0 && (
        <section className="por-stack por-stack--tight" aria-labelledby="por-mk-title">
          <SectionTitle id="por-mk-title">Náhrady k vyčerpání</SectionTitle>
          {data.makeups.map((m) => (
            <MakeupCard key={m.id} makeup={m} />
          ))}
        </section>
      )}

      <section className="por-stack por-stack--tight" aria-labelledby="por-bal-title">
        <SectionTitle
          id="por-bal-title"
          action={
            <button type="button" className="link por-sect__link" onClick={() => openAccount('permanentky')}>
              Permanentky
            </button>
          }
        >
          Zůstatky
        </SectionTitle>
        <div className="por-balances">
          {data.packages.map((p) => (
            <PackageTile key={p.id} pkg={p} />
          ))}
          <div className="por-tile">
            <span className="por-tile__label">Kredit</span>
            <span className="por-tile__num tnum">{formatMoney(data.credit)}</span>
            <Button size="sm" variant="secondary" icon="plus" className="por-tile__btn" onClick={() => openAccount('kredit', 'topup')}>
              Dobít
            </Button>
          </div>
          {excusesOn && (
            <div className="por-tile">
              <span className="por-tile__label">Omluvenky</span>
              <span className="por-tile__num tnum">
                {data.excuses.remaining}
                <span className="por-tile__of"> z {data.excuses.total}</span>
              </span>
              <span className="por-tile__hint">
                bez permanentky, za {countLabel(clinic.settings.policy.excuses.perClientMonths, ['měsíc', 'měsíce', 'měsíců'])}
              </span>
            </div>
          )}
          {!data.packages.length && (
            <button type="button" className="por-tile por-tile--cta" onClick={() => openAccount('permanentky', 'buy')}>
              <span className="por-tile__label">Permanentka</span>
              <span className="por-tile__cta-text">Ušetřete s permanentkou</span>
              <span className="por-tile__hint por-tile__hint--accent">
                Koupit online <Icon name="arrowRight" size={14} />
              </span>
            </button>
          )}
        </div>
      </section>

      {data.waiting.length > 0 && (
        <section className="por-stack por-stack--tight" aria-labelledby="por-wait-title">
          <SectionTitle id="por-wait-title">Hlídáte uvolnění</SectionTitle>
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
    </Screen>
  );
}

export function BlockedNotice(): JSX.Element {
  const clinic = useClinic();
  return (
    <Callout tone="danger" icon="ban" title="Online rezervace jsou pozastavené">
      Po opakovaném nedostavení jsme online rezervace na vašem účtu dočasně pozastavili. Termín vám rádi domluvíme na recepci – napište na{' '}
      <a href={`mailto:${clinic.settings.senderEmail}`}>{clinic.settings.senderEmail}</a> nebo se zastavte osobně. Zrušit nebo omluvit
      stávající termíny můžete dál tady v aplikaci.
    </Callout>
  );
}

function NextBookingCard({ bookingId }: { bookingId: string }): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const { go } = usePortal();
  const b = getBooking(clinic, bookingId);
  if (!b) return null;
  const svc = getService(clinic, b.serviceId);
  const cat = svc ? getCategory(clinic, svc.categoryId) : undefined;
  const t = getTherapist(clinic, b.therapistId);
  const cs = cancelState(clinic, b, now);
  const place = placeLabel(clinic, b);
  const open = (): void => go({ name: 'termin', bookingId: b.id });
  return (
    <article className="por-next">
      <button type="button" className="por-next__main" onClick={open} aria-label={`Detail termínu ${bookingTitle(clinic, b)}, ${formatDateLong(b.start, { year: false })} ${formatTimeRange(b.start, b.end)}`}>
        <DateBadge date={b.start} tone={cat?.tone} size="lg" />
        <span className="por-next__body">
          <span className="por-next__eyebrow">{startsIn(b.start, now)}</span>
          <span className="por-next__title">{bookingTitle(clinic, b)}</span>
          <span className="por-next__when tnum">
            {formatDayShort(b.start)} · {formatTimeRange(b.start, b.end)}
          </span>
          <span className="por-next__who">
            <TherapistAvatar therapist={t} size="xs" />
            <span className="truncate">
              {therapistName(t)}
              {place ? ` · ${place}` : ''}
            </span>
          </span>
        </span>
        <Icon name="chevronRight" size={18} className="por-next__chev" />
      </button>
      {cs.label && (
        <div className="por-next__foot">
          <StateChip tone={cs.tone}>{cs.label}</StateChip>
        </div>
      )}
    </article>
  );
}

function MakeupCard({ makeup }: { makeup: MakeupRight }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const { go, client } = usePortal();
  const src = getBooking(clinic, makeup.sourceBookingId);
  const daysLeft = daysBetween(dateOf(now), dateOf(makeup.validUntil));
  const urgent = daysLeft <= 3;
  return (
    <article className={cx('por-makeup', urgent && 'is-urgent')}>
      <span className="por-makeup__icon" aria-hidden="true">
        <Icon name="repeat" size={18} />
      </span>
      <div className="por-makeup__body">
        <span className="por-makeup__title">
          Náhrada za {src ? `${bookingTitle(clinic, src)} ${formatDayShort(src.start)}` : 'omluvený termín'}
        </span>
        <span className="por-makeup__meta tnum">
          Vyberte termín do {formatDayShort(makeup.validUntil)} ·{' '}
          {daysLeft <= 0 ? 'poslední den' : `zbývá ${countLabel(daysLeft, ['den', 'dny', 'dní'])}`}
        </span>
      </div>
      {!client.blocked && (
        <Button size="sm" variant={urgent ? 'primary' : 'secondary'} onClick={() => go({ name: 'rezervace', makeupId: makeup.id })}>
          Vybrat
        </Button>
      )}
    </article>
  );
}

export function PackageTile({ pkg, wide = true }: { pkg: ClientPackage; wide?: boolean }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const u = packageUsage(clinic, pkg, dateOf(now));
  const daysLeft = daysBetween(dateOf(now), u.validUntil);
  return (
    <div className={cx('por-tile', wide && 'por-tile--wide')}>
      <div className="por-tile__head">
        <span className="por-tile__label">Permanentka {pkg.name}</span>
        <span className={cx('por-tile__meta', daysLeft <= 14 && 'is-warning')}>platí do {formatDate(u.validUntil)}</span>
      </div>
      <span className="por-tile__num tnum">
        {u.free}
        <span className="por-tile__of">
          {' '}
          {u.free === 1 ? 'volný vstup' : u.free >= 2 && u.free <= 4 ? 'volné vstupy' : 'volných vstupů'} z {u.total}
          {u.reserved ? ` · ${u.reserved} ${u.reserved === 1 ? 'rezervovaný' : 'rezervované'}` : ''}
        </span>
      </span>
      <StackedBar
        cells
        size="sm"
        legend={false}
        segments={[
          { value: u.used, tone: 'neutral', label: 'využité' },
          { value: u.forfeited, tone: 'danger', label: 'propadlé' },
          { value: u.reserved, tone: 'accent-hatched', label: 'rezervované' },
          { value: u.free, tone: 'accent', label: 'volné' },
        ]}
      />
      {pkg.excusesAllowed > 0 && (
        <span className="por-tile__hint">
          Omluvenky k permanentce: zbývá {u.excusesLeft} z {pkg.excusesAllowed}
        </span>
      )}
    </div>
  );
}
