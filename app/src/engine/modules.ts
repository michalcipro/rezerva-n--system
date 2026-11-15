import type { ClinicState, ModuleSettings, TemplateKey } from '../domain/types';

/**
 * Moduly provozovny (`settings.modules`): skupinové lekce, permanentky, kredit a marketing.
 * Vypnutý modul se v aplikaci ani v klientském portálu neukazuje a engine odmítne jeho příkazy.
 * Data (prodané permanentky, zůstatky kreditu, rozvrh, kampaně) zůstávají – po zapnutí je vše zpět.
 *
 * Soubor importuje jen typy, aby ho mohly použít selektory i příkazy bez cyklických závislostí.
 */

export type ModuleId = keyof ModuleSettings;

export const MODULE_IDS: readonly ModuleId[] = ['groups', 'packages', 'credit', 'marketing'];

/** Je modul zapnutý? Chybějící nastavení (starší data) znamená zapnuto. */
export function moduleOn(s: Pick<ClinicState, 'settings'>, id: ModuleId): boolean {
  return s.settings.modules?.[id] !== false;
}

/** Všechny moduly najednou (chybějící = zapnuto). */
export function modulesOf(s: Pick<ClinicState, 'settings'>): ModuleSettings {
  return { groups: moduleOn(s, 'groups'), packages: moduleOn(s, 'packages'), credit: moduleOn(s, 'credit'), marketing: moduleOn(s, 'marketing') };
}

/** Chyba příkazu, který patří k vypnutému modulu. */
export const MODULE_OFF: Readonly<Record<ModuleId, string>> = {
  groups: 'Skupinové lekce jsou v nastavení vypnuté.',
  packages: 'Permanentky jsou v nastavení vypnuté.',
  credit: 'Kredit je v nastavení vypnutý.',
  marketing: 'Marketing (kampaně a obchodní sdělení) je v nastavení vypnutý.',
};

export interface ModuleInfo {
  id: ModuleId;
  label: string;
  /** Jedna věta: co modul přináší. */
  description: string;
}

/** Popis modulů pro nastavení provozovny (a přehled šablon oborů). */
export const MODULES: readonly ModuleInfo[] = [
  {
    id: 'groups',
    label: 'Skupinové lekce',
    description: 'Pravidelný rozvrh lekcí s kapacitou – klienti se přihlašují online a při plné lekci čekají na uvolněné místo.',
  },
  {
    id: 'packages',
    label: 'Permanentky',
    description: 'Balíčky vstupů za zvýhodněnou cenu s platností a omluvenkami – prodej na recepci i v klientském portálu.',
  },
  {
    id: 'credit',
    label: 'Kredit',
    description: 'Předplacená peněženka klienta – dobití s bonusem, platba termínů a permanentek z kreditu.',
  },
  {
    id: 'marketing',
    label: 'Marketing',
    description: 'E-mailové kampaně, reaktivace, přání k narozeninám a poděkování po návštěvě – jen klientům se souhlasem.',
  },
];

/**
 * Automatická zpráva, která patří k modulu (vypnutý modul ji neposílá a Komunikace ji nenabízí).
 * Marketingové šablony odpovídají `MARKETING_TEMPLATES` v messages.ts (hlídá test).
 */
export function templateModule(key: TemplateKey): ModuleId | null {
  switch (key) {
    case 'after_visit':
    case 'reactivation':
    case 'birthday':
      return 'marketing';
    case 'package_low':
    case 'package_expiring':
      return 'packages';
    default:
      return null;
  }
}

/** Používá provozovna tuto automatickou zprávu (její modul je zapnutý)? */
export function templateInUse(s: Pick<ClinicState, 'settings'>, key: TemplateKey): boolean {
  const m = templateModule(key);
  return !m || moduleOn(s, m);
}
