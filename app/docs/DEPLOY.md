# Nasazení platformy – krok za krokem

Návod pro **jednorázové** zprovoznění platformy (jedna instalace pro všechny zákazníky). Jak platforma funguje
a jak se zakládají a spravují provozovny zákazníků, je v [PLATFORM.md](PLATFORM.md); co je hotové v kódu,
v [PRODUCTION.md](PRODUCTION.md). Tady jsou kroky v účtech poskytovatelů (Supabase, Cloudflare, Brevo),
které za vás nikdo jiný udělat nemůže.

Odhad času: 2–3 hodiny (bez čekání na DNS).

**Nikdy neposílejte klíče e-mailem ani do chatu.** Tajné hodnoty se zadávají jen do nastavení služeb
(Supabase → Edge Functions → Secrets, Cloudflare → Environment variables) nebo do bezpečného formuláře.

---

## 0. Co budete potřebovat

| Služba | K čemu | Cena (orientačně) |
|---|---|---|
| Supabase (region **EU – Frankfurt**) | databáze, přihlášení, server | Pro plán 25 USD/měs. – zálohy a žádné uspávání projektu |
| Cloudflare Pages | web aplikace | zdarma |
| Brevo | e-maily | zdarma do 300/den |
| Fio banka (nepovinné) | automatické párování QR plateb | zdarma |
| Doména | např. `rezervace.klinika.cz` | u stávajícího registrátora |

> Bezplatný plán Supabase nemá zálohy a po týdnu nečinnosti projekt uspí – pro ostrý provoz nestačí.

---

## 1. Supabase – projekt a databáze

1. Na supabase.com založte organizaci a projekt: **Region: Central EU (Frankfurt)**, silné heslo databáze
   uložte do správce hesel.
2. **Databáze:** SQL Editor → New query → vložte celý obsah
   [`supabase/migrations/20261113000000_init.sql`](../../supabase/migrations/20261113000000_init.sql) → Run.
   (Nebo přes CLI: `supabase link --project-ref <ref>` a `supabase db push`.)
3. Kontrola: Table Editor ukazuje ve schématu `public` jen funkce `app_*`, tabulky jsou ve schématu `app`
   a API → Exposed schemas obsahuje jen `public` (a případně `graphql_public`) – **ne `app`**.
4. Project Settings → API: poznamenejte si **Project URL** a **veřejný klíč** (anon / publishable).
   Tajný klíč (service_role / secret) nikam nekopírujte – Edge Function ho dostává automaticky.

## 2. Supabase – přihlašování kódem z e-mailu

1. Authentication → Sign In / Providers → **Email**: zapnuto, *Confirm email* zapnuto,
   *Email OTP Length* 6, *Email OTP Expiration* 3600 s.
2. Authentication → URL Configuration → **Site URL**: adresa aplikace, např. `https://rezervace.klinika.cz`.
3. Authentication → Emails → **SMTP Settings** → Enable custom SMTP (výchozí SMTP Supabase posílá jen
   členům týmu a pár e-mailů za hodinu):
   - Host `smtp-relay.brevo.com`, port `587`
   - Username a heslo: Brevo → SMTP & API → SMTP (heslo je *SMTP key*, ne API klíč)
   - Sender email: adresa na ověřené doméně (krok 6), např. `rezervace@klinika.cz`; Sender name: název kliniky
4. Authentication → Emails → **Templates** – šablony *Magic Link* i *Confirm signup* musí obsahovat kód
   `{{ .Token }}` (aplikace se přihlašuje kódem, ne odkazem). Doporučený text obou:
   - Předmět: `Přihlašovací kód: {{ .Token }}`
   - Tělo:
     ```html
     <h2>Přihlášení do online rezervací</h2>
     <p>Váš jednorázový kód je:</p>
     <p style="font-size:28px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
     <p>Kód platí 1 hodinu. Pokud jste o přihlášení nežádali, e-mail můžete ignorovat.</p>
     ```
5. Authentication → Rate Limits: *Rate limit for sending emails* zvyšte (např. 100/h) – až po nastavení SMTP.

## 3. Supabase – server (Edge Function `api`)

1. Edge Functions → **Secrets** – přidejte:

   | Název | Hodnota |
   |---|---|
   | `PLATFORM_ADMIN_EMAILS` | váš e-mail (vlastník platformy), případně více oddělených čárkou |
   | `SECRETS_KEY` | náhodný řetězec (aspoň 32 znaků) – šifruje tokeny bank zákazníků; **neměňte ho** (staré tokeny by nešly přečíst) |
   | `CRON_SECRET` | náhodný řetězec (aspoň 32 znaků) |
   | `ALLOWED_ORIGINS` | adresa aplikace a vlastní domény zákazníků, např. `https://app.vase-platforma.cz,https://rezervace.klinika.cz` (počítá se jen původ – schéma a doména, bez cesty) |
   | `PUBLIC_API_URL` | `https://<ref>.supabase.co/functions/v1/api` |
   | `PUBLIC_APP_URL` | adresa aplikace i s případným podadresářem, např. `https://app.vase-platforma.cz` – odkaz v pozvánce majitele nové provozovny (`…/<slug>`) a v denním přehledu licencí (`…/platforma`); bez ní se pozvánky neposílají |
   | `BREVO_API_KEY` | API klíč z Brevo (`xkeysib-…`) – bez něj se zprávy jen řadí do fronty a pozvánky se neposílají |
   | `MAIL_FROM` | odesílací adresa na ověřené doméně, např. `rezervace@klinika.cz` |
   | `MAIL_FROM_NAME` | jméno odesílatele (jinak se bere název kliniky z nastavení) |
   | `PLATFORM_NAME` | nepovinné – název platformy v pozvánce majitele (kdo provozovnu založil, odesílatel), výchozí „Rezervační platforma“ |
   | `SUPPORT_EMAIL` | nepovinné – kontakt na podporu v pozvánce; odpovědi na pozvánku jdou sem |
   | `SMS_SENDER` | **nepoužívá se** – s klienty se komunikuje jen e-mailem, SMS jsou vypnuté (`SMS_ENABLED` v `src/engine/channels.ts`); nezadávejte |

   Náhodný řetězec vytvoříte např. příkazem `openssl rand -hex 32`. Pokud projekt používá nové klíče
   (`sb_publishable_…`, `sb_secret_…`) a starší klíče jsou vypnuté, přidejte i `APP_ANON_KEY` a `APP_SERVICE_KEY`.
2. Sestavení a nasazení (počítač s Node 22 a Supabase CLI, nebo GitHub Actions – workflow `Nasazení serveru`):
   ```bash
   cd app && npm ci && npm run build:edge && cd ..
   supabase login
   supabase functions deploy api --project-ref <ref> --no-verify-jwt
   ```
3. Kontrola: `https://<ref>.supabase.co/functions/v1/api/health` vrátí `{"ok":true,…}`.

## 4. Správa platformy a první provozovna

Otevřete `https://<adresa aplikace>/platforma` a přihlaste se e-mailem z `PLATFORM_ADMIN_EMAILS`.
V konzoli **Nová provozovna** založíte zákazníka: název, adresa (`/<slug>`), obor (šablona služeb,
názvosloví a modulů), majitel (e-mail, kterým se přihlásí) a licence. Majitel dostane pozvánku e-mailem
(potřebuje `BREVO_API_KEY`, `MAIL_FROM` a `PUBLIC_APP_URL`). Postup pro každého dalšího
zákazníka je v [PLATFORM.md](PLATFORM.md) a [business/onboarding-zakaznika.md](business/onboarding-zakaznika.md).

## 5. Automatika každých 5 minut (plánovač v databázi)

Database → Extensions: zapněte `pg_cron` a `pg_net`. Pak v SQL Editoru (doplňte `<ref>` a stejný `CRON_SECRET`):

```sql
select vault.create_secret('<CRON_SECRET>', 'rezervace_cron_secret');
select vault.create_secret('https://<ref>.supabase.co/functions/v1/api/cron', 'rezervace_cron_url');

select cron.schedule('rezervace-automatika', '*/5 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'rezervace_cron_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'rezervace_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);
```

Kontrola: Integrations → Cron → Jobs ukazuje běhy; odpovědi jsou v tabulce `net._http_response`.
Automatika: docházka po termínu, připomínky, propadání náhrad a nabídek z čekací listiny, odeslání zpráv, párování plateb.

## 6. Brevo – e-maily

1. Účet na brevo.com (na firmu, která systém provozuje – viz smlouva o zpracování).
2. Senders, Domains & Dedicated IPs → **Domains** → přidat doménu kliniky → u registrátora domény nastavte
   záznamy, které Brevo zobrazí (ověřovací kód, **DKIM**, **DMARC**, případně SPF). Bez ověřené domény
   budou e-maily padat do spamu.
3. SMTP & API → **API Keys** → vytvořit klíč (`xkeysib-…`) → do Supabase Secrets jako `BREVO_API_KEY`.
   SMTP key (`xsmtpsib-…`) patří do SMTP nastavení Supabase (krok 2.3).
4. Security → **Authorised IPs** → blokování neznámých IP vypněte (Edge Functions nemají pevnou IP adresu;
   jinak Brevo po 30 dnech začne vracet chybu 401).
5. SMS se nepoužívají – s klienty se komunikuje jen e-mailem. SMS kredit ani odesílatele SMS (Sender ID)
   v Brevo nezřizujte.

## 7. Fio banka – automatické párování QR plateb (nepovinné)

Každá provozovna má vlastní účet: zákazník v internetbankingu vytvoří token (Nastavení → API → Přidat nový
token → **Pouze sledovat účet**, platnost max. 180 dní) a vy ho vložíte v konzoli platformy u jeho provozovny
(Upravit → Banka). Uloží se šifrovaně (`SECRETS_KEY`). Token funguje asi 5 minut po potvrzení.
Do kalendáře si dejte připomínku obnovy tokenu před koncem platnosti. Bez tokenu potvrzuje platby recepce ručně.

Přeplatky se potvrdí na částku výzvy; rozdíl je třeba vyřešit ručně (server ho zapíše do logu).

## 8. Cloudflare Pages – web aplikace

1. Workers & Pages → Create → Pages → **Connect to Git** → repozitář.
2. Build settings: Framework preset *None*, Root directory `app`, Build command `npm ci && npm run build:prod`,
   Build output `dist-prod`.
3. Environment variables (Production):

   | Název | Hodnota |
   |---|---|
   | `NODE_VERSION` | `22` |
   | `VITE_API_URL` | `https://<ref>.supabase.co/functions/v1/api` |
   | `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | veřejný klíč projektu (anon / publishable) – smí být v prohlížeči |

4. Custom domains → adresa platformy (např. `app.vase-platforma.cz`), každá provozovna běží na `/<slug>`.
   Chce-li zákazník vlastní doménu (`rezervace.klinika.cz`): přidejte ji tady (CNAME na `<projekt>.pages.dev`),
   v konzoli platformy u provozovny (Upravit → Vlastní domény) a do `ALLOWED_ORIGINS`.
5. Bezpečnostní hlavičky jsou v [`public-prod/_headers`](../public-prod/_headers); pro užší pravidlo
   nahraďte v `connect-src` `https://*.supabase.co` konkrétní adresou projektu.

Dokud doména a Cloudflare Pages nejsou, může web dočasně běžet na GitHub Pages – viz
[krok 12](#12-provizorní-hosting-na-github-pages).

## 9. Právní texty

Návrhy jsou v [`docs/legal/`](legal/README.md) – **před zveřejněním je musí zkontrolovat advokát**.
Každá provozovna je správcem údajů svých klientů a má **vlastní** obchodní podmínky a zásady ochrany
údajů: majitel je vloží v Nastavení → Právní texty (klienti je vidí při registraci, přihlášení a v účtu).
Obecné stránky platformy (pro provozovny bez vlastních textů) se vytvoří z `docs/legal/zverejnit/`
(`obchodni-podminky.md`, `ochrana-osobnich-udaju.md`) jako `/obchodni-podminky.html` a `/ochrana-osobnich-udaju.html`;
koncept s poznámkami nebo s [doplňovanými údaji] build odmítne.

Smlouvy o zpracování s poskytovateli: Supabase (Dashboard → Organization → Legal Documents → DPA),
Brevo a Cloudflare (DPA jsou součástí podmínek – stáhnout a uložit). Se **každým zákazníkem**: licenční smlouva
([`legal/licencni-smlouva.md`](legal/licencni-smlouva.md)) a smlouva o zpracování
([`legal/smlouva-o-zpracovani.md`](legal/smlouva-o-zpracovani.md)).

## 10. Postup spuštění (doporučený)

**Fáze 1 – jen tým (1–2 týdny)**
- [ ] Majitel se přihlásí, v Nastavení vyplní údaje kliniky, odesílací e-mail pro odpovědi, storno podmínky
      a **číslo účtu pro QR platby** (Nastavení → Platby).
- [ ] Služby a ceník, tým a pracovní doba, permanentky a skupinové lekce podle skutečnosti.
- [ ] Tým a směny → Přístupy do systému: přidat recepci a terapeuty (přihlašují se svým e-mailem).
- [ ] Import klientů, permanentek a kreditů ze stávající evidence (Nastavení → Import dat).
- [ ] Komunikace → Šablony: projít texty e-mailů.
- [ ] Zkušební rezervace, zrušení, QR platba (malá částka), připomínka – ověřit, že e-maily chodí.

**Fáze 2 – klientský portál**
- [ ] Zveřejněné právní texty (krok 9).
- [ ] Odkaz na rezervace na webu kliniky, v e-mailech a na recepci.
- [ ] První týden denně kontrolovat Komunikace → Odeslané (neodeslané zprávy) a čekající QR platby.

## 11. Provoz

- **Stav:** `GET /api/health`; doporučený bezplatný monitoring (např. UptimeRobot) každých 5 minut.
- **Logy:** Supabase → Edge Functions → api → Logs (bez osobních údajů – jen názvy akcí a chyby).
- **Zálohy:** Supabase Pro dělá denní zálohy (7 dní). Pro delší historii zvažte doplněk PITR.
- **Aktualizace:** po změně kódu `npm run build:edge` + `supabase functions deploy api …`; web se nasadí
  sám po pushi do produkční větve. Nová migrace = nový soubor v `supabase/migrations/`.
- **Lokální vývoj:** `npm run dev:server` (API s ukázkovou provozovnou na :8787) a `npm run dev:live`
  (aplikace na :5173 – provozovna na `/pohyb`, správa platformy na `/platforma`, přihlášení bez e-mailu).

## 12. Provizorní hosting na GitHub Pages

Než bude doména a Cloudflare Pages (krok 8), může ostrá aplikace dočasně běžet na GitHub Pages projektu –
v podadresáři `app/` větve `gh-pages`, vedle testovací verze:

| Adresa | Co tam je |
|---|---|
| `https://michalcipro.github.io/rezerva-n--system/` | testovací verze (data v prohlížeči) – zůstává beze změny |
| `https://michalcipro.github.io/rezerva-n--system/app/<slug>` | provozovna |
| `https://michalcipro.github.io/rezerva-n--system/app/platforma` | správa platformy |

**Podadresář – `VITE_BASE`.** Ostrá verze (`npm run build:prod`, i `npm run dev:live`) bere podadresář webu
z `VITE_BASE` (výchozí `/`, tj. kořen domény). Od něj se počítají assety a písma, právní stránky
i adresy v aplikaci (`<base><slug>`, `<base>platforma`; v kódu `import.meta.env.BASE_URL`). Adresa mimo
podadresář ukáže „Provozovna nenalezena“. Testovací verze (`npm run build`, jeden soubor) běží vždy z kořene.

**Nasazení – `scripts/deploy-pages.mjs`** (v `app/`, potřebuje Node 22 a git s právem pushovat do repozitáře):
1. Do `app/.env.prod.local` (není v gitu) nebo do prostředí doplňte `VITE_API_URL`, `VITE_SUPABASE_URL`
   a `VITE_SUPABASE_ANON_KEY` (stejné hodnoty jako v kroku 8.3).
2. `node scripts/deploy-pages.mjs` – sestaví ostrou verzi s `VITE_BASE=/rezerva-n--system/app/`, stáhne větev
   `gh-pages` z `origin` do dočasné pracovní kopie (`git worktree`), nahradí v ní adresář `app/` (bez `_headers`),
   do kořene zapíše `404.html` = `app/index.html` a připraví commit se zdrojovou větví a commitem. Kořenový
   `index.html` (testovací verze) nechá. Vypíše, co by nahrál, a **nic nenahraje**.
3. `node scripts/deploy-pages.mjs --push` – totéž a nahraje na `origin gh-pages` (s necommitnutými změnami
   v `app/` odmítne). GitHub Pages stránku obnoví zhruba do minuty. Jiný podadresář: `--base /rezerva-n--system/beta/`.
4. GitHub → Settings → Pages: *Deploy from a branch*, větev `gh-pages`, složka `/ (root)` – už nastavené kvůli
   testovací verzi.

GitHub Pages neumí přesměrování pro jednostránkové aplikace: pro každou neexistující cestu vrací `404.html`
z kořene webu. Proto je `404.html` kopií `app/index.html` (odkazy na assety jsou absolutní i s podadresářem).

**Server** (Supabase → Edge Functions → Secrets):

| Název | Hodnota |
|---|---|
| `PUBLIC_APP_URL` | `https://michalcipro.github.io/rezerva-n--system/app` – i s podadresářem; pozvánka majitele pak odkazuje na `…/app/<slug>`, přehled licencí na `…/app/platforma` |
| `ALLOWED_ORIGINS` | `https://michalcipro.github.io` – jen původ, bez cesty (hlavička `Origin` cestu nemá); případné další adresy oddělte čárkou |

Authentication → URL Configuration → *Site URL*: `https://michalcipro.github.io/rezerva-n--system/app/`
(přihlašuje se kódem, odkaz z e-mailu se nepoužívá – jde jen o výchozí adresu v šablonách Supabase).

**Omezení**
- **Hluboké odkazy vracejí stav 404.** `…/app/<slug>` a `…/app/platforma` (i po F5) obsluhuje `404.html`:
  stránka v prohlížeči funguje normálně, ale monitoring dostupnosti nebo náhledy odkazů v chatu ji mohou brát
  jako chybu. Monitorujte `…/app/` (stav 200) a `/api/health`.
- **Bez vlastních HTTP hlaviček.** `public-prod/_headers` (CSP, HSTS, `X-Frame-Options`, dlouhá cache assetů)
  GitHub Pages nepodporuje, skript ho proto nenahrává; stránku lze např. vložit do rámu cizího webu.
- **Sdílený původ `michalcipro.github.io`.** Testovací verze, ostrá aplikace a všechny ostatní stránky GitHub Pages
  téhož účtu sdílejí úložiště prohlížeče (včetně přihlášení). Na účtu nezveřejňujte cizí ani nedůvěryhodný kód.
- Jeden `404.html` na celý web projektu: i překlep mimo `app/` ukáže ostrou aplikaci s hláškou „Provozovna nenalezena“.
- Vlastní domény provozoven tu nejdou – provozovny běží jen na `…/app/<slug>`.

**Přechod na vlastní doménu**
1. Web podle kroku 8 (Cloudflare Pages) bez `VITE_BASE` – aplikace běží z kořene domény a platí `_headers`.
2. Secrets: `PUBLIC_APP_URL=https://app.vase-platforma.cz`; do `ALLOWED_ORIGINS` přidejte novou doménu
   (`https://michalcipro.github.io` odeberte, až starou adresu nikdo nepoužívá). V Supabase změňte *Site URL*.
3. Majitelům pošlete novou adresu – konzole → Upravit → **Poslat pozvánku znovu** už odkazuje na novou doménu.
   Přihlášení se nepřenáší (jiný původ), každý se jednou přihlásí kódem znovu.
4. Na GitHub Pages nahraďte `app/index.html` a `404.html` stránkou, která přesměruje na novou adresu se stejným
   slugem (GitHub Pages přesměrování na serveru neumí, stačí skript
   `location.replace('https://app.vase-platforma.cz' + location.pathname.replace(/^\/rezerva-n--system\/app/, ''))`).
