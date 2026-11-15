# Ceník a licenční model – doporučení pro majitele

> **Interní podklad Nexum Care s.r.o. – nejde o právní text, daňovou radu ani závaznou nabídku.** Ceny jsou návrh k ověření na trhu (prvních 5–10 zákazníků); daňové a účetní otázky ověří daňový poradce, smluvní texty advokát. Stav k 15. 11. 2026.
> Smluvní stránka je v [`../legal/licencni-smlouva.md`](../legal/licencni-smlouva.md) (varianta A = předplatné, varianta B = doživotní licence); postup zavedení nového zákazníka v [`onboarding-zakaznika.md`](onboarding-zakaznika.md).

## 1. Doporučení v kostce

1. **Hlavní model je předplatné** (varianta A) ve třech tarifech podle počtu Pracovníků a modulů: **Start 690 Kč**, **Standard 1 390 Kč**, **Profi 2 690 Kč** měsíčně bez DPH. Při roční platbě předem 12 měsíců za cenu 10.
2. **Doživotní licence** (varianta B) jen jako doplňková nabídka: **jednorázově 30× měsíční cena tarifu + roční poplatek za provoz a podporu 4× měsíční cena** (zhruba třetina ročního předplatného). Nikdy bez ročního poplatku – náklady na provoz běží, dokud zákazník Platformu používá.
3. **Onboarding se platí zvlášť** (4 900 Kč základní, 9 900 Kč rozšířený) a úpravy na zakázku hodinovou sazbou (1 490 Kč/h).
4. **Průběžné náklady se přeúčtovávají:** SMS podle počtu, poplatky za odesílatele SMS, e-maily nad limit.
5. **Zkušební verze 30 dní zdarma** – nejlépe na ukázkových datech; skutečná data klientů až po podpisu smlouvy o zpracování.
6. **Slevy jen časově omezené a písemně**; doživotní licenci nezlevňujte pod 24× měsíční cenu.
7. **Export dat je vždy zdarma** (vyžaduje nařízení (EU) 2023/2854, od 12. 1. 2027 bez jakýchkoli poplatků za přechod) – nepočítejte s ním jako s příjmem.

## 2. Z čeho cena vychází

### 2.1 Náklady (orientačně, ověřit podle aktuálních ceníků)

| Položka | Kolik stojí | Poznámka |
|---|---|---|
| Supabase (databáze, přihlášení, server, zálohy) | tarif Pro 25 USD měsíčně za organizaci; další projekty platí výpočetní instanci | bezplatný tarif nemá zálohy a uspává projekt – pro ostrý provoz nestačí (`app/docs/DEPLOY.md`) |
| Cloudflare Pages (web aplikace) | zdarma | ověřit limit vlastních domén v jednom projektu – u desítek zákazníků s vlastní doménou může být potřeba placené řešení pro vlastní hostitelská jména |
| Brevo – e-maily | zdarma do 300 e-mailů denně; placené tarify od jednotek až desítek USD měsíčně podle objemu | jedna provozovna s ~300 rezervacemi měsíčně pošle zhruba 600–1 000 servisních e-mailů měsíčně (potvrzení, připomínky, platby) |
| SMS v ČR | nákupní cena u bran zhruba 0,41–1,30 Kč bez DPH za SMS; u Brevo ověřit | zpráva s diakritikou má jen 70 znaků na část, bez diakritiky 160 – účtuje se každá část |
| Odesílatel SMS (Sender ID) | u některých bran registrace 350–550 Kč a 100–550 Kč měsíčně bez DPH | schválení operátory trvá zhruba 2 týdny |
| Monitoring dostupnosti | bezplatný tarif (např. kontrola `/api/health` každých 5 minut) | podklad pro SLA (Příloha 3 licenční smlouvy) |
| Podpora, onboarding, aktualizace | **čas majitele / vývojáře – největší náklad** | počítejte i s úpravami kvůli změnám zákonů (např. tlačítko pro odstoupení od 1. 1. 2027) |

> **Všichni zákazníci běží na jednom sdíleném nasazení:** provozovny zakládáte v konzoli `/platforma`, token Fio má každá provozovna vlastní (šifrovaně) a e-maily odcházejí z jedné ověřené adresy platformy se jménem provozovny. Náklady na infrastrukturu jsou proto v řádu desítek korun za zákazníka měsíčně. Samostatný projekt Supabase počítejte jen u zákazníka, který chce vlastní hosting (stejný kód s jedinou provozovnou – viz `../PLATFORM.md`).

Ceny dodavatelů: `app/docs/DEPLOY.md` (Supabase, Cloudflare, Brevo) a `research_notes/Rezervační systém pro fyzioterapii/komunikace_integrace.md` (SMS brány a odesílatelé, data z října 2026). Všechny údaje ověřte na aktuálních cenících.

### 2.2 Trh (ceny konkurence z rešerše 14. 10. 2026, bez záruky aktuálnosti)

| Systém | Měsíční cena | Co z toho plyne |
|---|---|---|
| Reservanto | Lite 166 Kč, Professional 499 Kč, Premium 1 249 Kč (bez DPH) | jediný obecný systém s permanentkami, kreditem a náhradami v jednom; náš přímý srovnávací bod |
| Reservio | zhruba 199 / 399 / 799 Kč (bez DPH, při roční platbě; zdroje se rozcházejí) | levný, silný v marketplace; bez omluvenek a čekací listiny |
| MyFox | 229 / 359 / 899 Kč (vč. DPH); další pracovník 150 Kč bez DPH | cena podle počtu pracovníků je na trhu běžná |
| Fyzion | 587 / 757 / 1 012 Kč za fyzioterapeuta (bez DPH) | fyzioterapeuti jsou zvyklí platit za každého terapeuta |
| Noona, Bookio | zhruba 200–500 Kč, resp. 0–62 € | levné obecné systémy |
| SMS u konkurence | 1,0–1,5 Kč za SMS | strop pro naši prodejní cenu SMS |

Zdroj: `research_notes/Rezervační systém pro fyzioterapii/cesky_trh.md`.

### 2.3 Čím se Platforma liší (proč nemusí být nejlevnější)

- **Vlastní značka a adresa** (white-label) – provozovna vystupuje pod svým jménem, ne na cizím marketplace.
- **Permanentky, kredit, omluvenky s náhradními termíny, čekací listina a skupinové lekce v jednom** – jinde se kombinují dva systémy.
- **Česká právní připravenost** – vzorové obchodní podmínky a informace o zpracování údajů pro zdravotní i nezdravotní obor, tlačítko pro odstoupení, storno pravidla platná v době rezervace, data v EU.
- **Nastavení na míru oboru** – šablony fyzio, masáže, fitness, kosmetika.

## 3. Navržené tarify – předplatné (varianta A)

| | **Start** | **Standard** | **Profi** | **Síť / na míru** |
|---|---|---|---|---|
| Pro koho | samostatný terapeut, masér, trenér, kosmetička | menší studio nebo klinika | větší provozovna | více provozoven |
| Pracovníci (s vlastním rozvrhem) | do 2 | do 6 | do 15 | individuálně |
| Provozovny | 1 | 1 | do 2 | 3 a více |
| Moduly | rezervace a klientský portál, storno pravidla a omluvenky, čekací listina, QR platby, e-mailové zprávy | + permanentky, kredit, skupinové lekce, kampaně, párování plateb Fio | vše | vše |
| E-maily v ceně | 1 000 měsíčně | 5 000 měsíčně | 15 000 měsíčně | individuálně |
| Vlastní doména | za poplatek v onboardingu | za poplatek v onboardingu | v ceně | v ceně |
| Označení „Provozováno na platformě …“ | ano | ano | lze vypnout | lze vypnout |
| Podpora (Příloha 3) | e-mail | e-mail | e-mail a telefon, prioritní | podle dohody |
| **Cena měsíčně bez DPH** | **690 Kč** | **1 390 Kč** | **2 690 Kč** | od 2 690 Kč + 690 Kč za každou další provozovnu |
| Při roční platbě předem | 6 900 Kč | 13 900 Kč | 26 900 Kč | individuálně |
| Další Pracovník nad limit | 190 Kč měsíčně | 190 Kč měsíčně | 190 Kč měsíčně | – |

Proč takto:

- **Počet Pracovníků** je měřítko, kterému provozovny rozumějí (platí tak u MyFox i Fyzion) a které Platforma umí spočítat (aktivní členové týmu s rozvrhem). Účty recepce se nepočítají – jinak by provozovny sdílely přístupy.
- **Moduly odlišují tarify** – permanentky, kredit a skupinové lekce jsou to, co jinde chybí; nechte je ve Standardu, ať je Start levný vstup.
- **Začněte spíš výš** a dávejte časově omezené slevy – zdražovat stávajícím zákazníkům je těžší než slevy rušit.
- Tarif „Síť“ nabízejte až ve chvíli, kdy Platforma umí více provozoven pod jedním účtem; do té doby jde o samostatná prostředí.

## 4. Doživotní licence (varianta B)

### 4.1 Vzorec

- **Licenční poplatek (jednorázově) = 30 × měsíční cena tarifu** (2,5 roku předplatného).
- **Poplatek za provoz a podporu (ročně) = 4 × měsíční cena tarifu** (zhruba 33 % ročního předplatného).
- **[VARIANTA B1]** první rok provozu je v licenčním poplatku, roční poplatek se platí od 13. měsíce.
- **[VARIANTA B2]** provoz je zahrnut na N let: licenční poplatek se zvýší o (N − 1) ročních poplatků. Pro N = 3: 30 × + 2 × 4 × měsíční cena = 38 × měsíční cena.

| Tarif | Licenční poplatek (B1) | Roční poplatek za provoz | B2 – provoz zahrnut na 3 roky |
|---|---|---|---|
| Start | 20 700 Kč | 2 760 Kč | 26 220 Kč, od 4. roku 2 760 Kč ročně |
| Standard | 41 700 Kč | 5 560 Kč | 52 820 Kč, od 4. roku 5 560 Kč ročně |
| Profi | 80 700 Kč | 10 760 Kč | 102 220 Kč, od 4. roku 10 760 Kč ročně |

### 4.2 Proč roční poplatek za provoz

- **Náklady běží, dokud zákazník Platformu používá:** hosting a zálohy, e-maily, monitoring, bezpečnostní aktualizace, podpora a úpravy kvůli změnám předpisů. Bez ročního poplatku je každý doživotní zákazník po několika letech čistou ztrátou, která s počtem zákazníků roste.
- Platforma je služba, ne program na disku – bez provozu ji zákazník nemůže použít. Licenční smlouva to říká výslovně (článek 3.5 písm. d)); zákazník to musí slyšet už při prodeji.
- Roční poplatek se smí zvyšovat jen o inflaci a navíc nejvýše o sjednaný strop (článek 10.3) – zákazník tak má jistotu, že ho zaplacená licence „neuzamkne“ u nepřiměřených cen.

### 4.3 Kdy se zákazníkovi vyplatí (příklad tarif Standard)

| Celkem zaplaceno za | Měsíčně (1 390 Kč) | Ročně předem (13 900 Kč) | Doživotní B1 | Doživotní B2 (3 roky v ceně) |
|---|---|---|---|---|
| 1 rok | 16 680 Kč | 13 900 Kč | 41 700 Kč | 52 820 Kč |
| 3 roky | 50 040 Kč | 41 700 Kč | 52 820 Kč | 52 820 Kč |
| 5 let | 83 400 Kč | 69 500 Kč | 63 940 Kč | 63 940 Kč |
| 10 let | 166 800 Kč | 139 000 Kč | 91 740 Kč | 91 740 Kč |

- Oproti měsíční platbě se doživotní licence zákazníkovi vyplatí po **3 letech a 3 měsících**, oproti roční platbě po **4 letech a 4 měsících** (stejně u všech tarifů, protože vzorec je násobkem měsíční ceny).
- Pro Nexum Care platí obráceně: doživotní licence převede zhruba 2,5 roku příjmů do jedné platby předem. Zůstal-li by zákazník na předplatném kratší dobu než zhruba 3 roky, vydělá Nexum Care na doživotní licenci víc; zůstane-li déle, méně.

### 4.4 Pojistky pro Nexum Care

- **Omezte počet doživotních licencí** – např. jen pro prvních [10] „zakládajících“ zákazníků nebo nejvýše [20 %] zákazníků. Opakované příjmy z předplatného jsou to, co platí provoz a vývoj.
- **Doživotní licenci nabízejte jen pro Start a Standard**; rozšíření (další Pracovníci, provozovna) účtujte podle aktuálního ceníku.
- **Rezerva na závazky:** pokud ve smlouvě zvolíte vrácení poměrné části licenčního poplatku při ukončení Platformy do 5 let (článek 19.4), držte část příjmu jako rezervu – závazek klesá o 1/60 měsíčně.
- **Úschova zdrojového kódu** (článek 19.5) stojí peníze a čas (aktualizace každých 6 měsíců) – nabízejte ji jako placenou volbu nebo jen u Profi.
- **Dodržujte výpovědní lhůty**: ukončení Platformy u doživotních zákazníků oznámení 12 měsíců předem.

## 5. Onboarding, import a úpravy na zakázku

| Služba | Návrh ceny bez DPH | Co obsahuje |
|---|---|---|
| Onboarding základní | 4 900 Kč | zřízení prostředí, šablona oboru, vzhled (logo, barva), adresa `/<označení>`, služby a tým (do 20 služeb a 6 Pracovníků), storno pravidla podle obchodních podmínek, 1 hodina školení online, předání vzorových právních textů |
| Onboarding rozšířený | 9 900 Kč | základní + import klientů, permanentek a kreditu z CSV/Excelu, vlastní doména, ověření odesílací domény e-mailů, registrace odesílatele SMS, nastavení párování Fio, 2× školení |
| Import dat nad rozsah | 1 490 Kč/h | čištění dat, nestandardní formáty, více zdrojů |
| Úpravy na zakázku | 1 490 Kč/h | podle specifikace a odhadu (Příloha 4 licenční smlouvy) |
| Školení a konzultace nad rozsah | 990 Kč/h | noví pracovníci, opakované školení |
| Obnovení po pozastavení | 990 Kč | jen po pozastavení pro neplacení (článek 11.8) |

- Úpravy na zakázku se stávají součástí Platformy pro všechny (článek 4.2 smlouvy). Je-li úprava užitečná i ostatním, zvažte **sdílený vývoj**: zákazník zaplatí jen [50 %] odhadu, protože z úpravy těží celá Platforma.
- Onboarding fakturujte hned po podpisu; bez zaplacení nespouštějte ostrý provoz.

## 6. Průběžné náklady, které se přeúčtovávají

| Položka | Návrh prodejní ceny bez DPH | Poznámka |
|---|---|---|
| SMS (každá část zprávy) | 1,50–1,90 Kč | nákupní cenu u Brevo ověřit; šablony SMS raději bez diakritiky (160 znaků místo 70) |
| Odesílatel SMS (Sender ID) | registrace 990 Kč jednorázově + poplatky operátorů 1:1 | bez schváleného odesílatele SMS neodcházejí |
| E-maily nad objem tarifu | 50 Kč za každých započatých 1 000 e-mailů | týká se hlavně kampaní |
| Vlastní doména | nastavení v onboardingu | doménu si zákazník platí sám u svého registrátora |
| Párování plateb Fio | v tarifu Standard a Profi zdarma; nastavení 990 Kč v tarifu Start | token platí nejdéle 180 dní – obnovu hlídá zákazník, Nexum Care připomíná |

SMS je nejlepší účtovat **měsíčně zpětně podle skutečného počtu** (Platforma zná stav doručení každé zprávy), nebo jako předplacený kredit SMS u menších zákazníků.

## 7. Zkušební verze

- **30 dní zdarma** (konkurence 14–30 dní).
- **Cesta A – zkouška bez smlouvy** (doporučená pro nové zájemce): prostředí s ukázkovými daty, bez SMS, bez skutečných klientů. Na konci nabídka smlouvy; bez ní se prostředí smaže.
- **Cesta B – zkušební období ve smlouvě** (článek 7 licenční smlouvy): pro zájemce, kteří chtějí zkoušet na skutečném provozu. Smlouva i smlouva o zpracování se podepisují předem; bez výpovědi Smlouva po 30 dnech pokračuje placeným tarifem. Před koncem zkoušky zákazníkovi připomeňte, kdy končí (článek 7.4).
- V Platformě odpovídá zkoušce plán `trial` s Platností licence do konce zkoušky.

## 8. Slevy

| Sleva | Návrh | Pravidla |
|---|---|---|
| Roční platba předem | 12 měsíců za cenu 10 (≈ 17 %) | automaticky |
| Zakládající zákazníci | −30 % na 12 měsíců | prvních [10] zákazníků výměnou za referenci a zpětnou vazbu; písemně s datem konce |
| Více provozoven | −10 % od třetí provozovny | jen v tarifu Síť |
| Neziskové organizace | −20 % | na žádost, s doložením |

Slevy vždy **časově omezené a uvedené v Příloze 1 smlouvy** s datem konce. Doživotní licenci nezlevňujte pod 24× měsíční cenu tarifu.

## 9. Jak se stav licence promítá do Platformy

Platforma vynucuje licenci technicky: plán (zkušební / měsíční / roční / doživotní), Platnost licence („platnost do“), 14denní ochranná lhůta s upozorněním, poté režim jen pro čtení (data vidět a exportovat, nové rezervace ne) a pozastavení provozovatelem. Smluvně to upravuje článek 11 licenční smlouvy.

| Situace | Plán | Platnost do | Co se v Platformě děje | Co dělá Nexum Care |
|---|---|---|---|---|
| Zkouška | `trial` | konec zkoušky (30 dní) | plný provoz s omezeními zkoušky; majitel vidí upozornění 14 dní před koncem | připomene konec 7 dní předem (podklad: denní e-mail s přehledem licencí) |
| Předplatné měsíční | `monthly` | konec zaplaceného měsíce | plný provoz | po připsání platby prodlouží o měsíc |
| Předplatné roční | `yearly` | konec zaplaceného roku | plný provoz | po připsání platby prodlouží o rok |
| Doživotní licence | `lifetime` | konec zaplaceného nebo zahrnutého roku provozu | plný provoz | po zaplacení ročního poplatku prodlouží o rok |
| Nezaplaceno – dny 1 až 14 po Platnosti | beze změny | uplynulo | **ochranná lhůta:** plný provoz, majitel vidí upozornění | upomínka 1. a 7. den, poslední upozornění 14. den |
| Od 15. dne | beze změny | uplynulo | **režim jen pro čtení:** data vidět a exportovat, nové rezervace nejdou | oznámí zákazníkovi, ať informuje klienty |
| Režim jen pro čtení 30 dní (od 45. dne) | beze změny | uplynulo | **pozastavení** (ručně v konzoli, po upozornění 7 dní předem): tým ani klienti se nepřihlásí, automatika neběží; majitel data jen prohlíží a exportuje (Nastavení → Export dat) | s exportem na žádost pomůže do 5 pracovních dnů – i bez zaplacení |
| 60 dní po Platnosti | – | – | – | může od smlouvy odstoupit (A), u B ukončit jen provoz |
| Po skončení smlouvy | – | – | 60 dní jen pro čtení pro majitele (export), potom výmaz do 30 dní | potvrzení o výmazu |
| Pozastavení z jiného důvodu | beze změny | – | zablokování v nezbytném rozsahu (bezpečnost, spam, úřední příkaz) | informuje zákazníka a důvod |

> U plánu `lifetime` se v konzoli zadává „Provoz a podpora zaplaceny do“ (výchozí +1 rok, prodloužení „+ rok“); po tomto datu platí stejné lhůty jako u předplatného. Bez data je provoz neomezený (vlastní hosting). Ve smlouvě i v tomto přehledu držte stejné lhůty jako v kódu (`app/src/api/license.ts`: upozornění 14 dní předem, ochranná lhůta 14 dní).

## 10. Fakturace a DPH

- **Nexum Care je plátce DPH.** Ve smlouvě a v Příloze 1 uvádějte ceny bez DPH; v nabídce pro neplátce uvádějte i cenu s DPH. Sazbu (dnes 21 % – základní) ověří daňový poradce.
- **Pro řadu zákazníků je DPH skutečný náklad:** zdravotní služby jsou od DPH osvobozené (§ 58 zákona o DPH), takže fyzioterapeutická pracoviště si daň zpravidla neodečtou; totéž malí podnikatelé, kteří nejsou plátci (maséři, trenéři, kosmetičky).
- **Splatnost 14 dní.** Předplatné fakturujte nejpozději 14 dní před začátkem období (splatnost pak vychází na konec předchozí Platnosti licence); roční poplatek za provoz 30 dní předem. Variabilní symbol = číslo faktury.
- **Okamžik uskutečnění plnění** u předplatného (dílčí plnění za období), u jednorázového licenčního poplatku a u předplaceného provozu (varianta B2) – ověří daňový poradce. Daňová povinnost vzniká dnem uskutečnění plnění nebo přijetí úplaty, podle toho, co nastane dříve.
- **Účetnictví:** u varianty B2 se část jednorázového poplatku týká provozu v dalších letech – časové rozlišení výnosů ověří účetní.
- **Zákazníci z jiných států EU** (např. Slovensko): služba podnikateli se zdaňuje v zemi zákazníka (přenesení daňové povinnosti), Nexum Care podává souhrnné hlášení – ověří daňový poradce.
- **Veřejní zákazníci** (např. obecní sportoviště) mohou podléhat registru smluv (zákon č. 340/2015 Sb.) – smlouva je účinná až uveřejněním.
- **Upomínky sladěné se smlouvou:**

| Den | Krok |
|---|---|
| −14 | faktura za další období (splatnost 14 dní) |
| 0 | splatnost = konec Platnosti licence |
| +1 | upomínka 1, začíná ochranná lhůta (dny 1–14), majitel vidí upozornění v administraci |
| +7 | upomínka 2 |
| +14 | poslední upozornění: zítra režim jen pro čtení |
| +15 | režim jen pro čtení |
| +38 | upozornění na pozastavení za 7 dní |
| +45 | pozastavení (ručně), nejdříve po 30 dnech režimu jen pro čtení |
| +60 | možnost odstoupit od smlouvy (A) / ukončit provoz (B); potom exportní lhůta a výmaz |

## 11. Srovnání pro zákazníka: měsíčně, nebo doživotně

| | Předplatné (varianta A) | Doživotní licence (varianta B) |
|---|---|---|
| Vstupní náklad | nízký – první měsíc a onboarding | vysoký – 30× měsíční cena a onboarding |
| Náklad za 5 let (Standard) | 83 400 Kč (ročně 69 500 Kč) | 63 940 Kč |
| Flexibilita | výpověď kdykoli s měsíční výpovědní dobou | provoz lze vypovědět, zaplacená licence se nevrací |
| Změna tarifu | kdykoli nahoru i dolů | rozšíření za doplatek podle ceníku |
| Aktualizace a nové funkce | v ceně | v ceně, dokud se platí roční poplatek za provoz |
| Podpora | podle tarifu | v rozsahu ročního poplatku, nad něj hodinovou sazbou |
| Cenová jistota | inflační doložka, jiné změny s právem vypovědět | licence se už nemění; roční poplatek jen o inflaci + strop |
| Když Nexum Care Platformu ukončí | oznámení 6 měsíců předem, export zdarma | oznámení 12 měsíců předem, export zdarma, [vrácení poměrné části do 5 let], [úschova kódu] |
| Pro koho | většina provozoven, zvlášť nové a malé | stabilní provozovny, které počítají s Platformou na roky a chtějí jednorázový výdaj |

## 12. Riziko pro Nexum Care

| | Předplatné | Doživotní licence |
|---|---|---|
| Peníze | rovnoměrný měsíční příjem | velký příjem předem, potom jen roční poplatek |
| Odchod zákazníků | zákazník může odejít kdykoli | nízký – zákazník už zaplatil |
| Náklady na provoz a podporu | kryté předplatným | musí je krýt roční poplatek; podpora nad rámec hodinovou sazbou |
| Závazek | výpověď s 3měsíční výpovědní dobou | Licenci nelze vypovědět; ukončení Platformy jen pro všechny s 12měsíčním oznámením |
| Očekávání zákazníka | „platím, dostávám“ | „zaplatil jsem doživotně“ – riziko sporů o rozsah podpory a nových funkcí |
| Hlavní pojistky | inflační doložka, § 1752 OZ | roční poplatek se stropem, omezený počet licencí, rezerva na vrácení, jasný text článku 3.5 |

## Zdroje

- Ceny konkurence a SMS: `research_notes/Rezervační systém pro fyzioterapii/cesky_trh.md` (data z 14. 10. 2026), `research_notes/Rezervační systém pro fyzioterapii/komunikace_integrace.md`.
- Náklady na infrastrukturu a nasazení: `app/docs/DEPLOY.md`, `app/docs/PRODUCTION.md`.
- Smluvní rámec: `app/docs/legal/licencni-smlouva.md` (zejména články 3.5, 9–11, 17–19 a Přílohy 1 a 3), `app/docs/legal/smlouva-o-zpracovani.md`.
- Data Act – přechod mezi poskytovateli bez poplatků od 12. 1. 2027: https://www.pinsentmasons.com/out-law/guides/switching-porting-rules-eu-data-act
