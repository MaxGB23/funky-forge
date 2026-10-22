# Phase 2 — Design

> Question: **What is the minimum design that satisfies the brief?**

Design is subtraction: the first draft is usually the largest thing that could work.

## Inputs

`brief.md`, `.funky-forge/assumptions.md` (stack constraints, team, hosting preferences).

## Output

`.funky-forge/design.md`.

## Required fields

1. **Architecture at a glance** — one paragraph and one diagram in text.
2. **Components and responsibilities** — a list; each line starts with the component name.
3. **Data model and retention** — entities, relations, what is deleted and when.
4. **Auth and permissions** — who can see and change what.
5. **Integrations** — third-party services, contract owner, failure behavior.
6. **NFR table** — performance, availability, security, scale; each applies or not applicable
   with a reason.
7. **Risks and mitigations** — risk, impact, mitigation.
8. **Rejected alternatives** — what was considered and why it lost.
9. **Stack decision** — the stack, with rationale, or an explicit deferral to the estimate.

## Mapping rules

- Every must-have in the brief maps to a component, by name.
- Every component maps to a must-have, or appears in `## Rejected alternatives` in the form
  `- <component> - rejected because <reason>`.

This is what `funky-forge check design` verifies. A component with no must-have is scope creep;
a must-have with no component is a hole.

## NFR table format

```markdown
| NFR | Applies | How it is met | Not applicable because |
|---|---|---|---|
| Performance | yes | PDF under 2 s at p95 |  |
| Availability | yes | single region, daily backups |  |
| Security | yes | tenant isolation per user |  |
| Scale | no |  | 50 users in year one; migration path documented |
```

"No" requires a reason. "TODO" is not a reason.

## Deterministic gate

Every must-have maps to a component; every component maps to a must-have or a rejected
alternative; the NFR table has four rows with no empty cell in an applicable row; no `TBD`;
rejected alternatives present.

## Reviewer

`references/reviewers/design.md`, **deep by default**.

Lens: what can be cut? what breaks at 10x? what is the simplest alternative? where is the hidden
coupling? is data isolation correct?

## Advance

Human approves `status: approved` after a passing gate and `gates/2-design.md`.

## Re-entry

Any change to the design marks estimate and proposal `stale`.

## What "minimum" means here

Choose the smallest architecture that satisfies the NFR table. If a requirement can be met by a
database constraint, do not add a service. If a feature can be deferred without breaking the core
flow, defer it and list it in the brief's out-of-scope, not in the design.
