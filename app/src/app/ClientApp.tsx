import { SERVER_MODE } from '../api/config';
import { ClientPortal } from '../portal';
import { SyncBanner } from './AdminApp';
import { LicenseBanner } from './LicenseBanner';
import { TestBar } from './TestBar';

/** Pohled klienta: testovací panel + mobilní klientský portál. */
export function ClientApp(): JSX.Element {
  return (
    <div className="client-app">
      {SERVER_MODE ? (
        <>
          <LicenseBanner audience="client" />
          <SyncBanner />
        </>
      ) : (
        <TestBar compact />
      )}
      <ClientPortal />
    </div>
  );
}
