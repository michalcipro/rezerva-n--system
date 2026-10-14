# Communication & integration stack for a Czech physiotherapy / massage / conditioning booking platform (e-mail, SMS, payments, invoicing, calendar sync, build foundations)

> **Date seen for every price and fact below: 2026-10-14.**
> **Method caveat:** I couldn't open pages directly in this research environment. WebFetch failed with DNS errors, and the egress proxy refused curl to vendor sites under organization policy. All findings therefore come from **search-engine extracts of the cited pages**, mostly from searches restricted to the vendor's own domain. Treat the numbers as indicative and re-check each one on the live page before quoting it as final. The shared web-search budget for this turn **ran out partway through**. As a result, **iDoklad / POHODA / Money S3, Q6 (calendar sync) and Q7 (build foundations) have no verified findings.** Their Gaps sections list clearly labelled **UNVERIFIED** background knowledge and the primary docs to check.
> Abbreviations: "excl. VAT" = bez DPH; "incl. VAT" = s DPH.

---

## Q1. Newsletter / e-mail marketing tools: Czech (Ecomail, SmartEmailing, Mailkit) vs global (Mailchimp, Brevo, MailerLite, Klaviyo)

### Takeaway
For a clinic-sized audience (hundreds to a few thousand contacts), the Czech tools are price-competitive. They charge by contact count and allow unlimited sends:
- **Ecomail:** lowest tier about $16.67–20/month (Profi) or $25–30/month (Marketer+); free up to 200 contacts.
- **SmartEmailing:** from €5.23/month (annual billing) for up to 500 contacts, all features included.

Global free tiers shrank to about 250 contacts in 2025–2026 (Mailchimp, MailerLite, Klaviyo). **Brevo** is the exception, with a free plan of 300 e-mails/day and transactional e-mail on every plan. **Mailkit** publishes no current price list. EU hosting and GDPR terms could not be verified in this session.

### Cited Findings
**Ecomail (CZ)**
- English pricing page, prices in USD for the lowest contact tier:
  - **Profi**: $16.67/month on yearly billing, or $20 monthly.
  - **Marketer+**: $25/month yearly, or $30 monthly.
  - Prices rise with contact count. — [Ecomail pricing](https://ecomail.app/pricing/)
- Marketer+ adds what Profi lacks: product XML feed import, behavioural automations, abandoned-cart tracking, web tracking and **transactional e-mails**. — [Ecomail pricing](https://ecomail.app/pricing/)
- Transactional e-mails are available only on **Marketer+ and CDP**, not on Profi. Price depends on the number of unique active contacts, and paid plans have **no send limit**. — [Ecomail support](https://support.ecomail.cz/cs/articles/2636778-predplaceny-tarif-nebo-kreditovy-balicek)
- Paid plans have a **3-month minimum term**. Databases of 50,000+ contacts get a custom offer. — [Ecomail pricing](https://ecomail.app/pricing/)
- New customers can test Marketer+ free for 14 days on their full database. — [Ecomail – přechod z jiného nástroje](https://ecomail.cz/prechod-z-jineho-nastroje/)
- Third-party 2026 review (Polish edition):
  - Free up to 200 contacts.
  - At 5,000 contacts on annual billing: about **142 / 214 / 516 PLN per month** for Profi / Marketer+ / CDP.
  - SMS campaigns from 0.20 PLN per message.
  - An AI agent called "EMA" is included in all plans from June 2026.
  - — [loudavymkrokem.cz (PL)](https://loudavymkrokem.cz/pl/ecomail-recenzja/)
- The free tier up to 200 contacts is also noted by a 2026 Czech review, which adds that cost rises with database size and that advanced features sit in higher tiers. — [arecenze.cz](https://www.arecenze.cz/?p=393152)

**SmartEmailing (CZ)**
- "Starts at **€5.23 per month** with annual billing for a database of up to 500 contacts". You pay only for database size, and all features, including AI, are included. — [SmartEmailing (EN homepage)](https://www.smartemailing.cz/?lang=en)
- Tariff rules — [SmartEmailing tariff terms](https://www.smartemailing.cz/obchodni-podminky/obchodni-podminky-parametry-k-tarifum/):
  - Billing is monthly or discounted annual, by number of contacts, with no limit on sending frequency.
  - Each contact is counted once, regardless of how many lists it is in. Bounced contacts are not counted.
  - The tariff does not change automatically. Extra contacts generate an additional invoice.
  - Exceeding the tariff by more than 10% locks the account for sending.
- SMS is billed separately at month end. A custom SMS Sender ID costs **990 CZK one-time + 590 CZK/month excl. VAT** (older page). — [SmartEmailing SMS sender ID](https://www.smartemailing.cz/sms-sender-id/)
- Automation scenarios can include a "send SMS" action. — [SmartEmailing help](https://napoveda.smartemailing.cz/article/1257-scenar-automatizovana-rozesilka-sms)
- Third-party review: about **1,140 Kč/month** (annual billing, excl. VAT) for tariffs up to 5,000 contacts, plus a 14-day free trial. Possibly outdated: the article reviews a different product (SmartMailer). — [arecenze.cz](https://www.arecenze.cz/clanky/recenze-smartmailer/)
- The Czech booking SaaS Zenamu documents a ready-made SmartEmailing newsletter integration. This shows the pattern of a booking system syncing contacts into a CZ e-mailing tool. — [Zenamu docs](https://www.zenamu.com/docs/reservation-system/send-newsletters/integration-smartemailing/)

**Mailkit (CZ)**
- No current public price list was found. The only figure is an old homepage snapshot (about 8 years old) showing volume pricing "from $389/month". — [Mailkit](https://www.mailkit.com/)
- Czech company (Praha 8, IČ 26449901) with support in Czech and English and a named data-protection officer (dpo@mailkit.com). — [Mailkit contact](https://www.mailkit.com/about-us/contact)
- Free campaign previews in 30+ e-mail clients, including Seznam.cz and Centrum.cz webmail (relevant for Czech audiences). — [Mailkit blog](https://www.mailkit.com/cz/podpora/blog/mailkit-umoznuje-nahledy-kampani-z-webmailu-seznamcz-centrumcz-30-ti-dalsich-emailovych-klientu)

**Brevo**
- Free plan: **300 e-mails/day** (about 9,000/month).
  - The limit resets daily and unused sends don't roll over.
  - Campaigns to more than 300 recipients reach only 300 that day.
  - Paid plans remove the daily cap.
  - — [Brevo help – Free plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)
- Schema data on the transactional-email page lists:
  - **Starter $9/month** and **Standard $18/month**, each from 5,000 e-mails/month.
  - **Professional $499/month** for 150,000 e-mails/month.
  - Enterprise at custom pricing.
  - — [Brevo transactional e-mail](https://www.brevo.com/products/transactional-email/)
  - The help center describes the tiers differently (Starter up to 100k, Standard up to 500k, Professional up to 10M e-mails/month). These conflict with the figures above, so verify on the live pricing page. — [Brevo help](https://help.brevo.com/hc/en-us/articles/8292912279954-Add-or-remove-emails-from-your-plan); [Brevo pricing](https://www.brevo.com/pricing/)
- **All Brevo plans include transactional e-mail**: REST API, SMTP, outbound webhooks and unlimited log retention. — [Brevo transactional e-mail](https://www.brevo.com/products/transactional-email/)

**MailerLite**
- Free plan: up to **250 subscribers, 2,500 e-mails/month**, 2 seats. Sending is locked once active subscribers exceed 250. — [MailerLite pricing](https://www.mailerlite.com/pricing); [MailerLite free plan](https://www.mailerlite.com/free-plan)
- Paid plans are now called **Comfort** (from $12/month) and **Power** (unlimited monthly e-mails). Older pages cite Power at $25/month for 500 subscribers. The old names "Growing Business" and "Advanced" no longer appear. — [MailerLite pricing](https://www.mailerlite.com/pricing)

**Mailchimp**: third-party 2026 guides only; the official page was not retrieved.
- Free plan: 250 contacts, 500 sends/month (250/day), 1 seat, 1 audience. — [emailtooltester](https://www.emailtooltester.com/en/reviews/mailchimp/pricing/); [omidsaffari.com](https://omidsaffari.com/blog/mailchimp-pricing)
- **Essentials** from $13/month for 500 contacts. Sends are capped at 10× contacts, automation flows at 4 steps, and advanced segmentation is not included. — [emailtooltester](https://www.emailtooltester.com/en/reviews/mailchimp/pricing/); [groupmail](https://blog.groupmail.io/mailchimp-pricing-2026/)
- **Standard** from $20/month for 500 contacts, with up to 200 automation flows. — [emailtooltester](https://www.emailtooltester.com/en/reviews/mailchimp/pricing/); [groupmail](https://blog.groupmail.io/mailchimp-pricing-2026/)
- At 5,000 contacts, about $75 (Essentials) or $100 (Standard). Premium starts at $350. — [emailtooltester](https://www.emailtooltester.com/en/reviews/mailchimp/pricing/); [groupmail](https://blog.groupmail.io/mailchimp-pricing-2026/)
- The free plan was cut in early 2026. Sources conflict on the date (January 2026 vs 17 February 2026). One guide warns that Mailchimp also bills for unsubscribed and duplicate contacts. — [sendbroadcast](https://sendbroadcast.net/compare/mailchimp-pricing); [usecarly](https://www.usecarly.com/blog/mailchimp-pricing/)

**Klaviyo**
- Free plan: **250 active profiles, 500 e-mail sends/month**. Klaviyo branding appears in footers. E-mail support is available only for the first 60 days. — [Klaviyo pricing](https://www.klaviyo.com/pricing); [Klaviyo help](https://help.klaviyo.com/hc/en-us/articles/360050759151)
- The paid entry price is inconsistent across Klaviyo's own pages: $20 for 251–500 profiles, "from $60/month", and "$45 for 15,000 e-mails". — [Klaviyo pricing](https://www.klaviyo.com/pricing); [Klaviyo e-mail marketing](https://www.klaviyo.com/products/email-marketing)

### Inferences
- **Fit for a clinic.** A private physio/massage/conditioning clinic will typically have about 1,000–5,000 newsletter contacts. Contact-based CZ tools (Ecomail, SmartEmailing) with unlimited sends suit monthly newsletters and segmented campaigns. Global free tiers capped at 250 contacts (Mailchimp, MailerLite, Klaviyo) are too small.
- **Klaviyo** is e-commerce-oriented (product feeds, SMS) and is likely overkill.
- **Mailchimp's** contact-based billing that includes unsubscribed contacts makes it comparatively expensive at clinic scale.
- **One vendor for both streams.** Ecomail requires **Marketer+** (not Profi) for transactional e-mail, so a cheap Profi newsletter plan would need a separate transactional provider (see Q2). Brevo bundles both even on the free plan.
- **Segmentation pattern.** Push contact attributes from the booking database into the ESP via API, for example:
  - service type (physio / massage / conditioning)
  - therapist
  - last-visit date
  - package/credit balance
  - consent flags

  Then segment and trigger automations in the ESP, for example "no visit in 90 days" or "massage clients only". The Zenamu ↔ SmartEmailing integration shows this pattern is standard in Czech booking SaaS.
- **SMS from the ESP.** Ecomail and SmartEmailing can also send SMS from automations, which could cover simple reminders. Per-SMS pricing should still be compared with the dedicated gateways in Q3.

### Gaps
- **CZK price tables** for Ecomail (ecomail.cz/price) and SmartEmailing (smartemailing.cz/ceny) were not retrieved. Only USD/EUR/PLN figures and third-party CZK figures are above.
- **API, segmentation and automation depth per plan** for Ecomail, SmartEmailing and Mailkit (REST API docs, webhooks, rate limits) were not verified.
- **EU hosting / GDPR (DPA, sub-processors, data location)** was not verified for any vendor in this session. UNVERIFIED background:
  - Ecomail, SmartEmailing and Mailkit are Czech companies.
  - Brevo is French. MailerLite is Lithuania-based.
  - Mailchimp (Intuit) and Klaviyo are US companies relying on SCCs / the EU-US Data Privacy Framework.
  - Each vendor's DPA and sub-processor list must be checked.
- The official Mailchimp pricing page was not retrieved (third-party data only). Mailkit's current pricing requires contacting sales.

---

## Q2. Transactional e-mail providers (Postmark, Resend, Amazon SES, SendGrid, Mailgun, Brevo) and deliverability requirements (SPF, DKIM, DMARC, Gmail/Yahoo 2024 rules, RFC 8058)

### Takeaway
At clinic volumes (a few thousand confirmations and reminders per month), transactional e-mail costs between almost nothing and about $15–20/month:
- **Amazon SES:** $0.10/1k à-la-carte; new plans from July 2026 at $0.16/1k.
- **Resend:** free for 3,000/month (100/day), or Pro $20 for 50k.
- **Postmark:** $15 for 10k.
- **Mailgun:** $15 for 10k, with an EU region available.
- **Brevo:** free for 300/day.
- **SendGrid:** dropped its permanent free plan.

Every sender needs SPF or DKIM, PTR, TLS and a spam rate below 0.3%. Bulk senders (about 5,000+/day to Gmail) must also add DMARC with alignment and RFC 8058 one-click unsubscribe on marketing mail, honored within 2 days. Gmail tightened enforcement in November 2025.

### Cited Findings
**Postmark**
- Free Developer plan with 100 e-mails/month. There is no tier between 100 and 10,000. — [Postmark pricing](https://postmarkapp.com/pricing)
- 10k tier: **Basic $15/month** (no inbound), **Pro $16.50**, **Platform $18**. Pro and Platform features were made available at the 10k level; Pro was previously $60.50 and Platform $138. — [Postmark pricing](https://postmarkapp.com/pricing); [Postmark update](https://postmarkapp.com/updates/pro-and-platform-tier-features-now-accessible-to-lower-volume-plans)
- Overage is **$1.20/1,000** on the pricing page vs **$1.80/1,000** in a support article (conflict). — [Postmark pricing](https://postmarkapp.com/pricing); [Postmark support](https://postmarkapp.com/support/article/1107-how-does-monthly-pricing-work)

**Resend**
- **Free: 3,000 e-mails/month with a 100/day limit.** **Pro: $20/month for 50,000 e-mails**, then $0.90 per extra 1,000. Paid plans have no daily limit. — [Resend pricing](https://resend.com/pricing); [Resend quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits)
- Multi-region sending exists ("use a region nearest to your users"). An older Resend post said region selection was Pro-only. A specific EU region (e.g. Ireland) was **not confirmed**. — [Resend blog](https://resend.com/blog/new-free-tier); [Resend – migrate from SendGrid](https://resend.com/migrate/sendgrid)

**Amazon SES**
- À-la-carte: **$0.10 per 1,000 outbound e-mails** + $0.12/GB of attachments. Global endpoints add $0.03/1,000. — [Amazon SES pricing](https://aws.amazon.com/ses/pricing/)
- **New in July 2026: SES pricing plans (Essentials / Pro / Enterprise).** — [AWS What's New (07/2026)](https://aws.amazon.com/about-aws/whats-new/2026/07/amazon-ses-pricing-plans/); [AWS blog](https://aws.amazon.com/blogs/messaging-and-targeting/introducing-amazon-simple-email-service-ses-pricing-plans/)
  - From 21 July 2026, new accounts start on Essentials.
  - Rates for 0–10M e-mails/month: Essentials **$0.16/1,000**, Pro $0.22, Enterprise $0.23.
  - Plans are available in all SES regions except UAE and Bahrain, so Frankfurt eu-central-1 is covered.
  - The extract was inconsistent about which plan is the default, so verify.
- The SES-only free tier (3,000 messages/month for 12 months) is **no longer available to new customers from 21 July 2026**. New accounts get up to $200 of AWS Free Tier credits for 6 months instead. — [Amazon SES pricing](https://aws.amazon.com/ses/pricing/)

**SendGrid (Twilio)**: third-party 2026 guides only.
- The permanent free plan was replaced by a **60-day trial** (100 e-mails/day). — [automationatlas](https://automationatlas.io/answers/sendgrid-pricing-explained-2026/); [costbench](https://costbench.com/software/email-api/sendgrid/); [saaspricepulse](https://www.saaspricepulse.com/tools/sendgrid)
- **Essentials from $19.95/month.** **Pro from $89.95/month** (up to 100k, dedicated IP). Premier is custom. — same sources
- Included volumes and overage rates conflict between sources. — same sources

**Mailgun (Sinch)**
- **Basic from $15/month for 10,000 e-mails**, with overage at $1.80/1,000. — [Mailgun pricing](https://www.mailgun.com/pricing/)
- **Foundation $35/month for 50,000**, with overage at $1.30/1,000, falling to $1.10 at higher volumes. — [Mailgun pricing](https://www.mailgun.com/pricing/)
- **US or EU region per sending domain**, both in one account. — [Mailgun vs Amazon SES](https://www.mailgun.com/compare/amazon-ses-vs-mailgun/)
- Whether the EU region is available on Basic is not stated.

**Brevo**
- Transactional e-mail (API, SMTP, webhooks, logs) is included on **all plans, including Free** (300/day). — [Brevo transactional e-mail](https://www.brevo.com/products/transactional-email/); [Brevo free plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)

**Gmail sender requirements (official)** — [Gmail sender guidelines](https://support.google.com/mail/answer/81126?hl=en); [Sender guidelines FAQ](https://support.google.com/a/answer/14229414?hl=en); [Google blog (2023 announcement)](https://blog.google/products/gmail/gmail-security-authentication-spam-protection/)
- **All senders, since February 2024:**
  - SPF **or** DKIM.
  - Valid forward and reverse DNS (PTR) for sending domains/IPs.
  - TLS for transmission.
  - Spam rate (Postmaster Tools) **below 0.3%**.
  - RFC 5322-compliant formatting.
- **Bulk sender definition:** "close to 5,000 messages or more" to personal Gmail accounts within 24 hours. The status is **permanent** once assigned.
- **Bulk sender requirements:**
  - SPF **and** DKIM **and** DMARC; a policy of `p=none` is acceptable.
  - The From: domain must align with the SPF **or** DKIM domain.
  - DKIM keys of at least 1024 bits; 2048 bits is recommended.
- **One-click unsubscribe** is required for marketing/subscribed mail, and requests must be honored **within 2 days (48 h)**. — [Gmail subscription guidelines](https://support.google.com/mail/answer/15263077?hl=en)
- **Enforcement ramp-up from November 2025:** non-compliant traffic sees temporary and permanent rejections. Compliance can be checked on the Postmaster Tools "Compliance status" dashboard. — [Gmail sender guidelines](https://support.google.com/mail/answer/81126?hl=en); [Postmaster Tools dashboards](https://support.google.com/mail/answer/14668346?hl=en)
- Third-party guides add, as their own advice rather than Google rules:
  - Since November 2025 non-compliant mail is rejected rather than deferred.
  - Aim for an internal spam-rate target well below 0.3% (e.g. <0.1%).
  - Transactional mail is generally exempt from the unsubscribe requirement.
  - — [Red Sift](https://redsift.com/resources/blog/gmails-enforcement-ramps-up-what-bulk-senders-need-to-know); [zenbee](https://zenbee.io/blog/gmail-bulk-sender-requirements/)

**Yahoo sender requirements**
- A body unsubscribe link alone is **not** enough. Senders need a `List-Unsubscribe` header, "preferably according to RFC 8058". The body link is still expected and may lead to a preference page. — [Yahoo Sender Hub FAQ](https://senders.yahooinc.com/faqs)
- Unsubscribes must be honored within 2 days, with no grace period. Enforcement began June 2024. — [Yahoo Sender Hub FAQ](https://senders.yahooinc.com/faqs)
- Bulk mail must use SPF and DKIM, publish DMARC of at least `p=none`, and pass DMARC aligned with the visible From domain. — [Yahoo Sender Hub FAQ](https://senders.yahooinc.com/faqs)
- The spam-rate threshold is 0.3%. Yahoo publishes no numeric "bulk" volume threshold. — [Yahoo Sender Hub FAQ](https://senders.yahooinc.com/faqs); [Palisade](https://www.palisade.email/learning/yahoo-bulk-sender-requirements)
- Yahoo highly recommends the RFC 8058 POST method; `mailto:` is acceptable. — [Resend KB](https://resend.com/docs/knowledge-base/how-do-i-avoid-yahoos-spam-folder.md)

**RFC 8058 (one-click unsubscribe)** — [RFC 8058 (IETF)](https://datatracker.ietf.org/doc/html/rfc8058); [RFC Editor](https://rfc-editor.org/rfc/rfc8058)
- `List-Unsubscribe-Post` must contain exactly `List-Unsubscribe=One-Click`.
- The message must carry a valid **DKIM signature that covers both `List-Unsubscribe` and `List-Unsubscribe-Post`** in its `h=` tag. Receivers SHOULD NOT offer one-click without it.
- The sender must not redirect the POST.
- Receivers must not POST without user consent.

### Inferences
- **Volume and cost estimate.** 800–1,000 appointments/month × 2–3 transactional e-mails (confirmation, 24 h reminder, receipt/follow-up) ≈ 2,000–3,000 e-mails/month:
  - **SES:** about $0.20–0.50/month at $0.10–0.16 per 1k (my calculation from the prices above).
  - **Resend Free:** fits the monthly quota, but the 100/day cap could block a busy day plus a reschedule wave.
  - **Postmark Basic / Mailgun Basic:** $15/month.
- The choice should therefore depend on developer experience, webhooks (delivery/bounce events), an EU region (Mailgun EU is confirmed) and deliverability reputation, not on price.
- **Bulk-sender status.** The clinic will be far below Gmail's ~5,000/day bulk threshold, so the strict bulk rules don't formally apply. The "all senders" rules do apply, and following the bulk checklist anyway is cheap insurance:
  - SPF + DKIM (2048-bit) + DMARC aligned on the clinic's own domain.
  - RFC 8058 headers on newsletters.
  - Unsubscribes processed within 48 h.
- Mainstream ESPs (Ecomail, Brevo, etc.) usually inject the List-Unsubscribe headers themselves. This was not verified per vendor.
- **Reputation isolation.** Keeping marketing and transactional streams on separate subdomains or streams (e.g. Postmark's separate "message streams") limits the damage a newsletter complaint spike can do to appointment confirmations. This is a common best practice, not verified in this session.
- **Health data.** Reminder content for a physio clinic is health-related personal data. Keep e-mails minimal (date, time, location, therapist; no diagnosis) and prefer EU-region processing. Legal details belong to the GDPR research stream.

### Gaps
- EU data-residency options were not verified for Resend (which region and which plans), Postmark, SendGrid or Brevo.
- **Seznam.cz / Email.cz** sender requirements were not researched. Seznam is a major Czech mailbox provider; the Mailkit source only confirms preview support.
- SES: Frankfurt-specific terms, which SES plan is the default for new accounts, and what each plan includes are not confirmed.
- The exact current SendGrid plan volumes conflict across sources, and the official page was not retrieved.

---

## Q3. SMS gateways in CZ (BulkGate, SMSbrána, GoSMS, SMS Manager, Twilio): price per SMS, sender ID, API; WhatsApp / Viber / push alternatives

### Takeaway
Czech SMS gateways charge roughly **0.41–1.30 Kč excl. VAT per SMS**, with no monthly fee for the default sender:
- GoSMS from 0.41 Kč.
- BulkGate from about 0.76 Kč (€0.0304).
- SMS Manager about €0.0356.
- SMSbrána about 0.89–1.08 Kč for FAST.

A **custom alphanumeric sender ID** (e.g. "FYZIO-XY") adds operator registration fees: GoSMS 550 Kč + 550 Kč/month; BulkGate €8 setup + €12/month at O2 plus €4/month at T-Mobile; Twilio $30/month. Text senders cannot receive replies.

**Twilio** is about 2–3× pricier ($0.0706/SMS). **WhatsApp** (per-message billing since July 2025; utility templates about $0.02 in the CEE bucket) and **Viber** are offered by the same Czech gateways at lower per-message prices, but need opt-in and app adoption.

### Cited Findings
**BulkGate (CZ)**
- The Czech SMS price page is titled "from **0.76 Kč**". Prices are actually set in EUR:
  - Lowest **€0.0304/SMS** (Vodafone).
  - O2 €0.035–0.041 depending on sender type.
  - A registered alphanumeric sender costs **€8 setup + €12/month at O2** and **€4/month at T-Mobile**.
  - The page was about 93 days old when seen.
  - — [BulkGate CZ SMS pricing](https://www.bulkgate.com/en/pricing/sms/cz/czechia/)
- The default sender is "InfoSMS". A custom alphanumeric sender becomes active after operator approval, which takes about 2 working weeks and carries a monthly fee. — [BulkGate CZ SMS pricing](https://www.bulkgate.com/en/pricing/sms/cz/czechia/)
- Sender types: system number, short code and text sender. If the chosen type is unavailable in the destination country, the system number is used. — [BulkGate helpdesk – sender type](https://help.bulkgate.com/docs/cs/sender-type.html)
- Pay-as-you-go with volume discounts. The FAQ says there are no setup fees or monthly commitments, which conflicts with the CZ sender-ID fees above. REST API with documentation, code samples and a sandbox. — [BulkGate SMS gateway](https://www.bulkgate.com/en/products/sms-gateway/)
- Same vendor, other channels in CZ: **WhatsApp from 0.099 Kč**, **RCS from 0.876 Kč** (page titles), plus two-way SMS. — [BulkGate WhatsApp CZ](https://www.bulkgate.com/en/pricing/whatsapp/cz/czechia/); [BulkGate RCS CZ](https://www.bulkgate.com/en/pricing/rcs/cz/czechia/); [BulkGate 2-way SMS](https://www.bulkgate.com/en/solutions/two-way-sms/)

**SMSbrána (CZ)**
- 2025 price list, valid in CZ from 1 June 2025, prices excl. VAT — [SMSbrána ceník 2025 (PDF)](https://www.smsbrana.cz/docs/cenik25.pdf):
  - **SMS FAST about 1.08 Kč**, SMS SPECIAL about 1.30 Kč, SMS FAST+ about 2.02 Kč.
  - Top-up bonuses lower FAST to about **0.89 Kč** at the highest tier (top-up of 100,000 Kč or more).
  - Bonus credit is valid 1 month; non-bonus credit 14 months.
  - No activation fee and no monthly subscription.
  - The PDF table was partly garbled in extraction, so verify.
- A custom text sender is charged per tariff. **Messages from a text sender cannot be replied to.** — [SMSbrána FAQ](https://www.smsbrana.cz/faq)
- The **SMS Connect** API is free, with no connection fee. — [SMSbrána FAQ](https://www.smsbrana.cz/faq); [SMS Connect docs (PDF)](https://www.smsbrana.cz/docs/SMSconnect_dokumentace.pdf)

**GoSMS (CZ)**
- The price calculator shows **from 0.41 Kč/SMS excl. VAT**, with no one-time or monthly fee. The English page shows €0.0145/SMS. — [GoSMS ceník](https://www.gosms.eu/cs/cenik/); [GoSMS price list (EN)](https://www.gosms.eu/en/price-list/)
- Sender/identifier price list (PDF) — [GoSMS – identifikátory (PDF)](https://napoveda.gosms.cz/download.php?open=1&hash=b2004215756cf08a9b3512458a70f8017d7ef7df2dc0a187f1108096ee2998bf.pdf):
  - A generic text sender (e.g. "GoSMS-info") costs 350 Kč activation + 100 Kč/month excl. VAT.
  - Receiving replies costs 0.10 Kč per message.
  - The PDF's outbound CZ SMS prices are inconsistent (1.23 Kč vs 2.60 Kč).
- A custom sender name typically costs **550 Kč registration + 550 Kč/month excl. VAT** (older blog). — [GoSMS blog](https://blog.gosms.eu/cs/vlastni-nazev-odesilatele-sms-nezbytnost-pro-vasi-komunikaci/)
- The help center references a new "Základní ceník CZK platný od 1. 9. 2026" (base CZK price list valid from 1 Sep 2026). — [GoSMS nápověda – kolik stojí](https://napoveda.gosms.cz/tema/kolik-stoji-gosms)
- The API supports a **test send** that returns the price, number of parts and diacritics detection. Message detail returns `stats.price` in CZK. — [GoSMS API docs](https://doc.gosms.eu/)

**SMS Manager (CZ)**
- The Czech Republic costs **€0.0356/SMS** in the 5,001–10,000 tier, and the price falls with volume. Structured data on the same page conflicts (3.00 / 1.50 CZK). — [SMS Manager prices](https://smsmanager.com/ceny/)
- **Viber 0.39 CZK** per message, with a minimum of 10,000 delivered messages (3,900 CZK). **WhatsApp 0.54 CZK** per message. — [SMS Manager Viber](https://smsmanager.com/viber/); [SMS Manager WhatsApp](https://smsmanager.com/whatsapp/)
- REST API, including a price-list endpoint `GET /credit/prices`. Sending uses a separate JSON API v2. — [SMS Manager REST API](https://smsmanager.com/docs/api-reference/rest/overview)

**Twilio**
- Czech Republic outbound SMS with an alphanumeric sender: **$0.0706 per SMS** (page says "pricing current as of July 2026"). — [Twilio SMS pricing CZ](https://www.twilio.com/en-us/sms/pricing/cz)
- Czech sender-ID registration carries a **$30/month** fee. — [Twilio – international alphanumeric sender ID](https://support.twilio.com/hc/en-us/articles/223133767-International-support-for-Alphanumeric-Sender-ID)
- Alphanumeric senders work only on paid accounts and are **one-way**, so recipients cannot reply. — [Twilio docs](https://www.twilio.com/docs/messaging/services/alphanumeric-sender-ids-in-messaging-services)

**WhatsApp Business Platform (Meta)**
- Since **1 July 2025**, Meta bills **per delivered template message** instead of per 24-hour conversation. Utility and authentication templates get volume-tier discounts per country and category. Service (user-initiated) messages are free. — [CM.com](https://www.cm.com/blog/whatsapp-business-platform-pricing/); [chatarmin](https://chatarmin.com/en/blog/whatsapp-business-costs)
- A third-party reproduction of Meta's rate card lists **"Rest of Central & Eastern Europe": marketing $0.0860, utility $0.0212**. A Czech-specific line was not confirmed. — [Blueticks](https://blueticks.co/blog/whatsapp-business-api-pricing-2026); [setsmart](https://setsmart.io/blog/whatsapp-business-api-pricing)
- Sources conflict on whether utility templates sent **inside an open 24-hour service window** became chargeable from **1 October 2026**. — [ChatMaxima](https://chatmaxima.com/blog/whatsapp-business-updates/); [setsmart](https://setsmart.io/blog/whatsapp-business-api-pricing)

### Inferences
- **Reminder budget** (my calculation): 800 SMS reminders/month ≈ **330 Kč (GoSMS 0.41) to 865 Kč (SMSbrána FAST 1.08)** excl. VAT, plus sender fees (e.g. GoSMS generic sender 100 Kč/month, or custom name 550 Kč/month). At $0.0706, Twilio would be about $56/month plus $30/month for registration.
- BulkGate's "0.76 Kč" equals €0.0304 × 25 CZK/EUR, so its CZK prices move with the exchange rate (my calculation).
- **Two-way flows** ("reply ANO to confirm") need a **numeric/two-way sender**, because text senders cannot receive replies (SMSbrána, Twilio). Simpler options:
  - Put a **confirm/cancel link** in the SMS that points to the booking app.
  - Use a text sender (brand recognition) for one-way reminders only.
- **Diacritics.** Czech text with diacritics needs Unicode encoding, which shortens each SMS segment (UNVERIFIED background: about 70 vs 160 characters). Diacritics-free templates and GoSMS's test-send can keep each reminder to one part and halve the cost.
- **Channel strategy.** E-mail for confirmation and receipt (nearly free), SMS for the 24 h reminder (highest read rate, about 0.4–1.1 Kč), and optional WhatsApp/Viber via the same Czech gateway where the patient opts in. Choosing a Czech gateway that also offers WhatsApp, Viber or RCS (BulkGate, SMS Manager) keeps one integration.

### Gaps
- **Push alternatives** (PWA web push, native app push) were not researched. UNVERIFIED background: iOS supports Web Push only for home-screen-installed web apps (iOS 16.4+).
- The exact Meta WhatsApp rate for the Czech Republic, and whether BulkGate's 0.099 Kč or SMS Manager's 0.54 Kč include Meta's fee, are not confirmed.
- SMS Manager's current CZ tier table is ambiguous, and the GoSMS PDF tables conflict. Verify on the live calculators or price-list API endpoints.
- No source was found on Czech regulation of alphanumeric sender IDs; the operator-registration requirement is inferred from vendor fees. Delivery-report and two-way pricing per vendor were not compared.

---

## Q4. Online payments in CZ (GoPay, Comgate, ThePay, Stripe, Adyen): fees, card-on-file for no-show fees, Apple/Google Pay, QR payments (QR Platba / SPAYD), refunds, deposits

### Takeaway
Czech gateways are cheapest for domestic consumer cards:
- **ThePay:** 0.99% + 0 Kč below 250k CZK monthly turnover, plus 139 Kč/month gateway fee.
- **Comgate Profi:** from 0.62% + 0.50 Kč, card-type dependent, plus a monthly fee.
- **GoPay:** about 2.15–2.30% + 3 Kč on its new schedule from 1 November 2026.

**Stripe CZ** costs 1.5% + 6.50 Kč for standard EEA cards. It has the best-documented **card-on-file** tooling (SetupIntents + off-session charges explicitly intended for no-show and cancellation fees). Off-session charges can still bounce back to customer authentication under SCA.

**Adyen** is enterprise-oriented: €0.11 + markup + Interchange++, with a minimum invoice. **QR Platba (SPAYD)** is a zero-fee option for deposits or invoices, but needs bank reconciliation by variable symbol.

### Cited Findings
**GoPay (CZ)**
- **Schedule effective 1 November 2026**: Visa consumer debit **2.15% + 3 Kč**, Mastercard/Maestro debit 2.20% + 3 Kč, Mastercard consumer credit 2.30% + 3 Kč. Other card types fall in a wider band. — [GoPay sazebník od 1.11.2026](https://help.gopay.com/cs/tema/cenik-a-obchodni-podminky/aktualni-cenik-a-obchodni-podminky/sazebniky-poplatku/sazebnik-poplatku-platebni-brany-gopay-ucinnost-od-1-11-2026)
- The fee is made of interchange (to the issuer), a card-scheme fee, and GoPay's own charge, which the extract gives as 1.76% + 3 Kč. — [GoPay – z čeho se skládá poplatek](https://help.gopay.com/cs/tema/cenik-a-obchodni-podminky/informace-k-poplatkum/z-ceho-se-sklada-poplatek-pri-platbe-kartou?embed=)
- Other fees, as extracted — [GoPay sazebník od 25.8.2024](https://help.gopay.com/cs/tema/cenik-a-obchodni-podminky/aktualni-cenik-a-obchodni-podminky/sazebniky-poplatku/sazebnik-poplatku-platebni-brany-gopay-ucinnost-od-25-8-2024):
  - 0.30 Kč fee for non-3DS payments up to 700 Kč where GoPay skips 3-D Secure.
  - Card update 2 Kč.
  - **Refund (storno) 5 Kč** (2024 schedule).
  - **Chargeback 990 Kč**.
- A developer price page lists GoPay's own wallet method at 2.2% + 3 Kč. The page looks unmaintained (broken title), so treat it with caution. — [dev.gopay.com ceník](https://dev.gopay.com/cs/cenik)

**Comgate (CZ)**
- Marketing page: **Profi tariff "od 0,62 % + 0,5 Kč"** (from 0.62% + 0.50 Kč), varying by card type. — [Comgate](https://www2.comgate.cz/vi/en)
- Fees consist of a transaction fee, a monthly fee and other charges. The transaction fee depends on the tariff (**Easy** or **Profi**). — [Comgate – poplatky a bonusy](https://help.comgate.cz/docs/poplatky-a-bonusy)
- **Apple Pay is technically a card payment, and the same fees apply.** — [Comgate – Apple Pay](https://help.comgate.cz/docs/apple-pay)
- **Recurring payments** are a card-payment feature and can be used with Apple Pay and Google Pay. The card expiry date is unavailable for Apple/Google Pay recurring payments; disabling those methods on the initial transaction gets the expiry. — [Comgate API – Apple Pay & Google Pay](https://apidoc.comgate.cz/en/applepay-a-googlepay/); [Comgate – platební metody](https://help.comgate.cz/docs/o-platebnich-metodach)

**ThePay (CZ)**
- Turnover-based pricing — [ThePay cenové hladiny](https://www.thepay.eu/cs/cenove-hladiny/):
  - **0.99% + 0 Kč** at up to 250,000 Kč monthly turnover.
  - 0.89% at 250k–1M Kč.
  - 0.79% above 1M Kč.
  - The gateway fee is **139 Kč/month** in the lowest band and free in the higher bands.
  - The rate is set automatically from the previous full month's turnover and includes interchange, scheme and other fees.
- **Refund 5 Kč** per payment, **chargeback 1,290 Kč** (CZK), payout to a CZK bank account free. — [ThePay sazebník 15.6.2023 (PDF)](https://www.thepay.eu/nwm-upload/2023/06/sazebnik_poplatku_15_6_2023_.pdf)
- ThePay's 2nd-generation gateway announcement covers **Apple Pay, deferred payments ("odložené platby") and foreign currencies**. — [ThePay announcement](https://www.thepay.eu/cs/thepay-predstavuje-platebni-branu-druhe-generace-apple-pay-odlozene-platby-cizi-meny-provizni-program-a-dalsi-vyhody/)
- ThePay is now part of the FastCentrik platform. — [ThePay news](https://www.thepay.eu/cs/nova-era-e-commerce-thepay-je-nyni-soucasti-platformy-fastcentrik/)

**Stripe (CZ pricing)**
- **Standard EEA cards 1.5% + 6.50 Kč.** — [Stripe CZ pricing](https://stripe.com/en-cz/pricing)
- The extract also lists premium EEA cards at 2.8% + 6.50 Kč. This differs from older Stripe EU pricing, so verify. — [Stripe CZ pricing](https://stripe.com/en-cz/pricing)
- UK cards 2.5% + 6.50 Kč. Other international cards 3.15% + 6.50 Kč. Add **2% if currency conversion is required**. — [Stripe CZ pricing](https://stripe.com/en-cz/pricing)
- **SetupIntents** store payment credentials for later use without charging. `usage=off_session` is the default for saving a card to charge later. — [Stripe – Setup Intents](https://docs.stripe.com/payments/setup-intents); [Stripe – save and reuse](https://docs.stripe.com/payments/save-and-reuse)
- Stripe explicitly names "**cancellation or no-show fees**" as a use case for capturing a payment method on file during Checkout. — [Stripe – save during payment](https://docs.stripe.com/payments/checkout/save-during-payment)
- A customer agreement or mandate is needed before charging off-session. If the bank requires authentication for an off-session payment, the customer must come back online to complete it. — [Stripe – save and reuse](https://docs.stripe.com/payments/save-and-reuse); [Stripe support – on/off session](https://support.stripe.com/questions/what-is-the-difference-between-on-session-and-off-session-and-why-is-it-important)

**Adyen**
- Each transaction carries a **€0.11 fixed processing fee** plus a payment-method fee. — [Adyen pricing (SG)](https://www.adyen.com/en_SG/pricing)
- Visa/Mastercard pricing is **Interchange++** plus a percentage markup:
  - The SG page shows 0.80%.
  - The help center says the markup "starts at 0.60%" and depends on monthly volume.
  - — [Adyen pricing (SG)](https://www.adyen.com/en_SG/pricing); [Adyen help – Interchange++](https://help.adyen.com/en_US/knowledge/payment-methods/explore-payment-methods/what-is-the-interchange)
- Adyen applies a **minimum invoice** that depends on industry and business model; the amount was not stated. — [Adyen pricing](https://www.adyen.com/pricing)

**QR Platba (SPAYD), the Czech bank-transfer QR standard**
- Format: header `SPD*1.0*` followed by `KEY:value` attributes separated by `*`.
  - Example: `SPD*1.0*ACC:CZ7603000000000076327632*AM:200.00*CC:CZK*X-VS:1234567890*MSG:...`
  - `ACC` = IBAN, `AM` = amount, `CC` = currency, `X-VS` = variable symbol, `MSG` = message.
  - — [qr-platba.cz validator](https://qr-platba.cz/pro-vyvojare/validator/)
- Attributes after the header may be in any order (KB client format). — [KB – Klientský formát pro QR platbu (PDF)](https://www.kb.cz/getmedia/35265715-fe8e-4df9-9212-beaf625ba417/Klientsky-format-pro-QR-platbu-v-KB-pdf.pdf)
- CRC32 is optional, and the original standard recommends QR error-correction level M for print. — [ČBA standard (PDF)](http://qr-kody.cz/wp-content/download/qr-platba-standard.pdf); [cz-qr-platba library](https://github.com/gildor853/cz-qr-platba)
- Sources disagree on the current standard version: v1.2 (2021, effective 2022) vs v1.0 still valid. — [cz-qr-platba](https://github.com/gildor853/cz-qr-platba); [doklad.ai](https://doklad.ai/blog/co-je-spayd)
- Open-source TypeScript generators exist: zero-dependency `cz-qr-platba` and `qrplatba` (IBAN-aware, SVG output). — [cz-qr-platba](https://github.com/gildor853/cz-qr-platba); [tedyno/qrplatba](https://github.com/tedyno/qrplatba)

### Inferences
- **Fee examples** (my calculations, standard consumer EEA debit card, excluding monthly fees):

  | Gateway | 1,000 Kč session | 300 Kč deposit | Notes |
  |---|---|---|---|
  | ThePay | 9.90 Kč | 2.97 Kč | plus 139 Kč/month |
  | Comgate Profi | ≈6.70 Kč | ≈2.36 Kč | "from" rate; plus monthly fee |
  | Stripe | 21.50 Kč | 11.00 Kč | |
  | GoPay (from 1 Nov 2026) | 24.50 Kč | 9.45 Kč | |

- Stripe's 6.50 Kč fixed fee makes it relatively expensive for small deposits. Its main advantage is developer tooling and card-on-file maturity.
- **Deposits vs no-show fees.** A **prepaid deposit at booking** (a normal one-off customer-initiated payment) is the simplest and most SCA-robust approach. **Card-on-file no-show fees** need:
  1. a gateway that supports merchant-initiated charges on stored cards (documented for Stripe; Comgate documents recurring payments, which would need checking for ad-hoc amounts),
  2. explicit customer consent captured at booking,
  3. acceptance that some off-session charges will fail or need re-authentication (Stripe docs).
- **QR Platba** suits deposits and invoices at zero gateway cost. The platform must generate a unique variable symbol per booking and reconcile incoming payments through the bank's API or statement import (not researched). It has no instant confirmation unless the payer uses an instant payment.
- **Apple Pay / Google Pay** are priced as card payments (Comgate). With wallets, Comgate cannot return the card expiry for recurring payments, which matters if the platform warns patients about expiring stored cards.

### Gaps
- **GoPay recurring payments and pre-authorization** (mechanics and fees), the monthly fee, and Apple/Google Pay support were not retrieved. UNVERIFIED background: the GoPay REST API supports recurring (ON_DEMAND) payments and pre-authorization with capture/void.
- **Comgate** full Easy/Profi tables and monthly fees, plus pre-authorization support, were not retrieved.
- **Stripe** authorization-hold validity for manual capture was not confirmed. UNVERIFIED background: typically about 7 days for online card payments, longer only with "extended authorization" for eligible merchants. Stripe's refund-fee policy was not checked.
- The Adyen minimum-invoice amount is unknown. Adyen is likely unsuitable for a single clinic (inference).
- The current version of the ČBA QR Platba standard is unresolved. Bank-side reconciliation options (bank APIs / PSD2 account information) were not researched.
- Czech legal aspects of no-show fees (consumer protection, terms and conditions) were not researched, and are outside this scope.
- Whether **EET 2.0** (electronic sales registration) will apply from 2027 to card or cash payments: see Q5 Gaps.

---

## Q5. Invoicing / accounting integrations in CZ (Fakturoid, iDoklad, POHODA, Money S3): APIs and typical usage by small clinics

### Takeaway
**Fakturoid** is the best-documented option for an integrated platform:
- Czech cloud invoicing with a free tier and paid tiers from 199 Kč incl. VAT/month ("Na lehko").
- REST **API v3** with OAuth 2: client credentials for the clinic's own account, authorization code for multi-tenant apps.
- Webhooks and recurring-invoice "generators".
- **Per-tier API quotas** (1,500 / 3,000 / 20,000 requests per month) that matter at about 1,000 bookings/month.

**iDoklad, POHODA and Money S3** could not be verified in this session; see Gaps.

### Cited Findings
**Fakturoid**
- Tariffs (February 2025 pricing change):
  - Free tier "Zdarma".
  - **"Na lehko": 199 Kč incl. VAT (164 Kč excl. VAT) per month** on monthly billing.
  - "Na každý den" and "Na maximum": prices were not clearly extracted.
  - — [Fakturoid – Nový ceník (02/2025)](https://www.fakturoid.cz/blog/2025/02/26/nove-tarify); [Fakturoid ceník](https://www.fakturoid.cz/cenik)
- Annual billing gives one month free (you pay 11 months). — [Fakturoid – placení za Fakturoid](https://www.fakturoid.cz/podpora/nastaveni/placeni-za-fakturoid)
- **API request quotas:**
  - Na lehko **1,500/month**, Na každý den **3,000/month**, Na maximum **20,000/month**.
  - An add-on for more API requests on the Na maximum tier costs 199 Kč excl. VAT. The add-on's request volume was not extracted.
  - The 2025 change also cut the free tier's API allowance to 1,500/month; whether this still applies is unconfirmed.
  - — [Fakturoid ceník](https://www.fakturoid.cz/cenik); [Fakturoid – srovnání tarifů](https://www.fakturoid.cz/podrobne-srovnani-tarifu); [Fakturoid – Nový ceník](https://www.fakturoid.cz/blog/2025/02/26/nove-tarify)
- **API v3** uses OAuth 2 over HTTPS — [Fakturoid API v3 – authorization](https://www.fakturoid.cz/api/v3/authorization):
  - Every request needs a `User-Agent` header naming the app and a technical contact e-mail.
  - **Authorization Code flow** is for multi-tenant apps.
  - **Client Credentials flow** is for scripts or services accessing only your own account; using it for multi-tenant apps can lead to revoked access.
  - Access tokens expire after **2 hours**, and client credentials have no refresh token.
- API v3 replaced API keys, and **API v2 support ended 31 March 2025**. — [Fakturoid API v3](https://www.fakturoid.cz/api/v3); [Fakturoid blog – API v3](https://www.fakturoid.cz/blog/2024/03/26/api-v3)
- API resources include subjects (contacts), invoices, expenses, **generators** (recurring/template invoices) and **webhooks**. — [Fakturoid API v3 – webhooks](https://www.fakturoid.cz/api/v3/webhooks); [generators](https://www.fakturoid.cz/api/v3/generators); [subjects](https://www.fakturoid.cz/api/v3/subjects)

### Inferences
- **Integration pattern for a single clinic.** Use the Client Credentials flow (the platform accesses only the clinic's own Fakturoid account). On a successful payment webhook:
  1. Find or create the subject.
  2. Create the invoice or receipt.
  3. Mark it paid.
  4. Optionally let Fakturoid e-mail the PDF.

  This is about 2–3 API calls per paid booking, so **1,000 paid bookings/month ≈ 2,000–3,000 requests**. That exceeds Na lehko (1,500) and approaches Na každý den (3,000). Budget for **Na maximum** (20,000) or batch invoicing (e.g. daily summary invoices or caching subject IDs).
- The Authorization Code flow is only needed if the platform becomes a multi-clinic SaaS.
- **Invoices from Fakturoid vs from the platform.** Using Fakturoid keeps numbering series, VAT handling and accountant exports out of the platform's codebase, which is the main "buy" argument for invoicing.

### Gaps
**iDoklad, POHODA and Money S3** were not researched; the web-search budget was exhausted. UNVERIFIED background to check:
- **iDoklad** (Solitea): cloud invoicing with a public REST API (OAuth 2). Pricing and API docs: https://www.idoklad.cz/cenik, https://api.idoklad.cz.
- **POHODA** (Stormware): Windows desktop/network accounting widely used by Czech accountants. Integration is via **XML data exchange** (import/export) and **POHODA mServer**, an HTTP endpoint accepting XML requests that requires a running POHODA instance. Docs: https://www.stormware.cz/pohoda/xml/.
- **Money S3** (Solitea): desktop accounting with XML import/export ("datová komunikace"). Docs: https://www.money.cz.
- **Typical small-clinic setup** (UNVERIFIED): invoices or receipts are issued in a cloud tool (Fakturoid/iDoklad), and an external accountant imports exports into POHODA or Money. Confirm which export formats Fakturoid and iDoklad offer for POHODA/Money.

**Tax context** (UNVERIFIED; needs a tax-advisor or legal research stream):
- Healthcare services provided by a registered healthcare provider are generally **VAT-exempt** (§ 58 of the Czech VAT Act). Massages (wellness) and conditioning training typically are not, so mixed VAT treatment may be needed on invoices.
- The Czech VAT registration threshold was raised to **CZK 2 million** of annual turnover from 2025.
- Reintroduction of **EET (electronic sales registration, "EET 2.0") from 2027** was publicly proposed. Its current legislative status and scope (card, cash, online payments; any exemptions for healthcare) must be verified, because it would affect receipt issuing and payment integration.

---

## Q6. Calendar sync: Google Calendar API, Microsoft Graph, iCal/ICS feeds; two-way sync pitfalls

### Takeaway
**No verified findings this session.** The shared web-search budget ran out before calendar-sync sources could be gathered, and direct page fetching was blocked. Gaps lists the standard design pattern (UNVERIFIED) to confirm against Google, Microsoft and IETF docs. In short: the booking database is the single source of truth; bookings are pushed one-way to staff calendars; external events are imported only as "busy" blocks; ICS feeds and attachments serve read-only and patient use.

### Cited Findings
- None. Not researched because of the exhausted search budget; see Gaps.

### Inferences
- None that can be grounded in sources gathered this session.

### Gaps
Everything below is **UNVERIFIED background knowledge** to confirm.

**Recommended pattern ("two-way lite")**
1. The booking database is authoritative.
2. Bookings are pushed to therapists' Google or Microsoft calendars as events. Store the external event ID and etag.
3. Therapists' other commitments are imported as **busy time** (free/busy) to block availability.
4. Do **not** let edits in Google/Outlook move or cancel patient bookings. Full bidirectional editing is where most bugs arise.

**Google Calendar API**
- Incremental sync with `syncToken` on `events.list`. HTTP **410 Gone** means the token is invalid and a full re-sync is required.
- Push notifications via `events.watch` create **notification channels that expire and must be renewed**. Notifications carry no event data, so the app then pulls with the syncToken.
- `freebusy.query` returns availability.
- Mark the app's own events with `extendedProperties.private` to avoid echo loops.
- The API is free within quotas.
- Calendar OAuth scopes are classed as "sensitive", so a public app needs **Google OAuth app verification**.
- Docs: https://developers.google.com/calendar/api/guides/sync, …/guides/push, …/guides/quota (paths may have moved under developers.google.com/workspace/calendar/).

**Microsoft Graph**
- Incremental sync with `calendarView/delta`.
- Change-notification **subscriptions on Outlook events have a short maximum lifetime (about 4,230 minutes, under 3 days)** and must be renewed. Lifecycle notifications signal when re-authorization is needed.
- `getSchedule` returns free/busy.
- Docs: https://learn.microsoft.com/en-us/graph/delta-query-events, https://learn.microsoft.com/en-us/graph/api/resources/subscription.

**ICS / iCalendar (RFC 5545)**
- **Subscription feeds are pull-only**, and the client controls the refresh rate. Google Calendar "From URL" subscriptions refresh slowly (often reported as hours, up to about a day).
- That makes ICS feeds fine for a read-only "my schedule" feed per therapist (use secret tokenized URLs) but **unsuitable for real-time availability blocking**.
- **.ics attachments** in confirmation e-mails let patients add appointments to their calendars. Use a stable `UID`, increment `SEQUENCE` on updates, and send `METHOD:CANCEL` on cancellations (iTIP, RFC 5546).
- CalDAV (RFC 4791) is the route for iCloud and other CalDAV servers.

**Two-way sync pitfalls**
- Echo loops.
- Recurring events and exceptions (`RRULE` / `EXDATE` / overridden instances).
- Time-zone and all-day event handling.
- Deleted or declined events.
- Expired or revoked OAuth tokens needing re-consent.
- Rate limits and exponential backoff.
- Missed webhooks; a periodic reconciliation job is needed.
- Duplicate events after retries; idempotency is needed.

**Privacy**
- Writing patient names or diagnoses into therapists' personal Google or Outlook calendars exposes health data to another processor. Use neutral titles (e.g. "Obsazeno" or initials and a booking link) unless a DPA and legal basis cover it.

---

## Q7. Build foundations: open-source scheduling (Cal.com, Easy!Appointments, others), calendar UI libraries (FullCalendar etc.) with licensing; architecture (Next.js + Postgres/Supabase), time-zone/DST handling, concurrency and double-booking prevention

### Takeaway
**No verified findings this session.** The web-search budget was exhausted before this question could be researched. GitHub reads of the projects' LICENSE files were not possible either, because only the user's own repository is attached to this session. Gaps lists the key facts to verify (UNVERIFIED). The most decision-relevant points:
- Cal.com is open-core under AGPL-3.0, with commercial enterprise features.
- Easy!Appointments is GPL-3.0 PHP.
- FullCalendar's resource views (per-therapist/per-room columns) are paid "Premium". MIT alternatives exist.
- Double-booking is best prevented in the database with a **PostgreSQL exclusion constraint on `tstzrange`**.

### Cited Findings
- None. Not researched because of the exhausted search budget; see Gaps.

### Inferences
- None that can be grounded in sources gathered this session.

### Gaps
Everything below is **UNVERIFIED background knowledge**. Verify licences directly in each repository's LICENSE file.

**Open-source scheduling foundations**
- **Cal.com**
  - Open-core: core under **AGPL-3.0**, enterprise features (the `/ee` code) under a commercial licence.
  - Self-hostable; stack is Next.js + Prisma + PostgreSQL.
  - Also sold as "Cal.com Platform" (scheduling APIs plus "Atoms" React components to embed booking in your own app).
  - AGPL: if a modified Cal.com is offered to users over a network, the modified source must be made available. Factor this into a custom build.
  - Check https://github.com/calcom/cal.com (LICENSE), https://cal.com/pricing, https://cal.com/docs.
- **Easy!Appointments**
  - **GPL-3.0**; PHP (CodeIgniter) + MySQL; self-hosted.
  - Built-in Google Calendar sync (newer versions may add CalDAV; verify).
  - Check https://easyappointments.org and https://github.com/alextselegidis/easyappointments.
- **Other options:** LibreBooking (GPL-3.0, PHP resource/room booking; a fork of Booked Scheduler).
- **Czech SaaS alternatives** ("buy"): e.g. Zenamu, which appeared in Q1 sources as integrating SmartEmailing. A buy-vs-build comparison is likely covered by another research stream.

**Calendar UI libraries**
- **FullCalendar**
  - Standard features are **MIT**.
  - **Premium** plugins (resource timeline / resource time-grid, needed for side-by-side therapist or room columns) require a **commercial licence**. GPLv3 and non-commercial CC licences are alternatives.
  - Check https://fullcalendar.io/license and https://fullcalendar.io/pricing.
- **MIT alternatives:**
  - **EventCalendar** (vkurko/calendar; a FullCalendar-like API that includes resource views).
  - **react-big-calendar**.
  - **TOAST UI Calendar**.
  - **Schedule-X** (MIT core plus paid premium plugins).

**Typical architecture**
- Next.js (App Router) + PostgreSQL, e.g. Supabase in an EU region such as Frankfurt (UNVERIFIED: Supabase Pro about $25/month).
- Auth with role separation (patient / therapist / admin) and Postgres row-level security.
- A **job scheduler or queue** for reminders, e.g. pg_cron, pg-boss, or hosted Inngest / Trigger.dev.
- **Idempotent webhook endpoints** for payment gateways and e-mail/SMS delivery events.
- An outbox table for outgoing messages.
- All third-party processors in the EU where possible.

**Double-booking prevention (PostgreSQL)**
- Exclusion constraint:
  ```sql
  EXCLUDE USING gist (
    therapist_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('pending', 'confirmed'))
  ```
  - Requires the `btree_gist` extension to mix `=` and `&&`.
  - Add the same kind of constraint per room or equipment.
  - Half-open `[)` ranges let back-to-back slots touch.
- Combine with short-lived **"pending/hold" bookings with `expires_at`** during payment, released by a job.
- Alternatives: `SELECT … FOR UPDATE` on slot rows, or SERIALIZABLE transactions with retry.
- Check https://www.postgresql.org/docs/current/rangetypes.html (section "Constraints on Ranges") and https://www.postgresql.org/docs/current/btree-gist.html.

**Time zones and DST**
- Store instants as `timestamptz` (UTC), and store the IANA zone **`Europe/Prague`** on the clinic or location.
- Define working hours as local wall-clock rules and expand them into instants per date.
- EU summer time begins at **01:00 UTC on the last Sunday of March** (Prague 02:00 → 03:00) and ends at **01:00 UTC on the last Sunday of October** (03:00 → 02:00), per Directive 2000/84/EC.
  - Local times between 02:00 and 03:00 don't exist in March and occur twice in October.
  - Slot generation and reminder scheduling must handle both cases. Never store fixed UTC offsets for future appointments.
- JS tooling: the Temporal API (browser support rolled out in 2025–2026; verify), or Luxon / date-fns-tz. Add tests around the DST weekends.
