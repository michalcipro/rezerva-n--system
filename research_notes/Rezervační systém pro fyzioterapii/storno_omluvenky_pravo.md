# Storno, omluvenky a náhrady: oborové normy, důkazy a český/EU právní rámec (fyzioterapie, masáže, kondiční trénink; stav 2025–2026)

> **Not legal advice.** These are research notes for a booking-system design, not a legal opinion. A Czech lawyer should check the final obchodní podmínky, the consent texts and the GDPR set-up before going live.
>
> **How the research was done (date: 2026-10-14).** WebFetch could not resolve any domain in this environment. DNS lookups failed for cochrane.org, zakonyprolidi.cz, kurzy.cz, epravo.cz, pravniprostor.cz, ncbi.nlm.nih.gov, eur-lex.europa.eu and uoou.gov.cz. Partway through, the shared WebSearch budget for the turn ran out (limit of 200 calls across all agents). As a result:
> (1) Every "Cited Findings" item below comes from **search-result excerpts, not full-text reads**. Spot-check figures and quotes against the linked page before publishing them.
> (2) Some core statutory points (§ 1837 OZ, § 58 ZDPH, cookies under § 89 ZEK, GDPR art. 9, retention under vyhláška 98/2012) **could not be verified in this session**. They appear only in the "Gaps" sections, labelled **UNVERIFIED (background knowledge)**, each with a link to the primary text where it should be checked. Treat them as hypotheses to confirm, not as findings.

---

## 1. Industry norms and evidence: cancellation windows and fees, no-show rates in physiotherapy and outpatient care, and the effect of reminders, deposits and prepayment

### Takeaway
Across massage, physiotherapy and personal training, a **24-hour cancellation window is the dominant norm**. Late cancellations are typically charged at **50–100 %**, and no-shows usually at **100 %** of the price. Per-appointment no-show rates in outpatient physiotherapy and rehabilitation mostly fall at **~10–21 %**.

Reminder messages have by far the strongest evidence:
- In a meta-analysis, no-shows fell from **21 % to 15 % (RR 0.75)**.
- Several reminders worked better than one.
- Stating the cost of a missed appointment cut non-attendance from **11.1 % to 8.4 %** in two large RCTs.

Evidence that **fees or deposits** reduce no-shows is thin. It is mostly observational, anecdotal or vendor-reported.

### Cited Findings

**No-show rates in physiotherapy and rehabilitation**
- In a large US commercial physical-therapy dataset (musculoskeletal care episodes; PLOS ONE 2021), **73 % of patients missed at least one appointment** in a care episode. Higher no-show odds were associated with insurance type, smoking, higher BMI and prior cancellations, and the prediction model had only moderate discrimination. This is a per-patient-episode figure, not a per-appointment rate. — [PMC8162651](https://pmc.ncbi.nlm.nih.gov/articles/PMC8162651); [RePEc/IDEAS record](https://ideas.repec.org/a/plo/pone00/0251336.html)
- A US nationwide survey of physical-therapy practices (UNLV DPT thesis, 2015; 634 respondents reporting rates) found a **mean self-reported no-show rate of 10.4 % (SD ±7.43)**. — [UNLV Theses](https://oasis.library.unlv.edu/thesesdissertations/2323/)
- At a Calgary physiotherapy clinic (International Journal of Physiotherapy, 2021), the combined **no-show and cancellation rate was 20.6 %**. The top reasons were forgetting, family or personal emergencies, lack of transport and scheduling conflicts. — [DOAJ record](https://doaj.org/article/67c77bf890734421bcfc859c12837a06)
- For the initial PT evaluation (Ohio State, 6,971 scheduled patients), **10 % (n = 698) did not show**. Medicaid coverage, unemployment and longer waiting times raised the odds; age ≥ 40 lowered them. — [Briggs Lab, OSU](https://u.osu.edu/briggslab/2021/03)
- In an outpatient adult rehabilitation department in Riyadh (cross-sectional study, published 2025), no-shows made up **21 % of appointments** (336 patients). The most common reason given in follow-up interviews was being sick that day. — [PMC12041131](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12041131/)
- A 2008 US trade article gave a baseline no-show rate of **5–7 % for medical offices**. — [American Medical News](https://amednews.com/article/20080602/business/306029998/5/)

**Reminders (SMS, e-mail and voice)**
- **Cochrane review** (Gurol-Urganci et al., CD007458; last updated 2013, searches to August 2012): 8 RCTs with 6,615 participants. Low-to-moderate-quality evidence shows that SMS reminders **increase attendance compared with no reminder or postal reminders**, and have **the same effect as phone-call reminders**. Two studies found SMS **cheaper per attendance than phone calls**. No study reported in detail on adverse effects such as privacy loss or failed delivery. — [Cochrane Library abstract](https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD007458/abstract); [Cochrane evidence page](https://www.cochrane.org/evidence/CD007458_mobile-phone-messaging-reminders-attendance-healthcare-appointments)
- From the same review: SMS compared with no reminder gave **RR 1.14 for attendance** (moderate quality, 7 studies, 5,841 participants). — [PubMed 24310741](https://pubmed.ncbi.nlm.nih.gov/24310741/); [SUPPORT summary](https://supportsummaries.epistemonikos.org/support-summaries/show/does-the-use-of-mobile-phone-messaging-reminders-increase-attendance-at-healthcare-appointmentsa)
- **Robotham et al., BMJ Open 2016** (searches to April 2015; 26 articles, 21 in the primary meta-analysis):
  - Patients who received a notification were **23 % more likely to attend** (RR 1.23; 67 % vs 54 %).
  - **No-shows fell from 21 % to 15 % (RR 0.75)**.
  - **Several notifications worked significantly better than one.**
  - Voice notifications appeared more effective than text.
  - Results held when accounting for risk of bias, region and year.
  
  — [BMJ Open](https://bmjopen.bmj.com/content/6/10/e012116); [PMC5093388](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5093388/); [PubMed 27798006](https://pubmed.ncbi.nlm.nih.gov/27798006/)
- **Physiotherapy-specific RCT**: Taylor, Bottrell, Lawler & Benjamin, *Arch Phys Med Rehabil* 2012;93:21–26.
  - Single-blinded RCT in two metropolitan public-hospital PT outpatient departments, 679 patients (342 received an SMS reminder, 337 no reminder).
  - Primary outcome: non-attendance without cancellation.
  - **Non-attendance in the no-reminder group was 16 %.**
  - The authors concluded that SMS reminders can reduce non-attendance in PT outpatient clinics. PEDro score 8/10.
  
  — [PEDro record](https://search.pedro.org.au/search-results/record-detail/30908); [UTAS figshare](https://figshare.utas.edu.au/articles/journal_contribution/Mobile_telephone_short_message_service_reminders_can_reduce_nonattendance_in_physical_therapy_outpatient_clinics_A_randomized_controlled_trial/22979729); related trial registration [ACTRN12609000862246](https://anzctr.org.au/ACTRN12609000862246.aspx)
- **Message wording matters**: Hallsworth et al., PLoS ONE 2015. Two RCTs in UK hospital outpatient clinics (Trial 1: 10,111 participants, Nov 2013–Jan 2014; Trial 2: 9,848, Mar–May 2014), with SMS reminders sent **5 days in advance**.
  - A message stating the **specific cost to the health system of a missed appointment** reduced non-attendance to **8.4 %**, compared with **11.1 %** for the existing message. Trial 2 replicated the result.
  - The same idea in general terms gave 9.9 % (OR 1.22, 95 % CI 1.00–1.48).
  - The UK government summary describes the best wording as a **23 % reduction**.
  - A correction notice for the paper exists; it was not examined.
  
  — [UKHSA research portal](https://researchportal.ukhsa.gov.uk/en/publications/stating-appointment-costs-in-sms-reminders-reduces-missed-hospita/); [GOV.UK summary](https://gov.uk/government/publications/reducing-missed-hospital-appointments-using-text-messages/a-zero-cost-way-to-reduce-missed-hospital-appointments); [Harvard DASH](https://dash.harvard.edu/handle/1/22856929)
- A 2017 meta-analysis in HIV care found that text reminders reduced non-attendance (**OR 0.66, 95 % CI 0.48–0.92**; 7 studies; I² 52 %). — [PubMed 27477580](https://pubmed.ncbi.nlm.nih.gov/27477580/)
- UK musculoskeletal-physiotherapy evidence material repeats the Cochrane result: texting beats no reminder or postal reminders, and phone calls perform somewhat better. — [Keele CAT (PDF)](https://www.keele.ac.uk/media/k-web/k-research/iau/cats/ahpfullcats/ahr-91-texting-consultation.pdf)
- A physiotherapy software vendor advises sending a reminder **about 48 hours before the visit, so the patient can still cancel within the policy window**. — [Physitrack](https://www.physitrack.com/insights/reduce-patient-no-shows-small-physical-therapy-practice)

**Fees, deposits and prepayment**
- A 2023 review, "To charge or not to charge: reducing patient no-show", found two studies on fines, both showing reductions:
  - A **$30 fine** at a mental-health outpatient clinic cut the no-show rate **from 20.1 % to 9.27 %**.
  - A 2016 study at King Abdullah University Hospital (Jordan) found that fees significantly increased attendance, but from an unusually high baseline, so the result may not transfer.
  
  — [PMC10408071](https://pmc.ncbi.nlm.nih.gov/articles/PMC10408071/)
- The commentary and review literature describes the evidence that **no-show fees consistently improve attendance as small or limited**. It also notes:
  - Fees may encourage patients to cancel in advance, but this is little researched.
  - Critics argue that penalties fall hardest on vulnerable patients and suggest a **warning first, with fees only for repeat occurrences**.
  
  The search excerpt did not show which sentence comes from which of these sources. — [PMC10408071](https://pmc.ncbi.nlm.nih.gov/articles/PMC10408071/); [Becker's Hospital Review](https://www.beckershospitalreview.com/quality/hospital-physician-relationships/no-show-fees-in-healthcare-are-they-effective/); [PMC10715470 (arguments for and against non-attendance fees in public consultation documents)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10715470/)
- For **deposits**, only anecdotal evidence was found. Some US physicians who required a deposit, cashed in the event of a no-show, reported patients who were more reliable about attending or at least giving notice. — [American Medical News, 2008](https://amednews.com/article/20080602/business/306029998/5/)
- Vendor claims, without named studies:
  - A deposit of 10–20 % of the service price cuts no-shows by 40–60 % ([SchedulingKit](https://schedulingkit.com/blog/complete-guide-reducing-no-shows)).
  - Deposit policies typically bring no-shows down by "40 % or more" ([MyMedio](https://mymedio.hu/deposit-fees-in-healthcare/)).
  - The booking platform Booksy reports that clients commit more after paying upfront or when they know about a late-cancellation fee; its methods are not disclosed. Booksy has launched a no-show/cancellation-protection feature. — [SalonToday](https://www.salontoday.com/1082310/booksy-introduces-no-show-cancellation-protection-feature)

**Published policies (examples, not standards)**
- **Massage.** These are policies posted by individual US therapists on AMTA/ABMP member sites, not an AMTA standard.
  - Most require **24 h notice**.
  - Late cancellation costs **the full price or 50 %**; a no-show usually costs the **full price** (some charge 50 %).
  - Some require a **50 % deposit to book again after a no-show**, payment before the next appointment, or refuse further service until the fee is paid.
  - Some charge flat fees instead (e.g., $10 for the first miss, $35 after that).
  
  — [AMTA member page](https://massage207melissa.amtamembers.com/hours); [ABMP member page](https://groundedmountainmassage.abmp.com/hours-and-scheduling); [AMTA member page](https://handsofhope5038.amtamembers.com/cancellation-no-show-policy); [ABMP member page](https://massagebyjessica.abmp.com/cancellation-policy)
- **Physiotherapy**
  - A UK clinic charges the full appointment price for less than 24 h notice or failure to attend, but "will always take exceptional circumstances into account". — [Cure Clinics](https://physiotherapy.cureclinics.uk/cancellation-policy)
  - An Australian clinic charges a fixed late-cancellation fee and notes that motor-accident and workers'-compensation insurers generally do not cover non-attendance charges. — [Sport & Spinal Physio](https://sportandspinalphysio.com.au/cancellation-policy/)
  - An Ontario clinic requires notice **before 3:00 pm on the business day before the appointment** and charges **50 %**. Matching this to the NHR Centre PDF is inferred from the search excerpt. — [NHR Centre policy PDF](https://nhrcentre.com/wp-content/uploads/2026/03/late-cancellation-missed-appointmentpolicy.pdf)
- **Enforcement practice recommended by a PT vendor**: waive the **first** late cancellation, explain the rule and record the warning; after that, apply the fee unless a defined exception applies. — [Physitrack](https://www.physitrack.com/insights/reduce-patient-no-shows-small-physical-therapy-practice)
- **UK legal commentary**, a useful parallel for unfair-terms analysis:
  - The main legal risk is whether the **wording, timing and process are transparent** enough to be enforceable.
  - The law focuses on fairness, transparency and whether the patient had a real chance to see the terms before committing.
  - The terms should say whether fees can be **charged automatically to a stored card or direct debit**.
  
  — [Sprintlaw UK](https://sprintlaw.co.uk/articles/cancellation-and-refund-terms-for-uk-physiotherapy-clinics/)
- **Personal training**
  - Illinois Campus Rec: 24 h notice, otherwise one session is forfeited; **packages expire one year after purchase**. — [Illinois](https://campusrec.illinois.edu/fitness/personal-training/packages)
  - University of Virginia: no contact within 24 h means the session is forfeited, with no credit or refund. — [UVA Rec](https://rec.virginia.edu/node/167641)
  - STARplex (Australia): less than 12 h notice may forfeit the full session fee; high-demand trainers may require 24 h. Validity is **scaled to pack size: a 5-pack lasts 10 weeks, a 10-pack 12 weeks, a 20-pack 26 weeks**. — [STARplex](https://starplex.com.au/personal-training-terms-conditions)
  - Morehead State: the trainer waits **at most 15 minutes**, after which the late client forfeits the session. — [Morehead State](https://moreheadstate.edu/student-life/wellness-safety/recreation-wellness/fitness/personal-training/personal-training-policies)
  - UPEI: packages must be used **within 6 months**; unused sessions expire without refund. — [UPEI](https://d9.upei.ca/nodisplay/accordionleaf/personal-training-policies)
  - Virgin Active (South Africa): if **the trainer** cancels with less than 24 h notice, the client gets a **free replacement session**. — [Virgin Active SA](https://hello.virginactive.co.za/support/solutions/articles/201000127508-personal-training-pt-hyrox-pack-terms-conditions)

### Inferences
- **Parameters the engine should support**, based on how often each appears above:
  - a free-cancellation deadline in hours (default 24 h; optionally 48 h, or "by 15:00 the previous working day");
  - **separate** fee rates for late cancellation and for no-show (common pattern: 50 % and 100 %);
  - a lateness threshold after which the visit counts as a no-show (e.g., 15 min);
  - a counter that waives the first offence;
  - a staff override for exceptional circumstances, with a recorded reason;
  - compensation for clients when the provider cancels late (free replacement session or credit);
  - package validity scaled to package size;
  - a "deposit required after N no-shows" flag, rather than deposits for everyone.
- **Reminders are the highest-evidence lever.**
  - Send at least two: one about 48 h before, so it lands before the free-cancellation deadline, and one closer to the visit.
  - Include one-click cancel and reschedule links.
  - Consider wording that states the consequence (the Hallsworth effect).
  - In Czechia, keep reminders strictly transactional (see question 5).
- Because the evidence that fees work is weak, **present fees as fair cost recovery with graduated enforcement**, not as the main tool against no-shows. Track the no-show rate, late-cancellation rate and refill rate of freed slots so their effect can be measured locally.
- A plausible baseline for a Czech physiotherapy clinic is roughly 10–20 % missed or late-cancelled visits without reminders. This is extrapolated from international data; no Czech data was found.

### Gaps
- No peer-reviewed controlled study was found on how **deposits or prepayment** affect no-shows in physiotherapy, massage or fitness. The vendor percentages above are unverified marketing claims.
- The exact no-show rate in the SMS group of Taylor 2012 could not be confirmed, because the excerpt was truncated.
- No **Czech or Central European** data on physiotherapy or massage no-show rates was found.
- No guidance from a professional body on cancellation fees was found, either from the UK CSP or from Czech bodies such as UNIFY ČR or ČKFz.
- One search summary said that appointments booked more than about 8 weeks ahead are missed more often. The source could not be identified, so it is not used.

---

## 2. Czech practice: how physiotherapy clinics, massage studios, fitness studios and course providers word storno podmínky and omluvenky/náhrady, and typical limits

### Takeaway
Only one kind of real Czech wording could be retrieved before the search budget ran out: **Slevomat vouchers for physiotherapy and massage** from several providers. Their terms are:
- one free reschedule up to **24 h** before the appointment;
- the voucher is **forfeited in full** after a later change or a no-show;
- a voucher with a booked date cannot be cancelled;
- a voucher without a date can be cancelled within the statutory **14 days**.

No Czech clinic, studio, fitness or course terms covering **omluvenky**, makeup windows, excuse limits per package, or extensions of a **permanentka** could be retrieved. This is a major gap.

### Cited Findings
- Slevomat physiotherapy/massage offers from several providers include the following wording:
  - "Rezervaci můžete změnit 24 hodin před rezervovaným termínem. Změnu termínu je možné provést pouze jednou, a to přes zákaznické rozhraní v ‚Moje nákupy'."
  - "V případě změny rezervace méně než 24 hodin před domluveným termínem, nebo v případě, že se na termín nedostavíte, voucher propadá v plné výši bez nároku na refundaci. Voucher s rezervovaným termínem není možné stornovat ani refundovat."
  
  The quotes come from the offer pages listed; which quote is on which page was not checked. — [Slevomat 2421516](https://www.slevomat.cz/akce/2421516-individualni-fyzioterapie-cviceni-ci-zdravotni-masaz); [Slevomat 2233270](https://www.slevomat.cz/akce/2233270-individualni-45-60min-fyzioterapie-ruzne-metody); [Slevomat 2050460](https://www.slevomat.cz/akce/2050460-30-60minutova-individualni-fyzioterapie-pro-1-osobu?expand=1)
- Another provider in the same set: "Neomluvený termín propadá. Přeobjednat se můžete nejpozději 24 hodin předem, a to pouze 1×." — [Slevomat 1693354](https://www.slevomat.cz/akce/1693354-60-nebo-90-min-fyzioterapie-vc-cvicebniho-planu); [Slevomat 1308856](https://www.slevomat.cz/akce/1308856-fyzioterapie-a-masaze-pro-ulevu-vaseho-tela) (which page it is on was not checked)
- Undated vouchers: "Voucher bez termínu můžete stornovat v rámci zákonné 14denní lhůty, nebo po skončení platnosti voucheru refundovat podle platných pravidel." — [Slevomat 1544796](https://www.slevomat.cz/akce/1544796-fyzioterapie-ci-manualni-lymfodrenaz); [Slevomat 1446112](https://www.slevomat.cz/akce/1446112-fyzioterapie-ci-lymfodrenaz-pro-ulevu-tela)
- Some of these offers date from 2018–2020 and may no longer match current terms. The search excerpt did not state a fee amount other than full forfeiture. — [Slevomat 1410892](https://www.slevomat.cz/akce/1410892-masaze-pro-ulevu-vaseho-tela-od-fyzioterapeuta)
- One Czech gift-voucher example: the voucher is valid until the date printed on it, and an unused voucher **lapses without refund of the purchase price**. — [ČZU – Lesy voucher terms](https://lesy.czu.cz/dl/93708?lang=cs)

### Inferences
- What Czech practice could be seen (for physiotherapy sold through a platform) matches the international norm: 24 h, one free reschedule, then 100 % forfeiture.
- Distinguishing **dated** bookings (not cancellable) from **undated** prepaid credit (cancellable within 14 days) is an established convention that a booking engine can copy: treat a package or permanentka purchase differently from booking a specific slot.
- A design proposal to validate against real Czech terms and with a lawyer:
  - a per-package excuse quota (e.g., "N free omluvenky per package");
  - a makeup window (e.g., "náhrada do X dní / do konce platnosti permanentky");
  - extension of the permanentka for documented illness (e.g., with a doctor's confirmation).
  
  These are design suggestions, **not observed Czech norms**.

### Gaps
- **Not retrieved (search budget exhausted)**:
  - real obchodní podmínky or storno pages from Czech physiotherapy clinics, massage studios, fitness/boutique studios and course providers (yoga, Pilates, swimming or children's courses), with exact wording on omluvenky, náhradní lekce, permanentka validity and extensions;
  - typical Czech fee levels (e.g., 50 % vs 100 %);
  - Czech practice on charging no-shows for sessions covered by public health insurance.
  
  Manual collection of 10–20 real Czech terms pages is recommended.
- The features of Czech booking platforms (Reservio, Reservanto and others) for deposits, card guarantees or no-show protection were not checked.

---

## 3. Czech consumer law: are storno poplatky / odstupné legal and what limits apply; withdrawal for services booked online and the leisure exception (§ 1837); information duties; prepaid packages and vouchers

### Takeaway
What the retrieved sources show:
- Penalty-type charges in consumer contracts are judged by **proportionality and transparency**.
- Terms that were not individually negotiated (i.e., standard T&Cs) are **more easily found disproportionate**.
- In consumer contracts, a disproportionate penalty is treated as **invalid**, not reduced by the court. The commentary found says this under the *old* Civil Code.
- The **provider–patient relationship is a consumer relationship**, so these rules also apply to physiotherapy.
- On vouchers, a long-running dispute (SOS v Kasa.cz) argued that **an expiry date is lawful, but the money must be refunded after expiry**. The final Supreme Court outcome was not retrieved.

The exact statutory texts (§ 1837 písm. j), § 1814/§ 1815, § 1992, § 2048 ff., the 2023 Omnibus amendment) **could not be verified in this session**; see Gaps.

### Cited Findings
- The consumer withdrawal rules are in **§§ 1829–1837 OZ**, inside the block §§ 1820–1840 covering contracts concluded at a distance or off business premises. — [Lewik glossary](https://www.lewik.org/term/22047/pododdil-1-obecna-ustanoveni-obcansky-zakonik/); [ePravo – vzdání se práva na předčasné ukončení smlouvy](https://www.epravo.cz/top/clanky/moznost-vzdani-se-prava-na-predcasne-jednostranne-ukonceni-smlouvy-95198.html?pdf=1)
- **Healthcare contracts**:
  - An academic paper states that the relationship between a healthcare provider and a patient is a **consumer relationship**. — [Medical Law Journal (ÚSP AV ČR)](https://medlawjournal.ilaw.cas.cz/index.php/medlawjournal/article/view/84)
  - The Civil Code's *smlouva o péči o zdraví* is **subsidiary** to the Act on Health Services, which takes precedence as lex specialis. — [Právní prostor](https://pravniprostor.cz/clanky/obcanske-pravo/smlouva-o-peci-o-zdravi-problematicke-aspekty-jejiho-uzavreni-ukonceni-pri-poskytovani-zdravotnich-sluzeb); see also [ePravo – smlouva o péči o zdraví](https://www.epravo.cz/top/clanky/ke-smlouve-o-peci-o-zdravi-dle-noveho-obcanskeho-zakoniku-94360.html?pdf=1)
- **Contractual penalties in consumer contracts**, from commentary on consumer credit:
  - A penalty agreed with a consumer must pass a **proportionality (přiměřenost) test**, which applies whether or not the term was individually negotiated.
  - "Není-li smluvní pokuta sjednána individuálně, je jednodušší dospět k závěru, že byl narušen požadavek přiměřenosti."
  - Placing a penalty in T&Cs does not by itself make it unfair, but readability and prominence matter.
  - "právo soudu moderovat výši smluvní pokuty neplatí pro případy spotřebitelských smluv, kde nepřiměřeně vysoká smluvní pokuta znamená její absolutní neplatnost."
  
  Caveat: the excerpt cites **§ 56 odst. 1 of the pre-2014 Civil Code (zákon 40/1964 Sb.)**. Its applicability under the current code has to be checked against §§ 1813–1815 OZ. — [ePravo 110491](https://www.epravo.cz/top/clanky/k-primerenosti-uplatneni-sankce-za-absenci-povinnych-udaju-ve-smlouve-o-spotrebitelskem-uveru-110491.html?pdf=1)
- The functions of a contractual penalty are security, compensation, prevention, sanction and reparation. To be proportionate, it must be agreed with regard to the circumstances (commentary on telecom consumer contracts). — [ePravo 114214](https://www.epravo.cz/top/clanky/smluvni-pokuta-ve-smlouve-uzavrene-se-spotrebitelem-na-trhu-elektronickych-komunikaci-114214.html?pdf=1)
- The law firm ARROWS has published on a "**zákaz umístění smluvních pokut v obchodních podmínkách**" for consumer contracts. The excerpt did **not** show whether this describes enacted law or a legislative proposal, so it is critical to verify. — [ARROWS](https://arws.cz/novinky-v-arrows/zakaz-umisteni-smluvnich-pokut-v-obch-podminkach); [ePravo 107934](https://www.epravo.cz/top/clanky/jeste-jednou-k-zakazu-umisteni-smluvnich-pokut-v-obchodnich-podminkach-spotrebitelskych-smluv-107934.html)
- A Charles University thesis record notes that courts often overlook the special rules for consumer contracts. — [DODO UK](https://dodo.is.cuni.cz/handle/20.500.11956/187502?show=full)
- **Vouchers**:
  - In 2007 the consumer association SOS sued the e-shop Kasa.cz, which would not exchange unused certificates for money after one year. SOS argued that **limiting validity is lawful, but the price must be refunded after expiry, and excluding a refund is unlawful**. The dispute went to the Supreme Court; its outcome is not in the excerpt. — [Finance.cz](https://www.finance.cz/clanky/103808-sos-se-kvuli-darkovym-poukazkam-soudi-s-internetovym-obchodem)
  - A practical ePravo article on gift vouchers exists but its content was not retrieved. — [ePravo 111078](https://www.epravo.cz/top/clanky/jak-na-darkove-poukazky-111078.html)
- **Market practice on withdrawal**: Slevomat lets undated vouchers be cancelled "v rámci zákonné 14denní lhůty", while a voucher with a booked date "není možné stornovat ani refundovat". — [Slevomat 2421516](https://www.slevomat.cz/akce/2421516-individualni-fyzioterapie-cviceni-ci-zdravotni-masaz)
- **Transparency** (a UK parallel): a cancellation fee is enforceable only if the wording, timing and process are transparent and the client had a real chance to see the terms before committing. Automatic charging to a stored card should be stated explicitly. — [Sprintlaw UK](https://sprintlaw.co.uk/articles/cancellation-and-refund-terms-for-uk-physiotherapy-clinics/)

### Inferences
- Storno fees appear usable in Czech consumer contracts (market practice is widespread), but they must be **proportionate, transparent and accepted before booking**.
  - The engine should show the fee rule at checkout, record acceptance of a specific **versioned** text of the T&Cs, and keep that version with the booking.
- Fees should be justified by the provider's real loss (a short-notice slot that cannot be refilled):
  - 50 % for a late cancellation and up to 100 % for a no-show is common practice and arguably proportionate;
  - any fee **above the price of the service**, or flat penalties not linked to a booking, would be high-risk.
- Because the provider–patient relationship is a consumer relationship, the **same scrutiny applies to physiotherapy storno fees** as to massage and training.
- **Symmetry is a cheap safeguard.** If the provider cancels late, the client should receive comparable compensation (e.g., a free replacement or credit, as at Virgin Active). This reduces the risk under the unfair-terms rule against one-sided forfeiture (see the UNVERIFIED annex item 1(d) of Directive 93/13 below).
- **Prepaid packages and permanentky**: confiscating unused prepaid value at expiry is the riskiest option (the SOS argument and the unjust-enrichment theory).
  - Safer configurations: reasonable validity periods, automatic extension for documented illness, and a refund of unused value on request (possibly net of any package discount).
  - Whichever option is chosen, state it clearly in the T&Cs.

### Gaps
Each item below is **UNVERIFIED (background knowledge)** and must be checked against the primary text before use.
- **§ 1837 OZ (exceptions to the right of withdrawal)**:
  - In the 2014 wording, letter **j)** excludes withdrawal for contracts on "ubytování, dopravě, stravování nebo využití volného času, pokud podnikatel podle smlouvy poskytuje tato plnění v určeném termínu". This transposes art. 16(l) of Directive 2011/83/EU (leisure services with a specific date or period). The lettering may have changed with the 2023 amendment.
  - Letter **a)** covers services fully performed with the consumer's prior express consent before the withdrawal period ends.
  - Whether physiotherapy, massage or training counts as "leisure" is **legally uncertain**: a fitness class is more likely to count than therapeutic physiotherapy.
  
  Verify at: [zakonyprolidi.cz – zákon 89/2012 Sb.](https://www.zakonyprolidi.cz/cs/2012-89); [EUR-Lex – Directive 2011/83/EU](https://eur-lex.europa.eu/eli/dir/2011/83/oj)
- **Healthcare carve-out**: art. 3(3)(b) of Directive 2011/83/EU excludes contracts for "healthcare" as defined in art. 3(a) of Directive 2011/24/EU (health services provided by health professionals to assess, maintain or restore health). It is unclear whether and how Czech law (probably § 1840 OZ) transposes this. If it does, **physiotherapy by a registered healthcare provider may fall outside the distance-contract withdrawal rules entirely**, while massage and training would not. Verify at: [EUR-Lex – Directive 2011/24/EU](https://eur-lex.europa.eu/eli/dir/2011/24/oj); [zákon 89/2012 Sb.](https://www.zakonyprolidi.cz/cs/2012-89)
- **Withdrawal from services that have started**: a consumer who asks for the service to start within the 14-day period and then withdraws pays a **proportional part of the price**. Since the Czech Omnibus amendment (**zákon č. 374/2022 Sb., effective 6 January 2023**), full performance leads to loss of the right of withdrawal only with the consumer's express request **and acknowledgement**. This matters for packages and permanentky sold online. Verify at: [zákon 89/2012 Sb.](https://www.zakonyprolidi.cz/cs/2012-89)
- **"Withdrawal button"**: Directive (EU) 2023/2673 inserted art. 11a into Directive 2011/83/EU, requiring a "withdrawal function" for distance contracts concluded through an online interface, **applicable from 19 June 2026**. The Czech transposition status is unknown. This is relevant if packages or permanentky are sold online and the right of withdrawal applies. Verify at: [EUR-Lex – Directive (EU) 2023/2673](https://eur-lex.europa.eu/eli/dir/2023/2673/oj)
- **Unfair terms (§§ 1813–1815 OZ; Directive 93/13/EEC annex)**:
  - Annex item 1(d) targets terms that let the trader **keep sums paid when the consumer cancels without equivalent compensation when the trader cancels**.
  - Annex item 1(e) targets terms requiring a consumer who fails to perform **to pay a disproportionately high sum in compensation**.
  - § 1815 OZ: since 2023 the wording is believed to be "K nepřiměřenému ujednání se nepřihlíží, ledaže se jej spotřebitel dovolá."
  
  Verify at: [EUR-Lex – Directive 93/13/EEC](https://eur-lex.europa.eu/eli/dir/1993/13/oj); [zákon 89/2012 Sb.](https://www.zakonyprolidi.cz/cs/2012-89)
- **How to classify a storno fee**: as **odstupné** (§ 1992 OZ, withdrawal against payment), as **smluvní pokuta** (§§ 2048–2052; § 2051 lets courts reduce a disproportionate penalty), or as compensation for the client's creditor default. No Czech judgment or ČOI statement on storno fees for appointment-based services was retrieved. Verify at: [zákon 89/2012 Sb.](https://www.zakonyprolidi.cz/cs/2012-89); [ČOI](https://www.coi.cz)
- **Pre-contractual information duties**: § 1811 OZ (general consumer information) and § 1820 OZ (distance contracts: price, cancellation and withdrawal conditions, complaints procedure). There is also the duty under zákon 634/1992 Sb. to name the out-of-court dispute body (**ČOI as general ADR**). Verify at: [zákon 89/2012 Sb.](https://www.zakonyprolidi.cz/cs/2012-89); [zákon 634/1992 Sb.](https://www.zakonyprolidi.cz/cs/1992-634)
- **Vouchers and permanentky**: no specific Czech statute on minimum validity or refunds was found, and the final Supreme Court ruling in SOS v Kasa.cz was not retrieved.

---

## 4. GDPR and health data: special-category data, legal bases, consent records, processor agreements, EU hosting, access control and audit logs, retention; Czech healthcare law if the clinic is a registered healthcare provider vs. non-healthcare services under a živnost; what this means for the booking system vs. medical records

### Takeaway
Almost no sources could be retrieved for this question, so the substance is in Gaps as **UNVERIFIED**. The two retrieved points are that the provider–patient relationship is a consumer relationship, and that the Act on Health Services (zákon 372/2011 Sb.) overrides the Civil Code's health-care contract.

The working model to confirm:
- Physiotherapy provided by a **registered healthcare provider** is processed under **art. 9(2)(h) GDPR** together with the statutory duty to keep **zdravotnická dokumentace** (zákon 372/2011 Sb., vyhláška 98/2012 Sb.).
- Health information collected for **massage or training** under a živnost needs **explicit consent (art. 9(2)(a))**.
- Bookings and clinical records should be **logically separated**, with different legal bases, access roles and retention.

### Cited Findings
- The provider–patient relationship is a consumer relationship. — [Medical Law Journal (ÚSP AV ČR)](https://medlawjournal.ilaw.cas.cz/index.php/medlawjournal/article/view/84)
- The Civil Code's health-care contract is subsidiary to the Act on Health Services (lex specialis). — [Právní prostor](https://pravniprostor.cz/clanky/obcanske-pravo/smlouva-o-peci-o-zdravi-problematicke-aspekty-jejiho-uzavreni-ukonceni-pri-poskytovani-zdravotnich-sluzeb)
- The Cochrane review on SMS reminders found that **no included study reported in detail on adverse effects such as privacy loss or failed message delivery**, so there is no evidence on the privacy risks of reminder content. — [Cochrane evidence page](https://www.cochrane.org/evidence/CD007458_mobile-phone-messaging-reminders-attendance-healthcare-appointments)

### Inferences
These follow from the cited findings combined with the unverified framework in Gaps.
- **Two data domains.**
  - (a) **Booking and CRM**: identity and contacts, slots, attendance, omluvenky, storno fees, payments, and marketing consents.
  - (b) **Clinical record**: anamnéza, findings, therapy plan, progress notes. For a healthcare provider this is the legally required zdravotnická dokumentace.
  - Keep them in separate modules or tables with role-based access: reception sees bookings; therapists see clinical data. Log every read and write to the clinical data in an append-only audit log.
- **Keep health data out of booking artefacts.**
  - Booking notes, service names visible to the client, SMS and e-mail subjects and reminders should not reveal diagnoses. Even "Fyzioterapie – bederní páteř" can be health data.
  - Use neutral service names ("Konzultace 60 min") in notifications.
- **Separate legal bases per service line.**
  - Physiotherapy (healthcare provider): art. 6(1)(c)/(b) together with art. 9(2)(h)/9(3).
  - Massage and training: contract (art. 6(1)(b)) for the booking, plus **explicit, separately recorded consent** for any contraindication or injury questionnaire (art. 9(2)(a)).
  - Store consent records with timestamp, the version of the text shown, the channel, and the date of withdrawal.
- **Vendors**: a processor agreement (art. 28) with the booking SaaS, SMS gateway, e-mail provider and payment provider. EU hosting avoids Chapter V transfer issues.

### Gaps
Each item below is **UNVERIFIED (background knowledge)** and must be checked against the primary text.
- **GDPR**:
  - art. 4(15) defines health data; art. 9(1) prohibits processing special categories, with exceptions in art. 9(2): (a) explicit consent; (h) healthcare provision, combined with 9(3) professional secrecy;
  - art. 28 requires processor contracts; art. 30 records of processing; art. 32 security (access control, logging, encryption);
  - art. 35 DPIA and art. 37 DPO apply to *large-scale* processing of special categories. **Recital 91** states that processing of patient data by an individual physician or other health professional is **not** large scale, so a small clinic is probably outside the mandatory DPO and DPIA rules (confirm).
  
  Verify at: [EUR-Lex – Regulation (EU) 2016/679](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
- **Czech implementing act**: zákon č. 110/2019 Sb., o zpracování osobních údajů (e.g., the age of digital consent is 15). Verify at: [zakonyprolidi.cz – 110/2019](https://www.zakonyprolidi.cz/cs/2019-110)
- **Healthcare-provider status (zákon 372/2011 Sb.)**:
  - healthcare services require an **oprávnění k poskytování zdravotních služeb** issued by the regional authority;
  - zdravotnická dokumentace is governed by roughly §§ 53–69 (content, keeping, access);
  - there is a duty of confidentiality (approximately § 51).
  
  Verify at: [zakonyprolidi.cz – 372/2011](https://www.zakonyprolidi.cz/cs/2011-372)
- **Vyhláška 98/2012 Sb. on zdravotnická dokumentace**:
  - required content;
  - requirements for electronic records (believed to include electronic signature/seal and time-stamping);
  - **retention periods in Annex 3**: the commonly cited general period for outpatient documentation is **10 years after the last service**; confirm the period for physiotherapy records specifically.
  
  Verify at: [zakonyprolidi.cz – 98/2012](https://www.zakonyprolidi.cz/cs/2012-98)
- **Who may provide what**:
  - physiotherapists are a regulated non-physician health profession under zákon 96/2004 Sb.;
  - massage outside healthcare is usually run under the **vázaná živnost "Masérské, rekondiční a regenerační služby"** (zákon 455/1991 Sb., příloha 2);
  - the trade-licence type for conditioning training is unconfirmed;
  - healthcare services cannot be provided under a živnost.
  
  Verify at: [zakonyprolidi.cz – 96/2004](https://www.zakonyprolidi.cz/cs/2004-96); [zakonyprolidi.cz – 455/1991](https://www.zakonyprolidi.cz/cs/1991-455)
- **International transfers**: the EU–US Data Privacy Framework adequacy decision (Implementing Decision (EU) 2023/1795, 10 July 2023) was believed to have been upheld by the EU General Court in *Latombe v Commission* (T-553/23) on 3 September 2025. Whether there is an appeal, and its status, was not checked. Verify at: [EUR-Lex – Decision 2023/1795](https://eur-lex.europa.eu/eli/dec_impl/2023/1795/oj)
- **Other regimes not checked**:
  - the new Czech cybersecurity act implementing NIS2 (believed to be zákon č. 264/2025 Sb., effective 1 November 2025) and whether a small clinic falls under it;
  - zákon 325/2021 Sb. on e-health;
  - the European Health Data Space Regulation (EU) 2025/327 (in force 2025, most obligations from 2027–2031).
- **ÚOOÚ**: no guidance or decisions were retrieved on health data in physiotherapy or massage, on booking systems, or on retention of booking data. Accounting and tax retention periods for invoices and receipts were not verified either.

---

## 5. E-mail marketing law in Czechia: zákon 480/2004 Sb. (prior consent vs. the existing-customer exception), unsubscribe rules, ÚOOÚ guidance and fines, transactional vs. marketing messages, SMS marketing, cookies for an online booking widget

### Takeaway
Under zákon 480/2004 Sb., electronic commercial messages (e-mail and SMS) require **prior, provable consent**, with one exception: contacts obtained from **existing customers in connection with a sale** may be used to promote **similar** products or services. That exception applies only if:
- the customer did not object when giving the contact; and
- **every message offers a free, simple way to opt out**.

Every commercial message must also be marked as commercial, identify the sender and give a valid opt-out address. Purchased databases cannot be used. ÚOOÚ fines can reach **CZK 10 million**.

The cookie rules and the replacement law under discussion (zákon o digitální ekonomice) were not verified.

### Cited Findings
- **General rule**: commercial communications may be sent electronically only with the user's **prior consent**. ÚOOÚ adds that the consent must be given **before** the message is sent and must be **provable**. — [Právní prostor – povinnosti podnikatelů při zasílání obchodních sdělení](https://pravniprostor.cz/clanky/obcanske-pravo/povinnosti-podnikatelu-pri-zasilani-obchodnich-sdeleni-zakaznikum-cast-i); [ÚOOÚ – poskytnutá informace (2020)](https://uoou.gov.cz/media/poskytnute-informace/2020/2342020/uoou-1249417.pdf)
- **Existing-customer exception**:
  - Contact details obtained from a customer **in connection with a sale** may be used without new consent to offer **similar products or services**.
  - The customer must not have objected when giving the contact.
  - The customer must have a clear, simple way to refuse, free of charge (or at the sender's cost).
  
  — [ePravo – odpovědnost za šíření obchodních sdělení](https://www.epravo.cz/top/clanky/odpovednost-za-sireni-obchodnich-sdeleni-106137.html); [Právní prostor](https://pravniprostor.cz/clanky/obcanske-pravo/povinnosti-podnikatelu-pri-zasilani-obchodnich-sdeleni-zakaznikum-cast-i)
- ÚOOÚ guidance: if you obtain a customer's **e-mail address or phone number** in connection with selling a product or service, you may use that contact on this basis. This means **SMS is covered in the same way as e-mail**. The excerpt does not make clear which of the two ÚOOÚ PDFs this is from. — [ÚOOÚ 0759918](https://uoou.gov.cz/media/poskytnute-informace/2020/2342020/uoou-0759918.pdf); [ÚOOÚ 1249417](https://uoou.gov.cz/media/poskytnute-informace/2020/2342020/uoou-1249417.pdf)
- **Formal requirements for each message**: it must be clearly marked as a commercial communication, identify the sender, and contain a **valid address to which the recipient can send a request to stop**. — [ePravo 106137](https://www.epravo.cz/top/clanky/odpovednost-za-sireni-obchodnich-sdeleni-106137.html); [Právní prostor](https://pravniprostor.cz/clanky/obcanske-pravo/povinnosti-podnikatelu-pri-zasilani-obchodnich-sdeleni-zakaznikum-cast-i)
- **Purchased databases** do not meet the requirements of zákon 480/2004, especially informed consent. They may only be used to send an *inquiry* to the listed companies. — [ÚOOÚ 1249417](https://uoou.gov.cz/media/poskytnute-informace/2020/2342020/uoou-1249417.pdf)
- **Burden of proof**: the sender must prove consent; for refusals, the burden is on the recipient (as stated in the commentary excerpt). — [ePravo 106137](https://www.epravo.cz/top/clanky/odpovednost-za-sireni-obchodnich-sdeleni-106137.html)
- **Sanctions**: an ÚOOÚ decision cites a **maximum fine of CZK 10,000,000** for offences under § 11(1)(a) of zákon 480/2004 (unsolicited mass or repeated messages). — [ÚOOÚ decision 2021](https://uoou.gov.cz/media/rozhodnuti/rozhodnuti-predsedy/2021/uoou-0028820-21.pdf)
- **Pending reform**: a draft **zákon o digitální ekonomice (ZoDE)** would carry over a similar existing-customer / legitimate-interest route. Whether it was enacted could not be confirmed. — [ePravo 118675](https://www.epravo.cz/top/clanky/regulace-obchodnich-sdeleni-ve-staronovem-kabate-podle-navrhu-zakona-o-digitalni-ekonomice-118675.html?pdf=1)
- An article on sending commercial messages through third parties and GDPR consent exists but was not retrieved. — [ePravo 110440](https://www.epravo.cz/top/clanky/rozesilani-obchodnich-sdeleni-prostrednictvim-treti-strany-a-souhlas-dle-gdpr-110440.html)

### Inferences
- **Data model**:
  - Store marketing permission **per channel** (e-mail, SMS), separately from acceptance of the T&Cs and from booking.
  - Record: the source (booking form, reception), timestamp, the version of the text shown, and the IP/user-agent for online consents.
  - Record whether the contact came from a sale, which qualifies it for the existing-customer route, and whether the customer objected at that point.
  - Record the date and channel of any opt-out.
  - Every marketing e-mail needs an unsubscribe link; every marketing SMS needs a working opt-out route.
  - The sending logic must hard-block contacts that opted out.
- **Collecting consent**: at booking, offer an **unticked** opt-in checkbox plus an "I don't want offers" option. This covers both routes: explicit consent, and an objection opportunity for the existing-customer exception.
- **What counts as "similar products or services"** is not defined in the sources. Physiotherapy → massage or training may or may not be "similar"; explicit consent avoids the question.
- **Keep transactional messages free of promotion**: booking confirmations, 48 h/24 h reminders, storno confirmations, no-show fee notices and package expiry notices. Adding offers or newsletter content risks turning them into obchodní sdělení that need consent or the exception.
- **For a healthcare provider**, segmenting marketing by diagnosis or treatment would use health data for marketing, which in practice needs **explicit consent**. Avoid it by default.

### Gaps
- **UNVERIFIED (background knowledge)**:
  - **Cookies**: since 1 January 2022, § 89(3) of zákon 127/2005 Sb. (o elektronických komunikacích, amended by zákon 374/2021 Sb.) requires **opt-in consent** for non-essential cookies; strictly necessary cookies are exempt. An embedded booking widget that sets analytics or marketing cookies (its own or third-party) therefore needs a consent banner; a widget limited to essential cookies does not.
  - The definition of "obchodní sdělení" (§ 2 písm. f) of zákon 480/2004) and whether service reminders fall outside it.
  
  Verify at: [zakonyprolidi.cz – 127/2005](https://www.zakonyprolidi.cz/cs/2005-127); [zakonyprolidi.cz – 480/2004](https://www.zakonyprolidi.cz/cs/2004-480); [ePrivacy Directive 2002/58/EC](https://eur-lex.europa.eu/eli/dir/2002/58/oj)
- **Not retrieved**: current ÚOOÚ enforcement statistics or typical fine levels for spam in 2024–2026, ÚOOÚ guidance on cookie banners, and whether ZoDE was adopted by 2026 (which would change the legal text and possibly the supervisory authority).

---

## 6. VAT for healthcare in Czechia (§ 58 ZDPH) vs. massage and training; receipts and invoices; EET status

### Takeaway
**EET 2.0 is coming.** The Chamber of Deputies definitively approved the new zákon o evidenci tržeb on **9 September 2026**, overriding the Senate's amendments, with an **expected start date of 1 January 2027**. It covers payments made **in person with the customer, including card and QR payments**, but **not bank transfers or invoice payments**. As of the latest source (September 2026), the law was awaiting the President's signature and publication.

VAT details (the § 58 ZDPH exemption for healthcare, rates for massage and training, the registration threshold) **could not be verified**; see Gaps.

### Cited Findings
- The Chamber of Deputies approved the government bill on evidence tržeb in third reading on **15 July 2026**. — [BusinessInfo.cz](https://www.businessinfo.cz/clanky/snemovna-schvalila-eet-2-0-moderni-evidence-trzeb-miri-do-senatu/); [Finance.cz](https://www.finance.cz/aktuality/snemovna-prijala-eet-ted-miri-do-senatu/)
- The Senate proposed changes, including removing contactless card payments, a blanket exemption for some flat-rate taxpayers (paušalisté) and removal of a limit on tax-exempt health benefits. The Chamber **overrode the Senate and definitively approved EET 2.0 on 9 September 2026**. The Ministry of Finance planned a roadshow for businesses. — [DAUC](https://www.dauc.cz/aktuality/2093/snemovna-prehlasovala-senat-a-stvrdila-zavedeni-eet-2-0-jeji-fungovani-ministerstvo-vyrazi-vysvetlovat-podnikatelum-na-roadshow-po-cesku)
- **Scope**: payments made in personal contact with the customer, **including card and QR-code payments**. Ordinary bank transfers and invoice payments are **not** recorded. Expected effective date: **1 January 2027**. — [ePravo 121639](https://www.epravo.cz/top/aktualne/eet-20-je-na-svete-od-ledna-2027-budou-podnikatele-evidovat-i-platby-kartou-a-qr-kodem-121639.html); [Právní prostor](https://pravniprostor.cz/aktuality/eet-2-se-spusti-v-lednu-2027-podnikatele-ho-vitaji-opozice-prinos-nevidi)
- **Timeline**: at the September 2026 source date, the law awaited the President's signature and publication in the Sbírka zákonů. The Ministry of Finance's June 2026 schedule expected publication at the end of October or in November 2026. A developer seminar on EET 2 was held on 23 June 2026. — [eet.gov.cz – developer seminar presentation](https://eet.gov.cz/files/EET2_Prezentace_Seminar_pro_vyvojare_23-6-2026.pdf); [DAUC](https://www.dauc.cz/aktuality/2093/snemovna-prehlasovala-senat-a-stvrdila-zavedeni-eet-2-0-jeji-fungovani-ministerstvo-vyrazi-vysvetlovat-podnikatelum-na-roadshow-po-cesku)

### Inferences
- Payments **taken at the reception desk** (cash, card terminal, QR) will probably need EET 2.0 recording from 2027. Online prepayments through a payment gateway or bank transfer, and invoiced amounts, are probably outside it. The booking and payment module should be designed so that an in-person payment can trigger an EET 2.0-compliant receipt (through the POS or cash-register integration). Confirm against the final published text and any exemptions.
- Storno and no-show fees collected in person would be in-person receipts like any other payment.

### Gaps
Each item below is **UNVERIFIED (background knowledge)** and must be checked.
- **§ 58 ZDPH**:
  - Healthcare services supplied by a *poskytovatel zdravotních služeb* under the health-services act are VAT-exempt without the right to deduct input VAT.
  - Under CJEU case law (e.g., C-307/01 d'Ambrumenil; C-91/12 PFC Clinic), the exemption covers only care with a **therapeutic purpose**. Wellness massage and conditioning training are therefore **taxable**, even when offered by a clinic.
  
  Verify at: [zakonyprolidi.cz – 235/2004 (ZDPH)](https://www.zakonyprolidi.cz/cs/2004-235)
- **VAT rates** after the 2024 consolidation (21 % / 12 %): it is not confirmed whether any 12 % item covers sports facilities or fitness. Personal training is probably 21 %.
- **VAT registration threshold**: believed to be CZK 2,000,000 turnover per calendar year from 2025, with immediate registration above about CZK 2,536,500.
- **VAT on cancellation fees**: under CJEU case law, retained deposits/cancellation fees were held *not* to be consideration (C-277/05 Société thermale). In contrast, no-show ticket revenue and early-termination amounts were held to be consideration (C-250/14 & C-289/14 Air France-KLM; C-295/17 MEO). Whether a Czech storno or no-show fee is subject to VAT needs a tax adviser's view.
- **Receipts and exemptions**: the duty to issue a receipt to a consumer (believed to be on request, under zákon 634/1992 Sb.) was not checked. It is also unknown whether EET 2.0 contains any exemption relevant to healthcare providers or to payments by health insurers (which are not in-person payments in any case).
