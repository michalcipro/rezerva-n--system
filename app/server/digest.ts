import { LICENSE_PLAN_LABEL } from '../src/api/license';
import type { LicenseDigestItem } from './api';
import type { Messenger } from './providers';

/** E-mail vlastníkovi platformy: kterým provozovnám licence končí nebo skončila. */
export function licenseDigestText(items: LicenseDigestItem[], appUrl?: string): { subject: string; text: string } {
  const label: Record<LicenseDigestItem['state'], string> = {
    ok: 'platná',
    expiring: 'končí',
    grace: 'po konci platnosti (lhůta)',
    readonly: 'jen pro čtení',
    blocked: 'pozastavená',
  };
  const czDate = (d: string | null): string => (d ? d.split('-').reverse().map((x) => String(Number(x))).join('. ') : 'bez omezení');
  const lines = items.map((i) => {
    const days = i.daysLeft === null ? '' : i.daysLeft >= 0 ? ` – zbývá ${i.daysLeft} d.` : ` – ${-i.daysLeft} d. po konci`;
    const owner = i.owners.map((o) => `${o.name} <${o.email}>`).join(', ');
    return `• ${i.name} (/${i.slug}): ${LICENSE_PLAN_LABEL[i.plan]} licence do ${czDate(i.validUntil)} – ${label[i.state]}${days}${owner ? `\n  majitel: ${owner}` : ''}`;
  });
  const subject = `Licence ke kontrole: ${items.length} ${items.length === 1 ? 'provozovna' : items.length < 5 ? 'provozovny' : 'provozoven'}`;
  const text = [
    'Dobrý den,',
    '',
    'tyto provozovny mají licenci, která brzy končí nebo už skončila:',
    '',
    ...lines,
    '',
    `Prodloužení: konzole platformy${appUrl ? ` ${appUrl.replace(/\/$/, '')}/platforma` : ' (/platforma)'} → Upravit → „+ měsíc“ / „+ rok“.`,
    'Po 14 dnech od konce platnosti přejde provozovna do režimu jen pro čtení.',
  ].join('\n');
  return { subject, text };
}

export function licenseDigestMailer(messenger: Messenger, admins: string[], appUrl?: string): (items: LicenseDigestItem[]) => Promise<void> {
  return async (items) => {
    const { subject, text } = licenseDigestText(items, appUrl);
    for (const to of admins) await messenger.sendEmail({ to, subject, text, fromName: 'Správa platformy' });
  };
}
