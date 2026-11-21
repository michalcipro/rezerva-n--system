import { renderEmailHtml } from './providers/render';
import type { OutgoingEmail } from './providers/types';

/**
 * Pozvánka majitele nové provozovny (POST /api/platform/tenants a …/tenants/:id/invite): kdo provozovnu
 * založil, její adresa, přihlášení kódem z e-mailu a co nastavit nejdřív. Prostý text i HTML ve stylu
 * ostatních e-mailů (renderEmailHtml).
 */

export interface TenantInvite {
  tenantName: string;
  slug: string;
  owner: { name: string; email: string };
  /** Veřejná adresa aplikace i s podadresářem (PUBLIC_APP_URL), např. https://…github.io/rezerva-n--system/app */
  appUrl: string;
  /** Kdo provozovnu založil – název platformy (PLATFORM_NAME). */
  platformName: string;
  /** Kontakt na podporu (SUPPORT_EMAIL) – nepovinný; na pozvánku se dá i odpovědět. */
  supportEmail?: string;
}

/** Adresa provozovny: PUBLIC_APP_URL (i s podadresářem) + /<slug>. */
export function tenantAppUrl(appUrl: string, slug: string): string {
  return `${appUrl.trim().replace(/\/+$/, '')}/${slug}`;
}

export function tenantInviteEmail(i: TenantInvite): OutgoingEmail {
  const url = tenantAppUrl(i.appUrl, i.slug);
  const support = i.supportEmail?.trim();
  const subject = `Pozvánka do rezervačního systému: ${i.tenantName}`;
  const text = [
    'Dobrý den,',
    '',
    `v rezervačním systému ${i.platformName} jsme pro vás založili provozovnu „${i.tenantName}“ s právy majitele. ` +
      'Než ji otevřete klientům, nastavíte v ní služby, tým a pravidla.',
    '',
    'Adresa provozovny:',
    url,
    '',
    'Jak se přihlásit:',
    '1. Otevřete adresu provozovny.',
    `2. Zadejte svůj e-mail ${i.owner.email}.`,
    '3. Přijde vám jednorázový kód – opište ho. Žádné heslo si nemusíte pamatovat.',
    '',
    'Co nastavit nejdřív:',
    '1. Fakturační údaje – Nastavení → Fakturační údaje (podle IČO je doplní tlačítko „Načíst z ARES“).',
    '2. Služby a ceník – zkontrolujte služby ze šablony oboru, nebo je přidejte (názvy, délky, ceny).',
    '3. Tým a pracovní doby – Tým a směny; tamtéž přidáte přístupy pro recepci a kolegy.',
    '4. Platby – Nastavení → Platby (číslo účtu pro QR platby).',
    '5. Právní texty – Nastavení → Právní texty (obchodní podmínky a informace o zpracování osobních údajů).',
    '6. Nakonec Přehled → „Spustit online rezervace“. Kontrolní seznam tam ukáže, co ještě chybí. ' +
      'Do spuštění si klienti online nerezervují, vy a tým termíny zapisujete normálně.',
    ...(support ? ['', `S nastavením rádi pomůžeme: ${support} (stačí odpovědět na tento e-mail).`] : []),
    '',
    'S pozdravem',
    i.platformName,
  ].join('\n');
  return {
    to: i.owner.email,
    toName: i.owner.name || undefined,
    subject,
    text,
    html: renderEmailHtml({ clinicName: i.platformName, subject, body: text }),
    fromName: i.platformName,
    replyTo: support || undefined,
  };
}
