import { useEffect, useMemo, useRef, useState } from 'react';
import type { ActorRole } from '../domain/types';
import { clientName } from '../engine/selectors';
import { CalendarScreen, NewBookingDialog } from '../screens/calendar';
import { ClientDetailScreen, ClientsScreen } from '../screens/clients';
import { CommsScreen } from '../screens/comms';
import { PackagesScreen, ServicesScreen, SettingsScreen, TeamScreen } from '../screens/settings';
import { DashboardScreen, StatsScreen } from '../screens/stats';
import { useClinic } from '../store/hooks';
import { navigate, useSession, type AdminRoute } from '../store/session';
import { AppShell, Avatar, Button, EmptyState, Icon, Kbd, type IconName } from '../ui';
import { TestBar, useTestPersonName } from './TestBar';

type NavId = Exclude<AdminRoute['name'], 'klient'>;

const NAV: { id: NavId; label: string; icon: IconName }[] = [
  { id: 'prehled', label: 'Přehled', icon: 'home' },
  { id: 'kalendar', label: 'Kalendář', icon: 'calendar' },
  { id: 'klienti', label: 'Klienti', icon: 'users' },
  { id: 'permanentky', label: 'Permanentky a kredity', icon: 'ticket' },
  { id: 'sluzby', label: 'Služby a ceník', icon: 'briefcase' },
  { id: 'tym', label: 'Tým a směny', icon: 'clock' },
  { id: 'komunikace', label: 'Komunikace', icon: 'mail' },
  { id: 'statistiky', label: 'Statistiky', icon: 'chart' },
  { id: 'nastaveni', label: 'Nastavení', icon: 'settings' },
];

const ACCESS: Record<ActorRole, NavId[]> = {
  owner: NAV.map((n) => n.id),
  reception: ['prehled', 'kalendar', 'klienti', 'permanentky', 'sluzby', 'tym', 'komunikace'],
  therapist: ['prehled', 'kalendar', 'klienti'],
  client: [],
};

const ROLE_LABEL: Record<ActorRole, string> = { owner: 'majitelka', reception: 'recepce', therapist: 'terapeut', client: 'klient' };

function GlobalSearch(): JSX.Element {
  const clinic = useClinic();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const t = norm(term);
    return clinic.clients
      .filter((c) => norm(c.firstName + ' ' + c.lastName).includes(t) || norm(c.lastName + ' ' + c.firstName).includes(t) || c.email.includes(term) || c.phone.replace(/\s/g, '').includes(term.replace(/\s/g, '')))
      .slice(0, 7);
  }, [q, clinic.clients]);

  const go = (id: string): void => {
    navigate({ name: 'klient', clientId: id });
    setQ('');
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="gs" role="search">
      <label htmlFor="gs-input" className="visually-hidden">Hledat klienta</label>
      <span className="gs__icon" aria-hidden="true"><Icon name="search" size={16} /></span>
      <input
        ref={inputRef}
        id="gs-input"
        className="gs__input"
        placeholder="Hledat klienta nebo rezervaci"
        value={q}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="gs-results"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && results[active]) {
            e.preventDefault();
            go(results[active].id);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      <span className="gs__kbd" aria-hidden="true"><Kbd>⌘K</Kbd></span>
      {open && q.trim().length >= 2 && (
        <ul id="gs-results" className="gs__results" role="listbox">
          {results.length === 0 && <li className="gs__empty">Žádný klient neodpovídá „{q}".</li>}
          {results.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === active}>
              <button type="button" className={'gs__result' + (i === active ? ' is-active' : '')} onMouseDown={(e) => e.preventDefault()} onClick={() => go(c.id)}>
                <Avatar initials={(c.firstName[0] + c.lastName[0]).toUpperCase()} size="sm" tone="slate" />
                <span className="gs__result-name">{clientName(c)}</span>
                <span className="gs__result-meta">{c.phone || c.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AdminApp(): JSX.Element {
  const clinic = useClinic();
  const session = useSession();
  const person = useTestPersonName();
  const [newBooking, setNewBooking] = useState(false);
  const allowed = ACCESS[session.role] ?? [];
  const route = session.route;
  const activeNav: NavId = route.name === 'klient' ? 'klienti' : route.name;
  const canSee = allowed.includes(activeNav);

  const nav = NAV.filter((n) => allowed.includes(n.id)).map((n) => ({
    ...n,
    count: n.id === 'klienti' ? clinic.clients.length : undefined,
  }));

  let screen: JSX.Element;
  if (!canSee) {
    screen = (
      <EmptyState
        icon="lock"
        title="Sem tato role nemá přístup"
        text="Statistiky a nastavení vidí jen majitelka. Přepněte roli v testovacím panelu nebo pokračujte do kalendáře."
        action={<Button variant="primary" onClick={() => navigate({ name: 'kalendar' })}>Otevřít kalendář</Button>}
      />
    );
  } else {
    switch (route.name) {
      case 'prehled':
        screen = <DashboardScreen />;
        break;
      case 'kalendar':
        screen = <CalendarScreen />;
        break;
      case 'klienti':
        screen = <ClientsScreen />;
        break;
      case 'klient':
        screen = <ClientDetailScreen clientId={route.clientId} />;
        break;
      case 'permanentky':
        screen = <PackagesScreen />;
        break;
      case 'sluzby':
        screen = <ServicesScreen />;
        break;
      case 'tym':
        screen = <TeamScreen />;
        break;
      case 'komunikace':
        screen = <CommsScreen />;
        break;
      case 'statistiky':
        screen = <StatsScreen />;
        break;
      case 'nastaveni':
        screen = <SettingsScreen />;
        break;
      default:
        screen = <CalendarScreen />;
    }
  }

  const initials = person
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  return (
    <>
      <AppShell
        banner={<TestBar />}
        nav={nav}
        active={activeNav}
        onNavigate={(id) => navigate({ name: id as NavId } as AdminRoute)}
        topbar={
          <div className="topbar">
            <GlobalSearch />
            <div className="topbar__actions">
              <Button variant="primary" icon="plus" onClick={() => setNewBooking(true)}>
                Nová rezervace
              </Button>
            </div>
          </div>
        }
        sidebarFooter={
          <div className="sb-user">
            <Avatar initials={initials || 'TM'} tone="teal" size="sm" />
            <div className="sb-user__text">
              <span className="sb-user__name">{person}</span>
              <span className="sb-user__role">{ROLE_LABEL[session.role]}</span>
            </div>
          </div>
        }
      >
        {screen}
      </AppShell>
      <NewBookingDialog open={newBooking} onClose={() => setNewBooking(false)} />
    </>
  );
}
