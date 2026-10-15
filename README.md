# Winning Minds

Kalendář, CRM a rezervační systém pro Winning Minds – firmu, která se věnuje mentálnímu koučinku, terapii,
neurovizuálnímu tréninku, strategickému koučinku a mentoringu. Systém slouží hlavně jako kalendář a CRM
(později i fakturace); online rezervace a klientský portál zůstávají k dispozici. Vznikl úpravou rezervační
platformy pro kliniku „pohyb", pro kterou je i výzkumná zpráva v `reports/`.

## Obsah repozitáře

| Složka | Co obsahuje |
|---|---|
| [`reports/`](reports/) | Výzkumná zpráva: jaké systémy existují v ČR a ve světě a co z toho plyne pro vlastní „engine". |
| [`research_notes/`](research_notes/) | Podkladové poznámky ze všech rešerší se zdroji. |
| [`app/`](app/) | Funkční testovací verze systému (React + TypeScript, vizuální varianta „Klinik"). |

## Testovací verze (`app/`)

Co umí:

- **CRM**: u každého klienta je vidět **fáze spolupráce** (Potenciální klient → Freetalk → Diagnostika →
  Vyhodnocení → Aktivní spolupráce → Pozastaveno → Konec spolupráce; fáze lze v Nastavení upravit),
  **poznámky** a zápisy ze sezení s odesláním klientovi e-mailem, **audio nahrávky**, **import z Plaud AI**
  (shrnutí a přepis), **soubory a fotky** a **follow-upy** (úkoly s termínem). Tabule **Pipeline** ukazuje
  klienty po fázích a přesouvá je tažením i z menu, obrazovka **Follow-upy** a widget na Přehledu hlídají úkoly
  po termínu a na dnes, Statistiky mají sekci „Klienti a fáze" (přechody, konverze Freetalk → Aktivní
  spolupráce, doba ve fázi). Specifikace: [`app/docs/CRM.md`](app/docs/CRM.md).
- **Kalendář** po 15 minutách s různými délkami služeb, sloupce terapeutů, týdenní pohled, přetahování termínů,
  rezervy po službách, pauzy, nepřítomnosti, skupinové lekce s kapacitou.
- **Klienti**: permanentky (vstupy absolvované / rezervované / volné, platnost, prodloužení), kredit (peněženka
  s bonusem za dobití), omluvenky a náhradní termíny, poplatky, souhlasy GDPR, historie.
- **Storno a omluvenky**: bezplatná lhůta, stupně poplatků (např. 24–12 h 50 %, méně než 12 h 100 %),
  nedostavení, omluvenky na permanentku nebo za období, lhůta pro náhradu, první pozdní storno zdarma,
  blokace po opakovaném nedostavení – vše nastavitelné, se živým náhledem.
- **Čekací listina**: uvolněný termín se automaticky nabídne čekajícím, potvrdí první.
- **Klientský portál** (mobil): rezervace po 15 minutách, zrušení / omluva s jasnými podmínkami, náhrady,
  přijetí nabídky z čekací listiny, nákup permanentky a dobití kreditu (simulace platby).
- **Statistiky**: obsazenost, tržby, storna, nedostavení, noví klienti, rebooking, heatmapa, závazky z permanentek.
- **Komunikace**: automatické e-maily a SMS (potvrzení, připomínka, omluvenka…), newslettery se segmentací
  a kontrolou souhlasů (odesílání je v testovací verzi simulované).
- **Testovací režim**: přepínání rolí (majitelka, recepce, terapeut, klient) a posun času pro testování lhůt.
- **Připomínky**: tlačítko v testovacím panelu – poznámka si nese obrazovku, roli a testovací čas a odešle se
  e-mailem nebo zkopíruje.

Veřejný náhled pro klienta: **https://michalcipro.github.io/rezerva-n--system/** (GitHub Pages z větve
`gh-pages`; každý návštěvník má vlastní data uložená ve svém prohlížeči, stránka má `noindex`).
Nový build se nasadí tak, že se `app/dist/index.html` po `npm run build` zkopíruje do kořene větve `gh-pages`
a pushne. Adresu, na kterou se mají připomínky předvyplnit, lze doplnit do `app/index.html` jako
`<meta name="feedback-to" content="…">`.

Spuštění lokálně:

```bash
cd app
npm install
npm run dev      # vývojový server
npm test         # testy enginu
npm run build    # produkční build + dist/artifact.html
```

Architektura a pravidla vývoje: [`app/docs/ARCHITECTURE.md`](app/docs/ARCHITECTURE.md), specifikace obrazovek:
[`app/docs/SCREENS.md`](app/docs/SCREENS.md), CRM vrstva: [`app/docs/CRM.md`](app/docs/CRM.md).

Publikace jako claude.ai artefakt (`dist/artifact.html`) musí deklarovat `capabilities: { db: {}, assets: {},
downloads: true }` – sdílená databáze, úložiště souborů klientů a stahování souborů.

Všechna jména, kontakty a čísla v ukázkových datech jsou smyšlená.
