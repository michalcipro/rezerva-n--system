# Specifikace obrazovek

Vizuální předloha: varianta „1 · Klinik" (klidná klinická přesnost). Referenční artboardy (HTML s inline styly,
čti je jen jako vizuální předlohu): `/tmp/claude-0/-home-user-rezerva-n--system/359bf26c-1318-57f3-b29e-595d1aab27c9/scratchpad/canvas/project/`
`Main.dc.html` (kalendář), `V1-Klient.dc.html`, `V1-Statistiky.dc.html`, `V1-Komunikace.dc.html`,
`V1-Rezervace.dc.html` (mobilní rezervace), `V1-Omluvenka.dc.html` (mobilní omluvenka).

Společné: obrazovka začíná komponentou `PageHeader` (titulek, podtitul, akce). Obsah je v kartách (`Card`) jen
tam, kde je to potřeba. Sekční popisky 11 px, verzálky, prostrkané. Časy a částky `tnum`. Vše česky.

**Menu administrace** (`src/app/AdminApp.tsx`, trasy v `store/session.ts`): Přehled · Kalendář · **Skupinové
lekce** · Klienti · **Pipeline** · **Follow-upy** · **Vstupy** · Permanentky a kredity · Služby a ceník · Tým a směny ·
Komunikace · Statistiky · Nastavení. Majitelka vidí vše; recepce Přehled, Kalendář, Skupinové lekce, Klienti,
Pipeline, Follow-upy, Vstupy, Permanentky, Služby, Tým a Komunikaci; terapeut (kouč) Přehled, Kalendář, Skupinové
lekce, Klienty, Pipeline, Follow-upy a Vstupy (jen své). CRM vrstvu (fáze spolupráce, poznámky, soubory,
follow-upy) popisuje `docs/CRM.md`; přehled vstupů, volná místa ve skupinách a QR platbu `docs/VSTUPY-SKUPINY-QR.md`
(obrazovky I–K níže).

---

## A · Kalendář (`src/screens/calendar`, prefix tříd `cal-`)

Exporty v `index.ts`:
- `CalendarScreen()`
- `NewBookingDialog({ open, onClose, initial?: { clientId?, serviceId?, therapistId?, start?, sessionId? } })`
- `BookingDrawer({ bookingId: Id | null, onClose })`
- `CancelBookingDialog({ bookingId, open, onClose })`, `RescheduleDialog({ bookingId, open, onClose })`
- `useQrOption()` → `{ available, setupHint }` – zda nabízet volbu „QR platba“ v platebních nabídkách personálu
  (používá i karta klienta). QR vypnutá → volba skrytá všem; zapnutá bez platného účtu → majitelka vidí zakázanou
  volbu s nápovědou „Pro QR platbu doplňte číslo účtu v Nastavení → Platby.“, ostatní role nic.

Obsah:
1. Hlavička: datum („Středa 14. října 2026"), šipky předchozí/další den (týden), „Dnes", přepínač Den / Týden,
   filtr terapeuta (Všichni / jednotlivci), legenda kategorií. Datum a pohled v `session.calendarDate/View/Therapist`.
2. Souhrn dne (`daySummary`): rezervace, skupinové lekce a účastníci, obsazenost %, probíhá teď, omluvenky, nedostavení.
3. **Denní pohled** – sloupce = terapeuti (`daySchedule`): hlavička (avatar, jméno, zaměření, místnost,
   mikrograf obsazenosti %), časová osa 7:00–20:00, viditelná 15min mřížka (hodiny výrazněji, čtvrthodiny
   jemně), šrafovaně mimo pracovní dobu a pauzy (+ nápis „Pauza"), nepřítomnost. Bloky rezervací přesně podle
   začátku a délky (1 min = 1 px při 60 px/h, nebo podobně), barva podle kategorie služby, stav: proběhlo
   (tlumené), probíhá (zvýrazněné), potvrzeno, čeká na platbu (štítek), nový klient (štítek), omluveno / zrušeno
   (průhledný „duch" s přeškrtnutím, nezabírá místo), nedostavil se (výrazný obrys), pozdní storno.
   Skupinová lekce jako blok s počtem „6/8" (plná + čekající). Čára aktuálního času s popiskem.
   - klik do prázdného místa (zaokrouhleno na 15 min) → `NewBookingDialog` s předvyplněným terapeutem a časem;
   - klik na blok → `BookingDrawer`;
   - **přetažení bloku** (pointer events) na jiný čas / terapeuta s přichycením na 15 min → kontrola
     `checkBookingSlot` (staff) → potvrzovací dialog „Přesunout termín … → …" (s varováními, pokud jsou)
     → `rescheduleBooking`. Klávesová alternativa: přesun přes `RescheduleDialog` v detailu (WCAG 2.5.7).
   - široká mřížka ve vlastním `overflow-x: auto` kontejneru; na telefonu volba jednoho terapeuta.
4. **Týdenní pohled** – jeden terapeut (výběr), sloupce Po–So, stejná mřížka a bloky.
5. Boční panel (na úzkém displeji pod kalendářem): **Čekací listina** (aktivní nabídky s odpočtem do vypršení,
   čekající na konkrétní den/lekci, odkaz na klienta) a **Volná okna dnes** (`freeWindows` ≥ 45 min → klik
   otevře novou rezervaci).
6. `BookingDrawer`: klient (odkaz na detail), služba, datum a čas, terapeut, místnost, kanál, poznámka
   (úprava), platba (`paymentLabel`, permanentka „vstup 7/10 · platnost do …", kredit), stav a poplatek,
   **storno podmínky teď** (`PolicyTimeline` + text z `evaluateCancellation(…, 'staff')`), omluvenky klienta
   (`excuseStatusFor`), připomínka (odeslána/čeká), historie změn z `audit` k rezervaci.
   Akce podle stavu: Proběhlo (+ volba úhrady na místě: karta/hotově/kredit), Nedostavil/a se (jen po začátku),
   Přesunout, Zrušit / omluvit (→ `CancelBookingDialog`), Uhradit / odpustit poplatek, Zrušit ze strany kliniky.
   U skupinové lekce: seznam účastníků, přidat účastníka (`NewBookingDialog` se `sessionId`), čekající, zrušit lekci (`cancelSession`).
   **Zápis ze sezení** (`SessionNotesSection.tsx`, hned pod údaji o schůzce; vidí jen majitelka a terapeut –
   `useClinicalAccess()`, recepce ne): poznámka `kind: 'session'` ze `sessionNoteOfBooking` – nadpis, náhled textu
   (5 řádků / 280 znaků, „Zobrazit celý zápis"), autor, kdy napsáno/upraveno, počet příloh; štítek „Odesláno
   15. 10. 2026 v 21:38" nebo „Neodesláno klientovi". Akce „Upravit" (dialog se sdíleným `SessionNoteEditor`)
   a „Odeslat klientovi" / „Odeslat znovu" (`SendSessionNotesDialog`). Bez zápisu prázdný stav s „Napsat zápis"
   (u budoucí schůzky lze zápis připravit předem). Další poznámky ke schůzce (např. Plaud import) jako seznam;
   odkaz „Poznámky, Plaud a soubory v kartě klienta" otevře kartu klienta rovnou na kartě Poznámky
   (`navigate({ name: 'klient', clientId, tab: 'poznamky' })`). Sekce je u potvrzených a proběhlých schůzek,
   u zrušených a nedostavení jen tehdy, když zápis už existuje.
   V mřížce kalendáře má blok se zápisem ikonu `clipboard` (aria-label „má zápis ze sezení" / „zápis ze sezení
   odeslán"), legenda má položku „Zápis ze sezení" – obojí jen pro majitelku a terapeuty.
7. `NewBookingDialog`: klient (vyhledávání + „Nový klient" s minimem polí: jméno, příjmení, e-mail/telefon,
   souhlasy), služba (podle kategorií, délka a cena), terapeut (jen ti, kdo službu poskytují), datum a **volné
   časy po 15 min** (`availableSlots` mode 'staff'), nebo ruční čas s výsledkem `checkBookingSlot`
   (chyby blokují, varování lze přejít checkboxem „Vytvořit i přesto"), u skupinové služby výběr termínu
   lekce s volnými místy (plná → nabídnout čekací listinu `joinWaitlist`), platba: nabídni dostupné možnosti
   (`eligiblePackages` → „Permanentka Koučink 10× · zbývá 4", kredit se zůstatkem, náhrada `eligibleMakeups`,
   na místě, online – simulace, zdarma), kanál (recepce/telefon), poznámka. Souhrn a „Vytvořit rezervaci".
8. `CancelBookingDialog`: časová osa (`PolicyTimeline`), volby z `evaluateCancellation(…,'staff').options`
   jako `RadioCards` (titulek, popis, částka), důvod (výběr + text), potvrzení → `cancelBooking`.
9. `RescheduleDialog`: datum + volné časy (stejný výběr jako v nové rezervaci, `ignoreBookingId`), terapeut,
   info o pravidlech; → `rescheduleBooking` (staff může s `override`).
10. **QR platba v kalendáři** (docs/VSTUPY-SKUPINY-QR.md): v `BookingDrawer` mají nabídky „Proběhlo“, „Přijmout
   platbu“ a „Uhradit poplatek“ volbu „QR platba“ → `QrPaymentDialog` (vezme čekající výzvu k termínu nebo ji
   vystaví; „Platba přijata“ ji potvrdí). „Proběhlo → QR platba“ nejdřív zapíše docházku bez vyrovnání, pak
   otevře QR. Menu ⋯ má „QR platba předem“ (výzva k budoucímu termínu placenému na místě). Detail ukazuje
   upozornění „Čeká na QR platbu“ (částka, VS, splatnost, po splatnosti, z portálu / z recepce) s „Zobrazit QR
   kód“, totéž u poplatku, a u zrušené výzvy „QR platba zrušena“ s „Vystavit novou QR platbu“. Nový řádek
   **Zdroj platby** (`VisitSourceBadge` s detailem; terapeut bez částky). Blok v mřížce má štítek „Čeká na QR
   platbu“. `NewBookingDialog` nabízí „QR platba převodem“ (`createBooking` s `'qr'`, pak `QrPaymentDialog`).

---

## B · Klienti (`src/screens/clients`, prefix `cli-`)

Exporty: `ClientsScreen()`, `ClientDetailScreen({ clientId, tab? })` – `tab` otevře konkrétní kartu
(`ClientTab` ze `store/session.ts`, trasa `{ name: 'klient', clientId, tab? }`).

1. **Seznam klientů**: vyhledávání (jméno, e-mail, telefon, bez diakritiky), filtry (s aktivní permanentkou,
   s kreditem, s dluhem, bez souhlasu s marketingem, štítek, noví za 30 dní, **fáze spolupráce** s počty),
   řazení (poslední návštěva, jméno, útrata). Tabulka: jméno + štítky, **fáze** (štítek + dny ve fázi), kontakt,
   aktivní permanentka (název + „4/10 volné"), kredit, poslední / příští návštěva, upozornění (dluh, zablokované
   online rezervace, nedostavení). Stránkování po 50.
   Tlačítko „Nový klient" (dialog: jméno, příjmení, e-mail, telefon, datum narození, štítky, **fáze** (výchozí
   první), souhlasy – GDPR povinný, zdravotní dokumentace, obchodní sdělení e-mailem, SMS; interní poznámka)
   → `createClient`.
2. **Detail klienta** (podle předlohy V1-Klient): drobečková navigace, hlavička (avatar, jméno, „Klient od …
   · N návštěv · poslední …", kontakt, štítky – úprava), akce: Nová rezervace (`NewBookingDialog` z kalendáře
   s `clientId`), Napsat zprávu (dialog → `sendManualMessage`), Prodat permanentku, Dobít kredit, menu (upravit
   údaje, zablokovat/odblokovat online rezervace, upravit kredit).
   - **Zůstatky**: karty Permanentky (každá aktivní: název, `StackedBar` absolvováno/propadlo/rezervováno/volné,
     platnost a dny do konce, omluvenky x z y, akce Prodloužit / Zrušit s vrácením na kredit), Kredit (zůstatek,
     posledních 5 pohybů z `ledger`, akce Dobít / Upravit), Omluvenky a náhrady (otevřené náhrady s lhůtou →
     „Rezervovat náhradu" otevře `NewBookingDialog` s platbou náhradou; propadlé), Spolehlivost (nedostavení
     za 90 dní, pozdní storna za 12 měsíců, zablokování), Útrata celkem, Dluh (poplatky k úhradě → Uhradit/Odpustit).
   - V hlavičce **fáze spolupráce** (`StageControl`): štítek, dny ve fázi, menu „Změnit fázi" (dialog
     s volitelnou poznámkou → `setClientStage`) a historie fází.
   - Taby (pořadí): **Přehled** (karta **Spolupráce** z `clientCrmStats` – fáze a od kdy, sezení proběhlá /
     nadcházející, první / poslední / příští sezení, poznámky, soubory, otevřené follow-upy a po termínu, útrata
     jen pro finanční role; nadcházející s čipem storno stavu „Zdarma do …" / „Storno teď 50 % · lze omluvit",
     posledních 5 návštěv, poslední poznámka, souhlasy), **Poznámky** (nahrazuje „Dokumentaci": `NotesPanel` –
     časová osa po měsících, připnuté nahoře, filtr podle druhu, nová poznámka / zápis ze sezení / import z Plaud
     / nahrát audio, přílohy, odeslání zápisu klientovi), **Rezervace** (celá historie s filtry stavů, klik →
     `BookingDrawer`), **Follow-upy** (otevřené a hotové, „Přidat follow-up"), **Soubory a fotky** (`FilesPanel`
     – mřížka náhledů, přehrávač audia, prohlížeč PDF/textu, popisek, stažení, smazání s potvrzením),
     **Permanentky a kredit** (všechny permanentky včetně prošlých, kompletní pohyby kreditu, platby),
     **Komunikace** (odeslané zprávy klientovi – e-mail/SMS, stav, důvod neodeslání), **Souhlasy** (přepínače
     s datem udělení → `setConsent`; GDPR nelze odebrat), **Historie změn** (audit klienta).
   - Role: Přehled, Follow-upy a změnu fáze vidí celý personál. Poznámky a Soubory a fotky jen majitelka
     a terapeut (recepce vidí zámek). Terapeut nevidí finance (permanentky, kredit, omluvenky, dluhy, útrata).
   - **QR platba** (přes `useQrOption()` z kalendáře): prodej permanentky, dobití kreditu a vyrovnání dluhu
     nabízí „QR platba“ → `QrPaymentDialog`; permanentka a kredit vzniknou až po potvrzení platby. Dluhy
     s čekající výzvou ukazují „Čeká na QR platbu · VS …“ s tlačítkem QR. Karta **Čekající QR platby**
     (`PendingPaymentsList` klienta) je na Přehledu, když nějaké jsou, a vždy na kartě Permanentky a kredit
     (s prázdným stavem). Tabulka rezervací má sloupec se štítkem **zdroje platby** (`VisitSourceBadge`; finanční
     role i s poznámkou o platbě, ostatní jen štítek „Zdroj platby“; u zrušených termínů bez štítku).

---

## C · Nastavení a katalog (`src/screens/settings`, prefix `set-`)

Exporty: `ServicesScreen()`, `TeamScreen()`, `PackagesScreen()`, `SettingsScreen()`.

0. **Nastavení → Fáze spolupráce** (první sekce, `StagesEditor.tsx`): očíslované řádky – barva (stejný výběr
   jako u kategorií), název, „Ukončená fáze", počet klientů, posun nahoru/dolů, smazání (zakázané s vysvětlením,
   když ve fázi někdo je nebo jde o poslední fázi; nápověda odkazuje do Pipeline). „Přidat fázi" vloží novou
   fázi před ukončené (nejvýše 12 fází). Pod seznamem náhled pořadí a varování, když by smazání Freetalku nebo
   Aktivní spolupráce rozbilo statistiku konverze. Fáze jsou součástí konceptu nastavení (tečka neuložených
   změn, „Zahodit změny"); uložení volá nejdřív `saveStages`, pak `updateSettings`.

1. **Služby a ceník**: kategorie (název, barva z `Tone`), služby seskupené podle kategorie – tabulka: název,
   délka, cena, rezerva po službě, typ (individuální / skupinová s kapacitou), terapeuti, online rezervace,
   jen noví klienti, aktivní. Editor v `Drawer`: délka jen po 15 min (výběr 15–240), cena, rezerva 0/5/10/15,
   výběr terapeutů (checkboxy), popis. **Rozvrh skupinových lekcí** (`groupTemplates`): den, čas, lekce,
   trenér, kapacita, aktivní → `upsertGroupTemplate`.
2. **Tým a směny**: karty terapeutů (avatar, jméno, zaměření, místnost, služby), editor pracovní doby po dnech
   (Po–Ne, více intervalů, pauzy), nepřítomnosti / dovolené (`addTimeOff`, `removeTimeOff`, i zavření celé
   kliniky), náhled týdenní kapacity v hodinách.
3. **Permanentky a kredity**: šablony permanentek (název, popis, vstupy, služby, cena, platnost ve dnech,
   omluvenky, aktivní; cena za vstup a sleva oproti jednotlivé ceně) → `upsertPackageTemplate`; přehled
   prodaných permanentek (aktivní, končící do 30 dní s nevyčerpanými vstupy, prošlé) s odkazem na klienta;
   bonusy za dobití kreditu (`settings.creditBonus`); celkový závazek (nevyčerpané vstupy a kredity).
4. **Nastavení** (sekce s kotvami vlevo): Rezervace online (minimální předstih, horizont, krok 15 min – pevně,
   kompaktní nabídka termínů s vysvětlením, max. nadcházejících rezervací, „kdokoli z terapeutů",
   automatická docházka), **Storno podmínky** (bezplatná lhůta v hodinách, stupně poplatků – přidat/odebrat
   stupeň „méně než X h → Y %", poplatek za nedostavení, permanentka při pozdním zrušení: propadá vstup /
   účtuje se poplatek, skupinové lekce: lhůta, první pozdní storno zdarma, blokace po N nedostaveních) s
   **živým náhledem** časové osy (`PolicyTimeline` nad fiktivní rezervací zítra v 9:00) a textem podmínek,
   jak je uvidí klient; **Omluvenky a náhrady** (zapnuto, výchozí počet na permanentku, pro klienty bez
   permanentky X za Y měsíců, nejpozději X h před začátkem, náhrada do X dní); **Čekací listina** (zapnuto,
   platnost nabídky v minutách, kolika lidem současně); **Připomínky** (zapnuto, kolik hodin předem);
   **Klinika** (název, podtitul, odesílatel e-mailů). Uložení přes `updateSettings` (tlačítko „Uložit změny"
   aktivní jen při změně, potvrzení toastem).
   **Platby** (sekce `payments`): přepínač „Nabízet QR platbu“, číslo účtu v českém tvaru s průběžnou kontrolou
   (zelená fajfka u platného, chyba až u úplného čísla, po opuštění pole nebo při uložení), vypočtený IBAN
   (`czechAccountToIban`, jen pro čtení), jméno příjemce (max. 35 znaků), splatnost QR platby v hodinách se
   zkratkami 1 / 2 / 3 / 7 dní; varování, když je QR zapnutá bez platného účtu. Náhled: uložené nastavení
   přes `QrPaymentCard` s ukázkovou částkou a příštím VS, při neuložených změnách živý `QrCode` z konceptu.

---

## D · Statistiky a přehled (`src/screens/stats`, prefix `st-`)

Exporty: `StatsScreen()`, `DashboardScreen()`. CRM části: `StagesSection.tsx` (Statistiky) a `DashboardCrm.tsx` (Přehled).

1. **Statistiky** (předloha V1-Statistiky): období (Tento týden / Tento měsíc / Minulý měsíc / Posledních 90 dní /
   vlastní od–do), srovnání s předchozím obdobím, filtry terapeut a kategorie. `computeStats`.
   - KPI dlaždice s rozdílem proti minulému období (zelená/červená podle toho, co je dobře): Rezervace,
     Obsazenost (cíl 85 %), Tržby, Tržba za hodinu, Noví klienti, Míra storna (pozdní zvlášť), Nedostavení,
     Rebooking do 30 dní.
   - Grafy (SVG, tokeny `--chart-*`, popisky v češtině, tabulková čísla, tooltip na hover a fokus):
     Rezervace po dnech (sloupce: proběhlo / zrušeno), Obsazenost terapeutů (vodorovné pruhy s cílovou čárou
     85 %), Tržby podle kategorií, Heatmapa obsazenosti Po–So × 7–19 h (`--heat-0…5`), Storna a nedostavení
     za 6 měsíců (dvě čáry), Zdroj rezervací (online / recepce / telefon).
   - Permanentky: prodané v období podle typu, končící do 30 dní + počet vstupů (akce „Poslat připomínku" →
     komunikace), závazek: nevyčerpané vstupy (hodnota) a kredity; Omluvenky a náhrady (využito / propadlo).
   - **Klienti a fáze** (`pipelineStats` za období, při srovnání i za předchozí období): dlaždice Noví zájemci
     (s rozdílem), Změny fáze (nejčastější přechod), Konverze Freetalk → Aktivní spolupráce („x z y"; srovnání
     jen jako neutrální poznámka), Klienti v pipeline (stav k dnešku); grafy `BarList` s tabulkovým pohledem:
     Klienti podle fáze (barvy fází), Přechody mezi fázemi (8 nejčastějších), Průměrná doba ve fázi („do
     odchodu" vs. „zatím", bez ukončených fází). Filtry terapeut a kategorie se na fáze nevztahují (sekce to
     napíše).
   - Přepočítávej v `useMemo`. Prázdný stav, když v období nic není.
2. **Přehled** (domovská obrazovka recepce/majitelky): pozdrav podle denní doby, souhrn dne (`daySummary`),
   „Teď probíhá" a „Další na řadě" (příchody v příštích 2 h s tlačítky Proběhlo / Nedostavil se), upozornění:
   neuhrazené poplatky, aktivní nabídky z čekací listiny, náhrady s blížící se lhůtou, permanentky končící do
   14 dní, klienti se zablokovanými rezervacemi; rychlé akce (Nová rezervace, Nový klient, Kalendář).
   Mini graf obsazenosti dnešního dne po hodinách.
   CRM widgety: karta **Follow-upy** v hlavním sloupci (po termínu a na dnes, `FollowUpRow` se jménem klienta,
   3 řádky na skupinu + „Zobrazit všechny", „+" otevře `FollowUpDialog`, odkaz „Všechny follow-upy";
   terapeut vidí jen své; odškrtnutý úkol zůstane přeškrtnutý až do odchodu z Přehledu) a v pravém sloupci
   **Fáze spolupráce** (pruh v barvách fází + řádek s počtem za každou fázi; řádek otevře Pipeline).
   Widgety k docs/VSTUPY-SKUPINY-QR.md (`DashboardWidgets.tsx`): v pravém sloupci **Volná místa na skupinových
   lekcích** (`GroupSpotsCard` – dnešní a zítřejší termíny s volnými místy, kompaktní `OccupancyMeter`, tlačítko
   „Přihlásit klienta“ otevře `NewBookingDialog` s termínem; bez volných míst poradí nejbližší volný termín do
   14 dní; terapeut jen své lekce; skryje se bez skupinových lekcí; odkaz „Všechny skupinové lekce“) a v hlavním
   sloupci za Follow-upy **Čekající QR platby** (`PendingQrCard`, jen majitelka a recepce – 3 výzvy podle
   splatnosti bez rozbalování, počet v hlavičce, „Celkem čeká …“, odkaz „Vstupy a platby“; skryje se, když je QR
   vypnutá a nic nečeká).

---

## E · Komunikace (`src/screens/comms`, prefix `com-`)

Export: `CommsScreen()`. Předloha V1-Komunikace.

Taby: **Kampaně**, **Automatické zprávy**, **Odeslané**.
1. **Kampaně**: seznam (koncept / naplánováno / odesláno – datum, počet příjemců), „Nová kampaň". Editor:
   název, předmět, náhledový text, obsah z bloků (nadpis, text, seznam, tlačítko, oddělovač – přidat, upravit,
   posunout, smazat; v textu proměnná [jméno]), **náhled e-mailu** (desktop/mobil) ve stylu kliniky s patičkou
   a odkazem na odhlášení, **segment** (pravidla `RULE_TYPES`, shoda všech/kteréhokoli, vyloučení; živý
   trychtýř `segmentFunnel`: se souhlasem → po pravidlech → po vyloučení), seznam prvních příjemců, kontrolní
   seznam (souhlas – vždy, odkaz na odhlášení, předmět vyplněn, obsah vyplněn), Odeslat teď / Naplánovat
   (datum a čas) → `sendCampaign` / `scheduleCampaign`; potvrzovací dialog s počtem příjemců. Upozornění,
   že jde o simulaci (e-maily se reálně neodesílají; v ostrém provozu napojení na e-mailovou službu).
2. **Automatické zprávy**: seznam šablon (`templates`) s přepínačem zapnuto, kanály (e-mail/SMS), kdy se
   posílá; editor předmětu, textu e-mailu a SMS s vložením proměnných (`TEMPLATE_VARIABLES`), nápovědou „Co
   proměnné znamenají" a náhledem s ukázkovými hodnotami → `updateTemplate`. Odkaz na nastavení připomínek.
   Šablona **Zápis ze sezení** (`session_notes`) se posílá ručně z karty klienta nebo detailu schůzky: v seznamu
   má štítek „Ručně" místo přepínače, v editoru jen e-mail a vysvětlení, odkud se posílá; nepočítá se mezi
   zapnuté/vypnuté automatické zprávy.
   Segment kampaně má pravidlo **Fáze spolupráce** (`{ type: 'stage', stageIds }` – fáze s barvou a počtem
   klientů, „Ve fázích Diagnostika nebo Aktivní spolupráce").
3. **Odeslané**: tabulka zpráv (čas, klient, kanál, typ, předmět, stav odesláno / neodesláno + důvod),
   filtry (kanál, typ, jen neodeslané, hledání), detail zprávy v `Drawer`. Novější nahoře, stránkování.

---

## F · Klientský portál (`src/portal`, prefix `por-`)

Export: `ClientPortal()`. Mobilní aplikace (max. šířka ~480 px uprostřed, na desktopu působí jako telefon
na pozadí `--bg`). Předlohy V1-Rezervace a V1-Omluvenka. Klient = `session.clientId`; jednání jako role client.

1. **Domů**: pozdrav („Dobrý den, Martine"), nejbližší termín (karta: služba, terapeut, datum/čas, místnost,
   „Zdarma zrušíte do …" nebo stav storna, akce Detail), **nabídky z čekací listiny** (uvolněný termín, odpočet
   do vypršení, Potvrdit → výběr platby → `acceptWaitlistOffer` / Odmítnout), **náhrady k vyčerpání**
   (lhůta → Rezervovat náhradu), zůstatky (permanentky s volnými vstupy a platností, kredit, omluvenky),
   tlačítko „Rezervovat termín". Spodní navigace: Domů · Rezervace · Moje termíny · Účet.
2. **Rezervace (průvodce)**: 1) kategorie a služba (délka, cena, popis; „jen pro nové klienty" skryj
   stávajícím), 2) terapeut nebo „Kdokoli" (`allowAnyTherapist`), 3) datum (pás 14 dní s tečkou dostupnosti,
   zavřeno; „Nejbližší volný termín" přes `nextAvailableDate`) a **časy po 15 minutách** seskupené Dopoledne /
   Odpoledne / Večer (`availableSlots` mode 'client'), u skupinové lekce seznam lekcí s volnými místy (plná →
   „Přidat se na čekací listinu"), prázdný den → „Hlídat uvolnění termínu" (`joinWaitlist`), 4) souhrn:
   služba, terapeut, datum/čas, platba (permanentka s počtem vstupů / náhrada / kredit / kartou online
   (simulace) / na místě), storno podmínky srozumitelně („Zdarma zrušíte do St 14. 10. 9:00; potom 50 %,
   méně než 12 h 100 %; omluvenky: zbývá 1"), souhlas s podmínkami (checkbox), Potvrdit → `createBooking`,
   5) potvrzení (shrnutí, „přidat do kalendáře" jako zobrazený text, zpět domů). Podpora vstupu z náhrady
   (`portalRoute.makeupId`) a přesunu (`rescheduleBookingId` → `rescheduleBooking`, po lhůtě s omluvenkou).
3. **Moje termíny**: nadcházející a minulé (stav, poplatky), detail termínu: informace, platba, `PolicyTimeline`,
   **Zrušit / omluvit** (volby z `evaluateCancellation(…,'client')` jako `RadioCards`: Omluvit s omluvenkou
   (doporučeno) / Zrušit zdarma / Zrušit s poplatkem / první pozdní storno zdarma; důvod – čipy Nemoc, Práce,
   Rodina, Jiné + zpráva; potvrzení), **Přesunout** (průvodce výběru času), po omluvence nabídka „Vybrat
   náhradní termín".
4. **Účet**: osobní údaje (úprava `updateClient`), souhlasy (marketing e-mail, SMS – přepínače `setConsent`),
   permanentky (aktivní i prošlé), koupit permanentku online (simulace platby → `sellPackage` paidBy 'online'),
   kredit a jeho pohyby, dobít kredit online (simulace → `topUpCredit` method 'online', bonus podle pravidel),
   zprávy od kliniky (inbox: zprávy klienta z `messages`), storno podmínky kliniky (text z nastavení).
   Zablokovaný klient (`blocked`) vidí vysvětlení a kontakt na recepci místo rezervace.
5. **QR platba** (jen když `qrAvailable()` – zapnuto a platný účet): volba „QR platba převodem“ v průvodci
   rezervací, při přijetí nabídky z čekací listiny, při nákupu permanentky a dobití kreditu (bez simulace karty).
   Rezervace vznikne nezaplacená s výzvou (`createBooking` s `'qr'`); permanentka a kredit přes
   `createPaymentRequest` a vzniknou až po potvrzení personálem (opakovaná objednávka téže permanentky ukáže
   původní QR). Potvrzení ukáže `QrPaymentCard`, očíslovaný postup a splatnost („nejpozději zítra v 7:30“).
   Čekající platby: v detailu termínu box „Čeká na platbu“ se „Zobrazit QR kód“, „Zaplatit předem QR platbou“
   u nezaplaceného termínu na místě, „Zaplatit QR platbou“ u poplatku k úhradě, „Zaplatím jinak“ (klient zruší
   vlastní výzvu po potvrzení); štítek „Čeká na platbu“ v Moje termíny a na kartě příštího termínu; sekce
   „Čeká na vaši platbu“ na Domů; seznam v Účet → Kredit a platby a Permanentky (po splatnosti zvýrazněné, klepnutí
   otevře QR). Jednorázový záměr navigace (`PortalIntent` v `portal/context.ts`: `bookSession`, `showQr`) předá
   další obrazovce vybraný termín lekce nebo otevření QR (platí do další navigace).
6. **Skupinové lekce tento týden** (Domů, `groupSessionsOverview`): budoucí nezrušené termíny online
   rezervovatelných skupinových služeb v rezervačním okně; když z týdne nic nezbývá, příští týden s nadpisem
   „Skupinové lekce příští týden“; bez rezervovatelných lekcí nebo u zablokovaného klienta se sekce skryje.
   Řádek: datum, čas, název, trenér, místnost, pruh obsazenosti a volná místa („Zbývají 3 místa“, „Plno · čekají
   2 lidé“); „Rezervovat“ otevře průvodce rovnou na souhrnu s vybraným termínem, plné termíny „Čekací listina“
   (přihlásit / odhlásit), přihlášený klient „Jste přihlášeni“ s odkazem na detail.

---

## G · Pipeline a follow-upy (`src/screens/pipeline`, prefix `pip-`)

Exporty: `PipelineScreen()`, `FollowUpsScreen()` (bez props). Trasy `{ name: 'pipeline' }` a `{ name: 'followupy' }`,
obrazovky na sebe odkazují tlačítkem v hlavičce.

1. **Pipeline**: sloupec za každou fázi (`stagesSorted`) s tečkou v barvě fáze (ukončená = kroužek) a počtem
   („12 / 360" při filtrování). Karta klienta: jméno (tlačítko → karta klienta), „Ve fázi 12 dní", kouč, příští
   schůzka („Bez naplánované schůzky" mimo ukončené fáze), štítky (3 + „+N"), nejbližší otevřený follow-up
   (po termínu červeně s ikonou a „X dny po termínu", „+N" dalších). Přesun: tažením myší mezi sloupci (zvýraznění
   cíle) i bez myši – menu ⋯ „Přesunout do…" (všechny ostatní fáze), „Přesunout s poznámkou…" (dialog,
   poznámka do historie fází), „Přidat follow-up", „Otevřít kartu klienta"; přesun volá `setClientStage`, toast
   nabídne „Vrátit zpět". Filtry: hledání podle jména (bez diakritiky), kouč (podle posledního proběhlého, jinak
   příštího sezení; „Bez kouče"), řazení (jméno / nejdéle ve fázi / nejnověji ve fázi / příští schůzka),
   přepínač „Skrýt ukončené"; filtry přežijí návrat z karty klienta. Sloupec ukáže 30 karet + „Zobrazit další",
   tabule se posouvá vodorovně ve vlastním kontejneru. Prázdný stav sloupce i celé obrazovky.
2. **Follow-upy**: karty Po termínu (červený okraj), Dnes, Nadcházející (po 20) a Hotové (sbalené, po 10) z
   `followUpBuckets`, řádky `FollowUpRow` se jménem klienta (odškrtnutí, úprava, smazání). Filtry „Jen moje"
   (podle `therapistId` přihlášeného; terapeut ho má zapnutý ve výchozím stavu), kouč = komu je úkol přiřazen
   (+ „Bez přiřazení"), hledání v názvu, poznámce a jménu klienta. „Nový follow-up" otevře vyhledávání klienta
   (šipky + Enter, bez zadání nabídne klienty z posledních sezení) a pak `FollowUpDialog`. Prázdné stavy pro
   žádné úkoly i prázdný výsledek filtru.

---

## H · Sdílené CRM komponenty (`src/components/crm`, prefix `crm-`)

Používají je karta klienta, kalendář, Pipeline, Přehled i Statistiky. Binární obsah souborů jde výhradně
přes `store/files.ts`.

- `StageBadge({ stageId, size?, className? })`, `StageControl({ clientId, readOnly?, className? })`
  (+ `ChangeStageDialog`, `StageHistoryDialog`).
- `FollowUpDialog({ open, onClose, clientId?, followUp?, onSaved? })` – bez `clientId` nabídne výběr klienta;
  `FollowUpRow({ followUp, showClient?, as?, className? })`.
- `NotesPanel({ clientId, onOpenBooking?, focusNoteId? })` – časová osa poznámek s editorem, připnutím,
  smazáním (`ConfirmDialog`, smaže i data příloh), přílohami a odesláním klientovi.
- `SessionNoteEditor({ bookingId, onDone? })` – zápis ze sezení ke schůzce (`at` = začátek schůzky),
  „Uložit a odeslat"; `SendSessionNotesDialog({ open, onClose, noteId, onSent? })` – předmět a text ze šablony
  `session_notes`, úprava před odesláním, varování bez e-mailu / už odesláno → `sendSessionNotes`.
- `AudioRecorder`, `AudioRecorderDialog({ open, onClose, clientId, noteId?, onSaved? })` – `MediaRecorder`
  (opus webm, jinak mp4), čas, pauza, stop, zahodit, uložit; bez mikrofonu vysvětlení a nahrání souboru.
- `PlaudImportDialog({ open, onClose, clientId, bookingId?, onImported? })` – shrnutí jako text poznámky
  `kind: 'plaud'`, přepis jako textový soubor (`plaud.transcriptFileId`), volitelně audio a přílohy, nápověda
  k exportu z Plaud.
- `FileUploadButton`, `FilesPanel({ clientId, onOpenNote? })`, `FileViewerDialog({ file, onClose })`.

---

## I · Vstupy (`src/screens/visits`, prefix `vis-`)

Export: `VisitsScreen()` (bez props), trasa `{ name: 'vstupy' }`. Data z `visitsOverview` (engine/visits.ts),
výpočet v `useMemo` (nejvýš dvakrát: bez filtru zdroje kvůli počtům v čipech a s ním).

1. **Období**: Tento týden / Tento měsíc / Minulý měsíc / Vlastní (od–do včetně, nejvýš 366 dní) a `PeriodNav`
   pro posun o období; týden a měsíc jsou celé kalendářní, tedy i s plánovanými vstupy. Na telefonu výběr místo
   přepínače.
2. **Filtry**: zaměstnanec (`Select`), služba, stav (Všechny / Proběhlé a účtované / Plánované), zdroj platby
   (přepínací čipy s počty, víc najednou), „Zrušit filtry“. Volby si pamatuje prohlížeč (localStorage, vše
   v try/catch).
3. **Dlaždice**: Vstupy (proběhlé a účtované · plánované), Předplacené (podíl a hodnota), Jednorázově (tržba),
   Nezaplaceno (po termínu červeně s částkou · plánované · čeká na QR).
4. **Po zaměstnancích** (`EmployeeSummaryTable`): řádek = zaměstnanec, sloupce celkem, z permanentky, z kreditu,
   jednorázově, čeká na QR, nezaplaceno, náhrady, zdarma, tržba jednorázově, hodnota předplacených + řádek Celkem
   (u jediného řádku skrytý). První sloupec zůstává při vodorovném posunu na místě. „Čeká na QR“ je žlutě,
   „Nezaplaceno“ červeně jen tehdy, když jsou mezi nimi vstupy po termínu (plánované s platbou na místě ne).
   Klik na řádek (nebo tlačítko se jménem, `aria-pressed`) filtruje seznam vstupů, druhý klik filtr zruší; souhrn
   dál ukazuje všechny se zvýrazněným řádkem.
5. **Seznam vstupů**: datum a čas, klient (odkaz na kartu), služba (u skupiny název lekce), zaměstnanec, stav,
   `VisitSourceBadge` s detailem (nezaplacený plánovaný termín neutrálně), částka, tlačítko detailu
   (`BookingDrawer` z kalendáře). 25 na stránku; pod 760 px karty místo tabulky.
6. **Export CSV** (menu): „Seznam vstupů“ (všechny vyfiltrované, ne jen stránka) nebo „Souhrn po zaměstnancích“.
   Středník, UTF-8 s BOM, CRLF, české hlavičky, datum RRRR-MM-DD, čas HH:mm, částka celé číslo, uvozovky
   a ochrana proti vzorcům. Stažení přes `downloadBlob` (store/files.ts): v artefaktu capability `downloads`,
   jinde `<a download>`.
7. **Čekající QR platby** (`PendingPaymentsList searchable`, 5 + „Zobrazit další“) – jen majitelka a recepce.
   Hledání podle VS najde i zaplacené a zrušené výzvy; u zrušené „Platba přišla“ (uhradí termín, nebo připíše na kredit).
8. **Role**: majitelka a recepce vidí všechny; terapeut jen své vstupy (výběr zaměstnance zamčený s „Vidíte jen
   své vstupy“, souhrn jen jeho řádek). Prázdné stavy: žádná data, nic neodpovídá filtrům, terapeut bez
   přiřazeného zaměstnance.

---

## J · Skupinové lekce (`src/screens/groups`, prefix `grp-`)

Exporty: `GroupsScreen()` (trasa `{ name: 'skupiny' }`), `OccupancyMeter`, `ParticipantsDrawer`, texty
`freeShort`, `freeSpotsText`, `occupancyText`, `leadsGroups`. Data z `groupSessionsOverview` (engine/groups.ts).

1. **Rozsah**: Tento týden / Příštích 14 dní / Vlastní (od–do, nejvýš 92 dní); šipky posunou o týden / 14 dní.
2. **Filtry**: Lekce (skupinové služby), Trenér, přepínače „Jen s volnými místy“ a „Zobrazit proběhlé“; terapeut
   má navíc „Jen moje lekce“ (výchozí zapnuto; vypnout může, protože do cizích lekcí také přihlašuje klienty).
   Filtry přežijí v rámci otevřené záložky.
3. **Souhrn**: termíny, volná místa (s kapacitou a obsazeností %), plné termíny (+ téměř plné), čekající;
   počítá se po filtrech lekce, trenéra a proběhlých, ale před „Jen s volnými místy“. Řádek s tím, co je skryté.
4. **Termíny po dnech** (štítky Dnes / Zítra): čas, délka, název lekce, služba, trenér, místnost,
   `OccupancyMeter` (`role="meter"`, celá věta v `aria-valuetext`; do kapacity 16 políčka míst, jinak pruh;
   text „7 ze 12 · 5 volných“; barva accent / téměř plno warning / plno danger + štítek „Plno“), počet na čekací
   listině. Zrušené přeškrtnuté se štítkem „Zrušeno“, proběhlé tlumené „Proběhlo“, právě probíhající „Probíhá“.
5. **Akce**: „Přihlásit klienta“ (`NewBookingDialog` s `{ sessionId, serviceId }`; u plného termínu „Na čekací
   listinu“, skryté bez čekací listiny; u proběhlých a zrušených nic) a „Účastníci“ (`ParticipantsDrawer`:
   účastníci se `VisitSourceBadge` – detail a částka, stav, odkaz na kartu klienta; čekající; tlačítka
   „V kalendáři“ a přidat klienta).
6. Prázdné stavy: žádná skupinová služba (odkaz do Služeb), žádné termíny, terapeut žádnou lekci nevede, vše
   proběhlé, nic volného.

---

## K · Sdílené platební komponenty (`src/components/payments`, prefix `pay-`)

- `QrCode({ value, size?, label? })` – SVG z `qrcode-generator` (okraj 4 moduly, barvy `--qr-fg`/`--qr-bg`:
  tmavé moduly na bílém v obou motivech).
- `QrPaymentCard({ request, title?, compact? })` – QR, částka, číslo účtu, IBAN, VS, zpráva, splatnost, tlačítka
  kopírovat, popisek „QR Platba“. Když se údaje nevejdou vedle QR (pod ~550 px), spadnou pod něj; hodnoty se lámou
  jen mezi slovy. Bez dostupné QR platby personál vidí výzvu doplnit účet, klient srozumitelnou radu. Zaplacená
  a zrušená výzva je bez QR kódu, účtu a kopírování.
- `QrPaymentDialog({ open, onClose, requestId? | create?, onPaid?, onCancelled?, readOnly? })` – dialog `lg`: QR, „Platba přijata“,
  „Poslat platební údaje e-mailem“, „Zrušit QR platbu“.
- `PendingPaymentsList({ clientId?, limit?, expandable?, hideClient?, readOnly?, searchable?, emptyText?, hideEmpty? })` –
  čekající výzvy podle splatnosti; potvrzení s datem připsání (od dne vystavení do dneška) a zrušení jen pro
  majitelku a recepci; `expandable={false}` vypne „Zobrazit další“ (widget na Přehledu); `searchable` přidá hledání
  podle VS (všechny stavy, potvrzení i zrušené výzvy).
- `VisitSourceBadge({ info? | booking?, showDetail?, showAmount? })` – štítek zdroje platby; s předanou rezervací
  je nezaplacený plánovaný termín neutrální (červeně jen dluh po termínu).
- `copyToClipboard(text, hláška)`.

