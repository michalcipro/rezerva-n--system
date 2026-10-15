# Winning Minds – architektura pro vývojáře

Webová aplikace (React 18 + TypeScript, Vite, bez UI knihoven) pro Winning Minds: mentální koučink, terapie,
neurovizuální trénink, strategický koučink a mentoring (1:1 i skupinové workshopy). Slouží hlavně jako kalendář
a CRM (fáze spolupráce, poznámky, soubory, follow-upy – viz `docs/CRM.md`), dál umí online rezervace
a klientský portál. Běží jako claude.ai artefakt (sdílená databáze, assety pro soubory) nebo lokálně
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
    crm.ts               CRM selektory (fáze, poznámky, soubory, follow-upy, pipelineStats…), NOTE_TEXT_MAX,
                         NOTE_KIND_LABEL, followUpDueLabel, sessionNotesEmail – viz docs/CRM.md
    defaults.ts          výchozí katalog (služby, terapeuti, permanentky, nastavení)
    seed.ts              generátor ukázkových dat (simulace provozu)
  store/
    store.ts             globální stav, dispatch příkazů, ukládání, synchronizace
    session.ts           nastavení prohlížeče: testovací role, otevřená obrazovka, motiv
    hooks.ts             useClinic, useNow, useActor, useCommand, useStore
    files.ts             binární obsah souborů klientů (assety artefaktu / IndexedDB): storeFile, getFileUrl,
                         readFileText, deleteStoredFile, downloadFile, canStoreFiles, clearLocalFiles
  ui/                    designový systém (viz src/ui/README.md) – primitivy a AppShell
  styles/                tokens.css (barvy světlý/tmavý motiv), base.css, components.css
  components/            sdílené doménové komponenty (PolicyTimeline, avatary, štítky)
  components/crm/        sdílené CRM komponenty (styly .crm-…): StageBadge, StageControl, FollowUpDialog,
                         FollowUpRow, NotesPanel, SessionNoteEditor, SendSessionNotesDialog, AudioRecorder,
                         PlaudImportDialog, FilesPanel, FileViewerDialog, FileUploadButton
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
| createBooking | clientId, serviceId, therapistId, start, sessionId?, payment{method:'package'\|'credit'\|'online'\|'onsite'\|'makeup'\|'free', packageId?, makeupId?}, channel?, note?, override? | bookingId |
| cancelBooking | bookingId, option ('free'\|'excuse'\|'grace'\|'fee'\|'clinic'), reason? | {message} |
| rescheduleBooking | bookingId, start, therapistId?, sessionId?, override?, useExcuse? | bookingId |
| markCompleted | bookingId, settleWith? ('cash'\|'card'\|'online'\|'transfer'\|'credit'\|null) | – |
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
| updateSettings | částečný patch (vnořené bookingRules, policy, policy.excuses, waitlist, reminders) | – |
| updateTemplate | key, patch | – |
| saveCampaign / deleteCampaign / sendCampaign / scheduleCampaign | Campaign / {campaignId} / {campaignId} / {campaignId, at} | id / – / počet / – |
| sendManualMessage | clientId, channel, subject, body | id |
| setSimulatedNow | value\|null | – |

CRM příkazy (setClientStage, saveStages, addNote, updateNote, deleteNote, sendSessionNotes, addFileRecord,
updateFileRecord, removeFileRecord, addFollowUp, updateFollowUp, setFollowUpDone, deleteFollowUp) popisuje
`docs/CRM.md`.

Před vytvořením nebo přesunem termínu ukaž personálu výsledek `checkBookingSlot` (chyby blokují,
varování lze vědomě přejít a poslat `override: true`). Volby zrušení ber z `evaluateCancellation(s, b, now, 'staff'|'client').options`.

## Pravidla UI

- Čeština, přirozená a gramaticky správná. Formátuj výhradně funkcemi z `engine/format.ts`.
- Komponenty a tokeny ze `src/ui` (`import { Button, Dialog, … } from '../../ui'`). Barvy jen přes CSS
  proměnné (`var(--…)`), žádné literální barvy – aplikace má světlý i tmavý motiv.
- Vlastní styly dané obrazovky: jeden CSS soubor ve tvé složce (importovaný z komponenty), třídy s prefixem
  oblasti (např. `.cal-…`, `.cli-…`, `.pip-…`, `.set-…`, `.st-…`, `.com-…`, `.por-…`, sdílené CRM `.crm-…`).
- Žádné `window.alert/confirm/prompt` (v artefaktu nefungují) – potvrzení přes `ConfirmDialog`.
- Přístupnost: skutečné `<button>`, `<label>`, `aria-label` u ikonových tlačítek, focus, kontrast.
- Responzivita: funguje od 360 px šířky bez vodorovného posunu stránky; široké tabulky a kalendář ve vlastním
  `overflow-x: auto` kontejneru.
- Žádná emoji. Ikony přes `<Icon name="…" />`.
- Prázdné stavy vždy navrhni (co se zobrazí a jak přidat první položku).
- Výkon: drahé výpočty (statistiky, rozvrh dne, segmenty) v `useMemo` podle `clinic` a parametrů.

## Navigace

- Administrace: `navigate({ name: 'klient', clientId })`, `navigate({ name: 'kalendar' })` … (`store/session.ts`).
  Karta klienta rovnou na konkrétní kartě: `navigate({ name: 'klient', clientId, tab: 'poznamky' })` (`ClientTab`).
  CRM obrazovky: `navigate({ name: 'pipeline' })`, `navigate({ name: 'followupy' })`.
- Datum a pohled kalendáře: `setSession({ calendarDate, calendarView, calendarTherapist })`.
- Klientský portál: `navigatePortal({ name: 'rezervace' })` …
- Testovací role: `session.role` (`owner` | `reception` | `therapist` | `client`), `session.clientId`.
