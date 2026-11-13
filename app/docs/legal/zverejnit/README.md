# Schválené texty ke zveřejnění

Sem patří **finální** texty po kontrole advokátem (bez poznámek konceptu a bez [doplňovaných údajů]):

- `ochrana-osobnich-udaju.md` – informace o zpracování osobních údajů
- `obchodni-podminky.md` – obchodní podmínky

`npm run build:prod` z nich vytvoří stránky `/ochrana-osobnich-udaju.html` a `/obchodni-podminky.html`,
na které odkazuje přihlášení a registrace. Dokud tu soubory nejsou, stránky ukazují „Dokument se připravuje“.
Sestavení odmítne soubor, který ještě obsahuje „PRACOVNÍ NÁVRH“, poznámky pro právníka nebo údaje v [hranatých závorkách].
