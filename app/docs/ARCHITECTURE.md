# Rezervační systém „pohyb" – architektura pro vývojáře

Webová aplikace (React 18 + TypeScript, Vite, bez UI knihoven) pro soukromou kliniku: fyzioterapie, masáže,
kondiční tréninky 1:1 a skupinové lekce. Běží jako claude.ai artefakt (sdílená databáze) nebo lokálně
(`npm run dev`, data v IndexedDB). Celé UI je česky.

## Struktura

```
src/
  domain/types.ts        datový model (čti jako první)
  engine/                čistá doménová logika bez Reactu (testy v tests/)
    time.ts              lokální čas 'YYYY-MM-DDTHH:mm', sčítání, týden, ISO týden…
    format.ts            české formátování: formatMoney, formatDayShort, formatTime, formatTimeRange,
                         formatDateLong, formatRelative, formatSpan, formatDuration, plural, countLabel…
    selectors.ts         dotazy: getClient/getService/getTherapist…, bookingsOfClient, bookingsOfTherapistOnDate,
                         packageUsage, eligiblePackages, clientCredit, openMakeups, eligibleMakeups,
                         excuseStatusFor, clientSummary, sessionsOnDate, getSession, sessionParticipants,
                         sessionFreeSpots, therapistName, therapistShort, therapistInitials, clientName,
                         STATUS_LABEL, isOccupying, serviceCategoryTone
    availability.ts      availableSlots (volné začátky po 15 min), checkBookingSlot (chyby/varování),
                         daySchedule (rozvrh dne pro kalendář), workingIntervals, freeWindows,
                         occupancyPct, nextAvailableDate, shiftBounds
    policy.ts            evaluateCancellation (fáze, stupně poplatků, omluvenky, volby zrušení, časová osa)
    commands.ts          všechny změny dat (viz níže)
    processes.ts         runProcesses – automatika (docházka, připomínky, propadání náhrad, nabídky…)
    stats.ts             computeStats (KPI, grafy, heatmapa, trend), daySummary
    segments.ts          evaluateSegment, segmentFunnel, describeRule, RULE_TYPES, defaultRule, campaignPlainText
    messages.ts          šablony zpráv, renderTemplate, TEMPLATE_VARIABLES, paymentLabel
    qr.ts                QR Platba (SPAYD): parseAccount (číslo účtu → IBAN, kontrola vah), buildSpayd,
                         paymentSpayd, nextVs (variabilní symbol RRMM + pořadí), qrReady,
                         pendingPaymentRequests, pendingRequestFor
    visits.ts            přehled vstupů: visitPaymentInfo (permanentka / kredit / jednorázově / náhrada / zdarma
                         + stav platby), visitsOverview (po zaměstnancích), visitsCsv
    groups.ts            obsazenost skupinových lekcí: groupSessionsOverview, groupTotals, groupServices, fillOf
    importer.ts          import ze stávajícího systému (CSV z Excelu): parseCsv, readImportFile (české i anglické
                         názvy sloupců), náhled checkClientRows / checkPackageRows / checkCreditRows, šablony
                         importTemplateCsv; příkazy importClients, importPackages, importCredits
    gdpr.ts              clientDataExport (export osobních údajů, české klíče), anonymizationCheck, isAnonymized;
                         příkazy anonymizeClient, logClientDataExport
    features.ts          přepínače funkcí stejně jako příkazy: clinicalNotesOn, cardPaymentsOn
    auditLog.ts          pushAudit – historie změn pro příkazy mimo commands.ts
    defaults.ts          výchozí katalog (služby, terapeuti, permanentky, nastavení)
    seed.ts              generátor ukázkových dat (simulace provozu)
  store/
    store.ts             globální stav, dispatch příkazů, ukládání, synchronizace
    session.ts           nastavení prohlížeče: testovací role, otevřená obrazovka, motiv
    hooks.ts             useClinic, useNow, useActor, useCommand, useStore
  ui/                    designový systém (viz src/ui/README.md) – primitivy a AppShell
  styles/                tokens.css (barvy světlý/tmavý motiv), base.css, components.css
  components/            sdílené doménové komponenty (PolicyTimeline, avatary, štítky)
    payments/            QrCode, QrPaymentCard, QrPaymentDialog (recepce), PendingPaymentsList, VisitSourceBadge
  screens/<oblast>/      obrazovky administrace (každá oblast má vlastní složku a index.ts)
  portal/                klientský portál (mobilní rezervace)
  app/                   kostra aplikace: App, AdminApp, TestBar, úvodní volba dat
```

Vlastnictví: každá oblast `screens/<oblast>` a `portal` patří jednomu vývojáři. Neupravuj cizí složky,
`engine/`, `store/`, `ui/`, `styles/` ani `app/`. Když v enginu něco chybí, napiš pomocnou funkci ve
své složce (čisté funkce nad `ClinicState`) a uveď to v závěrečné zprávě.

## Data a čas

- Stav `ClinicState` je neměnný (Immer). Čti přes `useClinic()` a selektory, měň **jen** přes příkazy.
- Čas kliniky: `useNow()` (respektuje testovací hodiny `settings.simulatedNow`). Nikdy `new Date()` pro logiku.
- Datum/čas jsou řetězce: `LocalDateTime = '2026-10-14T09:30'`, `LocalDate = '2026-10-14'`; porovnání řetězců = porovnání času.
- Týden začíná pondělím (`weekdayOf`: 0 = Po … 6 = Ne).

## Příkazy (engine/commands.ts)

Volání z UI vždy přes hook:

```tsx
const run = useCommand();
const r = run(cancelBooking, { bookingId, option: 'excuse', reason }, { success: 'Termín omluven' });
if (r.ok) onClose();
```

`useCommand` sám zobrazí chybu (toast) a upozornění vrácená příkazem. Příkazy:

| Příkaz | Vstup | Výsledek |
|---|---|---|
| createClient | firstName, lastName, email, phone, birthDate?, tags?, source?, consents{gdpr,health,marketingEmail,sms}, internalNote? | id |
| updateClient | clientId, patch{…} | – |
| setConsent | clientId, key, value | – |
| addClinicalNote | clientId, text | id |
| createBooking | clientId, serviceId, therapistId, start, sessionId?, payment{method:'package'\|'credit'\|'online'\|'onsite'\|'qr'\|'makeup'\|'free', packageId?, makeupId?}, channel?, note?, override? | bookingId (u 'qr' vznikne i platební výzva) |
| cancelBooking | bookingId, option ('free'\|'excuse'\|'grace'\|'fee'\|'clinic'), reason? | {message} |
| rescheduleBooking | bookingId, start, therapistId?, sessionId?, override?, useExcuse? | bookingId |
| markCompleted | bookingId, settleWith? ('cash'\|'card'\|'online'\|'transfer'\|'qr'\|'credit'\|null) | – |
| settleBooking | bookingId, method | – |
| markNoShow | bookingId | {message} |
| waiveFee / payFee | bookingId, reason / method | – |
| updateBookingNote | bookingId, note | – |
| sellPackage | clientId, templateId, paidBy, startDate? | packageId |
| extendPackage / cancelPackage | packageId, days, reason / refundToCredit | – |
| topUpCredit / adjustCredit | clientId, amount, method / note | {bonus} / – |
| joinWaitlist / leaveWaitlist | clientId, serviceId, therapistId\|null, dateFrom, dateTo?, sessionId?, note? / entryId | id / – |
| acceptWaitlistOffer / declineWaitlistOffer | entryId, payment / entryId | bookingId / – |
| upsertService, upsertCategory, upsertTherapist, upsertPackageTemplate, upsertGroupTemplate | celý objekt (nový: id '') | id |
| setServiceTherapists | serviceId, therapistIds | – |
| cancelSession | sessionId, reason | počet zrušených |
| addTimeOff / removeTimeOff | {therapistId\|null, start, end, reason} / {id} | id |
| createPaymentRequest | clientId, purpose ('booking'\|'package'\|'credit_topup'\|'storno_fee'), bookingId?, packageTemplateId?, amount?, sendEmail?, vs? | {requestId, vs} |
| confirmPaymentRequest | requestId (jen personál – peníze dorazily) | {message} |
| receiveQrPayment | jako createPaymentRequest (recepce: zaplaceno hned u pultu) | {requestId, message} |
| cancelPaymentRequest / notifyPaymentSent | requestId | – |
| updateSettings | částečný patch (vnořené bookingRules, policy, policy.excuses, waitlist, reminders, payments) | – |
| updateTemplate | key, patch | – |
| saveCampaign / deleteCampaign / sendCampaign / scheduleCampaign | Campaign / {campaignId} / {campaignId} / {campaignId, at} | id / – / počet / – |
| sendManualMessage | clientId, channel, subject, body | id |
| setSimulatedNow | value\|null | – |
| importClients *(importer.ts)* | rows (texty ze souboru), onDuplicate 'skip'\|'update' – jen majitelka a recepce | {created, updated, skipped, errors, failed} |
| importPackages / importCredits *(importer.ts)* | rows | {created, updated, skipped, errors, failed} |
| anonymizeClient *(gdpr.ts)* | clientId – jen majitelka; odmítne s nadcházející rezervací nebo čekající QR platbou | {message} |
| logClientDataExport *(gdpr.ts)* | clientId – záznam o stažení exportu do historie změn | – |

Před vytvořením nebo přesunem termínu ukaž personálu výsledek `checkBookingSlot` (chyby blokují,
varování lze vědomě přejít a poslat `override: true`). Volby zrušení ber z `evaluateCancellation(s, b, now, 'staff'|'client').options`.

## Pravidla UI

- Čeština, přirozená a gramaticky správná. Formátuj výhradně funkcemi z `engine/format.ts`.
- Komponenty a tokeny ze `src/ui` (`import { Button, Dialog, … } from '../../ui'`). Barvy jen přes CSS
  proměnné (`var(--…)`), žádné literální barvy – aplikace má světlý i tmavý motiv.
- Vlastní styly dané obrazovky: jeden CSS soubor ve tvé složce (importovaný z komponenty), třídy s prefixem
  oblasti (např. `.cal-…`, `.cli-…`, `.set-…`, `.st-…`, `.com-…`, `.por-…`).
- Žádné `window.alert/confirm/prompt` (v artefaktu nefungují) – potvrzení přes `ConfirmDialog`.
- Přístupnost: skutečné `<button>`, `<label>`, `aria-label` u ikonových tlačítek, focus, kontrast.
- Responzivita: funguje od 360 px šířky bez vodorovného posunu stránky; široké tabulky a kalendář ve vlastním
  `overflow-x: auto` kontejneru.
- Žádná emoji. Ikony přes `<Icon name="…" />`.
- Prázdné stavy vždy navrhni (co se zobrazí a jak přidat první položku).
- Výkon: drahé výpočty (statistiky, rozvrh dne, segmenty) v `useMemo` podle `clinic` a parametrů.

## Navigace

- Administrace: `navigate({ name: 'klient', clientId })`, `navigate({ name: 'kalendar' })` … (`store/session.ts`).
- Datum a pohled kalendáře: `setSession({ calendarDate, calendarView, calendarTherapist })`.
- Klientský portál: `navigatePortal({ name: 'rezervace' })` …
- Testovací role: `session.role` (`owner` | `reception` | `therapist` | `client`), `session.clientId`.

## QR platby

- Platba převodem přes **QR Platbu** (český standard ČBA, formát SPAYD 1.0). Účet kliniky je v
  `settings.payments` (`accountNumber` česky, vypočtený `iban`, `recipientName`, `qrDueHours`, `qrEnabled`).
  Bez platného účtu se QR nenabízí (`qrReady`).
- **Platební výzva** (`paymentRequests`): co se platí (termín, permanentka, dobití kreditu, storno poplatek),
  částka, jedinečný variabilní symbol, splatnost. Personál ji potvrdí (`confirmPaymentRequest`), když peníze
  dorazí – teprve pak se termín označí jako zaplacený, vznikne permanentka, připíše se kredit (i s bonusem)
  nebo se uhradí poplatek. Platba za mezitím zrušený termín skončí na kreditu klienta.
- Na recepci klient naskenuje QR a zaplatí hned (`receiveQrPayment`), nebo dostane platební údaje e-mailem
  a zaplatí později (výzva čeká). Zaplacení termínu jinak (hotově, kartou, kreditem) i jeho zrušení
  čekající výzvu uzavře.
- Párování s bankou (např. přes API banky) v testovací verzi není – platby se potvrzují ručně podle VS.

## Funkce, import a GDPR

- Přepínače `settings.features` (Nastavení → Funkce): bez klinických poznámek UI skryje záložku Dokumentace
  a kartu Klinická poznámka (`clinicalNotesOn`), bez platby kartou se volba „Kartou online“ nenabízí v portálu
  ani v nové rezervaci na recepci (`cardPaymentsOn`).
- Import (Nastavení → Import dat): Klienti → Permanentky → Kredity. Náhled i příkaz kontrolují řádky stejnými
  funkcemi, takže na serveru dopadne import stejně. Převedená permanentka má příponu „(převod)“ a pole
  `importedAt`; kredit je pohyb „Převod zůstatku ze stávajícího systému“.
- GDPR (detail klienta → menu): „Export údajů (GDPR)“ stáhne JSON, „Anonymizovat klienta“ (majitelka) odstraní
  osobní údaje a nechá účetní záznamy. Anonymizovaný klient má `anonymizedAt` a štítek „Anonymizováno“.
