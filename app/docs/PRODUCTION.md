# Ostrý provoz – architektura a nasazení

Testovací verze běží celá v prohlížeči (data v IndexedDB nebo ve sdíleném úložišti artefaktu). Ostrá verze
přidává server, databázi a přihlašování, ale **pravidla rezervací zůstávají stejná**: server spouští stejný
engine (`src/engine/*`) jako aplikace.

## Rozhodnutí (výchozí volby)

| Oblast | Volba |
|---|---|
| Provozovatel | Nexum Care s.r.o. – dodavatel a zpracovatel osobních údajů pro kliniku (správce) |
| Databáze a přihlášení | Supabase, region EU (Frankfurt) |
| Server | jedna Supabase Edge Function `api` (stejný kód běží lokálně v Node pro vývoj a testy) |
| Web | statický build (Cloudflare Pages) |
| E-maily a SMS | Brevo (EU), jeden účet pro obojí |
| Platby | na místě, QR Platba (ruční potvrzení, volitelně automatické párování přes Fio API); karta online vypnutá |
| Klinické poznámky | v ostrém provozu vypnuté (`settings.features.clinicalNotes = false`) |
| Spuštění | 1) recepce a terapeuti, 2) klientský portál |

## Architektura

```
prohlížeč (personál)  ── celý stav kliniky (po částech) ─┐
prohlížeč (klient)    ── jen vlastní data + anonymní obsazenost ─┤
                                                           ▼
                                   API (Edge Function `api`, TypeScript)
                                   · ověří přihlášení (Supabase Auth JWT)
                                   · zjistí roli (members / client_accounts)
                                   · provede příkaz enginem nad stavem kliniky
                                   · zapíše změněné části stavu (porovnání verze = žádná dvojí rezervace)
                                                           ▼
                                   Postgres (schéma app, nepřístupné přes veřejné REST API)
                                   · clinics (verze stavu), members, client_accounts
                                   · state_chunks – stav kliniky po částech (meta, klienti po 200,
                                     rezervace po týdnech, platby po měsících…)
                                   · command_log – kdo, kdy a jaký příkaz spustil
```

- **Server je autorita.** Aplikace příkaz provede hned u sebe (okamžitá odezva), zároveň ho pošle na server.
  Server ho provede znovu se stejnými identifikátory (`withIdGenerator` + `commandId`) a jeho výsledek platí.
  Když server příkaz odmítne (např. termín mezitím obsadil někdo jiný), aplikace stav vrátí podle serveru
  a ukáže chybu.
- **Souběžnost:** zápis změn je porovnání a výměna verze (`app.apply_changes`): když se mezitím stav
  změnil, server stav načte znovu a příkaz zopakuje.
- **Klient nikdy nedostane cizí osobní údaje.** API mu posílá projekci stavu: katalog, nastavení, jeho
  vlastní záznamy a obsazenost ostatních termínů bez jmen a plateb (`projectForClient`). Portál s ní
  počítá volné termíny stejně jako dnes.
- **Automatika běží na serveru** (`POST /api/cron` každých 5 minut): docházka, připomínky, propadání
  náhrad a nabídek, odeslání zpráv z fronty, párování QR plateb z Fio.
- **Zprávy:** v ostrém provozu (`settings.messaging.deliver = true`) vznikají ve stavu `queued`,
  server je odešle přes Brevo a zapíše výsledek (`recordDeliveries`: `sent` / opakování / `failed`).

## Struktura kódu

```
app/src/engine/        pravidla (sdílená prohlížečem i serverem)
app/server/            API, úložiště, ověření přihlášení, automatika, poskytovatelé (Brevo, Fio)
app/server/providers/  odesílání e-mailů a SMS, bankovní výpisy
supabase/migrations/   SQL schéma a ochrana řádků
supabase/functions/api Edge Function (tenký obal nad app/server, sestavuje se esbuildem)
```

## Režimy sestavení

| Příkaz | Režim | K čemu |
|---|---|---|
| `npm run build` | testovací | artefakt a veřejný náhled, data v prohlížeči, testovací panel |
| `npm run build:prod` | ostrý (`--mode prod`, `VITE_BACKEND=server`) | `dist-prod` pro Cloudflare Pages: přihlášení, data na serveru, bez testovacích funkcí, písmo z vlastního webu |
| `npm run build:edge` | server | `supabase/functions/api/server.js` – jeden soubor bez závislostí pro Edge Function |
| `npm run dev:server` + `npm run dev:live` | lokální vývoj | API nad PGlite s ukázkovou klinikou + aplikace v ostrém režimu, přihlášení bez e-mailu |

Proměnné webu: `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (veřejné), `VITE_BACKEND=server` je v `.env.prod`.
Proměnné serveru (Supabase → Edge Functions → Secrets): `CRON_SECRET`, `ADMIN_SECRET` (jen při založení),
`ALLOWED_ORIGINS`, `PUBLIC_API_URL`, `BREVO_API_KEY`, `MAIL_FROM`, `MAIL_FROM_NAME`, `SMS_SENDER`, `FIO_TOKEN`
– popis v [DEPLOY.md](DEPLOY.md).

## API

| Trasa | Kdo | Co dělá |
|---|---|---|
| `GET /api/session` | přihlášený | role (personál / klient); klienta s ověřeným e-mailem propojí s kartou v kartotéce |
| `POST /api/register` | nový klient | založí kartu klienta (souhlasy) a propojí ji s přihlášením |
| `GET /api/state`, `GET /api/changes?since=` | personál, klient | stav po částech (personál) / vlastní pohled (klient), dočítání změn |
| `POST /api/command` | podle role | příkaz enginu; kontrola role, tvaru vstupu, opakované odeslání se neprovede dvakrát |
| `GET/POST/DELETE /api/members` | majitel | přístupy týmu |
| `POST /api/cron` | plánovač (`x-cron-secret`) | automatika, odeslání zpráv, párování plateb, údržba |
| `GET/POST /api/unsubscribe` | odkaz v e-mailu | odhlášení z obchodních sdělení (podepsaný odkaz, List-Unsubscribe) |
| `POST /api/admin/bootstrap` | `x-admin-secret` | jednorázové založení kliniky a majitele |

## Bezpečnost (shrnutí)

- Tabulky ve schématu `app` mají zapnutou ochranu řádků bez politik; role `anon`/`authenticated` k nim
  ani k funkcím nemají práva (ověřeno testem). Data čte a zapisuje jen server se služebním klíčem.
- Klient může volat jen vyjmenované příkazy s přesně popsaným vstupem (`server/core/validate.ts`);
  engine navíc hlídá, že jedná jen za sebe. Platba kartou online bez platební brány neprojde.
- Personál vidí celý stav kliniky (včetně terapeutů) – omezení podle role je jen v rozhraní.
- Žádné vstupy příkazů se neukládají do logu; log obsahuje jen název akce, roli a výsledek.
- Přihlašovací tokeny ověřuje Supabase Auth; zakládání účtů personálu bez pozvánek (`ensureUser`).
