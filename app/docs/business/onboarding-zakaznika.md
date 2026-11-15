# Onboarding nového zákazníka – kontrolní seznam

> **Interní postup Nexum Care s.r.o.** pro zavedení nové provozovny na platformu [NÁZEV PLATFORMY]. Stav k 15. 11. 2026.
> Smlouvy: [`../legal/licencni-smlouva.md`](../legal/licencni-smlouva.md), [`../legal/smlouva-o-zpracovani.md`](../legal/smlouva-o-zpracovani.md). Ceny: [`cenik-a-licence.md`](cenik-a-licence.md). Technické kroky v účtech poskytovatelů: [`../DEPLOY.md`](../DEPLOY.md).
>
> **NC** = úkol Nexum Care, **Z** = úkol zákazníka (provozovny). Odhad celkového času Nexum Care: 4–8 hodin (základní onboarding), 8–16 hodin (s importem dat, vlastní doménou a SMS); čekání na DNS a schválení odesílatele SMS trvá až 2 týdny.

## Přehled

| Fáze | Kroky | Kdy |
|---|---|---|
| Příprava | 0 Kvalifikace a nabídka · 1 Smlouvy · 2 Faktura | 2–3 týdny před spuštěním |
| Zřízení | 3 Prostředí · 4 Šablona oboru a moduly · 5 Vzhled · 6 Adresa | po zaplacení onboardingu |
| Nastavení | 7 Služby a pravidla · 8 Import dat · 9 Právní texty · 10 E-maily · 11 SMS · 12 Fio · 13 Přístupy týmu | souběžně, 1–2 týdny |
| Spuštění | 14 Test · 15 Školení · 16 Spuštění | 1–2 týdny jen tým, potom klienti |
| Provoz | 17 Po spuštění · 18 Obnova licence a připomínky · 19 Ukončení spolupráce | průběžně |

## 0. Kvalifikace a nabídka

- [ ] **NC** Obor a druh služeb: **zdravotní** (provozovna je poskytovatelem zdravotních služeb s oprávněním krajského úřadu), **nezdravotní** (živnost – masáže, wellness, fitness, kosmetika), nebo obojí. Určuje variantu Z / N právních textů a nastavení odstoupení u permanentek.
- [ ] **NC** Počet provozoven a Pracovníků s vlastním rozvrhem, počet lidí na recepci → tarif.
- [ ] **NC** Moduly: skupinové lekce, permanentky, kredit, kampaně; platby (na místě, QR; platba kartou online se nenabízí); párování plateb Fio; SMS.
- [ ] **NC** Odkud jsou data: stávající systém (Reservio, Reservanto, Excel…), formát exportu, počet klientů, permanentky a kredity v běhu.
- [ ] **NC** Adresa: vlastní doména (např. `rezervace.provozovna.cz`), nebo `[DOMÉNA PLATFORMY]/<označení>`.
- [ ] **NC** Varianta licence: A (měsíčně / ročně), nebo B (B1 / B2); zkouška – cesta A (ukázková data) nebo B (zkušební období ve smlouvě); cílové datum spuštění.
- [ ] **NC** Nabídka s cenami bez DPH i s DPH (pro neplátce a pro zdravotní služby osvobozené od DPH je DPH náklad) – podle `cenik-a-licence.md`.

## 1. Smlouvy

- [ ] **NC** Licenční smlouva: zvolená varianta, smazané nevybrané varianty a poznámky, vyplněná **Příloha 1** (tarif, provozovny, Pracovníci, moduly, ceny, slevy s datem konce, kontaktní osoby). Příloha 3 (SLA) beze změn, nebo s dohodnutými odchylkami.
- [ ] **NC + Z** Smlouva o zpracování: varianta Z / N v článku 3.3, **Příloha 2** (oprávněná osoba k pokynům, kontakt pro incidenty, případně pověřenec), aktuální Příloha 1 (další zpracovatelé).
- [ ] **NC** Ověřit oprávnění k podpisu v obchodním nebo živnostenském rejstříku; u veřejných subjektů registr smluv.
- [ ] **NC + Z** Podpis obou smluv (elektronicky), archivace podepsaných PDF, zápis do evidence zákazníků (konec dokumentu).
- [ ] **Bez podepsané smlouvy o zpracování se do Platformy nevkládají skutečná data klientů** – ani ve zkoušce.

## 2. Faktura

- [ ] **NC** Faktura za onboarding a podle varianty za první období (A) nebo licenční poplatek či jeho první splátku (B). Splatnost 14 dní, variabilní symbol = číslo faktury, DPH.
- [ ] **NC** Ostrý provoz spustit až po připsání platby za onboarding (článek 6.1 licenční smlouvy).

## 3. Zřízení prostředí v konzoli platformy

- [ ] **NC** Založit provozovnu: název, jak ho uvidí klienti; **označení pro adresu `/<označení>`** (malá písmena bez diakritiky, číslice a pomlčky; po spuštění neměnit – je v odkazech v e-mailech); jméno a e-mail majitele; šablona oboru (krok 4).
- [ ] **NC** Licence: plán (`trial` / `monthly` / `yearly` / `lifetime`), **Platnost licence** (konec zaplaceného nebo zahrnutého období; u `lifetime` konec zaplaceného roku provozu), tarif (počet Pracovníků, moduly).
- [ ] **NC** Ověřit, že se majitel přihlásí kódem z e-mailu a vidí Platnost licence v administraci.

> **Pro Nexum Care:** Dokud konzole neumí zakládat další provozovny na jednom nasazení, zakládá se každý zákazník jako **samostatné nasazení** podle `DEPLOY.md`: projekt Supabase v regionu EU (Frankfurt), migrace, Edge Function `api`, tajné proměnné, `POST /api/admin/bootstrap` s názvem provozovny a e-mailem majitele (potom `ADMIN_SECRET` smazat), plánovač automatiky každých 5 minut, Cloudflare Pages. `bootstrap` dnes zakládá výchozí katalog služeb a tým (s vypnutými klinickými poznámkami a platbami kartou) a šablonu oboru (`app/src/engine/presets.ts`) nepoužívá – katalog a tým pak upravte ručně nebo šablonou, až to konzole umožní.

## 4. Šablona oboru, názvosloví a moduly

- [ ] **NC** Šablona: Fyzioterapie a rehabilitace / Masáže a wellness / Fitness a osobní trenéři / Kosmetika a beauty / Prázdná provozovna.
- [ ] **NC** Názvosloví: jak se jmenuje provozovna (klinika, studio, salon, centrum) a Pracovník (terapeut, trenér, lektor, kosmetička) – všechny pády jednotného i množného čísla (`settings.terms`).
- [ ] **NC** Moduly podle tarifu (skupinové lekce, permanentky, kredit, kampaně) – vypnuté se v administraci ani v portálu neukazují (`settings.modules`).
- [ ] **NC** Zdravotní služby: klinické poznámky vypnuté (`settings.features.clinicalNotes = false`); u permanentek na zdravotní služby vypnuté odstoupení (`withdrawalAllowed = false`). Nezdravotní služby: odstoupení u permanentek koupených online zapnuté.

## 5. Vzhled

- [ ] **Z** Logo: PNG, SVG, WebP nebo JPEG **do 200 kB**, nejlépe s průhledným pozadím.
- [ ] **Z** Barva značky ve tvaru **#RRGGBB**; název a krátký podtitul provozovny.
- [ ] **NC** Nastavit (`settings.branding`) a zkontrolovat na telefonu v portálu i v e-mailech; ověřit čitelnost textu na barvě značky.
- [ ] **NC** Označení „Provozováno na platformě [NÁZEV PLATFORMY]“ podle tarifu.

## 6. Adresa

**Varianta 1 – adresa platformy** `[DOMÉNA PLATFORMY]/<označení>`: nic dalšího se nenastavuje.

**Varianta 2 – vlastní doména zákazníka:**

- [ ] **Z** U registrátora domény vytvořit záznam CNAME (např. `rezervace.provozovna.cz`) na cíl, který dodá Nexum Care.
- [ ] **NC** Cloudflare Pages → Custom domains, ověřit certifikát HTTPS.
- [ ] **NC** Doplnit adresu do povolených původů serveru (`ALLOWED_ORIGINS`) a do nastavení přihlašování Supabase (Authentication → URL Configuration).
- [ ] **NC** Doplnit adresu do monitoringu dostupnosti (`/api/health`).

V obou variantách:

- [ ] **Z** Odkaz na rezervace na webu provozovny, v profilu na Google Mapách, na sociálních sítích a na recepci (QR kód).

## 7. Služby, ceník, tým a pravidla

- [ ] **Z** Podklady: služby (název, délka, cena, rezerva po službě, kdo je poskytuje, zda jen pro nové klienty), permanentky (vstupy, služby, cena, platnost, omluvenky), skupinové lekce (rozvrh, kapacita), místnosti, tým, pracovní doba, pauzy a nepřítomnosti.
- [ ] **NC** U zdravotních služeb neutrální názvy, které se objeví ve zprávách (údaje o zdraví – `../legal/texty-v-aplikaci.md`, část E4).
- [ ] **Z + NC** Storno podmínky, omluvenky, čekací listina, pravidla online rezervací (předstih, horizont, počet rezervací), připomínky a platby (číslo účtu pro QR, splatnost). **Každé číslo musí odpovídat obchodním podmínkám provozovny** – tabulka „Nastavitelné hodnoty“ v `../legal/README.md`.
- [ ] **NC** Komunikace → Šablony: projít texty se zákazníkem; SMS šablony nechat vypnuté do schválení odesílatele (krok 11); kampaně jen se souhlasy.

## 8. Import dat

- [ ] **NC** Ověřit, že je podepsaná smlouva o zpracování (krok 1).
- [ ] **Z** Export ze stávajícího systému (CSV nebo Excel): klienti, permanentky v běhu (zbývající vstupy, platnost), zůstatky kreditu – podle šablon v Nastavení → Import dat.
- [ ] **NC** Minimalizace: neimportovat diagnózy, zdravotní údaje ani poznámky, které nejsou k objednávání potřeba; rodná čísla nikdy.
- [ ] **NC** Souhlasy s obchodními sděleními importovat jen tehdy, když je provozovna umí doložit (kdy a jak byly uděleny); jinak klienty importovat bez souhlasu.
- [ ] **NC** Náhled importu (kontrola chyb), import, kontrola vzorku asi 10 klientů se zákazníkem (permanentky, kredit), potvrzení e-mailem.
- [ ] **NC** Zdrojové soubory po importu smazat ze svých úložišť a e-mailu – kopie dat se neuchovávají.

## 9. Právní texty provozovny

- [ ] **NC** Předat vzory `../legal/obchodni-podminky.md` a `../legal/zasady-ochrany-osobnich-udaju.md` ve správné variantě (Z / N) a `../legal/texty-v-aplikaci.md`, s upozorněním, že nejde o právní radu a texty vydává provozovna svým jménem.
- [ ] **Z** Doplnit údaje, vybrat varianty, vypustit nepoužívané moduly, sladit čísla s nastavením (krok 7) a nechat texty **zkontrolovat svým advokátem**.
- [ ] **NC** Zveřejnit schválené texty v Platformě – jen bez poznámek („K ověření právníkem“, „Pro Provozovnu“, „Pro Nexum Care“) a bez údajů v [hranatých závorkách]; u samostatného nasazení přes `docs/legal/zverejnit/` a `npm run build:prod`.
- [ ] **NC** Ověřit odkazy u registrace a u potvrzení rezervace; uložit zveřejněnou verzi s datem účinnosti.
- [ ] **Z** Zdravotní služby: zdravotnická dokumentace se vede mimo Platformu.

> **Pro Nexum Care:** Právní texty provozovny (`settings.legal`) se zatím v portálu nezobrazují – odkazy vedou na stránky z `docs/legal/zverejnit/` jednoho nasazení. Kontrola konceptu v `app/scripts/build-legal.mjs` hledá „PRACOVNÍ NÁVRH“, „K ověření právníkem“, „Pro kliniku:“ a údaje v [VELKÝCH PÍSMENECH]; poznámky „Pro Provozovnu:“ a „Pro Nexum Care:“ zatím nezachytí – do doplnění kontroly je hledejte ručně.

## 10. E-maily (odesílatel)

- [ ] **NC** Rozhodnout o odesílateli: z domény provozovny (doporučeno – lepší doručitelnost a důvěra klientů), nebo z domény Platformy s adresou pro odpovědi provozovny.
- [ ] **Z** U registrátora domény nastavit záznamy, které zobrazí Brevo (ověřovací kód, **DKIM**, **DMARC**, případně SPF).
- [ ] **NC** Ověřit doménu v Brevo, nastavit odesílací adresu a jméno odesílatele a adresu pro odpovědi v nastavení provozovny.
- [ ] **NC** Přihlašovací kódy (Supabase Auth, SMTP Brevo) odcházejí z ověřené domény a obsahují `{{ .Token }}` (`DEPLOY.md`, krok 2).
- [ ] **NC** Test doručení potvrzení rezervace na Gmail, Seznam a Outlook – nesmí padat do spamu.

## 11. SMS

- [ ] **Z** Odsouhlasit cenu SMS (Příloha 1) a k čemu se SMS posílají (připomínky, změny termínů, čekací listina).
- [ ] **NC** Registrovat odesílatele (Sender ID, nejvýše 11 znaků, např. název provozovny bez diakritiky) v Brevo pro Českou republiku – schválení trvá zhruba 2 týdny; do té doby SMS šablony vypnuté.
- [ ] **NC** Dobít kredit SMS a nastavit měsíční vyúčtování zákazníkovi.
- [ ] **NC** Zkušební SMS na telefon zákazníka; ověřit, že šablony nemají zbytečně diakritiku (70 místo 160 znaků na část).

## 12. Párování plateb Fio (volitelně)

- [ ] **Z** Internetbanking Fio → Nastavení → API → nový token **„Pouze sledovat účet“** (platnost nejvýše 180 dní).
- [ ] **Z** Předat token bezpečnou cestou – **nikdy e-mailem ani chatem** (jednorázový odkaz nebo zadání přímo do nastavení serveru).
- [ ] **NC** Uložit token jako tajnou proměnnou (`FIO_TOKEN`; dnes jedna na nasazení), ověřit párování malou QR platbou.
- [ ] **NC + Z** Připomínka obnovy tokenu do kalendáře 14 dní před koncem jeho platnosti. Bez tokenu potvrzuje platby recepce ručně.

## 13. Přístupy týmu

- [ ] **Z** Seznam lidí a jejich rolí (majitel, recepce, Pracovník).
- [ ] **Z / NC** Tým a směny → Přístupy do systému: každý vlastní e-mail, nejnižší nutná role; sdílené účty ne.
- [ ] **Z** Majitel: vícefaktorové ověření, jakmile ho Platforma nabídne.
- [ ] **Z** Pravidlo provozovny: při odchodu pracovníka přístup hned zrušit.

## 14. Test před spuštěním

- [ ] Zkušební rezervace v portálu na telefonu i počítači; zrušení zdarma, pozdní zrušení s poplatkem, omluvenka a náhradní termín, čekací listina.
- [ ] QR platba malou částkou a potvrzení přijaté platby.
- [ ] Připomínka termínu (testovací klient), SMS, pokud jsou zapnuté.
- [ ] Nákup permanentky online a odstoupení od smlouvy (jen nezdravotní služby).
- [ ] Export údajů klienta a anonymizace na testovacím klientovi.
- [ ] Odkazy na obchodní podmínky a informace o zpracování v registraci a v průvodci rezervací.
- [ ] Smazat nebo anonymizovat testovací klienty a rezervace.

## 15. Školení

- [ ] **Majitel** (60–90 min): nastavení a vazba storno pravidel na obchodní podmínky, přístupy týmu, statistiky, nástroje GDPR (export a anonymizace klienta, souhlasy), právní texty, kde vidí Platnost licence, jak kontaktovat podporu.
- [ ] **Recepce** (60 min): kalendář, rezervace po telefonu (přečíst klientovi storno pravidla, potvrzení e-mailem), zrušení a výjimky z poplatku, omluvenky, potvrzování QR plateb, permanentky a kredit, čekací listina, odstoupení a vrácení peněz.
- [ ] **Pracovníci** (30 min): vlastní kalendář a docházka.
- [ ] Předat krátký návod, kontakty podpory a doby reakce (Příloha 3 licenční smlouvy) a postup při výpadku (rezervace po telefonu, zápis později).

## 16. Spuštění

**Fáze 1 – jen tým (1–2 týdny)**

- [ ] Tým pracuje v administraci, rezervace zapisuje recepce; klientský portál ještě není veřejně odkázaný.
- [ ] Denně kontrolovat Komunikace → Odeslané (neodeslané zprávy) a čekající QR platby.

**Fáze 2 – klienti**

- [ ] Zveřejněné právní texty (krok 9).
- [ ] Odkaz na rezervace na webu, v e-mailech a na recepci (krok 6).
- [ ] **NC** Oznámit zákazníkovi Spuštění e-mailem (článek 6.3 licenční smlouvy) – od tohoto dne běží Fakturační období (A), resp. první rok provozu (B).
- [ ] První týden denně kontrolovat odeslané zprávy a platby.

## 17. Po spuštění

- [ ] **Den 14:** kontrolní hovor – co nefunguje, doručitelnost e-mailů a SMS, dotazy recepce.
- [ ] **Den 30:** projít statistiky a nastavení, sebrat zpětnou vazbu a náměty na úpravy (Příloha 4), požádat o referenci (jen se souhlasem).
- [ ] Potvrdit dokončení onboardingu e-mailem (článek 6.3).

## 18. Obnova licence a pravidelné připomínky

| Kdy | Co | Kdo |
|---|---|---|
| 14 dní před koncem Platnosti licence (A měsíčně) | faktura na další měsíc; po úhradě prodloužit Platnost licence | NC |
| 60 dní před koncem roku (A ročně, B) | upozornění na obnovu; změny ceny oznámit nejméně 30 dní (inflace), resp. 60 dní (jiné změny) předem | NC |
| 30 dní před koncem roku provozu (B) | faktura Poplatku za provoz | NC |
| po splatnosti | upomínky a omezení podle `cenik-a-licence.md`, část 10 (ochranná lhůta → jen pro čtení → pozastavení) | NC |
| 7 dní před koncem zkoušky | připomínka konce zkušebního období | NC |
| měsíčně | vyúčtování SMS a e-mailů nad limit | NC |
| zhruba každých 5 měsíců | obnova tokenu Fio (platí nejvýše 180 dní) | Z, připomíná NC |
| 30 dní před změnou | oznámení nového dalšího zpracovatele (smlouva o zpracování, článek 7.2) | NC |
| při změně storno pravidel nebo ceníku | nová verze obchodních podmínek s datem účinnosti, archiv starých verzí | Z |
| ročně | revize přístupů týmu, kontrola právních textů po změnách zákonů, obnova domény (registrátor) | Z |
| každých 6 měsíců | test obnovy ze zálohy, aktualizace úschovy zdrojového kódu (je-li sjednána) | NC |

## 19. Ukončení spolupráce

- [ ] Potvrdit přijetí výpovědi nebo odstoupení e-mailem s datem skončení smlouvy.
- [ ] Nabídnout pomoc s přechodem (přechodné období) a **úplný export zdarma** (JSON a CSV s popisem struktury) do 10 pracovních dnů od žádosti (článek 18 licenční smlouvy).
- [ ] Po skončení **exportní lhůta 60 dní**: majitel má přístup jen pro čtení, portál ukazuje kontakt na provozovnu.
- [ ] Odebrat vlastní doménu z nastavení, zrušit odesílatele SMS; zákazník zneplatní token Fio a upraví DNS.
- [ ] **Výmaz** do 30 dní po exportní lhůtě, ze záloh nejpozději po 30 dnech; poslat potvrzení o výmazu.
- [ ] Označení `/<označení>` nepřidělovat jinému zákazníkovi 12 měsíců.

## Evidence zákazníka

Co si o každém zákazníkovi vést (např. v tabulce zákazníků):

| Údaj | Příklad |
|---|---|
| zákazník, IČO, provozovny | [NÁZEV], [IČO], [ADRESY] |
| varianta, tarif, Platnost licence | A měsíčně · Standard · do [DATUM] |
| smlouvy | licenční smlouva č. [ČÍSLO] ze dne [DATUM]; smlouva o zpracování ze dne [DATUM], verze Přílohy 1 [DATUM] |
| kontakty | oprávněná osoba k pokynům, kontakt pro incidenty, fakturace |
| druh služeb | zdravotní / nezdravotní / obojí (varianta Z / N) |
| adresa a odesílatelé | doména nebo `/<označení>`; odesílací e-mail; Sender ID |
| Fio | ano / ne; konec platnosti tokenu |
| právní texty | verze a datum účinnosti zveřejněných obchodních podmínek a informací o zpracování |
| slevy | výše a datum konce |
| onboarding | dokončen dne [DATUM]; Spuštění dne [DATUM] |
