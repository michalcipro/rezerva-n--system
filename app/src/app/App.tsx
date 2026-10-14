import { useEffect } from 'react';
import { Spinner, Toaster } from '../ui';
import { useStore } from '../store/hooks';
import { useSession } from '../store/session';
import { initStore, runSystemProcesses } from '../store/store';
import { AdminApp } from './AdminApp';
import { ClientApp } from './ClientApp';
import { Onboarding } from './Onboarding';

function useThemeAttribute(theme: 'system' | 'light' | 'dark'): void {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);
}

export function App(): JSX.Element {
  const status = useStore((s) => s.status);
  const busy = useStore((s) => s.busy);
  const error = useStore((s) => s.error);
  const simulatedNow = useStore((s) => s.clinic?.settings.simulatedNow ?? null);
  const session = useSession();
  useThemeAttribute(session.theme);

  useEffect(() => {
    void initStore();
  }, []);

  // automatické procesy: každou minutu a po posunu testovacích hodin
  useEffect(() => {
    if (status !== 'ready') return undefined;
    runSystemProcesses();
    const id = setInterval(runSystemProcesses, 60_000);
    return () => clearInterval(id);
  }, [status, simulatedNow]);

  let body: JSX.Element;
  if (status === 'loading') {
    body = (
      <div className="app-center" role="status" aria-live="polite">
        <Spinner />
        <p className="app-center__text">Načítám data kliniky…</p>
      </div>
    );
  } else if (status === 'error') {
    body = (
      <div className="app-center" role="alert">
        <p className="app-center__title">Data se nepodařilo načíst</p>
        <p className="app-center__text">{error ?? 'Obnovte prosím stránku.'}</p>
      </div>
    );
  } else if (status === 'empty') {
    body = <Onboarding />;
  } else {
    body = session.role === 'client' ? <ClientApp /> : <AdminApp />;
  }

  return (
    <>
      {body}
      {busy && (
        <div className="app-busy" role="status" aria-live="polite">
          <div className="app-busy__card">
            <Spinner />
            <span>{busy}</span>
          </div>
        </div>
      )}
      <Toaster />
    </>
  );
}
