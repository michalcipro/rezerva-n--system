# Přehled vstupů, volná místa ve skupinách a QR platba (specifikace)

Zadání majitele (doslova):

1. Přehled o vstupech a k tomu, abych viděl, zda to bude z permic/předplacených hodin nebo zda to bylo koupeno na
   jednorázový poplatek. U všech zaměstnanců.
2. Přehled o tom, zda jsou ještě volná místa na kruháč nebo jiné skupinové tréninky.
3. A aby tam byla i možnost platby přes QR.

Dokument je závazný: názvy typů, polí, příkazů, selektorů a souborů drž přesně podle něj. Stávající funkce
(permanentky, kredit, storno, CRM) se nemění, jen rozšiřují.

## 1. Přehled vstupů

**Vstup** = rezervace (`Booking`) individuální i skupinová. U každého vstupu chceme vidět **zdroj platby**:

```ts
// src/engine/visits.ts
export type VisitSource = 'package' | 'credit' | 'single' | 'qr_pending' | 'unpaid' | 'makeup' | 'free';
export interface VisitPaymentInfo {
  source: VisitSource;
  label: string;        // krátký štítek: „Permanentka“, „Kredit“, „Jednorázově“, „Čeká na QR platbu“, „Nezaplaceno“, „Náhrada“, „Zdarma“
  detail: string;       // např. „Koučink 10× · vstup 3 z 10“, „kartou na místě“, „QR platbou“, „náhrada za 12. 10. (z permanentky)“
  amount: number;       // Kč: u jednorázových zaplacená/účtovaná cena, u permanentky hodnota jednoho vstupu (unitValue), jinak cena služby
  prepaid: boolean;     // true pro permanentku, kredit a náhradu za předplacený vstup
}
export function visitPaymentInfo(s: ClinicState, b: Booking, today: LocalDate): VisitPaymentInfo;
```

Pravidla: `payment.method === 'package'` → package (číslo vstupu v rámci permanentky podle pořadí jejích vstupů);
`'credit'` → credit; `'online'` → single („online“); `'onsite'` + `paid` → single (podle `settledBy`: hotově / kartou
/ převodem / QR platbou); `'onsite'` bez platby → unpaid; `'qr'` bez platby → qr_pending, se zaplacením → single
(„QR platbou“); `'makeup'` → makeup (detail podle zdroje původního vstupu, `prepaid` podle něj); `'free'` → free.

```ts
export interface VisitFilters {
  from: LocalDate; to: LocalDate;          // `to` exkluzivně, stejně jako ostatní statistiky
  therapistId: Id | null;                   // null = všichni zaměstnanci
  serviceId: Id | null;
  sources: VisitSource[] | null;            // null = všechny
  status: 'done' | 'planned' | 'all';       // done = completed + no_show + late_cancelled (účtované), planned = confirmed
}
export interface VisitRow { booking: Booking; info: VisitPaymentInfo }
export interface EmployeeVisitSummary {
  therapistId: Id;
  total: number;
  bySource: Record<VisitSource, number>;    // počty vstupů
  prepaidCount: number; singleCount: number;
  singleRevenue: number;                    // Kč za jednorázové vstupy
  prepaidValue: number;                     // Kč hodnota vstupů z permanentek/kreditu
}
export function visitsOverview(s: ClinicState, f: VisitFilters, today: LocalDate):
  { rows: VisitRow[]; byEmployee: EmployeeVisitSummary[]; totals: EmployeeVisitSummary };
```

Zrušené (`cancelled`, `excused`, `clinic_cancelled`) se do přehledu nepočítají.

**Obrazovka „Vstupy“** (`src/screens/visits`, položka menu „Vstupy“, ikona dle sady):
- období (tento týden / tento měsíc / minulý měsíc / vlastní), filtr zaměstnanec, služba, zdroj platby, stav;
- souhrnná tabulka **po zaměstnancích** (řádek = zaměstnanec, sloupce: celkem, z permanentky, z kreditu, jednorázově,
  čeká na QR, nezaplaceno, náhrady, zdarma, tržba jednorázově, hodnota předplacených) + řádek Celkem; klik na řádek
  filtruje seznam;
- seznam vstupů: datum a čas, klient (odkaz na kartu), služba (u skupiny název lekce), zaměstnanec, stav, štítek
  zdroje platby s detailem, částka; stránkování;
- export CSV (`downloadFile`/`downloads` v artefaktu, jinak `<a download>`), středník jako oddělovač, UTF-8 s BOM;
- přístup: majitel a recepce vidí všechny zaměstnance; terapeut/kouč jen sebe (filtr zaměstnance zamčený).
- Štítek zdroje platby (stejná komponenta `VisitSourceBadge` v `src/components/payments/`) se ukáže i v detailu
  rezervace v kalendáři a v seznamu rezervací na kartě klienta.

## 2. Volná místa ve skupinových lekcích

```ts
// src/engine/groups.ts
export interface GroupSessionOverview {
  session: GroupSession;
  serviceName: string;
  therapistId: Id;
  capacity: number;
  booked: number;               // obsazující rezervace
  free: number;
  waitlist: number;             // čekající na tento termín
  cancelled: boolean;           // termín zrušen (cancelledSessions)
  past: boolean;
  fill: 'free' | 'almost' | 'full';   // almost = volná místa ≤ 2 nebo obsazenost ≥ 80 %
}
export function groupSessionsOverview(s: ClinicState, from: LocalDate, to: LocalDate,
  f?: { serviceId?: Id | null; therapistId?: Id | null; onlyFree?: boolean }, now?: LocalDateTime): GroupSessionOverview[];
```

**Obrazovka „Skupinové lekce“** (`src/screens/groups`, položka menu „Skupinové lekce“):
- rozsah: tento týden / příštích 14 dní / vlastní; filtr lekce (služba) a trenér; přepínač „Jen s volnými místy“;
- termíny po dnech: čas, název lekce, trenér, místnost, ukazatel obsazenosti („7 z 12 · 5 volných“, plno = výrazně),
  čekací listina; zrušené termíny přeškrtnuté se štítkem; minulé skryté (přepínač „Zobrazit proběhlé“);
- akce: „Přihlásit klienta“ (otevře `NewBookingDialog` s předvyplněným termínem lekce) a „Účastníci“ (panel se
  seznamem účastníků a štítkem zdroje platby každého z nich, odkaz na kartu klienta);
- souhrn nahoře: počet termínů v rozsahu, volných míst celkem, plných termínů.
- **Přehled (dashboard)**: widget „Volná místa na skupinových lekcích“ – dnešní a zítřejší termíny s volnými místy.
- **Klientský portál**: na úvodní obrazovce sekce „Skupinové lekce tento týden“ s volnými místy a tlačítkem
  rezervace (jen online rezervovatelné služby; plné termíny s nabídkou čekací listiny, pokud ji portál umí).

Ukázková data: aspoň dvě skupinové služby s pravidelnými termíny (vedle workshopu např. „Neurovizuální trénink ve
skupině“, 60 min, kapacita 6), s různou obsazeností včetně plných termínů.

## 3. QR platba

Česká **QR Platba** (formát SPAYD 1.0, standard ČBA):
`SPD*1.0*ACC:<IBAN>*AM:<částka s tečkou a 2 des. místy>*CC:CZK*X-VS:<VS>*MSG:<zpráva>*RN:<příjemce>`.
Hodnoty bez `*` (nahradit/odstranit), zpráva max 60 znaků, jméno příjemce max 35 znaků, VS jen číslice max 10;
doporučeno bez diakritiky (převést) a velkými písmeny kvůli kapacitě QR.

```ts
// src/engine/qr.ts
export function czechAccountToIban(account: string): { ok: true; iban: string } | { ok: false; error: string };
  // vstup „[předčíslí-]číslo/kódbanky“, kontrola vah (mod 11) předčíslí i čísla, výpočet IBAN mod 97
export function isValidIban(iban: string): boolean;
export function buildSpayd(p: { iban: string; amount: number; vs?: string; message?: string; recipient?: string }): string;
export function formatIban(iban: string): string;  // po čtveřicích
```

**Nastavení → Platby**: číslo účtu (česky), vypočtený IBAN (jen pro čtení), jméno příjemce, přepínač „Nabízet QR
platbu“ (klientům v portálu i na recepci), splatnost QR platby z portálu v hodinách (výchozí 48). Uložené v
`settings.payments`:

```ts
export interface PaymentSettings {
  qrEnabled: boolean;
  accountNumber: string;     // „2000145399/0800“
  iban: string;              // vypočtený
  recipientName: string;     // výchozí název firmy
  qrDueHours: number;        // 48
}
```

Nový způsob platby: `MoneyMethod` + `'qr'` (štítek „QR platbou“) a `PaymentMethod` + `'qr'` (rezervace placená QR
převodem, dokud nepřijde platba `paid: false`). Doplnit všechna místa s `Record<MoneyMethod, …>` a popisky.

**Platební výzva** (nová kolekce `paymentRequests`):

```ts
export interface PaymentRequest {
  id: Id;
  clientId: Id;
  createdAt: LocalDateTime;
  createdBy: 'client' | 'staff';
  amount: number;
  vs: string;                          // jedinečný variabilní symbol, číslice
  message: string;                     // zpráva pro příjemce
  purpose: 'booking' | 'package' | 'credit_topup' | 'storno_fee';
  bookingId?: Id;                      // booking / storno_fee
  packageTemplateId?: Id;              // package – permanentka vznikne až po zaplacení
  packageId?: Id;                      // vyplní se po zaplacení
  status: 'pending' | 'paid' | 'cancelled';
  dueAt: LocalDateTime;
  paidAt: LocalDateTime | null;
  confirmedBy: string | null;
}
```

Variabilní symbol: `RRMM` + pořadí v měsíci na 4 místa (např. `26110007`), jedinečný napříč výzvami.

Příkazy (`src/engine/commands.ts`):

| Příkaz | Vstup | Výsledek |
|---|---|---|
| createPaymentRequest | clientId, purpose, amount?, bookingId?, packageTemplateId? | id (částku dopočítá z rezervace / šablony / poplatku; u kreditu povinná, min. 100 Kč) |
| confirmPaymentRequest | requestId, at? | – zapíše `PaymentRecord` s `method: 'qr'`; podle účelu: rezervace `paid`, prodá permanentku (`sellPackage` s `paidBy: 'qr'`), dobije kredit (`topUpCredit` s `method: 'qr'`, včetně bonusu), zaplatí poplatek |
| cancelPaymentRequest | requestId, reason? | – (rezervace zůstane nezaplacená, lze zaplatit jinak) |

`settleBooking`, `markCompleted`, `payFee`, `sellPackage`, `topUpCredit` přijímají `'qr'` jako způsob platby (na
recepci: klient naskenuje QR a zaplatí hned, personál potvrdí). Zaplacení rezervace jiným způsobem uzavře její
čekající výzvu (`cancelled`). `createBooking` s `payment.method: 'qr'` vytvoří nezaplacenou rezervaci a k ní výzvu.
Automatika (`processes.ts`): výzva po `dueAt` zůstává `pending` (jen se zobrazí jako po splatnosti), nic se neruší
automaticky.

UI:
- `src/components/payments/`: `QrCode` (SVG z knihovny `qrcode-generator`, přesná verze v package.json; barvy
  tokeny `--qr-fg`/`--qr-bg` v `styles/tokens.css`, ve světlém i tmavém motivu tmavé moduly na bílém pozadí, okraj
  4 moduly), `QrPaymentCard` (QR + částka, účet, IBAN, VS, zpráva, tlačítka kopírovat, popisek „QR Platba“),
  `QrPaymentDialog` (personál: ukázat QR klientovi, „Platba přijata“ → potvrdí, „Poslat platební údaje e-mailem“ →
  zpráva klientovi (simulace)), `PendingPaymentsList` (čekající výzvy: klient, účel, částka, VS, splatnost, potvrdit /
  zrušit), `VisitSourceBadge`.
- **Personál**: v kalendáři (dokončit a vyrovnat, zaplatit poplatek), na kartě klienta (prodej permanentky, dobití
  kreditu, vyrovnání dluhu) volba „QR platba“ otevře `QrPaymentDialog`. Čekající QR platby: widget na Přehledu a sekce
  na obrazovce Vstupy; na kartě klienta u dluhů.
- **Klientský portál**: volba „QR platba převodem“ při rezervaci, nákupu permanentky a dobití kreditu (jen když je
  `qrEnabled` a účet je vyplněný). Po potvrzení se ukáže `QrPaymentCard` a informace, že rezervace/permanentka/kredit
  se potvrdí po přijetí platby; čekající platby v sekci účtu „Kredit a platby“ a u rezervace.
- Bez vyplněného účtu se QR volba nenabízí a v nastavení je výzva účet doplnit.
- Ukázková data: vyplněný smyšlený účet, několik čekajících výzev (i po splatnosti) a zaplacené QR platby.
- Párování s bankou (např. Fio API) **není** součástí – platby potvrzuje personál podle VS z výpisu.

## Základ – rozhodnutí při implementaci

Spec výše platí; tady jsou upřesnění, která přinesl základ (engine, data, sdílené komponenty).

- **Knihovna**: `qrcode-generator` 1.4.4 (přesná verze, vlastní `qrcode.d.ts`), vkládá se do jednosouborového buildu.
  Matice je v `components/payments/qrMatrix.ts` (`qrMatrix`, `qrPath`, `QR_MARGIN = 4`): text SPAYD velkými písmeny
  jde v alfanumerickém režimu QR (menší kód), jiný text v bajtovém režimu UTF-8. Ověřeno dekódováním (jsQR).
- **SPAYD**: `*` se z hodnot odstraní (nahradí mezerou), diakritika se převede, typografické znaky (– „ “ …) na ASCII,
  vše velkými písmeny; MSG max. 60, RN max. 35 znaků, X-VS jen číslice (max. 10); nekladná částka a prázdná pole
  se vynechají. Pořadí polí jako v této specifikaci.
- **Nastavení**: `updateSettings({ payments: {...} })` – IBAN se vždy dopočítá z `accountNumber` (prázdné číslo účtu
  = bez QR), jméno příjemce povinné, max. 35 znaků, splatnost 1–720 h. `qrAvailable(s)` / `qrUnavailableReason(s)`
  (`engine/payments.ts`) = zapnuto a platný IBAN; bez toho `createPaymentRequest` i `createBooking` s `'qr'` selžou.
- **Výzvy** (`engine/payments.ts`): `pendingPaymentRequests(s, clientId?)` (podle splatnosti), `paymentRequestsOfClient`,
  `pendingRequestOfBooking(s, bookingId, 'booking' | 'storno_fee')`, `isPaymentRequestOverdue(r, now)`,
  `paymentRequestTitle`, `paymentRequestSpayd`, `paymentRequestEmail` (text pro `sendManualMessage`),
  `PAYMENT_PURPOSE_LABEL`, `PAYMENT_REQUEST_STATUS_LABEL`, `MONEY_METHOD_LABEL` (do věty: „QR platbou“) a
  `MONEY_METHOD_NAME` (název volby: „QR platba“).
- **createPaymentRequest**: k rezervaci a k poplatku vrátí už čekající výzvu (idempotentní – dialog lze otevřít
  opakovaně); k rezervaci jen u nezaplaceného potvrzeného / proběhlého termínu placeného na místě nebo QR – rezervace
  „na místě“ se tím přepne na `'qr'` (automatika ji pak nezaplatí kartou). Splatnost = `qrDueHours` od vystavení,
  u budoucí rezervace nejpozději její začátek. Zpráva pro příjemce: „Služba 6. 11. 2026 – Jméno Příjmení“,
  „Permanentka Koučink 10× – …“, „Dobití kreditu – …“, „Storno poplatek 4. 11. 2026 – …“. Přesun termínu
  (`rescheduleBooking`) čekající výzvě k termínu přepočítá splatnost i zprávu s novým datem; VS zůstává.
- **confirmPaymentRequest** `at` = datum připsání podle výpisu (ne v budoucnosti a ne před dnem vystavení výzvy;
  týž den dřív než vystavení – např. výchozí poledne – se posune na okamžik vystavení); platba, permanentka i dobití
  dostanou toto datum, k poznámce platby se připíše „VS …“. Nejdřív kontroly, pak změny (nic se nezmění napůl).
  Zaplatit lze i výzvu po splatnosti. Permanentka se vystaví za částku i podle podmínek z objednávky – výzva si při
  vystavení uloží `packageTerms` (název, vstupy, služby, platnost, omluvenky); platí i tehdy, když se šablona
  mezitím změnila nebo se stáhla z nabídky (starší výzvy bez `packageTerms` se řídí šablonou).
- **Platba podle zrušené výzvy**: potvrdit lze i zrušenou výzvu – klient mohl zaplatit z banky dřív, než se termín
  zrušil, zapsalo nedostavení nebo se zaplatilo jinak. `paymentRequestOutcome(s, r)` (`engine/payments.ts`) řekne, co
  potvrzení udělá: `apply` – účel pořád trvá (nezaplacený potvrzený / proběhlý termín, poplatek k úhradě, dobití) a
  platba ho uhradí (další čekající výzvy k témuž termínu se zruší); `credit` – účel už netrvá (termín zrušený,
  nedostavení, zaplacený jinak; poplatek vyřízený; zrušená objednávka permanentky; chybějící permanentka), přijatá
  částka se zapíše jako `PaymentRecord` `method: 'qr'`, `purpose: 'credit_topup'` a připíše na kredit (`topup`,
  bez bonusu) s upozorněním; `blocked` – už zaplaceno. Personál takovou platbu najde na Vstupech hledáním podle VS
  (`findPaymentRequestsByVs` – všechny stavy) a potvrdí tlačítkem „Platba přišla“; potvrzovací dialog řekne, co se
  stane. Klientský portál u zrušené výzvy i při zrušení termínu vysvětlí, co se stane s už odeslanou platbou.
- **Zaplaceno jinak**: `settleBooking` / `markCompleted(settleWith)` jiným způsobem než QR výzvu k termínu zruší a
  rezervaci přepnou z `'qr'` na `'onsite'` (zdroj platby pak odpovídá skutečnosti); `settleWith: 'qr'` /
  `method: 'qr'` (klient zaplatil QR hned na recepci) čekající výzvu označí jako zaplacenou. Totéž `payFee` u výzvy
  k poplatku; `waiveFee` a oprava nedostavení na „proběhlo“ výzvu k poplatku zruší. `cancelBooking` (všechny volby)
  a `markNoShow` zruší čekající výzvu k termínu. Klient může zrušit vlastní čekající výzvu.
- **Dluh**: nezaplacený proběhlý termín s `'qr'` se počítá jako dluh stejně jako „na místě“ (`clientSummary`,
  seznam klientů, `debtItems`).
- **Zdroj platby** (`engine/visits.ts`): `'qr'` bez čekající výzvy (zrušená) → `unpaid` („QR platba zrušena –
  zaplatit jinak“). Účtovaný vstup s poplatkem (pozdní storno / nedostavení nezaplaceného termínu) se řídí
  poplatkem: z kreditu → `credit`, zaplacený → `single`, k úhradě → `unpaid` (s čekající QR výzvou `qr_pending`),
  odpuštěný → `free`; u zaplacených termínů je částka = poplatek a detail „· storno poplatek 50 %“. Propadlý vstup
  z permanentky zůstává `package` („· vstup propadl“). `free` má částku 0. Termín na místě zaplacený z kreditu → `credit`
  („z kreditu na místě“). Pořadí vstupu v permanentce počítá vstupy, které ji čerpají (proběhlé, nadcházející,
  nedostavení, propadlé pozdní storno). `visitsOverview`: řádky chronologicky, `byEmployee` všichni aktivní zaměstnanci
  (i s nulou) v pořadí z nastavení, `totals.therapistId = ''`. `VISIT_SOURCES`, `VISIT_SOURCE_LABEL`,
  `VISIT_SOURCE_TONE`, `emptyVisitSummary`, `sessionParticipantRows(s, sessionId, today)` pro panel Účastníci.
- **Skupiny** (`engine/groups.ts`): `to` exkluzivně (jako statistiky), `past` = termín skončil (jen se zadaným `now`),
  `onlyFree` vynechá zrušené a plné, řazení podle začátku. `groupOverviewSummary(list)` → počet termínů, volná místa,
  plné termíny, čekající (bez zrušených). `sessionFill(capacity, booked)`.
- **Statistiky**: `computeStats(...).revenueByMethod` (včetně `qr`).
- **Komponenty** (`components/payments`): `QrPaymentDialog` přijme `requestId`, nebo `create` (výzva vznikne jednou
  při otevření); `readOnly` jen ukáže QR. `PendingPaymentsList` (`clientId?`, `hideClient`, `readOnly`, `hideEmpty`,
  `limit`) – potvrzení s datem připsání; potvrzovat a rušit může jen majitelka a recepce. `VisitSourceBadge`
  (`info` nebo `booking`, `showDetail`, `showAmount`). `copyToClipboard(text, hláška)` – bez schránky jen rada.
  V UI kitu přibyla ikona `qr`.
- **Ukázková data**: smyšlený účet `2900000048/2010`; „Neurovizuální trénink ve skupině“ (kategorie Neurovizuální
  trénink, 450 Kč, Po a St 16:00, Pá 8:00, trenérka Lucie Vávrová, místnost Tréninková) s permanentkou
  „Neurotrénink ve skupině 8×“; nejbližší termíny plné / skoro plné / s volnými místy a čekající na plné termíny;
  QR platby za termíny, permanentky, dobití i poplatky (zaplacené) a několik čekajících výzev včetně dvou po splatnosti.
- **Typy a data**: `PaymentRequest.purpose` používá existující typ `PaymentPurpose` (stejné čtyři hodnoty jako výše).
  Verze datového formátu zůstává 2 – chybějící `settings.payments` i kolekci `paymentRequests` doplní opakovatelná
  migrace (starý stav se pozná podle nich, ne podle verze).

## Obrazovky a integrace – rozhodnutí a odchylky

Obrazovky popisuje `docs/SCREENS.md` (I · Vstupy, J · Skupinové lekce, K · platební komponenty a doplňky
v kalendáři, kartě klienta, nastavení, na Přehledu a v portálu). Oproti specifikaci výše:

- **Menu a přístup** (`app/AdminApp.tsx`, `store/session.ts`): „Skupinové lekce“ (ikona `calendarCheck`) hned za
  Kalendářem, „Vstupy“ (ikona `receipt`) za Follow-upy. Majitelka vše; recepce Vstupy i Skupinové lekce; terapeut
  Skupinové lekce a Vstupy (obrazovka mu zamkne zaměstnance na `actor.therapistId`). Trasy `{ name: 'vstupy' }`
  a `{ name: 'skupiny' }` fungují i jako `#vstupy` / `#skupiny`.
- **Vstupy – období**: týden a měsíc jsou celé kalendářní (i s plánovanými vstupy – „bude“ i „bylo“), šipkami lze
  přejít na jiné období; vlastní rozsah je v UI včetně konce, nejvýš 366 dní.
- **Vstupy – souhrn a filtr zaměstnance**: výběr zaměstnance (select nebo klik na řádek) filtruje jen seznam
  vstupů, souhrn dál ukazuje všechny se zvýrazněným řádkem. Řádek Celkem se u jediného řádku (terapeut) skrývá.
- **Nezaplaceno vs. plánované**: podle pravidel výše je nezaplacený termín „na místě“ zdroj `unpaid` i před
  začátkem. Aby přehled nestrašil, je červeně jen dluh po termínu: `VisitSourceBadge` s předanou rezervací ukáže
  nezaplacený potvrzený termín neutrálně, číslo „Nezaplaceno“ v souhrnu je červené jen tehdy, když jsou mezi
  vstupy i ty po termínu, a dlaždice Nezaplaceno je rozdělí (po termínu s částkou · plánované · čeká na QR).
- **Export CSV**: dva exporty – seznam vstupů (všechny vyfiltrované, ne jen stránka) a souhrn po zaměstnancích.
  Datum RRRR-MM-DD, čas HH:mm, částka celé číslo, nezlomitelné mezery jako obyčejné, ochrana proti vzorcům.
  Stahuje `downloadBlob(blob, name)` ze `store/files.ts` (stejné cesty a hlášky jako `downloadFile`, jen pro obsah
  v paměti; `downloadFile` umí jen soubory uložené v úložišti).
- **Vstupy – čekající QR platby** jen pro majitelku a recepci (`PendingPaymentsList` nefiltruje podle
  zaměstnance, s `searchable` hledá podle VS i mezi zaplacenými a zrušenými výzvami); terapeut vidí štítky
  „Čeká na QR platbu“ u svých vstupů. Navíc dlaždice souhrnu, tlačítko detailu
  (`BookingDrawer`) a karty místo tabulky na telefonu.
- **Skupinové lekce – text obsazenosti** používá `prepZ`: „7 ze 12 · 5 volných“ (ve specifikaci „7 z 12“); plný
  termín jen „12 ze 12“ vedle štítku „Plno“. `prepZ` nově správně vrací „ze“ i pro 100–199 a počítá s tisíci
  („ze 120“, „z 1 000“, „ze 2 000“); místní kopie v kartě klienta a portálu ho jen přebírají.
- **Skupinové lekce – terapeut**: přepínač „Jen moje lekce“ (výchozí zapnuto) místo zamčeného trenéra – do cizích
  lekcí také přihlašuje klienty. Widget na Přehledu ukazuje terapeutovi jen jeho lekce.
- **Skupinové lekce – rozsah a souhrn**: šipky posunou týden / 14 dní; vlastní rozsah včetně konce, nejvýš 92 dní.
  Souhrn počítá po filtrech lekce, trenéra a „Zobrazit proběhlé“, ale před „Jen s volnými místy“ (jinak by plných
  bylo vždy 0); ukazuje i čekající, kapacitu a obsazenost %. U plného termínu akce „Na čekací listinu“ (stejný
  `NewBookingDialog`), skrytá bez čekací listiny; proběhlé a zrušené termíny akci nemají.
- **Přehled**: widget QR plateb v hlavním sloupci za Follow-upy (v úzkém pravém sloupci by řádky byly stísněné),
  bez rozbalování (`expandable={false}`) – celý seznam je na Vstupech. Widget volných míst v pravém sloupci; když
  dnes a zítra nic volného není, poradí nejbližší volný termín do 14 dní. Oba widgety se skryjí, když nemají co
  ukázat (QR vypnutá a nic nečeká; žádné skupinové lekce).
- **QR na recepci** (`useQrOption()` v `screens/calendar`): QR vypnutá → volba skrytá všem; zapnutá bez platného
  účtu → majitelka vidí zakázanou volbu s nápovědou, recepce a terapeut nic. Navíc „QR platba převodem“
  v `NewBookingDialog` a „QR platba předem“ v menu detailu rezervace. „Proběhlo → QR platba“ zapíše docházku bez
  vyrovnání a otevře QR; termín zůstane proběhlý a nezaplacený s čekající výzvou do „Platba přijata“.
- **Karta klienta**: tabulka rezervací má vždy sloupec platby – finanční role štítek a poznámku o platbě, ostatní
  jen štítek (nadpis „Zdroj platby“); u zrušených termínů bez štítku (přehled vstupů je nepočítá).
- **Portál**: předvybraný termín lekce a otevření QR po přijetí nabídky z čekací listiny předává jednorázový záměr
  (`PortalIntent` v `portal/context.ts`), ne trasa – po obnovení stránky se nezachová. „Tento týden“ = zbytek
  aktuálního týdne, jinak příští týden s jiným nadpisem. Klient může navíc zaplatit QR předem nezaplacený termín
  na místě, zaplatit poplatek QR a zrušit vlastní čekající výzvu („Zaplatím jinak“ / „Zrušit objednávku“ /
  „Zrušit dobití“). Pomocné čisté funkce jsou v `portal/logic.ts`.
- **Zrušená QR výzva**: zrušení poslední čekající výzvy k nezaplacenému termínu (`cancelPaymentRequest`, zrušení
  termínu, nedostavení) přepne rezervaci z `'qr'` zpět na `'onsite'` – platí se na místě, jak ji popisuje UI, a
  automatika ji po termínu vyrovná jako ostatní platby na místě (jinak by z ní zůstal dluh). Detail rezervace
  dál ukáže „QR platba zrušena“ s VS. Starší data s `'qr'` bez čekající výzvy: `paymentLabel` vrací „na místě
  (… Kč)“, `BookingStatusBadges` „Platba na místě“, automatika s nimi zachází jako s `'onsite'` a přehled vstupů
  je ukáže jako `unpaid` s detailem „QR platba zrušena – zaplatit jinak“.
- **Zaplacená / zrušená výzva v `QrPaymentCard`**: bez QR kódu, čísla účtu, IBAN a kopírování (jen částka, VS
  a zpráva), aby ji nikdo nezaplatil podruhé. Postup „naskenujte QR kód“ v portálu a nápověda v dialogu se ukáže,
  jen když QR platba jde použít (`qrAvailable`); kdo nemůže platbu potvrdit (terapeut), dostane radu, že ji
  potvrdí recepce.
- **Vstupy – dlaždice Nezaplaceno**: části se nepřekrývají – po termínu (`unpaid` po začátku, s částkou),
  plánované (`unpaid` potvrzené) a čeká na QR (`qr_pending`) dávají dohromady číslo dlaždice.
- **Účastníci skupinové lekce**: terapeut vidí zdroj platby bez částky (stejně jako v detailu rezervace).
- **QrPaymentCard / QrPaymentDialog**: dialog má šířku `lg`, údaje spadnou pod QR, když by vedle něj byly užší
  než 300 px, a lámou se jen mezi slovy. Bez dostupné QR platby vidí klient srozumitelnou radu (zaplatit podle
  údajů / domluvit se na recepci), personál výzvu doplnit účet v Nastavení → Platby.
- **Známá omezení**: variabilní symbol se generuje na zařízení – dvě zařízení, která vystaví výzvu ve stejný okamžik
  nad sdílenou databází artefaktu, by ve vzácném případě mohla dostat stejný VS. Demo účet `2900000048/2010`
  je smyšlený a prochází jen kontrolním součtem, ale kód banky 2010 je skutečný (Fio banka) – neověřovali jsme, že
  takový účet neexistuje. QR z ukázkových dat proto neplaťte; před ostrým provozem zadejte v Nastavení → Platby
  vlastní účet.
