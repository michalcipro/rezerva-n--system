# Rezervační systém pro kliniku „pohyb"

Vlastní rezervační platforma pro soukromou kliniku zaměřenou primárně na fyzioterapii, která nabízí také
kondiční tréninky (1:1 i skupinové), masáže a další služby, které si majitel sám definuje.

## Obsah repozitáře

| Složka | Co obsahuje |
|---|---|
| [`reports/`](reports/) | Výzkumná zpráva: jaké systémy existují v ČR a ve světě a co z toho plyne pro vlastní „engine". |
| [`research_notes/`](research_notes/) | Podkladové poznámky ze všech rešerší se zdroji. |
| [`app/`](app/) | Funkční testovací verze systému (React + TypeScript, vizuální varianta „Klinik"). |

## Testovací verze (`app/`)

Co umí:

- **Kalendář** po 15 minutách s různými délkami služeb, sloupce terapeutů, týdenní pohled, přetahování termínů,
  rezervy po službách, pauzy, nepřítomnosti, skupinové lekce s kapacitou.
- **Klienti**: permanentky (vstupy absolvované / rezervované / volné, platnost, prodloužení), kredit (peněženka
  s bonusem za dobití), omluvenky a náhradní termíny, poplatky, souhlasy GDPR, klinické poznámky, historie.
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
[`app/docs/SCREENS.md`](app/docs/SCREENS.md).

Všechna jména, kontakty a čísla v ukázkových datech jsou smyšlená.
