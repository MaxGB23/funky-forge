# Validation — Project B (commercial SaaS)

Run of the funky-forge method by hand on a second fictional project, this time a commercial
engagement with an external client and a Spanish client-facing proposal. Independent reviewer per
phase; `check: manual` everywhere because the CLI did not exist yet.

- Scenario: booking and deposit tool for a chain of five dental clinics in Mexico City; about
  11,000 appointments a year; no-shows around 18%; external client, ~13-week wish, USD 45/h.
- Artifacts in English, proposal in Spanish (`proposal_language: es`), per the method.
- Human decisions in this run were simulated. The artifacts say so.

## Result

| Metric (RFC §17) | Result |
|---|---|
| Phases skipped | 0 |
| Gate findings that were material | 35 findings across 7 reviews; 33 material (schema, tenancy, money flow, scope, price certainty, acceptance defects), 2 presentation-only |
| Gate findings that were noise | ~6% (2 of 35) |
| User can explain the price in two minutes | Yes, after one BLOCK round: USD 27,858 fixed, platform USD 23,358 plus 5 x USD 900 onboarding, USD 75/month separate, +USD 3,931 re-quote if the payment provider fails the four-capability check |
| Artifacts consistent after changes | **No.** Finding identifiers collide across review rounds; the estimate prices fixes by IDs the design numbers differently, and the design's MH1 row still claims abuse-control scope the estimate sells as optional |
| Skill loaded correctly in two harnesses | Not verified. One harness only |
| Turns per phase (median) | Phase 1: 2. Phase 2: 4 (draft plus two fix rounds and three reviews). Phase 3: 2. Phase 4: 3 (draft, BLOCK, fix, re-review) |
| Light reviews that escalated | 2 of 2: phase 1 on risk signals (money, isolation, integration); phase 4 on price certainty. Both escalations were justified by the findings that followed |

## Phase by phase

| Phase | Verdict | Depth | Findings | Rounds |
|---|---|---|---|---|
| 1 problem | PASS_WITH_RISKS | deep (escalated from light) | 4 (2 high, 2 medium) | 1 |
| 2 design | BLOCK, PASS_WITH_RISKS, PASS_WITH_RISKS | deep | 7 (2 blockers), 8 (3 high), 8 (2 high) | 3 |
| 3 estimate | PASS_WITH_RISKS | deep | 8 (1 high, 6 medium, 1 low) | 1 |
| 4 proposal | BLOCK, PASS_WITH_RISKS | deep | 6 (2 high, 2 medium, 2 low), 8 (3 high, 4 medium, 1 low) | 2 |

## What the run proved

1. **The method works on a commercial project with real complexity signals.** Money movement,
   per-clinic isolation and an external payment provider produced the findings the brief predicted:
   two blockers in the design (slot exclusivity with two owners; three clinic tables without a
   tenant column and an anonymous booking path with no role), both fixed at the schema level.
2. **The language rule holds.** A Spanish client document with English internal artifacts needed
   exactly one round to strip the leftover bilingual headings; the reviewer caught them as a client
   would.
3. **The gate blocked money problems.** Phase 4's first round blocked a proposal that offered three
   inconsistent readings of what the client pays; the fix made the price fixed and the range
   internal, which is the right shape for a fixed-scope quote.
4. **Independent recomputation kept the arithmetic honest.** Every block, total and price was
   recomputed; the only arithmetic findings were unit labels in the sensitivity prose, not the
   table.

## What the run exposed

1. **Finding identifiers are unstable across rounds.** `gates/2-design.md` records round-3 F1/F2
   (webhook role, `held_for_staff` capture) while `design.md`'s revision history numbers its rounds
   differently, so the estimate priced IDs that a blind reader cannot resolve. Gate reports and
   revision histories need round-scoped identifiers (`R3-F1`), and `check` should validate that every
   cited ID exists. This is a schema-level gap for T12.
2. **Approved design and approved estimate can disagree on scope.** The design's MH1 row claims the
   full abuse-control set; the estimate sells most of it as an optional line. No deterministic check
   compares a component's claimed coverage with what the estimate priced. T11 needs a
   component-to-block rule that is stronger than "each component has a block".
3. **A fixed price needs termination terms.** The proposal was blocked partly because a 35% payment
   at signature coexisted with an exit after Phase 1 and no refund clause. The method has no
   template slot for termination and advance terms; phase 4's required fields should include them
   (RFC §8, phase 4).
4. **Two projects, same bottleneck: design.** Both needed 2-3 deep rounds, and both produced
   findings that only a human-readable review could catch. The CLI's value is in the deterministic
   half (hash, arithmetic, cross-artifact presence), not in replacing the reviewer.

## Artifacts

`.tmp/validation-b/.funky-forge/`: `assumptions.md`, `brief.md`, `design.md`, `estimate.md`,
`proposal.md`, `decisions.md`, `gates/1-problem.md` … `gates/4-proposal.md`. Scratch directory,
gitignored, not shipped.
