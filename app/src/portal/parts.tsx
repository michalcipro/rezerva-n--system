import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Booking, Tone } from '../domain/types';
import { BookingStatusBadges } from '../components/domain';
import { WEEKDAY_SHORT, formatTimeRange } from '../engine/format';
import { getCategory, getService, getTherapist, therapistName } from '../engine/selectors';
import { weekdayOf } from '../engine/time';
import { useClinic, useNow } from '../store/hooks';
import { useSession } from '../store/session';
import { Button, Drawer, Icon, IconButton, cx, toast, type DrawerProps, type IconName } from '../ui';
import { usePortal } from './context';
import { bookingTitle, cancelState, clientOffers, placeLabel, type ChipTone } from './logic';

/* ------------------------------------------------------------------ */
/* Kostra obrazovky: horní lišta, obsah, spodní dok (navigace / akce)   */
/* ------------------------------------------------------------------ */

export interface ScreenProps {
  /** Nadpis v horní liště (h1). */
  title?: ReactNode;
  /** Místo nadpisu značka kliniky – h1 je pak v obsahu. */
  brand?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  /** Pravá část horní lišty. */
  right?: ReactNode;
  /** Pod horní lištou (např. průběh kroků). */
  below?: ReactNode;
  /** Spodní akční lišta; když chybí, zobrazí se navigace. `null` = nic. */
  dock?: ReactNode;
  children: ReactNode;
  mainClassName?: string;
}

export function Screen({ title, brand, onBack, backLabel = 'Zpět', right, below, dock, children, mainClassName }: ScreenProps): JSX.Element {
  const { hasNavigated } = usePortal();
  const topRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!hasNavigated()) return;
    const h1 = topRef.current?.querySelector<HTMLElement>('h1') ?? mainRef.current?.querySelector<HTMLElement>('h1');
    h1?.focus({ preventScroll: true });
    // fokus jen při otevření obrazovky
  }, []);

  return (
    <>
      <header ref={topRef} className={cx('por-top', below != null && 'por-top--with-below')}>
        <div className="por-top__bar">
          {onBack && <IconButton icon="arrowLeft" label={backLabel} size="lg" className="por-top__back" onClick={onBack} />}
          {brand ?? (
            <h1 className="por-top__title" tabIndex={-1}>
              {title}
            </h1>
          )}
          {right != null && <div className="por-top__right">{right}</div>}
        </div>
        {below}
      </header>
      <main ref={mainRef} className={cx('por-main', mainClassName)}>
        {children}
      </main>
      {dock === undefined ? (
        <div className="por-dock">
          <TabBar />
        </div>
      ) : dock === null ? null : (
        <div className="por-dock">{dock}</div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Spodní navigace                                                     */
/* ------------------------------------------------------------------ */

const TABS: { id: 'domu' | 'rezervace' | 'moje' | 'ucet'; label: string; icon: IconName }[] = [
  { id: 'domu', label: 'Domů', icon: 'home' },
  { id: 'rezervace', label: 'Rezervace', icon: 'calendarPlus' },
  { id: 'moje', label: 'Moje termíny', icon: 'calendarCheck' },
  { id: 'ucet', label: 'Účet', icon: 'user' },
];

export function TabBar(): JSX.Element {
  const session = useSession();
  const clinic = useClinic();
  const now = useNow();
  const { client, go } = usePortal();
  const route = session.portalRoute.name;
  const active = route === 'termin' ? 'moje' : route;
  const offers = useMemo(() => clientOffers(clinic, client.id, now).length, [clinic, client.id, now]);

  return (
    <nav className="por-tabs" aria-label="Hlavní navigace">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        const dot = tab.id === 'domu' && offers > 0;
        return (
          <button
            key={tab.id}
            type="button"
            className={cx('por-tab', isActive && 'is-active')}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => go({ name: tab.id })}
          >
            <span className="por-tab__icon">
              <Icon name={tab.icon} size={22} />
              {dot && <span className="por-tab__dot" aria-hidden="true" />}
            </span>
            <span className="por-tab__label">{tab.label}</span>
            {dot && <span className="visually-hidden">, nová nabídka uvolněného termínu</span>}
          </button>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Drobné prvky                                                        */
/* ------------------------------------------------------------------ */

export function SectionTitle({ children, action, id }: { children: ReactNode; action?: ReactNode; id?: string }): JSX.Element {
  return (
    <div className="por-sect">
      <h2 className="por-sect__title" id={id}>
        {children}
      </h2>
      {action}
    </div>
  );
}

/** Kartička s dnem v týdnu a číslem dne (barva podle kategorie). */
export function DateBadge({ date, tone = 'slate', size = 'md', muted }: { date: string; tone?: Tone; size?: 'md' | 'lg'; muted?: boolean }): JSX.Element {
  const day = Number(date.slice(8, 10));
  return (
    <span className={cx('por-date', `por-date--${muted ? 'muted' : tone}`, size === 'lg' && 'por-date--lg')} aria-hidden="true">
      <span className="por-date__dow">{WEEKDAY_SHORT[weekdayOf(date)]}</span>
      <span className="por-date__num">{day}</span>
    </span>
  );
}

export function StateChip({ tone, icon = 'clock', children }: { tone: ChipTone; icon?: IconName; children: ReactNode }): JSX.Element {
  return (
    <span className={cx('por-state', `por-state--${tone}`)}>
      <Icon name={icon} size={14} />
      <span>{children}</span>
    </span>
  );
}

/** Řádek termínu v seznamech (klik = detail). */
export function BookingRow({ booking, onOpen }: { booking: Booking; onOpen: () => void }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const svc = getService(clinic, booking.serviceId);
  const cat = svc ? getCategory(clinic, svc.categoryId) : undefined;
  const t = getTherapist(clinic, booking.therapistId);
  const upcoming = booking.status === 'confirmed' && booking.end > now;
  const cs = upcoming ? cancelState(clinic, booking, now) : null;
  const place = placeLabel(clinic, booking);
  return (
    <button type="button" className={cx('por-brow', !upcoming && 'por-brow--past')} onClick={onOpen}>
      <DateBadge date={booking.start} tone={cat?.tone} muted={!upcoming} />
      <span className="por-brow__body">
        <span className="por-brow__title">
          <span className="tnum">{formatTimeRange(booking.start, booking.end)}</span> · {bookingTitle(clinic, booking)}
        </span>
        <span className="por-brow__meta">
          {therapistName(t)}
          {place ? ` · ${place}` : ''}
        </span>
        {cs && cs.label ? (
          <StateChip tone={cs.tone}>{cs.label}</StateChip>
        ) : !upcoming ? (
          <BookingStatusBadges booking={booking} />
        ) : null}
      </span>
      <Icon name="chevronRight" size={18} className="por-brow__chev" />
    </button>
  );
}

/** Spodní panel portálu (na telefonu bottom sheet, na počítači okno nad náhledem). */
export function Sheet(props: DrawerProps): JSX.Element {
  return <Drawer {...props} className={cx('por-sheet', props.className)} />;
}

export function StepProgress({ step, total }: { step: number; total: number }): JSX.Element {
  return (
    <div className="por-steps" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cx('por-steps__seg', i < step && 'is-done')} />
      ))}
    </div>
  );
}

export function ResultHero({
  tone = 'success',
  icon = 'check',
  title,
  children,
}: {
  tone?: 'success' | 'accent' | 'warning';
  icon?: IconName;
  title: ReactNode;
  children?: ReactNode;
}): JSX.Element {
  return (
    <div className={cx('por-result', `por-result--${tone}`)}>
      <span className="por-result__icon" aria-hidden="true">
        <Icon name={icon} size={30} strokeWidth={2} />
      </span>
      <h2 className="por-result__title">{title}</h2>
      {children != null && <div className="por-result__text">{children}</div>}
    </div>
  );
}

/** Text k ručnímu vložení do kalendáře + kopírování. */
export function CopyBlock({ text, label }: { text: string; label: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);
  const selectText = (): void => {
    const el = preRef.current;
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Zkopírováno – vložte do svého kalendáře');
    } catch {
      selectText();
      toast.info('Text je označený, zkopírujte ho ručně.');
    }
  };
  return (
    <div className="por-copy">
      <pre ref={preRef} className="por-copy__text" aria-label={label}>
        {text}
      </pre>
      <Button size="sm" variant="secondary" icon={copied ? 'check' : 'copy'} onClick={() => void copy()}>
        {copied ? 'Zkopírováno' : 'Kopírovat'}
      </Button>
    </div>
  );
}

/** Řádek v nabídce účtu. */
export function ListRow({
  icon,
  label,
  value,
  onClick,
  hint,
}: {
  icon: IconName;
  label: ReactNode;
  value?: ReactNode;
  hint?: ReactNode;
  onClick: () => void;
}): JSX.Element {
  return (
    <button type="button" className="por-row" onClick={onClick}>
      <span className="por-row__icon" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <span className="por-row__text">
        <span className="por-row__label">{label}</span>
        {hint != null && <span className="por-row__hint">{hint}</span>}
      </span>
      {value != null && <span className="por-row__value">{value}</span>}
      <Icon name="chevronRight" size={18} className="por-row__chev" />
    </button>
  );
}

/** Ikona + text v jednom řádku (meta informace v kartách). */
export function MetaLine({ icon, children, tone }: { icon: IconName; children: ReactNode; tone?: 'muted' | 'accent' | 'warning' | 'danger' | 'success' }): JSX.Element {
  return (
    <span className={cx('por-meta', tone && `por-meta--${tone}`)}>
      <Icon name={icon} size={14} />
      <span>{children}</span>
    </span>
  );
}
