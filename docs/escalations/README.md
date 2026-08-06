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
| `ENG-DR-YYYY-MM-DD-NN_<Subject>.docx` | **What was sent.** Written for a reader who does not work on the platform, with a response box under each question and a collation sheet. Frozen once issued |

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
| [2026-08-06-ext-8-and-ext-12.md](2026-08-06-ext-8-and-ext-12.md) | 2026-08-06 | EXT-8 to EXT-12: identifiers, commission basis, VAT authority, data transfer, entity and domain | Approved, cleared to send, **not dispatched yet** |
| `ENG-DR-2026-08-06-01_Decision_Request.docx` | 2026-08-06 | The client-facing form of the above | Issued, frozen |
