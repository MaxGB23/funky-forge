# Review: depth, brief, verdict

Every phase gets an independent review. This file defines who reviews, how deep, what the brief
says, and what the verdict must contain.

## Principles

Describe intent, scope, permissions, and expected result; never name a tool or a model. Reviewers
are read-only and never fix findings. They are blind: artifacts and cited sources only, no
conversation and no author rationale. A verdict is structured, because prose alone cannot gate a
phase. If the host has no subagents, run the same brief in a fresh session.

## Depth

| Depth | Shape | Cost |
|---|---|---|
| **Light** | One pass, product or client lens, at most 3 findings, no clarification round | One cheap reviewer call |
| **Deep** | Full brief, all lens questions, evidence per finding, at most 8 findings, one clarification round allowed | One substantial reviewer call |

Phase defaults: phase 1 light, phase 2 deep, phase 3 deep, phase 4 light.

## Escalation triggers

Any one makes the phase deep:

1. The brief states more than one core flow.
2. A risk signal is present: money movement, per-client data isolation, real-time behavior,
   external integrations, regulatory compliance, high volume.
3. The proposal introduces scope that is not present in the estimate.
4. The human asks for a deeper review.
5. A light pass returns `BLOCK` or any `blocker`/`high` finding.

For trigger 5: run the same blind brief once more at deep depth and record **only the deep
verdict** as the gate report, with `escalation_reason` quoting the light finding. One escalation
per phase per review cycle; a second deep round is a human decision.

The phase-1 deterministic gate already requires a measurable metric and a quantified or
explicitly `unknown` current cost, so those are not triggers: they fail `check`.

## Brief

```markdown
Delegate an independent review of .funky-forge/<artifact>.md.

- Scope: <artifacts> and the cited sources only. Do not include the conversation or the
  author's conclusions.
- Permissions: read-only. Do not modify files.
- Depth: light | deep.
- Signals: <none, or the risk signals that apply>.
- Lens: <the lens file for this phase>.
- Result: verdict PASS | PASS_WITH_RISKS | BLOCK; depth; findings with severity
  (blocker | high | medium | low), artifact reference, evidence, and suggested fix;
  and a list of what you could not verify.
- If no subagent is available, open a fresh session with this same brief.

The orchestrator records the verdict in gates/<n>-<phase>.md and does not advance when the
verdict is BLOCK.
```

## Result contract

```yaml
verdict: PASS | PASS_WITH_RISKS | BLOCK
depth: light | deep
escalation_reason: null | "..."
findings:
  - id: F1
    severity: blocker | high | medium | low
    artifact: design.md
    section: "Data model"
    evidence: "..."
    suggested_fix: "..."
not_verified:
  - "..."
```

## Verdicts

| Verdict | Meaning | Advance |
|---|---|---|
| `PASS` | No material findings | Yes, after human approval |
| `PASS_WITH_RISKS` | Findings exist and are accepted | Yes, only if every `blocker`/`high` finding has an `accepted_risks` entry |
| `BLOCK` | A finding must be fixed | No |

## Gate report

`.funky-forge/gates/<n>-<phase>.md`, with `1-problem`, `2-design`, `3-estimate`, `4-proposal`:

```yaml
---
phase: design
verdict: PASS
depth: deep
escalation_reason: null
reviewer: design
date: 2026-10-22
findings: 1
not_verified: []
accepted_risks: []
---
```

Findings are the reviewer's verbatim output. Each one starts with a heading `check` can parse:

```markdown
### F1 - Severity: high
- Artifact: design.md, section "Data model"
- Evidence: ...
- Suggested fix: ...
- Decision: accepted by <human> on 2026-10-22 / fixed in a later revision
```

An accepted risk adds an entry to `accepted_risks`, and a paragraph to `decisions.md`:

```yaml
accepted_risks:
  - finding: F1
    severity: high
    reason: "..."
    accepted_by: "<human>"
    date: 2026-10-22
```

## Fallback

| Capability missing | Fallback |
|---|---|
| Subagents | Fresh session with the same brief |
| Skills | Read `SKILL.md` as a normal document |
| Shell | Manual checks; no `check` or `calc`; state `check: manual` in the report |
| Write access | Paste the artifact and let the human save it |
| Web access | No rate research: `hourly_rate` stays `unknown`, the estimate cannot be approved |

