# ENG-CS-2026-08-06-01, closure schedule

**What every open external input and every unratified decision record needs before it can be
closed, in the exact form that would close it, matched to the stories that are waiting.**

| Ref | Owner | Dispatched | Answer recorded |
| --- | --- | --- | --- |
| EXT-1 | Client, Finance | | |
| EXT-2 | Client or Corne Labs | | |
| EXT-3 | Client | | |
| EXT-4 | Client, counsel | | |
| EXT-5 | Client, board, DPO | | |
| EXT-6 | Corne Labs | | |
| ADR-0003 | Product, client | | |
| ADR-0004 | Product, client, security | | |
| D3 | Client, product | | |

**Status: not dispatched.** Every cell above is empty, so nothing here has gone out and nothing
here has come back. Dispatch dates are stamped on the day they are sent and never backfilled.
While a **Dispatched** cell is empty, nothing anywhere in this repository may say this schedule
was sent. **Answer recorded is a separate column on purpose:** sending is not answering.

**Response requested by close of business today, 2026-08-06.** That is what the `.docx` cover asks
for and it is what this file asks for, because a deadline that differs between the two is a
deadline nobody is bound by. It is a deadline for what can be answered today rather than a request
that any decision be rushed, and rule 1 below is what makes the difference workable: an item that
cannot be settled today is answered `pending` with the date it is expected, which is a usable
answer, because work can be planned against a date and cannot be planned against silence. **The
deadline is not a dispatch date and does not become one.** If the schedule has not gone out by
close of business, the correct state of the record is the one above, an empty column, and the
deadline is the thing that has to move rather than the table.

*Revised 2026-08-06, before dispatch.* The cover carried a blank for the sender to fill in at
dispatch; it now carries the date above. This is an edit in place and it is allowed to be one:
a sent document becomes a new reference rather than an edit, and this one has not been sent, so
nobody is holding a copy that could change underneath them. The cover of the `.docx` used to say
it was issued once and never revised in place, which stated the rule a step earlier than it
applies, and it now says the freeze takes effect at dispatch. Once a date appears in the
**Dispatched** column above, `ENG-CS-2026-08-06-01` stops being editable and a change becomes
`ENG-CS-2026-08-06-02`, authored fresh.

**Sent as** `ENG-CS-2026-08-06-01_Closure_Schedule.docx` in this directory, which is the
stakeholder-facing form of everything below. The two are not copies of each other. This file
carries file paths, line numbers and section references a recipient has no use for; the `.docx`
carries a how-to-complete page, a worked example and a fill-in column, because it was written for
somebody with half an hour and no context. When one is improved, carry the improvement across.

## What this is, and what it is not

This is not a decision request. `ENG-DR-2026-08-06-01` asks five questions the team cannot answer
for itself. This document asks nothing new. It is a schedule of what has to arrive, in what form,
and in whose words, for each item that is already open, so a stakeholder holding it can see the
whole outstanding list at once rather than discovering it one blocked story at a time.

The two series are deliberately distinct. `ENG-DR-` is a question. `ENG-CS-` is a specification of
an answer already asked for. This is `-CS-` and not `ENG-DR-2026-08-06-02`, because that reference
is reserved by the cover of `-01` for a revised version of `-01` and must not be spent on a
different subject.

**Suggested wording is a draft, not a form of words we require.** Where an item offers one, it is
there to save the responder time and to show the level of specificity that actually unblocks a
story. Any wording that answers the same question closes the same item.

## How to respond

Write into the response block under each item. Partial answers are welcome and land immediately:
one answered item unblocks its story whether or not the rest of the schedule is complete.

Five rules, and they are the same five printed on the `.docx`:

1. **Never leave a point blank.** A blank cannot be told apart from a point nobody read. If it does
   not apply, write "not applicable" and one line saying why. If the answer is not available today,
   write "pending" and the date it is expected.
2. **Never write a secret value.** No key, password, secret or access token goes into this file, in
   any point, in any circumstance. Points about credentials ask who received them, on what date and
   through which channel. That is the whole answer.
3. **Dates in full.** `2026-08-14`, not "next week" and not "Q3". A date goes into a record that
   other dates are calculated from.
4. **Name people, not departments.** "Finance" cannot approve anything. A named person in a named
   role can, which is why every response block asks for a name and a role.
5. **If a point is wrong, say so in the point.** A correction is more useful to us than a compliant
   answer to a question we should not have asked.

Each numbered point below carries a *Form:* line. That line is the exact shape the answer has to
take for the story behind it to move, and it is not a stylistic preference: it is what the
implementation reads.

---

## Part A, external inputs awaiting a first response

### EXT-1, live payment credentials and a ring-fenced client-funds account

**Owner:** Client, Finance · **Closes:** E2-S1, and E2-S3 and E2-S5 sit behind it · **Also
needed by:** E9-S4 · **Moves gates:** G2, G6

**Why it blocks.** The platform cannot move money it has no account to move it from, and
`docs/adr/0002-escrow-fund-holding-model.md` settled that SafeBuyRealties holds client funds rather
than passing them straight through. That makes the account a liability account held apart from
operating money, not a merchant account swept into revenue.

**What we need**

1. Paystack **live** secret key and public key.
   *Form:* not the keys. Who received them, on what date, through which channel. Delivered out of
   band, not in a repository, not in an email body, not in a chat message.
   [docs/PAYMENT_CREDENTIALS.md](../PAYMENT_CREDENTIALS.md) records where a credential lives and
   never what it is.
2. The **ring-fenced client-funds account**.
   *Form:* bank name, account name as it appears on the mandate, and the 10-digit NUBAN.
3. The mandate that ring-fences it from operating funds.
   *Form:* date and reference of the mandate, or "attached" with the file enclosed.
4. The signatories on that account.
   *Form:* full name and role for each. Not "Finance".
5. The authorisation rule for a release.
   *Form:* the rule in words, for example "any two of the three signatories, for any amount".
6. Confirmation that the balance is reconcilable daily, and how.
   *Form:* yes or no, who does it, and what they read it from, being a portal, a statement or an
   API. SBR-FIN-DEV-SPEC-20260803-V1.5 §11.1 obliges the platform to reconcile it and only the
   account's operator can do that.
7. **The §14.2 production activation approval.**
   *Form:* the words "I approve production activation", a full name, a role and a date. Approval
   to build is not approval to operate, and G6 closes on this signature rather than on any code.

**Suggested wording**

> The live Paystack credentials were issued to ____________________ on __________ by
> ____________________ (channel). The client-funds account is ____________________ (bank),
> account name ____________________, number ____________________, held under a mandate dated
> __________ that ring-fences it from operating funds. Signatories are ____________________.
> A release requires ____________________. The balance is reconciled ____________________
> (how, by whom). I approve production activation under §14.2 of
> SBR-FIN-DEV-SPEC-20260803-V1.5: ____________________ (name, role, date).

**Documents updated when this lands:** `docs/PAYMENT_CREDENTIALS.md` (location only, never a
value), the EXT-1 row and the E2-S1 entry in `docs/MVP_OUTSTANDING_BACKLOG.md`, the G6 note in
§3.2, `docs/adr/0002-escrow-fund-holding-model.md` for the activation approval,
`docs/mvp-board.html`, `docs/BUILD_CHECKLIST.md`.

**Response**

> ____________________________________________________________________________
>
> ____________________________________________________________________________
>
> Given by: ____________________ Role: ____________________ Date: __________
>
> Points I could not answer today, and when I expect to: ____________________

---

### EXT-2, object storage bucket, credentials and region

**Owner:** Client or Corne Labs · **Closes:** E3-S2, and E3-S3 sits behind it · **Moves gates:** G3

**Why it blocks.** Uploaded documents currently sit on a disk a serverless deploy does not keep.
Until there is a bucket, every KYC document and title document is one deploy away from being gone.

**What we need**

1. The bucket name.
   *Form:* exactly as created, case-sensitive.
2. The S3-compatible endpoint.
   *Form:* the full URL.
3. The region.
   *Form:* the region code, or "deferred pending EXT-11". EXT-11 decides whether the internal
   policy's closed list of three transfer conditions or the published policy's "reasonable steps"
   governs. If the closed list wins, the region must be Nigerian or covered by one of those three
   conditions. The other six points are unaffected and can be answered now.
4. Access key and secret.
   *Form:* not the values. Who received them, on what date, through which channel, and confirmation
   they are scoped to this bucket alone rather than to the whole account.
5. Confirmation that **public reads are denied at the bucket policy**.
   *Form:* yes or no, and the date it was checked. `docs/adr/0004-private-document-access.md` makes
   this a production requirement rather than a preference.
6. Whether object versioning is enabled.
   *Form:* on or off. This is not housekeeping: E8-S1 criterion 5 requires erasure to crypto-shred
   rather than orphan storage objects, and versioning changes what deletion means.
7. The retention and lifecycle rules applied at the bucket.
   *Form:* describe each rule, or "none". They must not silently contradict the retention periods
   EXT-5 supplies.

**Suggested wording**

> The bucket is ____________________ at endpoint ____________________, region
> ____________________ (or: region deferred pending EXT-11). Credentials were issued to
> ____________________ on __________ by ____________________ (channel), scoped to this bucket
> only. Public reads are denied at the bucket policy: yes / no, checked __________.
> Object versioning is: on / off. Lifecycle rules applied: ____________________.

**Documents updated when this lands:** the EXT-2 row, the D4 row and the E3-S2 entry in
`docs/MVP_OUTSTANDING_BACKLOG.md`, the region sub-decision in
`docs/adr/0004-private-document-access.md`, `docs/LOCAL_DEVELOPMENT.md` if environment variables
change, `docs/mvp-board.html`, `docs/BUILD_CHECKLIST.md`.

**Response**

> ____________________________________________________________________________
>
> ____________________________________________________________________________
>
> Given by: ____________________ Role: ____________________ Date: __________
>
> Points I could not answer today, and when I expect to: ____________________

---

### EXT-3, transactional email domain and authentication

**Owner:** Client · **Closes:** E6-S1

**Why it blocks.** The platform can compose mail but has no authenticated domain to send it from.
Unauthenticated transactional mail about money and title documents goes to spam, which is worse
than not sending it, because the sender believes it arrived.

**What we need**

1. The sending domain or subdomain.
   *Form:* the exact domain.
2. Who controls DNS for that domain.
   *Form:* name of the person and the organisation. SPF, DKIM and DMARC have to be published by
   that party and cannot be published by us.
3. The **SPF** record as published.
   *Form:* the record value, and the date it was published.
4. The **DKIM** selector, and confirmation the public key is live in DNS.
   *Form:* the selector name, and yes or no.
5. The **DMARC** policy and reporting address.
   *Form:* `none`, `quarantine` or `reject`, plus the address aggregate reports go to.
6. SMTP host, port and username.
   *Form:* host, port number, username. Not the password. For the password, who received it, when,
   and through which channel.
7. The addresses users will see, and the bounce address.
   *Form:* the `From` address, the `Reply-To` address, and the bounce address.
8. Whether to publish DNS now or wait for EXT-12.
   *Form:* proceed now, or wait. EXT-12 settles the canonical domain. A sending domain chosen
   before that answer may have to move, which means publishing DNS again and warming it again.

**Suggested wording**

> Mail sends from ____________________. DNS for that domain is controlled by
> ____________________. SPF, DKIM and DMARC were published on __________ with DMARC policy
> ____________________ and reports to ____________________. SMTP credentials were issued to
> ____________________ on __________. Users see From ____________________ and Reply-To
> ____________________. Bounces go to ____________________.

**Documents updated when this lands:** the EXT-3 row and the E6-S1 entry in
`docs/MVP_OUTSTANDING_BACKLOG.md`, `docs/LOCAL_DEVELOPMENT.md`, `docs/mvp-board.html`,
`docs/BUILD_CHECKLIST.md`.

**Response**

> ____________________________________________________________________________
>
> ____________________________________________________________________________
>
> Given by: ____________________ Role: ____________________ Date: __________
>
> Points I could not answer today, and when I expect to: ____________________

---

### EXT-4, counsel-approved instruments and terms

**Owner:** Client, counsel · **Closes:** E8-S2 · **Moves gates:** G4

**This is three documents, not two.** The full clause-by-clause requirement is in
`docs/MVP_OUTSTANDING_BACKLOG.md` §3.3 under "EXT-4, what closes it". Summarised here:

1. **The terms of service, completed.** `docs/inputs/SBR TERMS AND CONDITIONS SAFEBUY.docx` stops
   at section 10 and ends on an intellectual property sentence. Nine clause families are absent,
   including every escrow term and any limitation of liability, from the contract of a platform
   that holds client money. Two existing clauses also need correcting: §10 vests site content in
   "the Founder", an individual rather than the company, and §5(a) promises a minimum 5% from each
   side, which EXT-9's answer has to be reconciled against.
2. **The seller Power of Attorney.** `docs/inputs/SBR -POWER OF ATTORNEY.docx` is dated 2017 in
   its body, has a witness block with no attestation clause above it, and carries no stamping,
   registration or Governor's consent clause. Its clause 5 authorises deducting 10% at source,
   which is EXT-9 and EXT-10.
3. **The instrument the platform generates**, in `backend/src/poa/poa.service.ts`. Counsel has
   never seen it. Its clauses were written in a build checklist. One question in it decides
   whether the feature is lawful at all: **can an instrument granting authority over land be
   executed electronically** under the Evidence Act 2011 and the Electronic Transactions Act 2023,
   or is land carved out? If it is carved out, the platform should produce a print-and-execute
   pack instead, which is a build change and not a wording change.

**What we need back**

1. Counsel's name or firm, and the date they were instructed.
   *Form:* name, firm, date.
2. The date the reviewed documents are expected back.
   *Form:* a date. Not "in a few weeks".
3. Confirmation counsel holds all three documents.
   *Form:* yes or no for each of the three named above. Naming all three matters, because the
   backlog's clause table covers only the first.
4. Counsel's position on electronic execution of a land instrument.
   *Form:* permitted, not permitted, or permitted subject to conditions, with the conditions
   stated.
5. The entity name to be used throughout.
   *Form:* the registered name exactly as it appears at the Corporate Affairs Commission. Same
   answer as EXT-12, and it only needs giving once.
6. Whether counsel proceeds now or waits for EXT-9, EXT-10 and EXT-12.
   *Form:* proceed now, or wait.

**Sequencing.** This item cannot be finalised before EXT-9, EXT-10 and EXT-12 come back. The
commission basis, the VAT authority and the registered entity name all sit inside the text counsel
would be approving. Sending it to counsel first means paying for a review of text that then
changes.

**Suggested wording**

> Counsel is ____________________, instructed on __________. Expected return __________. They
> hold all three documents: yes / no. On electronic execution of a land instrument, counsel's
> position is: permitted / not permitted / permitted subject to ____________________. The entity
> to be named throughout is ____________________. They proceed now / wait for EXT-9, EXT-10 and
> EXT-12.

**Documents updated when this lands:** replacement files in `docs/inputs/`, the EXT-4 row, the
E8-S2 entry and the G4 note in `docs/MVP_OUTSTANDING_BACKLOG.md`, the clause text and a version
stamp in `backend/src/poa/poa.service.ts`, `docs/mvp-board.html`, `docs/BUILD_CHECKLIST.md`.

**Response**

> ____________________________________________________________________________
>
> ____________________________________________________________________________
>
> Given by: ____________________ Role: ____________________ Date: __________
>
> Points I could not answer today, and when I expect to: ____________________

---

### EXT-5, privacy notice, retention periods and an adopted policy

**Owner:** Client, board, DPO · **Closes:** E8-S1

Both documents are already in the repository and both are structurally complete, so this is not a
request for documents that do not exist. It is a request for five things they do not contain. Full
detail is in `docs/MVP_OUTSTANDING_BACKLOG.md` §3.3 under "EXT-5, what closes it".

1. **Board adoption.** `docs/inputs/SB DATA PROTECTION POLICY.docx` is headed "SUBJECT TO BOARD
   APPROVAL".
   *Form:* the adoption date and the resolution reference, plus confirmation that the line comes
   off in the adopted version. Until it does, encoding retention rules against that policy means
   encoding something the board may change.
2. **A named DPO**, per internal §8.
   *Form:* full name, role, contact address. §8 creates the role and appoints nobody. §8 also makes
   the DPO the person who advises on DPIAs, so E8-S1 criterion 8 cannot be validly signed off
   without one.
3. **A licensed DPCO engaged**, per internal §9.
   *Form:* name, licence number, engagement date, or the date procurement starts. This has a lead
   time and nothing has started.
4. **The date business operations commenced.**
   *Form:* a single date. Internal §10.1 sets the initial compliance audit at fifteen months from
   it. Nobody in this repository has that date and the clock may already be running.
5. **Whether erasure means deletion or crypto-shredding** where a record must be kept by law.
   *Form:* which one, per category if it differs. This decides what the erasure feature does to a
   record it is not allowed to destroy.
6. **Retention periods, one per category.** Neither document states a period, in days or years,
   for anything. Published §9.1 says "as long as is reasonably necessary" and internal §14 requires
   the record of processing activities to carry periods it never supplies. E8-S1 criterion 3 makes
   an unset period a loud failure rather than a default, so a missing number blocks that category
   and only that category.

**EXT-5 retention table.** One number per row, with the law, regulator or business need behind it.
Write a period as a number and a unit: 7 years, 90 days, 24 months. "As long as necessary" cannot
be encoded, which is exactly why the policies as they stand cannot be implemented. If a category
genuinely has no fixed period, write the event that ends it, for example "until the account is
closed, then 90 days".

| Category | Retention period | Reason: law, regulator or business need |
| --- | --- | --- |
| KYC identity documents (passport, driver's licence, national ID, utility bill) | | |
| KYC selfie and liveness images (biometric, treated as sensitive) | | |
| Professional credentials (agent and developer licences) | | |
| Transaction and payment records (note any tax or company-law minimum) | | |
| Audit and access logs (who read which document, and when) | | |
| Marketing consent records (including proof of the consent itself) | | |
| Cookie and analytics data (including anything held by a third-party tool) | | |
| Account data after closure (what survives, and for how long) | | |

The cross-border half waits on EXT-11 and is not asked for again here.

**Suggested wording**

> The board adopted the data protection policy on __________, resolution ____________________.
> The DPO is ____________________, reachable at ____________________. The DPCO engaged is
> ____________________, licence ____________________, engaged on __________. Business operations
> commenced on __________. Erasure means ____________________ where a record must be retained by
> law. Retention periods are in the table above.

**Documents updated when this lands:** replacement files in `docs/inputs/`, the EXT-5 row and the
E8-S1 entry in `docs/MVP_OUTSTANDING_BACKLOG.md`, a record of processing activities and a DPIA
added under `docs/`, `docs/mvp-board.html`, `docs/BUILD_CHECKLIST.md`.

**Response**

> ____________________________________________________________________________
>
> ____________________________________________________________________________
>
> Given by: ____________________ Role: ____________________ Date: __________
>
> Points I could not answer today, and when I expect to: ____________________

---

### EXT-6, penetration test vendor and window

**Owner:** Corne Labs · **Closes:** E8-S3 · **Moves gates:** G5

**This is the only item on this schedule with no upstream dependency.** It waits on nothing and
could be booked today. What is missing is the booking, not the test.

1. The vendor, and a named contact there.
   *Form:* company name, contact name, email and phone.
2. **A scope of work** naming the four areas in E8-S3 criterion 1.
   *Form:* yes or no for each of authentication, authorization, payments and document handling,
   plus confirmation that it explicitly includes the escrow payment path and the KYC document
   store.
3. Whether the engagement is black, grey or white box.
   *Form:* one of the three, and if grey or white, what access the testers are given.
4. The environment to be tested.
   *Form:* name it. It must not be production with live customer data.
5. **The window.**
   *Form:* start date and end date.
6. **Rules of engagement.**
   *Form:* attached or summarised, covering the seeded test data set, any out-of-hours constraint,
   and who to call when something breaks during the test.
7. The date the report is due.
   *Form:* a date. The report carries findings, severity ratings and reproduction steps.
8. The date the **re-test letter** is due.
   *Form:* a date. Criterion 4 requires the re-test as its own artifact, and G5 reads "no high
   findings outstanding", which only an independent party can attest to.

**Suggested wording**

> The vendor is ____________________, contact ____________________. The window is __________ to
> __________, against the ____________________ environment, ____________________ box. Scope
> covers authentication, authorization, payments and document handling, including the escrow
> payment path and the KYC document store. Rules of engagement are attached. The report is due
> __________ and the re-test letter __________.

**Documents updated when this lands:** the EXT-6 row, the E8-S3 entry and the G5 note in
`docs/MVP_OUTSTANDING_BACKLOG.md`, `docs/mvp-board.html`, `docs/BUILD_CHECKLIST.md`. The report
and re-test letter are filed under `docs/` when they arrive.

**Response**

> ____________________________________________________________________________
>
> ____________________________________________________________________________
>
> Given by: ____________________ Role: ____________________ Date: __________
>
> Points I could not answer today, and when I expect to: ____________________

---

## Part B, already sent, do not answer here

EXT-8 to EXT-12 went out on 2026-08-06 inside `ENG-DR-2026-08-06-01_Decision_Request.docx` and are
awaiting answers. They are listed so this schedule is a complete picture of what is outstanding,
and they carry **no response block on purpose**. An answer given in two places is an answer that
can differ in two places, and the record has to check an answer against the question as it was
asked.

| Ref | Question, in short | Blocks | Answer goes in |
| --- | --- | --- | --- |
| EXT-8 | Five conflicts between the ID Standard and SBR-FIN-DEV-SPEC-20260803-V1.5 | E9-S2 | `ENG-DR-2026-08-06-01` |
| EXT-9 | The commission basis: one-sided or two-sided, collected or withheld, floor or rate | E9-S3, and EXT-4 | `ENG-DR-2026-08-06-01` |
| EXT-10 | What authorises VAT withholding from seller proceeds | E9-S3, G4, and EXT-4 | `ENG-DR-2026-08-06-01` |
| EXT-11 | Which data-transfer rule governs, internal §12 or published §10 | D4, E3-S2, E8-S1, and the region point of EXT-2 | `ENG-DR-2026-08-06-01` |
| EXT-12 | Entity name, registered address, canonical domain, and whether the ID Standard is under revision | E9-S2, E8-S2, EXT-3, and all PoA generation | `ENG-DR-2026-08-06-01` |

---

## Part C, decision records

### ADR-0001, MVP scope envelope, decision D1

**Accepted 2026-08-02.** On-platform property purchase is in the MVP, and wave 4 is what that
answer released. Nothing is required. Listed so this schedule is a complete list rather than a list
of problems.

### ADR-0002, escrow fund holding model, decision D2

**Accepted 2026-08-05.** SafeBuyRealties holds client funds. The decision itself needs nothing
further. **One thing on it is still outstanding:** the §14.2 production activation approval, which
is a separate permission from the approval to build. It is asked for once, at point 7 of EXT-1
above, rather than twice.

### ADR-0003, fail startup rather than silently mock payments in production

**Owner:** Product, client · **Relates to:** E2-S4 · **Status in the repository: Proposed**

**This is a ratification, not a decision.** E2-S4 shipped as PR #99. The behaviour described in
this ADR is live: a production deploy with no payment credential refuses to start rather than
recording every seller as paid against a `mock_transfer_...` reference. The decision record still
says Proposed.

What that costs if it stays as it is: the repository's own decision register says "Proposed" about
behaviour running in production, so anyone reading the register cannot tell what was decided from
what was merely suggested, and a future change has no recorded baseline to depart from.

**What we need**

1. Whether ADR-0003 is accepted as written.
   *Form:* accepted, or not accepted.
2. If not accepted, what happens instead.
   *Form:* describe the behaviour wanted when a production deploy has no payment credential, or
   "not applicable".
3. Confirmation of the trade-off the ADR names: **a missing environment variable takes the API
   down.**
   *Form:* yes or no. That is deliberate and correct for a money path, and it is the sort of thing
   to agree to knowingly rather than discover during an incident.
4. The date the decision takes effect.
   *Form:* a date. It may be backdated to when E2-S4 shipped, if the record should match reality.

**Suggested wording**

> ADR-0003 is accepted as written, effective __________, decided by ____________________. I
> understand that a production deploy with a missing or blanked Paystack credential will refuse to
> start.

*or*

> ADR-0003 is not accepted. Instead ____________________________________________________.

**Documents updated when this lands:** the status line of `docs/adr/0003-payment-mock-mode-guard.md`,
`docs/mvp-board.html`, `docs/BUILD_CHECKLIST.md`.

**Response**

> ____________________________________________________________________________
>
> Given by: ____________________ Role: ____________________ Date: __________

### ADR-0004, private documents move behind authorization, decision D4

**Owner:** Product, client, security · **Relates to:** E3-S1, E3-S2, E3-S3, gate G3 · **Status in
the repository: Proposed**

**Also a ratification.** E3-S1 shipped across PRs #103 to #112. The unauthenticated static mount
is gone, private files are served through an authorization-checked path, and
`backend/src/storage/uploads-exposure.spec.ts` probes it. The decision record still says Proposed.

Two consequences in it are still forward-looking rather than done, and are the parts worth
confirming knowingly:

- **Production requires an S3-compatible driver with public reads denied at the bucket policy, and
  the application refuses to start on a serverless platform with the local driver.** That is
  another deliberate fail-closed posture, and it is what makes EXT-2 a blocker rather than a
  nice-to-have.
- **A migration pass must copy recoverable objects and report the keys it cannot find rather than
  failing silently.** If files were uploaded to `/tmp/safebuyrealties-uploads` on a serverless
  deploy, some are already unrecoverable. Somebody outside engineering should decide what is done
  about the ones that cannot be found.

**What we need**

1. Whether ADR-0004 is accepted as written.
   *Form:* accepted, or not accepted, with what instead.
2. Confirmation of the production requirement.
   *Form:* yes or no. Production will refuse to start without S3-compatible storage with public
   reads denied.
3. What happens to objects the migration pass cannot find.
   *Form:* choose one and name who does it. For example: notify the uploading user and ask for a
   re-upload; write them off with a recorded list; hold the migration until a backup is checked.
4. The date the decision takes effect.
   *Form:* a date. It may be backdated to when E3-S1 shipped.

The region sub-decision stays open and is EXT-2 point 3 and EXT-11. It is not asked for again here.

**Suggested wording**

> ADR-0004 is accepted as written, effective __________, decided by ____________________. I
> understand that production will refuse to start without S3-compatible storage. Unrecoverable
> objects found by the migration pass should be handled by ____________________.

**Documents updated when this lands:** the status line of
`docs/adr/0004-private-document-access.md`, the D4 row in `docs/MVP_OUTSTANDING_BACKLOG.md`,
`docs/mvp-board.html`, `docs/BUILD_CHECKLIST.md`.

**Response**

> ____________________________________________________________________________
>
> Given by: ____________________ Role: ____________________ Date: __________

### ADR-0005, quality ratchet, decision D5

**Deliberately excluded from this schedule at the requester's instruction, 2026-08-06.** It is
recorded here so that its absence reads as a decision rather than an oversight. It remains
Proposed and D5 remains open.

---

## Part D, one open decision with no ADR

### D3, KYC: manual review or a provider

**Owner:** Client, product · **Relates to:** E4-S2

Included because it is the only open item in the decision register with no architecture decision
record behind it, and a schedule that claims to cover the register would otherwise have a hole in
it. **It is not blocking anything.** E4-S2 shipped as PR #142 on manual review, and it reads one
field through one registry, so a provider changes who writes `KycRecord.status` rather than who
reads it. This is genuinely cheaper to answer late than it was, and answering it "manual for now"
costs nothing.

**What we need**

1. Manual review, or a provider, for the MVP.
   *Form:* manual, or provider.
2. If a provider, which one.
   *Form:* name it, or "not applicable".
3. Who decided, and on what date.
   *Form:* full name, role, date.

**Suggested wording**

> KYC stays manual for the MVP / moves to ____________________ (provider), decided __________ by
> ____________________.

**Documents updated when this lands:** the D3 row and the E4-S2 entry in
`docs/MVP_OUTSTANDING_BACKLOG.md`, a new ADR if a provider is chosen, `docs/mvp-board.html`,
`docs/BUILD_CHECKLIST.md`.

**Response**

> ____________________________________________________________________________
>
> Given by: ____________________ Role: ____________________ Date: __________

---

## Collation

For whoever gathers the responses, so nothing is lost in a thread. Fill this in as answers arrive
and copy the dispatch dates up into the table at the top of this file on the day they are sent.

| Ref | Answered by | Date | Points still outstanding |
| --- | --- | --- | --- |
| EXT-1 | | | |
| EXT-2 | | | |
| EXT-3 | | | |
| EXT-4 | | | |
| EXT-5 | | | |
| EXT-6 | | | |
| ADR-0003 | | | |
| ADR-0004 | | | |
| D3 | | | |

---

## Provenance

Every factual claim above, and where it came from. A recipient who disputes one should be able to
find its source without asking.

| Claim | Source |
| --- | --- |
| The terms of service stops at section 10 and ends on an IP sentence | `docs/inputs/SBR TERMS AND CONDITIONS SAFEBUY.docx`, read 2026-08-06: 83 non-empty paragraphs, last section heading "10. INTELLECTUAL PROPERTY" |
| Nine clause families are absent from it | Same file, full-text search for liability, indemnity, governing law, jurisdiction, arbitration, refund, termination, escrow, force majeure |
| §10 vests content in "the Founder" and §5(a) promises 5% from each side | Same file, sections 10 and 5 |
| The PoA is dated 2017 and has no attestation, stamping, registration or consent clause | `docs/inputs/SBR -POWER OF ATTORNEY.docx`, read 2026-08-06, instrument body from paragraph 27 |
| Its clause 5 deducts 10% at source | Same file, paragraph 33 |
| The platform generates a different instrument | `backend/src/poa/poa.service.ts` lines 103 to 159, clauses 1 to 7 |
| Neither policy states a retention period | `docs/inputs/SBR PRIVACY POLICY.docx` §9.1 and `docs/inputs/SB DATA PROTECTION POLICY.docx` §14, read 2026-08-06 |
| The internal policy is unadopted and names no DPO | Same file, first line "SUBJECT TO BOARD APPROVAL" and §8, which creates the role and appoints nobody |
| The initial audit runs fifteen months from commencement | Same file, §10.1 |
| A licensed DPCO must be engaged | Same file, §9 |
| E2-S4 shipped and ADR-0003 is still Proposed | `docs/MVP_OUTSTANDING_BACKLOG.md` epic table row E2-S4 (✅ #99) against the status line of `docs/adr/0003-payment-mock-mode-guard.md` |
| E3-S1 shipped and ADR-0004 is still Proposed | Same table, row E3-S1 (✅ #103–112) against the status line of `docs/adr/0004-private-document-access.md` |
| EXT-8 to EXT-12 are dispatched and unanswered | The dispatch table in [2026-08-06-ext-8-and-ext-12.md](2026-08-06-ext-8-and-ext-12.md) |

**Deliberately not asserted here.** Whether counsel will hold that a land instrument can be
executed electronically. Whether the fifteen-month audit clock has already started, since the
commencement date is the thing being asked for. Whether any object in
`/tmp/safebuyrealties-uploads` is actually lost, which cannot be known without the deployment
history. Whether the retention periods that come back will be compatible with §4.5's six months,
which is for the DPO to reconcile in writing rather than for engineering to assume.
