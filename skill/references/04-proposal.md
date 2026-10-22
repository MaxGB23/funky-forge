# Phase 4 — Proposal

> Question: **What exactly is being sold?**

The proposal is a client document, not a project document. It states deliverables, price,
exclusions, and the terms under which the client accepts the work.

## Inputs

`brief.md`, `design.md`, `estimate.md`, `decisions.md`.

## Output

`.funky-forge/proposal.md`, written in `proposal_language` (default: `language`).

## Required fields

1. **Deliverables by phase** — grouped, each one a noun the client can accept.
2. **Acceptance criteria per deliverable** — how the client knows it is done.
3. **Exclusions** — what is not included, stated plainly.
4. **Assumptions and client responsibilities** — access, content, approvals, review times.
5. **Price range and payment milestones** — total range, expected value, when each payment is due.
6. **Timeline** — phases with dates or durations, and what starts each one.
7. **TCO and who pays providers** — monthly cost, who contracts and pays each service.
8. **Validity date** — the date after which the offer must be re-quoted.

## Rules

- No internal jargon, no component names, no block names, no reviewer language.
- Every estimate block appears in exactly one phase of the proposal.
- Every brief must-have is included or explicitly excluded.
- The price matches the estimate: same range, same expected value, same currency.
- TCO is separate from the price and never folded into it.
- Components listed in the design's `## Rejected alternatives` never appear as deliverables.
- No placeholders: no `TBD`, `TODO`, `FIXME`, `[fill]`.

## Deterministic gate

Every estimate block appears in a phase; every brief must-have included or excluded; price
matches the estimate; TCO separate; no `TBD`; rejected components absent; required fields
non-empty.

## Reviewer

`references/reviewers/commercial.md` in **client mode**, **light by default**.

Lens: would I sign this? is scope unambiguous? what is missing? are exclusions clear? is any
internal jargon left in the client text?

Escalate to deep when the proposal introduces scope not present in the estimate, when a light
pass returns `BLOCK` or a high finding, or when the human asks.

## Advance

The human approves `status: approved`. Sending the proposal, negotiating, and signing are out of
scope for this method.

## Re-entry

Any change to the proposal requires a new gate before it is sent.

## Writing style

Short sentences. Deliverables in the client's vocabulary. Every commitment checkable. When the
client reads the price, the exclusions must be on the same page.
