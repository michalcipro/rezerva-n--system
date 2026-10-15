# Winning Minds – CRM vrstva (specifikace)

Winning Minds (mentální koučink, terapie, neurovizuální trénink, strategický koučink, mentoring) nepoužívá systém
primárně k online rezervacím, ale jako **kalendář, CRM a (později) fakturaci**. Tento dokument popisuje CRM
rozšíření. Závazný je pro všechny, kdo na něm pracují: názvy typů, příkazů a souborů drž přesně podle něj.

Fakturace a finance firmy jsou **mimo rozsah** této etapy (čeká se na odpověď, zda je firma plátce DPH).
Části pro kliniku (storno, omluvenky, čekací listina, permanentky, portál) zůstávají beze změny.

## Co uživatel chce (slovy zadání)

- ke každému klientovi vidět, **v jaké fázi spolupráce** je;
- **poznámky**, **audio nahrávky**, **data z Plaud AI** (přepis a shrnutí sezení), **soubory a fotky**;
- **statistiky klientů** (po fázích, u každého klienta);
- **follow-upy** (úkoly s termínem ke klientovi);
- **posílání poznámek ze sezení** klientovi e-mailem;
- dál fungují potvrzení a připomínky schůzek a newslettery (už existují).

## Fáze spolupráce

Výchozí fáze (v tomto pořadí), uložené v `settings.stages`:

| id | název | tone | closed |
|---|---|---|---|
| `st_potencialni` | Potenciální klient | slate | – |
| `st_freetalk` | Freetalk | blue | – |
| `st_diagnostika` | Diagnostika | violet | – |
| `st_vyhodnoceni` | Vyhodnocení | sand | – |
| `st_aktivni` | Aktivní spolupráce | teal | – |
| `st_pozastaveno` | Pozastaveno | olive | – |
| `st_konec` | Konec spolupráce | rose | true |

Fáze lze v Nastavení přejmenovat, přeřadit, přidat a skrýt (smazat jen fázi bez klientů).

## Datový model (src/domain/types.ts)

```ts
export interface Stage { id: Id; name: string; tone: Tone; order: number; closed?: boolean }
export interface StageChange { stageId: Id; at: LocalDateTime; actor: string; note?: string }

// Settings: + stages: Stage[]
// Client:   + stageId: Id; stageHistory: StageChange[]
//           (Client.notes zůstává v typu kvůli zpětné kompatibilitě, ale je vždy [] – staré poznámky se při
//            načtení přesunou do kolekce `notes`, viz Migrace.)

export type NoteKind = 'note' | 'session' | 'plaud' | 'call';
export interface Note {
  id: Id;
  clientId: Id;
  at: LocalDateTime;            // kdy se událost stala (u zápisu ze sezení začátek schůzky)
  createdAt: LocalDateTime;
  updatedAt: LocalDateTime | null;
  authorId: Id;                 // therapist id ('' když neznámý)
  kind: NoteKind;
  title: string;                // max 120 znaků, může být ''
  text: string;                 // max NOTE_TEXT_MAX = 20 000 znaků
  bookingId: Id | null;         // zápis ze sezení / Plaud navázaný na schůzku
  pinned: boolean;
  sentAt: LocalDateTime | null; // kdy byl zápis odeslán klientovi
  plaud: { recordedAt: LocalDateTime | null; transcriptFileId: Id | null } | null;
}

export type FileKind = 'image' | 'audio' | 'video' | 'pdf' | 'text' | 'other';
export type FileStorage = 'asset' | 'asset-b64' | 'local';
export interface FileRecord {
  id: Id;
  clientId: Id;
  noteId: Id | null;
  name: string;
  mime: string;                 // skutečný typ souboru (např. 'audio/mpeg')
  size: number;                 // bajty originálu
  kind: FileKind;
  at: LocalDateTime;
  uploadedBy: string;
  storage: FileStorage;
  ref: string;                  // id assetu (artefakt) nebo klíč v IndexedDB
  durationSec: number | null;   // u audia/videa, pokud je známá
  caption: string;
}

export interface FollowUp {
  id: Id;
  clientId: Id;
  title: string;                // max 160 znaků, povinné
  due: LocalDate;
  dueTime: TimeOfDay | null;
  assigneeId: Id | null;        // therapist id
  note: string;
  done: boolean;
  doneAt: LocalDateTime | null;
  createdAt: LocalDateTime;
  createdBy: string;
}

// ClinicState: + notes: Note[]; files: FileRecord[]; followUps: FollowUp[]
// TemplateKey: + 'session_notes'
// SegmentRule: + { type: 'stage'; stageIds: Id[] }
```

## Ukládání (src/store/persistence.ts)

- Nové kolekce v `COLLECTIONS`: `notes` (dokumenty po měsících podle `at`), `files` a `followUps` (`all`, dělí se podle
  velikosti). `sortCollection`/`normalizeState` je řadí (`notes` podle `at`, `followUps` podle `due`).
- Velikost dokumentu se počítá v **bajtech UTF-8** (`new TextEncoder().encode(json).length`), ne v délce řetězce
  – čeština má dvoubajtové znaky.
- IndexedDB: verze 2, vedle úložiště `state` nové úložiště `files` pro binární obsah souborů (klíč = `ref`).
- Migrace v `normalizeState` (idempotentní): chybějící `settings.stages` → výchozí; klient bez `stageId` → podle
  historie (má dokončenou schůzku za posledních 90 dní → `st_aktivni`, jinak s nějakou schůzkou → `st_pozastaveno`,
  bez schůzek → `st_potencialni`) a `stageHistory = [{stageId, at: createdAt, actor: 'Systém'}]`;
  `client.notes` (ClinicalNote) → `Note` s `kind: 'note'` (id zachovat) a `client.notes = []`; chybějící šablona
  `session_notes` se doplní z `DEFAULT_TEMPLATES`; chybějící kolekce → `[]`.

## Soubory (src/store/files.ts)

Jediné místo, které sahá na binární data. UI volá jen tyto funkce:

```ts
export const FILE_MAX_BYTES: number;                   // limit platný všude = limit artefaktu (15 MiB)
export function fileMaxBytes(): number;                // limit aktuálního úložiště (artefakt 15 MiB, lokálně 100 MiB)
export function fileKindOf(mime: string, name: string): FileKind;
export function canStoreFiles(): Promise<{ ok: true } | { ok: false; reason: string }>;
export function storeFile(blob: Blob, name: string): Promise<{ storage: FileStorage; ref: string; size: number; mime: string }>;
export function getFileUrl(rec: Pick<FileRecord, 'storage' | 'ref' | 'mime'>): Promise<string>;   // pro <img>/<audio>/<a>
export function readFileText(rec: Pick<FileRecord, 'storage' | 'ref' | 'mime'>): Promise<string>;
export function deleteStoredFile(rec: Pick<FileRecord, 'storage' | 'ref'>): Promise<void>;
export function downloadFile(rec: Pick<FileRecord, 'storage' | 'ref' | 'mime'>, name: string): Promise<DownloadResult>;
```

`FILE_MAX_BYTES` je konstanta, a proto nemůže záviset na úložišti – limit podle úložiště vrací `fileMaxBytes()`
a vynucuje ho `storeFile` (UI ho používá i pro kontrolu před nahráním).

- **Artefakt** (`storage === 'artifact'` ve store): `await window.claude.use('assets')`. Přijímané typy:
  png, jpeg, gif, webp, svg+xml, mp4, webm, pdf, csv, markdown, json, plain text. Nahrávka z mikrofonu
  (`audio/webm`, `audio/mp4`) se nahraje s typem `video/webm` / `video/mp4` (`storage: 'asset'`). Ostatní typy
  (mp3, wav, m4a, docx, xlsx…) se uloží jako base64 v `text/plain` assetu (`storage: 'asset-b64'`, limit originálu
  15 MiB); `getFileUrl` je stáhne z `/_blob/<id>`, dekóduje a vrátí `URL.createObjectURL(new Blob([...], {type: mime}))`.
  `use('assets')` vrací `null` lidem, kteří artefakt nemohou upravovat → `canStoreFiles` vrátí důvod a UI nahrávání
  skryje. Chybové kódy (`too_large`, `quota_or_state`, `rate_limited`, `store_unavailable` – jeden opakovaný pokus)
  převést na české hlášky.
- **Lokálně** (IndexedDB): `storage: 'local'`, blob v úložišti `files`. Bez IndexedDB → `canStoreFiles` ok: false.
- Object URL se cachují podle `ref` (a uvolní se při `deleteStoredFile`).
- Publikace artefaktu musí deklarovat `capabilities: { db: {}, assets: {}, downloads: true }` (`downloads` pro
  `downloadFile` – stažení souboru z karty klienta).
- Smazání všech dat (testovací panel) vymaže lokálně uložené soubory; assety artefaktu zůstanou, dokud se
  nesmaže samotný artefakt.

## Příkazy (src/engine/commands.ts)

Všechny jen pro personál (`requireStaff`), vše s `audit(...)`, české chybové hlášky.

| Příkaz | Vstup | Výsledek |
|---|---|---|
| setClientStage | clientId, stageId, note?, undo? | zapsaný `StageChange` (stejná fáze = chyba „Klient už v této fázi je.“; poznámka max. `STAGE_NOTE_MAX` = 500 znaků); s `undo` (záznam z předchozího volání) vrátí přesun a vrátí `null` |
| saveStages | stages: Stage[] | – (nelze smazat fázi, ve které je klient; aspoň jedna fáze) |
| addNote | clientId, kind, title, text, at?, bookingId?, plaud? | id |
| updateNote | noteId, patch {title?, text?, at?, kind?, pinned?, bookingId?, plaud?} | – |
| deleteNote | noteId | {fileRecords: FileRecord[]} – odebrané záznamy souborů poznámky (UI smaže jejich data) |
| sendSessionNotes | noteId, subject, body | messageId – zpráva přes `addManualMessage` (simulace) s `kind: 'session_notes'` a `bookingId` schůzky, nastaví `sentAt`; předmět max. `MESSAGE_SUBJECT_MAX` = 200, text max. `MESSAGE_BODY_MAX` = 25 000 znaků |
| addFileRecord | clientId, noteId?, name, mime, size, kind, storage, ref, durationSec?, caption? | id |
| updateFileRecord | fileId, patch {caption?, noteId?, name?} | – |
| removeFileRecord | fileId | {record} (UI pak zavolá `deleteStoredFile`) |
| addFollowUp | clientId, title, due, dueTime?, assigneeId?, note? | id |
| updateFollowUp | followUpId, patch {...} | – |
| setFollowUpDone | followUpId, done | – |
| deleteFollowUp | followUpId | – |

`createClient` nově přijímá volitelné `stageId` (výchozí první fáze) a založí `stageHistory`.
Text poznámky nad `NOTE_TEXT_MAX` → chyba „Text je příliš dlouhý (max. 20 000 znaků). Dlouhý přepis vložte jako soubor.“

## Selektory (src/engine/crm.ts – nový soubor, čisté funkce)

`stagesSorted(s)`, `getStage(s, id)`, `clientStage(s, client)`, `notesOfClient(s, clientId)` (připnuté první, pak
nejnovější), `filesOfClient(s, clientId)`, `filesOfNote(s, noteId)`, `sessionNoteOfBooking(s, bookingId)`,
`followUpsOfClient(s, clientId)`, `followUpBuckets(s, today, assigneeId?)` → `{overdue, today, upcoming, done}`,
`clientsByStage(s)` → `Map<stageId, Client[]>`, `daysInStage(client, now)`,
`clientCrmStats(s, clientId, now)` → `{ completedSessions, upcomingSessions, revenueCzk, firstSessionAt, lastSessionAt,
nextSessionAt, notesCount, filesCount, openFollowUps, overdueFollowUps, stageSince }`,
`pipelineStats(s, now, fromDate, toDate)` → počty po fázích, přechody mezi fázemi v období, konverze
`Freetalk → Aktivní spolupráce`, průměrná doba ve fázi.

Upřesnění:
- `clientStage` vždy vrátí fázi – klient s neznámou fází (např. po ručním zásahu do dat) spadne do první fáze,
  stejně ho řadí `clientsByStage`.
- `pipelineStats` bere období `[fromDate, toDate)` (konec exkluzivně, stejně jako `computeStats`). Konverze =
  klienti, kteří v období vstoupili do Freetalku a kdykoli později (do teď) se dostali do Aktivní spolupráce.
  Průměrná doba ve fázi `avgDays` počítá pobyty, které v období skončily; `currentAvgDays` klienty, kteří ve fázi
  jsou teď. `newClients` = klienti založení v období (na obrazovce „Noví zájemci“).
- Další exporty: `NOTE_TITLE_MAX`, `FOLLOW_UP_TITLE_MAX`, `STAGE_NAME_MAX`, `STAGE_NOTE_MAX`, `FILE_CAPTION_MAX`,
  `NOTE_KIND_LABEL`, `FILE_KIND_LABEL`, `CONVERSION_FROM_STAGE`/`CONVERSION_TO_STAGE`, `notesOfBooking`,
  `getNote`/`getFileRecord`/`getFollowUp`, `followUpDueLabel`, `sessionNotesVars`/`sessionNotesEmail`,
  `inferStageId`; v `format.ts` `formatFileSize` a `formatClockDuration`.

## Šablona `session_notes`

Předmět: `Zápis ze sezení [datum]`, text: oslovení `[jméno]`, `[poznámky]`, podpis `[klinika]`. Proměnné
`[datum]` a `[poznámky]` přidat do `TEMPLATE_VARIABLES`.

Šablona se posílá **ručně** (karta klienta, detail schůzky), ne automaticky: v Komunikaci má místo přepínače
štítek „Ručně“ (`MANUAL_TEMPLATES` v `screens/comms/lib.ts`) a nepočítá se mezi automatické zprávy. `[datum]`
je v e-mailu i v náhledu celé datum (`16. 10. 2026`). Odeslaná zpráva má v odeslaných a v klientském portálu
typ „Zápis ze sezení“.

## Obrazovky

- **Karta klienta** (`screens/clients`): v hlavičce fáze (štítek + změna fáze s volitelnou poznámkou, historie fází);
  karty **Poznámky** (místo „Dokumentace“: časová osa poznámek, zápisů ze sezení, Plaud importů a telefonátů,
  filtr podle druhu, připnutí, přílohy u poznámky, odeslání zápisu klientovi), **Soubory a fotky** (mřížka náhledů,
  přehrávač audia, otevření PDF/textu, popisek, smazání s potvrzením), **Follow-upy**; v Přehledu karta CRM statistik.
- **Seznam klientů**: sloupec a filtr Fáze.
- **Pipeline** (`screens/pipeline`, nová položka menu „Pipeline“): sloupce podle fází s počty, karty klientů
  (jméno, dny ve fázi, příští schůzka, otevřené follow-upy), přesun mezi fázemi tažením i bez myši (menu „Přesunout
  do…“), přepínač „skrýt ukončené“, filtr podle kouče.
- **Follow-upy** (součást Pipeline jako druhá karta, nebo samostatná položka „Follow-upy“): po termínu / dnes /
  nadcházející / hotové, filtr „moje“, odškrtnutí, přidání.
  Implementováno jako **samostatná položka menu** „Follow-upy“ hned pod Pipeline; obě obrazovky na sebe odkazují
  tlačítkem v hlavičce. Trasy `{ name: 'pipeline' }` a `{ name: 'followupy' }` (`store/session.ts`, i v hash
  `#pipeline`, `#followupy`); vidí je majitelka, recepce i terapeut.
- **Přehled (dashboard)**: widget follow-upů na dnes a po termínu.
- **Statistiky**: sekce „Klienti a fáze“ (počty po fázích, přechody, konverze, průměrná doba ve fázi).
- **Kalendář – detail schůzky**: zápis ze sezení k dané schůzce (napsat / upravit / odeslat klientovi), odkaz na
  Plaud import a soubory v kartě klienta.
- **Nastavení**: editor fází spolupráce.
- **Komunikace**: segment „Fáze spolupráce“ v newsletteru; šablona `session_notes` v seznamu šablon.

## Audio a Plaud

- **Nahrát audio**: `MediaRecorder` (preferovat `audio/webm;codecs=opus`, jinak `audio/mp4`), ukazatel času,
  stop / zahodit / uložit. Když `getUserMedia` selže nebo chybí (artefakt nemusí mít povolený mikrofon), ukázat
  vysvětlení a nabídnout nahrání souboru. Nahrávku lze připojit k poznámce.
- **Import z Plaud**: Plaud nemá veřejné API pro přímé napojení. Dialog: název, datum nahrávky, navázání na
  schůzku (volitelné), **shrnutí** (vložit text – uloží se jako text poznámky `kind: 'plaud'`), **přepis** (vložit
  text nebo nahrát `.txt`/`.md`/`.srt` – uloží se jako textový soubor a `plaud.transcriptFileId`), volitelně audio
  soubor (mp3/m4a/wav/webm) a další přílohy (PDF). Krátká nápověda, jak v Plaud exportovat (Sdílet → Export → TXT/
  Markdown; shrnutí zkopírovat).
- Zápis ze sezení / Plaud shrnutí lze jedním tlačítkem poslat klientovi (`sendSessionNotes`, náhled e-mailu před
  odesláním, varování, když klient nemá e-mail nebo už bylo odesláno).

## Rozhodnutí při implementaci (odchylky a upřesnění)

Spec výše platí; tady jsou místa, kde implementace něco upřesnila nebo se od textu odchýlila.

- **Kouč klienta** (filtr Pipeline): terapeut posledního proběhlého a nezrušeného sezení, jinak příštího
  plánovaného, jinak poslední rezervace (`coachOf` v `screens/pipeline/model.ts`). Na obrazovce Follow-upy filtr
  „kouč“ znamená, komu je úkol přiřazený (+ „Bez přiřazení“).
- **Viditelnost v kartě klienta**: Přehled (s kartou Spolupráce), Follow-upy a změnu fáze vidí celý personál.
  Poznámky i **Soubory a fotky** jen majitelka a terapeut (`perms.clinical`) – nahrávky a přepisy jsou stejně
  citlivé jako poznámky. Útrata jen finanční role. Stejné pravidlo (`useClinicalAccess`) má zápis ze sezení
  v detailu schůzky a jeho ikona v kalendáři.
- **Odkaz na kartu klienta**: trasa `{ name: 'klient', clientId, tab? }` (`ClientTab`) otevře konkrétní kartu;
  detail schůzky tak vede rovnou na Poznámky.
- **Kalendář**: blok má jedno místo pro ikonu – zápis ze sezení (`clipboard`) má přednost, jen u nadcházející
  potvrzené online schůzky zůstane ikona videa; aria-label uvádí obojí.
- **Přepis z Plaud**: nahraný `.md`/`.srt` přepis se uloží jako `text/plain` (původní název souboru zůstává).
  Pořadí importu: nejdřív se uloží soubory, pak záznam přepisu, poznámka s `plaud.transcriptFileId` a nakonec
  se soubor naváže na poznámku (`updateFileRecord`) – poznámka tak nevypadá jako upravená. Když nahrání selže,
  nevznikne nic.
- **Fáze v Nastavení**: nové fáze dostanou id už v editoru (`newId('st')`), `saveStages` je zachová. Nejvýše
  12 fází. Smazání Freetalku nebo Aktivní spolupráce editor upozorní, že zmizí statistika konverze.
- **Statistiky**: graf průměrné doby ve fázi vynechává ukončené fáze; srovnání konverze a změn fáze s minulým
  obdobím je jen neutrální poznámka (starší období mělo víc času konvertovat). Filtry terapeut a kategorie se na
  sekci „Klienti a fáze“ nevztahují.
- **Přehled**: terapeut vidí ve widgetu jen své follow-upy, souhrn fází počítá všechny klienty.
- **Freetalk zdarma**: služba za 0 Kč se v klientském portálu nabízí jen s platbou „zdarma“ (`createBooking`
  povolí klientovi `method: 'free'` jen u služby za 0 Kč) a `paymentLabel` u ceny 0 Kč píše „zdarma“.
- **Ukázková data**: noví klienti prochází Freetalk → Diagnostika → Vyhodnocení u stejného kouče, fáze se
  odvozují z těchto schůzek; asi polovina klientů je v Aktivní spolupráci. Zápisy ze sezení, Plaud shrnutí,
  telefonáty, připnuté cíle a follow-upy ve všech stavech; žádné soubory. CRM záznamy auditu se drží zvlášť,
  aby je limit auditu (2 500 záznamů) nevytlačil.
- **Vrácení přesunu ve fázích** („Vrátit zpět“ v Pipeline): `setClientStage` vrací zapsaný záznam historie; s ním
  jako `undo` záznam z historie zmizí a klient se vrátí do předchozí fáze – jen pokud je to pořád poslední změna fáze
  klienta (jinak chyba „Změnu fáze už nejde vrátit zpět…“). Omylem přetažená karta tak nezůstane v historii ani ve
  statistikách (přechody, konverze, doba ve fázi) a „ve fázi od“ se nevynuluje. Do auditu se zapíše „Vrácení změny fáze“.
- **Neznámá fáze**: kromě `clientStage`/`clientsByStage` platí první fáze i v segmentu „Fáze spolupráce“, v seznamu
  klientů (sloupec, filtr a počty – `ClientRow.stageId`) a v počtech editoru segmentu.
- **Délka e-mailu**: `sendSessionNotes` i `sendManualMessage` omezí předmět (`MESSAGE_SUBJECT_MAX`) a text
  (`MESSAGE_BODY_MAX`, `engine/messages.ts`) – zpráva se ukládá celá do kolekce `messages` a i v nejhorším případě
  se tak vejde do jednoho dokumentu databáze. Dialog odeslání zápisu limit hlídá předem.
- **Text odeslaného zápisu**: zpráva `session_notes` obsahuje celou poznámku, proto její text (v kartě klienta
  → Komunikace i v Komunikace → Odeslané, včetně hledání) vidí jen majitelka a terapeut; ostatní vidí předmět a
  „Obsah zápisu vidí jen kouči a terapeuti.“
- **Pořadí zápisu do artefaktu**: kolekce `notes`, `files` a `followUps` se zapíšou (a potvrdí) dřív než ostatní
  dokumenty. Migrace `client.notes` → `notes` tak při výpadku uprostřed ukládání nemůže v databázi nechat klienty
  bez poznámek a zároveň žádné dokumenty poznámek.
- **SVG** se v artefaktu ukládá jako `asset-b64` (původní bajty, limit 15 MiB): asset by SVG přijal jen do 2 MiB a
  uložil by ho upravené (sanitizace).
- **Smazání poznámky s přílohami** jen s přístupem k úložišti souborů (`useFileStorage()` = ok); jinak dialog
  vysvětlí, proč to nejde – data příloh by v úložišti zůstala bez záznamu.
- **Nahrávání audia**: zavření dialogu (Esc, klik mimo, křížek, Zpět) při rozpracované nahrávce se nejdřív zeptá
  „Zahodit nahrávku?“.
- **Follow-upy**: úkol odškrtnutý (nebo vrácený) na obrazovce Follow-upy a v kartě klienta zůstane do odchodu
  z obrazovky ve své skupině (`useStickyFollowUpGroups`), stejně jako ve widgetu Přehledu – fokus se neztratí.
- **Nová ukázková data** (testovací panel) smažou obsah lokálně uložených souborů (`clearLocalFiles`), na který už
  žádný záznam neukazuje.
- **Pipeline bez myši**: po přesunu z nabídky „Přesunout do…“ (i s poznámkou) a po „Vrátit zpět“ se fokus vrátí na
  kartu v novém sloupci; když karta není vidět (skryté ukončené fáze), na nadpis sloupce.
