import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Client, ClinicState, Id } from '../domain/types';
import { getClient } from '../engine/selectors';
import { useClinic } from '../store/hooks';
import { navigatePortal, setSession, useSession, type PortalRoute } from '../store/session';
import { Button, EmptyState } from '../ui';
import { AccountScreen } from './AccountScreen';
import { BookingDetailScreen } from './BookingDetailScreen';
import { BookingWizard } from './BookingWizard';
import { PortalContext, type AccountAction, type AccountView, type PortalContextValue } from './context';
import { BlockedNotice, ClinicBrand, HomeScreen } from './HomeScreen';
import { MyBookingsScreen } from './MyBookingsScreen';
import { Screen } from './parts';
import './portal.css';

/** Klient pro portál: zvolený v relaci, jinak stejně jako testovací panel (Martin Dvořák / první klient). */
function resolveClientId(clinic: ClinicState, sessionClientId: Id | null): Id | null {
  if (sessionClientId && getClient(clinic, sessionClientId)) return sessionClientId;
  const martin = clinic.clients.find((c) => c.firstName === 'Martin' && c.lastName === 'Dvořák');
  return martin?.id ?? clinic.clients[0]?.id ?? null;
}

/**
 * Klientský portál – mobilní aplikace pro klienty kliniky.
 * Na telefonu zabírá celou šířku, na počítači se zobrazí jako telefon uprostřed.
 */
export function ClientPortal(): JSX.Element {
  const clinic = useClinic();
  const session = useSession();
  const rootRef = useRef<HTMLDivElement>(null);
  const clientId = useMemo(() => resolveClientId(clinic, session.clientId), [clinic, session.clientId]);
  const client = clientId ? getClient(clinic, clientId) : undefined;

  // Relace musí znát klienta, jinak by příkazy běžely bez identity.
  useEffect(() => {
    if (session.role === 'client' && clientId && clientId !== session.clientId) setSession({ clientId });
  }, [session.role, clientId, session.clientId]);

  // Výška nad portálem (testovací panel) → dostupná výška obrazovky.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const measure = (): void => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      el.style.setProperty('--por-offset', `${Math.max(0, Math.round(top))}px`);
    };
    measure();
    window.addEventListener('resize', measure);
    const ro = typeof ResizeObserver !== 'undefined' && el.previousElementSibling ? new ResizeObserver(measure) : null;
    if (ro && el.previousElementSibling) ro.observe(el.previousElementSibling);
    return () => {
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [session.testBarOpen]);

  return (
    <div ref={rootRef} className="por-app">
      <div className="por-stage">
        <aside className="por-aside" aria-label="O náhledu">
          <span className="por-aside__eyebrow">Klientský portál</span>
          <p className="por-aside__title">Takhle si u vás klienti rezervují</p>
          <p className="por-aside__text">
            Rezervace, zrušení, omluvenky i platby se hned propíšou do kalendáře recepce. Za kterého klienta portál zkoušíte, přepnete v
            testovacím panelu nahoře.
          </p>
          <ul className="por-aside__list">
            <li>Zarezervujte termín v 15minutových časech</li>
            <li>Omluvte zítřejší termín a vyberte náhradu</li>
            <li>Posuňte testovací čas a sledujte, jak se mění storno podmínky</li>
          </ul>
        </aside>
        <div className="por-device">
          {client ? (
            <PortalApp key={client.id} client={client} />
          ) : (
            <div className="por-scroll">
              <Screen brand={<ClinicBrand />} dock={null}>
                <EmptyState
                  icon="users"
                  title="Zatím tu není žádný klient"
                  text="Založte klienta v administraci (Klienti → Nový klient) nebo načtěte ukázková data. Pak ho vyberte v testovacím panelu."
                />
              </Screen>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PortalApp({ client }: { client: Client }): JSX.Element {
  const session = useSession();
  const route = session.portalRoute;
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigated = useRef(false);
  const [navKey, setNavKey] = useState(0);
  const [accountView, setAccountViewState] = useState<AccountView>('root');
  const [accountAction, setAccountAction] = useState<AccountAction | null>(null);

  const scrollToTop = useCallback((): void => {
    navigated.current = true;
    scrollRef.current?.scrollTo({ top: 0 });
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
  }, []);

  const go = useCallback(
    (r: PortalRoute): void => {
      navigated.current = true;
      if (r.name === 'ucet') {
        setAccountViewState('root');
        setAccountAction(null);
      }
      setNavKey((k) => k + 1);
      navigatePortal(r);
      scrollToTop();
    },
    [scrollToTop],
  );

  const openAccount = useCallback(
    (view: AccountView, action?: AccountAction): void => {
      navigated.current = true;
      setAccountViewState(view);
      setAccountAction(action ?? null);
      setNavKey((k) => k + 1);
      navigatePortal({ name: 'ucet' });
      scrollToTop();
    },
    [scrollToTop],
  );

  const setAccountView = useCallback(
    (view: AccountView): void => {
      setAccountViewState(view);
      scrollToTop();
    },
    [scrollToTop],
  );

  const ctx = useMemo<PortalContextValue>(
    () => ({
      client,
      go,
      openAccount,
      accountView,
      setAccountView,
      accountAction,
      clearAccountAction: () => setAccountAction(null),
      scrollToTop,
      hasNavigated: () => navigated.current,
    }),
    [client, go, openAccount, accountView, setAccountView, accountAction, scrollToTop],
  );

  let screen: JSX.Element;
  switch (route.name) {
    case 'rezervace':
      screen = client.blocked ? (
        <Screen title="Rezervace">
          <BlockedNotice />
          <Button variant="secondary" size="lg" full onClick={() => go({ name: 'moje' })}>
            Moje termíny
          </Button>
        </Screen>
      ) : (
        <BookingWizard route={route} />
      );
      break;
    case 'moje':
      screen = <MyBookingsScreen />;
      break;
    case 'termin':
      screen = <BookingDetailScreen bookingId={route.bookingId} />;
      break;
    case 'ucet':
      screen = <AccountScreen />;
      break;
    default:
      screen = <HomeScreen />;
  }

  return (
    <PortalContext.Provider value={ctx}>
      <div ref={scrollRef} className="por-scroll">
        <ScreenHost key={`${navKey}:${route.name}:${route.name === 'termin' ? route.bookingId : ''}`}>{screen}</ScreenHost>
      </div>
    </PortalContext.Provider>
  );
}

/** Obal obrazovky – změna klíče = nová obrazovka (čistý stav, fokus na nadpis). */
function ScreenHost({ children }: { children: JSX.Element }): JSX.Element {
  return children;
}
