---
schema: 1
phase: design
status: draft
depends_on: [problem]
language: en
approved_by: null
approved_at: null
approved_hash: null
method_version: 1
---

# Design — <project name>

<!-- Minimum design that satisfies the brief. Replace every comment with real content. -->

## Architecture at a glance

<!-- One paragraph plus a text diagram. -->

## Components and responsibilities

- <!-- ComponentName — one line of responsibility — must-have it serves -->

## Data model and retention

<!-- Entities, relations, what is deleted and when. -->

## Auth and permissions

<!-- Who can see and change what, and where it is enforced. -->

## Integrations

<!-- Third-party service, contract owner, failure behavior. -->

## NFR decisions

| NFR | Applies | How it is met | Not applicable because |
|---|---|---|---|
| Performance |  |  |  |
| Availability |  |  |  |
| Security |  |  |  |
| Scale |  |  |  |

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|

## Rejected alternatives

- <!-- ComponentOrApproach - rejected because <reason> -->

## Stack decision

<!-- The stack with rationale, or an explicit deferral to the estimate. -->

## Gate

- [ ] Every must-have maps to a component
- [ ] Every component maps to a must-have or a rejected alternative
- [ ] NFR table complete
- [ ] Rejected alternatives present
- [ ] Reviewer report recorded in `gates/2-design.md`
