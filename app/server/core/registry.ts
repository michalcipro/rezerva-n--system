import type { ActorRole, Command } from '../../src/domain/types';
import * as C from '../../src/engine/commands';
import { runProcesses } from '../../src/engine/processes';

/**
 * Příkazy, které smí API spustit, a role, které je smí volat. Engine navíc sám hlídá, že klient jedná
 * jen za sebe (rezervace, platby, čekací listina…). Testovací hodiny a interní příkazy tu nejsou.
 */

type AnyCommand = Command<any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface CommandEntry {
  run: AnyCommand;
  roles: readonly ActorRole[];
}

const STAFF: readonly ActorRole[] = ['owner', 'reception', 'therapist'];
const FRONT: readonly ActorRole[] = ['owner', 'reception'];
const OWNER: readonly ActorRole[] = ['owner'];
const ALL: readonly ActorRole[] = ['owner', 'reception', 'therapist', 'client'];

const entry = (run: AnyCommand, roles: readonly ActorRole[]): CommandEntry => ({ run, roles });

export const COMMANDS: Record<string, CommandEntry> = {
  // klienti
  createClient: entry(C.createClient, STAFF),
  updateClient: entry(C.updateClient, ALL),
  setConsent: entry(C.setConsent, ALL),
  addClinicalNote: entry(C.addClinicalNote, STAFF),
  // rezervace
  createBooking: entry(C.createBooking, ALL),
  cancelBooking: entry(C.cancelBooking, ALL),
  rescheduleBooking: entry(C.rescheduleBooking, ALL),
  updateBookingNote: entry(C.updateBookingNote, ALL),
  markCompleted: entry(C.markCompleted, STAFF),
  settleBooking: entry(C.settleBooking, STAFF),
  markNoShow: entry(C.markNoShow, STAFF),
  payFee: entry(C.payFee, STAFF),
  waiveFee: entry(C.waiveFee, FRONT),
  // QR platby
  createPaymentRequest: entry(C.createPaymentRequest, ALL),
  cancelPaymentRequest: entry(C.cancelPaymentRequest, ALL),
  notifyPaymentSent: entry(C.notifyPaymentSent, ALL),
  receiveQrPayment: entry(C.receiveQrPayment, STAFF),
  confirmPaymentRequest: entry(C.confirmPaymentRequest, FRONT),
  // permanentky a kredit
  sellPackage: entry(C.sellPackage, ALL),
  topUpCredit: entry(C.topUpCredit, ALL),
  extendPackage: entry(C.extendPackage, FRONT),
  cancelPackage: entry(C.cancelPackage, FRONT),
  adjustCredit: entry(C.adjustCredit, FRONT),
  // čekací listina
  joinWaitlist: entry(C.joinWaitlist, ALL),
  leaveWaitlist: entry(C.leaveWaitlist, ALL),
  acceptWaitlistOffer: entry(C.acceptWaitlistOffer, ALL),
  declineWaitlistOffer: entry(C.declineWaitlistOffer, ALL),
  // katalog, tým a směny
  upsertService: entry(C.upsertService, FRONT),
  upsertCategory: entry(C.upsertCategory, FRONT),
  upsertTherapist: entry(C.upsertTherapist, FRONT),
  setServiceTherapists: entry(C.setServiceTherapists, FRONT),
  upsertPackageTemplate: entry(C.upsertPackageTemplate, FRONT),
  upsertGroupTemplate: entry(C.upsertGroupTemplate, FRONT),
  cancelSession: entry(C.cancelSession, FRONT),
  addTimeOff: entry(C.addTimeOff, FRONT),
  removeTimeOff: entry(C.removeTimeOff, FRONT),
  // nastavení a komunikace
  updateSettings: entry(C.updateSettings, OWNER),
  updateTemplate: entry(C.updateTemplate, FRONT),
  saveCampaign: entry(C.saveCampaign, FRONT),
  deleteCampaign: entry(C.deleteCampaign, FRONT),
  sendCampaign: entry(C.sendCampaign, FRONT),
  scheduleCampaign: entry(C.scheduleCampaign, FRONT),
  sendManualMessage: entry(C.sendManualMessage, FRONT),
};

/** Příkazy, které spouští jen server sám (automatika, doručení zpráv). */
export const SYSTEM_COMMANDS: Record<string, AnyCommand> = {
  runProcesses: runProcesses as AnyCommand,
  recordDeliveries: C.recordDeliveries,
  confirmPaymentRequest: C.confirmPaymentRequest,
};

/** Doplní další příkazy (např. import a GDPR z vlastních modulů). */
export function registerCommands(extra: Record<string, CommandEntry>): void {
  Object.assign(COMMANDS, extra);
}

export function commandFor(name: string, role: ActorRole): CommandEntry | 'unknown' | 'forbidden' {
  const e = Object.prototype.hasOwnProperty.call(COMMANDS, name) ? COMMANDS[name] : undefined;
  if (!e) return 'unknown';
  return e.roles.includes(role) ? e : 'forbidden';
}
