# Ověření práva pro rezervační systém kliniky: storno poplatky, omluvenky, předplacené balíčky a data klientů (fyzioterapie, masáže, kondiční trénink; ČR/EU, stav k 14. 10. 2026)

> **Not legal advice.** These are research notes for designing a booking system. They are not a legal opinion. A Czech lawyer (and a tax adviser for the VAT and EET points) should review the final obchodní podmínky, consent texts, GDPR set-up and tax treatment before go-live.
>
> **Method and reliability.** Research date: 2026-10-14. The full allowance of **60 WebSearch calls** was used. WebFetch was not used (hosts cannot be resolved in this environment). **Every Cited Finding comes from search-result extracts, not from full-text reads.** Several extracts were summaries written by the search tool that listed several pages without saying which sentence came from which page; where that happened, the bullet cites the whole group and says so. Anything still not confirmed is marked **UNVERIFIED**. The last section (question 8) maps every UNVERIFIED item in the earlier notes (`storno_omluvenky_pravo.md`) to its new status: verified, corrected or still open.

---

## 1. Consumer withdrawal: § 1837 exceptions, the healthcare exclusion (§ 1840 OZ / art. 3(3)(b) Directive 2011/83/EU), and whether booking physiotherapy, a massage or a training session online gives a 14-day withdrawal right

### Takeaway
**Physiotherapy**
- Physiotherapy provided by a **registered healthcare provider** counts as "healthcare" under the EU Consumer Rights Directive and is **excluded** from the distance and off-premises contract rules.
- A Czech commentary states that § 1840 OZ was added specifically to exclude healthcare contracts.
- So booking physiotherapy online gives **no statutory 14-day withdrawal right** and needs **no withdrawal button**, whether the session is insured or paid by the patient. The general consumer rules, including unfair-terms control, still apply.

**Massage and training**
- Wellness or sports **massage** and **conditioning training** sold under a trade licence are **not** healthcare. Booking them online is a distance contract.
- No withdrawal right exists **only if** an exception applies. The relevant one is **§ 1837 písm. j)**: "využití volného času" provided "v určeném termínu". It very probably covers a booked, dated session, but no Czech court decision on massage or personal training was found.
- **Undated packages, permanentky and vouchers bought online** carry the 14-day right. If performance started at the consumer's express request, the consumer pays a **proportionate part of the price** on withdrawal (§ 1834).

### Cited Findings
**§ 1837: list of exceptions, including the leisure exception**
- In the 2020 and 2021 consolidated texts, § 1837 letter **j)** excludes withdrawal from contracts "o ubytování, dopravě, stravování nebo využití volného času, pokud podnikatel tato plnění poskytuje v určeném termínu". This is search-extract wording; the earlier notes had "pokud podnikatel *podle smlouvy* poskytuje tato plnění v určeném termínu". — [podnikatel.cz – § 1837, version from 1 Jan 2021](https://www.podnikatel.cz/zakony/novy-obcansky-zakonik/zneni-20210101/f4584761/); [podnikatel.cz – version from 1 Jul 2020](https://www.podnikatel.cz/zakony/novy-obcansky-zakonik/zneni-20200701/f4584761/)
- podnikatel.cz also holds a version of the same page dated **6 January 2023** (the effective date of the 2023 consumer amendment). Its text was not read, so the letter may have changed. — [podnikatel.cz – version from 6 Jan 2023](https://www.podnikatel.cz/zakony/novy-obcansky-zakonik/zneni-20230106/f4584761/)
- § 1837 is a **closed (taxativní) list** of performances from which a consumer cannot withdraw, e.g., perishable goods. The extract did not say which of these commentaries it came from. — [ePravo 94071](https://www.epravo.cz/top/clanky/ochrana-spotrebitele-nahrady-podnikatele-pri-odstoupeni-od-smluv-uzaviranych-distancnim-zpusobem-94071.html); [ePravo 91639](https://www.epravo.cz/top/clanky/par-poznamek-k-ochrane-spotrebitele-v-ramci-noz-91639.html?pdf=1)
- A 2026 summary of the withdrawal-button amendment notes that, under statutory conditions, a consumer cannot withdraw from a contract for a **fully performed service**, or for digital content once performance has started. — [Pohoda portal](https://portal.pohoda.cz/pro-podnikatele/jak-zacit-podnikat/marketing-a-obchod/odstoupeni-od-smlouvy-pres-on-line-rozhrani-podnikatele-ceka-nove-tlacitko/)
- A consumer cannot validly waive the special rights the law gives them (§ 1812 OZ). — [ePravo 95198](https://www.epravo.cz/top/clanky/moznost-vzdani-se-prava-na-predcasne-jednostranne-ukonceni-smlouvy-95198.html)

**How far the leisure exception reaches**
- **CJEU C-96/21 (CTS Eventim, 31 March 2022)** interpreted art. 16(l) of Directive 2011/83/EU. The exception can apply to a distance contract for access to a leisure activity, including through an intermediary, when two conditions are met:
  - withdrawal would leave the organiser bearing the risk of the freed-up capacity; and
  - the activity is set for a **specific date or period**.
  
  This summary comes from a French-language source. — [BAILII – C-96/21](https://www.bailii.org/eu/cases/EUECJ/2022/C9621.html); [Dalloz actualité](https://www.dalloz-actualite.fr/document/cjue-31-mars-2022-aff-c-9621-0); text of art. 16 at [legislation.gov.uk](https://www.legislation.gov.uk/eudr/2011/83/article/16)
- A Czech commentary argues that **courses and classes fall within "využití volného času"**, relying on the directive's rationale of reserved capacity. This is an author's opinion (2013), not a ruling. — [ePravo 92254 – Spotřebitelé a využití volného času dnes a zítra](https://epravo.cz/top/clanky/spotrebitele-a-vyuziti-volneho-casu-dnes-a-zitra-92254.html)
- Market practice: a commercial vendor treats **whether a specific date is agreed at booking** as decisive for experience vouchers, citing German law and C-96/21. Treat this as weak support. — [mallorca.com withdrawal policy](https://www.mallorca.com/pt/erlebnis-widerruf)

**Healthcare exclusion**
- Art. 3(3)(b) of Directive 2011/83/EU says the Directive does not apply to contracts "for healthcare as defined in point (a) of Article 3 of Directive 2011/24/EU, whether or not they are provided via healthcare facilities". The same paragraph also excludes social services, gambling, financial services, immovable property and others. — [legislation.gov.uk – art. 3](https://www.legislation.gov.uk/eudr/2011/83/article/3); [vLex copy](https://eu.vlex.com/vid/843567588)
- A Czech legal article states that when the Directive was transposed, **§ 1840 was added to the Civil Code to exclude health-care contracts from the distance and off-premises contract rules**, and that commentary generally accepts the exclusion. The author argues that the Czech concept ("péče o zdraví") is **broader** than the Directive's, which covers care by health professionals. — [Právní prostor – Smlouva o péči o zdraví: problematické aspekty](https://www.pravniprostor.cz/clanky/ostatni-pravo/smlouva-o-peci-o-zdravi-problematicke-aspekty-jejiho-uzavreni-ukonceni-pri-poskytovani-zdravotnich-sluzeb)
- § 1840 (version in force from 1 July 2025) states that the provisions of the subsection do not apply to listed contracts. The visible example is contracts whose subject is **social services, social housing, child care or support of persons in need**, which mirrors art. 3(3)(a) of the Directive. The extract was truncated before the remaining letters. — [BusinessCenter – § 1840](https://businesscenter.podnikatel.cz/pravo/zakony/obcansky-zakonik/f7485152/)
- The Consumer Protection Act cross-refers to "smlouvy uvedené v § 1840 písm. a), b), d) až g), i) a j) … občanského zákoníku", so § 1840 has at least letters a)–j). — [BusinessCenter – zákon o ochraně spotřebitele](https://businesscenter.podnikatel.cz/pravo/zakony/spotrebitel/cele-zneni/)
- §§ 1820–1840 form the subsection on contracts concluded at a distance and off business premises; §§ 1829–1837 cover withdrawal. — [Lewik glossary](https://www.lewik.org/term/22047/pododdil-1-obecna-ustanoveni-obcansky-zakonik/)
- The relationship between a healthcare provider and a patient is a **consumer relationship**. The Civil Code's health-care contract is subsidiary to the Health Services Act. — [Medical Law Journal (ÚSP AV ČR)](https://medlawjournal.ilaw.cas.cz/index.php/medlawjournal/article/view/84); [Právní prostor](https://pravniprostor.cz/clanky/obcanske-pravo/smlouva-o-peci-o-zdravi-problematicke-aspekty-jejiho-uzavreni-ukonceni-pri-poskytovani-zdravotnich-sluzeb)

**Services that start within the 14-day period**
- **§ 1834**: if the consumer withdraws from a services contract where the trader began performance **at the consumer's express request** before the withdrawal period ended, the consumer pays a **proportionate part of the agreed price** for what was provided. If the agreed price is disproportionately high, the consumer pays the **usual price** of what was provided. — [mesec.cz – § 1834](https://www.mesec.cz/zakony/obcansky-zakonik-2014/f4584853/); [pracepropravniky.cz – § 1834](https://www.pracepropravniky.cz/zakony/obcansky-zakonik-novy/paragraf-1834/); [podnikatel.cz – version from 6 Jan 2023](https://www.podnikatel.cz/zakony/novy-obcansky-zakonik/zneni-20230106/f4584853/)
- **§ 1823**: when the contract is for services, the trader may start performing within the withdrawal period only at the consumer's **express request in text form**. — [Lewik – § 1823](https://www.lewik.org/term/22171/zavazky-ze-smluv-o-poskytovani-sluzeb-obcansky-zakonik-1823/); [ePravo 114713](https://www.epravo.cz/top/clanky/distancni-smlouvy-a-smlouvy-uzavrene-mimo-obchodni-prostory-s-operatory-2-dil-114713.html)
- Pre-contractual information must include the obligation to pay a **proportionate part of the price** if the consumer withdraws from a service that has already started (§ 1820 odst. 1 písm. h)). This was quoted in an extract whose source is one of the two linked pages. — [Pohoda portal](https://portal.pohoda.cz/pro-podnikatele/jak-zacit-podnikat/marketing-a-obchod/odstoupeni-od-smlouvy-pres-on-line-rozhrani-podnikatele-ceka-nove-tlacitko/); [ePravo 94071](https://www.epravo.cz/top/clanky/ochrana-spotrebitele-nahrady-podnikatele-pri-odstoupeni-od-smluv-uzaviranych-distancnim-zpusobem-94071.html)
- The 14-day period is preclusive. **Sending** the withdrawal notice in time is enough; it does not have to arrive in time. The extract did not name the page; most likely ePravo 114713. — [ePravo 114713](https://www.epravo.cz/top/clanky/distancni-smlouvy-a-smlouvy-uzavrene-mimo-obchodni-prostory-s-operatory-2-dil-114713.html); [ePravo 108882](https://www.epravo.cz/top/clanky/nemoznost-odstoupeni-od-smlouvy-uzavrene-se-spotrebitelem-distancnim-zpusobem-108882.html)
- **Model withdrawal notice and form**: zákon č. 374/2022 Sb. brought major consumer-law changes and repealed nařízení vlády 363/2013 Sb. The current model is **nařízení vlády 29/2023 Sb.**, amended by **nařízení vlády 66/2026 Sb.** with effect from **19 June 2026**. — [Právní prostor – nařízení 29/2023](https://pravniprostor.cz/zmeny-v-legislative/vyslo-ve-sbirce-zakonu/narizeni-o-vzorovem-pouceni-o-pravu-na-odstoupeni-od-smluv-uzavrenych-distancnim-zpusobem-nebo-mimo-obchodni-prostory-vzorovem-formulari-pro-odstoupeni-od-techto-smluv); [Právní prostor – novela nařízení (66/2026)](https://pravniprostor.cz/zmeny-v-legislative/vyslo-ve-sbirce-zakonu/novela-narizeni-o-vzorovem-pouceni-o-pravu-na-odstoupeni-od-smluv-uzavrenych-distancnim-zpusobem-nebo-mimo-obchodni-prostory-a-vzorovem-formulari-pro-odstoupeni-od-techto-smluv); [Sagit annotation 66/2026](https://www.sagit.cz/info/sb-anotace-sb26066-6289)

**How physiotherapy is accessed in practice**
- Insurance-covered physiotherapy is provided **only on a treating physician's indication**, using the form "Poukaz na vyšetření/ošetření FT", which is valid for 14 days. — [VZP – Kdy pojišťovna nemusí uhradit péči fyzioterapeuta](https://www.vzp.cz/poskytovatele/informace-pro-praxi/poradna/kdy-pojistovna-nemusi-uhradit-peci-fyzioterapeuta)
- Slevomat offers for physiotherapy and massage let **undated** vouchers be cancelled "v rámci zákonné 14denní lhůty". A voucher **with a booked date** cannot be cancelled. — [Slevomat 2421516](https://www.slevomat.cz/akce/2421516-individualni-fyzioterapie-cviceni-ci-zdravotni-masaz); [Slevomat fitness permanentka](https://www.slevomat.cz/akce/2405380-mesicni-permanentka-do-fitness-i-do-solaria)

### Inferences
**Classification for the booking engine.** Each service should carry a legal category, because the category drives withdrawal rights, fees, VAT, documentation and GDPR basis. The table is an inference from the findings above.

| Service as booked | Healthcare exclusion? | Statutory 14-day withdrawal | Withdrawal button (CZ, from 1 Jan 2027) |
|---|---|---|---|
| Physiotherapy (incl. therapeutic massage indicated as part of it) by a registered provider, insured or self-pay | Yes: art. 3(3)(b) CRD; § 1840 per commentary | No | No |
| Wellness or sports massage under the trade licence, one dated slot | No | Probably none under § 1837 j); not tested in court | Not needed if no right exists |
| Personal or conditioning training, one dated slot | No | Probably none under § 1837 j) | Not needed if no right exists |
| Non-health package, permanentka or voucher **without fixed dates**, bought online | No | **Yes**, 14 days; proportionate price if started on express request (§ 1834) | **Yes** |
| Package of physiotherapy sessions from a registered provider | Yes | No | No |

**Other practical consequences**
- **Self-pay physiotherapy from a registered provider is still healthcare.** The exclusion depends on the nature of the service and the provider, not on who pays. The parallel VAT rule (section 6) says the same.
- **Disclose the exception before booking.** For dated massage or training bookings, the checkout should say that the right of withdrawal does not apply under § 1837 písm. j) because the service is provided on a set date, and the system should store that the client saw this statement.
  - Why it matters: if a court rejected the leisure reading for therapeutic-style massage, any late-cancellation fee charged within 14 days of booking could be challenged.
- **Packages bought online need a separate withdrawal flow:**
  - the 14-day withdrawal information and model form (NV 29/2023 as amended by 66/2026);
  - a text-form request to start performance within the 14 days (§ 1823), with notice that a proportionate part of the price will be payable;
  - a refund calculator that deducts used sessions at the agreed or usual price (§ 1834).
- **Bookings made at the reception desk** are on-premises contracts, so the distance-contract rules do not apply.

### Gaps
- **Exact current wording of § 1840 OZ (UNVERIFIED).** The letter carrying the healthcare exclusion, and whether it uses "zdravotní služby", "zdravotní péče" or "péče o zdraví", were not retrieved. The Právní prostor article's claim that the Czech term is broader matters for borderline services such as "zdravotní masáž" offered under a živnost. Check: [zakonyprolidi.cz – 89/2012](https://www.zakonyprolidi.cz/cs/2012-89).
- **Post-6 Jan 2023 text of § 1837 (UNVERIFIED).** Not read: whether letter j) kept its wording and letter, and the new wording of letter a) (fully performed services; believed to need express consent **plus** acknowledgement of losing the right).
- **No Czech or EU decision found** on whether massage, personal training or therapeutic-style services count as "využití volného času".
- The **European Commission's 2021 guidance** on Directive 2011/83/EU (on leisure services, sports memberships and the healthcare exclusion) was not retrieved.
- **Definition of "healthcare" in art. 3(a) of Directive 2011/24/EU (UNVERIFIED, background):** health services provided by health professionals to patients to assess, maintain or restore their health. Check: [EUR-Lex 2011/24/EU](https://eur-lex.europa.eu/eli/dir/2011/24/oj).
- **Not researched:** the patient's statutory right to terminate a health-care contract or refuse care at any time (Health Services Act / §§ 2636 ff. OZ), and how that interacts with storno terms.

---

## 2. Cancellation fees in consumer contracts: smluvní pokuta vs odstupné, unfair terms (§§ 1813–1815), the alleged 2023+ "ban on penalties in consumer T&Cs", fees in insured healthcare, and prepaid packages and vouchers

### Takeaway
**No general ban on contractual penalties in consumer T&Cs.** As of October 2026 no statute bans them. The "ban" the ARROWS law firm refers to comes from a **2013 Constitutional Court ruling, I. ÚS 3512/11**: a penalty contained only in general T&Cs that the consumer did not demonstrably know is unenforceable. ARROWS itself questions reading this as an absolute ban, and the Supreme Court (2018) rejected automatic invalidity based on placement alone. The only statutory cap found is sector-specific (energy, 2025).

**Validity test for consumer storno fees.** The fee must be:
- **proportionate**;
- **transparently agreed before booking**, preferably in the booking flow itself; and
- **not abusive**.

Under current § 1815, "Ke zneužívajícímu ujednání se nepřihlíží, ledaže se jej spotřebitel dovolá".

**Insurance-covered physiotherapy.** Since **1 January 2026** (zákon č. 290/2025 Sb.), providers may not charge registration fees or make covered care conditional on direct payments. A **no-show penalty** is possible only if agreed in advance. It **cannot be a condition of treatment**, and regional authorities can fine illegal charging up to **CZK 1 million**.

**Vouchers and permanentky.** No specific statute was found. A Supreme Court decision reportedly accepted a one-year voucher expiry without refund, but the consumer-association position (refund after expiry) is still argued, and case-by-case unfair-terms review applies.

### Cited Findings
**Unfair-terms rule (§ 1815) and the 2023 wording change**
- The current § 1815 reads: "**Ke zneužívajícímu ujednání se nepřihlíží, ledaže se jej spotřebitel dovolá.**" The original 2014 wording used "nepřiměřenému" instead of "zneužívajícímu"; a tracked-changes version shows this amendment. The heading of §§ 1813–1815 is now "Zneužívající ujednání". — [mesec.cz – Zneužívající ujednání](https://www.mesec.cz/zakony/obcansky-zakonik-2014/f7484945/); [BusinessCenter – Zneužívající ujednání](https://businesscenter.podnikatel.cz/pravo/zakony/obcansky-zakonik/f7484945/); [Law Insider – tracked changes to 89/2012](https://lawinsider.com/cs/contracts/1ylnnBG2KBa); old wording quoted in [ePravo 93410](https://epravo.cz/top/clanky/prekvapive-klauzule-v-obchodnich-podminkach-aneb-kam-kracis-ochrano-spotrebitele-93410.html)
- EU definition (art. 3 of Directive 93/13/EEC): a term that was not individually negotiated is unfair if, contrary to the requirement of good faith, it causes a significant imbalance in the parties' rights and obligations to the consumer's detriment. — [Your Europe – nepřiměřené smluvní podmínky](https://europa.eu/youreurope/citizens/consumers/unfair-treatment/unfair-contract-terms/index_cs.htm)
- The Supreme Court in **33 Cdo 1616/2014** required examining whether a term, given the specific facts, creates a significant imbalance contrary to the proportionality requirement. Which linked page this came from was not identified. — [ePravo court-decision page 95844](https://www.epravo.cz/top/soudni-rozhodnuti/rozhodci-dolozka-95844.html?pdf=1); [ePravo 95841](https://www.epravo.cz/top/soudni-rozhodnuti/rozhodci-dolozka-95841.html)

**Verifying the ARROWS "ban on contractual penalties in consumer T&Cs"**
- **Source of the "ban": Constitutional Court nález I. ÚS 3512/11 (11 Nov 2013).**
  - The facts: UPC lent a customer a modem, and its T&Cs imposed a penalty for not returning it within 7 days after the contract ended.
  - The holding: penalty clauses in consumer contracts generally cannot sit only in general T&Cs; they must be in the contract the consumer signs. A mere reference to the T&Cs is not enough, and the business bears the burden of proving the consumer knew the terms.
  - The case was returned to the district court in České Budějovice.
  
  — [ARROWS – smluvní pokuty](https://arws.cz/novinky-v-arrows/smluvni-pokuty); [ARROWS – zákaz umístění smluvních pokut v obch. podmínkách](https://arws.cz/novinky-v-arrows/zakaz-umisteni-smluvnich-pokut-v-obch-podminkach); [ARROWS – smluvní pokuta v obchodních podmínkách](https://arws.cz/novinky-v-arrows/smluvni-pokuta-v-obchodnich-podminkach); [Lupa.cz](https://www.lupa.cz/clanky/informace-o-smluvni-pokute-musi-byt-primo-ve-smlouve-rozhodl-ustavni-soud/)
- **Contested scope.** The ARROWS commentary ("Absolutní zákaz smluvních pokut v obchodních podmínkách spotřebitelských smluv? Opravdu?") argues against reading the nález as an absolute ban. A Charles University text reads it strictly: a penalty found only in T&Cs is absolutely invalid. — [ePravo 107061](https://www.epravo.cz/top/clanky/absolutni-zakaz-smluvnich-pokut-v-obchodnich-podminkach-spotrebitelskych-smluv-opravdu-107061.html); [PrF UK text](https://www.prf.cuni.cz/cz/download/1404057970)
- **Later Supreme Court case law.** The extracts below are commentary, not the judgments themselves.
  - **33 Cdo 961/2017 (25 April 2018):** read by commentators to mean that a penalty is not invalid merely because it sits outside the main contract text.
  - **33 ICdo 45/2017 (28 March 2018):** a penalty in loan T&Cs is not automatically invalid; it is subject to a proportionality test, and placement in T&Cs alone does not establish unfairness.
  - **33 Cdo 156/2018:** a penalty of up to **0.5 % per day** was treated as generally proportionate.
  
  — [ePravo 107934](https://www.epravo.cz/top/clanky/jeste-jednou-k-zakazu-umisteni-smluvnich-pokut-v-obchodnich-podminkach-spotrebitelskych-smluv-107934.html); [ePravo 115804](https://www.epravo.cz/top/clanky/platne-sjednani-smluvni-pokuty-pohledem-judikatury-nejvyssiho-soudu-115804.html)
- **No enacted general ban found.**
  - The search found no statute or bill introducing a general ban on penalties in consumer contracts.
  - The 2023 consumer amendment (in force from January 2023) dealt with matters such as pre-ticked boxes, warranties and digital content, not penalties.
  - The only statutory cap found is sector-specific: **Lex OZE III (from 1 Aug 2025)** limits an energy consumer's early-termination penalty to **40 %** of what they would have paid until the end of the contract.
  
  — [Taylor Wessing (Jan 2023)](https://www.taylorwessing.com/en/insights-and-events/insights/2023/01/amendment-to-the-czech-consumer-protection-act); [ERÚ press release on Lex OZE III](https://eru.gov.cz/sites/default/files/obsah/prilohy/20250801tzpravaspotrebitelulexozeiii.docx)

**Proportionality benchmark from package travel (odstupné)**
- For package travel, the Civil Code requires a **reasonable (přiměřené)** cancellation charge. Reasonableness depends on the time between withdrawal and departure and, in practice, on what the organiser saves or can resell. — [finance.cz – storno poplatky cestovních kanceláří](https://www.finance.cz/545909-kdy-vam-cestovni-kancelar-ne-muze-nauctovat-storno-poplatek)

**Fees in insurance-covered healthcare (relevant to physiotherapy)**
- **Zákon č. 290/2025 Sb.**, amending the Health Services Act, has applied since **1 January 2026**. It:
  - bans **registration fees**;
  - bans extra payments for insurance-covered care;
  - expressly forbids **making new or further covered care conditional on another direct payment**;
  - also requires hospitals to create a patient-ombudsman function.
  
  — [Právní prostor – Zákaz registračních poplatků u lékaře (2026)](https://www.pravniprostor.cz/clanky/spravni-pravo/zakaz-registracnich-poplatku-u-lekare-je-jednou-z-novinek-roku-2026); [Právní prostor – Novela zákona o zdravotních službách (Sbírka)](https://www.pravniprostor.cz/zmeny-v-legislative/vyslo-ve-sbirce-zakonu/novela-zakona-o-zdravotnich-sluzbach3)
- **Enforcement**: ČT reports that, since January 2026, regional authorities can fine practices up to **CZK 1 million** for illegal charging. VZP recorded **more than 70 such cases** this year (apparently reports of illegal charges), compared with about 150 for the whole of last year. — [ČT24 – téma ordinace](https://ct24.ceskatelevize.cz/tema/ordinace-5679); [VZP – Za jaké poplatky hrozí lékařům milionová pokuta](https://www.vzp.cz/o-nas/aktuality/za-jake-poplatky-hrozi-lekarum-milionova-pokuta-a-kde-jim-zakon-nechava-volnou-ruku)
- **VZP on penalties for missed appointments**:
  - A doctor may claim a contractual penalty only if the **situations triggering it and its amount were agreed with the patient in advance**, and the patient agreed.
  - The doctor **may not make treatment conditional on the patient accepting the penalty**.
  - Instead of a penalty, the doctor may claim **compensation for actual damage**.
  - This guidance predates the 2026 amendment.
  
  — [VZP – Smluvní pokuta za nedodržení termínu vyšetření](https://www.vzp.cz/o-nas/tiskove-centrum/otazky-tydne/smluvni-pokuta-za-nedodrzeni-terminu-vysetreni)
- A consumer site (April 2026, weak source) says no-show penalties are still seen at practices, sometimes above **CZK 1,000**, and that the practice is debated. — [Energozrouti](https://energozrouti.cz/clanek/poplatky-zdravotnici-doktori-pokuta-zmeskany-termin)

**Vouchers and prepaid credit**
- **SOS v Kasa.cz (2007).** The consumer association SOS argued that limiting a certificate's validity is lawful, but the price must be refunded after expiry, and excluding a refund is unlawful. The case reached the Supreme Court; its outcome was not found. — [finance.cz](https://www.finance.cz/clanky/103808-sos-se-kvuli-darkovym-poukazkam-soudi-s-internetovym-obchodem)
- **Reported Supreme Court holding.** A search extract of the ePravo article on gift vouchers states that the Supreme Court held it is **not an unfair consumer term** to agree that a voucher not used **within one year lapses without compensation**. The same article warns that such terms can be problematic for consumers. The case number, date and exact text were **not** retrieved, and a second search could not confirm the passage. — [ePravo 111078 – Jak na dárkové poukázky](https://www.epravo.cz/top/clanky/jak-na-darkove-poukazky-111078.html)
- In practice, voucher terms often say unused vouchers lapse without refund of the price (e.g., a ČZU voucher). — [ČZU – Lesy voucher terms](https://lesy.czu.cz/dl/93708?lang=cs)
- **Market practice on prepaid sessions** (Slevomat physiotherapy and massage offers): one reschedule up to 24 h before; later changes or no-shows forfeit the voucher in full; undated vouchers can be cancelled within 14 days. — [Slevomat 2421516](https://www.slevomat.cz/akce/2421516-individualni-fyzioterapie-cviceni-ci-zdravotni-masaz)
- **No ČOI or ombudsman guidance** on storno fees for appointment-based services was found. Two targeted searches returned only foreign or unrelated material. — [search result example: Slovak advice (not Czech law)](https://ficek.sk/chcem-zrusit-rezervaciu-ako-postupovat-15353)

### Inferences
**Checklist for a defensible storno or no-show rule in non-health consumer bookings (massage, training)**
1. **Put the fee rule in the booking flow itself.** State it next to the "Book" button and in the confirmation (amount or percentage, deadline, no-show definition), with an explicit, unticked "I agree" checkbox. Do not rely only on a link to the VOP, because of the I. ÚS 3512/11 risk. Store the text version, timestamp and channel.
2. **Keep it proportionate and graded by notice period.**
   - Example: free until 24 h; 50 % for cancellations under 24 h; up to 100 % for a no-show.
   - Never charge more than the price of the booked service.
   - Never charge flat penalties unrelated to a booking.
3. **Make it reciprocal.** If the provider cancels late, give the client a free replacement or credit. This mitigates the one-sidedness concern in the Directive 93/13 annex (annex text still UNVERIFIED).
4. **Do not override statutory withdrawal rights.** Under § 1812, a waiver of withdrawal rights is ineffective. Where a 14-day right exists (online-bought packages), the storno rules apply only on top of it, never instead of it.
5. **Assume all-or-nothing.** An abusive term is disregarded if the consumer invokes it (§ 1815). The safer working assumption is that a court will not cut an excessive fee down to a fair level; it will drop it. Under consumer law, the penalty-reduction power in § 2051 OZ may not save the clause. This is an inference: § 2051 and the CJEU line on not revising unfair terms were not verified here.

**Classifying the fee**
- A fee for a **timely contractual cancellation** behaves like **odstupné** (a price for the right to withdraw, § 1992).
- A **no-show** is a breach that can be secured by a **smluvní pokuta** (§ 2048 ff.).
- Wording the T&Cs to match each case makes the legal analysis cleaner. The texts of § 1992 and § 2048 ff. are UNVERIFIED in this session.

**Insured physiotherapy: the booking system should**
- **not** require a deposit, card guarantee or prepayment for insurance-covered sessions (risk of being treated as a direct payment conditioning covered care under 290/2025 Sb.);
- **not** make acceptance of a no-show penalty a condition of booking an insured session (VZP);
- offer any penalty only as a **separate, optional, pre-agreed** term, or use non-monetary measures such as reminders, or "after N no-shows, online self-booking is disabled and bookings go through reception". Whether a provider may refuse further insured care after repeated no-shows was **not researched**.

**Self-pay physiotherapy** (registered provider): an ordinary consumer contract. The storno checklist applies. The distance-contract withdrawal rules do not (section 1).

**Prepaid packages and permanentky**
- Lowest-risk configuration:
  - a validity period scaled to the package size;
  - automatic extension for documented illness;
  - a refund of the unused value on request, optionally net of the package discount;
  - clear disclosure before purchase.
- Forfeiting the whole unused balance at expiry is the highest-risk option. The reported Supreme Court acceptance of a one-year voucher lapse is thin support: case number not retrieved, probably decided under the pre-2014 Civil Code.

**Omluvenky (excuses).** No statute specifically governs excuse quotas or makeup sessions. These are purely contractual and are judged under the general proportionality and transparency test above.

### Gaps
- **Not retrieved (UNVERIFIED):** the text of § 1992 (odstupné), §§ 2048–2052 (smluvní pokuta, including § 2051 moderation), § 1813 and the grey list in § 1814, and annex points 1(d) and 1(e) of Directive 93/13/EEC.
- **Not found:**
  - any Czech court decision or ČOI statement on storno or no-show fees for appointment-based services (physiotherapy, massage, fitness, courses);
  - the final Supreme Court ruling in SOS v Kasa.cz and the case number of the reported one-year-voucher decision;
  - the text of zákon č. 290/2025 Sb., including whether it says anything specific about no-show penalties. The VZP guidance on penalties dates from before 2026.
- **Not researched:** whether a no-show penalty is due when the client was prevented by sudden illness (liberace, vis maior). This affects how "omluvenka s doložením" rules should work.

---

## 3. EU "withdrawal button" (Directive (EU) 2023/2673, applicable from 19 June 2026): does it apply to online-booked services, and how is it transposed in Czechia?

### Takeaway
- Directive 2023/2673 inserted **art. 11a** into Directive 2011/83/EU, which requires a **withdrawal function** in online interfaces. Member states were supposed to apply it from **19 June 2026**.
- Czechia transposed it late, through a new **§ 1830a OZ**:
  - the Chamber of Deputies passed the bill on **10 July 2026**, adding an effective date of **1 January 2027**;
  - the Senate approved it on **19 August 2026**;
  - publication in the Sbírka was **not verified**.
- It covers **all consumer contracts concluded online** that carry a withdrawal right, including services, not only financial services. It creates **no new right**; it is a new way to exercise the existing one.
- For the clinic it matters only for **online sales that carry a withdrawal right**: non-health packages, permanentky and vouchers. It does not matter for dated leisure bookings or for healthcare.

### Cited Findings
- The directive amends the Consumer Rights Directive with art. 11a, the model for the Czech **§ 1830a**. The Czech bill was sent to the Senate, which had to decide by **20 August**, with proposed effect from **1 January 2027**. The extract did not attribute this to a single page. — [Právní prostor – Odstoupení na tlačítko](https://www.pravniprostor.cz/clanky/obcanske-pravo/odstoupeni-na-tlacitko); [Pohoda portal](https://portal.pohoda.cz/pro-podnikatele/jak-zacit-podnikat/marketing-a-obchod/odstoupeni-od-smlouvy-pres-on-line-rozhrani-podnikatele-ceka-nove-tlacitko/); background [ePravo 121455](https://www.epravo.cz/top/clanky/tlacitko-pro-odstoupeni-od-smlouvy-jako-novy-standard-spotrebitelskeho-online-rozhrani-121455.html)
- **Chamber of Deputies**: third reading passed on **10 July [2026]**, together with an amendment setting the effective date at **1 January 2027**. The bill went to the Senate. The provision is **§ 1830a**. — [Právní prostor – Sněmovna schválila](https://pravniprostor.cz/aktuality/snemovna-schvalila-vetsi-ochranu-spotrebitelu-pri-sjednavani-sluzeb-on-line); [Právní prostor – Tlačítko … nová povinná výbava e-shopů](https://pravniprostor.cz/clanky/pravo-it/tlacitko-pro-odstoupeni-od-smlouvy-bude-nova-povinna-vybava-e-shopu); [dostupnyadvokat.cz](https://dostupnyadvokat.cz/blog/e-shopy-ceka-tlacitko)
- One extract described the bill as still in the Chamber as **sněmovní tisk 53** on 24 June 2026; which of the linked sources says this was not identified. — [dostupnyadvokat.cz](https://dostupnyadvokat.cz/blog/e-shopy-ceka-tlacitko); [EY tax alert 04/2026](https://www.ey.com/cs_cz/technical/tax/tax-alerts/2026/04/nove-tlacitko-odstoupit-pri-online-smlouvach)
- **Senate** approved on **19 August 2026** (51 of 69 senators present), and the bill went to President Petr Pavel. The finance minister called it a pure transposition with no national additions. The **button applies to all consumer contracts concluded online**, e.g., e-shop purchases, not only financial services. Financial providers must also avoid manipulative "dark patterns". — [Advokátní deník, 20 Aug 2026](https://advokatnidenik.cz/2026/08/20/lepsi-ochranu-spotrebitelu-u-uzavirani-online-smluv-schvalil-senat/); [Ekonomický deník](https://ekonomickydenik.cz/senat-schvalil-tlacitko-pro-odstoupeni-od-financnich-smluv/); [Právní prostor – Senát schválil](https://pravniprostor.cz/aktuality/senat-schvalil-lepsi-ochranu-spotrebitelu-pri-uzavirani-financnich-smluv-on-line); Senate committee stage: [Advokátní deník, 12 Aug 2026](https://advokatnidenik.cz/2026/08/12/senatni-vybor-podporil-vetsi-ochranu-spotrebitelu-v-ramci-on-line-sluzeb/)
- **What the function must do**, as described in commentary (one tool summary drew on several of these pages without per-sentence attribution):
  - a clearly labelled control, e.g., "**Odstoupit od smlouvy**";
  - a **two-step** process, with confirmation through a second control, e.g., "**Potvrdit odstoupení od smlouvy**";
  - the trader must send a **confirmation of receipt** stating the content and the **date and time** of the withdrawal;
  - the control must be visibly placed where the contract was concluded and **available throughout the withdrawal period**.
  
  — [ePravo 121308 – Druhá „tlačítková novela"](https://www.epravo.cz/top/clanky/druha-tlacitkova-novela-povinne-tlacitko-pro-odstoupeni-od-smlouvy-121308.html); [ePravo 121632 – Tlačítkový zákon 2026](https://www.epravo.cz/top/clanky/tlacitkovy-zakon-2026-novinky-pro-eshopy-a-online-podnikatele-121632.html?pdf=1); [BusinessInfo](https://www.businessinfo.cz/clanky/od-cervna-budou-muset-e-shopy-usnadnit-vraceni-zbozi-jak-je-to-s-novym-tlacitkem/); [muj-pravnik.cz](https://muj-pravnik.cz/?p=30159)
- **No new right**: the button is only an additional way to exercise the existing withdrawal right under § 1829. — [Právní prostor – Odstoupení na tlačítko](https://www.pravniprostor.cz/clanky/obcanske-pravo/odstoupeni-na-tlacitko); [Právní prostor](https://pravniprostor.cz/clanky/pravo-it/tlacitko-pro-odstoupeni-od-smlouvy-bude-nova-povinna-vybava-e-shopu)
- **Sanctions**: one extract said a missing or non-working button could be an offence under the Consumer Protection Act, with fines **up to CZK 5 million**. Another extract found no source for that figure, so treat it as **UNVERIFIED**. — [BusinessInfo](https://www.businessinfo.cz/clanky/od-cervna-budou-muset-e-shopy-usnadnit-vraceni-zbozi-jak-je-to-s-novym-tlacitkem/); [ePravo 121308](https://www.epravo.cz/top/clanky/druha-tlacitkova-novela-povinne-tlacitko-pro-odstoupeni-od-smlouvy-121308.html)
- During the Senate debate, senators did not vote on an amendment to rename the "tlačítko" an "ovládací prvek". Minister Schillerová argued the change would confuse terminology. — [Právní prostor – Senát schválil](https://pravniprostor.cz/aktuality/senat-schvalil-lepsi-ochranu-spotrebitelu-pri-uzavirani-financnich-smluv-on-line)

### Inferences
- **Scope for the clinic.**
  - **Applies** to online sales of non-health packages, permanentky and gift vouchers for massage or training.
  - **Does not apply** to dated leisure bookings with no withdrawal right (§ 1837 j)), or to healthcare (physiotherapy), which is excluded from the whole distance-contract subsection.
- **Build it for 1 January 2027.** Show it in the client account next to each eligible purchase until 14 days have passed. Use two-step confirmation. Send an automatic acknowledgement e-mail with the withdrawal content and a timestamp. Link it to the refund calculator from section 1 (§ 1834 proportionate price).
- **The gap from 19 June 2026 to 1 January 2027 is low-risk** for a private business, because directives generally cannot be enforced directly against private parties. This is a general EU-law principle that was not researched here; implementing early is cheap anyway.

### Gaps
- **Not confirmed:** the President's signature, the **Sbírka number** and the final effective date of the Czech transposition act. The 1 January 2027 date comes from the Chamber's amendment, which the Senate passed unchanged according to the reports.
- **Not seen:** the final text of § 1830a and any amended § 1820 information duty.
- **UNVERIFIED:** the CZK 5 million fine.

---

## 4. GDPR and health data: art. 9(2)(h) vs explicit consent, DPO and DPIA for a small clinic, what a booking system may store, and access-control and audit expectations

### Takeaway
**DPO and DPIA**
- **Recital 91 GDPR** says processing of patient data by **an individual physician or other health professional is not "large scale"**, and in that case a **DPIA is not mandatory**.
- The WP29 DPO guidelines (endorsed by the EDPB) give **a hospital's patient data** as an example of large-scale processing.
- A **solo or very small physiotherapy practice is therefore probably outside the mandatory DPO and DPIA rules**. A **multi-therapist clinic with a shared record is a grey zone**: commentary says the carve-out does not reach group practices or clinic chains. The assessment should be documented.

**Legal basis**
- No ÚOOÚ statement on **art. 9(2)(h)** for physiotherapy records was found. A Czech article notes that both consent-based and non-consent regimes exist for health data.
- The standard model (UNVERIFIED in this session): the healthcare provider's records rest on art. 9(2)(h) plus the statutory documentation duty, while health questionnaires for wellness or training rest on **explicit consent**.

### Cited Findings
- **Recital 91 GDPR**: "The processing of personal data should not be considered to be on a large scale if the processing concerns personal data from patients or clients by an individual physician, other health care professional or lawyer. In such cases, a data protection impact assessment should not be mandatory." — [gdpr-info.eu – Recital 91](https://gdpr-info.eu/recitals/no-91/); [activeMind – Recital 91](https://www.activemind.legal/legislation/gdpr/recital-91)
- **Commentary on the carve-out**:
  - it is narrow: a single-handed practice falls outside the art. 35(3)(b) trigger, but **"a group practice with a shared record, a clinic chain, or any platform aggregating across providers is not"**;
  - national DPIA lists under art. 35(4) often name health data explicitly;
  - a recital guides interpretation but is not binding, and the general high-risk test in art. 35(1) still applies.
  
  — [Legiscope – DPIA for health data](https://www.legiscope.com/blog/dpia-health-data.html)
- **WP243 (DPO guidelines), as cited in commentary**: an example of large-scale processing is "processing of patient data in the regular course of business by a hospital". The assessment of whether a DPO is needed should be **documented** and repeated when circumstances change. The "documented and repeated" point seems to come from the Polish DPA (UODO) page on DPOs in non-public healthcare facilities, which was not read in full. WP243 is among the WP29 guidelines endorsed by the EDPB. — [Advisera community (citing WP243)](https://community.advisera.com/topic/article-37-%e2%80%93-designation-of-the-data-protection-officer/); [UODO (Poland) – DPO in a non-public health care facility](https://www.uodo.gov.pl/en/679/1386); [EDPB – endorsed WP29 guidelines](https://www.edpb.europa.eu/endorsed-wp29-guidelines_cs)
- **Czech DPIA lists**: ÚOOÚ issued lists of processing operations that do and do not require a DPIA. The list has ten categories, including processing of "kritické údaje, údaje umožňující přímou identifikaci a/nebo údaje vysoce osobní povahy". Health data is not named expressly in the extract. The EDPB register holds the Czech list and the EDPB opinions on it. — [mv.gov.cz – seznam operací (ne)podléhajících DPIA](https://mv.gov.cz/soubor/seznam-operaci-zpracovani-ne-podlehajicich-pozadavku-na-dpia-pdf.aspx); [EDPB register – DPIA lists](https://www.edpb.europa.eu/registers/register-of-consistency-and-of-accountability-tools/data-protection-impact-assessment_cs)
- **Legal bases for health data**: a Czech article says both consent-based and non-consent regimes can currently be used for health data. The non-consent regime is new for health data and lacks settled case law. This was written for the research context. — [Právní prostor – Zákonné tituly zpracování … ve zdravotnictví](https://www.pravniprostor.cz/clanky/spravni-pravo/dil-ii-zakonne-tituly-zpracovani-osobnich-udaju-pro-vedecke-vyzkumne-ucely-ve-zdravotnictvi); [ePravo 115105](https://epravo.cz/top/clanky/jak-legalne-zpracovavat-pacientska-data-pro-vedecke-ucely-115105.html)
- **Patient access**: the CJEU (judgment of 26 Oct 2023, dentist case) held that a patient is entitled to a **first copy of their medical records free of charge** without giving reasons. — [Advokátní deník](https://advokatnidenik.cz/2023/10/26/sdeu-pacient-ma-pravo-ziskat-bezplatne-prvni-kopii-zdravotnicke-dokumentace/); [Právní prostor – judikatura](https://pravniprostor.cz/judikatura/obcanske-pravo/pravo-na-bezplatnou-kopii-zdravotnicke-dokumentace)
- **Enforcement example**: an ÚOOÚ penalty order (2019) concerned a GP's waiting room and **unsecured patient records**. The extract did not make clear which ÚOOÚ document this is. — [ÚOOÚ document 03576/19](https://uoou.gov.cz/media/poskytnute-informace/2020/3032020/uoou-03576-19.pdf)
- **Record-keeping rules for clinical documentation**:
  - Vyhláška 444/2024 Sb. regulates the content of zdravotnická dokumentace, processing methods, **time limits for entries and their authorisation**, retention and disposal. It implements § 69 písm. a)–g) and § 69c odst. 2 of the Health Services Act.
  - The Ministry of Health has said that, besides a handwritten signature, a qualified or advanced electronic signature may be used for the patient's signature.
  - A **draft** of the e-health act required every electronic entry to contain the **date and time** and the **identification of the health worker** who made it. This is a draft, not confirmed final law.
  
  — [ARROWS – povinnosti při vedení zdravotnické dokumentace](https://arws.cz/novinky-v-arrows/povinnosti-pri-vedeni-zdravotnicke-dokumentace); [ePravo – Sb. 444/2024](https://www.epravo.cz/top/zakony/sbirka-zakonu/sb/2024/444); [MZČR answer (2025)](https://mzd.gov.cz/wp-content/uploads/2025/03/23.pdf); [ČVUT – návrh zákona o elektronizaci zdravotnictví](https://cw.fel.cvut.cz/old/_media/courses/a6m33li/navrh_zakona_o_elektronizaci_zdravotnictvi.pdf); related act [zákon 326/2021 Sb. (DAUC)](https://www.dauc.cz/predpisy/4649/326-2021-sb)

### Inferences
**What the booking system may hold**
- Keep **two domains**:
  - **booking/CRM**: identity, contacts, slot, service code, attendance status, storno/no-show flags, payments, consents;
  - **clinical record**: anamnesis, findings, plan, notes, i.e., zdravotnická dokumentace under vyhláška 444/2024.
- A free-text "reason for visit" in the booking form is **health data**. Make it optional and short, show it only to the treating therapist, and move it into the clinical record at the first visit. Do not copy it into reminders or invoices.
- Service names visible to the client and in SMS should be neutral ("Fyzioterapie 50 min", not the diagnosis).

**Legal bases** (working model; the GDPR texts were UNVERIFIED in this session)
- Physiotherapy records kept by a registered provider: art. 9(2)(h) with professional secrecy under art. 9(3), alongside the statutory documentation duty. No consent is needed for keeping the record itself.
- Pre-massage or pre-training health questionnaires in the živnost part: **explicit consent** (art. 9(2)(a)), recorded separately with text version and timestamp.
- Do not use health data for marketing segmentation.

**DPO and DPIA**
- A single physiotherapist: no mandatory DPO or DPIA (Recital 91).
- A clinic with several therapists sharing one patient record, plus massage and training clients: document a DPO-necessity assessment (WP243) and do a **voluntary light DPIA**. This is cheap and also covers the ÚOOÚ list category of "údaje vysoce osobní povahy".

**Access control and audit**, following the time-limited, authorised and attributable entries of vyhláška 444/2024 and the e-health draft:
- role-based access (reception: bookings only; therapists: their own patients' clinical data);
- an append-only audit log of who read or changed clinical entries, and when;
- immutable timestamps and author IDs on clinical entries;
- the ability to export a free first copy of the record for a patient (CJEU 2023).

### Gaps
- **UNVERIFIED (texts not retrieved):** the wording of GDPR art. 9(2)(a), 9(2)(h), 9(3), 35(3)(b) and 37(1)(c), and zákon 110/2019 Sb. (including the age of digital consent, believed to be 15). Check: [EUR-Lex GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj).
- **No ÚOOÚ guidance found** on DPOs for small healthcare providers, on booking systems, on SMS reminders containing health information, or on retention of booking data.
- The full ÚOOÚ DPIA list was not read, so it is not confirmed whether health data in a small clinic triggers a mandatory DPIA under a Czech list item.
- **Not researched:** whether vyhláška 444/2024 or zákon 325/2021 Sb. (e-health) **expressly** requires access logs for electronic documentation; NIS2 or the new Czech cybersecurity act; the European Health Data Space Regulation.

---

## 5. Czech healthcare law: when physiotherapy requires registration as a poskytovatel zdravotních služeb, documentation duties and retention, and services under a trade licence

### Takeaway
- **Physiotherapy as therapy is a health service.** It must be provided by a holder of an **oprávnění k poskytování zdravotních služeb** under the Health Services Act (zákon 372/2011 Sb.).
- **Trade-licence services are limited.** The Ministry of Health says services under a trade licence may only be **preventive, regenerative or supportive**, may **not claim therapeutic effects** and must be **unconnected to any diagnosis**. Providing what are by nature health services under a živnost may be an offence under § 115(1)(a) of the Act.
- **Massage on healthy people** (sports, reconditioning and regeneration massage, excluding reflex massage) is the **vázaná živnost "Masérské, rekondiční a regenerační služby"**.
- **Correction to the earlier notes:** **vyhláška 98/2012 Sb. was replaced by vyhláška 444/2024 Sb. on 1 January 2025.**
  - Retention is **generally 5 years** from 1 January of the year after the last entry, with longer or shorter periods for specific care types in **příloha č. 3**.
  - The specific period for physiotherapy was not retrieved.

### Cited Findings
**Registration and the boundary with trade licences**
- A healthcare provider is a natural or legal person holding authorisation to provide health services under the Act (§ 2 odst. 1). — [MZČR – stanovisko k laserovým přístrojům v režimu živnostenského zákona (2024)](https://mzd.gov.cz/wp-content/uploads/2024/02/Aktualizovane-stanovisko-Ministerstva-zdravotnictvi-k-pouziti-laserovych-pristroju-v-rezimu-zivnostenskeho-zakona.pdf); [MZČR – stanovisko ke zdravotnickým prostředkům](https://mzd.gov.cz/wp-content/uploads/2023/11/Stanovisko_MZ_zdravotnicke_prostedky.pdf)
- **Ministry of Health position on services under a trade licence** (from the same documents):
  - body and health services provided under a trade licence may only serve **preventive, regenerative or supportive** purposes;
  - the provider **may not claim any therapeutic character**;
  - the same service may be offered both under a trade licence (if non-therapeutic, **unconnected to any diagnosis** and purely regenerative or supportive) and as health care;
  - providing services that are by nature health services under a trade licence **may constitute an offence (cf. § 115 odst. 1 písm. a) ZZS)**.
  
  — [MZČR – laser opinion](https://mzd.gov.cz/wp-content/uploads/2024/02/Aktualizovane-stanovisko-Ministerstva-zdravotnictvi-k-pouziti-laserovych-pristroju-v-rezimu-zivnostenskeho-zakona.pdf); [MZČR – zdravotnické prostředky](https://mzd.gov.cz/wp-content/uploads/2023/11/Stanovisko_MZ_zdravotnicke_prostedky.pdf)
- **Masérské, rekondiční a regenerační služby** is a **vázaná živnost** requiring professional qualification. It covers sports, reconditioning and regeneration massage **on healthy individuals that does not induce a therapeutic process, excluding reflex massage**, plus regeneration services. — [BusinessInfo – FAQ vázané živnosti: masérské služby](https://www.businessinfo.cz/navody/faq-vazane-zivnosti-maserske-sluzby/)
- **Indicated massage is a health service.** A Ministry of Health document says that "this activity" falls within **health services** and is usually **indicated by a physician for a specific diagnosis** (e.g., lymphoedema, post-operative states) for treatment. The context suggests manual lymphatic drainage or therapeutic massage, and the extract did not say which MZČR document this was. The same material says the massage živnost is governed by the Trade Licensing Act together with NV 278/2008 Sb. and the Public Health Protection Act. — [MZČR document 127 (2026)](https://mzd.gov.cz/wp-content/uploads/2026/05/127.pdf); [MZČR – stanovisko k Dornově metodě a Breussově masáži](https://mzd.gov.cz/wp-content/uploads/wepub/16996/36933/Stanovisko%20MZ%20%C4%8CR%20k%20mo%C5%BEnosti%20aplikovat%20Dornovu%20metodu%20a%20Breussovu%20mas%C3%A1%C5%BE%20v%20r%C3%A1mci%20%C5%BEivnosti.pdf)
- **Some methods can run under the živnost.** The Ministry's opinion says the **Dorn method and Breuss massage** are not therapeutic methods used in health care and **can be run under the živnost**. A regional authority took a similar view of maderoterapie: allowed under a živnost, but without therapeutic claims. — [MZČR – Dorn/Breuss opinion](https://mzd.gov.cz/wp-content/uploads/wepub/16996/36933/Stanovisko%20MZ%20%C4%8CR%20k%20mo%C5%BEnosti%20aplikovat%20Dornovu%20metodu%20a%20Breussovu%20mas%C3%A1%C5%BE%20v%20r%C3%A1mci%20%C5%BEivnosti.pdf); [Zlínský kraj](https://zlinskykraj.cz/file/660594d5b291b6cebd054119)
- **Physiotherapist is a regulated non-physician health profession.** Zákon 96/2004 Sb. sets qualification requirements, lifelong learning and registration for these professions. — [dostupnyadvokat.cz – zákon o nelékařských zdravotnických povoláních](https://dostupnyadvokat.cz/zakony/o-nelekarskych-zdravotnickych-povolanich)
- **The profession is concerned about trade-licence physiotherapy.** Unie fyzioterapeutů has flagged physiotherapy practised under a trade licence as a problem and is considering a physiotherapists' chamber (which would need a law). — [Seznam Zprávy](https://www.seznamzpravy.cz/clanek/domaci-zivot-v-cesku-vikendove-kurzy-pochybna-osvedceni-experti-varuji-pred-obchodniky-se-zdravim-239465)
- **Example of a registered physiotherapy provider**: the company register lists "poskytování zdravotních služeb – ambulantní péče – obor fyzioterapeut – rehabilitační péče". — [podnikatel.cz – FyzioFit s.r.o.](https://www.podnikatel.cz/rejstrik/fyziofit-s-r-o-04358937/)
- **Insurance-covered physiotherapy** requires a physician's indication on the FT poukaz, valid for 14 days. — [VZP](https://www.vzp.cz/poskytovatele/informace-pro-praxi/poradna/kdy-pojistovna-nemusi-uhradit-peci-fyzioterapeuta)
- **Possible change to physiotherapists' powers**: Novinky reported a Ministry proposal letting physiotherapists choose procedures when the doctor gives only a treatment goal, planned **from 1 January 2026**. Whether it was enacted is unconfirmed. — [Novinky](https://www.novinky.cz/clanek/domaci-konec-behani-se-zadankou-lecbu-by-mohl-vybrat-i-fyzioterapeut-40467700)

**Documentation and retention (vyhláška 444/2024 Sb.)**
- Vyhláška č. 444/2024 Sb., o zdravotnické dokumentaci (dated 19 December 2024) has been **in force since 1 January 2025** and **replaces vyhláška 98/2012 Sb.** — [ARROWS](https://arws.cz/novinky-v-arrows/povinnosti-pri-vedeni-zdravotnicke-dokumentace); [krajta.slv.cz – 444/2024 ve znění od 1. 1. 2025](https://krajta.slv.cz/2024/444); [ePravo – Sb. 444/2024](https://www.epravo.cz/top/zakony/sbirka-zakonu/sb/2024/444); [praceamzda.cz](https://www.praceamzda.cz/predpisy/444-2024-sb)
- **Retention rules (VZP summary)**:
  - documentation is **generally kept for 5 years**, with specific periods by form of care (outpatient, day-case, inpatient) and specialty in **příloha č. 3**;
  - the period starts on **1 January of the year after the last entry**, unless the annex says otherwise;
  - where parts of a record fall under different periods, **the longest applies**;
  - records may not be destroyed before the period ends. Afterwards they are selected for archiving or destroyed.
  
  — [VZP – Doba uchování zdravotnické dokumentace](https://www.vzp.cz/o-nas/tiskove-centrum/otazky-tydne/doba-uchovani-zdravotnicke-dokumentace)
- The Ministry's simplification material (proposals) cut some periods, e.g., dentistry and gynaecology from 10 to 5 years, and long-term inpatient care from 40 to 20 years. A further amendment shortening retention for documents a provider merely received was reported. — [MZČR – Zjednodušení zdravotnické dokumentace](https://mzd.gov.cz/wp-content/uploads/wepub/15721/34184/Zjednodu%C5%A1en%C3%AD%20zdravotnick%C3%A9%20dokumentace.pdf); [Ekonomický deník](https://ekonomickydenik.cz/ministerstvo-uz-nebude-urcovat-co-ma-byt-v-osetrovatelske-dokumentaci-v-novele-vyhlasky-zrusi-i-dalsi-administrativni-nesmysly/)
- **Fee rules for insured care since 2026** (zákon 290/2025 Sb.): see question 2. — [Právní prostor](https://www.pravniprostor.cz/clanky/spravni-pravo/zakaz-registracnich-poplatku-u-lekare-je-jednou-z-novinek-roku-2026)

### Inferences
- **Clinic structure**:
  - physiotherapy, including self-pay physiotherapy and therapeutic or indicated massage, should run under the clinic's **healthcare authorisation**;
  - wellness or sports massage and conditioning training can run under trade licences;
  - marketing texts for the trade-licence part must avoid therapeutic claims.
  
  The booking system needs a per-service flag ("zdravotní služba" vs "živnost") that switches documentation duties, VAT, withdrawal rules and the GDPR basis.
- **Retention defaults**:
  - clinical documentation: **at least 5 years** from 1 January after the last entry, configurable per Annex 3 category;
  - booking and payment data: separate retention driven by accounting and tax rules (not verified here);
  - booking notes and other non-documentation health data: short and purpose-bound.
- **Massage clients who arrive with a diagnosis or doctor's recommendation** should be routed to the healthcare part of the clinic. This keeps the živnost massage within the "healthy individuals, no therapeutic process" boundary.

### Gaps
- **Not retrieved:** the Annex 3 retention period for **ambulatory physiotherapy or rehabilitation** under 444/2024. The earlier notes' "10 years for outpatient care" should **not** be used without checking Annex 3. Check: [ePravo – Sb. 444/2024](https://www.epravo.cz/top/zakony/sbirka-zakonu/sb/2024/444).
- **Not retrieved:** the exact wording of § 11 ZZS (authorisation) and the § 3 exclusions in the Trade Licensing Act.
- **UNVERIFIED:** the trade-licence type for **conditioning or personal training**. It is believed to be the free trade field "Provozování tělovýchovných a sportovních zařízení a organizování sportovní činnosti" (NV 278/2008 Sb.).
- **UNVERIFIED:** whether a physiotherapist may treat **self-paying** patients without a physician's indication (direct access) under zákon 96/2004 Sb. and vyhláška 55/2011 Sb., and whether the 2026 competence proposal passed.

---

## 6. Tax: the VAT exemption for healthcare (§ 58 ZDPH) vs massage and training, VAT on storno fees, and the status of EET 2.0

### Takeaway
**VAT exemption**
- **§ 58 ZDPH** exempts healthcare services and closely related services provided by **authorised providers**.
- The exemption follows the **provider and the nature of the service, not who pays**, so self-pay physiotherapy from a registered provider is exempt.
- Services outside these criteria, such as wellness massage and training, are **not exempt**. The specific rates (21 % vs 12 %) were not confirmed.

**VAT on storno fees: unsettled**
- CJEU *Société thermale* (C-277/05) treated a retained deposit as **compensation outside VAT**.
- Later cases on unused tickets (*Air France-KLM*) and early-termination amounts (*Vodafone Portugal* and the MEO line) treat such amounts as **consideration**.
- A 2026 Czech tax Q&A treats a hotel late-cancellation fee as payment for holding the room.

**EET 2.0 is law**
- **Zákon č. 180/2026 Sb., o evidenci tržeb a o změně některých dalších zákonů** was adopted 9 September 2026, reportedly signed 17 September and published 7 October 2026.
- Main effect from **1 January 2027** (January 2027 is a pilot period); some parts from 8 October 2026.
- It covers **payments in personal contact with the customer, including card and QR**. It does **not** cover bank transfers, invoices, or payment gateways and QR payments in e-shops.

### Cited Findings
**VAT exemption for healthcare (§ 58 ZDPH)**
- Under § 58 odst. 1, **healthcare services** are exempt, meaning health-care services and related services provided by **authorised entities**. The exemption depends on the provider and the health-care service, **not on who pays**. Services that do not meet the § 58 criteria are not exempt. — [BusinessInfo – Osvobození zdravotnických služeb od DPH](https://www.businessinfo.cz/navody/osvobozeni-zdravotnickych-sluzeb-od-dph/); [Finanční správa – Informace k uplatnění § 58 ZDPH](https://financnisprava.gov.cz/cs/dane/dane/dan-z-pridane-hodnoty/informace-stanoviska-a-sdeleni/dph-ve-zdravotnictvi/informace-k-uplatneni-58-zakona-c-235-2004-sb)
- **NSS 8 Afs 265/2017**: accommodation and catering provided alongside **outpatient** care are not closely related to the health service, so they are not exempt. The court noted that the VAT Directive distinguishes inpatient from outpatient care, while § 58 does not. The extract did not say which of these pages this came from. — [DAUC – DPH ve zdravotnictví](https://www.dauc.cz/clanky/10881/dph-ve-zdravotnictvi); [DAUC – Osvobození od DPH](https://www.dauc.cz/clanky/7800/osvobozeni-od-dph); [BusinessInfo](https://www.businessinfo.cz/navody/osvobozeni-zdravotnickych-sluzeb-od-dph/)

**VAT rates**
- Since 1 January 2024 there is a **single reduced rate of 12 %**, replacing 15 % and 10 %, and the **standard rate remains 21 %**. The 2024 consolidation package moved some items from reduced to standard rate. — [Pohoda – sazby DPH od 1. 1. 2024](https://portal.pohoda.cz/dane-ucetnictvi-mzdy/dph/sazby-dph-od-1-1-2024/); [DAUC – Konsolidační balíček 2024](https://www.dauc.cz/clanky/12045/konsolidacni-balicek-2024)

**VAT on cancellation and no-show fees**
- **C-277/05 *Société thermale d'Eugénie-les-Bains* (2007)**: a deposit a hotelier kept after the guest cancelled was **compensation for the loss**, with no direct link to a supply, so it was **outside VAT**. French law then required a cancelling business to repay double the deposit, which supported the compensation reading. — [Taxation (2007)](https://taxation.co.uk/articles/2007-08-29-5304-news-taxcase-societe-thermale); [Deloitte Ireland – VAT on termination payments](https://www.deloitte.com/ie/en/services/tax/research/VAT-on-termination-payments-Deloitte-Ireland.html); [Meridian – Compensation or consideration](https://meridianglobalservices.com/compensation-or-consideration-navigating-the-vat-fine-line-in-cjeu-case-law/)
- **Later CJEU cases point the other way**:
  - **C-43/19 *Vodafone Portugal***: fixed amounts paid on early termination of telecom contracts were held to be part of the agreed **remuneration**, so they are subject to VAT. The search extract did not give the MEO (C-295/17) reasoning.
  - **C-250/14 & C-289/14 *Air France-KLM / Brit Air* (23 Dec 2015)**: concerned VAT on purchased but **unused tickets** and when the tax becomes due.
  
  — [Deloitte Ireland](https://www.deloitte.com/ie/en/services/tax/research/VAT-on-termination-payments-Deloitte-Ireland.html); [Meridian](https://meridianglobalservices.com/compensation-or-consideration-navigating-the-vat-fine-line-in-cjeu-case-law/); [Publications Office – C-250/14 & C-289/14](https://op.europa.eu/sv/publication-detail/-/publication/b7b9e1dd-d933-11e5-8fea-01aa75ed71a1/language-cs)
- **Czech practice**:
  - A DAUC expert Q&A (June 2026, paywalled) on hotel late-cancellation and no-show fees for guaranteed bookings treats the fee as **payment for holding the room** (consideration), not as a contractual penalty or damages. — [DAUC – Sazba DPH a místo plnění u storno poplatků v hotelu](https://www.dauc.cz/detail-otazky/54361/sazba-dph-a-misto-plneni-u-storno-poplatku-v-hotelu)
  - A forum post citing an MF stance says penalties and damages are not subject to VAT. This is a weak source. — [BusinessCenter forum](https://businesscenter.podnikatel.cz/diskuse/148110/)

**EET 2.0: legislative history**
- The Chamber of Deputies passed the bill in third reading on 15 July 2026. It **overrode the Senate's amendments and definitively approved EET 2.0 on 9 September 2026**. — [BusinessInfo](https://www.businessinfo.cz/clanky/snemovna-schvalila-eet-2-0-moderni-evidence-trzeb-miri-do-senatu/); [DAUC](https://www.dauc.cz/aktuality/2093/snemovna-prehlasovala-senat-a-stvrdila-zavedeni-eet-2-0-jeji-fungovani-ministerstvo-vyrazi-vysvetlovat-podnikatelum-na-roadshow-po-cesku); [ePravo 121668](https://www.epravo.cz/top/clanky/eet-20-poslanecka-snemovna-schvalila-novou-podobu-evidence-trzeb-121668.html)
- **Signature**: the act was delivered to the President on **11 September 2026** and **signed on 17 September 2026**. This comes from a secondary tracker; an ePravo article of 17 September still said it was awaiting signature. — [lookuptax](https://lookuptax.com/tax-changes/czech-republic/eet-2-chamber-overrides-senate-2026); [ePravo 121639](https://www.epravo.cz/top/aktualne/eet-20-je-na-svete-od-ledna-2027-budou-podnikatele-evidovat-i-platby-kartou-a-qr-kodem-121639.html)
- **Publication**: **Zákon č. 180/2026 Sb., o evidenci tržeb a o změně některých dalších zákonů**, "ZÁKON ze dne 9. září 2026", made available in the Sbírka on **7 October 2026**.
  - Effective **partly from 8 October 2026** and **partly from 1 January 2027**.
  - § 2 applies to income-tax payers' recorded sales made in Czechia.
  
  — [Sbírka PDF (ePravo mirror) – Sb. 2026/180](https://www.epravo.cz/_dataPublic/sbirky/2026/Sb_2026_180_PZZ.pdf); [Právní prostor – Zákon o evidenci tržeb (vyšlo ve Sbírce)](https://pravniprostor.cz/zmeny-v-legislative/vyslo-ve-sbirce-zakonu/zakon-o-evidenci-trzeb-2)
- **Start of the recording duty**: Finanční správa says the duty starts **1 January 2027**, with **January 2027 as a "pilot" period**. A developer seminar took place on 23 June 2026. — [eet.gov.cz – developer seminar presentation](https://eet.gov.cz/files/EET2_Prezentace_Seminar_pro_vyvojare_23-6-2026.pdf)

**EET 2.0: what it covers**
- It covers payments made **in personal contact with the customer, including card and QR-code payments**, not only cash.
- **Payment-gateway and e-shop QR payments are not covered**, nor are ordinary bank transfers and invoice payments.
- An **"EET OFF"** regime lets the smallest flat-rate taxpayers (first paušální-daň band, income up to CZK 1 million) choose whether to record.
- The **certificate** can be downloaded from the MOJE daně portal from **1 November 2026** at the earliest.

— [ePravo 121639](https://www.epravo.cz/top/aktualne/eet-20-je-na-svete-od-ledna-2027-budou-podnikatele-evidovat-i-platby-kartou-a-qr-kodem-121639.html); [Finanční správa – Vláda schválila EET 2.0](https://financnisprava.gov.cz/cs/financni-sprava/media-a-verejnost/tiskove-zpravy-gfr/tiskove-zpravy-2026/vlada-schvalila-eet-2-0); [CNN Prima News](https://cnn.iprima.cz/prehledne-nepovinne-uctenky-i-vyjimka-pro-male-podnikatele-co-dela-a-koho-se-dotkne-nova-eet-511156); [lookuptax](https://lookuptax.com/tax-changes/czech-republic/eet-2-chamber-overrides-senate-2026)

**Conflicting source**: a comparison table on muj-pravnik.cz mentions a CZK 300,000 cash-revenue exemption that conflicts with the Ministry's framing. Not relied on. — [muj-pravnik.cz – EET 2.0](https://muj-pravnik.cz/eet-2-0-nova-evidence-trzeb/)

### Inferences
**VAT on the booking and invoice side**
- Tag each service with its VAT treatment:
  - physiotherapy by the registered provider: exempt under § 58, without the right to deduct input VAT;
  - massage and training: taxable at the applicable rate if the entity is a VAT payer.
- A **storno fee should follow the VAT treatment of the cancelled service**: none for an exempt physiotherapy slot.
- For taxable services, whether the fee is consideration or compensation is unsettled; the trend in CJEU case law since 2015 and the 2026 Czech Q&A lean towards "consideration". Ask a tax adviser.
- Wording the fee as compensation for a reserved capacity that could not be refilled (the Société thermale logic) supports the "outside VAT" argument, but is no guarantee.

**EET from 1 January 2027**
- Every payment taken **at reception** (cash, card terminal, QR shown at the desk), including storno or no-show fees collected in person, must be recorded through an EET 2.0-capable cash register or POS integration. Test it during the January 2027 pilot.
- Online prepayments through a payment gateway, bank transfers and invoiced payments are outside EET.
- Payments from health insurers are not in-person customer payments.

### Gaps
- **Not found:** any EET 2.0 exemption specific to healthcare providers or to VAT-exempt healthcare receipts. Check the published act (Sb. 180/2026).
- **UNVERIFIED:**
  - VAT rates for massage (wellness vs sport) and for personal training after 2024;
  - the VAT registration threshold (believed to be CZK 2,000,000 from 2025);
  - the CJEU "therapeutic purpose" case law for the § 58 exemption (C-307/01 d'Ambrumenil, C-91/12 PFC Clinic).
- **Not found:** any GFŘ or Koordinační výbor statement specific to storno or no-show fees for appointment-based services.
- **Not checked:** the duty to issue a receipt to a consumer (believed to be on request under zákon 634/1992 Sb.) and the receipt content required under EET 2.0.

---

## 7. Marketing consent (zákon 480/2004 Sb.) and cookie consent (§ 89 odst. 3 zákona 127/2005 Sb.) for an online booking widget

### Takeaway
**Commercial e-mail and SMS (zákon 480/2004 Sb.)**
- Commercial e-mail and SMS need **prior, provable consent**.
- The **existing-customer exception** (§ 7 odst. 3) lets a business use a contact obtained **in connection with a sale** to market **its own similar products or services**, but only if the customer had a clear, simple, free way to refuse **when the contact was collected and in every message**.
- Every commercial message must be marked as commercial, identify the sender and give a valid opt-out address.
- Fines run up to **CZK 10 million**.
- Zákon 480/2004 **remains in force**. The replacement *zákon o digitální ekonomice* (sněmovní tisk 69/0) was still in the Chamber in September 2026.

**Cookies (§ 89 odst. 3 ZEK)**
- Since **1 January 2022**, non-essential cookies need **prior opt-in consent**.
- Technical cookies necessary for a service the user requested are exempt.

### Cited Findings
**Commercial communications**
- **Existing-customer exception (§ 7 odst. 3)**:
  - a business that obtains a customer's e-mail **in connection with the sale of a product or service** may use it for commercial communications about **its own similar products or services**;
  - the customer must have a clear and distinct, simple and free way to refuse, and must keep that option **with every individual message**;
  - the way the contact was obtained must also comply with data-protection law.
  
  — [ÚOOÚ decision 2021](https://uoou.gov.cz/media/rozhodnuti/rozhodnuti-predsedy/2021/uoou-0028820-21.pdf); [ÚOOÚ 2024 – dokument č. 19](https://uoou.gov.cz/media/poskytnute-informace/2024/1742024-iii/19-cj-uoou-0432323-3-dokument-c-19.pdf)
- **General rule**: the addressee's **prior consent**, given **before** sending and **provable**. **Purchased databases** do not meet the informed-consent requirement. — [ÚOOÚ 1249417 (2020)](https://uoou.gov.cz/media/poskytnute-informace/2020/2342020/uoou-1249417.pdf); [Právní prostor – povinnosti při zasílání obchodních sdělení](https://pravniprostor.cz/clanky/obcanske-pravo/povinnosti-podnikatelu-pri-zasilani-obchodnich-sdeleni-zakaznikum-cast-i)
- ÚOOÚ says there is **no need to document how long a consent remains valid**, but **the option to refuse must be in every message sent**. — [ÚOOÚ 2024 – dokument č. 19](https://uoou.gov.cz/media/poskytnute-informace/2024/1742024-iii/19-cj-uoou-0432323-3-dokument-c-19.pdf)
- Each commercial message must be **clearly marked**, must not hide the **sender's identity**, and must contain a **valid address for refusal**. — [ÚOOÚ 2024 – dokument č. 98](https://uoou.gov.cz/media/poskytnute-informace/2024/1742024-1/98-cj-uoou-0162220-3-dokument-c-98.pdf)
- **Fines**: for mass or repeated sending without consent, a legal person can be fined up to **CZK 10,000,000** (§ 11). — [ÚOOÚ decision 2021](https://uoou.gov.cz/media/rozhodnuti/rozhodnuti-predsedy/2021/uoou-0028820-21.pdf); see also (not read) [ePravo – Kdo může dostat pokutu za spam](https://www.epravo.cz/top/clanky/kdo-muze-dostat-pokutu-za-spam-111205.html)

**Status of the replacement act**
- The **draft zákon o digitální ekonomice** is meant to replace zákon 480/2004 and reportedly **raises fines for unsolicited commercial messages**. The caretaker government approved it on **27 November 2025** and submitted it to the Chamber on **12 December 2025**. — [ePravo 120958](https://www.epravo.cz/top/clanky/navrh-noveho-zakona-o-digitalni-ekonomice-120958.html?pdf=1); [ePravo 118675](https://www.epravo.cz/top/clanky/regulace-obchodnich-sdeleni-ve-staronovem-kabate-podle-navrhu-zakona-o-digitalni-ekonomice-118675.html)
- It is **sněmovní tisk 69/0**:
  - the guarantee committee put it on the agenda of the 30th session (from 8 Sept 2026); the page was current as of 5 Sept 2026;
  - first reading was completed, and a motion to reject it failed;
  - it is heading to second reading;
  - **ČTÚ** would be the main supervisory authority (it implements the DSA).
  
  — [psp.cz – sněmovní tisk 69](https://psp.cz/sqw/text/historie.sqw?o=10&T=69); [ČT24](https://ct24.ceskatelevize.cz/clanek/domaci/poslanci-maji-jednat-o-digitalni-ekonomice-a-potencialne-i-o-svych-platech-371147); [DAUC – míří do druhého čtení](https://www.dauc.cz/aktuality/1833/navrh-zakona-o-digitalni-ekonomice-miri-do-druheho-cteni)

**Cookies**
- An amendment to the Electronic Communications Act, approved by the Chamber on 15 September 2021, moved cookies from opt-out to **opt-in from 1 January 2022**. Operators need **prior, provable, active consent** to the scope and purpose before setting non-essential cookies. — [Pohoda – cookies po novele ZEK](https://portal.pohoda.cz/zakon-a-pravo/legislativa-pro-podnikatele/cookies-po-novele-zakona-o-elektronickych-komunika); [Pohoda – aktivní souhlas](https://portal.pohoda.cz/zakon-a-pravo/legislativa-pro-podnikatele/aktivni-souhlas-uzivatele-pro-prijeti-cookies-na-webu/)
- **ÚOOÚ position**:
  - its 2024 presentation says **technical cookies necessary for an internet application to work are exempt** from consent;
  - its 2023 decisions distinguish non-technical cookies (consent required) from technical cookies necessary for a service the data subject expressly requested (**§ 89 odst. 3, second sentence**);
  - consent must meet **GDPR conditions**, including being freely given.
  
  — [ÚOOÚ seminar 2024 – praxe v oblasti cookies](https://uoou.gov.cz/media/seminare-uoou/prezentace/2024-06-12-p04-praxe-uoou-v-oblasti-cookies.pdf); [ÚOOÚ 2023 – dokument č. 61](https://uoou.gov.cz/media/poskytnute-informace/2023/17-8-2023/61-cj-uoou-0302423-3-dokument-c-61.pdf); [ÚOOÚ 2023 – dokument č. 62](https://uoou.gov.cz/media/poskytnute-informace/2023/17-8-2023/62-cj-uoou-0305623-3-dokument-c-62.pdf)
- **Conflicting older source**: an undated Právní prostor article describes § 89(3) as opt-out and in conflict with Directive 2002/58/EC. It almost certainly predates 2022 and is superseded. — [Právní prostor – Cookies a požadavky na souhlas](https://www.pravniprostor.cz/clanky/obcanske-pravo/cookies-pozadavky-na-souhlas)

### Inferences
**Marketing consents in the data model**
- Store consent per channel (e-mail, SMS) with: source, timestamp, text version, and IP or user agent for online consents.
- Record an "obtained in connection with a sale" flag, plus whether the client objected at that moment. This qualifies the contact for the existing-customer exception, for **the clinic's own similar services only**.
- Offer an unticked opt-in plus an "I don't want offers" option at booking.
- Put a one-click unsubscribe in every marketing e-mail and an opt-out route in every marketing SMS.
- Hard-block contacts that have opted out.

**Transactional messages**
- Booking confirmations, reminders, storno or no-show notices and package-expiry notices should carry **no promotional content**, so they stay outside "obchodní sdělení". The § 2(f) definition is UNVERIFIED.
- For a healthcare provider, never segment marketing by diagnosis.

**Booking widget**
- If the widget uses only strictly necessary cookies (session, CSRF, load balancing, the booking state the user asked for), no consent banner is needed for them.
- Analytics, marketing pixels or third-party embeds that set non-essential cookies require **opt-in before they load**. Ship the widget without them by default.

### Gaps
- **UNVERIFIED:**
  - the statutory definition of "obchodní sdělení" (§ 2 písm. f) zákona 480/2004 Sb.) and an authority statement that service reminders fall outside it;
  - the number of the 2021 act that amended § 89(3) ZEK (believed to be zákon 374/2021 Sb.).
- **Not found:** ÚOOÚ cookie-banner design guidance (e.g., equal "reject all" button), and 2024–2026 enforcement statistics for spam.
- **Status unknown after September 2026:** the zákon o digitální ekonomice. If adopted, it would replace zákon 480/2004, change the fine levels and possibly the supervisory authority for commercial communications.

---

## 8. Objective check: status of every item marked UNVERIFIED in the earlier notes (storno_omluvenky_pravo.md)

### Takeaway
The table covers **29 items** from the earlier notes, plus one new finding (fees in insured care).

| Status | Count | Items |
|---|---|---|
| Verified or updated | **11** | § 1837 j) wording; healthcare exclusion (in substance); § 1834 / § 1823; 374/2022 date; withdrawal-button transposition; Recital 91; masérské vázaná živnost; cookies opt-in; § 58 (in substance); EET 2.0; ZoDE status |
| **Corrected** | **2** | § 1815 now says "zneužívajícímu"; vyhláška 98/2012 replaced by **444/2024** |
| Resolved | **1** | ARROWS "ban" is case law, not enacted law |
| Partly verified | **7** | § 1837 a); §§ 1992 / 2048 (case law yes, texts no); pre-contractual information; vouchers; 372/2011 authorisation; VAT rates; VAT on storno fees |
| Still open or not checked | **8** | "Leisure" classification of massage and training; Directive 93/13 annex; GDPR article texts; 110/2019; training licence; DPF / NIS2 / e-health / EHDS; § 2(f) zákona 480/2004; VAT threshold |

### Cited Findings
| Earlier UNVERIFIED item | New status | Key source |
|---|---|---|
| § 1837 j) leisure exception wording | **VERIFIED** (2020/2021 text): "o ubytování, dopravě, stravování nebo využití volného času, pokud podnikatel tato plnění poskytuje v určeném termínu". Post-6 Jan 2023 letter **not read**. | [podnikatel.cz](https://www.podnikatel.cz/zakony/novy-obcansky-zakonik/zneni-20210101/f4584761/) |
| § 1837 a) services fully performed (2023 "acknowledgement" rule) | **PARTIAL**: fully performed services are excluded "za zákonem stanovených podmínek"; exact 2023 wording **UNVERIFIED** | [Pohoda](https://portal.pohoda.cz/pro-podnikatele/jak-zacit-podnikat/marketing-a-obchod/odstoupeni-od-smlouvy-pres-on-line-rozhrani-podnikatele-ceka-nove-tlacitko/) |
| Are physiotherapy, massage or training "leisure"? | **STILL OPEN**: CJEU C-96/21 conditions; ePravo opinion that courses fall within; no Czech case | [BAILII C-96/21](https://www.bailii.org/eu/cases/EUECJ/2022/C9621.html); [ePravo 92254](https://epravo.cz/top/clanky/spotrebitele-a-vyuziti-volneho-casu-dnes-a-zitra-92254.html) |
| Healthcare carve-out (art. 3(3)(b) CRD; § 1840 OZ) | **VERIFIED in substance**: directive text verified; Czech commentary confirms § 1840 excludes healthcare contracts; exact Czech letter **UNVERIFIED** | [legislation.gov.uk art. 3](https://www.legislation.gov.uk/eudr/2011/83/article/3); [Právní prostor](https://www.pravniprostor.cz/clanky/ostatni-pravo/smlouva-o-peci-o-zdravi-problematicke-aspekty-jejiho-uzavreni-ukonceni-pri-poskytovani-zdravotnich-sluzeb) |
| Proportionate price after a started service | **VERIFIED**: § 1834 (proportionate part, usual price if excessive); § 1823 (express request in text form) | [mesec.cz § 1834](https://www.mesec.cz/zakony/obcansky-zakonik-2014/f4584853/) |
| Zákon 374/2022 Sb. effective 6 Jan 2023 | **CONSISTENT**: 374/2022 repealed NV 363/2013; consolidated versions dated 6 Jan 2023 exist | [Právní prostor](https://pravniprostor.cz/zmeny-v-legislative/vyslo-ve-sbirce-zakonu/narizeni-o-vzorovem-pouceni-o-pravu-na-odstoupeni-od-smluv-uzavrenych-distancnim-zpusobem-nebo-mimo-obchodni-prostory-vzorovem-formulari-pro-odstoupeni-od-techto-smluv) |
| Withdrawal button: applicability and Czech transposition | **VERIFIED and UPDATED**: § 1830a; Chamber 10 Jul 2026; Senate 19 Aug 2026; effective 1 Jan 2027; covers all online consumer contracts. **Sbírka publication not verified.** | [Advokátní deník](https://advokatnidenik.cz/2026/08/20/lepsi-ochranu-spotrebitelu-u-uzavirani-online-smluv-schvalil-senat/) |
| § 1815 wording | **CORRECTED**: current text "Ke **zneužívajícímu** ujednání se nepřihlíží, ledaže se jej spotřebitel dovolá" ("nepřiměřenému" was the original 2014 wording) | [mesec.cz](https://www.mesec.cz/zakony/obcansky-zakonik-2014/f7484945/) |
| Directive 93/13 annex 1(d) and 1(e) | **STILL UNVERIFIED** | — |
| § 1992 odstupné; §§ 2048–2052 smluvní pokuta | **STILL UNVERIFIED** (texts); case law on penalties in consumer T&Cs **verified** (I. ÚS 3512/11; NS 33 Cdo 961/2017; 33 ICdo 45/2017) | [ARROWS](https://arws.cz/novinky-v-arrows/smluvni-pokuty); [ePravo 107934](https://www.epravo.cz/top/clanky/jeste-jednou-k-zakazu-umisteni-smluvnich-pokut-v-obchodnich-podminkach-spotrebitelskych-smluv-107934.html) |
| ARROWS "ban on contractual penalties in consumer T&Cs" | **RESOLVED**: not enacted law. It derives from ÚS case law (2013), is contested, and was qualified by NS (2018). No general statutory ban found; only an energy-sector cap (Lex OZE III, 2025). | [ePravo 107061](https://www.epravo.cz/top/clanky/absolutni-zakaz-smluvnich-pokut-v-obchodnich-podminkach-spotrebitelskych-smluv-opravdu-107061.html); [ERÚ](https://eru.gov.cz/sites/default/files/obsah/prilohy/20250801tzpravaspotrebitelulexozeiii.docx) |
| Pre-contractual information (§ 1811, § 1820, ADR) | **PARTIAL**: § 1820 odst. 1 písm. h) (proportionate price) confirmed; rest **UNVERIFIED** | [Pohoda](https://portal.pohoda.cz/pro-podnikatele/jak-zacit-podnikat/marketing-a-obchod/odstoupeni-od-smlouvy-pres-on-line-rozhrani-podnikatele-ceka-nove-tlacitko/) |
| Vouchers and permanentky | **PARTIAL**: reported NS holding that a one-year lapse without compensation is not unfair (case number not retrieved); SOS v Kasa.cz outcome still unknown | [ePravo 111078](https://www.epravo.cz/top/clanky/jak-na-darkove-poukazky-111078.html) |
| No-show fees in insured healthcare | **NEW**: zákon 290/2025 Sb. (from 1 Jan 2026) bans registration fees and conditioning covered care on payment; VZP: a penalty only if pre-agreed and not a condition of treatment | [Právní prostor](https://www.pravniprostor.cz/clanky/spravni-pravo/zakaz-registracnich-poplatku-u-lekare-je-jednou-z-novinek-roku-2026); [VZP](https://www.vzp.cz/o-nas/tiskove-centrum/otazky-tydne/smluvni-pokuta-za-nedodrzeni-terminu-vysetreni) |
| GDPR art. 4(15), 9, 28, 30, 32 | **STILL UNVERIFIED** (texts not retrieved) | — |
| Recital 91: no large-scale processing, DPIA not mandatory for an individual practitioner | **VERIFIED**; WP243 hospital example confirmed via commentary | [gdpr-info.eu](https://gdpr-info.eu/recitals/no-91/) |
| Zákon 110/2019 Sb. | **NOT CHECKED** | — |
| Healthcare-provider authorisation (372/2011) | **PARTIAL**: § 2(1) definition; MZČR trade-licence boundary; § 115(1)(a) offence; § 11 wording **UNVERIFIED** | [MZČR](https://mzd.gov.cz/wp-content/uploads/2024/02/Aktualizovane-stanovisko-Ministerstva-zdravotnictvi-k-pouziti-laserovych-pristroju-v-rezimu-zivnostenskeho-zakona.pdf) |
| Vyhláška 98/2012 retention (10 years) | **CORRECTED**: replaced by **vyhláška 444/2024 Sb.** from 1 Jan 2025; general rule 5 years plus Annex 3 exceptions; physiotherapy period **UNVERIFIED** | [VZP](https://www.vzp.cz/o-nas/tiskove-centrum/otazky-tydne/doba-uchovani-zdravotnicke-dokumentace) |
| Masérské, rekondiční a regenerační služby = vázaná živnost | **VERIFIED** | [BusinessInfo](https://www.businessinfo.cz/navody/faq-vazane-zivnosti-maserske-sluzby/) |
| Trade-licence type for training | **STILL UNVERIFIED** | — |
| DPF / Latombe, NIS2, e-health, EHDS | **NOT CHECKED** (outside this pass) | — |
| Cookies: opt-in since 1 Jan 2022 | **VERIFIED** (ÚOOÚ 2023 decisions, 2024 seminar) | [ÚOOÚ seminar 2024](https://uoou.gov.cz/media/seminare-uoou/prezentace/2024-06-12-p04-praxe-uoou-v-oblasti-cookies.pdf) |
| § 2 písm. f) zákona 480/2004 (definition) | **STILL UNVERIFIED** | — |
| ZoDE status | **UPDATED**: still in the Chamber (tisk 69/0), first reading done (Sept 2026); 480/2004 still applies | [psp.cz](https://psp.cz/sqw/text/historie.sqw?o=10&T=69) |
| § 58 ZDPH exemption | **VERIFIED in substance**; CJEU therapeutic-purpose cases **UNVERIFIED** | [BusinessInfo](https://www.businessinfo.cz/navody/osvobozeni-zdravotnickych-sluzeb-od-dph/) |
| VAT rates for massage and training | **PARTIAL**: 12 %/21 % structure verified; service-specific rates **UNVERIFIED** | [Pohoda](https://portal.pohoda.cz/dane-ucetnictvi-mzdy/dph/sazby-dph-od-1-1-2024/) |
| VAT threshold CZK 2m | **STILL UNVERIFIED** | — |
| VAT on cancellation fees | **PARTIAL**: C-277/05 and C-43/19 confirmed (secondary); Czech practice unsettled | [Deloitte IE](https://www.deloitte.com/ie/en/services/tax/research/VAT-on-termination-payments-Deloitte-Ireland.html) |
| EET 2.0 (approved 9 Sept 2026; start 1 Jan 2027?) | **VERIFIED and UPDATED**: zákon č. **180/2026 Sb.**, published 7 Oct 2026; main effect 1 Jan 2027 (pilot January 2027); partly from 8 Oct 2026 | [Sb. 2026/180](https://www.epravo.cz/_dataPublic/sbirky/2026/Sb_2026_180_PZZ.pdf); [eet.gov.cz](https://eet.gov.cz/files/EET2_Prezentace_Seminar_pro_vyvojare_23-6-2026.pdf) |

### Inferences
**What the final report can state clearly as allowed, under the stated conditions**
1. Storno and no-show fees for **massage and training**, and for **self-pay physiotherapy**, if they are proportionate, graded, transparently shown and accepted in the booking flow, and reciprocal.
2. **No statutory 14-day withdrawal right** for physiotherapy from a registered provider (healthcare exclusion), or, very probably, for dated massage or training slots (leisure exception). The latter should be stated to the client before booking.
3. A **14-day withdrawal right for online-sold non-health packages, permanentky and vouchers**, with proportionate deduction if started on express request, and a **withdrawal button from 1 January 2027**.
4. **Insured physiotherapy**: no prepayments, deposits or registration fees, and no making booking conditional on accepting a penalty.
5. **EET 2.0** recording of in-person payments from 1 January 2027.
6. **Marketing** only with consent or under the own-similar-services customer exception with opt-out in every message.
7. **Cookies**: opt-in only for non-essential cookies.

**What must stay hedged:** the exact current statutory wording (§ 1840, § 1837 after 2023, § 1992, § 2048 ff., GDPR articles), the Annex 3 retention period for physiotherapy, VAT on storno fees, and VAT rates for massage and training.

### Gaps
- Every statutory text marked UNVERIFIED above should be checked against [zakonyprolidi.cz](https://www.zakonyprolidi.cz/cs/2012-89), [e-Sbírka](https://www.e-sbirka.cz) or [EUR-Lex](https://eur-lex.europa.eu) before publication. That access was not available in this session, and the 60-search budget is exhausted.
