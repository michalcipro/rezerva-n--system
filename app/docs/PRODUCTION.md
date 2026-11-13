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
| `npm run build` | testovací (`VITE_BACKEND` nenastaveno) | artefakt a veřejný náhled, data v prohlížeči, testovací panel |
| `npm run build:prod` | ostrý (`VITE_BACKEND=server`) | přihlášení, data na serveru, bez testovacích funkcí |

Proměnné prostředí webu: `VITE_BACKEND=server`, `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
Proměnné serveru (tajné, nastavují se v Supabase): `BREVO_API_KEY`, `FIO_TOKEN` (volitelně), `CRON_SECRET`.
