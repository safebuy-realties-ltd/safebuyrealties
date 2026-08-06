# docs/escalations

Questions this team cannot answer for itself, on record, with the answers written back
underneath them when they arrive.

An escalation goes to somebody outside the team and comes back days later. By then
nobody reliably remembers what was asked. So the question is committed before it is
sent, and the answer is checked against the question rather than against a recollection
of it. The data protection policy section 12 wants an audit trail. This directory is
one.

## Two formats, and they are not redundant

| File | What it is |
| --- | --- |
| `YYYY-MM-DD-<subject>.md` | **The record.** Markdown because we author and revise it, and because it has to diff. Answers, dispatch dates and follow-ups all land here |
| `ENG-<SERIES>-YYYY-MM-DD-NN_<Subject>.docx` | **What was sent.** Written for a reader who does not work on the platform, with a response space under each item and a collation sheet at the back. **Frozen at dispatch, not at drafting.** Until it goes out it can be corrected in place under the same reference, because nobody is holding a copy yet |

Two series, and the distinction is what the document asks of its reader.

| Series | What it is |
| --- | --- |
| `ENG-DR-` | **Decision request.** A question the team cannot answer for itself. The reader chooses |
| `ENG-CS-` | **Closure schedule.** Not a new question. A specification of what an already-open item needs, in what form, so a stakeholder sees the whole outstanding list at once rather than discovering it one blocked story at a time |

A reference number is spent when it is issued, whether or not it is used. `ENG-DR-2026-08-06-02` is
reserved by the cover of `-01` for a revision of `-01`, so a document on a different subject takes a
different series rather than the next free number in that one.

The markdown carries detail the sent document does not, because it cites files and line
numbers a recipient has no use for. The sent document frames some things better,
because it was written for somebody with twenty minutes and no context. Neither is a
copy of the other, so when one is improved, carry the improvement across rather than
letting the two drift.

## Rules

**A new version of a sent document is a new reference, never an edit.** If
`ENG-DR-2026-08-06-01` needs to change after it has gone out, it becomes
`ENG-DR-2026-08-06-02`, authored fresh, and `-01` stays exactly as it was. Somebody is
holding `-01`, and a document that changes underneath its recipient is not a record.
This is the same reasoning as identifier immutability in the ID Standard section 2.0
and reversal-not-deletion in section 8.2: the correction is a new entry that supersedes,
never an overwrite.

**Before it goes out, the same document is still drafting and can be corrected in place.** The rule
protects a recipient, and until the **Dispatched** cell carries a date there is no recipient to
protect. Spending a reference number on a change nobody could have seen would make the series count
drafts rather than dispatches. Record the correction and its date in the markdown record so the
edit is visible, then let the same reference carry it. `ENG-CS-2026-08-06-01` had its response
deadline set this way on 2026-08-06.

The generator that produced a `.docx` is deliberately not kept here either. A committed
generator invites regenerating `-01` in place, which is the one thing this directory
forbids.

**The dispatch date is recorded when it is sent, and never backfilled from memory.**
Every record file opens with a dispatch table. An empty cell means it has not gone out.
While a cell is empty, nothing in the repository may say the item was sent, and that
includes the board, the backlog and the build checklist.

**The question text is not edited after sending.** If a question changes, add a dated
entry underneath it. The record has to show what was asked first, because that is what
the answer will be answering.

**Claims get provenance.** Each record file ends with a table naming the source document
or source file behind every factual assertion, plus what is deliberately not asserted.
A recipient who disputes a fact should be able to find where it came from without
asking.

## Current

| Reference | Raised | Subject | Status |
| --- | --- | --- | --- |
| [2026-08-06-ext-8-and-ext-12.md](2026-08-06-ext-8-and-ext-12.md) | 2026-08-06 | EXT-8 to EXT-12: identifiers, commission basis, VAT authority, data transfer, entity and domain | **Dispatched 2026-08-06**, all five, **no answers recorded** |
| `ENG-DR-2026-08-06-01_Decision_Request.docx` | 2026-08-06 | The client-facing form of the above | Issued, frozen |
| [2026-08-06-closure-schedule.md](2026-08-06-closure-schedule.md) | 2026-08-06 | EXT-1 to EXT-6, ADR-0003, ADR-0004 and D3: what each needs before it can close | **Not dispatched.** Every cell in its dispatch table is empty |
| `ENG-CS-2026-08-06-01_Closure_Schedule.docx` | 2026-08-06 | The stakeholder-facing form of the above | Written. **Not dispatched**, so not yet frozen. Cover revised in place on 2026-08-06 to ask for a response by close of business that day |

ADR-0005 is deliberately excluded from the closure schedule at the requester's instruction of
2026-08-06, and the schedule says so in its own text rather than omitting it silently. D5 stays open.
