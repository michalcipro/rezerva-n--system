import { ClientPortal } from '../portal';
import { TestBar } from './TestBar';

/** Pohled klienta: testovací panel + mobilní klientský portál. */
export function ClientApp(): JSX.Element {
  return (
    <div className="client-app">
      <TestBar compact />
      <ClientPortal />
    </div>
  );
}
