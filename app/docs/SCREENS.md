# Specifikace obrazovek

Vizuální předloha: varianta „1 · Klinik" (klidná klinická přesnost). Referenční artboardy (HTML s inline styly,
čti je jen jako vizuální předlohu): `/tmp/claude-0/-home-user-rezerva-n--system/359bf26c-1318-57f3-b29e-595d1aab27c9/scratchpad/canvas/project/`
`Main.dc.html` (kalendář), `V1-Klient.dc.html`, `V1-Statistiky.dc.html`, `V1-Komunikace.dc.html`,
`V1-Rezervace.dc.html` (mobilní rezervace), `V1-Omluvenka.dc.html` (mobilní omluvenka).

Společné: obrazovka začíná komponentou `PageHeader` (titulek, podtitul, akce). Obsah je v kartách (`Card`) jen
tam, kde je to potřeba. Sekční popisky 11 px, verzálky, prostrkané. Časy a částky `tnum`. Vše česky.

---

## A · Kalendář (`src/screens/calendar`, prefix tříd `cal-`)

Exporty v `index.ts`:
- `CalendarScreen()`
- `NewBookingDialog({ open, onClose, initial?: { clientId?, serviceId?, therapistId?, start?, sessionId? } })`
- `BookingDrawer({ bookingId: Id | null, onClose })`
- `CancelBookingDialog({ bookingId, open, onClose })`, `RescheduleDialog({ bookingId, open, onClose })`

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
7. `NewBookingDialog`: klient (vyhledávání + „Nový klient" s minimem polí: jméno, příjmení, e-mail/telefon,
   souhlasy), služba (podle kategorií, délka a cena), terapeut (jen ti, kdo službu poskytují), datum a **volné
   časy po 15 min** (`availableSlots` mode 'staff'), nebo ruční čas s výsledkem `checkBookingSlot`
   (chyby blokují, varování lze přejít checkboxem „Vytvořit i přesto"), u skupinové služby výběr termínu
   lekce s volnými místy (plná → nabídnout čekací listinu `joinWaitlist`), platba: nabídni dostupné možnosti
   (`eligiblePackages` → „Permanentka Fyzio 10 · zbývá 4", kredit se zůstatkem, náhrada `eligibleMakeups`,
   na místě, online – simulace, zdarma), kanál (recepce/telefon), poznámka. Souhrn a „Vytvořit rezervaci".
8. `CancelBookingDialog`: časová osa (`PolicyTimeline`), volby z `evaluateCancellation(…,'staff').options`
   jako `RadioCards` (titulek, popis, částka), důvod (výběr + text), potvrzení → `cancelBooking`.
9. `RescheduleDialog`: datum + volné časy (stejný výběr jako v nové rezervaci, `ignoreBookingId`), terapeut,
   info o pravidlech; → `rescheduleBooking` (staff může s `override`).

---

## B · Klienti (`src/screens/clients`, prefix `cli-`)

Exporty: `ClientsScreen()`, `ClientDetailScreen({ clientId })`.

1. **Seznam klientů**: vyhledávání (jméno, e-mail, telefon, bez diakritiky), filtry (s aktivní permanentkou,
   s kreditem, s dluhem, bez souhlasu s marketingem, štítek, noví za 30 dní), řazení (poslední návštěva,
   jméno, útrata). Tabulka: jméno + štítky, kontakt, aktivní permanentka (název + „4/10 volné"), kredit,
   poslední / příští návštěva, upozornění (dluh, zablokované online rezervace, nedostavení). Stránkování po 50.
   Tlačítko „Nový klient" (dialog: jméno, příjmení, e-mail, telefon, datum narození, štítky, souhlasy –
   GDPR povinný, zdravotní dokumentace, obchodní sdělení e-mailem, SMS; interní poznámka) → `createClient`.
2. **Detail klienta** (podle předlohy V1-Klient): drobečková navigace, hlavička (avatar, jméno, „Klient od …
   · N návštěv · poslední …", kontakt, štítky – úprava), akce: Nová rezervace (`NewBookingDialog` z kalendáře
   s `clientId`), Napsat zprávu (dialog → `sendManualMessage`), Prodat permanentku, Dobít kredit, menu (upravit
   údaje, zablokovat/odblokovat online rezervace, upravit kredit).
   - **Zůstatky**: karty Permanentky (každá aktivní: název, `StackedBar` absolvováno/propadlo/rezervováno/volné,
     platnost a dny do konce, omluvenky x z y, akce Prodloužit / Zrušit s vrácením na kredit), Kredit (zůstatek,
     posledních 5 pohybů z `ledger`, akce Dobít / Upravit), Omluvenky a náhrady (otevřené náhrady s lhůtou →
     „Rezervovat náhradu" otevře `NewBookingDialog` s platbou náhradou; propadlé), Spolehlivost (nedostavení
     za 90 dní, pozdní storna za 12 měsíců, zablokování), Útrata celkem, Dluh (poplatky k úhradě → Uhradit/Odpustit).
   - Taby: **Přehled** (nadcházející s čipem storno stavu „Zdarma do …" / „Storno teď 50 % · lze omluvit",
     posledních 5 návštěv, klinická poznámka, souhlasy), **Rezervace** (celá historie s filtry stavů, klik → `BookingDrawer`),
     **Permanentky a kredit** (všechny permanentky včetně prošlých, kompletní pohyby kreditu, platby),
     **Dokumentace** (klinické poznámky – přidat; s ikonou zámku „vidí jen terapeuti"), **Komunikace**
     (odeslané zprávy klientovi – e-mail/SMS, stav, důvod neodeslání), **Souhlasy** (přepínače s datem udělení
     → `setConsent`; GDPR nelze odebrat), **Historie změn** (audit klienta).
   - Role terapeut: nevidí finance (kredit, platby, útrata) – zobraz jen rezervace, dokumentaci a souhlasy.

---

## C · Nastavení a katalog (`src/screens/settings`, prefix `set-`)

Exporty: `ServicesScreen()`, `TeamScreen()`, `PackagesScreen()`, `SettingsScreen()`.

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

---

## D · Statistiky a přehled (`src/screens/stats`, prefix `st-`)

Exporty: `StatsScreen()`, `DashboardScreen()`.

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
   - Přepočítávej v `useMemo`. Prázdný stav, když v období nic není.
2. **Přehled** (domovská obrazovka recepce/majitelky): pozdrav podle denní doby, souhrn dne (`daySummary`),
   „Teď probíhá" a „Další na řadě" (příchody v příštích 2 h s tlačítky Proběhlo / Nedostavil se), upozornění:
   neuhrazené poplatky, aktivní nabídky z čekací listiny, náhrady s blížící se lhůtou, permanentky končící do
   14 dní, klienti se zablokovanými rezervacemi; rychlé akce (Nová rezervace, Nový klient, Kalendář).
   Mini graf obsazenosti dnešního dne po hodinách.

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
   posílá; editor předmětu, textu e-mailu a SMS s vložením proměnných (`TEMPLATE_VARIABLES`) a náhledem s
   ukázkovými hodnotami → `updateTemplate`. Odkaz na nastavení připomínek.
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
