# Právní dokumenty platformy [NÁZEV PLATFORMY] – pracovní návrhy

> **PRACOVNÍ NÁVRHY K PRÁVNÍ KONTROLE.** Všechny dokumenty v této složce jsou podklady, které připravil Nexum Care s.r.o. jako vlastník a provozovatel platformy. Nejde o právní radu. Před podpisem nebo zveřejněním je musí posoudit a upravit advokát – smlouvy Nexum Care se zákazníky advokát Nexum Care, texty provozoven pro jejich klienty advokát provozovny. Stav právních předpisů a podmínek poskytovatelů byl ověřován k 13. 11. 2026 a pro platformní model (licenční smlouva, Data Act) k 15. 11. 2026, a to z výňatků konsolidovaných znění, komentářů a oficiálních stránek. Plné znění zákonů na zakonyprolidi.cz a e-sbirka.cz ani EUR-Lex nebylo možné v tomto prostředí otevřít, proto je potřeba citovaná ustanovení zkontrolovat v aktuálním znění.

## Model: kdo s kým uzavírá smlouvu

Rezervační systém vznikl pro jednu fyzioterapeutickou kliniku. Nexum Care z něj dělá univerzální platformu, kterou vlastní a licencuje podnikatelům z různých oborů (fyzioterapie, masáže a wellness, fitness, kosmetika…). Každý zákazník dostane stejnou platformu nastavenou pro sebe (vzhled, služby, moduly, texty) a platí měsíční předplatné, nebo doživotní licenci.

```
Nexum Care s.r.o. – Poskytovatel (vlastník a provozovatel Platformy, zpracovatel osobních údajů)
   │   licenční smlouva (varianta A předplatné / B doživotní) + SLA
   │   smlouva o zpracování osobních údajů (čl. 28 GDPR)
   ▼
Zákazník – Provozovna (podnikatel, B2B; správce osobních údajů svých klientů)
   │   obchodní podmínky provozovny
   │   informace o zpracování osobních údajů
   ▼
Klient (zpravidla spotřebitel)

Další zpracovatelé Nexum Care: Supabase (databáze a přihlášení, EU – Frankfurt), Cloudflare (web), Brevo (e-maily, SMS).
Banka provozovny (Fio banka) je samostatný správce, ne zpracovatel.
```

## Co je v této složce

| Soubor | K čemu slouží | Kde se použije | Kdo ho schvaluje |
|---|---|---|---|
| [`licencni-smlouva.md`](licencni-smlouva.md) | **Licenční smlouva a smlouva o poskytování služeb (SaaS)** mezi Nexum Care a zákazníkem: varianta A (předplatné) a B (doživotní licence, B1/B2), rozsah licence, duševní vlastnictví, služby, onboarding a úpravy na zakázku, zkušební období, ceny a jejich změny, platnost licence a omezení při neplacení, SLA, zálohy, odpovědnost, vyšší moc, ukončení, export a přechod (Data Act), ukončení provozu Platformy a úschova kódu; přílohy: ceník a parametry, smlouva o zpracování, SLA a podpora, specifikace úprav | podpis s každým zákazníkem | Nexum Care a jeho advokát (vzor jednou), zákazník |
| [`smlouva-o-zpracovani.md`](smlouva-o-zpracovani.md) | Smlouva o zpracování osobních údajů podle čl. 28 GDPR – Příloha 2 licenční smlouvy; Nexum Care jako zpracovatel pro všechny provozovny, varianta Z / N u údajů o zdraví, technická opatření, další zpracovatelé, poznámka k Fio bance | podpis spolu s licenční smlouvou | Nexum Care, zákazník, advokáti obou stran |
| [`obchodni-podminky.md`](obchodni-podminky.md) | **Vzor** obchodních podmínek provozovny vůči klientům: rezervace, platby (na místě, QR, kredit, permanentky), storno a poplatky, omluvenky a náhrady, skupinové lekce, čekací listina, zrušení provozovnou, komunikace, odstoupení (varianta Z / N), reklamace, ADR, vzorový formulář | web provozovny, klientský portál (odkaz u registrace a u každé rezervace), recepce | provozovna a její advokát |
| [`zasady-ochrany-osobnich-udaju.md`](zasady-ochrany-osobnich-udaju.md) | **Vzor** informace provozovny o zpracování osobních údajů klientů podle čl. 13 GDPR: správce, zpracovatel, účely, právní základy, doby uchování, údaje o zdraví (varianta Z / N), příjemci, předávání mimo EU, práva, ÚOOÚ, cookies | web provozovny, klientský portál, recepce | provozovna (správce) a její advokát |
| [`texty-v-aplikaci.md`](texty-v-aplikaci.md) | Krátké texty do aplikace: souhlasy při registraci, storno shrnutí před potvrzením rezervace, úpravy servisních zpráv, patička newsletteru, pokyny k QR platbě. Používají slovo „klinika“ jako příklad – v Platformě se má použít názvosloví provozovny (`settings.terms`) | implementace v klientském portálu a administraci | Nexum Care (implementace), provozovna, advokát |
| [`zverejnit/`](zverejnit/README.md) | schválené finální texty pro samostatné nasazení (build z nich vytvoří stránky) | `npm run build:prod` | – |

Interní podklady pro majitele Nexum Care (nejsou právní texty) jsou ve složce [`../business/`](../business/): [`cenik-a-licence.md`](../business/cenik-a-licence.md) (tarify, doživotní licence, průběžné náklady, stav licence v Platformě, fakturace) a [`onboarding-zakaznika.md`](../business/onboarding-zakaznika.md) (kontrolní seznam zavedení nového zákazníka).

## Pojmy napříč dokumenty

| Pojem | Význam | Poznámka |
|---|---|---|
| **Poskytovatel** | Nexum Care s.r.o. | jen v licenční smlouvě; ve smlouvě o zpracování „Zpracovatel“; v textech pro klienty „provozovatel Platformy“ (aby si ho klient nepletl s provozovnou) |
| **Zákazník** | podnikatel, který s Nexum Care uzavírá licenční smlouvu | ve smlouvě o zpracování „Správce“ |
| **Provozovna** | v licenční smlouvě podnik nebo místo Zákazníka, pro které je v Platformě zřízeno samostatné prostředí; v obchodních podmínkách a v informaci o zpracování označuje Zákazníka jako stranu smlouvy s Klientem | placeholder [NÁZEV PROVOZOVNY] |
| **Klient** | osoba, která u provozovny rezervuje nebo využívá služby (zpravidla spotřebitel) | |
| **Platforma** | rezervační systém – administrace, klientský portál, server a automatika | dřívější „Systém“ |
| **Pracovník** | terapeut, trenér, lektor, kosmetička nebo jiná osoba, která služby poskytuje a má v Platformě rozvrh | parametr tarifu |
| **Uživatel** | osoba s přístupem do administrace (majitel, recepce, Pracovník) | |

## Varianty v dokumentech

| Značka | Dokumenty | Význam |
|---|---|---|
| [VARIANTA A] / [VARIANTA B], [VARIANTA B1] / [VARIANTA B2] | licenční smlouva | A = předplatné (měsíčně / ročně); B = doživotní licence; B1 = roční poplatek za provoz od druhého roku, B2 = provoz zahrnut na N let |
| [VARIANTA Z] / [VARIANTA N] | obchodní podmínky, informace o zpracování, smlouva o zpracování | Z = provozovna poskytuje zdravotní služby (např. fyzioterapii jako poskytovatel zdravotních služeb – údaje o zdraví, výluka z odstoupení podle § 1840 OZ); N = nezdravotní služby (masáže, fitness, kosmetika – odstoupení u permanentek a kreditu koupených online). Provozovna s oběma druhy služeb ponechá oba texty. |
| [VARIANTA A] / [VARIANTA B] (s popisem) | obchodní podmínky, informace o zpracování | volba provozovny v jednotlivém bodě (např. nezaplacená QR rezervace, platnost kreditu) |
| [MODUL …] | obchodní podmínky, informace o zpracování | článek o modulu, který provozovna nemusí používat (skupinové lekce, permanentky, kredit, kampaně) |
| [VOLITELNÉ: …] | všechny | ustanovení, které lze vypustit |

## Jak dokumenty dokončit

**Nexum Care (jednou, jako vzor pro všechny zákazníky)**

1. Advokát Nexum Care projde licenční smlouvu a smlouvu o zpracování (kontrolní seznam níže a bloky „K ověření právníkem“) a Nexum Care udělá rozhodnutí v tabulce „Rozhodnutí Nexum Care“.
2. Nexum Care sladí lhůty v licenční smlouvě (článek 11 a 18) s technickým chováním Platformy (tabulka „Licence – smlouva a technika“).
3. Pro každého zákazníka se vyplní Příloha 1 licenční smlouvy (tarif, ceny) a Příloha 2 smlouvy o zpracování (kontakty) – postup v [`../business/onboarding-zakaznika.md`](../business/onboarding-zakaznika.md).

**Každá provozovna (pro své klienty)**

1. **Provozovna doplní údaje** (seznam níže) a vybere varianty – Z / N podle druhu služeb, A / B v jednotlivých bodech, vypustí nepoužívané moduly.
2. **Provozovna porovná čísla s nastavením aplikace** (tabulka „Nastavitelné hodnoty“). Každé číslo v hranatých závorkách musí odpovídat skutečnému nastavení. Když provozovna později nastavení změní, musí změnit i podmínky (nová verze s datem účinnosti).
3. **Advokát provozovny projde kontrolní seznam** a bloky „K ověření právníkem“.
4. **Nexum Care upraví systém** podle části „Úpravy systému“. Co se nestihne před spuštěním, se musí z dokumentů vypustit nebo popsat tak, jak systém skutečně funguje.
5. Před zveřejněním **odstranit** všechny bloky „K ověření právníkem“, „Pro Provozovnu“ a „Pro Nexum Care“, smazat nevybrané varianty, doplnit verzi a datum účinnosti a **archivovat** každou zveřejněnou verzi.

## Údaje, které doplní provozovna

| Zástupný text | Co doplnit |
|---|---|
| [NÁZEV PROVOZOVNY], [IČO], [SÍDLO] | přesný název nebo jméno podnikatele podle rejstříku, IČO, sídlo, údaj o zápisu do rejstříku |
| [E-MAIL], [TELEFON], [WEB], [ADRESA PORTÁLU] | kontakty pro klienty a pro žádosti k osobním údajům |
| [ADRESA PROVOZOVNY] | kde se služby poskytují |
| [VÝČET ZDRAVOTNÍCH SLUŽEB], [KRAJSKÝ ÚŘAD], [DATUM], [ČÍSLO] | varianta Z: které služby jsou zdravotní, oprávnění k poskytování zdravotních služeb a odbor zdravotnictví pro stížnosti |
| [OBOR ŽIVNOSTI], [ŽIVNOSTENSKÝ ÚŘAD] | varianta N: živnostenské oprávnění a dozor |
| [VERZE], [DATUM ÚČINNOSTI], [WEB/ARCHIV] | verze dokumentů a kde jsou archivované starší verze |
| [NÁSTROJ PRO VIDEOHOVOR] | jen pokud nabízí online konzultace (a jeho poskytovatel jako příjemce údajů) |
| [JMÉNO, FUNKCE] | kdo za provozovnu podepisuje smlouvy; kontaktní osoby (Příloha 2 smlouvy o zpracování) |
| [NÁZEV SYSTÉMU] | varianta Z: kde se vede zdravotnická dokumentace (mimo Platformu) |
| [Účetní / daňový poradce] | další příjemci údajů |
| doby uchování v [ ] | zvolit a odůvodnit (zasady-ochrany-osobnich-udaju.md, část 4) |
| [ADRESA PODLE AKTUÁLNÍHO WEBU ČOI] | aktuální poštovní adresu oddělení ADR (zdroje se rozcházejí) |

## Údaje, které doplní Nexum Care

| Zástupný text | Co doplnit |
|---|---|
| [NÁZEV PLATFORMY], [DOMÉNA PLATFORMY] | obchodní název platformy a doména pro adresy `/<označení>` |
| vložka v OR, [JMÉNO] jednatele, [E-MAIL NEXUM CARE], [TELEFON NEXUM CARE], [ČÍSLO ÚČTU NEXUM CARE] | údaje Nexum Care do smluv |
| [WEB NEXUM CARE] | kde je informace o zpracování údajů kontaktních osob zákazníků (Nexum Care jako správce) |
| [ADRESA DOKUMENTACE] | veřejný popis exportovaných dat, formátů a postupu přechodu (Data Act; licenční smlouva čl. 18.1) |
| [E-MAIL PODPORY], [TELEFON PODPORY] | kanály podpory (Příloha 3) |
| ceny v Příloze 1 | podle [`../business/cenik-a-licence.md`](../business/cenik-a-licence.md) |
| [NOTÁŘ / ADVOKÁT / SPECIALIZOVANÝ SCHOVATEL] | jen při úschově zdrojového kódu (čl. 19.5) |

## Rozhodnutí Nexum Care – licenční model

| Rozhodnutí | Kde | Doporučení návrhu |
|---|---|---|
| Nabízet doživotní licenci | licenční smlouva čl. 3.5, 9.3; ceník část 4 | ano, ale omezeně (zakládající zákazníci, Start a Standard) a vždy s ročním poplatkem za provoz |
| B1, nebo B2 | čl. 9.3 | B1 – nižší vstupní cena, jednodušší |
| Vrácení poměrné části licenčního poplatku při ukončení Platformy do 5 let | čl. 19.4 | ano – bez něj je doživotní nabídka málo důvěryhodná |
| Úschova zdrojového kódu / licence k samostatnému provozu | čl. 19.5 | jako placená volba; levnější alternativa písm. e) |
| Limit odpovědnosti | čl. 15.3–15.4 | poplatky za 12 měsíců; vyšší limit pro porušení ochrany osobních údajů – rozhodne advokát |
| Cílová dostupnost a doby reakce | čl. 12, Příloha 3 | 99,5 % měsíčně, reakce do 2 hodin v pracovní době u kritických chyb – jen pokud to Nexum Care zvládne bez pohotovosti 24/7 |
| Výpovědní doby | čl. 17 | zákazník 1 měsíc (Data Act: nejvýše 2 měsíce), Nexum Care 3 měsíce; ukončení Platformy 6 (A) / 12 (B) měsíců předem |
| Zkušební období ve smlouvě s automatickým přechodem | čl. 7 | jen pro zájemce, kteří zkoušejí na skutečných datech; jinak zkouška bez smlouvy na ukázkových datech |
| Co smějí klienti v režimu jen pro čtení | čl. 11.4 písm. c) | zrušit existující rezervaci; připomínky a potvrzení dál odcházejí |
| Exportní lhůta a výmaz | čl. 18.5–18.6 | 60 dní, výmaz do 30 dní, zálohy do 30 dní |

## Rozhodnutí, která musí udělat provozovna

| Rozhodnutí | Kde | Doporučení návrhu |
|---|---|---|
| Které služby jsou zdravotní službou a které živností (varianta Z / N) | VOP čl. 1.2, 14; informace o zpracování část 5; smlouva o zpracování čl. 3.3 | zdravotní službou jen to, na co má provozovna oprávnění (např. fyzioterapie, přístrojové terapie); masáže zdravých osob, tréninky, lekce a kosmetika na živnost |
| Které moduly používá | VOP čl. 5, 6, 10; informace o zpracování části 3 a 4 | vypustit články o vypnutých modulech |
| Co s nezaplacenou QR rezervací | VOP čl. 4.3 | varianta A (rezervace platí, doplatí se na místě) – odpovídá systému |
| Platnost kreditu | VOP čl. 5.4 | varianta A (bez omezení) – odpovídá systému |
| Nevyčerpané vstupy po skončení platnosti permanentky | VOP čl. 6.7 | varianta A (na žádost převod na kredit) |
| Pozdní zrušení s permanentkou: propadá vstup, nebo poplatek | VOP čl. 6.4, 7.3 | propadá vstup (výchozí nastavení `forfeit_entry`) |
| Nevyčerpaná náhrada za termín zaplacený penězi | VOP čl. 8.6 | varianta B (vrácení na kredit) – vyžaduje úpravu systému |
| První pozdní zrušení zdarma | VOP čl. 7.7 | zvážit zapnutí (`graceFirstLateCancel`) – zmírňuje dopad poplatků |
| Kompenzace při pozdním zrušení provozovnou | VOP čl. 12.3 | zvážit (vyváženost podmínek) |
| Pozdní příchod | VOP čl. 3.7, 10.6 | ponechat jen pokud ho recepce bude skutečně uplatňovat |
| Dobíjení kreditu online | VOP čl. 5, 14 | dokud nemá kredit tlačítko pro odstoupení, zvážit vypnutí, nebo vyřizovat odstoupení ručně |
| Newsletter: jen souhlas, nebo i zákaznická výjimka | informace o zpracování část 4; texty-v-aplikaci část A | jen souhlas (systém dnes jinak neumí; „obdobné služby“ jsou nejisté) |
| Automatické párování plateb přes Fio API | smlouva o zpracování čl. 7.5 a poznámka; informace o zpracování část 7 | zapnout jen s tokenem „Sledování účtu“ |
| Zda se mají zapnout klinické poznámky | smlouva o zpracování čl. 3.3 | ne – zdravotnickou dokumentaci vést mimo Platformu |

## Nastavitelné hodnoty – musí odpovídat aplikaci

Výchozí hodnoty pocházejí z `defaultSettings()` a `DEFAULT_PACKAGE_TEMPLATES` v `app/src/engine/defaults.ts`; jejich vyhodnocení je v `app/src/engine/policy.ts`, `commands.ts` a `processes.ts`. Šablony oborů (`app/src/engine/presets.ts`) z nich vycházejí.

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
| Odstoupení u permanentky koupené online | VOP čl. 6.1 (sloupec), 14 | `PackageTemplate.withdrawalAllowed` | Fyzio 10 a Fyzio 5: `false`; ostatní povoleno |
| Upozornění na nevyčerpanou náhradu | [4 dny] před koncem lhůty | v kódu (`processes.ts`) | 4 |
| Upozornění na konec permanentky | [14 dní] před koncem | v kódu (`processes.ts`) | 14 |
| Moduly | články [MODUL …] | `modules.groups`, `packages`, `credit`, `marketing` | vše zapnuto |
| Klinické poznámky | vypnuté | `features.clinicalNotes` | v ostrém provozu `false` (`app/docs/PRODUCTION.md`); testovací verze má `true` |
| Platba kartou online | nenabízí se | `features.cardPayments` | v ostrém provozu vypnutá |

### Licence – smlouva a technika

Platforma vynucuje licenci technicky (plán, platnost, ochranná lhůta, režim jen pro čtení, pozastavení). Hodnoty v licenční smlouvě musí odpovídat kódu.

| Pravidlo | Licenční smlouva | Chování Platformy | Hodnota v návrhu |
|---|---|---|---|
| Plán | čl. 11.1 | `trial` / `monthly` / `yearly` / `lifetime` | podle varianty |
| Platnost licence | čl. 1.1, 11.1–11.2 | „platnost do“ v administraci | konec zaplaceného nebo zahrnutého období (i u `lifetime`) |
| Zkušební období | čl. 7 | plán `trial` | [30] dní |
| Ochranná lhůta | čl. 11.3 | plný provoz s upozorněním | 14 dní |
| Režim jen pro čtení | čl. 11.4 | data vidět a exportovat, nové rezervace ne | od 15. dne po Platnosti licence |
| Pozastavení pro neplacení | čl. 11.5 | provede provozovatel | po [30] dnech režimu jen pro čtení, upozornění [7] dní předem |
| Export při pozastavení | čl. 11.6 | na žádost | do [5] pracovních dnů |
| Odstoupení / ukončení provozu | čl. 11.10, 17.5 | – | po [60] dnech od Platnosti licence |
| Exportní lhůta po skončení | čl. 18.5 | režim jen pro čtení pro majitele | [60] dní |
| Výmaz | čl. 18.6 | výmaz dat provozovny | do [30] dní, ze záloh do [30] dní |

## Úpravy systému, které dokumenty předpokládají

Zjištěno při porovnání návrhů s kódem (commit 6d3d6d6). Seřazeno podle důležitosti.

1. **Tlačítko pro odstoupení od smlouvy** (§ 1830a OZ, zákon č. 159/2026 Sb., účinnost od 1. 1. 2027) u permanentek a kreditu koupených online na nezdravotní služby: dvoukrokové tlačítko, potvrzení e-mailem s datem a časem, výpočet poměrné ceny. Dnes chybí. Alternativa: online prodávat jen permanentky na zdravotní služby nebo prodej permanentek a kreditu omezit na recepci.
2. **Verzování podmínek:** ukládat k rezervaci, nákupu a souhlasu verzi zobrazeného textu (storno shrnutí, VOP, souhlas) a k rezervaci i storno pravidla platná v okamžiku rezervace. Dnes `evaluateCancellation` (`policy.ts`) počítá podmínky a poplatky vždy z aktuálního nastavení, takže změna nastavení zpětně mění podmínky už existujících rezervací – v rozporu s VOP čl. 17.1. U souhlasů se dnes ukládá jen čas a zdroj.
3. **Souhlas `gdpr`:** přejmenovat na potvrzení o informování nebo vázat na přijetí VOP; nepopisovat jako souhlas. Přepínač „Zdravotní dokumentace“ (`health`) při vypnutých klinických poznámkách skrýt.
4. **Servisní zprávy bez propagace:** upravit `package_low` (výzva k nákupu) a `after_visit` (žádost o hodnocení = obchodní sdělení podle ÚOOÚ). `after_visit` posílat jen se souhlasem s obchodními sděleními, nebo ho vypnout.
5. **Obchodní sdělení:** v kampaních označení „obchodní sdělení“, identifikace odesílatele, odkaz na odhlášení v každé zprávě, hlavičky RFC 8058, okamžité zpracování odhlášení.
6. **Zdravotní údaje v textech:** změnit ukázku v poznámce k rezervaci („Např. bolest kolene po běhu“); zprávu pro příjemce v QR platbě dělat bez názvu služby (`paymentMessage` v `qr.ts`); zvážit neutrální názvy služeb ve zprávách (např. „Fyzioterapie pánevního dna“ s popisem „Těhotenství, po porodu, inkontinence“).
7. **Segmentace kampaní:** pravidlo `visited_category` u zdravotních kategorií (Fyzioterapie, Přístroje) používá údaje o zdraví k marketingu – nepoužívat, nebo jen s výslovným souhlasem.
8. **Nevyčerpaná náhrada za zaplacený termín:** dnes propadá i zaplacená částka; varianta B ve VOP čl. 8.6 předpokládá vrácení na kredit.
9. **Zrušení náhradního termínu provozovnou:** pokud lhůta náhrady mezitím uplynula, náhrada se neobnoví – při zrušení provozovnou lhůtu prodloužit.
10. **Automatický výmaz a anonymizace** po uplynutí dob uchování (neaktivní účty, zprávy, čekací listina, auditní záznamy) a ověření, že funkce exportu a anonymizace klienta jsou v ostré verzi nasazené (dokumenty na ně odkazují).
11. **Připomínka před koncem bezplatné lhůty:** při `reminders.hoursBefore = 24` přijde připomínka zároveň s koncem bezplatné lhůty; zvážit 48 hodin a doplnit do připomínky `storno_do`.
12. **Text tlačítka rezervace** podle § 1826a odst. 2 OZ („Závazně rezervovat s povinností platby“ apod.) a povinné nezaškrtnuté potvrzení storno podmínek (dnes „Souhlasím se storno podmínkami“ – doplnit odkaz na VOP).
13. **Vícefaktorové ověření** pro účty personálu s rolí majitel (Supabase Auth ho umožňuje).
14. **Nejnižší nutná oprávnění u personálu:** podle `app/docs/PRODUCTION.md` dostává personál ze serveru celý stav provozovny; role terapeut je omezena jen v rozhraní (např. skryté finance). Zvážit projekci dat i pro roli terapeut a recepce (čl. 32 GDPR; smlouva o zpracování čl. 6.1 písm. c) a g)).
15. **Nezaplacená QR rezervace (varianta B):** automatické upozornění a zrušení po splatnosti – jen pokud ho provozovna zvolí.
16. **Platba za zrušený termín** se připisuje na kredit jako dobití včetně bonusu (`applyTopUp`) – zvážit, zda bonus v tomto případě přiznávat.
17. **Potvrzení přijaté QR platby** klientovi e-mailem (texty-v-aplikaci.md, část E3) – `confirmPaymentRequest` dnes klientovi nic neposílá; VOP čl. 4.2 má proto potvrzení v hranaté závorce.

### Stav po úpravách (13. 11. 2026)

| Bod | Stav |
|---|---|
| 1. Odstoupení od smlouvy | **Hotovo pro permanentky** koupené v portálu: tlačítko „Odstoupit od smlouvy“ do 14 dnů, potvrzení e-mailem, výpočet vrácení (cena minus využité vstupy), zrušení rezervovaných termínů, evidence vrácení pro recepci. Permanentky na fyzioterapii mají odstoupení vypnuté (`PackageTemplate.withdrawalAllowed = false`). **Kredit dobitý online zatím ne** – rozhodnout s advokátem (případně dobíjení kreditu online vypnout). |
| 2. Verzování podmínek | **Hotovo pro storno pravidla** (`settings.policyHistory`, rezervace se řídí pravidly z doby vzniku). Verze textu VOP a souhlasů se zatím neukládá. |
| 4. Servisní zprávy | **Hotovo:** `after_visit` jen se souhlasem s obchodními sděleními, `package_low` bez výzvy k nákupu. |
| 5. Obchodní sdělení | **Hotovo:** označení „obchodní sdělení“, podepsaný odkaz na odhlášení jedním kliknutím, hlavičky List-Unsubscribe (RFC 8058), odhlášení se zpracuje hned. |
| 6. Zdravotní údaje v textech | **Hotovo:** neutrální nápověda v poznámce k rezervaci, zpráva pro příjemce v QR platbě bez názvu služby. |
| 10. Výmaz a anonymizace | **Export údajů a anonymizace klienta hotové** (karta klienta, jen majitel). Automatický výmaz po uplynutí lhůt zatím ne. |
| 12. Tlačítko rezervace | **Hotovo:** „Závazně rezervovat s povinností platby“ a nezaškrtnuté potvrzení storno podmínek s odkazem na VOP. |
| 17. Potvrzení přijaté platby | **Hotovo:** e-mail „Platba přijata“ (šablona `payment_received`). VOP čl. 4.2 už potvrzení uvádí bez hranaté závorky. |
| 3, 7, 8, 9, 11, 13, 14, 15, 16 | Otevřené – rozhodnutí provozovny / advokáta nebo další vývoj. |

### Platformní model (15. 11. 2026, commit 173dbad)

18. **Licence a omezení služby** podle článku 11 licenční smlouvy: upozornění majiteli v ochranné lhůtě; přesně definovat, co blokuje režim jen pro čtení (doporučení: klienti mohou zrušit existující rezervaci a připomínky i potvrzení dál odcházejí – jinak provozovna poruší své VOP); co vidí klient při pozastavení (neutrální text s kontaktem na provozovnu, bez důvodu); Platnost licence s datem i u plánu `lifetime`; export v režimu jen pro čtení i při pozastavení.
19. **Úplný export provozovny** pro přechod k jinému poskytovateli (Data Act; licenční smlouva čl. 18): JSON a CSV všech dat provozovny s popisem struktury, dostupný i v režimu jen pro čtení a v exportní lhůtě po skončení smlouvy. Dnes existuje export po klientech (karta klienta) a přehledy (např. CSV vstupů).
20. **Více provozoven na jednom nasazení:** `POST /api/admin/bootstrap` zakládá jen první provozovnu (další volání vrátí 409), registrace klienta se váže k výchozí provozovně, `FIO_TOKEN`, `SMS_SENDER` a `MAIL_FROM` jsou společné proměnné serveru. Do vyřešení potřebuje každý zákazník samostatné nasazení (dopad na náklady – `../business/cenik-a-licence.md`).
21. **Právní texty provozovny** (`settings.legal`) zobrazit klientům na adrese provozovny se stejnou kontrolou konceptu jako `app/scripts/build-legal.mjs`. Kontrola dnes hledá „PRACOVNÍ NÁVRH“, „K ověření právníkem“, „Pro kliniku:“ a zástupné texty psané velkými písmeny – doplnit „Pro Provozovnu:“, „Pro Nexum Care:“ a značky variant s malými písmeny. Značky [VARIANTA Z], [VARIANTA N] a [MODUL …] kontrola zachytí už dnes.
22. **Šablony oborů** (`presets.ts`) mají zatím stejný katalog jako fyzioterapie (kromě prázdné provozovny) a `bootstrap` šablonu nepoužívá. Po doplnění šablon nastavit `withdrawalAllowed = false` jen u permanentek na zdravotní služby.
23. **Odstoupení u permanentek:** `withdrawalInfo` počítá jako vyčerpané i propadlé vstupy (pozdní zrušení, nedostavení) – podle posouzení advokáta (VOP čl. 14, § 1834 OZ) případně změnit.
24. **Přihlašovací účet klienta u více provozoven** – ověřit, jak se jeden e-mail propojuje s kartami u různých provozoven (`client_accounts`), a popsat to v informaci o zpracování (část 2).

### Stav platformních bodů (15. 11. 2026)

| Bod | Stav |
|---|---|
| 18. Licence a omezení | **Hotovo:** upozornění majiteli 14 dní před koncem a v 14denní ochranné lhůtě; potom jen čtení – nové rezervace a změny ne, klient ale smí zrušit rezervaci, odvolat souhlas a odstoupit od smlouvy a automatické zprávy (potvrzení zrušení, připomínky) dál odcházejí. Při pozastavení vidí klient neutrální text „Online rezervace jsou dočasně nedostupné. Kontaktujte prosím provozovnu.“, tým se nepřihlásí, **majitel data dál prohlíží a exportuje**. U plánu `lifetime` se zadává datum konce zaplaceného provozu a podpory (konzole: „Provoz a podpora zaplaceny do“, výchozí +1 rok); bez data je provoz neomezený (např. vlastní hosting). |
| 19. Úplný export | **Hotovo:** Nastavení → Export dat (jen majitel) – všechna data provozovny v JSON s popisem struktury a CSV klientů, rezervací, plateb, permanentek a kreditu. Funguje i v režimu jen pro čtení a při pozastavení / ukončení (do výmazu). Veřejný popis formátu pro čl. 18.1 lze převzít z pole `popis` v exportu. |
| 20. Více provozoven | **Hotovo:** jedna instalace, provozovny zakládá vlastník platformy v konzoli `/platforma`; data, přístupy a klienti oddělené; token Fio každé provozovny šifrovaně v databázi; e-maily z jedné adresy platformy se jménem provozovny jako odesílatele a odpovědí na e-mail provozovny. Společný zůstává odesílatel SMS (`SMS_SENDER`). Viz `../PLATFORM.md`. |
| 21. Právní texty provozovny | **Hotovo:** Nastavení → Právní texty; klienti je vidí při registraci, přihlášení a v účtu. Uložit nejde text s poznámkami konceptu („PRACOVNÍ NÁVRH“, „K ověření právníkem“, „Pro kliniku:“, „Pro Provozovnu:“, „Pro Nexum Care:“) ani s nevyplněnými údaji ([VARIANTA …], [MODUL …], [NÁZEV …]); odkazy jako [ÚOOÚ](https://uoou.gov.cz) nevadí. Dokud provozovna text nemá, zobrazí se obecná stránka platformy. |
| 22. Šablony oborů | **Hotovo:** fyzio, masáže, fitness, kosmetika a prázdná provozovna – služby, ceník, permanentky, skupinové lekce, storno podmínky, názvosloví a moduly; konzole je používá při zakládání provozovny. Odstoupení je vypnuté jen u permanentek na fyzioterapii (zdravotní služby, § 1840 OZ); u masáží a kosmetiky ho posoudit s advokátem. |
| 23. Odstoupení u permanentek | Otevřené – rozhodnutí advokáta. |
| 24. Účet klienta u více provozoven | **Technický stav:** přihlašovací účet (e-mail) je jeden pro celou platformu, ale karta klienta, souhlasy a historie jsou u každé provozovny zvlášť; u další provozovny se klient registruje znovu (nová karta) a provozovny o sobě navzájem nic nevidí. Účet se s kartou propojí jen tehdy, když provozovna klienta s tímto ověřeným e-mailem už vede. K posouzení: kdo je správcem samotného přihlašovacího účtu (pravděpodobně Nexum Care jako provozovatel platformy) a jak to uvést v informaci o zpracování (část 2). |

## Kontrolní seznam pro advokáta

**Licenční smlouva (B2B, Nexum Care ↔ zákazník)**

- [ ] Kvalifikace smíšené smlouvy (§ 2358 a násl. OZ – licence; § 1746 odst. 2 OZ – služby; § 2586 a násl. OZ – úpravy na zakázku) a rozsah licence k webové aplikaci (§ 65 a 66 autorského zákona).
- [ ] Doživotní licence: doba trvání a vyloučení výpovědi licence podle § 2370 OZ (licence na dobu neurčitou vypověditelná s roční výpovědní dobou; dispozitivní), označení „doživotní“, vazba na placený provoz (§ 1753 OZ – překvapivá ujednání), převod při prodeji závodu a při smrti podnikatele.
- [ ] Ochrana Platformy při podílu kódu vytvořeného s pomocí AI (§ 2 a § 5 autorského zákona; Městský soud v Praze, 10 C 13/2023), obchodní tajemství (§ 504 OZ), práva autorů lidských částí (§ 58, § 61 autorského zákona), licence open source.
- [ ] Jednostranné změny ceny a podmínek (§ 1752 OZ), inflační doložka, strop zvýšení ročního poplatku za provoz.
- [ ] Smlouva uzavíraná adhezním způsobem a slabší strana (§ 433, § 1798–1801 OZ); limitace odpovědnosti (§ 2898 OZ), vyloučení ušlého zisku, sleva za nedostupnost jako jediný nárok.
- [ ] Omezení a pozastavení služby pro neplacení (režim jen pro čtení, pozastavení), dopad na klienty provozovny, export dat bez podmínky úhrady.
- [ ] Nařízení (EU) 2023/2854 (Data Act), kapitola VI: výpovědní doba nejvýše 2 měsíce, přechodné období 30 dní, exportní lhůta nejméně 30 dní, výmaz, výčet exportovatelných dat, bez poplatků za přechod od 12. 1. 2027; výjimka čl. 31; stav návrhu Digital Omnibus.
- [ ] Ukončení provozu Platformy: oznámení, vrácení poměrné části licenčního poplatku, úschova zdrojového kódu a licence k samostatnému provozu (insolvenční zákon), předběžný souhlas s postoupením smlouvy (§ 1895 a násl. OZ).
- [ ] Vyšší moc (§ 2913 odst. 2 OZ) a výluky z dostupnosti při výpadcích dodavatelů.
- [ ] § 1751 OZ (přednost smlouvy, vyloučení obchodních podmínek zákazníka), místní příslušnost (§ 89a o. s. ř.), úrok z prodlení a náklady uplatnění pohledávky (§ 1970 OZ, NV č. 351/2013 Sb.), registr smluv u veřejných zákazníků (zákon č. 340/2015 Sb.).
- [ ] Zkušební období s automatickým přechodem na placený tarif.

**Spotřebitelské právo a obchodní podmínky provozoven**

- [ ] Kvalifikace storno poplatku a poplatku za nedostavení (odstupné § 1992 OZ včetně druhé věty u předplacených termínů / smluvní pokuta §§ 2048–2052 OZ / jiné ujednání) a sjednocení terminologie.
- [ ] Přiměřenost sazeb [50 %] a [100 %] a poplatku [100 %] za nedostavení (§§ 1813–1815 OZ, směrnice 93/13/EHS); riziko, že soud k nepřiměřenému ujednání nepřihlédne vůbec.
- [ ] Transparentnost: zobrazení u tlačítka a zaškrtnutí (I. ÚS 3512/11); rezervace po telefonu a na recepci.
- [ ] Automatické započtení poplatku proti kreditu (VOP čl. 4.6).
- [ ] Propadání předplacené hodnoty – permanentky (čl. 6.7), náhrady (čl. 8.6), kredit (čl. 5.4), odečet bonusu (čl. 5.5).
- [ ] Odstoupení od smlouvy: aktuální znění § 1837 písm. a) a j) a § 1840 OZ; výjimka pro volný čas u masáží a tréninku (SDEU C-96/21) a **zvlášť u kosmetických služeb** (varianta N); u varianty Z výluka § 1840 OZ i pro kredit; § 1823 a § 1834 OZ u permanentek včetně započtení propadlých vstupů; § 1830a OZ od 1. 1. 2027; vzorový formulář podle NV č. 29/2023 Sb. ve znění NV č. 66/2026 Sb.
- [ ] Informační povinnosti při uzavírání smlouvy na dálku a elektronicky (§ 1811, § 1820, § 1826, § 1826a OZ) – zda je vše ve VOP a v potvrzení rezervace.
- [ ] Reklamace (§ 19 zákona č. 634/1992 Sb.), stížnosti na zdravotní služby (§ 93 zákona č. 372/2011 Sb.).
- [ ] ADR u ČOI: aktuální adresa; výluka sporů ze zdravotních služeb (§ 20d zákona č. 634/1992 Sb.); žádný odkaz na zrušenou platformu ODR.
- [ ] Změny podmínek u trvajících vztahů (§ 1752 OZ); nezletilí klienti (věková hranice, zákonný zástupce).
- [ ] Vyváženost: kompenzace při pozdním zrušení provozovnou (čl. 12.3), výjimky z poplatků (čl. 7.6).

**Zdravotnické právo (varianta Z)**

- [ ] Rozsah oprávnění k poskytování zdravotních služeb; hranice mezi zdravotní službou a živností (stanoviska MZ k živnostem bez léčebných tvrzení) – i u provozoven varianty N, které nabízejí služby blízké zdravotním (masáže, cvičení zad).
- [ ] Storno poplatky u fyzioterapie vs. práva pacienta (zákon č. 372/2011 Sb.; §§ 2636–2651 OZ).
- [ ] Pokud by provozovna poskytovala hrazenou péči: zákon č. 290/2025 Sb., metodické stanovisko MZ k platbám pacientů z 8. 10. 2026.
- [ ] Zdravotnická dokumentace mimo Platformu; vyhláška č. 444/2024 Sb. (nahradila vyhlášku č. 98/2012 Sb.) – doba uchování pro fyzioterapii v příloze č. 3.

**Ochrana osobních údajů**

- [ ] Právní základy podle účelů, zejména čl. 9 odst. 2 písm. h) GDPR pro rezervace zdravotních služeb a odvozené zdravotní údaje (SDEU C-184/20, C-21/23); u varianty N nahodilé zdravotní údaje v poznámkách a zdravotní dotazníky na základě výslovného souhlasu.
- [ ] Doby uchování a jejich odůvodnění.
- [ ] Pověřenec (čl. 37 GDPR, recitál 91) a dobrovolné posouzení vlivu (DPIA); záznamy o činnostech zpracování provozovny (čl. 30).
- [ ] Předávání mimo EU: Supabase Pte. Ltd. (Singapur) a Supabase, Inc. (USA) na standardních smluvních doložkách; Cloudflare (Data Privacy Framework, odvolání C-703/25 P); SMS partneři Brevo.
- [ ] Automatické pozastavení online rezervací a čl. 22 GDPR.
- [ ] Cookies a místní úložiště v ostrém nasazení (§ 89 odst. 3 zákona č. 127/2005 Sb.) – ověřit skutečný stav.

**Marketing**

- [ ] Souhlas vs. zákaznická výjimka (§ 7 odst. 2 a 3 zákona č. 480/2004 Sb.), „obdobné služby“.
- [ ] Servisní zprávy bez propagace; žádosti o hodnocení jako obchodní sdělení (ÚOOÚ, kontrolní plán 2026).
- [ ] Náležitosti obchodního sdělení (§ 7 odst. 4); dopad zákona o digitální ekonomice (Sněmovna schválila 4. 11. 2026).

**Smlouva o zpracování**

- [ ] Úplnost podle čl. 28 odst. 3 GDPR; lhůty (ohlášení porušení [24 h], exportní lhůta [60 dní], výmaz [30 dní]) v souladu s licenční smlouvou a Data Act; audity; cena součinnosti.
- [ ] Platformní model – jeden zpracovatel pro mnoho správců: obecné povolení dalších zpracovatelů a důsledek námitky jednoho správce (čl. 7.2), pokyny vyžadující změnu společné infrastruktury (čl. 4.5).
- [ ] Limitace odpovědnosti a pokuty (čl. 13) v souladu s licenční smlouvou (čl. 15).
- [ ] Fio banka jako samostatný správce; posouzení podle zákona č. 370/2017 Sb., o platebním styku.
- [ ] Zákon č. 264/2025 Sb., o kybernetické bezpečnosti – zda se na stranu vztahuje.

## Mimo rozsah těchto návrhů

- **DPH a doklady:** osvobození zdravotních služeb (§ 58 zákona o DPH), sazby u masáží, tréninků a kosmetiky, DPH ze storno poplatků; u Nexum Care okamžik uskutečnění plnění u předplatného a doživotní licence a přeshraniční zákazníci – pro daňového poradce (orientační poznámky v `../business/cenik-a-licence.md`, část 10).
- **Evidence tržeb:** zákon č. 180/2026 Sb. (EET 2.0) od 1. 1. 2027 se týká plateb na recepci provozoven včetně karty a QR kódu; online platby předem a převody mimo něj. Řeší pokladna a daňový poradce.
- Informace o zpracování osobních údajů kontaktních osob zákazníků, kterou vydává Nexum Care jako správce (licenční smlouva čl. 13.5), a obchodní podmínky webu Nexum Care.
- Smlouva o úschově zdrojového kódu se schovatelem (licenční smlouva čl. 19.5 písm. d)).
- Vnitřní řád provozoven, pracovněprávní dokumenty.

## Zdroje a omezení ověření

- Hlavní podklady: `research_notes/Rezervační systém pro fyzioterapii/storno_omluvenky_pravo.md`, `pravo_overeni.md`, `cesky_storno_praxe.md`, `komunikace_integrace.md`, `cesky_trh.md`; `reports/Rezervační systém pro fyzioterapii.md`; `app/docs/PRODUCTION.md`, `app/docs/DEPLOY.md`, `app/docs/ARCHITECTURE.md`; kód enginu v `app/src/engine/` (včetně `presets.ts`), serveru v `app/server/` a schéma v `supabase/migrations/`.
- Ověření k 13. 11. 2026 proběhlo přes vyhledávání a oficiální stránky (uoou.gov.cz, coi.gov.cz, mzd.gov.cz, eur-lex.europa.eu, curia.europa.eu, stránky Supabase, Cloudflare, Brevo a Fio banky). Weby zakonyprolidi.cz a e-sbirka.cz nebyly z tohoto prostředí dostupné – znění zákonů bylo ověřováno z výňatků konsolidovaných znění (krajta.slv.cz, podnikatel.cz, mesec.cz) a musí je zkontrolovat advokát.
- Doplnění k 15. 11. 2026 (licenční smlouva, platformní model): jen vyhledávání a výňatky – podnikatel.cz a kurzy.cz (OZ §§ 1751–1753, 1798–1801, 2358–2370, 2898), komentáře epravo.cz (výpověď licence, jednostranné změny obchodních podmínek, § 1801, § 2898), rozsudek Městského soudu v Praze 10 C 13/2023 (msp.gov.cz), přehledy Data Act (Pinsent Masons, Greenberg Traurig, Bundesnetzagentur) a stav návrhu Digital Omnibus (Komise, Greenberg Traurig, červenec 2026). Weby zakonyprolidi.cz a eur-lex.europa.eu nebyly z tohoto prostředí dostupné.
- Konkrétní odkazy jsou v části „Zdroje“ na konci každého dokumentu.
- Hlavní změny oproti dřívějším podkladům: vyhláška č. 98/2012 Sb. byla od 1. 1. 2025 nahrazena vyhláškou č. 444/2024 Sb.; tlačítko pro odstoupení zavedl zákon č. 159/2026 Sb. s účinností od 1. 1. 2027; platforma ODR byla zrušena k 20. 7. 2025; zákon o digitální ekonomice, který má nahradit zákon č. 480/2004 Sb., schválila Sněmovna 4. 11. 2026 a čeká na Senát; kapitola VI nařízení (EU) 2023/2854 (přechod mezi poskytovateli cloudových služeb) se použije od 12. 9. 2025 a od 12. 1. 2027 zakazuje poplatky za přechod.
