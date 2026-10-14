# Fitness, wellness, massage and studio booking platforms: credits, packages, memberships, cancellations, waitlists, marketing and analytics (2025–2026)

Source note for the report writer: every fact below comes from vendor help-center, product or blog pages, as surfaced by web-search extracts in October 2026. Opening the pages in full was not possible in this session: the fetch tool could not resolve DNS, and the organization's egress proxy returned 403 for support.glofox.com and help.momence.com. The shared web-search budget for the session ran out partway through the research. The cancellation, no-show, waitlist and product-modelling questions are well covered. The marketing-automation, benchmark, analytics and branded-app questions are only partly covered, and the Gaps sections say where. Where help articles reported an age, it is noted. Many Mindbody articles are 2–5 years old, while most Glofox, Momence and Mariana Tek articles date from 2025–2026.

## 1. How do the platforms model class packs, credit wallets, memberships, intro offers, gift cards, expiry, freeze/hold, family sharing and prepaid hours?

### Takeaway
Every platform builds on a small set of "purchase option" types:
- **Count-based packs and credits** with an expiry window measured from purchase.
- **Recurring memberships or contracts**, optionally with per-period usage limits, rollover and holds.
- **Stored-value gift cards or codes.**

On top of these sit rule layers: intro-offer eligibility, sharing between linked family profiles, and freeze/hold policies that decide what happens to billing and expiry.

Only Acuity explicitly supports a minutes-based balance, which is the "prepaid hours" model. The class-first platforms count sessions or credits.

### Cited Findings

**Mindbody**
- Contracts are either month-to-month, which bills monthly until ended, or fixed-duration, which ends or renews on a set date — [Mindbody: manage contracts & autopays](https://support.mindbodyonline.com/s/article/203258613-How-can-I-manage-contracts-autopays?language=en_US); [Mindbody: Contract suspensions FAQ](https://support.mindbodyonline.com/s/article/203259713-Suspensions?language=de)
- Month-to-month contracts cannot be suspended. Mindbody's guidance is to terminate on the stop date and resell when the client returns — [Mindbody: Contract suspensions FAQ](https://support.mindbodyonline.com/s/article/203259713-Suspensions?language=de)
- **Suspension fees:** they are enabled by a "Contract Suspension Fees" setting, which adds a fee field to the Suspend Contract screen and can be mapped to a revenue category. The fees bill on the original autopay dates during the pause. Example: a 2-month suspension from 1 Jan bills a fee on 15 Jan and 15 Feb, and autopays resume on 1 Mar. Active pricing options stay available, and their dates shift once the suspension ends — [Mindbody: Contract suspensions FAQ](https://support.mindbodyonline.com/s/article/203259713-Suspensions?language=de); [Mindbody: General Setup & Options – Client Management](https://support.mindbodyonline.com/s/article/General-Setup-Options-screen-Client-Management?language=en_US)
- During a suspension, autopays show as "Scheduled after suspension" when the end date is set, or "Suspended" when it is open-ended — [Mindbody: Client Autopay Schedule screen](https://support.mindbodyonline.com/s/article/206026137-Autopay-Schedule-screen?language=en_US); [Mindbody: Contract suspensions FAQ](https://support.mindbodyonline.com/s/article/203259713-Suspensions?language=de)
- Contract variants documented in Mindbody help article titles:
  - All visits granted upfront, billed monthly — [Mindbody: contract with all visits upfront, charged monthly](https://support.mindbodyonline.com/s/article/218344207-How-do-I-create-a-contract-that-gives-customers-all-of-their-visits-on-the-start-date-over-a-three-month-period-but-charges-them-250-per-month?language=en_US)
  - First month discounted or free, an intro-offer mechanic that the article slug says is "used only with expiring contracts" — [Mindbody: discount the first autopay](https://support.mindbodyonline.com/s/article/216774027-Create-First-Month-Discounted-or-Free-Contract-Used-only-with-Expiring-Contracts?language=en_US)
  - Sold now but starting later — [Mindbody: sell a contract to start later](https://support.mindbodyonline.com/s/article/203273863-Can-I-sell-a-contract-today-that-will-start-and-charge-the-client-on-a-later-date?language=en_US)
  - Prorated — [Mindbody: prorate contracts](https://support.mindbodyonline.com/s/article/203258773-Pro-Rates?language=en_US)
- **Family sharing:**
  - A "Shares pricing option with" relationship lets either client's pricing option pay for the other's visits, indefinitely until removed. It only works if "Pricing Option Sharing" is enabled in General Setup.
  - The "Add Family Member" flow limits relationship types to "is paid for", "Shares series with" and "Shares memberships with".
  - A "Pays for" relationship makes one client always pay for another, but it works only in consumer mode, not in the mobile apps or branded web tools.
  - Sources: [Mindbody: assign client relationships](https://support.mindbodyonline.com/s/article/203259383-Assigning-Client-Relationships?language=en_US); [Mindbody: one client paying for another](https://support.mindbodyonline.com/s/article/203258193-A-client-wants-to-pay-for-another-client-s-service-Is-this-possible-at-the-retail-screen?language=en_US); [Mindbody: General Setup & Options – Client Management](https://support.mindbodyonline.com/s/article/General-Setup-Options-screen-Client-Management?language=en_US)
- Lead Management recognizes only the purchaser in shared relationships. A client using a shared option may show "does not meet criteria" — [Mindbody: Lead Management FAQ](https://support.mindbodyonline.com/s/article/Getting-started-with-Lead-Management-FAQ?language=en_US)

**ABC Glofox**
- **Pausing:**
  - Only recurring memberships can be paused, including credit packs set to recur. Single and restricted memberships cannot.
  - A pause pushes the next payment date back by the number of paused days.
  - Memberships billed on the 1st of the month can only be paused in monthly increments.
  - Early reactivation does not move the payment date, so staff may need to add a custom charge for the extra access.
  - Sources: [Glofox: Managing Memberships from Glofox Pro](https://support.glofox.com/hc/en-us/articles/46424071016212-Managing-Memberships-from-Glofox-Pro); [Glofox: Pause Memberships Billed on the 1st](https://support.glofox.com/hc/en-us/articles/46429154568980-Pause-Memberships-Billed-on-the-1st-of-the-month)
- Staff can buy credit packs on a client's behalf from the Credit section of the Client tab, editing pack details, price and payment method — [Glofox: Managing Your Clients from Glofox Pro](https://support.glofox.com/hc/en-us/articles/46426247068564-Managing-Your-Clients-from-Glofox-Pro)
- "Group Memberships" cover couples, families, friends, personal-trainer groups, teams and companies. They are only available to Elite customers using Glofox Payments — [Glofox: Managing Group Memberships](https://support.glofox.com/hc/en-us/articles/46427646061972-Managing-Group-Memberships)

**Momence**
- **Usage limits and rollover:**
  - Usage limits are set per subscription and can be edited on a customer's profile.
  - Limited-use subscriptions can combine class and appointment credits in one pool.
  - Rollover validity is configured in general setup as the number of intervals that rolled-over credits stay valid.
  - For packs, unused credits from one renewal cycle do not carry over.
  - Source: [Momence: Usage Limits, Rollover Credits & Overbooking](https://help.momence.com/en/articles/12030278-usage-limits-rollover-credits-overbooking-subscriptions)
- **Freezes:**
  - Freezes are staff-only; customers cannot freeze from the app or web.
  - They can be immediate or scheduled, with a scheduled unfreeze date.
  - Freezing cancels all future bookings made on that subscription.
  - Studios can cap the freeze duration and the lifetime number of freezes, and can charge freeze fees.
  - Sources: [Momence: Renewal, Freeze & Failure FAQs](https://help.momence.com/en/articles/12030267-renewal-freeze-failure-faq-s-subscriptions); [Momence: Membership Freeze and Cancellation Policy](https://help.momence.com/en/articles/13613058-membership-freeze-and-cancellation-policy-how-it-works)
- Memberships can be shared with children when studio policy allows and staff share the subscription to the child's account. Kids then book through the app using the parent's subscription — [Momence: Customer Onboarding / FAQs](https://help.momence.com/en/articles/11943074-customer-onboarding-faqs)
- Momence has dedicated help articles on intro offers/trials and on guest passes/gifting. Only the titles were retrieved — [Momence: Intro Offers / Trials FAQ](https://help.momence.com/en/articles/12030356-intro-offers-trials-faq-s-subscriptions); [Momence: Guest Passes / Gifting FAQ](https://help.momence.com/en/articles/12030353-guest-passes-gifting-faq-s-subscriptions)
- Real products sold on Momence show the common shapes:
  - "3 Class New Student Special" — [House of Chrome Pole Fitness](https://momence.com/The-House-of-Chrome-Pole-Fitness/membership/3-Class-New-Student-Special/400452)
  - "Three Trial Classes (Bonus: 3 Free Guest Passes)" — [Healthtinity](https://momence.com/Healthtinity/membership/Limited-Time-Promo:-Three-Trial-Classes-(Bonus:-3-Free-Guest-Passes)-/210453)
  - A capped "All Access | 12 Classes Membership @ $300 per month" — [East River Pilates](https://momence.com/East-River-Pilates/membership/%E2%98%85-All-Access-%7C-12-Classes-Membership-%E2%98%85-@-$300-per-month/122300)
  - A Prague studio sells a "Book with MultiSport (deposit)" product for MultiSport benefit-card holders — [Prague Yoga Collective on Momence](https://momence.com/Prague-Yoga-Collective/membership/Book-with-MultiSport-(deposit)/43668?sessionId=97961310)

**TeamUp**
- **Holds:**
  - A hold stops class access and billing for a set period.
  - Bookings inside the hold are removed, and usage and payments are adjusted.
  - Recurring reservations are restored automatically when the hold ends.
  - For limited memberships the class allowance is recalculated, with a "Do not prorate classes" override.
  - An "Extend expiration dates" option adds the hold length to packs and prepaid plans. For recurring plans it extends expiry and commitment by the number of billing periods the hold spans.
  - Source: [TeamUp: put a membership on hold](https://support.goteamup.com/en/articles/9333717-how-to-put-a-customer-s-membership-on-hold)
- Bulk holds through Membership Tools can filter by membership type and dates, be open-ended, and prorate payments and allowances for partial months. The bulk-hold article was about 240 days old at search time — [TeamUp: bulk holds](https://support.goteamup.com/en/articles/9327402-how-to-put-memberships-on-hold-in-bulk); [TeamUp blog: updated bulk holds](https://goteamup.com/blog/updated-bulk-holds)
- A Membership Sharing guide lets several family members use one membership for bookings and on-demand content — [TeamUp: Managing Pricing, Memberships and Plans](https://support.goteamup.com/en/collections/9449464-managing-pricing-memberships-and-plans)

**WellnessLiving**
- Purchase option types are:
  - memberships (time-bound access);
  - session passes (a set number of visits for a set price);
  - packages (bundles of session passes, memberships, gift cards and products);
  - guest passes.
  - Sources: [WellnessLiving: Purchase Options](https://help.wellnessliving.com/en/articles/8976418-purchase-options); [WellnessLiving: Packages](https://www.wellnessliving.com/knowledge-sharing/knowledge-base/packages/); [WellnessLiving: Session passes](https://help.wellnessliving.com/en/articles/9179939-session-passes)
- **Holds:**
  - Membership holds have three billing modes: "Classic" (contract extended by the hold length), "Prorate" and "Continue Billing".
  - A session pass's duration grows by the hold length.
  - Packages cannot be held, but the passes and memberships inside them can.
  - Sources: [WellnessLiving: holds on a Purchase Option](https://help.wellnessliving.com/en/articles/9977018-add-modify-or-delete-a-hold-on-a-purchase-option); [WellnessLiving: Membership settings](https://help.wellnessliving.com/en/articles/9558933-membership-settings); [WellnessLiving: Session pass settings](https://help.wellnessliving.com/en/articles/9559095-session-pass-settings)
- **Sharing:**
  - Sharing requires linked relationship profiles and can be applied by default or manually.
  - An item cannot be both shared and transferred; the last action overrides the other.
  - Shared items inside a package do not carry over when the package renews and must be re-shared manually.
  - Source: [WellnessLiving: share a Purchase Option between relationship profiles](https://help.wellnessliving.com/en/articles/10842522-share-a-purchase-option-between-relationship-profiles)
- Purchase options can carry attendance restrictions, and clients can see their remaining sessions — [WellnessLiving: client profile FAQ](https://www.wellnessliving.com/knowledge-sharing/knowledge-base/faq-how-can-my-clients-find-out-how-many-remaining-sessions-they-have-for-purchase-options-with-attendance-restrictions/)

**Mariana Tek (Xplor)**
- A credit package's expiration is how long after purchase the customer has to make a reservation with its credits. Packages can also be set up as gift cards, and customers must sign any selected agreements before buying — [Mariana Tek: create a credit package](https://support.marianatek.com/en/articles/1986188-how-do-i-create-a-credit-package)
- **Intro offers:**
  - They work on membership contracts and credit packages.
  - Eligibility can be "First Timers Only" (no reservation history at all, including free classes), one purchase per person, or everyone.
  - Restrictions apply per offer.
  - Membership intro offers are always non-recurring.
  - Source: [Mariana Tek: configure an Intro Offer](https://support.marianatek.com/en/articles/8867603-how-do-i-configure-an-intro-offer)
- **Freezes:**
  - Only active memberships can be frozen, and not if they have a payment failure ("ding").
  - A frozen membership cannot be used.
  - Billing and renewal dates adjust automatically after the freeze.
  - Only employees can freeze or unfreeze.
  - Source: [Mariana Tek: freeze a membership & billing impact](https://support.marianatek.com/en/articles/1987373-how-do-i-freeze-a-membership-and-how-does-it-impact-the-billing-cycle)
- An "Expiring" membership is in its last payment period and can still book. After that it becomes "Expired" and cannot reserve — [Mariana Tek: membership statuses](https://support.marianatek.com/en/articles/1987380-what-are-the-different-membership-statuses)

**Arketa**
- A class package is a prepaid credit bundle ("buy X credits"). A membership is recurring monthly or annual billing that renews automatically. A cancelled booking returns the credit to the pricing-option balance rather than refunding the card — [Arketa: Choosing a pricing option](https://help.arketa.com/pricing/which-option)
- The setting "Allow purchasing multiple times without discount" hides an intro offer from members who have already used it. Guest passes can be attached to memberships, either as credits usable on guests or as a fixed number per billing cycle — [Arketa blog: 6 essential settings](https://www.arketa.com/blog/6-essential-settings-to-save-time-and-boost-productivity)
- In the 2025–26 "Pro Dashboard", staff can charge clients to freeze or pause memberships from the client profile. Charging policies can be customised by membership status, package type or class type — [Arketa: New Pro Dashboard announcement](https://www.arketa.com/blog/announcing-the-new-pro-dashboard-a-fresh-dashboard-built-for-scale)

**bsport**
- bsport offers weekly, monthly and annual memberships, limited and unlimited plans, and credit-based passes. The studio sets commitment terms, cancellation policy and access rules for each — [bsport: Membership management](https://pro.bsport.io/features/membership-management)
- Credits and passes "work across everything you sell": group class, workshop, 1:1 session or appointment. Members join, renew, upgrade or switch plans themselves online or in the app — [bsport: Membership management](https://pro.bsport.io/features/membership-management)
- Vendor comparison copy says subscriptions can be edited, paused and given set durations, with future debits kept in sync, and that staff can restore credits in one click, for example after a late cancellation — [bsport vs Mindbody](https://pro.bsport.io/blog/bsport-the-best-mindbody-alternative)

**Acuity Scheduling (Squarespace)** — the clearest "prepaid hours" model
- Packages, gift certificates and subscriptions can each be valued as a number of appointments, a **number of minutes**, a dollar amount, or unlimited. With minutes, a code cannot be used once less than one appointment's worth remains. Clients buy on a store page and receive unique codes, and staff can sell from the calendar or issue free codes — [Acuity: Buying packages, gift certificates, and subscriptions](https://help.acuityscheduling.com/hc/en-us/articles/16676923706253-Buying-packages-gift-certificates-and-subscriptions)
- Subscriptions require Stripe or Square (not PayPal) and bill either indefinitely or for a fixed number of payments, up to 23 — [Acuity: Creating subscriptions](https://help.acuityscheduling.com/hc/en-us/articles/28615820183309-Creating-subscriptions)
- Offers can carry expiration dates, and session usage is tracked automatically — [Acuity: Client loyalty tools](https://acuityscheduling.com/features/client-loyalty)
- The pricing page lists "Offer appointment packages (including payment plans)" and "Sell subscriptions, memberships, and gift certificates" as Standard and Premium features — [Acuity: Pricing](https://acuityscheduling.com/pricing)
- Gotcha: new appointment types are not automatically redeemable, so existing packages and subscriptions must be updated to include them — [Acuity: Buying packages…](https://help.acuityscheduling.com/hc/en-us/articles/16676923706253-Buying-packages-gift-certificates-and-subscriptions); [Acuity: Add or edit services](https://help.acuityscheduling.com/hc/en-us/articles/16676922487949-Add-or-edit-services-on-your-scheduling-page)

**Fresha**
- **Gift cards:**
  - There are two kinds: business-specific cards, redeemable only at the issuing venue, and universal Fresha cards, bought on the marketplace and redeemable at any verified business.
  - Setup includes preset values, custom amounts and an expiry calculated from the purchase date.
  - Gift cards cannot pay for self-checkout, tips, memberships or online product purchases.
  - An expired card cannot be extended.
  - Sources: [Fresha: Set up gift cards](https://www.fresha.com/help-center/knowledge-base/packages-memberships-and-gift-cards/72-set-up-gift-cards); [Fresha: Manage gift cards](https://www.fresha.com/help-center/knowledge-base/packages-memberships-and-gift-cards/82-manage-gift-cards); [Fresha: Sell gift cards](https://www.fresha.com/help-center/knowledge-base/gift-cards/92-sell-gift-cards)
- The POS sells services, products, memberships, packages and gift cards from one checkout. The client wallet shows balances, gift cards, memberships, packages and saved cards in one place — [Fresha: POS](https://www.fresha.com/for-business/features/point-of-sale); [Fresha: how clients use gift cards](https://www.fresha.com/help-center/knowledge-base/packages-memberships-and-gift-cards/97-understand-how-clients-use-gift-cards)
- Fresha's fitness pages position memberships, multi-session packs, drop-ins and recovery services — [Fresha: Fitness & recovery](https://www.fresha.com/for-business/fitness-and-recovery)

**Vagaro**
- Customers can cancel auto-renewing memberships and packages in the app or on the web only if the business allows it. Cancelling stops renewals and makes the plan unusable, but does not refund automatically — [Vagaro: cancel auto-renewing plans](https://support.vagaro.com/hc/en-us/articles/15943839935131-Cancel-Auto-Renewing-Memberships-and-Packages-for-Customers-of-a-Vagaro-Business); [Vagaro: Memberships report](https://support.vagaro.com/hc/en-us/articles/4406235662107-Memberships-Report); [Vagaro: manage customer packages](https://support.vagaro.com/hc/en-us/articles/4406328135451-Managing-Customer-Packages)
- Package expiration is set in months when selling online. A user-forum reply from February 2025 says expiration is set per sale, not per package type — [Vagaro: Online Shopping Cart](https://support.vagaro.com/hc/en-us/articles/204348270-Online-Shopping-Cart-How-to-Require-Customers-to-Pre-Pay-for-Services-Memberships-Packages-and-Gift-Certificates-with-the-Online-Shopping-Cart); [Vagaro: Packages report (comments)](https://support.vagaro.com/hc/en-us/articles/4406235637275-Manage-Customer-Packages-from-the-Packages-Report)
- Example policy of a spa on Vagaro: 24 h notice, non-refundable packages, 12-month package expiry, and a late cancel costs one package session — [Escape Day Spa policy](https://mysite.vagaro.com/escapedayspa1/spa-policy)

**SimplyBook.me** (widely used in Central Europe)
- **Packages vs memberships:**
  - Packages bundle services and products under a general item limit, with validity of any length.
  - Package credits are not returned automatically when a client cancels. Staff must refund, which needs SBPay Pro on the Premium plan.
  - Memberships do return the booking automatically.
  - Source: [SimplyBook.me: Memberships vs Packages](https://help.simplybook.me/index.php/Memberships_vs_Packages:_Choosing_the_Right_Custom_Feature_for_Your_Business)
- Memberships can recur in manual or automatic mode, and deleting the related invoice cancels the membership — [SimplyBook.me: Membership custom feature](https://help.simplybook.me/index.php/Membership_custom_feature)
- Gift cards are either an emailed code redeemed at booking or a printable greeting card with a customisable design — [SimplyBook.me: Custom Features](https://help.simplybook.me/index.php/Custom_Features); [SimplyBook.me: Custom Features by category](https://help.simplybook.me/index.php/Custom_Features_by_category)

**Booksy / Timely**
- Booksy's feature list mentions service packages for repeat bookings. No modelling detail was retrieved — [Booksy: Features](https://biz.booksy.com/features)

### Inferences
- A clean platform model for the clinic is one **entitlement/wallet** object, with variants for:
  - credit pack (N sessions or credits plus expiry);
  - membership (recurring billing plus per-period usage limit plus rollover for N periods, as in Momence);
  - **prepaid minutes** (Acuity-style minute balances, which suit 30/60/90-min 1:1 training and massages better than a separate pack per duration);
  - stored-value gift card;
  - intro offer (eligibility rule: first-timers only, i.e. no reservation history, as in Mariana Tek; one per person; non-recurring).
- **Service scope should be category-based, not a list of individual service IDs.** Acuity's gotcha, where new appointment types are not redeemable until packages are edited, shows the cost of explicit lists.
- **Holds and freezes should extend expiry by the hold length by default** (TeamUp "Extend expiration dates", WellnessLiving "Classic"). Billing behaviour should be an explicit choice (extend / prorate / keep billing). Caps on duration and lifetime count, plus an optional freeze fee (Momence, Mindbody, Arketa), are standard. Most vendors keep freeze staff-only (Momence, Mariana Tek); self-service freeze would be a differentiator but invites abuse.
- **Family sharing should be explicit links between profiles.** The models are "shares" (Mindbody, WellnessLiving, Momence) and "pays for" (Mindbody). Analytics should attribute usage to the attendee and revenue to the payer, because Mindbody's Lead Management sees only the purchaser.
- Both camps converge on credits and passes usable across classes and appointments: the class-first tools (bsport, Momence combined pool) and the appointment-first tools (Acuity, Fresha wallet). That matches a clinic mixing small-group training, 1:1 training and massage.
- The Prague studio's "Book with MultiSport (deposit)" product suggests a local pattern: benefit-card holders, who pay nothing at booking, are asked for a refundable deposit to deter no-shows. This is inferred from the product title only.

### Gaps
- Not retrieved due to the search budget:
  - pack activation rules (expiry from purchase vs from first use) for Mindbody, Glofox and bsport;
  - Fresha membership and package setup detail;
  - Booksy and Timely package/membership mechanics;
  - Arketa gift cards and family accounts;
  - bsport pause limits and fees;
  - Glofox credit expiry rules.
- Czech/EU consumer-law constraints on expiry of prepaid credits and gift vouchers were not researched (outside the vendor scope).
- Mindbody pricing-option type definitions beyond "session-based" and "unlimited" were not found.

## 2. Late cancellations, no-shows, makeup sessions and waitlists: windows, penalties, automation and promotion rules

### Takeaway
Typical cancellation windows:
- **12 h for classes**, cited by ClassPass as the industry standard;
- **24 h for appointments**, the WellnessLiving default and the Vagaro example;
- up to **48 h** in salon examples (Fresha).

The penalty depends on how the booking was paid:
- a credit is forfeited for packs and drop-ins;
- a usage slot is consumed for limited memberships;
- a flat or percentage fee is charged for unlimited memberships or for card-on-file appointments.

The 2025–26 automation pattern is to auto-charge the stored card after a review delay: 24 h in Glofox, a set number of days in TeamUp, a daily batch in Arketa. On top of that sit strike thresholds that block booking (Glofox, WellnessLiving, TeamUp), staff waivers, and payment retries (Momence).

Waitlists auto-promote until a cut-off (Glofox 30 min, Momence configurable, e.g. 60 min). After the cut-off they switch to a broadcast "first to claim" mode (Mariana Tek Quick Fill, Glofox notify-all, SimplyBook.me) or a double opt-in with a response timer (Momence, default 10 min).

### Cited Findings

**Windows and industry norms**
- A 12-hour cancellation window is "often considered standard across the fitness and wellness industry". This was surfaced in a search extract attributed to ClassPass's guide, which could not be opened directly — [ClassPass Afterclass: how to determine your late cancellation policy](https://classpass.com/afterclass/how-to-determine-your-late-cancellation-policy/)
- WellnessLiving's early-cancellation window closes **24 h** before the session by default. A client who cancels later through the portal or app is auto-flagged as a late cancel — [WellnessLiving: Late cancels](https://www.wellnessliving.com/knowledge-sharing/knowledge-base/late-cancels/)
- Arketa's default cancellation window is **0 hours**, meaning every booking is final sale — [Arketa: Cancellation policy](https://help.arketa.com/settings/booking/cancellation-policy)
- SimplyBook.me lets clients cancel only outside a window of 30 minutes to 30 days, or not at all. The Cancellation Policy feature is free — [SimplyBook.me: Cancellation Policy feature](https://help.simplybook.me/index.php/Cancellation_Policy_custom_feature)
- Fresha's illustrative salon setup:
  - a 48-hour window with no fee;
  - 25 % of the price for cancelling inside it;
  - 50 % for a no-show.
  - Source: [Fresha blog: protect against no-shows](https://www.fresha.com/blog/how-to-protect-your-business-against-no-shows-and-late-cancellations)
- A Fresha partner barber uses 50 % for a late cancel and 100 % for a no-show. The claims of up to 60 % and up to 90 % reductions in losses are vendor marketing — [Modern Barber on Fresha](https://modernbarber.co.uk/reduce-no-shows-and-late-cancellation-losses-by-up-to-60-with-fresha); [Fresha blog](https://www.fresha.com/blog/never-have-a-no-show-at-your-salon-or-spa-again-with-fresha)
- Momence's AI Inbox guidance gives an example policy that depends on the product: a late cancel inside 12 h forfeits the class credit for a class pack or drop-in, while membership holders pay a $10 fee — [Momence: Getting the most out of AI Inbox](https://help.momence.com/en/articles/11739857-getting-the-most-out-of-ai-inbox)
- Studio policies seen on Momence-hosted pages:
  - credit forfeited for cancelling inside 12 h;
  - a $15 fee inside 24 h, with the credit returned;
  - a repeat-offender rule of **€24 after 5+ late cancels in 28 days**;
  - a deposit that becomes non-refundable after the first late cancel or no-show.
  - These came from one search extract, and which page holds which policy could not be confirmed. Candidate pages: [Healthtinity](https://momence.com/Healthtinity/membership/Limited-Time-Promo:-Three-Trial-Classes-(Bonus:-3-Free-Guest-Passes)-/210453), [House of Chrome](https://momence.com/The-House-of-Chrome-Pole-Fitness/membership/3-Class-New-Student-Special/400452), [East River Pilates](https://momence.com/East-River-Pilates/membership/%E2%98%85-All-Access-%7C-12-Classes-Membership-%E2%98%85-@-$300-per-month/122300), [Prague Yoga Collective](https://momence.com/Prague-Yoga-Collective/membership/Book-with-MultiSport-(deposit)/43668?sessionId=97961310)
- One studio's policy: a cancellation before class bumps the next waitlisted client in, and a late cancel costs a $10 fee or one class from a class card — [Modo Yoga Maple: Late cancellation policy](https://modoyoga.com/maple/late-cancellation-policy/)

**Mindbody**
- A late cancel is a cancellation after the window. It "often" deducts a session from the client's pricing option. Early cancels carry no penalty and return the session — [Mindbody glossary](https://support.mindbodyonline.com/s/article/203254253-MINDBODY-glossary?language=en_US); [Mindbody: Appointments schedule overview](https://support.mindbodyonline.com/s/article/203258883-Appointments-Appointment-schedule?language=en_US)
- Mindbody's product page says no-show and cancellation fees are configured **by service category**. It also says:
  - appointments auto-switch to **no-show 10 minutes after start** if the client neither shows nor cancels;
  - the system lists clients subject to penalties so autopays can be scheduled to collect fees;
  - auto-emails tell clients about the policy and any fees.
  - Source: [Mindbody: Scheduling (UK)](https://www.mindbodyonline.com/en-gb/business/scheduling). Mindbody's older support articles found no category-level penalty settings, so this may be a newer capability or wording that differs by product.
- A late cancel can later be converted to an early cancel, which restores the session — [Mindbody: early cancel an appointment already late cancelled](https://support.mindbodyonline.com/s/article/209435788-How-do-I-early-cancel-an-appointment-that-has-already-been-late-cancelled?language=en_US)
- Staff can be paid for no-shows and late cancels: per pricing option for appointments, and through a site-wide "Pay Teachers for No-Shows" setting for classes — [Mindbody: Paying staff for no-shows](https://support.mindbodyonline.com/s/article/Paying-staff-for-no-shows?language=en_US)
- The No-Shows report lists late cancels and no-shows and can be filtered by service type. A missed appointment appears only if a fee was applied with "Apply Payment" — [Mindbody: No-Shows report](https://support.mindbodyonline.com/s/article/203256753-No-Shows-report?language=en_US)
- Third-party add-ons in Mindbody's marketplace automate fee processing. Bitlancer, for example, starts from about $69/month — [Mindbody integrations: Bitlancer](https://integrations.mindbodyonline.com/partners/bitlancer)

**ABC Glofox: strike system plus automated fees**
- **Strike system:**
  - It is optional and covers classes, courses and appointments.
  - A strike is added when a member misses a booked session without cancelling and attendance is submitted.
  - At a studio-set threshold (e.g. 3), the member is blocked from booking until staff remove strikes "at your discretion".
  - The glossary says strikes are not given for late cancellations, but the benefits copy implies they are. Treat this as a documentation conflict.
  - Sources: [Glofox: Using the Strike System](https://support.glofox.com/hc/en-us/articles/46432311767444); [Glofox Glossary](https://support.glofox.com/hc/en-us/articles/46479985541908-Glofox-Glossary); [Glofox: Why can't my member book?](https://support.glofox.com/hc/en-us/articles/46417700081172-Why-can-t-my-member-book-into-class)
- Members with overdue memberships or strikes cannot book free classes — [Glofox: Book a Class for Free](https://support.glofox.com/hc/en-us/articles/46477810866580-Book-a-Class-for-Free)
- **Automated fees:**
  - One no-show fee and one late-cancel fee per location, each toggled separately.
  - Fees are **charged 24 h after attendance is submitted**, leaving a window for staff to waive them.
  - With no card on file, a "Flexible invoice" is created for manual collection.
  - Source: [Glofox: Automated No-Show & Late Cancellation Fees](https://support.glofox.com/hc/en-us/articles/46433091889172-Automated-No-Show-Late-Cancellation-Fees)

**Mariana Tek (Xplor)**
- Penalty fees are configured per location and charged automatically when a reservation booked with a membership is penalty-cancelled or penalty-no-shown, if fees are enabled for that membership — [Mariana Tek: brand vs studio settings](https://support.marianatek.com/en/articles/5640165-which-key-settings-in-mariana-tek-are-configured-at-the-brand-vs-studio-level); [Mariana Tek: What are penalty fees?](https://support.marianatek.com/en/articles/5154749-what-are-penalty-fees)
- The penalty depends on the payment instrument:
  - Credit-package bookings can lose the credit, incur a fee, or both.
  - Limited-usage memberships lose a usage slot on a no-show or late cancel, and this cannot be turned off.
  - Fees can differ by location and between no-show and late cancel, but not by class.
  - Source: [Mariana Tek: What are penalty fees?](https://support.marianatek.com/en/articles/5154749-what-are-penalty-fees)
- Staff can cancel with or without penalty if their role allows — [Mariana Tek: cancel a reservation](https://support.marianatek.com/en/articles/1981735-how-do-i-cancel-a-reservation)
- Customers see messaging about losing a credit, being charged a fee, or both when they late-cancel — [Mariana Tek: late-cancel messaging](https://support.marianatek.com/en/articles/8218097-what-messaging-do-my-customers-see-when-late-cancelling-a-reservation-made-with-a-credit-package)

**Momence**
- Late-cancel rules sit under Settings > Cancellation Policy. They can charge a **percentage of the service price** or a flat fee plus a percentage, and a "cancellation credit cut-off" decides when cancellations return credit — [Momence: % of service price rules](https://help.momence.com/en/articles/12558127-late-cancellation-no-show-rules-now-allow-you-to-charge-percentages-of-the-service-price)
- Automated late-cancel and no-show charging was extended from classes to **appointments** (Settings > Cancellation Policy > Appointments), alongside "auto-retry" of failed cancellation-fee charges. The post text was only partly retrieved — [Momence feature updates (Substack)](https://momence.substack.com/p/feature-updates-easily-change-class); [Momence: Automate Appointment No-show & Late Cancellation Fees](https://help.momence.com/en/articles/10166934-automate-appointment-no-show-late-cancellation-fees)
- For limited-use subscriptions, cancelling outside the late window frees the usage count for that period instead of adding a credit — [Momence: Usage Limits, Rollover Credits & Overbooking](https://help.momence.com/en/articles/12030278-usage-limits-rollover-credits-overbooking-subscriptions)

**TeamUp**
- **Penalty system:**
  - The studio chooses the strike count, the time window and the fee.
  - Strikes can come from late cancels, no-shows or both.
  - The fee is charged automatically to the membership's saved payment method once the threshold is reached.
  - Penalties are tied to specific memberships, and if several apply they trigger together.
  - Advanced settings set how many days pass before the charge.
  - Staff waive a fee by skipping the scheduled payment before it processes.
  - Sources: [TeamUp: How can I set up a Penalty System?](https://support.goteamup.com/en/articles/9389562-how-can-i-set-up-a-penalty-system); [TeamUp: Penalty system feature](https://goteamup.com/features/penalty-system)

**WellnessLiving**
- **Late cancels:**
  - A late cancel means the client owes the session fee as if they attended.
  - Prepaid payments and pass visits are not returned.
  - If the client has not paid, staff must debit the account manually.
  - Source: [WellnessLiving: Late cancels](https://www.wellnessliving.com/knowledge-sharing/knowledge-base/late-cancels/)
- **Business policy thresholds:**
  - Example threshold: more than 3 late cancels or no-shows in a week.
  - The penalty is either a **flag that blocks future bookings** or a $ or % charge.
  - Staff with the right role can choose not to charge when changing an attendance status.
  - Changing a late cancel to an early cancel returns the visit, but the fee must be refunded manually.
  - Sources: [WellnessLiving: Business policy settings](https://help.wellnessliving.com/en/articles/9642413-business-policy-settings); [WellnessLiving: Change attendance status](https://help.wellnessliving.com/en/articles/9641675-change-a-client-s-attendance-status)
- ClassPass bookings are not penalised in WellnessLiving because ClassPass handles its own late fees — [WellnessLiving: ClassPass tips](https://help.wellnessliving.com/en/articles/10762119-tips-for-setting-up-your-services-with-classpass)

**Arketa**
- **Fee setup:**
  - Staff turn on "Track Late Cancel No Show", then the daily auto-apply, which runs at **12:00 pm ET**. With auto-apply off, no fees are charged automatically.
  - Policies set the amount, the window and which pricing-option types are subject to fees.
  - Payment can come from the card on file, a credit deduction, or both.
  - Fees can also be charged from the roster or from the "Late Cancels & No Shows" report.
  - The help pages give conflicting menu paths.
  - Sources: [Arketa: No-show and late cancel fees](https://help.arketa.com/settings/booking/no-show-late-cancel); [Arketa: Automated late cancel fees](https://help.arketa.com/payments/pos/late-cancel-automated); [Arketa: Late cancel & no-show (check-in)](https://help.arketa.com/schedule/checkin/late-cancel-no-show); [Arketa: Cancellation policy](https://help.arketa.com/settings/booking/cancellation-policy)

**Appointment-first platforms (card on file, deposits)**
- **Fresha:**
  - Payment policies require Fresha Payments; the client's card is saved to their wallet.
  - Policies can **target client groups**, such as new clients or those with previous no-shows or cancellations.
  - Only whole percentages are allowed for fees.
  - iDEAL payments are not stored and cannot be charged later, whereas Visa and Mastercard deposits can.
  - A "cancellations and no-show summary" report tracks trends.
  - Sources: [Fresha: Set up payment policies](https://www.fresha.com/help-center/knowledge-base/payments/101660-set-up-payment-policies); [Fresha: Payments policies overview](https://www.fresha.com/help-center/knowledge-base/payments/613-payments-policies-overview)
- **Vagaro:**
  - Businesses require a card at booking and set a % or flat fee with a cut-off (e.g. 24 h); cancellations before the cut-off are free.
  - Fees process only through Vagaro Merchant Services and require "Customers Can Cancel Appointments" to be enabled.
  - Staff can also redeem a package or membership visit for a no-show.
  - Sources: [Vagaro: Automatically charge a cancellation or no-show fee](https://support.vagaro.com/hc/en-us/articles/17733260320539-Automatically-Charge-a-Cancellation-or-No-Show-Fee); [Vagaro: Redeem visits from the calendar](https://support.vagaro.com/hc/en-us/articles/360017133334-Redeem-Package-or-Membership-Visits-from-the-Calendar)
  - Vagaro warns that no-show fees attract chargebacks. It recommends deposits, sending the written policy electronically at booking, and keeping client notes as a paper trail — [Vagaro: cancel and charge a fee](https://support.vagaro.com/hc/en-us/articles/360009686934-Cancel-Your-Customer-s-Appointment-and-Charge-a-Fee); [Vagaro: minimize chargebacks](https://www.vagaro.com/learn/minimize-chargebacks-friendly-fraud-with-vagaro)
- **Booksy "No-Show Protection":**
  - Deposits are a percentage taken at booking, chosen per service, and deducted at checkout.
  - Cancellation fees are charged to the card on file, with a "Charge Cancellation Fees automatically" toggle. Booksy Biz mobile-app users cannot turn auto-charges off.
  - "Trusted clients" are exempt from deposits and fees.
  - Sources: [Booksy: set up No-show Protection](https://support.booksy.com/hc/en-us/articles/16487371034130-How-do-I-set-up-No-show-Protection); [Booksy: auto-charge cancellation fees](https://support.booksy.com/hc/en-us/articles/16487379951506-What-does-it-mean-to-auto-charge-Cancellation-Fees); [Booksy: No-Show Protection](https://biz.booksy.com/features/no-show-protection)
- **Timely:**
  - Card capture requires clients to save a card and accept the policy before booking online; the fee is fixed or a percentage.
  - The docs conflict on combining deposits and fees. Where both apply, the fee is capped at the deposit.
  - By default, a cancelled appointment's deposit turns into customer credit, with an option to keep all or part of it as the fee.
  - Online payments cost 2.80 % + 30¢.
  - Sources: [Timely: Cancellation fees with TimelyPay](https://help.gettimely.com/hc/en-gb/articles/360060708994-Cancellation-Fees-with-TimelyPay); [Timely: Revenue Protection](https://help.gettimely.com/hc/en-gb/articles/360060709054-Revenue-Protection-with-TimelyPay); [Timely: use a deposit for cancellations](https://help.gettimely.com/hc/en-gb/articles/360060949334-Use-a-client-s-deposit-for-cancellations-or-no-shows); [Timely: Pricing](https://www.gettimely.com/pricing/)

**Patterns from comparable platforms**
- Wodify auto-marks a no-show if the client has not checked in one hour after class ends — [Wodify: late cancel & no-show settings](https://help.wodify.com/hc/en-us/articles/209426167)
- Walla posts penalty fees 24 h after class ends. A client added after the late-cancel window who then cancels can still be charged — [Walla: late cancels, no-shows & waitlists FAQ](https://support.hellowalla.com/en/articles/11168117-class-late-cancellations-no-shows-and-waitlists-settings-faq)
- Fitune penalties can be a fee, credits not returned, or refunds withheld. Clients with unpaid invoices can be blocked from booking online — [Fitune: penalties](https://help.fitune.io/en/articles/5557507-how-to-apply-penalties-for-cancellations-no-shows-and-pending-payment-bookings)

**Makeup / forgiveness mechanics found**
- bsport's "Audience" tool can email a member who no-showed, offering to **cancel the penalty if they book another class within 24 hours** — [bsport: Audience (FR)](https://pro.bsport.io/fr/blog/comment-optimiser-l-utilisation-de-notre-outil-audience-dans-votre-studio)
- Momence rollover credits stay valid for a set number of intervals, so unused membership sessions can be made up later — [Momence: Rollover Credits](https://help.momence.com/en/articles/12030278-usage-limits-rollover-credits-overbooking-subscriptions)
- Other forgiveness mechanics:
  - one-click credit restore after a late cancel (bsport) — [bsport vs Mindbody](https://pro.bsport.io/blog/bsport-the-best-mindbody-alternative)
  - converting a late cancel to an early cancel (Mindbody, WellnessLiving) — [Mindbody](https://support.mindbodyonline.com/s/article/209435788-How-do-I-early-cancel-an-appointment-that-has-already-been-late-cancelled?language=en_US); [WellnessLiving](https://help.wellnessliving.com/en/articles/9641675-change-a-client-s-attendance-status)

**Waitlists**
- **Glofox** has two modes:
  - **Notify all**: everyone on the waitlist is told, and the first to book gets the spot.
  - **Automatic**: members are moved in automatically "up until 30 minutes before the start".
  - Notifications go by email and push. The FAQ mentions one-tap confirmation.
  - Sources: [Glofox: How to set up a Waitlist](https://support.glofox.com/hc/en-us/articles/46477329605524-How-to-Set-up-a-Waitlist); [Glofox FAQ](https://www.glofox.com/faq/)
- **Momence** has three class waitlist modes:
  - **First come, first served**: the first person is added automatically and texted, and can see their place in line.
  - **Double opt-in**: the first person is texted and asked to accept. They lose the chance after **10 minutes** by default (configurable), and the offer moves to the next person.
  - **Fastest fingers first**: everyone is texted at once, the first reply wins, and nobody sees their place in line.
  - A cut-off (e.g. 60 min) stops automatic adds near the start.
  - Appointment waitlists trigger on a cancellation, reschedule, or change of staff or venue, with a cut-off so the client can still get there.
  - Sources: [Momence: Waitlist FAQ – Classes](https://help.momence.com/en/articles/12028307-waitlist-faq-s-classes); [Momence: Waitlist FAQ – Appointments](https://help.momence.com/en/articles/12026801-waitlist-faq-s-appointments)
  - Momence also has a "Spotfiller" feature; only its title was retrieved — [Momence: Spotfiller](https://help.momence.com/en/articles/10479704-spotfiller)
- **Mariana Tek:**
  - A cancellation inside the "auto-fill window" automatically adds the first waitlisted person, ordered by join time.
  - After that window, **Quick Fill** texts all waitlisted customers, and the first to claim gets the spot, up to the reservation cut-off.
  - Booking through the SMS link moves the client from waitlist to roster using the same credit or membership. If the spot is gone, they stay on the waitlist.
  - Quick Fill requires transactional SMS to be enabled by support.
  - The waitlist cut-off is a brand-wide setting; staff can still add people after it.
  - Clients are auto-removed after class and their credit or usage is returned.
  - Sources: [Mariana Tek: How does the Waitlist work?](https://support.marianatek.com/en/articles/1987091-how-does-the-waitlist-work); [Mariana Tek: waitlist notifications](https://support.marianatek.com/en/articles/11646988-will-a-waitlisted-customer-be-notified-if-a-class-spot-becomes-available); [Mariana Tek: brand vs studio settings](https://support.marianatek.com/en/articles/5640165-which-key-settings-in-mariana-tek-are-configured-at-the-brand-vs-studio-level)
- **Mindbody:**
  - Auto-add moves waitlisted clients onto the roster in the order they joined.
  - For courses, single-day courses auto-enrol and multi-day courses do not.
  - A course "waitlist lock window" makes clients phone the business after the lock.
  - Class schedule windows include a "Closes" setting: the number of minutes before start that clients can still book.
  - The course article was about 966 days old at search time.
  - Sources: [Mindbody: course waitlists](https://support.mindbodyonline.com/s/article/Enrollments-Waitlists?language=en_US); [Mindbody: schedule windows](https://support.mindbodyonline.com/s/article/204244713-How-can-I-set-up-how-far-in-advance-my-clients-can-schedule-classes-or-workshops?language=en_US); [Mindbody: Better Class Waitlists](https://www.mindbodyonline.com/business/education/product-waitlist-improvements)
- **bsport "Smart Waitlist"**: cancellations are reassigned instantly to the next *eligible* member. Eligibility rules check for a valid pass or enough credits before someone can join the queue — [bsport: class scheduling & booking](https://pro.bsport.io/features/class-scheduling-booking); [bsport: waitlist management](https://pro.bsport.io/blog/fitness-studio-waitlist-management)
- **TeamUp**: a waitlist is created automatically when a class is full, and customers are notified when a spot opens — [TeamUp: Bootcamp software](https://goteamup.com/product/bootcamp-software)
- **SimplyBook.me**: a waitlist for fully booked days emails **everyone** regardless of join order, and the first to complete the booking wins. It cannot be combined with "Multiple Bookings" — [SimplyBook.me: Waiting List](https://news.simplybook.me/the-new-waiting-list-feature-keep-schedules-full-and-clients-informed/); [SimplyBook.me: incompatible features](https://help.simplybook.me/index.php/What_Custom_Features_do_not_work_with_each_other)

### Inferences
- **Recommended policy matrix for the clinic**, combining Mariana Tek, Momence and WellnessLiving practice:
  - Small-group classes (≤8): a 12 h window.
  - 1:1 training and massage: 24 h, or 48 h for long or premium slots.
  - Pack or credit bookings: late cancel or no-show forfeits the credit.
  - Limited membership bookings: one usage is consumed.
  - Unlimited membership or pay-per-visit with card on file: a % or flat fee.
- **Automation with human review:**
  - Auto-flag statuses (late cancel when outside the window; no-show N minutes after start if not checked in, as in Mindbody's 10 min and Wodify's +1 h after class).
  - Queue fees and charge them after a review delay (Glofox 24 h; TeamUp N days).
  - Let staff waive with a reason code, or convert late to early cancel, with fee refund handled automatically. WellnessLiving's manual refund is a weakness to avoid.
- **Strikes:**
  - Count no-shows (optionally late cancels) in a rolling window, e.g. 3 in 30 days.
  - At the threshold either (a) block online booking until staff reset (Glofox, WellnessLiving) or (b) require a deposit or prepayment. The softer option (b) is a Fresha-style "target clients with previous no-shows" policy.
  - Show the client their strike count so the rule feels fair.
- **Forgiveness as a "makeup" mechanic:** waive the penalty if the client rebooks within 24 h (bsport). Rollover of unused membership sessions for one period is the other makeup mechanic (Momence). Both fit small-group conditioning, where the aim is attendance, not fee revenue.
- **Waitlist design for groups of ≤8:**
  - Auto-promote in join order until a cut-off of roughly 2–12 h before start, so the promoted person can realistically come. The cut-off value is an inference; vendors use 30–60 min for classes.
  - After the cut-off, broadcast a claim link by SMS or push; the first to claim wins (Mariana Tek Quick Fill).
  - Alternatively, use double opt-in with a 10–30 min response window (Momence).
  - Only allow joining with a valid entitlement (bsport), reserve the credit at join time, and return it automatically if the client is not promoted (Mariana Tek).
  - Do not penalise a client who was auto-promoted inside the late-cancel window. Walla shows the opposite default can occur.
- **Automatic fees require a stored, re-chargeable card.** Fresha's iDEAL limitation applies equally to Czech bank transfers and QR payments. Store explicit policy consent at booking to defend against chargebacks (Vagaro).
- **Aggregator and benefit-card bookings need separate penalty handling.** WellnessLiving does not penalise ClassPass bookings, and a Prague studio uses a deposit product for MultiSport users.

### Gaps
- Not found:
  - no-show and late-cancel rates;
  - published evidence that fees or strikes reduce no-shows, apart from vendor marketing claims (Fresha "up to 90 %");
  - dedicated "make-up class" features for term-based course enrolments (e.g. WellnessLiving, TeamUp, Glofox courses), where the search budget ran out;
  - Acuity's cancellation-fee mechanics;
  - bsport's specific penalty configuration;
  - TeamUp's waitlist-offer acceptance window.
- Mindbody's current automatic fee charging is described only on its marketing page; the help articles retrieved were older.

## 3. Marketing: built-in e-mail/SMS campaigns, segmentation, automations, benchmarks

### Takeaway
This question is only partly answered because the search budget ran out before the marketing searches. The findings show policy-driven segmentation and a few concrete automations:
- bsport's penalty-forgiveness email;
- Fresha's deposit policies targeted by client group;
- Booksy's "trusted clients" exemption;
- Mindbody's policy and fee auto-emails;
- upsells inside the booking flow (Fresha);
- intro-offer eligibility rules (Mariana Tek, Arketa).

No open-rate or reactivation benchmarks were gathered.

### Cited Findings
- bsport's "Audience" tool sends targeted emails, including one offering a no-show member penalty cancellation if they book another class within 24 h — [bsport: Audience (FR)](https://pro.bsport.io/fr/blog/comment-optimiser-l-utilisation-de-notre-outil-audience-dans-votre-studio)
- Fresha payment policies can target specific client groups, such as new clients or clients with previous no-shows or cancellations — [Fresha: Set up payment policies](https://www.fresha.com/help-center/knowledge-base/payments/101660-set-up-payment-policies)
- Fresha online booking can upsell up to five additional services, or one membership, per service — [Fresha: services and memberships upselling](https://www.fresha.com/help-center/knowledge-base/gift-cards/134-set-up-services-and-memberships-upselling)
- Booksy "trusted clients" are exempt from deposits and cancellation fees — [Booksy: set up No-show Protection](https://support.booksy.com/hc/en-us/articles/16487371034130-How-do-I-set-up-No-show-Protection)
- Mindbody auto-emails clients about the cancellation policy and any fees incurred — [Mindbody: Scheduling (UK)](https://www.mindbodyonline.com/en-gb/business/scheduling)
- Mindbody has a Lead Management module. It recognizes only the purchaser in shared relationships — [Mindbody: Lead Management FAQ](https://support.mindbodyonline.com/s/article/Getting-started-with-Lead-Management-FAQ?language=en_US)
- Mindbody has a referral-discount feature (title only) — [Mindbody: Referral discounts](https://support.mindbodyonline.com/s/article/203259743-Referral-discounts?language=en_US)
- Intro-offer gating works as a funnel:
  - Mariana Tek's "First Timers Only" means no reservation history, including free classes — [Mariana Tek: Intro Offer](https://support.marianatek.com/en/articles/8867603-how-do-i-configure-an-intro-offer)
  - Arketa can hide an intro offer from people who have already used it — [Arketa blog](https://www.arketa.com/blog/6-essential-settings-to-save-time-and-boost-productivity)
- Momence has an "AI Inbox" for client messaging, with studio-defined policy answers — [Momence: AI Inbox](https://help.momence.com/en/articles/11739857-getting-the-most-out-of-ai-inbox)
- Glofox publishes a "Member Engagement" solution and a Pilates automation toolkit dated November 2025. Only the titles were retrieved — [Glofox: Member engagement](https://www.glofox.com/solutions/engage-my-members/); [Glofox: Pilates automation toolkit (PDF)](https://www.glofox.com/wp-content/uploads/2025/11/pilates_automation_toolkit.pdf)

### Inferences
- For a small clinic, the automations with the clearest link to the cancellation and credit mechanics above are:
  1. booking confirmation and reminder with the policy text, which also serves as chargeback evidence;
  2. "no-show forgiveness: rebook within 24 h";
  3. "credits expiring in N days";
  4. "membership/pack running low: renew";
  5. intro-offer follow-up for first-timers;
  6. win-back for clients inactive for X weeks.
- Items 3–6 are standard industry patterns, but the vendor documentation for them was not retrieved in this session.
- Segment by attendance behaviour (no-show history, last visit, remaining credits) and by product held. Fresha and Booksy show that policy strictness itself can be segmented: new clients and repeat no-shows get deposits, trusted clients are exempt.

### Gaps
- Not retrieved:
  - built-in campaign builders and automation libraries for Mindbody (Marketing Suite), Momence, Glofox, WellnessLiving, Arketa, Vagaro, Fresha, Booksy (Boost/blasts), Timely and SimplyBook.me;
  - triggers such as birthday, expiring package, win-back, review request and abandoned booking;
  - any published benchmarks (email open/click rates for fitness and wellness, reactivation rates, Mindbody/ClassPass trend reports).
- All of these need a follow-up research pass.

## 4. Analytics: KPIs, dashboards, deferred revenue / liability, visualization

### Takeaway
This question is only partly answered. The evidence shows the report types vendors ship:
- late-cancel and no-show reports (Mindbody, Arketa, Fresha);
- membership state and forecast reports: details, frozen-current, recurring-fees forecast (Mariana Tek);
- package and membership reports (Vagaro);
- separate intro-offer reporting (Mariana Tek).

Acuity's revenue report books package, gift-certificate and subscription revenue on the **purchase** date, prorating to appointments by a formula. That points to a separate liability (deferred-revenue) view for unused credits.

### Cited Findings
- Mindbody's No-Shows report lists late cancels and no-shows and can be filtered by service type. Missed appointments appear only if a fee was applied — [Mindbody: No-Shows report](https://support.mindbodyonline.com/s/article/203256753-No-Shows-report?language=en_US)
- Arketa has a "Late Cancels & No Shows" report, and fees can be charged directly from it — [Arketa: Cancellation policy](https://help.arketa.com/settings/booking/cancellation-policy)
- Fresha offers a cancellations and no-show summary report for monitoring trends — [Fresha: Payments policies overview](https://www.fresha.com/help-center/knowledge-base/payments/613-payments-policies-overview)
- Mariana Tek's report catalogue includes:
  - Membership Details, which excludes intro-offer buyers because they are not classified as members; they appear in separate intro-offer reports;
  - Frozen Memberships – Current;
  - Membership Recurring Fees Forecast – Details.
  - Sources: [Mariana Tek: What reports are available?](https://support.marianatek.com/en/articles/5132799-what-reports-are-available); [Membership Details report](https://support.marianatek.com/en/articles/5695467-how-do-i-use-the-membership-details-report); [Frozen Memberships – Current](https://support.marianatek.com/en/articles/5204821-how-do-i-use-the-frozen-memberships-current-report); [Recurring Fees Forecast](https://support.marianatek.com/en/articles/5554974-how-do-i-use-the-membership-recurring-fees-forecast-details-report)
- Vagaro has Memberships and Packages reports for managing customer plans — [Vagaro: Memberships report](https://support.vagaro.com/hc/en-us/articles/4406235662107-Memberships-Report); [Vagaro: Packages report](https://support.vagaro.com/hc/en-us/articles/4406235637275-Manage-Customer-Packages-from-the-Packages-Report)
- Acuity's Revenue report records revenue from packages, gift certificates and subscriptions on the purchase date, not the redemption date. Appointment-level allocation uses a proration formula: the code's total value divided by its credits, minutes or dollars — [Acuity: Generating reports](https://help.acuityscheduling.com/hc/en-us/articles/16676901157389-Generating-reports)
- Arketa launched a new "Pro Dashboard … built for scale" (title only for the analytics part) — [Arketa: New Pro Dashboard](https://www.arketa.com/blog/announcing-the-new-pro-dashboard-a-fresh-dashboard-built-for-scale)

### Inferences
- The clinic platform should keep **two revenue views**:
  - cash or bookings, recognised at sale (as in Acuity);
  - earned revenue, recognised at attendance, with the per-credit or per-minute value derived the Acuity way (price ÷ units).
- An **outstanding liability** report would then list unused credits, minutes and gift-card balances by expiry month. It answers "how much do we owe in sessions" and "how much will expire".
- **Behaviour KPIs** follow directly from the mechanics above:
  - no-show rate and late-cancel rate by service, staff and time slot;
  - fees charged vs waived;
  - waitlist conversion (promoted ÷ waitlisted);
  - fill rate (utilisation) of small groups and 1:1 slots;
  - frozen memberships;
  - intro-offer to member conversion (Mariana Tek reports intro offers separately).
- Retention, churn and LTV are standard KPIs, but vendor-specific definitions were not retrieved.

### Gaps
- Not retrieved:
  - vendor KPI definitions and dashboard designs (Mindbody Business/Analytics dashboards, Glofox analytics, Momence reports, WellnessLiving reports, bsport analytics, TeamUp reports);
  - explicit deferred-revenue or unused-credit liability reports from vendors other than Acuity's purchase-date note;
  - visualization patterns.
- All need a follow-up pass.

## 5. Design/UX standouts in client apps and staff tools

### Takeaway
The evidenced standouts are:
- low-friction waitlist claiming: one-tap confirmation (Glofox), and SMS deep links that keep the original credit (Mariana Tek Quick Fill);
- visible queue position in some modes (Momence FCFS);
- a unified client wallet (Fresha);
- client self-service for plans: join, renew, upgrade, switch (bsport); manage packages and memberships with autopay (Arketa);
- spot selection (Mariana Tek, Glofox).

Strong staff tools include bulk holds (TeamUp), a 24 h fee-review window (Glofox), permission-based waivers (WellnessLiving, Mariana Tek) and a staff mobile app (Glofox Pro). Details on branded apps were not retrieved.

### Cited Findings
- Glofox waitlist notifications go by email and push, and the next member can confirm a spot "with one tap" (reformer context) — [Glofox: How to set up a Waitlist](https://support.glofox.com/hc/en-us/articles/46477329605524-How-to-Set-up-a-Waitlist); [Glofox FAQ](https://www.glofox.com/faq/)
- Mariana Tek's Quick Fill SMS links straight to booking. The reservation moves from waitlist to roster using the same credit, and if the spot is gone the client sees a message and stays on the waitlist — [Mariana Tek: waitlist notifications](https://support.marianatek.com/en/articles/11646988-will-a-waitlisted-customer-be-notified-if-a-class-spot-becomes-available)
- Momence's FCFS waitlist shows clients their place in line. "Fastest fingers" mode does not — [Momence: Waitlist FAQ – Classes](https://help.momence.com/en/articles/12028307-waitlist-faq-s-classes)
- Spot booking (choosing a specific spot or equipment) exists in Mariana Tek, where customers can change spots, and in Glofox — [Mariana Tek: change spots](https://support.marianatek.com/en/articles/3175720-are-customers-able-to-change-their-spots-in-class); [Glofox: Spot Booking](https://support.glofox.com/hc/en-us/articles/46429462554644-Spot-Booking)
- Fresha's client wallet shows balances, gift cards, memberships, packages and saved cards, and online booking offers add-on and membership upsells — [Fresha: how clients use gift cards](https://www.fresha.com/help-center/knowledge-base/packages-memberships-and-gift-cards/97-understand-how-clients-use-gift-cards); [Fresha: upselling](https://www.fresha.com/help-center/knowledge-base/gift-cards/134-set-up-services-and-memberships-upselling)
- bsport members join, renew, upgrade or switch plans themselves in the app — [bsport: Membership management](https://pro.bsport.io/features/membership-management)
- Arketa clients manage their own packages and memberships, with autopay — [Arketa: Choosing a pricing option](https://help.arketa.com/pricing/which-option)
- Vagaro clients can cancel auto-renewing plans in the app only if the business allows it — [Vagaro: cancel auto-renewing plans](https://support.vagaro.com/hc/en-us/articles/15943839935131-Cancel-Auto-Renewing-Memberships-and-Packages-for-Customers-of-a-Vagaro-Business)
- Staff tools:
  - Glofox Pro, the staff mobile app, handles memberships, pauses and credit packs — [Glofox: Overview of Glofox Pro](https://support.glofox.com/hc/en-us/articles/46421658646292-An-Overview-of-Glofox-Pro)
  - Glofox has role-based default permissions — [Glofox: Staff roles & permissions](https://support.glofox.com/hc/en-us/articles/52585050344852-Staff-Roles-and-Default-Permissions)
  - TeamUp bulk holds — [TeamUp blog](https://goteamup.com/blog/updated-bulk-holds)
- Limitations to avoid:
  - Mindbody's "Pays for" family relationship does not work in its mobile apps or branded web tools — [Mindbody: one client paying for another](https://support.mindbodyonline.com/s/article/203258193-A-client-wants-to-pay-for-another-client-s-service-Is-this-possible-at-the-retail-screen?language=en_US)
  - Booksy's Biz mobile app cannot turn off automatic cancellation-fee charging — [Booksy: auto-charge cancellation fees](https://support.booksy.com/hc/en-us/articles/16487379951506-What-does-it-mean-to-auto-charge-Cancellation-Fees)
  - Acuity redemption is code-based (unique codes entered at booking), which is less seamless than a wallet — [Acuity: Buying packages…](https://help.acuityscheduling.com/hc/en-us/articles/16676923706253-Buying-packages-gift-certificates-and-subscriptions)

### Inferences
- **Client app essentials** for the clinic:
  - a wallet screen showing every entitlement with remaining units and expiry;
  - booking that auto-selects the right entitlement, with no codes;
  - clear policy text and a countdown ("free cancellation until 18:00 tomorrow");
  - waitlist join with visible position;
  - claim-by-link or one-tap notifications;
  - self-service renew or upgrade.
- **Staff essentials**:
  - roster check-in that auto-sets statuses;
  - a penalty queue with a 24 h review and one-click waive or convert;
  - bulk holds (e.g. for clinic holidays);
  - permissioned overrides with an audit trail.

### Gaps
- Not retrieved: branded-app offerings and costs (Mindbody, Glofox, Momence, bsport, Arketa, Mariana Tek, WellnessLiving Achieve), "book in N taps" claims, Apple/Google Wallet passes, and reviews of client-app UX. These need a follow-up pass.
