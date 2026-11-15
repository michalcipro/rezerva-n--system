import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { ClinicState, Ctx } from '../src/domain/types';
import { updateSettings } from '../src/engine/commands';
import { createBaseState } from '../src/engine/defaults';
import { createPresetState, OWNER_STAFF_ID, PRESETS } from '../src/engine/presets';
import { normalizeState } from '../src/store/persistence';

const owner: Ctx = { now: '2026-11-15T10:00', actor: { role: 'owner', name: 'Majitel' } };

function tryUpdate(s: ClinicState, patch: Parameters<typeof updateSettings>[1]): { s: ClinicState; error: string | null } {
  let error: string | null = null;
  const next = produce(s, (d) => {
    const r = updateSettings(d as ClinicState, patch, owner);
    if (!r.ok) error = r.error;
  });
  return { s: error ? s : next, error };
}

describe('nastavení univerzální platformy', () => {
  it('moduly, vzhled, názvosloví a právní texty se ukládají s kontrolou', () => {
    const s = createBaseState('2026-01-01');
    expect(s.settings.modules).toEqual({ groups: true, packages: true, credit: true, marketing: true });
    let r = tryUpdate(s, { modules: { groups: false } });
    expect(r.error).toBeNull();
    expect(r.s.settings.modules).toEqual({ groups: false, packages: true, credit: true, marketing: true });

    expect(tryUpdate(s, { branding: { accent: 'red' } }).error).toMatch(/#RRGGBB/);
    expect(tryUpdate(s, { branding: { logo: 'data:text/html;base64,PHNjcmlwdD4=' } }).error).toMatch(/Logo/);
    r = tryUpdate(s, { branding: { accent: '#7C3AED', logo: 'data:image/png;base64,iVBORw0KGgo=' } });
    expect(r.s.settings.branding).toEqual({ accent: '#7C3AED', logo: 'data:image/png;base64,iVBORw0KGgo=' });

    const trener = {
      sg: ['trenér', 'trenéra', 'trenérovi', 'trenéra', 'trenérovi', 'trenérem'] as [string, string, string, string, string, string],
      pl: ['trenéři', 'trenérů', 'trenérům', 'trenéry', 'trenérech', 'trenéry'] as [string, string, string, string, string, string],
      gender: 'm' as const,
    };
    r = tryUpdate(s, { terms: { staff: trener } });
    expect(r.s.settings.terms.staff.sg[0]).toBe('trenér');
    expect(r.s.settings.terms.business.sg[0]).toBe('klinika');
    expect(tryUpdate(s, { terms: { staff: { ...trener, sg: ['', '', '', '', '', ''] } } }).error).toMatch(/Názvosloví/);

    r = tryUpdate(s, { legal: { terms: '# Obchodní podmínky' } });
    expect(r.s.settings.legal).toEqual({ terms: '# Obchodní podmínky', privacy: '', updatedAt: '2026-11-15T10:00' });
  });

  it('starší data bez nových částí nastavení dostanou výchozí hodnoty', () => {
    const s = JSON.parse(JSON.stringify(createBaseState('2026-01-01'))) as ClinicState;
    const raw = s.settings as unknown as Record<string, unknown>;
    delete raw.terms;
    delete raw.modules;
    delete raw.branding;
    delete raw.legal;
    const n = normalizeState(s);
    expect(n.settings.terms.staff.sg[0]).toBe('terapeut');
    expect(n.settings.modules.groups).toBe(true);
    expect(n.settings.branding).toEqual({ accent: null, logo: null });
  });

  it('každá šablona oboru založí provozovnu s majitelem jako jediným členem týmu', () => {
    for (const p of PRESETS) {
      const s = createPresetState(p.id, { businessName: 'Studio Test', ownerName: 'Jana Nováková', ownerEmail: 'Jana@Example.cz', today: '2026-11-15' });
      expect(s.settings.clinicName).toBe('Studio Test');
      expect(s.settings.preset).toBe(p.id);
      expect(s.therapists.map((t) => [t.id, t.firstName, t.lastName, t.email])).toEqual([[OWNER_STAFF_ID, 'Jana', 'Nováková', 'jana@example.cz']]);
      for (const svc of s.services) expect(svc.therapistIds).toEqual([OWNER_STAFF_ID]);
      expect(s.clients).toEqual([]);
    }
  });
});
