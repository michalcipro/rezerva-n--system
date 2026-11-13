# Texty do aplikace – souhlasy, storno shrnutí, patička newsletteru, QR platba

> **PRACOVNÍ NÁVRH K PRÁVNÍ KONTROLE – NEPOUŽÍVAT BEZ POSOUZENÍ ADVOKÁTEM.**
> Krátké texty, které mají být v aplikaci, aby odpovídala obchodním podmínkám (`obchodni-podminky.md`) a informacím o zpracování osobních údajů (`zasady-ochrany-osobnich-udaju.md`). Stav k 13. 11. 2026.
>
> - `{proměnná}` – hodnotu doplní systém (např. datum, částka).
> - `[hodnota]` – nastavení, které klinika potvrdí; musí odpovídat aplikaci (výchozí hodnoty z `app/src/engine/defaults.ts`).
> - [Obchodní podmínky], [Informace o zpracování osobních údajů] – odkaz na příslušný dokument.
> - Žádné zaškrtávací políčko nesmí být předem zaškrtnuté.

---

## A. Registrace v klientském portálu

**Kde:** formulář pro založení účtu (ostrá verze s přihlášením).

Pole: Jméno · Příjmení · E-mail · Telefon *(nepovinné – „pro SMS připomínky“)* · Datum narození *(nepovinné – „pomůže nám odlišit klienty se stejným jménem“)*

**Zaškrtávací políčka:**

1. ☐ **Souhlasím s [obchodními podmínkami], včetně storno podmínek.** *(povinné)*
   Pod políčkem, bez zaškrtávání:
   > Vaše osobní údaje zpracováváme, abychom vám mohli vést účet a poskytovat objednané služby. Podrobnosti najdete v [Informacích o zpracování osobních údajů].

   *Volitelně místo věty:* ☐ „Seznámil/a jsem se s [Informacemi o zpracování osobních údajů].“ – jde jen o potvrzení, že klient informace dostal, **ne o souhlas se zpracováním**.

2. ☐ **Chci dostávat SMS připomínky termínů.** *(nepovinné)*
   > SMS posíláme jen k vašim termínům: připomínku před termínem, změnu nebo zrušení termínu a nabídku uvolněného termínu z čekací listiny. Nejde o reklamu. Bez SMS vám vše pošleme e-mailem. Volbu můžete kdykoli změnit v účtu.

3. ☐ **Chci dostávat novinky a nabídky kliniky e-mailem.** *(nepovinné)*
   > Občas (nejvýše [2×] měsíčně) vám pošleme tipy na cvičení, novinky a akce kliniky. Souhlas můžete kdykoli odvolat odkazem v každém e-mailu nebo v účtu.

   *[VARIANTA – zákaznická výjimka, vyžaduje úpravu systému:]* místo políčka 3 zobrazit
   ☐ **Nechci dostávat novinky a nabídky kliniky e-mailem.**
   > Jako našemu klientovi vám můžeme občas poslat nabídku našich obdobných služeb. Pokud o to nestojíte, zaškrtněte políčko. Odhlásit se můžete i později v každém e-mailu.

Tlačítko: **Vytvořit účet**

**Co systém uloží:** ke každé volbě datum a čas, zdroj („online formulář“) a verzi textu (např. `registrace-v1`). Systém dnes ukládá čas a zdroj, verzi textu zatím ne.

> **Pro Nexum Care:** V administraci i v enginu je dnes povinný „souhlas `gdpr`“ (bez něj nelze klienta založit). Právně to není souhlas – údaje pro rezervace se zpracovávají na základě smlouvy. Políčko přejmenovat na potvrzení podle bodu 1, nebo ho vázat na přijetí obchodních podmínek, a nepopisovat ho jako souhlas.

### A2. Založení klienta na recepci (administrace)

- ☐ **Klient dostal informace o zpracování osobních údajů a souhlasí s obchodními podmínkami** *(v tištěné podobě nebo odkazem e-mailem)*. *(povinné pro personál)*
- ☐ **SMS připomínky termínů** – stejný popis jako výše.
- ☐ **Novinky a nabídky e-mailem** – nápověda pro personál: „Zaškrtněte jen tehdy, když klient souhlas výslovně udělil. Do karty se uloží datum a zdroj ‚recepce‘.“

### A3. Účet → Souhlasy a soukromí

| Položka | Zapnuto | Vypnuto |
|---|---|---|
| Údaje pro rezervace *(zamčeno)* | „Zpracováváme je, protože bez nich vám nemůžeme rezervace a služby poskytovat. Nejde o souhlas, proto se nedá vypnout přepínačem. Účet a údaje můžete nechat zrušit (níže).“ | – |
| SMS zprávy | „Připomínky termínů a nabídky z čekací listiny vám posíláme i SMS na {telefon}.“ | „Servisní zprávy vám posíláme jen e-mailem.“ |
| Novinky a nabídky e-mailem | „Posíláme vám novinky a nabídky. Souhlas udělen {datum} ({zdroj}).“ | „Novinky a nabídky vám neposíláme.“ |

> **Pro Nexum Care:** Přepínač „Zdravotní dokumentace“ (souhlas `health`) při vypnutých klinických poznámkách skrýt. Je-li klinika poskytovatelem zdravotních služeb, nestojí zdravotnická dokumentace na souhlasu, ale na zákonné povinnosti.

Odkazy pod přepínači:

- **Stáhnout moje údaje** – „Připravíme vám soubor se všemi údaji, které o vás v rezervačním systému máme (formát JSON nebo CSV).“
- **Zrušit účet a vymazat údaje** – potvrzovací dialog:
  > Účet zrušíme a vaše údaje vymažeme nebo anonymizujeme do [30 dnů]. Údaje, které musíme uchovat ze zákona (např. účetní záznamy), si ponecháme jen po nezbytnou dobu. Nadcházející termíny nejdřív zrušte podle storno podmínek. Nevyčerpaný kredit vám vrátíme na bankovní účet: {pole pro číslo účtu}.

---

## B. Storno shrnutí před potvrzením rezervace

**Kde:** poslední krok průvodce rezervací (`TermsBox` v `app/src/portal/payment.tsx`, text skládá `termsInfo` v `app/src/portal/logic.ts`) a potvrzení nabídky z čekací listiny (`WaitlistOffer.tsx`). Text se skládá z nastavení konkrétního termínu, takže klient vidí přesné časy a částky.

### B1. Individuální služba v bezplatné lhůtě

**Storno podmínky tohoto termínu**

- Zdarma zrušíte nebo přesunete do **{storno_do}**.
- Od {storno_do} do {stupeň_2_od}: storno [50 %] ceny ({částka_50}). Později: [100 %] ceny ({částka_100}).
- Onemocníte? Termín omluvíte bez poplatku nejpozději **{omluva_do}** – zbývá vám {zbývá} z {celkem} omluvenek. Za předplacený termín si pak vyberete náhradní do {náhrada_do}.
- Když nepřijdete bez omluvy: [100 %] ceny ({částka_100}).
- Termín je sjednán na konkrétní datum a čas, proto u něj neplatí 14denní lhůta pro odstoupení od smlouvy. Místo ní platí tyto storno podmínky.
  *(U zdravotních služeb: „U zdravotních služeb se 14denní lhůta pro odstoupení od smlouvy neuplatní. Platí tyto storno podmínky.“)*

[Celé obchodní podmínky]

☐ **Souhlasím se storno podmínkami tohoto termínu a s [obchodními podmínkami].** *(povinné, nezaškrtnuté)*

Tlačítko podle způsobu platby:

| Platba | Text tlačítka |
|---|---|
| na místě, QR platbou | **Závazně rezervovat s povinností platby** |
| z kreditu | **Závazně rezervovat a zaplatit z kreditu ({cena})** |
| z permanentky | **Závazně rezervovat – vstup z permanentky {název}** |
| náhradní termín | **Závazně rezervovat náhradní termín** |

**Příklad s výchozím nastavením** – Fyzioterapie 45 min, čt 19. 11. v 9:00, 1 190 Kč, platba na místě:

- Zdarma zrušíte nebo přesunete do st 18. 11. 9:00.
- Od st 18. 11. 9:00 do st 18. 11. 21:00: storno 50 % ceny (595 Kč). Později: 100 % ceny (1 190 Kč).
- Onemocníte? Termín omluvíte bez poplatku nejpozději ve čt 19. 11. v 7:00 – zbývá vám 1 z 1 omluvenky.
- Když nepřijdete bez omluvy: 100 % ceny (1 190 Kč).
- U zdravotních služeb se 14denní lhůta pro odstoupení od smlouvy neuplatní. Platí tyto storno podmínky.

### B2. Varianty jednotlivých řádků

| Situace | Text řádku |
|---|---|
| Platba z permanentky (`packageLateHandling = forfeit_entry`) | „Při pozdějším zrušení propadá vstup z permanentky {název}.“ |
| Skupinová lekce | „Zdarma se odhlásíte do {storno_do} ([6 h] předem). Později vstup propadá, případně platíte [100 %] ceny ({částka}).“ |
| Rezervace až po uplynutí bezplatné lhůty | „Do začátku zbývá méně než [24 h] – bezplatné zrušení už neplatí. Rezervace je hned závazná: při zrušení zaplatíte {poplatek} ({částka}).“ |
| Omluvenky vyčerpané | „Omluvenky k tomuto termínu už nemáte – při pozdním zrušení platí poplatek.“ |
| Náhradní termín | „Náhradní termín už nelze znovu omluvit. Při pozdním zrušení nebo nedostavení náhrada propadá.“ |
| Nabídka z čekací listiny (první řádek) | „Nabídka platí do {nabídka_do}. Termín získá ten, kdo potvrdí první.“ |
| QR platba | „Zaplaťte do {splatnost}. [Pokud platba nedorazí, rezervace platí dál a zaplatíte na místě.]“ |

> **K ověření právníkem:** Text tlačítka podle § 1826a odst. 2 OZ („objednávka zavazující k platbě“ nebo jiná jednoznačná formulace) – zda „Závazně rezervovat s povinností platby“ vyhovuje i u rezervací, kde se platí až na místě, a zda je nutné stejné označení u rezervace z permanentky (povinnost platit může vzniknout jen při pozdním zrušení). Rezervace po telefonu: klient nic nezaškrtává – storno pravidlo přečíst a poslat v potvrzení (část C).

---

## C. Servisní zprávy – doporučené úpravy šablon

Šablony jsou v `app/src/engine/messages.ts` (Komunikace → Šablony). V šablonách se proměnné zapisují do hranatých závorek, např. [storno_do] – tak je to v systému. Servisní zprávy nesmějí obsahovat nic, co klienta pobízí k nákupu nebo k využití dalších služeb – jinak je ÚOOÚ posuzuje jako obchodní sdělení.

| Šablona | Doporučení |
|---|---|
| Potvrzení rezervace (`booking_confirmation`) | Doplnit stupně poplatků a odkaz na podmínky: „Termín můžete zdarma zrušit nebo přesunout do [storno_do]. Později se účtuje storno podle [obchodních podmínek]: [stupně]. Při nemoci můžete termín omluvit nejpozději [omluva_do].“ – nezbytné hlavně u rezervací z recepce a po telefonu. |
| Připomínka (`reminder`) | Posílat dřív, než skončí bezplatná lhůta (např. `reminders.hoursBefore = [48]`), a doplnit „Zdarma zrušíte do [storno_do].“ (proměnná `storno_do` je dnes k dispozici jen u potvrzení). |
| Permanentka: poslední vstupy (`package_low`) | Vypustit větu „Novou si můžete koupit na recepci nebo v aplikaci.“ – je to výzva k nákupu. Ponechat: „Na permanentce [permanentka] vám zbývají [zbývá] (platnost do [platnost_do]).“ |
| Permanentka brzy končí (`package_expiring`) | „Platnost permanentky [permanentka] končí [platnost_do] a zbývají vám [zbývá]. Termíny si můžete rezervovat v aplikaci. Pokud permanentku nemůžete vyčerpat kvůli nemoci, ozvěte se – platnost prodloužíme podle obchodních podmínek.“ |
| Po návštěvě (`after_visit`) | Žádost o hodnocení je podle ÚOOÚ obchodní sdělení (kontrolní plán 2026). Buď šablonu posílat jen klientům se souhlasem s obchodními sděleními, označit ji a doplnit odhlášení (část D), nebo ji vypnout. |
| Reaktivace, Narozeniny (`reactivation`, `birthday`) | Obchodní sdělení – systém je už dnes posílá jen se souhlasem; doplnit patičku podle části D. |

---

## D. Patička newsletteru a dalších obchodních sdělení

**Označení:** v předmětu nebo na prvním řádku (preheader) uvést „Obchodní sdělení“, případně „Novinky kliniky [NÁZEV] – obchodní sdělení“.

**Patička:**

> Toto je obchodní sdělení od [NÁZEV KLINIKY], [SÍDLO], IČO [IČO].\
> Posíláme vám ho, protože [jste se přihlásil/a k odběru novinek] [jste naším klientem a zasílání novinek jste neodmítl/a].\
> **[Odhlásit odběr]** – odhlášení je zdarma a stačí jedno kliknutí. Můžete také odpovědět na tento e-mail nebo napsat na [E-MAIL].\
> Servisní zprávy k vašim rezervacím (potvrzení, připomínky) budete dostávat dál.\
> Jak zpracováváme vaše údaje: [Informace o zpracování osobních údajů]

**Stránka po odhlášení:**

> Odhlášení proběhlo. Novinky a nabídky vám už posílat nebudeme. Servisní zprávy k vašim rezervacím (potvrzení, připomínky, změny termínů) budete dostávat dál. Pokud jste se odhlásil/a omylem, můžete se znovu přihlásit v účtu.

**Technické požadavky:** hlavičky `List-Unsubscribe` a `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058); odhlášení zpracovat ihned, nejpozději do 2 dnů (požadavek Gmailu a Yahoo); odhlášený kontakt systém tvrdě blokuje pro všechny kampaně; odesílatelem musí být identifikovatelná klinika (doména kliniky s SPF, DKIM a DMARC).

> **K ověření právníkem:** § 7 odst. 4 zákona č. 480/2004 Sb. – zřetelné označení obchodního sdělení, neskrývání odesílatele, platná adresa pro odmítnutí. Zákon má nahradit zákon o digitální ekonomice (Sněmovna ho schválila 4. 11. 2026, čeká na Senát) – po vyhlášení texty porovnat s novou úpravou.

---

## E. Pokyny k QR platbě

### E1. Obrazovka s QR kódem (klientský portál)

**Zaplaťte převodem pomocí QR kódu**

1. Otevřete bankovní aplikaci a zvolte platbu QR kódem.
2. Naskenujte kód – předvyplní se účet, částka, variabilní symbol a zpráva pro příjemce.
3. Platbu odešlete. Údaje neměňte – podle variabilního symbolu platbu spárujeme s vaší rezervací.

**Splatnost:** do {splatnost}.
[VARIANTA A: Termín máte rezervovaný i bez platby. Pokud platba do splatnosti nedorazí, zaplatíte na místě.]
[VARIANTA B: Pokud platba do splatnosti nedorazí, můžeme rezervaci zrušit – předem vás upozorníme.]

Platba se u nás obvykle objeví do [1 pracovního dne] (okamžitá platba dřív). Stav platby uvidíte v aplikaci[; jakmile ji přijmeme, pošleme vám potvrzení e-mailem – vyžaduje úpravu systému, viz E3].

Pokud termín zrušíte dřív, než platba dorazí, připíšeme ji na váš kredit. Na požádání vám ji vrátíme na účet.

**Platební údaje pro ruční zadání**

| | |
|---|---|
| Číslo účtu | {číslo účtu} |
| IBAN | {IBAN} |
| Částka | {částka} |
| Variabilní symbol | {VS} |
| Zpráva pro příjemce | {zpráva} |
| Splatnost | {splatnost} |

Tlačítko **Zaplatil/a jsem** → po stisknutí: „Díky, že jste nám dal/a vědět. Jakmile platbu uvidíme na účtu, potvrdíme ji.“

### E2. E-mail s platebními údaji

**Předmět:** Platební údaje – {označení platby}

> Dobrý den, {jméno},
>
> posíláme platební údaje k platbě „{označení platby}“. Nejrychleji zaplatíte naskenováním QR kódu v bankovní aplikaci.
>
> Částka: {částka}\
> Číslo účtu: {číslo účtu}\
> IBAN: {IBAN}\
> Variabilní symbol: {VS}\
> Splatnost: {splatnost}
>
> Prosíme, zadejte přesně uvedený variabilní symbol – podle něj platbu spárujeme. Po přijetí platby vám pošleme potvrzení.
>
> [NÁZEV KLINIKY]

### E3. Potvrzení přijaté platby *(nová zpráva – systém ji dnes neposílá)*

> Platbu {částka} jsme přijali (VS {VS}). {Termín je zaplacený. | Permanentka {název} je aktivní. | Kredit jsme připsali, včetně bonusu {bonus}. | Poplatek je uhrazený.}

### E4. Zpráva pro příjemce v QR kódu

Systém dnes do zprávy dává příjmení klienta a označení platby, např. název služby s datem. Zprávu vidí banka plátce i banka kliniky. Doporučený tvar bez názvu služby: **„{příjmení} REZERVACE {datum}“**, u permanentky „{příjmení} PERMANENTKA“, u kreditu „{příjmení} KREDIT“.

> **K ověření právníkem:** Název zdravotní služby ve zprávě pro příjemce (např. „Fyzioterapie pánevního dna“) by bankám prozradil údaj o zdraví (SDEU C-184/20). Doporučujeme neutrální tvar podle E4.

---

## F. Další krátké texty

| Kde | Text |
|---|---|
| Poznámka k rezervaci – nápověda | „Nepovinné. Napište jen to, co potřebujeme k objednání – podrobnosti o zdravotním stavu probereme osobně. Poznámku uvidí jen personál kliniky.“ Ukázka v políčku: „Např. jde o první návštěvu, preferuji terapeutku.“ *(dnešní ukázka „Např. bolest kolene po běhu“ k uvádění zdravotních údajů přímo vybízí)* |
| Zápis na čekací listinu | „Zapíšeme vás na čekací listinu. Když se místo uvolní, pošleme vám nabídku e-mailem [a SMS]. Nabídka platí [2 hodiny] a termín získá ten, kdo potvrdí první. Zápis je zdarma a nezávazný.“ |
| Zrušení v bezplatné lhůtě | „Zrušit termín {služba} {datum}? Zrušení je zdarma. {Zaplacenou částku vrátíme na kredit. / Vstup se vrátí na permanentku.}“ |
| Pozdní zrušení | „Bezplatná lhůta skončila {storno_do}. Při zrušení teď platí storno {pct} % = {částka} {(uhradíme z kreditu)}. {Můžete místo toho použít omluvenku – zbývá {zbývá} z {celkem}.}“ |
| Omluvenka | „Omluvit termín bez poplatku? Spotřebujete 1 omluvenku (zbude vám {zbývá}). {Náhradní termín si vyberte do {náhrada_do}.}“ |
| Pozastavené online rezervace | „Online rezervace jsou pro tento účet pozastavené po [3] nedostaveních během [90 dní]. Rezervovat můžete dál na recepci nebo telefonicky na [TELEFON].“ |
| Odstoupení od smlouvy *(od 1. 1. 2027, u nákupů online)* | Tlačítko „**Odstoupit od smlouvy**“ → druhý krok „**Potvrdit odstoupení od smlouvy**“ → potvrzení e-mailem s obsahem odstoupení, datem a časem. Funkce zatím v systému není. |

---

## Zdroje

- Občanský zákoník č. 89/2012 Sb. – § 1826 (informace při uzavírání smlouvy elektronicky), § 1826a odst. 2 (tlačítko „objednávka zavazující k platbě“), § 1830a (tlačítko pro odstoupení, zákon č. 159/2026 Sb.): https://www.zakonyprolidi.cz/cs/2012-89 · https://www.epravo.cz/top/clanky/pravni-zmeny-v-oblasti-e-commerce-prisnejsi-pravidla-pro-objednavkova-tlacitka-v-e-shopech-108996.html
- Zákon č. 480/2004 Sb. (§ 7 – obchodní sdělení): https://www.zakonyprolidi.cz/cs/2004-480 · ÚOOÚ – časté otázky: https://uoou.gov.cz/cinnost/obchodni-sdeleni/casto-kladene-otazky-k-zakonu-c-4802004-sb · ÚOOÚ – kontrolní plán 2026: https://uoou.gov.cz/media/clanky/dokumenty/kontrolni-plan-2026.pdf · ePravo – hodnotící dotazníky jako obchodní sdělení: https://www.epravo.cz/top/clanky/hodnotici-dotazniky-jako-obchodni-sdeleni-v-kontrolnim-planu-uoou-pro-rok-2026-121138.html
- Nařízení (EU) 2016/679 (GDPR) – čl. 6, 7, 9, 13: https://eur-lex.europa.eu/eli/reg/2016/679/oj · EDPB, Pokyny 05/2020 k souhlasu: https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_en
- ÚS I. ÚS 3512/11 (pokuta jen v obchodních podmínkách): https://www.lupa.cz/clanky/informace-o-smluvni-pokute-musi-byt-primo-ve-smlouve-rozhodl-ustavni-soud/
- RFC 8058 (odhlášení jedním kliknutím): https://datatracker.ietf.org/doc/html/rfc8058 · Gmail – požadavky na odesílatele: https://support.google.com/mail/answer/81126
- QR Platba (SPAYD): https://qr-platba.cz/pro-vyvojare/validator/

Podklady v repozitáři: `app/src/engine/messages.ts` (šablony), `app/src/portal/logic.ts` (`termsInfo`, `clinicPolicy`), `app/src/portal/payment.tsx`, `app/src/portal/AccountScreen.tsx`, `app/src/engine/qr.ts` (`paymentMessage`), `research_notes/Rezervační systém pro fyzioterapii/cesky_storno_praxe.md` (souhlas u tlačítka, Fyzioterapie Vonášek), `komunikace_integrace.md` (RFC 8058, Gmail).
