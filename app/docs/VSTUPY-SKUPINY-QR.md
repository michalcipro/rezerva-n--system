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
  accountNumber: string;     // „123456789/0800“
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
