# Právní dokumenty rezervačního systému – pracovní návrhy

> **PRACOVNÍ NÁVRHY K PRÁVNÍ KONTROLE.** Všechny dokumenty v této složce jsou podklady, které připravil dodavatel systému Nexum Care s.r.o. Nejde o právní radu. Před zveřejněním nebo podpisem je musí posoudit a upravit advokát. Stav právních předpisů a podmínek poskytovatelů byl ověřován k 13. 11. 2026, a to z výňatků konsolidovaných znění a oficiálních stránek. Plné znění zákonů na zakonyprolidi.cz a e-sbirka.cz nebylo možné v tomto prostředí otevřít, proto je potřeba citovaná ustanovení zkontrolovat v aktuálním znění.

## Co je v této složce

| Soubor | K čemu slouží | Kde se použije | Kdo ho schvaluje |
|---|---|---|---|
| [`obchodni-podminky.md`](obchodni-podminky.md) | Všeobecné obchodní podmínky rezervací a služeb: kdo je kdo, rezervace, platby (na místě, QR, kredit, permanentky), storno a poplatky, omluvenky a náhrady, skupinové lekce, čekací listina, zrušení klinikou, komunikace, reklamace, ADR, odstoupení, vzorový formulář | web kliniky, klientský portál (odkaz u registrace a u každé rezervace), recepce (tištěné) | klinika, advokát |
| [`zasady-ochrany-osobnich-udaju.md`](zasady-ochrany-osobnich-udaju.md) | Informace o zpracování osobních údajů klientů podle čl. 13 GDPR: správce, zpracovatel, účely, právní základy, doby uchování, příjemci, předávání mimo EU, práva, ÚOOÚ, cookies | web kliniky, klientský portál, recepce | klinika (správce), advokát |
| [`smlouva-o-zpracovani.md`](smlouva-o-zpracovani.md) | Smlouva o zpracování osobních údajů podle čl. 28 GDPR mezi klinikou (správce) a Nexum Care s.r.o. (zpracovatel), včetně technických opatření, dalších zpracovatelů a poznámky k Fio bance | podpis mezi klinikou a Nexum Care spolu s hlavní smlouvou | klinika, Nexum Care, advokáti obou stran |
| [`texty-v-aplikaci.md`](texty-v-aplikaci.md) | Krátké texty do aplikace: souhlasy při registraci, storno shrnutí před potvrzením rezervace, úpravy servisních zpráv, patička newsletteru, pokyny k QR platbě | implementace v klientském portálu a administraci | Nexum Care (implementace), klinika, advokát |

## Jak dokumenty dokončit

1. **Klinika doplní údaje** (seznam níže) a vybere varianty.
2. **Klinika porovná čísla s nastavením aplikace** (tabulka „Nastavitelné hodnoty“). Každé číslo v hranatých závorkách musí odpovídat skutečnému nastavení. Když klinika později nastavení změní, musí změnit i podmínky (nová verze s datem účinnosti).
3. **Advokát projde kontrolní seznam** na konci tohoto souboru a bloky „K ověření právníkem“ v jednotlivých dokumentech.
4. **Nexum Care upraví systém** podle části „Úpravy systému“. Co se nestihne před spuštěním, se musí z dokumentů vypustit nebo popsat tak, jak systém skutečně funguje.
5. Před zveřejněním **odstranit** všechny bloky „K ověření právníkem“, „Pro kliniku“ a „Pro Nexum Care“, smazat nevybrané varianty, doplnit verzi a datum účinnosti a **archivovat** každou zveřejněnou verzi.

## Údaje, které doplní klinika

| Zástupný text | Co doplnit |
|---|---|
| [NÁZEV KLINIKY], [IČO], [SÍDLO] | přesný název podle rejstříku, IČO, sídlo, údaj o zápisu do rejstříku |
| [E-MAIL], [TELEFON], [WEB], [ADRESA PORTÁLU] | kontakty pro klienty a pro žádosti k osobním údajům |
| [ADRESA PROVOZOVNY] | kde se služby poskytují |
| [KRAJSKÝ ÚŘAD], [DATUM], [ČÍSLO] | oprávnění k poskytování zdravotních služeb (pokud ho klinika má) a odbor zdravotnictví pro stížnosti |
| [ŽIVNOSTENSKÝ ÚŘAD] | dozor nad živnostenským podnikáním |
| [VERZE], [DATUM ÚČINNOSTI], [WEB/ARCHIV] | verze dokumentů a kde jsou archivované starší verze |
| [NÁSTROJ PRO VIDEOHOVOR] | čím se dělají online konzultace (a jeho poskytovatel jako příjemce údajů) |
| [JMÉNO, FUNKCE] | kdo za kliniku podepisuje smlouvu o zpracování; kontaktní osoby (Příloha 2) |
| [NÁZEV SYSTÉMU] | kde se vede zdravotnická dokumentace (mimo rezervační systém) |
| [Účetní / daňový poradce] | další příjemci údajů |
| doby uchování v [ ] | zvolit a odůvodnit (zasady-ochrany-osobnich-udaju.md, část 4) |
| [ADRESA PODLE AKTUÁLNÍHO WEBU ČOI] | aktuální poštovní adresu oddělení ADR (zdroje se rozcházejí) |
| Nexum Care: vložka v OR, kontakty | doplní Nexum Care |

## Rozhodnutí, která musí klinika udělat

| Rozhodnutí | Kde | Doporučení návrhu |
|---|---|---|
| Které služby jsou zdravotní službou a které živností | VOP čl. 1.2, 14; informace o zpracování část 5 | fyzioterapie a přístrojové terapie jako zdravotní služba; masáže zdravých osob, tréninky a lekce na živnost |
| Co s nezaplacenou QR rezervací | VOP čl. 4.3 | varianta A (rezervace platí, doplatí se na místě) – odpovídá systému |
| Platnost kreditu | VOP čl. 5.4 | varianta A (bez omezení) – odpovídá systému |
| Nevyčerpané vstupy po skončení platnosti permanentky | VOP čl. 6.7 | varianta A (na žádost převod na kredit) |
| Pozdní zrušení s permanentkou: propadá vstup, nebo poplatek | VOP čl. 6.4, 7.3 | propadá vstup (výchozí nastavení `forfeit_entry`) |
| Nevyčerpaná náhrada za termín zaplacený penězi | VOP čl. 8.6 | varianta B (vrácení na kredit) – vyžaduje úpravu systému |
| První pozdní zrušení zdarma | VOP čl. 7.7 | zvážit zapnutí (`graceFirstLateCancel`) – zmírňuje dopad poplatků |
| Kompenzace při pozdním zrušení klinikou | VOP čl. 12.3 | zvážit (vyváženost podmínek) |
| Pozdní příchod | VOP čl. 3.7, 10.6 | ponechat jen pokud ho recepce bude skutečně uplatňovat |
| Newsletter: jen souhlas, nebo i zákaznická výjimka | informace o zpracování část 4; texty-v-aplikaci část A | jen souhlas (systém dnes jinak neumí; „obdobné služby“ jsou nejisté) |
| Automatické párování plateb přes Fio API | smlouva o zpracování čl. 7.5 a poznámka; informace o zpracování část 7 | zapnout jen s tokenem „Sledování účtu“ |
| Zda se mají zapnout klinické poznámky | smlouva o zpracování čl. 3.3 | ne – zdravotnickou dokumentaci vést mimo rezervační systém |

## Nastavitelné hodnoty – musí odpovídat aplikaci

Výchozí hodnoty pocházejí z `defaultSettings()` a `DEFAULT_PACKAGE_TEMPLATES` v `app/src/engine/defaults.ts`; jejich vyhodnocení je v `app/src/engine/policy.ts`, `commands.ts` a `processes.ts`.

| Pravidlo | Text v dokumentech | Nastavení v systému | Výchozí hodnota |
|---|---|---|---|
| Bezplatné zrušení nebo přesun (individuální služby) | [24 hodin] | `policy.freeCancelHours` | 24 |
| Stupně pozdního zrušení | [24–12 h: 50 %], [méně než 12 h: 100 %] | `policy.lateTiers` | `{24 h: 50 %}`, `{12 h: 100 %}` |
| Nedostavení | [100 %] | `policy.noShowFeePct` | 100 |
| Pozdní zrušení u permanentky | [vstup propadá] | `policy.packageLateHandling` | `forfeit_entry` |
| Omluvenky na permanentku | [2] / podle šablony | `policy.excuses.perPackage`, `PackageTemplate.excusesAllowed` | 2 (Fyzio 10, Trénink 10, Skupiny 8: 2; Fyzio 5, Masáž 5: 1) |
| Omluvenky bez permanentky | [1 za 6 měsíců] | `policy.excuses.perClientCount`, `perClientMonths` | 1 / 6 |
| Lhůta pro omluvu | [2 hodiny] před začátkem | `policy.excuses.deadlineHoursBefore` | 2 |
| Lhůta pro náhradní termín | [14 dnů] od původního termínu | `policy.excuses.makeupDays` | 14 |
| První pozdní zrušení zdarma | [vypnuto] | `policy.graceFirstLateCancel` | `false` |
| Skupinové lekce – bezplatné odhlášení | [6 hodin] | `policy.groupCancelHours` | 6 |
| Pozastavení online rezervací | [3] nedostavení za [90 dní] | `policy.blockAfterNoShows` (90 dní je v kódu) | 3 |
| Online rezervace – nejpozději předem | [2 hodiny] | `bookingRules.minNoticeMin` | 120 min |
| Online rezervace – nejvýše dopředu | [60 dní] | `bookingRules.horizonDays` | 60 |
| Nejvýše nadcházejících rezervací | [6] | `bookingRules.maxUpcomingPerClient` | 6 |
| Čekací listina – platnost nabídky | [2 hodiny], nejpozději 15 min před začátkem | `waitlist.offerMinutes` (15 min je v kódu) | 120 min |
| Čekací listina – kolika čekajícím najednou | [3] | `waitlist.offerTo` | 3 |
| Připomínka termínu | [24 hodin] předem | `reminders.hoursBefore` | 24 |
| Splatnost QR platby | [48 hodin], nejpozději začátek termínu | `payments.qrDueHours` | 48 |
| Bonus za dobití kreditu | [5 % od 3 000 Kč], [10 % od 5 000 Kč] | `creditBonus` | `{3000: 5 %}`, `{5000: 10 %}` |
| Dobití kreditu – minimum a maximum | [100 Kč] / [100 000 Kč] | v kódu (`commands.ts`) | 100 / 100 000 |
| Permanentky – vstupy, cena, platnost | tabulka ve VOP čl. 6.1 | `packageTemplates` | Fyzio 10: 10 900 Kč, 183 dní; Fyzio 5: 5 650 Kč, 120 dní; Masáž 5: 4 990 Kč, 122 dní; Trénink 10: 8 550 Kč, 183 dní; Skupiny 8: 1 990 Kč, 31 dní |
| Upozornění na nevyčerpanou náhradu | [4 dny] před koncem lhůty | v kódu (`processes.ts`) | 4 |
| Upozornění na konec permanentky | [14 dní] před koncem | v kódu (`processes.ts`) | 14 |
| Klinické poznámky | vypnuté | `features.clinicalNotes` | v ostrém provozu `false` (`app/docs/PRODUCTION.md`); testovací verze má `true` |
| Platba kartou online | nenabízí se | `features.cardPayments` | v ostrém provozu vypnutá |

## Úpravy systému, které dokumenty předpokládají

Zjištěno při porovnání návrhů s kódem (commit 6d3d6d6). Seřazeno podle důležitosti.

1. **Tlačítko pro odstoupení od smlouvy** (§ 1830a OZ, zákon č. 159/2026 Sb., účinnost od 1. 1. 2027) u permanentek a kreditu koupených online na nezdravotní služby: dvoukrokové tlačítko, potvrzení e-mailem s datem a časem, výpočet poměrné ceny. Dnes chybí. Alternativa: online prodávat jen permanentky na fyzioterapii nebo prodej permanentek a kreditu omezit na recepci.
2. **Verzování podmínek:** ukládat k rezervaci, nákupu a souhlasu verzi zobrazeného textu (storno shrnutí, VOP, souhlas) a k rezervaci i storno pravidla platná v okamžiku rezervace. Dnes `evaluateCancellation` (`policy.ts`) počítá podmínky a poplatky vždy z aktuálního nastavení, takže změna nastavení zpětně mění podmínky už existujících rezervací – v rozporu s VOP čl. 17.1. U souhlasů se dnes ukládá jen čas a zdroj.
3. **Souhlas `gdpr`:** přejmenovat na potvrzení o informování nebo vázat na přijetí VOP; nepopisovat jako souhlas. Přepínač „Zdravotní dokumentace“ (`health`) při vypnutých klinických poznámkách skrýt.
4. **Servisní zprávy bez propagace:** upravit `package_low` (výzva k nákupu) a `after_visit` (žádost o hodnocení = obchodní sdělení podle ÚOOÚ). `after_visit` posílat jen se souhlasem s obchodními sděleními, nebo ho vypnout.
5. **Obchodní sdělení:** v kampaních označení „obchodní sdělení“, identifikace odesílatele, odkaz na odhlášení v každé zprávě, hlavičky RFC 8058, okamžité zpracování odhlášení.
6. **Zdravotní údaje v textech:** změnit ukázku v poznámce k rezervaci („Např. bolest kolene po běhu“); zprávu pro příjemce v QR platbě dělat bez názvu služby (`paymentMessage` v `qr.ts`); zvážit neutrální názvy služeb ve zprávách (např. „Fyzioterapie pánevního dna“ s popisem „Těhotenství, po porodu, inkontinence“).
7. **Segmentace kampaní:** pravidlo `visited_category` u zdravotních kategorií (Fyzioterapie, Přístroje) používá údaje o zdraví k marketingu – nepoužívat, nebo jen s výslovným souhlasem.
8. **Nevyčerpaná náhrada za zaplacený termín:** dnes propadá i zaplacená částka; varianta B ve VOP čl. 8.6 předpokládá vrácení na kredit.
9. **Zrušení náhradního termínu klinikou:** pokud lhůta náhrady mezitím uplynula, náhrada se neobnoví – při zrušení klinikou lhůtu prodloužit.
10. **Automatický výmaz a anonymizace** po uplynutí dob uchování (neaktivní účty, zprávy, čekací listina, auditní záznamy) a ověření, že funkce exportu a anonymizace klienta jsou v ostré verzi nasazené (dokumenty na ně odkazují).
11. **Připomínka před koncem bezplatné lhůty:** při `reminders.hoursBefore = 24` přijde připomínka zároveň s koncem bezplatné lhůty; zvážit 48 hodin a doplnit do připomínky `storno_do`.
12. **Text tlačítka rezervace** podle § 1826a odst. 2 OZ („Závazně rezervovat s povinností platby“ apod.) a povinné nezaškrtnuté potvrzení storno podmínek (dnes „Souhlasím se storno podmínkami“ – doplnit odkaz na VOP).
13. **Vícefaktorové ověření** pro účty personálu s rolí majitel (Supabase Auth ho umožňuje).
14. **Nejnižší nutná oprávnění u personálu:** podle `app/docs/PRODUCTION.md` dostává personál ze serveru celý stav kliniky; role terapeut je omezena jen v rozhraní (např. skryté finance). Zvážit projekci dat i pro roli terapeut a recepce (čl. 32 GDPR; smlouva o zpracování čl. 6.1 písm. c) a g)).
15. **Nezaplacená QR rezervace (varianta B):** automatické upozornění a zrušení po splatnosti – jen pokud ho klinika zvolí.
16. **Platba za zrušený termín** se připisuje na kredit jako dobití včetně bonusu (`applyTopUp`) – zvážit, zda bonus v tomto případě přiznávat.
17. **Potvrzení přijaté QR platby** klientovi e-mailem (texty-v-aplikaci.md, část E3) – `confirmPaymentRequest` dnes klientovi nic neposílá; VOP čl. 4.2 má proto potvrzení v hranaté závorce.

## Kontrolní seznam pro advokáta

**Spotřebitelské právo a obchodní podmínky**

- [ ] Kvalifikace storno poplatku a poplatku za nedostavení (odstupné § 1992 OZ včetně druhé věty u předplacených termínů / smluvní pokuta §§ 2048–2052 OZ / jiné ujednání) a sjednocení terminologie.
- [ ] Přiměřenost sazeb [50 %] a [100 %] a poplatku [100 %] za nedostavení (§§ 1813–1815 OZ, směrnice 93/13/EHS); riziko, že soud k nepřiměřenému ujednání nepřihlédne vůbec.
- [ ] Transparentnost: zobrazení u tlačítka a zaškrtnutí (I. ÚS 3512/11); rezervace po telefonu a na recepci.
- [ ] Automatické započtení poplatku proti kreditu (VOP čl. 4.6).
- [ ] Propadání předplacené hodnoty – permanentky (čl. 6.7), náhrady (čl. 8.6), kredit (čl. 5.4), odečet bonusu (čl. 5.5).
- [ ] Odstoupení od smlouvy: aktuální znění § 1837 písm. a) a j) a § 1840 OZ; výjimka pro volný čas u masáží a tréninku (SDEU C-96/21); § 1823 a § 1834 OZ u permanentek; § 1830a OZ od 1. 1. 2027; vzorový formulář podle NV č. 29/2023 Sb. ve znění NV č. 66/2026 Sb.
- [ ] Informační povinnosti při uzavírání smlouvy na dálku a elektronicky (§ 1811, § 1820, § 1826, § 1826a OZ) – zda je vše ve VOP a v potvrzení rezervace.
- [ ] Reklamace (§ 19 zákona č. 634/1992 Sb.), stížnosti na zdravotní služby (§ 93 zákona č. 372/2011 Sb.).
- [ ] ADR u ČOI: aktuální adresa; výluka sporů ze zdravotních služeb (§ 20d zákona č. 634/1992 Sb.); žádný odkaz na zrušenou platformu ODR.
- [ ] Změny podmínek u trvajících vztahů (§ 1752 OZ); nezletilí klienti (věková hranice, zákonný zástupce).
- [ ] Vyváženost: kompenzace při pozdním zrušení klinikou (čl. 12.3), výjimky z poplatků (čl. 7.6).

**Zdravotnické právo**

- [ ] Rozsah oprávnění k poskytování zdravotních služeb; hranice mezi zdravotní službou a živností (stanoviska MZ k živnostem bez léčebných tvrzení).
- [ ] Storno poplatky u fyzioterapie vs. práva pacienta (zákon č. 372/2011 Sb.; §§ 2636–2651 OZ).
- [ ] Pokud by klinika poskytovala hrazenou péči: zákon č. 290/2025 Sb., metodické stanovisko MZ k platbám pacientů z 8. 10. 2026.
- [ ] Zdravotnická dokumentace mimo rezervační systém; vyhláška č. 444/2024 Sb. (nahradila vyhlášku č. 98/2012 Sb.) – doba uchování pro fyzioterapii v příloze č. 3.

**Ochrana osobních údajů**

- [ ] Právní základy podle účelů, zejména čl. 9 odst. 2 písm. h) GDPR pro rezervace zdravotních služeb a odvozené zdravotní údaje (SDEU C-184/20, C-21/23).
- [ ] Doby uchování a jejich odůvodnění.
- [ ] Pověřenec (čl. 37 GDPR, recitál 91) a dobrovolné posouzení vlivu (DPIA); záznamy o činnostech zpracování kliniky (čl. 30).
- [ ] Předávání mimo EU: Supabase Pte. Ltd. (Singapur) a Supabase, Inc. (USA) na standardních smluvních doložkách; Cloudflare (Data Privacy Framework, odvolání C-703/25 P); SMS partneři Brevo.
- [ ] Automatické pozastavení online rezervací a čl. 22 GDPR.
- [ ] Cookies a místní úložiště v ostrém nasazení (§ 89 odst. 3 zákona č. 127/2005 Sb.) – ověřit skutečný stav.

**Marketing**

- [ ] Souhlas vs. zákaznická výjimka (§ 7 odst. 2 a 3 zákona č. 480/2004 Sb.), „obdobné služby“.
- [ ] Servisní zprávy bez propagace; žádosti o hodnocení jako obchodní sdělení (ÚOOÚ, kontrolní plán 2026).
- [ ] Náležitosti obchodního sdělení (§ 7 odst. 4); dopad zákona o digitální ekonomice (Sněmovna schválila 4. 11. 2026).

**Smlouva o zpracování**

- [ ] Úplnost podle čl. 28 odst. 3 GDPR; lhůty (ohlášení porušení [24 h], export a výmaz [30 dní]); audity; cena součinnosti.
- [ ] Limitace odpovědnosti a pokuty (čl. 13).
- [ ] Fio banka jako samostatný správce; posouzení podle zákona č. 370/2017 Sb., o platebním styku.
- [ ] Zákon č. 264/2025 Sb., o kybernetické bezpečnosti – zda se na stranu vztahuje.

## Mimo rozsah těchto návrhů

- **DPH a doklady:** osvobození zdravotních služeb (§ 58 zákona o DPH), sazby u masáží a tréninků, DPH ze storno poplatků – pro daňového poradce.
- **Evidence tržeb:** zákon č. 180/2026 Sb. (EET 2.0) od 1. 1. 2027 se týká plateb na recepci včetně karty a QR kódu; online platby předem a převody mimo něj. Řeší pokladna a daňový poradce.
- Smlouva mezi klinikou a Nexum Care o dodávce systému (hlavní smlouva), vnitřní řád kliniky, pracovněprávní dokumenty.

## Zdroje a omezení ověření

- Hlavní podklady: `research_notes/Rezervační systém pro fyzioterapii/storno_omluvenky_pravo.md`, `pravo_overeni.md`, `cesky_storno_praxe.md`, `komunikace_integrace.md`; `reports/Rezervační systém pro fyzioterapii.md`; `app/docs/PRODUCTION.md`, `app/docs/ARCHITECTURE.md`; kód enginu v `app/src/engine/`.
- Ověření k 13. 11. 2026 proběhlo přes vyhledávání a oficiální stránky (uoou.gov.cz, coi.gov.cz, mzd.gov.cz, eur-lex.europa.eu, curia.europa.eu, stránky Supabase, Cloudflare, Brevo a Fio banky). Weby zakonyprolidi.cz a e-sbirka.cz nebyly z tohoto prostředí dostupné – znění zákonů bylo ověřováno z výňatků konsolidovaných znění (krajta.slv.cz, podnikatel.cz, mesec.cz) a musí je zkontrolovat advokát.
- Konkrétní odkazy jsou v části „Zdroje“ na konci každého dokumentu.
- Hlavní změny oproti dřívějším podkladům: vyhláška č. 98/2012 Sb. byla od 1. 1. 2025 nahrazena vyhláškou č. 444/2024 Sb.; tlačítko pro odstoupení zavedl zákon č. 159/2026 Sb. s účinností od 1. 1. 2027; platforma ODR byla zrušena k 20. 7. 2025; zákon o digitální ekonomice, který má nahradit zákon č. 480/2004 Sb., schválila Sněmovna 4. 11. 2026 a čeká na Senát.
