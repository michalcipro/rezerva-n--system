import { useMemo } from 'react';
import type { ClinicState, LocalDateTime, ModuleSettings } from '../../domain/types';
import { countLabel, formatMoney } from '../../engine/format';
import { MODULES, type ModuleId } from '../../engine/modules';
import { packageUsage } from '../../engine/selectors';
import { dateOf } from '../../engine/time';
import { useNow } from '../../store/hooks';
import { Icon, Switch, type IconName } from '../../ui';
import { creditBalances } from './helpers';

const ICON: Record<ModuleId, IconName> = { groups: 'users', packages: 'ticket', credit: 'wallet', marketing: 'mail' };

/** Co se po vypnutí stane (vždy stejné). */
const WHEN_OFF: Record<ModuleId, string> = {
  groups: 'Skupinové lekce zmizí z menu, z kalendáře i z portálu a nové přihlášky nepůjdou.',
  packages: 'Permanentky se přestanou nabízet v aplikaci i v portálu a nepůjdou prodat ani použít k platbě.',
  credit: 'Kredit se přestane nabízet v aplikaci i v portálu a nepůjde dobít ani jím platit.',
  marketing: 'Kampaně a obchodní sdělení zmizí z Komunikace a automaticky se nepošlou.',
};

/** Co vypnutí modulu znamená pro data provozovny (jen když nějaká jsou). */
function offImpact(clinic: ClinicState, now: LocalDateTime): Record<ModuleId, string> {
  const today = dateOf(now);
  const lessons = clinic.groupTemplates.filter((t) => t.active && (!t.validTo || t.validTo >= today)).length;
  const signedUp = clinic.bookings.filter((b) => b.sessionId && b.status === 'confirmed' && b.start > now).length;
  const packages = clinic.packages.filter((p) => {
    const u = packageUsage(clinic, p, today);
    return !u.expired && u.free + u.reserved > 0;
  }).length;
  let credit = 0;
  let creditClients = 0;
  for (const v of creditBalances(clinic).values()) {
    if (v > 0) {
      credit += v;
      creditClients++;
    }
  }
  const scheduled = clinic.campaigns.filter((c) => c.status === 'scheduled').length;
  return {
    groups:
      (lessons ? `Rozvrh (${countLabel(lessons, ['pravidelná lekce', 'pravidelné lekce', 'pravidelných lekcí'])}) se přestane zobrazovat a nabízet. ` : '') +
      (signedUp ? `Přihlášky na nadcházející lekce (${signedUp}) zůstanou platné, ale v kalendáři je neuvidíte – lekce raději nejdřív zrušte.` : ''),
    packages: packages
      ? `Aktivní permanentky klientů (${packages}) zůstanou vidět v kartě klienta i v portálu, ale nepůjde je použít k rezervaci – po zapnutí budou zase k dispozici.`
      : '',
    credit:
      (credit > 0
        ? `Zůstatky kreditu (${formatMoney(credit)} u ${countLabel(creditClients, ['klienta', 'klientů', 'klientů'])}) zůstanou vidět, ale nepůjde je použít. `
        : '') + 'Vratky za zrušené předplacené termíny se i tak připíší na kredit klienta.',
    marketing: scheduled
      ? `Naplánované kampaně (${scheduled}) se neodešlou, dokud marketing znovu nezapnete – potom odejdou hned. Pokud je nechcete poslat, zrušte jejich naplánování ještě před vypnutím.`
      : '',
  };
}

/**
 * Nastavení → Moduly: části systému, které provozovna používá. Vypnutý modul zmizí z aplikace
 * i z klientského portálu a engine odmítne jeho příkazy; data zůstávají.
 */
export function ModulesSection({
  modules,
  onChange,
  clinic,
}: {
  modules: ModuleSettings;
  onChange: (patch: Partial<ModuleSettings>) => void;
  clinic: ClinicState;
}): JSX.Element {
  const now = useNow();
  const impact = useMemo(() => offImpact(clinic, now), [clinic, now]);
  const set = (id: ModuleId, value: boolean): void => {
    const patch: Partial<ModuleSettings> = {};
    patch[id] = value;
    onChange(patch);
  };
  return (
    <div className="set-rows">
      {MODULES.map((m) => (
        <div key={m.id} className="set-row set-row--switch">
          <Switch
            checked={modules[m.id]}
            onChange={(v) => set(m.id, v)}
            label={
              <span className="set-module__label">
                <Icon name={ICON[m.id]} size={16} />
                {m.label}
              </span>
            }
            description={m.description}
          />
          {!modules[m.id] && (
            <p className="set-footnote set-feature-note" aria-live="polite">
              <Icon name="eyeOff" size={14} />
              <span>
                {WHEN_OFF[m.id]} {impact[m.id]}
              </span>
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
