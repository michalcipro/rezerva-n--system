import type { Booking, ClinicState, Id, LocalDateTime } from '../../src/domain/types';
import { isOccupying } from '../../src/engine/selectors';
import { addDays, dateOf } from '../../src/engine/time';

/**
 * Pohled na stav kliniky pro přihlášeného klienta. Obsahuje katalog a nastavení, jeho vlastní záznamy
 * a obsazenost ostatních termínů BEZ osobních údajů (kdo, za kolik, poznámky). Portál nad tímto pohledem
 * počítá volné termíny stejně jako nad celým stavem – engine potřebuje jen čas, terapeuta a lekci.
 */
export function projectForClient(s: ClinicState, clientId: Id, now: LocalDateTime): ClinicState {
  const own = <T extends { clientId: Id | null }>(list: readonly T[]): T[] => list.filter((x) => x.clientId === clientId);
  // ostatní rezervace jen od včerejška dál a jen ty, které obsazují termín
  const from = addDays(dateOf(now), -1);
  const anonymous = (b: Booking): Booking => ({
    id: b.id,
    clientId: '',
    serviceId: b.serviceId,
    therapistId: b.therapistId,
    roomId: b.roomId,
    start: b.start,
    end: b.end,
    sessionId: b.sessionId,
    status: b.status,
    createdAt: b.start,
    createdBy: 'staff',
    channel: 'recepce',
    price: 0,
    payment: { method: 'onsite', paid: false, paidAmount: 0 },
    note: '',
  });
  const bookings = s.bookings
    .filter((b) => b.clientId === clientId || (isOccupying(b.status) && b.start.slice(0, 10) >= from))
    .map((b) => (b.clientId === clientId ? b : anonymous(b)));

  return {
    ...s,
    therapists: s.therapists.map((t) => ({ ...t, email: '' })),
    timeOff: s.timeOff.map((t) => ({ ...t, reason: '' })),
    clients: s.clients.filter((c) => c.id === clientId).map((c) => ({ ...c, notes: [], internalNote: '' })),
    bookings,
    packages: own(s.packages),
    makeups: own(s.makeups),
    ledger: own(s.ledger),
    payments: own(s.payments),
    paymentRequests: own(s.paymentRequests),
    waitlist: own(s.waitlist),
    messages: own(s.messages),
    campaigns: [],
    audit: [],
  };
}
