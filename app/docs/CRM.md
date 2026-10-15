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
export const FILE_MAX_BYTES: number;                   // limit podle úložiště (artefakt 15 MiB, lokálně 100 MiB)
export function fileKindOf(mime: string, name: string): FileKind;
export function canStoreFiles(): Promise<{ ok: true } | { ok: false; reason: string }>;
export function storeFile(blob: Blob, name: string): Promise<{ storage: FileStorage; ref: string; size: number; mime: string }>;
export function getFileUrl(rec: Pick<FileRecord, 'storage' | 'ref' | 'mime'>): Promise<string>;   // pro <img>/<audio>/<a>
export function readFileText(rec: Pick<FileRecord, 'storage' | 'ref' | 'mime'>): Promise<string>;
export function deleteStoredFile(rec: Pick<FileRecord, 'storage' | 'ref'>): Promise<void>;
```

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
- Publikace artefaktu musí deklarovat `capabilities: { db: {}, assets: {} }`.

## Příkazy (src/engine/commands.ts)

Všechny jen pro personál (`requireStaff`), vše s `audit(...)`, české chybové hlášky.

| Příkaz | Vstup | Výsledek |
|---|---|---|
| setClientStage | clientId, stageId, note? | – (stejná fáze = chyba „Klient už v této fázi je.“) |
| saveStages | stages: Stage[] | – (nelze smazat fázi, ve které je klient; aspoň jedna fáze) |
| addNote | clientId, kind, title, text, at?, bookingId?, plaud? | id |
| updateNote | noteId, patch {title?, text?, at?, kind?, pinned?, bookingId?} | – |
| deleteNote | noteId | {fileRecords: FileRecord[]} – odebrané záznamy souborů poznámky (UI smaže jejich data) |
| sendSessionNotes | noteId, subject, body | messageId – zpráva přes `addManualMessage` (simulace), nastaví `sentAt` |
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

## Šablona `session_notes`

Předmět: `Zápis ze sezení [datum]`, text: oslovení `[jméno]`, `[poznámky]`, podpis `[klinika]`. Proměnné
`[datum]` a `[poznámky]` přidat do `TEMPLATE_VARIABLES`.

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
