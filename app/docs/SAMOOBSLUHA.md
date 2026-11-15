# Samoobsluha provozoven – koncept

Platforma (Nexum Care) dodává software, provoz, odesílání e-mailů, licence, fakturaci licencí a podporu.
Všechno, co patří konkrétní provozovně, si nastaví její majitel sám v administraci. Konzole `/platforma`
slouží vlastníkovi platformy jen k dohledu, výjimkám a podpoře.

## Rozhodnutí (15. 11. 2026)

| Otázka | Rozhodnutí |
|---|---|
| Veřejná registrace nových zákazníků | **Ne.** Provozovnu zakládá vlastník platformy v konzoli (po uzavření smlouvy). Majitel pak nastaví vše ostatní sám. |
| Fakturace licencí | **Faktury vznikají přímo v aplikaci.** Nexum Care s.r.o. je plátce DPH (DIČ CZ29616484), ceny se fakturují s DPH, splatnost 14 dní, zálohové faktury se nepoužívají. |
| Platební brána (platby kartou online) | Zatím ne. |
| SMS | Zatím ne – s klienty se komunikuje **jen e-mailem**. SMS jsou v rozhraní skryté, kód zůstává vypnutý pro případné pozdější použití. |

## Co si provozovna nastaví sama

**Už hotové:** služby a ceník, tým, přístupy a pracovní doby, storno podmínky, připomínky, číslo účtu
pro QR platby, šablony zpráv, vzhled (barva, logo), názvosloví, moduly, právní texty, import a export dat.

**Doplnit:**

1. **Fakturační údaje a spuštění**
   - **Údaje firmy:** obchodní firma nebo jméno, IČO (načtení z ARES), DIČ, plátce DPH, sídlo, údaj o zápisu
     v rejstříku, adresa provozovny, telefon, e-mail, web.
   - **E-mail pro faktury:** sem posílá faktury za licenci Nexum Care.
   - **Kde se údaje použijí:** doklady pro klienty, patička e-mailů, právní texty, faktury od platformy.
   - **Kontrolní seznam spuštění na Přehledu:** fakturační údaje, odesílatel e-mailů, účet, služby,
     pracovní doby, právní texty. Tlačítko „Spustit online rezervace“; do spuštění si klienti online
     nerezervují.
2. **Párování plateb**
   - **Fio:** token si majitel vloží sám (šifrovaně) a vidí stav napojení i upozornění před koncem platnosti.
   - **Ostatní banky:** nahraje výpis z banky (CSV / GPC) a platby se spárují.
3. **E-maily**
   - **Výchozí stav (hotovo):** odesílá se z adresy platformy se jménem provozovny a odpovědí na její e-mail.
   - **Vlastní doména:** majitel zadá doménu, aplikace mu ukáže záznamy pro správce domény a doménu ověří.
   - **Další:** podpis s údaji firmy, tlačítko „poslat zkušební e-mail“, upozornění pro tým (nová rezervace,
     zrušení, denní přehled).
4. **Souhlasy majitele**
   - **Při prvním přihlášení:** majitel kliknutím přijme licenční podmínky a smlouvu o zpracování osobních
     údajů. Uloží se verze, čas a kdo souhlasil, včetně souhlasu s elektronickými fakturami.
   - **Průvodce prvním nastavením:** navazuje na kontrolní seznam.
5. **Předplatné a faktury za licenci**
   - **Stránka „Předplatné“ v administraci:** tarif, platnost, využití a faktury ke stažení.
   - **Tarify a limity:** Start / Standard / Profi (počet pracovníků, moduly) hlídá systém. Období je měsíc,
     rok nebo doživotní licence s ročním poplatkem za provoz.
   - **Vystavování:** faktura (daňový doklad) se vystaví automaticky na začátku období a pošle se e-mailem
     v PDF s QR Platbou.
   - **Placení a připomínky:** platba na účet Nexum Care se spáruje podle VS a licence se sama prodlouží.
     Před splatností a po ní odejdou připomínky.
   - **Opravy:** opravný daňový doklad při změně tarifu, vrácení nebo chybě. Vystavený doklad se nemaže.
   - **Pro účetní:** číselné řady, archiv 10 let, export (CSV, později ISDOC / účetní programy).
   - **Ukončení:** majitel zruší předplatné sám. Následuje export dat, 60 dní jen pro čtení a potom
     automatický výmaz.
6. **Doklady provozoven klientům**
   - **Co vzniká:** faktura nebo doklad o zaplacení za permanentky, termíny a kredit, s údaji provozovny,
     vlastní číselnou řadou, značkou a logem.
   - **Varianty:** plátce a neplátce DPH a osvobozená zdravotní služba. Na požádání klienta (zákon o ochraně
     spotřebitele) i automaticky po platbě.
7. **Adresa a web:** změna `/adresy` majitelem, vlastní doména s ověřením, tlačítko nebo okno „Rezervovat“
   pro vlastní web.
8. **Bezpečnost:** dvoufázové přihlášení majitele, citlivé údaje jen pro majitele a šifrovaně, přehled
   přístupů podpory platformy.

## Pořadí práce

| Etapa | Obsah | Stav |
|---|---|---|
| 1 | Fakturační údaje, ARES, kontrolní seznam a spuštění online rezervací | rozpracováno |
| – | Komunikace jen e-mailem (skrýt SMS) | rozpracováno |
| – | Náležitosti faktur (rešerše) a návrh vzhledu faktur | rozpracováno |
| 2 | Fakturace licencí: doklady, číselné řady, PDF, e-mail, párování, prodlužování, opravy | po schválení vzhledu |
| 3 | Párování plateb nastavitelné majitelem (Fio, výpisy) | |
| 4 | E-maily: podpis, zkušební e-mail, vlastní doména, upozornění pro tým | |
| 5 | Souhlasy majitele a průvodce | |
| 6 | Předplatné: tarify a limity, ukončení účtu a výmaz | |
| 7 | Doklady provozoven klientům | |
| 8 | Vlastní doména a tlačítko na web, dvoufázové přihlášení | |

Mimo rozsah teď: veřejná registrace, platební brána, SMS.
