# UX/UI best practices, 2025–2026 design trends and analytics KPIs for a physiotherapy/wellness clinic booking platform

Context: a private Czech clinic offering physiotherapy, conditioning training and massages. Bookings use 15-minute increments and services have different durations. The research covers 2024–2026 and was done on 14 Oct 2026.

**How the sources were read (affects reliability):** in this environment the WebFetch tool could not resolve most target domains (baymard.com, nngroup.com, jane.app, physitrack.com, cliniko.com, fullcalendar.io, linear.app, webpt.com, scalesuite.com.au). baymard.com was also blocked by the egress proxy. So every fact credited to those pages comes from search-engine extracts of the cited page. None of those pages was read in full. The shared web-search budget ran out before these topics were searched: Czech-market specifics (Reservio/Reservanto), LTV formulas, waitlist backfill data, the share of bookings made outside opening hours, and the official Tailwind v4, shadcn/ui and Tremor docs. Those topics are listed under Gaps.

---

## 1. Client booking UX: patterns that make booking fast and high-converting

### Takeaway
The strongest evidence comes from Baymard's checkout research and peer-reviewed reminder meta-analyses. It says to cut the number of form fields (field count matters more than step count) and never force account creation. Availability should be easy to read, with a clear date-then-time hierarchy, and price and fees should appear before commitment. Send several reminders. On "first available" versus "choose your therapist" the evidence is only indirect: patients value both short waits and continuity with a known clinician. So offer both paths, as Jane does, and default returning patients to their usual therapist.

### Cited Findings

**Friction, forced accounts and form length (Baymard)**
- 19% of shoppers abandon a checkout when forced to create an account. 39% abandon because of extra costs, though other surveys report 48% for that reason. Average documented cart abandonment is about 70%. — [Baymard: Reduce Cart Abandonment](https://baymard.com/blog/reduce-cart-abandonment). Secondary sources give 26% for the forced-account reason, attributed to a 2024 Baymard study or a 2025 survey of 4,560 shoppers. That is probably a different survey wave. — [Xictron 2026](https://www.xictron.com/en/blog/checkout-optimization-reduce-cart-abandonment-2026/); [RetailBoss 2024 ranking](https://retailboss.co/10-reasons-for-abandonment-during-checkout-in-the-u-s)
- Forgotten passwords stop 19% of account users from completing checkout. — [Amazon Pay blog summarising Baymard](https://pay.amazon.com/blog/the-baymard-report-series-how-forcing-sign-ups-drives-down-sales)
- Baymard's 2024 checkout benchmark (26 Jun 2024) — [Baymard: Checkout flow average form fields](https://baymard.com/research-articles/checkout-flow-average-form-fields):
  - The average checkout has 11.3 form fields, down from 11.8 in 2021 and 12.7 in 2019. Most sites need only 8 fields.
  - The average checkout has 5.1 steps, but the number of fields affects usability "far more than the number of steps".
  - 17% of users have abandoned an order because checkout was too long or complicated. One copy of the article says 18%.

**Showing availability: date and time pickers**
- Baymard's testing of time-booking interfaces (delivery, takeout and service-installation slots) found that the layout made it hard to see which dates and times were open. Users misjudged availability and missed workable alternatives. The best-performing fix was a clear visual hierarchy between date and time slots. Baymard's detailed guidelines are paywalled. — [Baymard: Time booking interface](https://www.baymard.com/ecommerce-design-examples/time-booking-interface)
- Baymard on date pickers: the calendar is where users check whether a date can be booked. When it does not show availability clearly or accurately, users spend extra effort checking, which leads to frustration and abandonment. Testers also wanted to reach service details from the calendar. — [Baymard: Date picker](https://baymard.com/ecommerce-design-examples/date-picker)
- Mark today's date and visually separate it from the selected date. Give each day cell a full spoken label (for example "Monday, January 1, 2024") and set `aria-current` on today. — [Singapore Government Design System: Date picker](https://v2dev.designsystem.tech.gov.sg/components/date-picker)
- A date picker must work with touch, mouse, keyboard and screen readers. Use explicit labels such as "Appointment Date". — [UXPin](https://www.uxpin.com/studio/blog/date-picker-ui-design/)
- Use a simple text input for dates people know by heart, such as a birth date. Use a calendar picker for dates chosen in relation to other days. Format hints shown only as placeholder text are a problem because they disappear when the user types. — [Pennsylvania Keystone Design System](https://wcmauthorguide.pa.gov/en/keystone-design-system/design-system-components/Date-Picker.html); [Carbon Design System](https://preview.carbondesignsystem.com/building-blocks/core/components/date-picker)
- "You might not need a date picker": stepping through days vertically may be enough (older source, 2017). — [Smashing Magazine](https://smashingmagazine.com/2017/07/designing-perfect-date-time-picker)

**How leading booking products structure the flow**
- Cal.com offers three booker layouts: month, week and column view. Hosts can enable one or several and let guests switch, per event type or globally. The embed default is `month_view` (the embed docs are a mirror and may be stale). — [Cal.com blog](https://cal.com/blog/enhanced-flexibility-take-advantage-of-cal-com-s-multiple-booking-layouts); [Cal.com embed docs mirror](https://mintlify.wiki/calcom/cal.com/embed/customization)
- Calendly replaced its 7-day "circle view" with a familiar month view that shows monthly and daily availability on one screen. The announcement comes from an undated third-party mirror. — [Mirror of Calendly announcement](https://anga2023.gl-systemhaus.de/blog/new-scheduling-page-ui)
- Calendly's H1 2025 updates include "No-show Workflows", which trigger follow-ups automatically when an invitee misses a meeting. — [Calendly Community, H1 2025](https://community.calendly.com/featured-tips-tricks-32/what-s-new-at-calendly-h1-2025-feature-updates-4405)
- Jane, a clinic-specific product (practice software for physiotherapy and other allied-health clinics):
  - Patients pick a clinic, then either a specific practitioner or a discipline (for example acupuncture), then a treatment, then a time.
  - Patients can look across weeks of availability or join a wait list.
  - Admins choose how practitioners are ordered: alphabetical, random, or "Most Available".
  - Sources: [Jane guide: online booking permissions](https://jane.app/guide/online-booking-permissions); [Jane: Online booking](https://jane.app/features/online-booking)
- Jane has a client mobile app for managing appointments. — [Jane guide: client app](https://jane.app/guide/jane-s-mobile-app-for-clients-managing-appointments)
- A review of Jane praises its branded online booking and real-time availability. It lists as cons: no lead-source tracking, tricky setup, and only one email per patient. — [Medesk review of Jane](https://www.medesk.net/en/blog/jane-app-review/)
- Cliniko: each practitioner is switched on for online booking separately, and admins can cap how many bookings a patient makes per day. The booking page can stand alone or be embedded in the clinic website. — [Cliniko help](https://help.cliniko.com/en/articles/1023963-set-up-online-bookings)
- Fresha says it handles more than 35 million appointments per month and passed 1 million app downloads per month (company press release, April 2026). This shows how strongly marketplace apps shape what consumers expect. — [Fresha press release](https://www.bolsamania.com/nota-de-prensa_print/mercados/fresha-surpasses-1-million-monthly-downloads-as-global-demand-for-beauty-and-wellness-booking-accelerates--22349653.html)

**Choosing a therapist vs. "first available" (patient preference evidence)**
- Canadian teaching clinics (BMJ Open 2019, 430 family-medicine patients): appointment wait time was the most valued attribute, followed by the type of provider, then familiarity with the provider. Patients significantly preferred their own physician for routine check-ups (p<0.02). — [Oliver et al., BMJ Open](https://bmjopen.bmj.com/content/9/3/e023578)
- UK GP access study (Sunderland): patients valued seeing the doctor of their choice above speed of access. The weighting varied between patient groups. — [BJGP](https://bjgp.org/content/56/531/743.long)
- A US primary-care study (Annals of Family Medicine, using 2023 data) tested trade-offs between quick portal care, a shorter wait with any physician, and a longer wait for one's own physician. Only the design was retrieved, not the results. — [Annals of Family Medicine](https://www.annfammed.org/content/24/1/25)

**Online / self-service booking and no-shows**
- Kammrath Betancor et al., *Frontiers in Digital Health*, 2 May 2025: a retrospective study at one ophthalmology practice and one university hospital.
  - In the practice, the median no-show rate was 1.8% for online bookings and 5.9% for offline bookings (p<0.0001).
  - Online booking cut unused slots from 22.7% to 10.3% and never-booked slots from 8.6% to 1.6%.
  - In the hospital the result reversed: online bookings had more no-shows, 14.3% versus 11.2%.
  - Source: [Frontiers in Digital Health](https://www.frontiersin.org/journals/digital-health/articles/10.3389/fdgth.2025.1567397/full). A vendor blog presents the practice result as a general effect, which overstates it. — [NextPatient blog](https://www.nextpatient.co/blog/how-online-self-scheduling-reduces-no-shows-in-2026)
- A 2024 JMIR retrospective cohort study evaluated an automated self-rescheduling tool built into the EHR. Only the background section was retrieved, so the outcomes are unknown. — [JMIR via DOAJ](https://doaj.org/article/75542d4a5c0a4c53abcf78369dda9064)

**Reminders (strongest evidence)**
- Meta-analysis of digital notifications (21 studies in the primary analysis): notified patients were about 25% less likely to no-show (RR 0.75; 15% vs. 21%). Several notifications beat a single one, and voice reminders looked somewhat more effective than text. — [PubMed 27798006](https://pubmed.ncbi.nlm.nih.gov/27798006/)
- Guy et al. (Health Services Research), 18 reports including 8 RCTs: SMS reminders substantially increase attendance. The pooled RCT odds ratio is about 1.48. — [PubMed 22091980](https://pubmed.ncbi.nlm.nih.gov/22091980/)
- A 2025 review of hospital appointment reminders (10 studies) found that the SMS-only subgroup was not statistically significant (RR 1.14, 95% CI 0.99–1.31). Telephone reminders were significant. — [JHMHP 2025](https://jhmhp.amegroups.org/article/view/10215/html)

**Deposits, saved cards and visible policies (vendor evidence only)**
- One vendor claims deposits cut no-shows by 55% on average, and more when combined with reminders. No source is given. — [SchedulingKit statistics](https://schedulingkit.com/statistics/appointment-deposit-statistics)
- Requiring first-time clients to save a card "reduces new-client no-shows dramatically". No percentage is given. — [SchedulingKit guide](https://www.schedulingkit.com/how-to/reduce-no-shows-salon)
- Deposits for new clients reportedly reduce no-shows by up to 50% "without significantly impacting booking conversion". This is a vendor guide and no study is named. — [Rework beauty-center library](https://resources.rework.com/vi/libraries/beauty-center-growth/no-show-cancellation-management)

**Login: guest booking, magic links, passkeys**
- WCAG 2.2 SC 3.3.8 Accessible Authentication (Minimum), level AA: no login step may require a cognitive function test, such as remembering a password or solving a puzzle, unless an alternative or helper mechanism is provided. It covers existing users logging in, not account creation. — [W3C Understanding 3.3.8](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication.html)
- W3C lists email-link authentication (a "magic link") as a sufficient technique (G218) for meeting 3.3.8. — [W3C Technique G218](https://w3c.github.io/wcag/techniques/general/G218)
- Independent analysis (July 2025): the conversion benefits claimed for magic links "are not substantiated by rigorous, independent research". Passkeys are the better long-term choice. — [Baytech Consulting](https://www.baytechconsulting.com/blog/magic-links-ux-security-and-growth-impacts-for-saas-platforms-2025)
- A vendor report claims a +26.7% lift in SaaS trial-to-paid conversion after going passwordless, and says magic links make up 41% of passwordless implementations. Its methodology has not been independently audited. — [MojoAuth 2026 report](https://mojoauth.com/data-and-research-reports/passwordless-conversion-impact-report-2026)
- Magic links turn login into "access to your email", so email deliverability and inbox speed become part of the UX. — [SuperTokens](https://supertokens.com/blog/magiclinks)

**Confirmation: add to calendar and Apple/Google Wallet**
- Waitwhile adds an "Add to Apple Wallet" button to confirmation emails and the confirmation page. The pass can appear on the iPhone lock screen near the appointment time. — [Waitwhile help](https://help.waitwhile.com/en/articles/10476311-using-apple-wallet-for-easier-booking-access)
- A Google Wallet pass plugin for the Amelia booking system shows the service, provider, date and time, location and a QR code. The pass updates or is voided automatically when the appointment is rescheduled or cancelled. — [Wallet Pass for Amelia](https://wordpress.org/plugins/?p=376291)
- Luma puts "Add to Wallet" on the ticket page and in the confirmation email. — [Luma help](https://help.luma.com/p/mobile-wallet-passes)
- Google Wallet passes are issued as signed JWTs, and one "Add to Google Wallet" button can add several passes. — [Google Wallet developer docs](https://developers.google.com/wallet/retail/offers/use-cases/save-multiple-pass-types)

**Conversion case data (weak, bundled changes)**
- A chiropractic clinic saw online appointment requests rise 52% after a website redesign that streamlined its appointment forms. Several changes were made at once, so no single factor can be isolated. — [Case study: Thrive Care / The Pixel](https://www.casestudies.com/company/pixel/case-study/thrive-care-boosts-online-appointment-requests-52-with-the-pixel)

### Inferences
- **Recommended client flow (mobile-first, four screens):**
  1. **Service** — grouped as Fyzioterapie / Kondiční trénink / Masáže, each showing duration and price.
  2. **Therapist** — a default "Kdokoli – nejbližší volný termín" (anyone, nearest free slot) plus therapist cards with photo and specialisation. Preselect the last therapist for returning clients.
  3. **Date and time** — a week strip of day chips with availability markers, then the free start times grouped Dopoledne / Odpoledne / Večer (morning / afternoon / evening). Add a "next available date" jump when a day is full.
  4. **Details and confirmation** — name, phone and email, an optional note, required consents, and the price and cancellation rule shown inline.

  This follows Baymard's findings on few fields, clear date-time hierarchy and upfront costs, and Jane's practitioner-or-discipline model.
- **15-minute slots:** the server should compute valid start times from the service duration, buffers, the therapist's shift and room or equipment availability. Show only valid starts. A 60–90-minute massage still gets 15-minute-aligned starts, but listing every quarter-hour can overwhelm on mobile. Consider showing the most common starts (:00/:30) first with "Zobrazit všechny časy" ("show all times") to expand. This is a hypothesis to A/B test, not an evidenced rule.
- **Accounts:** default to guest booking, verified by an email magic link or SMS one-time code. Offer "save my details" after booking instead of a registration wall (Baymard: 19% abandon on forced accounts; WCAG 3.3.8 favours password-free login). Add passkeys later.
- **Policy display:** state the cancellation window and any fee in plain Czech next to the confirm button, and again in the confirmation and reminders. For example: "Termín můžete zdarma zrušit nebo přesunout do 24 h předem" ("You can cancel or reschedule free of charge up to 24 h before"). Baymard's 39% "extra costs" finding means no surprises at the last step.
- **Reminders:** send at least two, for example 48 h and 2–3 h before, by SMS and email. Each should have one-tap "Potvrdit / Přesunout / Zrušit" (confirm / reschedule / cancel). The meta-analysis shows several notifications beat one. Connect this to an automatic waitlist offer to backfill freed slots.
- **Deposits or saved card:** apply them only selectively, for example to first visits or long massages, and measure conversion before and after. The evidence is vendor-only.
- **Confirmation screen:** include an .ics / Google Calendar link, Apple and Google Wallet passes (optional and lower priority), a manage-booking link, the clinic address with a maps link, and what to bring or wear.
- **Expected Czech conventions:** 24-hour time, d. M. yyyy dates, weeks starting on Monday, Czech plural forms in microcopy (1 termín / 2 termíny / 5 termínů). These are standard conventions, not researched here.

### Gaps
- No public A/B or conversion data comparing a "first available" default with therapist-first ordering.
- No independent data on whether Wallet passes or add-to-calendar improve attendance.
- The share of bookings made outside opening hours was not searched (budget exhausted). The figure is often quoted by vendors.
- Baymard's detailed time-slot guidelines are paywalled, and baymard.com could not be fetched. Baymard numbers come from search extracts.
- An NN/g article "Date picker UX design guidelines" (22 Jan 2017) is cited by the UK Intelligence Community design system but could not be retrieved. — [ICDS reference](https://design.sis.gov.uk/components/date-picker/accessibility)
- Vendor-blog claims could not be verified: Yakima Valley Farm Workers Clinic cut no-shows by more than half with automated self-rescheduling, and the Kaiser portal cut them by about 30%. A 2008 study by Mehrotra et al. reportedly found that flexible scheduling failed to reduce no-shows in 5 of 6 practices; it appeared only in a secondary summary.
- Possible continuity-versus-wait figure (unverified): a search snippet valued seeing a familiar physician at $12.18, against $7.22 for a one-day shorter wait (Annals of Family Medicine). The specific article could not be confirmed.
- No Czech-specific data was gathered on booking behaviour, payment preferences or no-show rates, for example from Reservio or Reservanto.

---

## 2. Admin / reception calendar UX

### Takeaway
Well-built staff calendars (Fresha, Jane, Notion Calendar) share these traits:
- columns per therapist or resource, with zoom and density controls and per-user display settings;
- toggles to show or hide cancelled and no-show items;
- click-to-create on a slot, and drag-and-drop with a non-drag alternative (WCAG 2.2 SC 2.5.7);
- "+N more" overflow handling;
- keyboard shortcuts and a command palette for power users.

FullCalendar Premium is the most mature confirmed off-the-shelf option for a resource timeline. Its MIT-licensed alternatives are free, but their resource-view support was not confirmed.

### Cited Findings

**Resource and team views, density, overflow**
- Fresha's calendar (from Fresha help pages):
  - Appointments can be dragged to a new slot. To move one outside the current view, users open it and reschedule with quick actions.
  - Team-member columns can be reordered by dragging (Team → Team members → Options → Change order).
  - Zoom can be set to Small or Large. An optional quick-actions toggle adds an appointment or blocked time by clicking a slot.
  - A team/resource selector filters the calendar. An appointment that uses several resources appears in both the team member's column and the resource's column.
  - When a day is full, extra bookings collapse into a "+X more" link that opens a filtered view.
  - Sources: [Fresha Academy: schedule appointments](https://www.fresha.com/help-center/academy/run-your-business/schedule-appointments/lessons/100253); [Fresha: calendar display settings](https://www.fresha.com/help-center/knowledge-base/calendar/16-manage-your-calendar-display-settings-); [Fresha: customize calendar view](https://www.fresha.com/help-center/knowledge-base/calendar/290-customize-your-calendar-view-1); [Fresha: create appointments](https://www.fresha.com/help-center/knowledge-base/calendar/260-create-appointments-1)
- Jane's schedule settings (opened from a cog icon):
  - Settings are saved per staff profile.
  - Appointment states can be shown or hidden. By default all scheduled items are shown, and cancelled, rescheduled and deleted breaks are hidden.
  - A zoom control sets how much of the schedule fits on the device's screen.
  - Appearance options include "Group by Discipline" and staff photos.
  - Source: [Jane guide: schedule view settings](https://jane.app/guide/schedule-view-settings)

**Colour coding**
- Carepatron, another clinic product, offers a "Color appointments by" filter, for example by team member or service. — [Carepatron help](https://help.carepatron.com/en/articles/8729209-customizing-calendar-view)
- No Fresha documentation on colour-coding was found (see Gaps).

**Drag and drop and its accessibility**
- Each drag-and-drop state (resting, lifted, over a drop zone) needs instant feedback on whether the action is possible. Users need a way to notice and learn the interaction. — [Smart Interface Design Patterns](https://smart-interface-design-patterns.com/articles/drag-and-drop-ux/)
- WCAG 2.1.1 (Keyboard) means drag-and-drop actions need a keyboard alternative. — [Continual Engine](https://www.continualengine.com/blog/drag-and-drop-accessibility/)
- WCAG 2.2 SC 2.5.7 Dragging Movements (AA): any function that uses dragging needs a single-pointer alternative, such as tap or click, unless dragging is essential. SC 2.5.8 Target Size (Minimum) (AA): pointer targets must be at least 24×24 CSS px, or spaced so that accidental activation is avoided. 44×44 px is the AAA target. — [Deque: WCAG 2.2](https://dequeuniversity.com/resources/wcag-2.2); [Silktide](https://silktide.com/blog/whats-new-in-wcag-2-2/); [WCAG 2.2 checklist](https://getwcag.com/en/wcag-2-2-checklist)

**Keyboard shortcuts and the command palette**
- In Notion Calendar (web and desktop), pressing "?" opens a searchable list of all shortcuts. Global shortcuts can be customised. — [Notion help](https://www.notion.com/help/notion-calendar-keyboard-shortcuts)
- Notion Calendar is Cron's successor. It has a Command Menu and lets users navigate and edit events without a mouse. — [Matthias Frank tutorial](https://matthiasfrank.de/en/notion-calendar/); [Cron global shortcuts](https://cronhq.notion.site/Global-keyboard-shortcuts-e933a55e7fb648028b09cedf933d3e76)
- The command palette is a modal, search-first overlay used by Linear, Vercel, GitHub, Slack and Raycast. Common requirements:
  - fuzzy matching;
  - recent commands at the top;
  - shortcuts shown next to each command;
  - focus kept in the input and returned to the trigger on close.

  The headless `cmdk` React library is most often used, frequently paired with shadcn/ui. — [Build a Command Palette (Cmd+K)](https://www.techinterview.org/post/3233475212/build-command-palette-cmd-k/); [skills.cat command-palette guide](https://skills.cat/skills/gwenwindflower/charmschool/web-ux-command-palette)
- Cmd+K is not a universal shortcut. VS Code uses ⌘⇧P, and ⌘K means "Insert link" natively in OS text editing and in Google Docs. Make the default configurable. — [CSS-Tricks](https://css-tricks.com/?p=351868)
- A command palette helps users find hidden features and reduces the need to memorise navigation. — [WebFactory](https://www.webfactoryltd.com/command-palette-ux-speeding-up-saas/)

**Calendar components (build vs. buy)**
- FullCalendar Premium starts at $480 and includes the Timeline View and Vertical Resource View. Every developer who writes code against or styles the premium API needs a developer seat. Renewal is "highly encouraged" because it brings upgrades and support. — [FullCalendar pricing](https://fullcalendar.io/premium). A third-party listing calls the price a one-time payment, which conflicts with the official renewal emphasis. — [FitGap](https://us.fitgap.com/products/fullcalendar)
- react-big-calendar is free, open source and React-only, but has fewer built-in features. — [Bryntum comparison](https://bryntum.com/blog/react-fullcalendar-vs-big-calendar/)
- Schedule-X is MIT-licensed, free for commercial use, and positioned as a modern alternative to FullCalendar and react-big-calendar. — [Best of JS: Schedule-X](https://bestofjs.org/projects/schedule-x)

**Products cited as design references, and why**
- **Linear** (UI redesign, March 2024):
  - Goals were to reduce visual noise, keep visual alignment, and increase the hierarchy and density of navigation elements.
  - Theme generation moved from HSL to LCH colour space for more consistent appearance, and the default gray became warmer.
  - Changes shipped behind feature flags so old and new versions could be compared with one click.
  - Sources: [Linear: How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui); [Linear changelog 2024-03-20](https://linear.app/changelog/2024-03-20-new-linear-ui)
- **Notion Calendar / Cron**: keyboard-first workflow with a "?" shortcut sheet and a Command Menu (see above).
- **Cal.com and Calendly**: switchable booker layouts and a familiar month view (see Q1).
- **Doctolib**: maintains an in-house design system called "Oxygen" (from job postings only). — [Doctolib job posting](https://www.welcometothejungle.com/en/companies/doctolib/jobs/senior-product-designer-os-x-f-m_paris). A designer's portfolio redesign cites a user complaint that only 7 of 100 visits end in a booked appointment through the app; this is an anecdote, not data. — [graphiste.com portfolio](https://graphiste.com/pictures/375392-doctolib)

### Inferences
- **Default reception view:** a day view with one column per therapist; rooms and equipment (gym or massage table) as secondary resources, as in Fresha's multi-resource columns. Add a week view per therapist and an agenda list for phones.
  - Grid: 15-minute lines with stronger hour lines, a current-time indicator, shaded non-working hours, hatched buffers and blocked time.
  - Moving and resizing appointments snaps to 15 minutes.
- **Conflicts:** prevent double bookings at the data layer. In the admin UI, show an inline conflict warning listing what clashes (therapist, room, client double-booked). Allow an explicit override with a reason only for reception and owner roles, never on the client side. No source tested conflict UI patterns; this is a design recommendation.
- **Colour:** colour appointments by service line (physio / training / massage). Show status (unconfirmed, arrived, no-show, unpaid) with icons or patterns as well, not colour alone. Let each user switch the "colour by" dimension, as Carepatron does.
- **Drag and drop:** pair it with click-to-select plus "Přesunout…" (move) and "Změnit délku…" (change length) actions, and keyboard arrows, to meet WCAG 2.5.7. Keep event chips and day cells at least 24×24 px, and aim for 44 px on touch screens (SC 2.5.8).
- **Fast client lookup:** a Ctrl/Cmd+K palette (with a configurable key) that searches clients by name, phone or email and opens a client card with upcoming and past visits, package balance, notes and a "new booking" button. Add shortcuts: T = today, ←/→ = previous/next day, D/W = day/week, N = new booking, / = search, ? = shortcut sheet (following Notion Calendar's "?").
- **Per-user display preferences:** zoom, visible states, grouping by discipline, staff photos, as in Jane. Reception and therapists need different defaults.
- **Mobile admin:** therapists get a single-column agenda for "my day" with arrive / no-show / take payment actions. Full drag-scheduling can stay desktop-first.
- **Build vs. buy:** FullCalendar Premium's resource timeline/vertical resource view is the lowest-risk component for multi-therapist plus room scheduling. MIT options would need checking (or custom work) for resource columns.

### Gaps
- No credible published ranking of the "best-designed" scheduling products was found. The design-quality claims here rest on vendor documentation and product write-ups.
- Fresha's appointment colour-coding options are undocumented in the results. Jane's colour options were not retrieved.
- NN/g's drag-and-drop article was not retrieved; only secondary or AI-generated summaries surfaced.
- Whether Schedule-X or react-big-calendar support resource columns was not confirmed. FullCalendar's licence terms (one-time vs. annual) conflict between sources. Bryntum, DayPilot and Mobiscroll were not researched.
- No user research was found on conflict-handling UX or on how reception staff use a command palette in clinic software.

---

## 3. Visual design trends 2025–2026 and recommended design system / components

### Takeaway
What reads as current in 2025–2026:
- restrained neutral palettes generated in perceptual colour spaces (LCH/OKLCH);
- a complete dark theme rather than inverted colours;
- modular "bento" tiles for dashboards;
- hierarchy carried by type weight and whitespace;
- short, purposeful motion that respects reduced-motion;
- larger, more prominent primary actions (backed by Google's Material 3 Expressive research).

Novelty effects (3D/WebGL, AI-personalised layouts, heavy glass) underdelivered by mid-2026. A practical stack for a web app is Tailwind v4 with shadcn/ui on Radix primitives, using OKLCH tokens, plus a dedicated scheduler component.

### Cited Findings
- **Bento grids:** described as the dominant SaaS dashboard layout in 2026, with large tiles for priority data and small tiles for secondary metrics. The figure "67% of top-100 SaaS" comes from a no-code vendor and could not be verified. — [Rocket.new](https://www.rocket.new/blog/bento-grid-ui-dashboard-no-code-for-saas)
- **Mid-2026 reality check:** bento grids and dark mode "keep winning", while 3D/WebGL and AI personalisation underdelivered. — [StudioMeyer: Webdesign trends 2026 reality check](https://studiomeyer.io/es/blog/webdesign-trends-2026-reality-check.md)
- **Dark mode:** 2026 trend roundups call it "expected" rather than a nice-to-have. They say the real difference is between a full dark design system and a toggle that simply inverts colours, and they note OLED energy savings. These vendor roundups' per-claim attribution was not verified. — [InspoAI SaaS trends 2026](https://www.inspoai.io/blog/saas-design-trends-2026); [The Plus Addons 2026](https://theplusaddons.com/blog/web-design-trends-2026/)
- **Other 2026 trends** (same roundups, opinion-level): glassmorphism with deeper backdrop blur and layering, AI-adaptive layouts, and bolder accent styling used sparingly (a single "neo-brutalist" call-to-action button). — [InspoAI](https://www.inspoai.io/blog/saas-design-trends-2026); [The Plus Addons](https://theplusaddons.com/blog/web-design-trends-2026/)
- **Typography:** an example dark SaaS dashboard uses high-contrast type (General Sans) and builds hierarchy through font-weight variation and negative space. — [Superdesign library](https://superdesign.dev/library/dark-saas-dashboard-spark-pixel-team)
- **Material 3 Expressive** (announced May 2025):
  - Google calls it its most-researched design-system update: 46 studies with more than 18,000 participants, using eye tracking, surveys and usability tests.
  - Users spotted key elements up to 4× faster, for example a larger, more prominent send button.
  - Users over 45 found elements about as quickly as younger users.
  - Caveats: the tests used concept mockups, and Google says emotion-centred design is "not a solution for all situations".
  - Sources: [Google Design: Expressive Material research](https://design.google/library/expressive-material-design-google-research); [Dezeen, 28 May 2025](https://www.dezeen.com/2025/05/28/google-ushers-in-age-of-expressive-interfaces-with-material-design-update/amp/); [DesignCompass](https://designcompass.org/en/2025/05-1tp-3tea/15/material-3-expressive/)
- **Perceptual colour spaces:** Linear moved theme generation from HSL to LCH for consistency, and warmed its default gray. Going too warm risks a "muddy" look. — [Linear redesign](https://linear.app/now/how-we-redesigned-the-linear-ui). Community guidance built on Linear's style recommends deriving the whole palette from a few base variables in LCH/OKLCH. — [skills.sh linear-design](https://skills.sh/blink-new/claude/linear-design)
- Linear also published a post on its take on Apple's "Liquid Glass" (only the title was retrieved). — [Plushcap: A Linear spin on Liquid Glass](https://www.plushcap.com/content/linear/blog/linear-a-linear-spin-on-liquid-glass)
- **shadcn/ui, Radix and Tailwind v4** (community sources):
  - shadcn/ui is a copy-paste component collection built on Radix UI primitives and Tailwind CSS. The code lives in your own repository.
  - Tailwind v4 is configured in CSS, without `tailwind.config.js`.
  - Semantic tokens are CSS variables in `:root` and `.dark`, exposed to Tailwind through `@theme inline`, with OKLCH values recommended.
  - Base palettes are neutral, gray, zinc, stone and slate.
  - Every project should define paired tokens: background, primary, muted, destructive, border, input, ring and radius, each with a foreground counterpart.
  - OKLCH needs Chrome 111+ or Safari 15.4+.
  - Sources: [skills.cat shadcn-ui](https://skills.cat/skills/sebastiaanwouters/dotagents/shadcn-ui); [sharedcontext shadcn-tailwind](https://sharedcontext.ai/skills/external/tenequm/shadcn-tailwind); [DesignRevision Tailwind colors](https://designrevision.com/tools/tailwind-colors)
- **Motion conventions** (community guidance, not standards):
  - Micro-interactions take about 100–250 ms, hover and tap feedback about 100–150 ms, and most animations stay under 400 ms.
  - Animate transform and opacity.
  - Respect `prefers-reduced-motion` by keeping functional feedback such as opacity changes and dropping large movement. The CSS media-query override does not stop animations driven by JavaScript.
  - Sources: [skills.cat micro-interactions](https://skills.cat/skills/dylantarre/animation-principles/micro-interactions); [OpenSkillIndex animation principles](https://openskillindex.com/skills/owl-listener-designer-skills-animation-principles)

### Inferences
- **What feels modern for a clinic:**
  - a calm, light-first patient UI with a warm-neutral base and one confident brand accent (for example a teal or green for health), generated as OKLCH scales;
  - generous whitespace and 8-pt spacing;
  - 12–16 px radii, used consistently;
  - large primary buttons (Material 3 Expressive evidence);
  - real therapist photos instead of stock illustrations;
  - a complete dark theme for the admin app, used in long reception shifts.
- **What feels dated or should be avoided:**
  - glassmorphism and gradients everywhere, which also hurt contrast;
  - neumorphism;
  - decorative 3D;
  - gauges and donut charts on dashboards (see Q4);
  - tiny, dense date grids on mobile;
  - carousel-heavy landing pages;
  - colour as the only status signal;
  - long, uninterruptible animations.
- **Stack (inference from the sources):**
  - Next.js/React with Tailwind v4 and shadcn/ui (Radix gives accessible dialog, popover, select and command primitives);
  - `cmdk` for the command palette;
  - a scheduler component (FullCalendar Premium resource views, or a custom grid);
  - a chart library aligned with shadcn (see Gaps).
- **Fonts:** choose a typeface with full Czech diacritics (Latin Extended-A: ě š č ř ž ý á í é ů ú ť ď ň) and tabular numerals for times and prices. Inter and Geist are common SaaS choices. This is general practice; Czech glyph coverage was not checked in this session.

### Gaps
- The official Tailwind v4 release notes (OKLCH default palette, release date), shadcn/ui docs (chart component and its base library) and Tremor/Vercel status were not verified, because searches were blocked by the exhausted budget. Facts about them here come from community sources.
- Most trend sources are vendor or agency blogs. No peer-reviewed or large-sample evidence on aesthetic trends in health or wellness apps was found.
- No research on dark-mode preferences of healthcare users or clinic staff was found.
- Material 3 Expressive targets Android and Google products. Its applicability and tooling on the web (Material Web) were not researched.

---

## 4. Clinic analytics: KPIs, definitions, benchmarks and visualisation

### Takeaway
The owner's core set:
- **utilisation**: booked or billable time divided by available time; about 75–85% is the commonly cited healthy band;
- **revenue per available hour**;
- **attendance**: arrival rate, no-show rate, and late cancellations; combined no-show plus late cancellation of 5–8% is "acceptable" per a vendor, and peer-reviewed physio non-attendance runs about 8–10%;
- **patient visit average and plan-of-care completion / early drop-off**: WebPT claims about 20% drop out within 3 visits and 70% don't finish care, but other figures conflict;
- **rebooking rate**: 60% or more per one vendor;
- **new patients by source**;
- **NPS**: detractors attend about 5 fewer visits;
- **package liability** (deferred revenue).

Visualise them following NN/g: fast, glanceable tiles that use length and position, not gauges. Separate an operational "today" view from analytical monthly views.

### Cited Findings

**Utilisation and capacity**
- Jane's definition: utilisation is the percentage of scheduled shift time spent seeing patients, calculated as booked time (arrived *and* no-show appointments) divided by shift duration minus breaks. — [Jane: dashboard metrics](https://jane.app/guide/what-do-my-dashboard-metrics-mean-a8255ab8-9af4-42cf-80f6-2e641dd68be3)
- Australian physio finance guide: utilisation = billable hours ÷ available hours, with a target of 75–85%. Revenue per available hour has a companion target of AUD 120–180. — [ScaleSuite: Physiotherapy clinic finance](https://www.scalesuite.com.au/resources/physiotherapy-clinic-finance)
- For clinics generally (not physio-specific): provider utilisation of 75–85% is a good range, the schedule gap rate should be below 10%, and the rebooking rate should be 60% or more. The vendor also claims a KPI system can improve EBITDA by 8–20% in the first year. — [Prospyr](https://prospyrmed.com/blog/post/scaling-clinics-data-driven-metrics)
- A low-reliability vendor template sets 80% of available treatment slots as the target for staff physiotherapists. It warns that loose definitions of "available slot" can hide problems. — [FinancialModelsLab](https://financialmodelslab.com/blogs/kpi-metrics/physiotherapy)
- Raintree's core physio productivity metrics: new patients per month, discharges, percent of vacant hours (the inverse of utilisation), visits per patient, and cancellation rate. No numeric targets are given. — [Raintree](https://www.raintreeinc.com/blog/productivity-metrics-for-physical-therapy/)

**Patient counts (Jane definitions)**
- Total Patient Count is the number of unique patients with an *arrived* appointment in the date range.
- New versus returning patients are counted clinic-wide. A separate "New Clients" metric counts patients who are new to a given practitioner.
- Total Visits is the number of arrived appointments.
- Source: [Jane: dashboard metrics](https://jane.app/guide/what-do-my-dashboard-metrics-mean-a8255ab8-9af4-42cf-80f6-2e641dd68be3)
- A review notes that Jane lacks lead-source tracking. — [Medesk review](https://www.medesk.net/en/blog/jane-app-review/)

**Patient Visit Average (PVA), plan-of-care completion and drop-off**
- PVA is the average number of appointments a patient has with the clinic over a period: total appointments ÷ new clients in the same period. It does not show visits per injury.
  - Illustrative example: about 10 for a physio clinic over 12 months, and 5–6 for a podiatry clinic doing skin and nail care.
  - PVA is lower for new graduates, who see a higher share of new clients.
  - Source: [Cliniko: What is a PVA?](https://www.cliniko.com/blog/practice-tips/what-is-a-patient-visit-average/)
- Framing PVA as a clinical-quality question ("are patients completing an appropriate course of care?") rather than a sales metric. — [Preve: UK physio clinics retention](https://preve.co/blog/how-uk-physio-clinics-are-improving-patient-retention-(without-being-salesy))
- WebPT's leadership (Heidi Jannenga) says about 20% of PT patients drop out within the first three visits and 70% fail to complete their full course of care. No primary study is named. — [WebPT webinar](https://www.webpt.com/webinars/knock-out-patient-dropout-8-ways-to-increase-retention-and-revenue); [Kemtai](https://kemtai.com/blog/how-much-revenue-are-you-losing-to-patient-drop-off/)
  - Conflicting figure: "State of Rehab Therapy" data cited by Pabau says only 7–25% complete their plan of care. — [Pabau](https://pabau.com/blog/patient-retention-in-physical-therapy/)
  - Vendors repeat the 70% figure without a source. — [Curogram](https://curogram.com/blog/emr-integration/webpt/prevent-patient-dropouts-physical-therapy)
- In US authorisation-based care, actual versus authorised visits of 70–85% is the benchmark, and below 60% suggests premature drop-out. This is a different construct from capacity utilisation. — [SPRY](https://www.sprypt.com/blog/rehab-metrics-in-value-based-care)

**Attendance: arrival, no-show and late-cancellation rates**
- Completion (arrival) rate = completed visits ÷ booked visits, for example 180 ÷ 200 = 90%. Each type of missed visit should be divided by booked visits, with the same definitions every month. A rescheduled appointment counts as a cancellation of the original slot plus a new booking. — [Physitrack: KPIs for small PT practices](https://www.physitrack.com/insights/physical-therapy-practice-kpis-small-clinics)
- Vendor rule of thumb: combined no-shows plus cancellations with less than 24 h notice of 5–8% is acceptable, and above 10% requires intervention. — [PulseRevOps](https://pulserevops.com/industry-kpis/ik0659)
- Peer-reviewed non-attendance rates in physiotherapy:
  - two Australian tertiary-hospital physio clinics (2018–2021): 8% and 10%, "at the lower end" of the published range — [PMC12104927](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12104927/);
  - NHS Digital 2018–19: physiotherapy had the highest did-not-attend rate of any specialty, 1 per 10.4 attendances (about 9.6%) — [CSP / AOCP poster](https://aocp.csp.org.uk/system/files/documents/2020-12/george_pruddens_poster.pdf);
  - a South African hospital: 33% for initial appointments, with transport the main cause — [Wits University](https://wiredspace.wits.ac.za/items/e6c2e525-2fb9-43e0-89f6-41288e28df91).

**Rebooking and retention (massage / wellness side)**
- A single-therapist anecdote: rebooking rate rose from 30% to 85% in under 90 days. — [MASSAGE Magazine](https://www.massagemag.com/?p=141520)
- Claim that clients who book their next appointment before leaving have 30–40% higher retention. No primary source is given. — [Pure Spa Direct](https://purespadirect.com/blogs/pure-spa-direct-blog/client-retention-strategies-for-massage-therapists-beyond-the-first-visit-build-a-thriving-booked-solid-practice)
- The ABMP (massage professional association) podcast discusses how to measure rebooking rates (title only). — [ABMP Ep. 523](https://www.abmp.com/podcasts/ep-523-how-measure-rebooking-rates-business-or-pressure-allissa-haines)

**Yield metric for massage and spa: RevPATH**
- Revenue per available treatment hour = occupancy rate × average treatment rate, where average treatment rate = treatment revenue ÷ treatments sold. It is analogous to the hotel metric RevPAR. Definitions vary between operators, so it compares poorly across businesses. — [Book4Time: spa KPIs](https://book4time.com/?p=27933); [GOCO Hospitality spa profitability report](https://gocohospitality.com/wp-content/uploads/2020/01/INDUSTRY_REPORT_SPA-PROFITABILITY.pdf)
- Dated benchmarks:
  - PwC Middle East, 2014: Doha about US$30 per hour, Dead Sea about $15, Beirut about $14 — [Spa Business](https://www.spabusiness.com/wellness-news/Middle-East-Spa-Benchmark-Report-for-first-three-quarters-of-2014-PwC/313628);
  - US luxury hotel spas, June 2009: $120.88, down 13% year on year — [Hospitality Net / STR](https://www.hospitalitynet.org/news/4042689.html).

**NPS and patient experience**
- NPS = % promoters − % detractors. Fred Reichheld (who created NPS) puts the cross-industry average at 10–15. In PT, detractors average about five fewer visits than promoters, which makes NPS useful for spotting patients at risk of dropping out. — [WebPT NPS guide](https://webpt.com/blog/the-essential-guide-to-nps-for-private-practice-pts-ots-and-slps)
- Self-reported PT company scores are not independent benchmarks: U.S. Physical Therapy reports 93 and Luna reports 87 for 2023. — [USPh](https://www.usph.com/nps-score-and-why-it-matters-in-physical-therapy/); [Luna](https://www.getluna.com/blog/luna-attains-world-class-nps-and-patient-satisfaction-4-years-in-a-row)
- An informal healthcare rule of thumb from an executive on a 2025 earnings call: 30 is good and 50 is excellent. — [SEC filing exhibit](https://www.sec.gov/Archives/edgar/data/0000885978/000088597825000044/ex99-1.htm)

**Packages and prepaid sessions (liability)**
- A prepaid package is a liability (deferred revenue) when sold and becomes revenue as each session is delivered. Example: a 20-session package for $2,000 goes in full to deferred revenue, with no income recognised yet. — [Beancount: prepaid sessions guide](https://beancount.io/blog/2026/08/16/personal-training-studio-bookkeeping-prepaid-sessions-deferred-revenue-guide); [Beancount: med spa packages](https://beancount.io/blog/2026/07/16/med-spa-bookkeeping-deferred-revenue-packages-gift-cards-memberships-guide)
- Cash-basis accounting can overstate revenue for services not yet delivered. — [Hint support](https://support.hint.com/en/articles/14462938-package-revenue-accounting)

**Engagement between sessions (home exercise programme)**
- Physitrack reports which patients have not completed questionnaires, which have not opened education content, and the percentage of assigned exercises completed, with CSV export. — [Physitrack support](https://support.physitrack.com/article/631-what-is-client-reporting)

**How to visualise (dashboard guidance)**
- NN/g on dashboards:
  - Dashboards give information "that can be consumed fast, with a minimum of interaction or cognitive processing". They are not for exploration.
  - *Operational* dashboards support time-sensitive tasks; *analytical* dashboards support decisions without the same urgency.
  - Charts should use length and 2D position for quantities, which the eye processes preattentively.
  - Sources: [NN/g: Dashboards and preattentive processing](https://www.nngroup.com/articles/dashboards-preattentive/); [NN/g video: Data visualizations for dashboards](https://www.nngroup.com/videos/data-visualizations-dashboards/)
- Practitioner guidance (paraphrasing NN/g): use bullet graphs and sparklines, and avoid decorative gauges and 3D charts. — [echai.ventures](https://echai.ventures/startingup/product-design-ux/how-do-i-make-a-data-heavy-dashboard-readable-instead-of-an-overwhelming-wall-of-numbers)
- Practice-management vendors market clinic KPI dashboards as a core feature (Nookal: "Know exactly how your clinic is performing"). — [Nookal KPI dashboard](https://www.nookal.com/healthcare-kpi-dashboard)

### Inferences
**Proposed KPI set for the clinic.** Formulas are adapted from the cited sources. Targets are references from the sources, not validated Czech benchmarks.

| KPI | Proposed formula | Reference value (source) | Suggested visual |
|---|---|---|---|
| Utilisation (per therapist, per service line) | booked minutes (arrived + no-show) ÷ (shift minutes − breaks). Optionally a "billable" variant: arrived minutes ÷ available minutes | 75–85% (ScaleSuite, Prospyr) | Heatmap of weekday × hour (from 15-min data, aggregated by hour) plus a weekly trend line per therapist |
| Schedule gap rate | unbooked available minutes ÷ available minutes | <10% (Prospyr) | The same heatmap, showing unused gaps |
| Revenue per available hour | net revenue ÷ available therapist hours | AUD 120–180 in Australia (ScaleSuite); convert to the clinic's own CZK baseline | Bars per therapist and service line |
| RevPATH (massage) | occupancy × average treatment rate | Only dated spa benchmarks exist | Trend line |
| Arrival rate | arrived ÷ booked | e.g. 90% (Physitrack example) | KPI tile with change vs. previous period |
| No-show rate / late-cancellation rate (<24 h) | each ÷ booked; rescheduling = cancellation + new booking | Combined 5–8% acceptable, >10% act (PulseRevOps); physio did-not-attend in literature ≈8–10% | Tiles, plus a stacked bar by weekday or lead time |
| Rebooking rate | completed visits that have a future booking at checkout ÷ completed visits, excluding planned discharges | ≥60% (Prospyr, generic) | Tile and per-therapist bars |
| PVA | total appointments ÷ new patients (same 12-month period) | ≈10/year physio example (Cliniko) | Per-therapist bars |
| Early drop-off | share of new patients with fewer than 3 visits and no future booking, measured 30 days after last visit | ~20% (WebPT claim) | Funnel: 1st → 2nd → 3rd → … visit |
| Plan-of-care completion | episodes ended "goal achieved / discharged" ÷ all closed episodes. Needs an episode or plan entity in the data model | 30% (WebPT implied) vs. 7–25% (Pabau / State of Rehab): contested | Tile and cohort table |
| New patients and acquisition source | count of first visits by "how did you find us" or UTM source | Jane lacks this (Medesk), so it is a differentiator | Stacked bars by month |
| Retention cohorts | % of a month's new patients who return in month +1, +3, +6 | No benchmark found | Cohort grid |
| NPS | % promoters (9–10) − % detractors (0–6), surveyed after the 2nd–3rd visit and at discharge | Healthcare informal: 30 good / 50 excellent | Tile plus trend; flag detractors for follow-up |
| Package liability | Σ (unused sessions × per-session price) for active packages; also show expiring soon | Deferred revenue accounting (Beancount, Hint) | Table and a single liability figure |
| LTV (derived) | average net revenue per visit × PVA, or a cohort-based 12/24-month revenue per new patient | No source formula retrieved | Tile segmented by acquisition source |

**Dashboard layout (inferred from NN/g's split):**
- **"Dnes" (Today), the operational view for reception:**
  - today's arrivals and their status;
  - unconfirmed bookings;
  - gaps that could be filled from the waitlist;
  - unpaid visits;
  - therapist utilisation for today and the rest of the week.
- **"Přehled" (Overview), the analytical view for the owner:**
  - Top row: 4–6 KPI tiles (revenue, utilisation, arrival rate, new patients, rebooking rate, NPS), each with the change versus the previous period and a sparkline.
  - Below: the utilisation heatmap, per-therapist bars, the new-patient funnel and the cohort grid.
  - Filters for period, therapist, service line (physio / training / massage) and location.
  - Every metric links to its definition (a hover or "i" tooltip) so definitions stay consistent month to month, as Physitrack advises.
  - Use bars, lines, heatmaps and bullet graphs. Avoid gauges, pies with many slices and 3D (NN/g).

**Data-model implications:**
- To get these KPIs the system must record:
  - appointment states: booked, confirmed, arrived, no-show, late-cancel, cancel, rescheduled;
  - cancellation timestamps, to tell late from early;
  - an episode-of-care or plan entity, with planned visits and discharge reason;
  - acquisition source at the first booking;
  - package ledger entries;
  - shift and break templates, as the denominator for utilisation.

### Gaps
- No Czech or Central-European benchmarks were found for physio utilisation, no-shows, PVA or rebooking (search budget exhausted).
- The 70% "fail to complete care" figure traces only to WebPT leadership, and the "State of Rehab Therapy" 7–25% figure comes via Pabau. The primary report was not retrieved.
- No reliable rebooking benchmark specific to massage was found. A 55% retention figure for "hospitality/service businesses" (attributed to Shopify via a vendor blog) and 40–60% win-back rates from day-30/60/90 outreach are unverified vendor claims.
- A third-party summary said 63% of Fresha marketplace-originated clients rebook within 12 months. It could not be verified against Fresha's own data.
- No authoritative LTV formula for physio was retrieved; the LTV row above is derived.
- No independent physio NPS benchmark was found; the published scores are self-reported.
- The dashboard designs of Jane, Cliniko and Nookal (chart types, layouts) could not be inspected because the pages could not be fetched.
- Czech accounting treatment of prepaid packages, VAT on wellness versus healthcare services, and expiry ("breakage") rules were not researched. Check them with a Czech accountant.
