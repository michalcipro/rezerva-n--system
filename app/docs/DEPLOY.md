# Nasazení do ostrého provozu – krok za krokem

Návod pro první spuštění. Co je hotové v kódu, je popsané v [PRODUCTION.md](PRODUCTION.md); tady jsou
kroky v účtech poskytovatelů (Supabase, Cloudflare, Brevo, Fio), které za vás nikdo jiný udělat nemůže.

Odhad času: 2–3 hodiny (bez čekání na DNS a schválení SMS odesílatele).

**Nikdy neposílejte klíče e-mailem ani do chatu.** Tajné hodnoty se zadávají jen do nastavení služeb
(Supabase → Edge Functions → Secrets, Cloudflare → Environment variables) nebo do bezpečného formuláře.

---

## 0. Co budete potřebovat

| Služba | K čemu | Cena (orientačně) |
|---|---|---|
| Supabase (region **EU – Frankfurt**) | databáze, přihlášení, server | Pro plán 25 USD/měs. – zálohy a žádné uspávání projektu |
| Cloudflare Pages | web aplikace | zdarma |
| Brevo | e-maily (a SMS) | e-maily zdarma do 300/den, SMS předplacené kredity |
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
   | `CRON_SECRET` | náhodný řetězec (aspoň 32 znaků) |
   | `ADMIN_SECRET` | jiný náhodný řetězec – jen pro založení kliniky, potom smazat |
   | `ALLOWED_ORIGINS` | adresa aplikace, např. `https://rezervace.klinika.cz` (více adres oddělte čárkou) |
   | `PUBLIC_API_URL` | `https://<ref>.supabase.co/functions/v1/api` |
   | `BREVO_API_KEY` | API klíč z Brevo (`xkeysib-…`) – bez něj se zprávy jen řadí do fronty |
   | `MAIL_FROM` | odesílací adresa na ověřené doméně, např. `rezervace@klinika.cz` |
   | `MAIL_FROM_NAME` | jméno odesílatele (jinak se bere název kliniky z nastavení) |
   | `SMS_SENDER` | schválený odesílatel SMS (max. 11 znaků) – bez něj SMS neodcházejí |
   | `FIO_TOKEN` | nepovinné, token „Pouze sledovat účet“ (krok 7) |

   Náhodný řetězec vytvoříte např. příkazem `openssl rand -hex 32`. Pokud projekt používá nové klíče
   (`sb_publishable_…`, `sb_secret_…`) a starší klíče jsou vypnuté, přidejte i `APP_ANON_KEY` a `APP_SERVICE_KEY`.
2. Sestavení a nasazení (počítač s Node 22 a Supabase CLI, nebo GitHub Actions – workflow `Nasazení serveru`):
   ```bash
   cd app && npm ci && npm run build:edge && cd ..
   supabase login
   supabase functions deploy api --project-ref <ref> --no-verify-jwt
   ```
3. Kontrola: `https://<ref>.supabase.co/functions/v1/api/health` vrátí `{"ok":true,…}`.

## 4. Založení kliniky a majitele

Jednou, po nasazení serveru:

```bash
curl -X POST "https://<ref>.supabase.co/functions/v1/api/admin/bootstrap" \
  -H "x-admin-secret: <ADMIN_SECRET>" -H "Content-Type: application/json" \
  -d '{"clinicName":"<Název kliniky>","ownerEmail":"<e-mail majitele>","ownerName":"<Jméno majitele>"}'
```

Klinika vznikne s výchozím katalogem služeb a týmem (upraví se v aplikaci), s vypnutými platbami kartou
a klinickými poznámkami a se zapnutým odesíláním zpráv. Druhé volání skončí chybou 409 – klinika už existuje.
**Potom `ADMIN_SECRET` ze Secrets smažte.**

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

## 6. Brevo – e-maily a SMS

1. Účet na brevo.com (na firmu, která systém provozuje – viz smlouva o zpracování).
2. Senders, Domains & Dedicated IPs → **Domains** → přidat doménu kliniky → u registrátora domény nastavte
   záznamy, které Brevo zobrazí (ověřovací kód, **DKIM**, **DMARC**, případně SPF). Bez ověřené domény
   budou e-maily padat do spamu.
3. SMTP & API → **API Keys** → vytvořit klíč (`xkeysib-…`) → do Supabase Secrets jako `BREVO_API_KEY`.
   SMTP key (`xsmtpsib-…`) patří do SMTP nastavení Supabase (krok 2.3).
4. Security → **Authorised IPs** → blokování neznámých IP vypněte (Edge Functions nemají pevnou IP adresu;
   jinak Brevo po 30 dnech začne vracet chybu 401).
5. SMS (nepovinné): dobít kredity a zaregistrovat **odesílatele (Sender ID)** pro Českou republiku –
   operátoři SMS od neregistrovaných odesílatelů blokují. Dokud není schválený, nechte SMS šablony
   v aplikaci vypnuté (Komunikace → Šablony).

## 7. Fio banka – automatické párování QR plateb (nepovinné)

Internetbanking → Nastavení → API → Přidat nový token → **Pouze sledovat účet**, platnost max. 180 dní →
token uložte do Supabase Secrets jako `FIO_TOKEN`. Token funguje asi 5 minut po potvrzení.
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

4. Custom domains → `rezervace.klinika.cz` (CNAME na `<projekt>.pages.dev`).
5. Bezpečnostní hlavičky jsou v [`public-prod/_headers`](../public-prod/_headers); pro užší pravidlo
   nahraďte v `connect-src` `https://*.supabase.co` konkrétní adresou projektu.

## 9. Právní texty

Návrhy jsou v [`docs/legal/`](legal/README.md) – **před zveřejněním je musí zkontrolovat advokát**.
Schválené finální texty uložte do `docs/legal/zverejnit/` (`obchodni-podminky.md`,
`ochrana-osobnich-udaju.md`); build je vystaví na `/obchodni-podminky.html` a `/ochrana-osobnich-udaju.html`.
Koncept s poznámkami nebo s [doplňovanými údaji] build odmítne.

Smlouvy o zpracování s poskytovateli: Supabase (Dashboard → Organization → Legal Documents → DPA),
Brevo a Cloudflare (DPA jsou součástí podmínek – stáhnout a uložit), smlouva Nexum Care ↔ klinika
podle [`legal/smlouva-o-zpracovani.md`](legal/smlouva-o-zpracovani.md).

## 10. Postup spuštění (doporučený)

**Fáze 1 – jen tým (1–2 týdny)**
- [ ] Majitel se přihlásí, v Nastavení vyplní údaje kliniky, odesílací e-mail pro odpovědi, storno podmínky
      a **číslo účtu pro QR platby** (Nastavení → Platby).
- [ ] Služby a ceník, tým a pracovní doba, permanentky a skupinové lekce podle skutečnosti.
- [ ] Tým a směny → Přístupy do systému: přidat recepci a terapeuty (přihlašují se svým e-mailem).
- [ ] Import klientů, permanentek a kreditů ze stávající evidence (Nastavení → Import dat).
- [ ] Komunikace → Šablony: projít texty, SMS nechat vypnuté do schválení odesílatele.
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
- **Lokální vývoj:** `npm run dev:server` (API s ukázkovou klinikou na :8787) a `npm run dev:live`
  (aplikace na :5173, přihlášení bez e-mailu).
