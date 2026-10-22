# Validation — Project A (internal CRUD)

Run of the funky-forge method by hand on a fictional project, with an independent reviewer per
phase. The CLI did not exist during this run: every deterministic check was executed manually and
recorded as `check: manual` in the gate report.

- Scenario: internal equipment and software-license checkout for a 40-person studio in Mexico City.
- Developer: one in-house generalist, about three weeks planned.
- Rate: USD 35/h user-provided; currency USD.
- Human decisions in this run were simulated. The artifacts say so.

## Result

| Metric (RFC §17) | Result |
|---|---|
| Phases skipped | 0 |
| Gate findings that were material | 41 findings across 6 reviews; 39 were material (schema, scope, arithmetic or acceptance defects), 2 were presentation-only |
| Gate findings that were noise | ~5% (2 of 41), well under half |
| User can explain the price in two minutes | Yes: 153.7 expected hours at USD 35/h, 20% contingency and 30% margin, USD 5,569-12,449 with USD 8,390 expected, TCO USD 30/month separate, break-even at 239.7 maintainer hours a year |
| Artifacts consistent after changes | **No.** The proposal promises the maintainer audit list while the estimate excludes a reporting surface; the audit-list gap survived because no deterministic check compares proposal deliverables against priced scope |
| Skill loaded correctly in two harnesses | Not verified. This run used one harness only |
| Turns per phase (median) | Phase 1: 2 (draft, review). Phase 2: 4 (draft, review, fix, re-review). Phase 3: 2. Phase 4: 2 |
| Light reviews that escalated | 2 of 2 light reviews escalated to deep: phase 1 on a high finding, phase 4 on scope not in the estimate. The triggers worked |

## Phase by phase

| Phase | Verdict | Depth | Findings | Rounds |
|---|---|---|---|---|
| 1 problem | PASS_WITH_RISKS | deep (escalated from light) | 5 (1 high, 3 medium, 1 low) | 1 |
| 2 design | BLOCK, BLOCK, PASS_WITH_RISKS | deep | 8, 8, 8 (1 high in the final round) | 3 |
| 3 estimate | PASS_WITH_RISKS | deep | 7 (1 high, 4 medium, 2 low) | 1 |
| 4 proposal | PASS_WITH_RISKS | deep (escalated from light) | 5 (1 high, 2 medium, 2 low) | 1 |

Every high finding was either fixed (design, rounds 1-2) or accepted with a recorded risk and a
named obligation for the next phase (phases 1, 3, 4). No `BLOCK` was ignored.

## What the run proved

1. **The gates catch real defects.** Round 1 of the design review found a request entity with an
   unreachable state, a permission rule contradicted two pages later, and free-text program
   identity in a tool whose purpose is per-program seat counts. None of that is stylistic.
2. **Estimation arithmetic survives independent recomputation.** The commercial reviewer
   recomputed every block, total and price and found no mismatch: 153.67 h, USD 8,390 expected,
   USD 5,569-12,449 range.
3. **Escalation triggers are reachable in practice.** Both light reviews escalated, one on a high
   finding and one on out-of-estimate scope.
4. **Accepted risks carry obligations.** Phase 1's accepted F1 became a design section; phase 3's
   accepted F1 became a proposal deliverable.

## What the run exposed

1. **A deliverable can be promised and unpriced.** The proposal/estimate contradiction was found
   by a reviewer at phase 4, not by any deterministic check. `check` needs a cross-artifact rule
   between proposal deliverables and estimate blocks (task T11).
2. **A design review loop can take three rounds.** Rounds are cheap in tokens and expensive in
   attention; the method needs an explicit convergence rule: after two `BLOCK` rounds, the phase
   owner either accepts the remaining findings as risks or the project stops.
3. **Approved artifacts can contain stale sentences.** The design's RequestInbox line says "three
   named transitions" while four are defined, and the estimate priced the four. Only `approved_hash`
   and a re-gate would have caught it; a human reader caught it instead.
4. **A paper trail without the CLI is expensive but possible.** The normalization rule for
   `approved_hash` was applied by hand with a short script; every artifact needed an explicit hash
   step. This is exactly the work the CLI must remove.

## Artifacts

`.tmp/validation-a/.funky-forge/`: `assumptions.md`, `brief.md`, `design.md`, `estimate.md`,
`proposal.md`, `decisions.md`, `gates/1-problem.md` … `gates/4-proposal.md`. Scratch directory,
gitignored, not shipped.
