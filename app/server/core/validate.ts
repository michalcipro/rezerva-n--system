import type { ActorRole } from '../../src/domain/types';

/**
 * Kontrola vstupů příkazů, které přicházejí přes API. Engine počítá s typy z TypeScriptu, ale ze sítě
 * může přijít cokoli – proto:
 *  - klientské příkazy mají přesný popis povolených polí (cokoli navíc je odmítnuté),
 *  - u personálu se hlídá jen tvar dat (objekt, rozumná hloubka, délky textů a seznamů).
 */

export type Check = (v: unknown) => boolean;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const ID_RE = /^[A-Za-z0-9_@.:-]{1,100}$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const DATETIME_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d$/;

export const V = {
  id: ((v) => typeof v === 'string' && ID_RE.test(v)) as Check,
  str: (max: number): Check => (v) => typeof v === 'string' && v.length <= max,
  bool: ((v) => typeof v === 'boolean') as Check,
  int: (min: number, max: number): Check => (v) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max,
  date: ((v) => typeof v === 'string' && DATE_RE.test(v)) as Check,
  dateTime: ((v) => typeof v === 'string' && DATETIME_RE.test(v)) as Check,
  oneOf: (...values: readonly unknown[]): Check => (v) => values.includes(v),
  nullable: (c: Check): Check => (v) => v === null || c(v),
  /** Objekt s přesně danými poli; klíč s otazníkem na konci je nepovinný. */
  obj: (shape: Record<string, Check>): Check => {
    const fields = Object.entries(shape).map(([k, check]) => ({ name: k.replace(/\?$/, ''), optional: k.endsWith('?'), check }));
    const allowed = new Set(fields.map((f) => f.name));
    return (v) => {
      if (!isObj(v)) return false;
      for (const k of Object.keys(v)) if (!allowed.has(k)) return false;
      for (const f of fields) {
        const val = v[f.name];
        if (val === undefined) {
          if (!f.optional) return false;
        } else if (!f.check(val)) return false;
      }
      return true;
    };
  },
};

const clientPayment = V.obj({
  method: V.oneOf('package', 'credit', 'online', 'onsite', 'qr', 'makeup'),
  'packageId?': V.id,
  'makeupId?': V.id,
});

/** Přesný tvar vstupu příkazů, které smí volat klient z portálu. */
export const CLIENT_INPUTS: Record<string, Check> = {
  updateClient: V.obj({
    clientId: V.id,
    patch: V.obj({
      'firstName?': V.str(80),
      'lastName?': V.str(80),
      'email?': V.str(254),
      'phone?': V.str(40),
      'birthDate?': V.nullable(V.date),
    }),
  }),
  setConsent: V.obj({ clientId: V.id, key: V.oneOf('gdpr', 'health', 'marketingEmail', 'sms'), value: V.bool }),
  createBooking: V.obj({
    clientId: V.id,
    serviceId: V.id,
    therapistId: V.id,
    start: V.dateTime,
    'sessionId?': V.id,
    payment: clientPayment,
    'note?': V.str(500),
  }),
  cancelBooking: V.obj({ bookingId: V.id, option: V.oneOf('free', 'excuse', 'grace', 'fee'), 'reason?': V.str(500) }),
  rescheduleBooking: V.obj({ bookingId: V.id, start: V.dateTime, 'therapistId?': V.id, 'sessionId?': V.id, 'useExcuse?': V.bool }),
  updateBookingNote: V.obj({ bookingId: V.id, note: V.str(500) }),
  createPaymentRequest: V.obj({
    clientId: V.id,
    purpose: V.oneOf('booking', 'package', 'credit_topup', 'storno_fee'),
    'bookingId?': V.id,
    'packageTemplateId?': V.id,
    'amount?': V.int(1, 100_000),
  }),
  cancelPaymentRequest: V.obj({ requestId: V.id }),
  notifyPaymentSent: V.obj({ requestId: V.id }),
  sellPackage: V.obj({ clientId: V.id, templateId: V.id, paidBy: V.oneOf('online', 'credit'), 'startDate?': V.date }),
  topUpCredit: V.obj({ clientId: V.id, amount: V.int(1, 100_000), method: V.oneOf('online') }),
  withdrawFromPackage: V.obj({ packageId: V.id }),
  joinWaitlist: V.obj({
    clientId: V.id,
    serviceId: V.id,
    therapistId: V.nullable(V.id),
    dateFrom: V.date,
    'dateTo?': V.date,
    'sessionId?': V.id,
    'note?': V.str(500),
  }),
  leaveWaitlist: V.obj({ entryId: V.id }),
  acceptWaitlistOffer: V.obj({ entryId: V.id, payment: clientPayment }),
  declineWaitlistOffer: V.obj({ entryId: V.id }),
};

export interface ShapeLimits {
  maxDepth: number;
  maxString: number;
  maxArray: number;
  maxKeys: number;
}

/** Limity tvaru dat od personálu; import dat smí poslat delší seznamy. */
export const STAFF_LIMITS: ShapeLimits = { maxDepth: 8, maxString: 20_000, maxArray: 2_000, maxKeys: 200 };
export const IMPORT_LIMITS: ShapeLimits = { maxDepth: 8, maxString: 20_000, maxArray: 20_000, maxKeys: 200 };

/** Jen „obyčejná“ JSON data v rozumných mezích (žádné obří texty, hloubky ani prototypové klíče). */
export function withinLimits(v: unknown, limits: ShapeLimits, depth = 0): boolean {
  if (v === null || typeof v === 'boolean') return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string') return v.length <= limits.maxString;
  if (depth >= limits.maxDepth) return false;
  if (Array.isArray(v)) return v.length <= limits.maxArray && v.every((x) => withinLimits(x, limits, depth + 1));
  if (isObj(v)) {
    const keys = Object.keys(v);
    if (keys.length > limits.maxKeys) return false;
    for (const k of keys) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') return false;
      if (!withinLimits(v[k], limits, depth + 1)) return false;
    }
    return true;
  }
  return false;
}

/** Ověří vstup příkazu pro danou roli. Vrací chybovou hlášku, nebo null. */
export function validateInput(name: string, role: ActorRole, input: unknown): string | null {
  if (!isObj(input)) return 'Neplatný vstup.';
  if (role === 'client') {
    const check = Object.prototype.hasOwnProperty.call(CLIENT_INPUTS, name) ? CLIENT_INPUTS[name] : undefined;
    if (!check) return 'Tuto akci nelze provést.';
    return check(input) ? null : 'Neplatný vstup.';
  }
  const limits = name.startsWith('import') ? IMPORT_LIMITS : STAFF_LIMITS;
  return withinLimits(input, limits) ? null : 'Vstup je příliš velký nebo nemá platný tvar.';
}
