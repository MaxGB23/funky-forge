# Phase 1 — Problem

> Question: **Is this worth building, and for whom?**

This phase turns a conversation into a brief someone else could implement without asking the
user. It is the cheapest phase and the one that kills bad projects.

## Inputs

User conversation, client context, `.funky-forge/assumptions.md`.

## Output

`.funky-forge/brief.md`.

## Required fields

1. **One-line summary** — what it is, for whom, in one sentence.
2. **Problem today** — how the work is done now, concretely.
3. **Users and volume** — who uses it and how many in the first year.
4. **Core flow** — the single flow that must work end to end.
5. **Must-haves** — a short list, each one testable.
6. **Out of scope** — at least one item the user might expect.
7. **Success metric** — measurable and attributable (number, unit, time window).
8. **Deadline and constraints** — date, budget, team, regulatory limits, or `none`.
9. **Current cost of the problem** — money or hours per month/year, or `unknown` with a note.

## How to ask

A junior user cannot answer "what is your current cost". Ask instead:

- "How do you do this today, step by step?"
- "How many people do it, and how often?"
- "What breaks when it goes wrong?"
- "If this shipped and nothing improved, what would still hurt?"

Convert time to money with a rate the user recognizes, and say the rate you used.

## Deterministic gate

Every field non-empty; at least one measurable metric; at least one out-of-scope item; current
cost quantified or `unknown` with a note (in that case say `unknown` explicitly, do not leave the
field blank).

## Reviewer

`references/reviewers/product.md`, **light by default**.

Lens: is the problem worth solving? is the metric measurable? is the MVP one flow? which
assumption, if false, kills the project?

Escalate to deep on the triggers in `revision.md` (more than one core flow, a risk signal, the
human asks).

## Advance

The human approves `status: approved` after a passing gate and a recorded report at
`gates/1-problem.md`.

## Re-entry

Any change to the brief marks design, estimate, and proposal `stale`.

## Common failures this gate exists to catch

- A summary that names a technology instead of a problem.
- A metric nobody can compute ("better UX").
- A "core flow" that lists six flows: that is three products.
- Out of scope left empty: the client will assume everything is included.
- A current cost that is actually the price the user hopes to charge.
