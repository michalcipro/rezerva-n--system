import type { ClinicState, LocalDate, Therapist } from '../domain/types';
import { DEFAULT_THERAPISTS, createBaseState } from './defaults';

/**
 * Šablony oborů pro novou provozovnu na platformě. Šablona určí výchozí katalog služeb, permanentky,
 * skupinové lekce, názvosloví (klinika × studio × salon, terapeut × trenér…) a zapnuté moduly.
 * Všechno se pak dá v aplikaci upravit – šablona je jen rychlý start.
 */

export type PresetId = 'fyzio' | 'masaze' | 'fitness' | 'beauty' | 'prazdna';

export interface PresetInfo {
  id: PresetId;
  name: string;
  description: string;
}

export const PRESETS: readonly PresetInfo[] = [
  { id: 'fyzio', name: 'Fyzioterapie a rehabilitace', description: 'Vstupní vyšetření, terapie, přístroje, permanentky a skupinová cvičení.' },
  { id: 'masaze', name: 'Masáže a wellness', description: 'Masáže různých délek, dárkové a zvýhodněné permanentky.' },
  { id: 'fitness', name: 'Fitness a osobní trenéři', description: 'Osobní tréninky, skupinové lekce s kapacitou, permanentky a kredit.' },
  { id: 'beauty', name: 'Kosmetika a beauty', description: 'Kosmetická ošetření, manikúra, řasy a obočí – bez skupinových lekcí.' },
  { id: 'prazdna', name: 'Prázdná provozovna', description: 'Bez služeb a ceníku – vše nastavíte sami.' },
];

export const isPresetId = (v: unknown): v is PresetId => typeof v === 'string' && PRESETS.some((p) => p.id === v);

export interface PresetOptions {
  /** Název provozovny (zobrazuje se klientům). */
  businessName: string;
  /** Jméno majitele – stane se prvním členem týmu, kterému patří všechny služby. */
  ownerName: string;
  ownerEmail?: string;
  /** Od kdy platí pravidelné skupinové lekce. */
  today: LocalDate;
}

export const OWNER_STAFF_ID = 't_owner';

function ownerStaff(o: PresetOptions, roomId: string): Therapist {
  const parts = o.ownerName.trim().split(/\s+/).filter(Boolean);
  const lastName = parts.length > 1 ? parts.pop() ?? '' : '';
  const template = DEFAULT_THERAPISTS[0];
  return {
    id: OWNER_STAFF_ID,
    title: '',
    firstName: parts.join(' ') || o.ownerName.trim() || 'Majitel',
    lastName,
    focus: '',
    roomId,
    tone: 'teal',
    email: o.ownerEmail?.trim().toLowerCase() ?? '',
    workingHours: JSON.parse(JSON.stringify(template.workingHours)) as Therapist['workingHours'],
    breaks: JSON.parse(JSON.stringify(template.breaks)) as Therapist['breaks'],
    active: true,
    order: 0,
  };
}

/**
 * Výchozí stav nové provozovny podle oboru. Tým tvoří jen majitel (další lidi přidá v Tým a směny),
 * ukázkoví terapeuti ani klienti v něm nejsou.
 */
export function createPresetState(id: PresetId, o: PresetOptions): ClinicState {
  const s = createBaseState(o.today);
  s.settings.clinicName = o.businessName.trim();
  s.settings.clinicTagline = '';
  s.settings.senderName = o.businessName.trim();
  s.settings.preset = id;
  const room = s.rooms[0]?.id ?? '';
  s.therapists = [ownerStaff(o, room)];
  for (const svc of s.services) svc.therapistIds = [OWNER_STAFF_ID];
  for (const g of s.groupTemplates) g.therapistId = OWNER_STAFF_ID;
  if (id === 'prazdna') {
    s.categories = [];
    s.services = [];
    s.packageTemplates = [];
    s.groupTemplates = [];
  }
  return s;
}
