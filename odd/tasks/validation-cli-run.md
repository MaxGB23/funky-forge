# Validation run C: the method with the CLI in the loop

Feature document for issue #72 (`docs: a third validation run puts the CLI in the loop for the first
time`). `docs/validation/project-a.md:2-4` and `docs/validation/project-b.md:3-5` both record a run by
hand with `check: manual` everywhere, because "the CLI did not exist yet" — which is what RFC §17 asked
for and also what it required ("do not use `funky-cli` or `funky pipeline`", "the method must stand
with no CLI at all"). No page therefore shows the four phases running through the tool that now owns
the gate. This run is that page, and its declared subject is the gate's **write side**: `approve` and
`stale` (issue #71) have unit tests and no real run.

The probing work is done; what is missing is the reviews. This record exists so the run is resumable
from here rather than from someone's memory.

## Specs

- **S1 — The claim, stated before the run.** `docs/validation/project-c.md` opens by naming what it
  establishes that A and B cannot: the method survives being run through its own tool, end to end, with
  no hand edit to `.funky-forge/` standing in for a command. A page that does not say this is a third
  anecdote about the same claim. (Issue #72 body, "What you propose" 1.)
- **S2 — The scenario forces a revised approval.** The client adds a must-have **after** the design is
  approved. The run must then exercise the whole write side: `stale` on the changed artifact, `check`
  refusing the dependents with `STALE_ARTIFACT`, a re-gate, and `approve` again — the path no run has
  walked. A scenario where nothing is ever re-approved tests the read half, which already had evidence.
  (Issue #72 body, "What you propose" 2.)
- **S3 — Independence is not simulated.** One blind, read-only reviewer per phase, each handed a frozen
  artifact hash and nothing else of the author's. Where independence cannot be had, the page says
  `not verified` and makes no claim — the precedent is `project-a.md`'s "Skill loaded correctly in two
  harnesses | Not verified". **A run reviewed by its own author is not published as a validation of the
  gate.** (Issue #72 body, "What you propose" 3.)
- **S4 — §17's table is carried, and its "no CLI" rows are replaced, not silently reused.** Three rows
  assume the CLI is absent. They become rows this run can answer: `check` refusals a reviewer had to work
  around, hand edits to `.funky-forge/`, and commands that could not run without a flag the method does
  not document. The other seven rows keep §17's exact wording so the three pages compare. Any departure
  from §17 is listed under a `Departures` heading with its reason, and the RFC is corrected by a dated
  `## Errata` rather than rewritten. (RFC §17 metric table; issue #72 body, "What you propose" 4.)
- **S5 — Failures are findings.** The metrics table records what failed, with the reason, in the voice
  `project-a.md` uses for `Artifacts consistent after changes: **No**`. A page with no failure row and no
  `not verified` row is not credible and will not be merged. (Issue #72 body, "What you propose" 5.)
- **S6 — The page lands with the run.** No skeleton is committed to `docs/validation/` before there is a
  run to record: those pages are records, and `AGENTS.md` treats a record as frozen once settled. This
  document is the planning surface; `project-c.md` appears only when the phases have run.
- **S7 — The run happens outside this repository.** A scratch project in a temporary directory, created
  with `funky-forge init`, with no artifact copied from this repository and nothing written back into it.
  (RFC §17 step 2, "on two projects in temporary directories", carried forward.)
- **S8 — Issue first, and the label is not mine.** Issue #72 exists with `type:docs`; `status:approved` is
  a maintainer judgement (`CONTRIBUTING.md:23-24`). Work may be prepared before the label and may not be
  merged without it.

## Scenario (proposed, not yet accepted)

**Project C — route planning for a distribution company.** A twelve-van distributor in Mexico City wants
daily route planning and proof of delivery; internal client, one developer, about five weeks, rate and
currency supplied by the human at run time. Its premise is the one thing A and B could not have: the
client **adds a must-have after the design is approved** — "the driver must be able to reschedule a stop
from the road" — which the design did not price. That is the trigger the run needs, and it is realistic
rather than staged: it is the change request that breaks quotations in practice.

The scenario is the parent's proposal. The owner may replace it before phase 1 starts, and only the
premise in S2 is mandatory.

## Tasks

| ID | Spec | Route | State |
|---|---|---|---|
| T1 | S8 | Open issue #72 with what and why | done — [#72](https://github.com/MaxGB23/funky-forge/issues/72), `type:docs` |
| T2 | S7 | Scratch project outside the repository: `funky-forge init` in a temporary directory, empty of this repository's content | not started |
| T3 | S2, S3 | Phase 1 (`problem`) drafted, `check problem` passing, blind reviewer, gate report written | not started |
| T4 | S2, S3 | Phase 2 (`design`) drafted, `approve problem`, `check design` passing, blind reviewer | not started |
| T5 | S2 | The change request arrives: `stale` on the changed artifact, `check` refusing the dependents, re-gate, re-approve. Every command and its exact output recorded | not started |
| T6 | S2, S3 | Phase 3 (`estimate`) and phase 4 (`proposal`), each checked and reviewed | not started |
| T7 | S1, S4, S5 | Write `docs/validation/project-c.md`: the page's claim first, §17's table with the `Departures` heading, the phase-by-phase table, failures and `not verified` rows | not started |
| T8 | S4 | If §17's plan needs correcting for a CLI-carrying run, add the dated `## Errata` to the RFC — never rewrite it | not started |

## Blocked

**T3-T6 need a reviewer registry, and this session has none.** `subagent_list_agents` returns
`No subagents defined`, twice, minutes apart; `odd/tasks/approve-staleness.md` `L11` records the same
fault for that feature's closing audit. Nothing else in this document is blocked: T1 is done, and T2,
T7's skeleton and the scenario can be done without an agent that does not exist.

The run resumes in the first session whose registry resolves a judge or reviewer agent. It must not
resume by having the author review the author's work and publishing the result as validation (S3).

## Log

- **L1** — User verbatim: "Deleguemos una ronda a subagentes, para poder aprobar la nueva feature en un
  escenario real, nos sirve para algun doc de validation, tenemos dos pruebas creo, y esta sería otra,
  dime que opinas". Then, from three options: **preparar ahora, revisar después**.
- **L2** — What the two existing pages actually claim, read rather than remembered: both say the run was
  done by hand, `check: manual` everywhere, "the CLI did not exist yet". So the repository has two proofs
  of the protocol and **zero** of the tool. The framing "this would be another one" understates it, and
  the record says so instead of adopting it.
- **L3** — RFC §17 read in full: its metric table belongs to a run with no CLI at all, and its target
  column says "the method must stand with no CLI at all". A CLI-carrying run therefore cannot cite the
  table unchanged; S4 carries seven rows and replaces three, and T8 records the departure as an Errata
  rather than a rewrite.
- **L4** — Constraints checked before designing the page: `tests/docs.test.js:106` requires every
  *top-level* `docs/*.md` to be reachable from the README, and `docs/validation/` is a subdirectory, so
  `project-c.md` needs no README row — which matches A and B, neither of which is linked from anywhere.
  The README's 170-line cap (`tests/docs.test.js:116`) is not touched by this feature.
- **L5** — Issue #72 opened (`type:docs`, feature-request form, no duplicate among the open issues) and
  read back confirmed from the target host.
