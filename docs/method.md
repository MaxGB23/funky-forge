# The method

Four phases, one gate each. Every phase answers one question, produces one artifact, and cannot
advance until an independent reviewer and a human have had their say.

| # | Phase | Question | Artifact | Reviewer | Default depth |
|---|---|---|---|---|---|
| 1 | `problem` | Is this worth building, and for whom? | `brief.md` | `reviewers/product.md` | light |
| 2 | `design` | What is the minimum design that satisfies the brief? | `design.md` | `reviewers/design.md` | deep |
| 3 | `estimate` | How much does it cost, and why? | `estimate.md` | `reviewers/commercial.md` | deep |
| 4 | `proposal` | What exactly is being sold? | `proposal.md` | `reviewers/commercial.md` | light |

One path for every project; only the depth varies.

## The loop, per phase

1. Read the phase reference and every artifact this phase depends on.
2. Ask the human one batch of questions: only what the artifact needs and you do not have.
3. Write the artifact: frontmatter first, then the required sections. No placeholders.
4. Run `funky-forge check <phase>`. Fix and repeat until it passes.
5. Choose depth from the defaults and the escalation triggers below.
6. Delegate a reviewer with the phase brief: independent, read-only, and blind to the conversation.
7. Record `gates/<n>-<phase>.md`: verdict, depth, escalation reason, verbatim findings, what could
   not be verified, and the risks the human accepted.
8. Run `check <phase>` again; it must pass with the report on disk.
9. Present the findings and the decision to the human.
10. On approval: copy `bodyHash` from `check --json` into `approved_hash`, set `status`,
    `approved_by`, `approved_at`, append the decision to `decisions.md`, and mark dependents `stale`
    if you edited an approved artifact.

Rules that are not negotiable:

- No phase advances without `check` passing and a gate report on disk.
- Reviewers are independent, blind, and read-only. They never edit files.
- Every phase gets a reviewer; depth is `light` or `deep` by explicit trigger only.
- The human approves every phase and accepts every risk. The price is a human decision.
- Internal artifacts use `language`; the proposal uses `proposal_language`.

## Depth

| Depth | Shape | Cost |
|---|---|---|
| Light | One pass, one lens, at most 3 findings, no clarification round | One cheap reviewer call |
| Deep | Full brief, all lens questions, evidence per finding, at most 8 findings, one clarification round allowed | One substantial reviewer call |

Any one of these makes the phase deep:

1. The brief states more than one core flow.
2. A risk signal is present: money movement, per-client data isolation, real-time behavior, external
   integrations, regulatory compliance, or high volume.
3. The proposal introduces scope that is absent from the estimate.
4. The human asks for a deeper review.
5. A light pass returns `BLOCK`, or any `blocker`/`high` finding.

For trigger 5, run the same blind brief once more at deep depth and record only the deep verdict,
with `escalation_reason` quoting the light finding. One escalation per phase per review cycle; a
second deep round is a human decision.

## Verdicts

| Verdict | Meaning | Advance? |
|---|---|---|
| `PASS` | No findings worth blocking on | Yes, after approval |
| `PASS_WITH_RISKS` | Findings exist and are accepted | Only if every `blocker`/`high` has an `accepted_risks` entry |
| `BLOCK` | At least one finding must be fixed | No. `check` fails with `BLOCK_VERDICT` |

`PASS_WITH_RISKS` is not a softer `PASS`: it is a written record that a specific risk was accepted
by a named person, on a date, with a reason.

## Convergence

A phase cannot be reviewed forever. After two rounds that end in `BLOCK` on the same phase, the next
decision belongs to the human: accept the remaining findings as risks, or change the brief so the
phase no longer has to solve that problem. A third round is allowed only when the second round's
findings were fixed and the new ones are different in kind; never to re-word the same objection.

## Approval and staleness

`approved_hash` is the SHA-256 of the normalized body (format: [artifacts.md](artifacts.md)). It
turns three silent failures into loud ones:

- editing an approved artifact → `APPROVED_CONTENT_CHANGED`;
- approving with a dependency still in `draft` → `DEPENDENCY_NOT_APPROVED`;
- advancing an artifact marked `stale` → `STALE_ARTIFACT`.

Staleness propagation is an approval decision, so the orchestrator performs it. If it forgets, the
hash catches the mistake at the next check.

## Languages

Three different things, and only two are configuration:

| What | Set by | Default |
|---|---|---|
| The conversation with the human | whatever language the human writes in | — |
| Internal artifacts: brief, design, estimate, decisions, gate reports | `language` (`init --language`) | `en` |
| The client document, `proposal.md` | `proposal_language` (`init --proposal-language`) | the `language` value |

## Review quality and models

The method never names a model or a provider. The orchestrator and each reviewer run on whatever the
harness is configured with, so that configuration decides how good a run gets — two runs of the same
project on different models can reach different verdicts.

| Role | Where quality pays |
|---|---|
| Orchestrator | Coherence across four documents that must agree with each other |
| Reviewer | The independent judgement nothing else provides: scope, risk, whether the price makes sense |

If you can only afford one strong reasoning model, put it on the reviewer: a weak orchestrator fails
loudly in `check`, a weak reviewer fails silently by approving work that should not pass. Then
prefer the `design` and `estimate` reviews, where reversibility and money live.

Keep the reviewer in a separate session even when both roles use the same model: shared context is
exactly what makes a reviewer agree with its author.

## How long a run takes

Four gates, and each one ends with a human decision. A small project with light reviews takes one or
two rounds per phase; a deep phase can take two or three, and design is usually the long one.
Accepting a risk closes a round; asking for another revision opens one. The CLI is instant; the
agent's time dominates.

## Degraded modes

| Capability missing | What happens |
|---|---|
| Subagents | The reviewer becomes a fresh session given the same brief |
| Shell | No `check` or `calc`; the gate report must say `check: manual` |
| Write access | The human pastes the artifact and saves it |
| Web access | No rate research: `hourly_rate` stays `unknown` and the estimate cannot be approved |
