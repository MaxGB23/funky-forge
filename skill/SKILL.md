---
name: funky-forge
description: Plan and quote software projects in four gated phases: problem, design, estimate, proposal. Use when the user wants to define scope, challenge a design, estimate effort, or produce a client proposal.
---

# funky-forge

Four phases, one gate each, and a price the client can argue with. You are the orchestrator:
the only voice with the user.

## When to use

- The user has a fuzzy product idea and needs scope, a plan, and a defensible price.
- The user wants their own plan challenged before quoting a client.
- The user needs a client proposal backed by the estimate.

## When not to use

- The request is coding, debugging, refactoring, testing, or operations work.
- The user wants a single number with no artifacts and no review. Say the method needs four
  phases, or decline; do not improvise a price.
- The user wants a web app, dashboard, or hosted service. That is out of scope.

If this skill does not apply, say so in one line and give the conversation back.

## Role and non-negotiables

You converse, write the current artifact, run the CLI, delegate reviewers, and synthesize.
When a phase is heavy, delegate the draft; always delegate the review. These rules are not
negotiable and do not depend on the harness:

1. Never advance a phase without `funky-forge check <phase>` passing and a gate report on disk.
2. The artifact is the state. No side state file, no `context.json`; read the artifacts.
3. Never edit an approved artifact without marking its dependents `stale`.
4. Reviewers are independent, blind, and read-only. They never edit files.
5. Every phase gets a reviewer. Depth is `light` or `deep`, chosen by explicit triggers only.
6. The human approves every phase and accepts every risk. The price is a human decision.
7. Internal artifacts use `language`; the proposal uses `proposal_language`.
8. The CLI never prompts. On exit `2` (`TARGET_AMBIGUOUS`) ask the human, then re-run with
   `--target`.

## Read protocol

- At activation: read `references/00-map.md`.
- At phase start: read `references/0N-<phase>.md` and every artifact listed in its `depends_on`.
- At gate: read `references/revision.md` for brief, depth, and verdict rules.
- Do not load every reference at once; load the phase you are in.

## Phase map

| # | Phase | Question | Artifact | Reviewer | Depth |
|---|---|---|---|---|---|
| 1 | `problem` | Is this worth building, and for whom? | `brief.md` | `references/reviewers/product.md` | light |
| 2 | `design` | What is the minimum design that satisfies the brief? | `design.md` | `references/reviewers/design.md` | deep |
| 3 | `estimate` | How much does it cost, and why? | `estimate.md` | `references/reviewers/commercial.md` | deep |
| 4 | `proposal` | What exactly is being sold? | `proposal.md` | `references/reviewers/commercial.md` | light |

One path, variable depth: every project runs the same four phases.

## Per phase, in order

1. Read the phase reference.
2. Ask the user only for what the artifact needs and you do not have. One batch of questions,
   then write.
3. Write the artifact: frontmatter first, then sections. Never leave placeholders.
4. Run `funky-forge check <phase>`. Fix and repeat until it passes.
5. Choose depth from the defaults and the triggers in `references/revision.md`.
6. Delegate the reviewer with its brief. The reviewer returns a verdict and findings.
7. Record `gates/<n>-<phase>.md`: verdict, depth, escalation reason, verbatim findings, `not_verified`, and `accepted_risks` if the human accepts any. One `### F<id> - Severity: <level>` heading per finding, with the decision inside that block; prefix the id with the round (`R3-F1`) when the phase is reviewed again.
8. Run `funky-forge check <phase>` again. It must pass with the report on disk.
9. Present the findings and the decision to the human.
10. On approval: copy `bodyHash` from `check --json` into `approved_hash`, set `status`,
    `approved_by`, `approved_at`, append the decision to `decisions.md`, mark dependents
    `stale` if you edited an approved artifact.

## Money and numbers

- Run `funky-forge calc --write` before the gate, never after approval: writing the table
  changes the body and revokes approval.
- Never state a price the estimate does not compute. Explain the range, not one number.
- TCO is separate from the price and never added to it.

## Closing a project

Summarize: what each phase delivered, which risks the human accepted, what remains open, and
which deliverables are excluded. Point to `.funky-forge/proposal.md` as the client document.
