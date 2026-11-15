# Univerzální rezervační platforma

Jedna instalace (jeden kód, jedna databáze, jeden server) obsluhuje libovolný počet **provozoven**
(zákazníků): fyzioterapeutické kliniky, masážní a wellness studia, fitness a osobní trenéry,
kosmetické salony… Každá provozovna má vlastní data, tým, klienty, vzhled, názvosloví, moduly
a právní texty. **Platformu vlastní a licencuje Nexum Care s.r.o.**; zákazník platí měsíční,
roční nebo doživotní licenci (viz [business/cenik-a-licence.md](business/cenik-a-licence.md)).

Nic se pro zákazníka neprogramuje – přizpůsobení je nastavení v konzoli platformy a v nastavení provozovny.

## Jak to funguje

| Co | Kde se nastavuje | Kdo |
|---|---|---|
| Založení provozovny, obor (šablona), majitel | konzole `/platforma` → Nová provozovna | vlastník platformy |
| Licence: druh, platnost, pozastavení, poznámka (smlouva, faktura) | konzole → Upravit | vlastník platformy |
| Adresa `/<slug>` a vlastní domény | konzole → Upravit | vlastník platformy |
| Napojení na banku (token Fio) | konzole → Upravit → Banka | vlastník platformy (token dodá zákazník) |
| Vzhled: barva značky, logo | Nastavení → Vzhled | majitel provozovny (nebo vy přes podporu) |
| Názvosloví: klinika / studio / salon, terapeut / trenér / kosmetička… | Nastavení → Názvosloví | majitel |
| Moduly: skupinové lekce, permanentky, kredit, marketing | Nastavení → Moduly | majitel |
| Služby, ceník, tým, pracovní doby, storno podmínky, platby, šablony zpráv | Nastavení, Služby, Tým | majitel |
| Obchodní podmínky a zásady ochrany údajů provozovny | Nastavení → Právní texty | majitel (texty od jeho advokáta) |
| Fakturační údaje: obchodní firma / jméno, IČO (tlačítko „Načíst z ARES“), DIČ a plátce DPH, údaj o zápisu v rejstříku, sídlo, adresa provozovny, kontakt pro klienty, e-mail pro faktury od platformy | Nastavení → Fakturační údaje | jen majitel (ostatním rolím se sekce nezobrazuje) |
| Spuštění online rezervací: kontrolní seznam (fakturační údaje, e-mail odesílatele, účet pro QR platby, aktivní služba, pracovní doby, právní texty; vzhled nepovinně) a tlačítko „Spustit online rezervace“; pozastavení | Přehled → Spuštění online rezervací; pozastavení v Nastavení → Rezervace online | jen majitel |
| Přístupy týmu | Tým a směny → Přístupy do systému | majitel |
| Import klientů, permanentek, kreditů | Nastavení → Import dat | majitel / recepce |
| Export všech dat (záloha, přechod jinam) | Nastavení → Export dat | majitel |

**Podpora:** vlastník platformy se do každé provozovny přihlásí s právy majitele (stačí otevřít její adresu
a přihlásit se svým e-mailem). Jeho změny jsou v historii označené „podpora platformy“.

### Adresy
- `https://<adresa platformy>/<slug>` – každá provozovna hned po založení (bez DNS).
- `https://rezervace.<domena-zakaznika>.cz` – volitelně vlastní doména: u zákazníka CNAME na web platformy,
  v Cloudflare Pages přidat doménu, v konzoli u provozovny doplnit doménu a doménu přidat do `ALLOWED_ORIGINS`.
- `https://<adresa platformy>/platforma` – konzole vlastníka platformy.

### Šablony oborů
| Šablona | Názvosloví | Moduly | Katalog |
|---|---|---|---|
| `fyzio` | klinika / terapeut | vše | 15 služeb, 5 permanentek, 4 skupinové lekce týdně |
| `masaze` | studio / masér | bez skupinových lekcí | 9 služeb, 3 permanentky; storno 24 h, potom 50 % |
| `fitness` | studio / trenér | vše | 9 služeb (4 skupinové), 4 permanentky, 8 lekcí týdně |
| `beauty` | salon / kosmetička | bez skupinových lekcí | 15 služeb, 3 permanentky; nedostavení 100 % |
| `prazdna` | provozovna / specialista | bez marketingu | prázdný katalog |

Šablona připraví služby, ceník, permanentky, skupinové lekce, storno podmínky, názvosloví, moduly a texty zpráv;
tým tvoří jen majitel (poskytuje všechny služby). Vše se pak upraví v aplikaci.

### Názvosloví a moduly
- **Názvosloví** (Nastavení → Názvosloví): jak aplikace, portál a zprávy říkají provozovně (klinika, studio, salon,
  centrum, provozovna, ordinace, praxe) a lidem, kteří služby poskytují (terapeut, fyzioterapeut, masér, trenér,
  lektor, instruktor, specialista, kosmetička, kadeřník, kadeřnice) – ve všech pádech.
- **Moduly** (Nastavení → Moduly): skupinové lekce, permanentky, kredit, marketing. Vypnutý modul zmizí z menu,
  z obrazovek i z portálu a server odmítne jeho příkazy; data zůstanou a po zapnutí se vrátí.

### Licence
| Stav | Kdy | Co se děje |
|---|---|---|
| Aktivní | platnost běží (u doživotní licence zaplacený provoz a podpora) | vše funguje |
| Brzy končí | 14 dní před koncem | majitel vidí upozornění |
| Po konci platnosti | 14 dní po konci | vše funguje, výrazné upozornění |
| Jen pro čtení | potom | data lze prohlížet a exportovat; nové rezervace a změny ne (klient smí rušit termíny, odvolat souhlas, odstoupit od smlouvy) |
| Pozastaveno | ručně v konzoli (neplacení, ukončení) | tým ani klienti se nepřihlásí; majitel data jen prohlíží a exportuje; automatika neběží |

Prodloužení: konzole → Upravit → „+ měsíc“ / „+ rok“ (nebo datum) → Uložit. U doživotní licence je datum konec
zaplaceného provozu a podpory (první rok je v licenčním poplatku, potom roční poplatek → „+ rok“); bez data je provoz
neomezený (např. vlastní hosting zákazníka).

**Export dat:** majitel si kdykoli (i v režimu jen pro čtení a při pozastavení) stáhne všechna data provozovny –
Nastavení → Export dat (JSON s popisem struktury, CSV klientů, rezervací, plateb, permanentek a kreditu).
Jednou denně vám (`PLATFORM_ADMIN_EMAILS`) přijde e-mail se seznamem provozoven, kterým licence končí do 14 dní
nebo už skončila – podklad pro fakturu a prodloužení (adresu konzole v e-mailu určuje `PUBLIC_APP_URL`).

## Založení nového zákazníka (technicky)
1. Konzole → **Nová provozovna**: název, adresa, obor, jméno a e-mail majitele, licence a platnost.
2. Majiteli pošlete adresu `https://<platforma>/<slug>` – přihlásí se svým e-mailem (kód z e-mailu).
3. S majitelem (nebo za něj přes podporu): Nastavení → Fakturační údaje (IČO → Načíst z ARES), Vzhled, Názvosloví,
   Moduly, Platby (číslo účtu), Služby a ceník, Tým a směny (+ přístupy pro recepci a tým), Storno podmínky,
   Šablony zpráv, Právní texty. Nakonec Přehled → Spuštění online rezervací: nová provozovna začíná nespuštěná
   (klienti v portálu vidí „Online rezervace připravujeme“, personál rezervuje normálně) a engine spuštění
   bez povinných kroků kontrolního seznamu odmítne.
4. Import dat ze stávajícího systému (Nastavení → Import dat).
5. Volitelně: token Fio (konzole), vlastní doména.
Celý obchodní a právní postup je v [business/onboarding-zakaznika.md](business/onboarding-zakaznika.md).

## Technika
- **Databáze:** `app.clinics` (provozovny: slug, licence), `app.clinic_domains`, `app.clinic_secrets`
  (šifrované AES-GCM klíčem `SECRETS_KEY`), stav každé provozovny po částech v `app.state_chunks`.
  Migrace: `supabase/migrations/20261113000000_init.sql` a `20261115000000_platform.sql`.
- **Server** pozná provozovnu podle hlavičky `x-tenant` (slug z adresy) nebo `x-tenant-host` (vlastní doména);
  role a data jsou vždy jen v rámci provozovny. Vlastník platformy = e-mail v `PLATFORM_ADMIN_EMAILS`.
- **Automatika** (`/api/cron`) běží pro všechny provozovny kromě pozastavených; párování plateb používá token
  dané provozovny.
- **ARES** (`GET /api/ares?ico=…`, personál provozovny): server se ptá veřejného REST API ARES
  (`ares.gov.cz/ekonomicke-subjekty-v-be/rest`, bez klíče) s časovým limitem 8 s a krátkou cache (10 min);
  vrátí obchodní jméno, sídlo, DIČ, plátce DPH, právní formu a údaj o zápisu. Formulář jen doplní – uloží majitel.
- **Patička automatických e-mailů** nese identifikaci provozovny z fakturačních údajů (firma, sídlo, IČO, zápis
  v rejstříku), jakmile jsou úplné; klientský portál ukazuje kontakt (adresa, telefon, e-mail, web).
- **E-maily** odcházejí z jedné ověřené adresy platformy (`MAIL_FROM`) se jménem provozovny jako odesílatele
  a s odpovědí na e-mail provozovny (Nastavení → Provozovna). Přihlašovací kódy posílá Supabase Auth se
  společnou šablonou platformy.
- **SMS se nepoužívají** – s klienty se komunikuje jen e-mailem. Kód pro SMS zůstává vypnutý přepínačem
  `SMS_ENABLED` v `src/engine/channels.ts` (platí pro celou platformu, není to nastavení provozovny).
- **Instalace jen pro jednoho zákazníka** (např. doživotní licence s vlastním hostingem) je stejný kód:
  stačí jedna provozovna – adresa bez `/<slug>` pak vede přímo na ni.

## Proměnné prostředí
Server: viz [DEPLOY.md](DEPLOY.md) krok 3 (`PLATFORM_ADMIN_EMAILS`, `SECRETS_KEY`, `CRON_SECRET`, `ALLOWED_ORIGINS`,
`PUBLIC_API_URL`, `BREVO_API_KEY`, `MAIL_FROM`, `MAIL_FROM_NAME`; `SMS_SENDER` se nepoužívá – SMS platforma neposílá). Web: `VITE_API_URL`,
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, volitelně `VITE_PLATFORM_NAME` (název platformy v konzoli).
