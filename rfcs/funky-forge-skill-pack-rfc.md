# RFC: funky-forge as a portable skill pack

> **STATUS: PROPOSED — revision 3. Design questions resolved; implementation not started.**
>
> **Identity:** `funky-forge` is the single name for the public repository, the npm package,
> the executable, and the registered skill. No version suffix (`v2`, `v5`) appears in any of
> those names. The pack ships as an independent package from that repository; it does not live
> inside `funky-cli` and does not depend on it.
>
> **Artifacts:** project artifacts live in `.funky-forge/` at the project root.
>
> **Supersedes:** the pipeline assumptions in `docs/funky-forge/` of the funky-ai repository and
> the phase model in `openspec/rfcs/funky-scope-propuesta/`. Where they conflict, this RFC wins.
>
> **Scope:** the planning and quoting product known as **funky-forge**. It does not change
> the agentic framework (funky-ai), its runtime, or its memory provider. Existing commands of
> `funky-cli` are deprecated by funky-ai in its own repository; this package ships no alias
> for them (section 16).
>
> **Language:** the method, skill names, file names, CLI output, and templates are English.
> Project artifacts use `language` from `.funky-forge/assumptions.md` (default `en`). The
> client-facing proposal uses `proposal_language` (default: same as `language`).
>
> **Non-goals:** a new harness, a web application, a hosted service, or a model-specific runtime.

---

## Table of contents

1. [Context](#1-context)
2. [Problems with the current design](#2-problems-with-the-current-design)
3. [Goals and non-goals](#3-goals-and-non-goals)
4. [Design principles](#4-design-principles)
5. [Target architecture](#5-target-architecture)
6. [Portability and installation](#6-portability-and-installation)
7. [Method packaging](#7-method-packaging)
8. [Phase contracts](#8-phase-contracts)
9. [Artifact schemas](#9-artifact-schemas)
10. [Estimation model](#10-estimation-model)
11. [Assumptions and variability](#11-assumptions-and-variability)
12. [Delegation and review depth](#12-delegation-and-review-depth)
13. [CLI contract](#13-cli-contract)
14. [Gate protocol](#14-gate-protocol)
15. [Worked example](#15-worked-example)
16. [Migration from current funky-forge](#16-migration-from-current-funky-forge)
17. [Validation plan before implementation](#17-validation-plan-before-implementation)
18. [Implementation plan](#18-implementation-plan)
19. [Risks and resolved design questions](#19-risks-and-resolved-design-questions)
20. [Acceptance criteria](#20-acceptance-criteria)
21. [Appendix A — Decision log](#appendix-a--decision-log)
22. [Appendix B — Evidence of current defects](#appendix-b--evidence-of-current-defects)
23. [Appendix C — Templates and examples](#appendix-c--templates-and-examples)

---

## 1. Context

funky-forge turns a fuzzy software idea into a scoped plan and a defensible price. Its intended
user is a junior developer who does not yet know how to quote a client.

The current implementation is a CLI that generates planning documents, plus prompts that the
human copies into a chat with an AI agent. The advertised flow is:

```
funky init -> funky assess -> funky estimate -> funky pipeline
```

The real flow is different: the CLI copies templates, records timestamps, and stops. The
thinking happens in a chat that the CLI cannot see, verify, or resume. The tool is a document
dispenser with a state file, not a planning process.

The original intent was sound: fill the canvas for the current phase, then hand a prompt to an
AI agent so it can challenge the work before moving to the next phase. That loop is the
product. The mistake was implementing the loop in a CLI.

This RFC proposes a smaller product:

- a **portable skill pack** that defines the method, served by any agent harness;
- a **thin deterministic CLI** that handles schemas, arithmetic, and validation;
- a **human** who makes every consequential decision.

It ships as a single package named `funky-forge`: repository, npm package, executable, and skill
share that name, with no dependency on `funky-cli` and no version suffix (section 19, questions
7 and 8).

---

## 2. Problems with the current design

### 2.1 The state lies

`funky pipeline all` marks `assess` as `completed` as soon as `assess-prompt.md` is copied.
No AI session has happened. `pipeline estimate` only checks that `assess.runAt` exists, so the
full pipeline can "complete" without a single architectural decision being discussed.

### 2.2 The pipeline rejects its own output

`estimate` writes artifacts with `kind: "guide"`, but the context validator only accepts
`generated` and `living` (`funky-ai/funky-cli/src/utils/context.js`). After a successful
`funky pipeline all`, every subsequent `pipeline status`, `pipeline estimate`, or
`estimate --context` fails with:

```
context.json does not match schema v2
```

### 2.3 Flags have no effect, or produce invalid input

- `funky estimate --brief [path]` is a no-op: `buildPricingGuide()` never receives the brief;
  the generated guide is byte-identical with or without the flag.
- `--pricing-team` embeds a table full of `$0.00` and the guide instructs the AI to use only
  the real ranges from that section. There is no validation, so a quote can silently be zero.
- There is no completeness gate: the CLI warns about unfilled canvas sections and continues.

### 2.4 Complexity went to the wrong place

The subsystem has roughly 1,850 lines of code, 815 lines of prompt templates, 3,725 lines of
tests, and 1,966 lines of documentation. Most of the code handles file lifecycle semantics:
overwrite or preserve, interactive or headless, marker drift, legacy migration. Almost none of
it improves the estimate.

### 2.5 Documentation drift is structural

The same concept is restated in prompts, guides, specs, RFCs, smoke tests, and release notes.
The RFC that documented this failure mode still has a live example: the NFR paragraph copied
from the assess prompt into the estimate prompt contradicts the estimate phase boundary.

### 2.6 The tool requires senior knowledge from a junior user

The flow asks the user to choose a stack, an architecture pattern, a database, an auth
provider, a deployment target, and then answer pricing questions about region, company size,
CapEx/OpEx, ROI, team seniority, and contingency percentages. A junior cannot answer most of
these. The tool was supposed to compensate for that gap, not depend on it.

### 2.7 The second opinion is optional and unstructured

The prompts suggest that the agent challenge the work, but no reviewer returns a verdict, no
gate blocks progress, and no evidence is recorded. An opinion without a contract is an opinion
that can be ignored.

---

## 3. Goals and non-goals

### Goals

1. Turn a fuzzy idea into four artifacts: problem, design, estimate, proposal.
2. Make every phase end with a gate: deterministic checks plus an independent reviewer.
3. Scale review depth with risk, not with project size or an arbitrary threshold.
4. Keep the human as the only decision maker.
5. Run on any agent harness with the same method: Pi, Claude Code, OpenCode, Codex, or a
   harness such as gentle-ai.
6. Keep the product maintainable by one person: few files, no duplicated method, no state
   file, no web application.
7. Make the price defensible through explicit assumptions and visible arithmetic, not
   hardcoded rates or invented percentages.
8. Ship as an independent package: repository, npm package, and executable all named
   `funky-forge`, installable with one command and free of any `funky-cli` dependency.

### Non-goals

- A new agent harness or runtime.
- A web UI with its own data model.
- An MCP server in the first version.
- Automatic generation of a stack from a brief without human review.
- Automatic sending of proposals or client communication.
- Replacing the agent's own delegation, memory, or tracking mechanisms.

---

## 4. Design principles

### 4.1 Instructions live with the tool; decisions live with the project

The method (phases, gates, reviewer briefs) is versioned with the tool. The project contains
only artifacts and assumptions. No prompt is copied into a project, so no prompt can drift
per project.

### 4.2 If a rule cannot be violated, do not put it in a prompt

Hard rules are executable: `funky-forge check` fails with a clear message. Prompts describe
intent and judgment. This is what makes the method survive long conversations and compaction.

### 4.3 One registered skill, several references

A skill is a registration unit. Registering each phase as its own skill multiplies activation
points and is not portable. The method uses one `SKILL.md` plus reference files read on demand.

### 4.4 One path, variable depth

Every project goes through the same four phases. A small project moves quickly; a large one
spends more time at the gates. There are no simple/complete modes, no per-scenario branches,
and no feature flags that change the documents.

Review depth is the variable, not the process: every phase has a reviewer, and the reviewer is
light or deep depending on explicit risk signals (section 12.3).

### 4.5 Capability-agnostic delegation

The method never names a tool, a model, or a harness API. It describes the intent, the scope,
the permissions, and the expected result. The host decides how to delegate. If the host has no
subagents, a fresh session performs the review.

### 4.6 The artifact is the state

Frontmatter carries phase, status, dependencies, and an approval hash. There is no
`context.json`. To know where a project is, read the artifacts, not a separate state store.

---

## 5. Target architecture

Three responsibilities, never mixed:

| Layer | Responsibility | Why |
|---|---|---|
| **Orchestrator (agent)** | Talk to the user, ask, draft, delegate, synthesize, decide next step | Language and judgment |
| **CLI (`funky-forge`)** | Schema, arithmetic, cross-artifact consistency, exit codes | Determinism |
| **Human** | Approve phases, accept risks, decide price and scope | Accountability |

```
                +-----------------------------------------+
                |  Orchestrator - only voice with user    |
                |  - keeps the conversation               |
                |  - writes the current artifact          |
                |  - runs the CLI at each gate            |
                |  - delegates and synthesizes            |
                +-------------------+---------------------+
                                    |
                     scoped brief   |   (by reference, not by paraphrase)
        +---------------------------+---------------------------+
        |                           |                           |
        v                           v                           v
  Phase worker              Reviewer A                    Reviewer B
  (drafts artifact)         (product / design)            (commercial / client)
        |                           |                           |
        v                           v                           v
  brief.md / design.md      verdict + findings            verdict + findings
  estimate.md / proposal.md
                                    |
                                    v
                        GATE: funky-forge check + reports
                                    |
                                    v
                          Human decides to advance
```

Rules that keep this from degrading:

- The orchestrator does not do the deep work itself. It converses, delegates, validates, and
  synthesizes. If it writes everything, its context fills and it loses the thread.
- Reviewers are blind: they see the artifacts, the dependencies, and the sources, not the
  conversation or the author's rationale.
- Reviewers do not edit. The orchestrator applies changes; the human approves.
- No gate passes silently. A `BLOCK` is fixed or recorded as an accepted risk.

---

## 6. Portability and installation

### 6.1 Harness matrix

| Harness | Skill location | Reviewer mechanism | Notes |
|---|---|---|---|
| Pi | `.agents/skills/funky-forge/SKILL.md` | native subagents | reads the shared standard |
| OpenCode | `.agents/skills/funky-forge/SKILL.md` | markdown agents (`mode: subagent`) | shared standard preferred over `.opencode/skills` |
| Claude Code | `.claude/skills/funky-forge/SKILL.md` | subagents | the only harness with a specific path |
| Codex CLI | `.agents/skills/funky-forge/SKILL.md` | native subagents | shared standard |
| gentle-ai (host) | host skill registry | host subagents | funky-forge is a domain pack, not a second orchestrator |

The method assumes only three capabilities: read files, write files, run a shell command.
Subagents are optional. No custom tools and no MCP are required.

### 6.2 Installation behavior

`funky-forge install` installs the method; `funky-forge init` creates project artifacts. They
are separate operations.

- **Flag first:** `--target <agents|claude>`, `--dry-run`, `--with-pointer`, `--force`, `--json`.
- **Auto-detection when no flag is given.** A *shared marker* is an existing `.agents/skills/`
  directory, or an existing `.opencode/` or `.codex/` directory. A *Claude marker* is an
  existing `.claude/` directory.
  - Claude marker only -> Claude path.
  - shared marker only -> shared path.
  - both -> **no question is asked.** The command exits `2` with `TARGET_AMBIGUOUS`, prints
    both detections, and prints the exact `--target` value to use. The agent that invoked it
    resolves the choice with the human and re-runs with the flag.
  - nothing detected -> shared path with a printed notice.
- **Never edit user configuration.** No `settings.json`, no hooks, no existing agent files.
  The command writes new files, prints the manifest, and is idempotent. The single exception is
  `--with-pointer`, which appends one marked line to `AGENTS.md` (shared target) or
  `CLAUDE.md` (Claude target), and refuses to add a second one.
- **Modified files are a fork.** If an installed file differs from the shipped one, refuse to
  overwrite unless `--force`; `funky-forge install --check` reports divergence.
- **One active target per project.** If the user works with two harnesses, run the install
  twice. Do not attempt to keep copies in sync.

Example:

```
$ funky-forge install
Detected: Claude Code (.claude/), shared standard (.agents/)
TARGET_AMBIGUOUS: both harness markers exist (exit 2).
  Re-run with one of:
    funky-forge install --target agents
    funky-forge install --target claude

$ funky-forge install --target agents
Installed .agents/skills/funky-forge:
  SKILL.md
  references/00-map.md
  references/01-problem.md ... 04-proposal.md
  references/reviewers/product.md design.md commercial.md
  references/schemas/artifacts.md estimation.md
  templates/assumptions.md brief.md design.md estimate.md proposal.md decisions.md

Unmodified: AGENTS.md, CLAUDE.md, and all existing files.
```

### 6.3 AGENTS.md policy

Do not touch `AGENTS.md` by default. It belongs to the user and applies to every task, not just
to this tool. The method lives in the skill and is loaded on demand.

The only optional concession is a single opt-in pointer, written only with `--with-pointer`,
into `AGENTS.md` for a shared target or `CLAUDE.md` for the Claude target:

```
<!-- funky-forge -->
For project planning or quoting, load the `funky-forge` skill.
```

Without the flag, no user-owned file is opened for writing. The command refuses to add the
pointer twice, and this is the only write outside the installed skill directory.

### 6.4 Activation

No slash commands are authored. Activation comes from the skill description and natural
language ("plan this project", "quote this project", "use funky-forge"). If a host derives a
slash command from a registered skill, that is a host feature, not a dependency of the method.

The skill starts with an activation check: if the user is not planning or quoting a project,
the skill withdraws and does not take over the conversation.

---

## 7. Method packaging

### 7.1 Repository and file tree

The pack ships from its own repository and npm package, both named `funky-forge`. Nothing in
this tree depends on `funky-cli`.

```
funky-forge/                    # repository root == npm package funky-forge
  package.json                  # name: "funky-forge"; bin: { "funky-forge": "./bin/funky-forge.js" }
  bin/funky-forge.js            # executable entry point
  src/                          # deterministic CLI: install, init, check, calc
  skill/                        # the method pack; copied verbatim by `install`
    SKILL.md                    # the only registered skill (~120 lines)
    references/
      00-map.md                 # phases, dependencies, statuses
      01-problem.md             # phase contract, gate, reviewer to use
      02-design.md
      03-estimate.md
      04-proposal.md
      revision.md               # verdict contract, review depth, delegation protocol
      reviewers/
        product.md              # phase 1 lens
        design.md               # phase 2 lens
        commercial.md           # phases 3 and 4 lens
      schemas/
        artifacts.md            # frontmatter, statuses, staleness, approval hash
        estimation.md           # blocks, three-point formula, calc output
    templates/
      assumptions.md
      brief.md
      design.md
      estimate.md
      proposal.md
      decisions.md
  tests/
  docs/                         # repository documentation, not user artifacts
  rfcs/                         # design records, including this RFC
```

Installed copy:

```
<target>/skills/funky-forge/
  SKILL.md
  references/...
  templates/...
```

### 7.2 SKILL.md outline

```markdown
---
name: funky-forge
description: 'Plan and quote software projects in four gated phases: problem, design,
  estimate, proposal. Use when the user wants to define scope, challenge a design,
  estimate effort, or produce a client proposal.'
---

# funky-forge

## When to use
## When not to use
## Role and non-negotiables
## Read protocol
## Phase map
## Delegation and review depth
## Degradation
## Closing
```

Non-negotiables (the only rules that belong in the always-loaded layer):

1. Never advance a phase without `funky-forge check <phase>` passing and a gate report.
2. The artifact is the state; do not keep a separate state file.
3. Never edit an approved artifact without marking dependents `stale`.
4. Reviewers are independent and read-only.
5. Every phase has a reviewer; depth is light or deep by explicit triggers.
6. The human approves every phase and every accepted risk.
7. Write internal artifacts in `language` and the proposal in `proposal_language`.

### 7.3 Read protocol

1. **Activation:** read `SKILL.md` and `references/00-map.md`.
2. **Phase start:** read `references/0N-<phase>.md` and the artifacts listed in `depends_on`.
3. **Gate:** run `funky-forge check <phase>`; if it fails, fix and repeat. Then delegate the
   reviewer with the matching brief at the required depth. Record the verdict in
   `.funky-forge/gates/<n>-<phase>.md`.
4. **Advance:** run `check` again; if it passes and the human approves, copy the `bodyHash`
   from `check --json` into `approved_hash`, set `status: approved`, and append the decision to
   `decisions.md`.
5. **Close:** summarize what changed, what was accepted, and what remains open.

### 7.4 Size guardrails

- `SKILL.md`: target ~120 lines, hard cap 150.
- Each phase reference: at most ~120 lines.
- Each reviewer brief: at most ~80 lines.
- The method pack: at most ~12 files, excluding templates.
- If a limit is exceeded, consolidate instead of adding a new file.

---

## 8. Phase contracts

Every phase has a deterministic gate and an independent reviewer. The reviewer's depth is
`light` or `deep` according to section 12.3. The process is identical for every project; only
the depth changes.

### Phase 1 — Problem

| Item | Definition |
|---|---|
| Question | Is this worth building, and for whom? |
| Inputs | User conversation, client context, `assumptions.md` |
| Output | `.funky-forge/brief.md` |
| Required fields | One-line summary; problem today; users and volume; core flow; must-haves; out of scope; success metric; deadline and constraints; current cost of the problem |
| Deterministic gate | All fields non-empty; at least one measurable metric; at least one out-of-scope item; current cost quantified or explicitly marked `unknown` with a note |
| Adversarial gate | `reviewers/product.md`, **light by default**. Escalate to deep on any trigger from 12.3. Lens: is the problem worth solving? is the metric measurable? is the MVP one flow? which assumption, if false, kills the project? |
| Advance | Human approves `brief.status: approved` |
| Re-entry | Any change to the brief marks design, estimate, and proposal `stale` |

### Phase 2 — Design

| Item | Definition |
|---|---|
| Question | What is the minimum design that satisfies the brief? |
| Inputs | `brief.md`, `assumptions.md` (stack constraints, team, hosting preferences) |
| Output | `.funky-forge/design.md` |
| Required fields | Architecture at a glance; components and responsibilities; data model and retention; auth and permissions; integrations; NFR table (applies / not applicable with reason) for performance, availability, security, and scale; risks and mitigations; rejected alternatives; stack decision with rationale or explicit deferral |
| Deterministic gate | Every brief must-have maps to a component; every component maps to a must-have; NFR table complete; no `TBD`; rejected alternatives present |
| Adversarial gate | `reviewers/design.md`, **deep by default**. Lens: what can be cut? what breaks at 10x? what is the simplest alternative? where is the hidden coupling? is data isolation correct? |
| Advance | Human approves `design.status: approved` |
| Re-entry | Any change to the design marks estimate and proposal `stale` |

### Phase 3 — Estimate

| Item | Definition |
|---|---|
| Question | How much does it cost, and why? |
| Inputs | `brief.md`, `design.md`, `assumptions.md` (rates, currency, region, team) |
| Output | `.funky-forge/estimate.md` |
| Required fields | Work blocks with optimistic/likely/pessimistic hours and rationale; rate basis with source and date; contingency percentage and reason; margin percentage and client-size rationale; computed range; TCO monthly with its components; assumptions and exclusions; sensitivity; ROI sanity check |
| Deterministic gate | Every design component has a block; arithmetic recomputed by `calc`; rate confirmed and greater than zero; contingency inside 15-25%, or outside with a non-empty `contingency_reason`; margin present with a non-empty `margin_reason`; TCO present and separate from the price; no placeholders; optimistic <= likely <= pessimistic |
| Adversarial gate | `reviewers/commercial.md`, **deep by default**. Lens: would the client pay? what is the cheapest credible version? what will they ask for later? is the range defensible? is TCO hidden? |
| Advance | Human approves `estimate.status: approved` |
| Re-entry | Any change to the estimate marks proposal `stale` |

### Phase 4 — Proposal

| Item | Definition |
|---|---|
| Question | What exactly is being sold? |
| Inputs | `brief.md`, `design.md`, `estimate.md`, `decisions.md` |
| Output | `.funky-forge/proposal.md` (client-facing, written in `proposal_language`) |
| Required fields | Deliverables by phase; acceptance criteria per deliverable; exclusions; assumptions and client responsibilities; price range and payment milestones; timeline; TCO and who pays providers; validity date |
| Deterministic gate | Every estimate block appears in a phase; every brief must-have is included or explicitly excluded; price matches the estimate; TCO separate; no `TBD`; every component in the design's `## Rejected alternatives` list is absent from the proposal's deliverables |
| Adversarial gate | `reviewers/commercial.md` in client mode, **light by default**. Escalate to deep on any trigger from 12.3, or if the proposal introduces scope not present in the estimate. Lens: would I sign this? is scope unambiguous? what is missing? are exclusions clear? is any internal jargon left in the client text? |
| Advance | Human approves `proposal.status: approved`; sending is out of scope |
| Re-entry | Any change to the proposal requires a new gate before sending |

---

## 9. Artifact schemas

### 9.1 Common frontmatter

```yaml
---
schema: 1
phase: problem            # problem | design | estimate | proposal
status: draft             # draft | in_review | approved | stale | rejected
depends_on: []            # see the dependency matrix
language: en
proposal_language: en     # proposal only; defaults to language
approved_by: null
approved_at: null
approved_hash: null       # hash of the normalized body at approval
method_version: 1
---
```

Dependency matrix:

| Artifact | `depends_on` |
|---|---|
| `brief.md` | `[]` |
| `design.md` | `[problem]` |
| `estimate.md` | `[problem, design]` |
| `proposal.md` | `[problem, design, estimate]` |

Phase names are stable identifiers; file names and gate report names are fixed:

| Phase | Artifact | Gate report |
|---|---|---|
| `problem` | `.funky-forge/brief.md` | `.funky-forge/gates/1-problem.md` |
| `design` | `.funky-forge/design.md` | `.funky-forge/gates/2-design.md` |
| `estimate` | `.funky-forge/estimate.md` | `.funky-forge/gates/3-estimate.md` |
| `proposal` | `.funky-forge/proposal.md` | `.funky-forge/gates/4-proposal.md` |

`depends_on` lists phase names, never file names. The CLI resolves the mapping from this
table; it is not configurable.

### 9.2 Status rules

1. An artifact can be `approved` only if every dependency is `approved`.
2. When an approved artifact changes, the orchestrator marks every dependent `stale`.
3. `check` refuses to approve a `stale` artifact.
4. A `stale` artifact keeps its content; it only loses approval. Re-approval requires a new
   deterministic check and a new gate report.
5. `rejected` means the human declined the phase; it cannot advance until rewritten.
6. At approval, `approved_hash` stores the SHA-256 of the normalized body, lowercase hex, with
   the prefix `sha256:`. *Normalized body* is defined so that the orchestrator and `check` reach
   the same bytes:
   - the YAML frontmatter block is removed, including its delimiters;
   - line endings are LF, and a trailing CR is stripped;
   - trailing spaces and tabs are stripped from each line;
   - leading and trailing blank lines are trimmed;
   - exactly one trailing LF is kept;
   - `calc` markers and their content belong to the body; they are not excluded.
   The orchestrator never computes the hash by hand: `funky-forge check --json` returns
   `bodyHash` for the current body, the orchestrator copies it into `approved_hash`, and runs
   `check` again. A mismatch while `status: approved` fails with `APPROVED_CONTENT_CHANGED`; the
   artifact and its dependents must be re-reviewed. This catches an edit that the orchestrator
   forgot to propagate.
7. `calc --write` on an approved estimate changes the body and therefore revokes approval:
   `check` fails with `APPROVED_CONTENT_CHANGED` until the estimate is re-gated. The skill orders
   `calc --write` before the gate, never after approval.

### 9.3 Gate report

`.funky-forge/gates/<n>-<phase>.md`, where `<n>-<phase>` is one of `1-problem`, `2-design`,
`3-estimate`, `4-proposal` (section 9.1). `check` derives the path from the phase; it never
scans the directory and never guesses.

```yaml
---
phase: design
verdict: PASS             # PASS | PASS_WITH_RISKS | BLOCK
depth: deep               # light | deep
escalation_reason: null   # null or a trigger from 12.3
reviewer: design
date: 2026-10-22
findings: 2
not_verified: []          # verbatim from the reviewer's result contract
accepted_risks: []        # required for high/blocker findings under PASS_WITH_RISKS
---
```

`accepted_risks` carries one entry per finding the human accepted:

```yaml
accepted_risks:
  - finding: F1
    severity: high
    reason: "..."
    accepted_by: "<human>"
    date: 2026-10-22
```

Followed by the findings list. The findings are the reviewer's verbatim output, not a summary.
Each finding starts with a heading in a fixed format so `check` can parse it:

```markdown
### F1 - Severity: high
- Artifact: design.md, section "Data model"
- Evidence: ...
- Suggested fix: ...
- Decision: accepted by <human> on 2026-10-22 / fixed in a later revision
```

The heading format `### F<id> - Severity: <blocker|high|medium|low>` is mandatory. A malformed
heading is `GATE_REPORT_MALFORMED`, an error, not a silently ignored finding.

### 9.4 Decisions log

`.funky-forge/decisions.md` is append-only:

```markdown
## 2026-10-22 - Phase 2 - Data isolation
- Decision: row-level security in a shared schema
- Rationale: ...
- Alternatives considered: schema per tenant, database per tenant
- Accepted risks: ...
- Approved by: <human>
```

This log is the human narrative. The machine-readable record of an accepted risk is
`accepted_risks` in the gate report (section 9.3); `check` reads the gate report and never
parses the prose log.

---

## 10. Estimation model

### 10.1 Work blocks

The estimate is built from blocks, not from a global percentage:

| Block | Covers |
|---|---|
| Discovery | Requirements, spikes, validation |
| Data and backend | Schema, API, business rules |
| UI | Screens, components, states |
| Integrations | Third-party APIs, webhooks, imports |
| QA and deploy | Tests, CI, release, monitoring setup |
| Project management | Planning, communication, review |

Each block carries three points: optimistic (O), likely (M), pessimistic (P).

### 10.2 Formula

```
expected_block = (O + 4M + P) / 6
expected_total = sum(expected_block)
low_total      = sum(O)
high_total     = sum(P)

expected_price = expected_total * rate * (1 + contingency) * (1 + margin)
low_price      = low_total      * rate * (1 + contingency) * (1 + margin)
high_price     = high_total     * rate * (1 + contingency) * (1 + margin)
```

- **Rate** comes from `assumptions.md`. The CLI never ships a rate.
- **Contingency** is a single band, 15-25%, with a written reason. It is not tied to flags.
- **Margin** is explicit and justified by client size or risk.
- **TCO monthly** is computed separately and never added to the price.

### 10.3 Structured input

`estimate.md` contains a fenced YAML block:

```yaml
blocks:
  - id: discovery
    name: Discovery
    optimistic: 16
    likely: 24
    pessimistic: 40
    rationale: "Requirements workshop and two technical spikes"
  - id: backend
    name: Data and backend
    optimistic: 60
    likely: 90
    pessimistic: 140
    rationale: "CRUD, auth, reports, migrations"
```

and a second fenced block that carries the pricing decisions, so `check` verifies values
instead of reading prose:

```yaml
pricing:
  currency: USD
  contingency: 0.20
  contingency_reason: "First project with this client; one integration is unproven."
  margin: 0.30
  margin_reason: "SMB client, scope fixed for three months."
  tco_monthly: 60
  tco_components: "hosting, database, transactional email"
```

`rate` is not repeated here: it has exactly one home, `assumptions.md` (section 10.6). The values
that count are the ones in `estimate.md`; `contingency_default` and `margin_default` in
`assumptions.md` only prefill the template and never override the estimate.

`calc` reads the blocks and the assumptions, then generates a table between markers:

```markdown
<!-- calc:start -->
| Block | O | M | P | Expected |
|---|---:|---:|---:|---:|
| Discovery | 16 | 24 | 40 | 25.3 |
| Data and backend | 60 | 90 | 140 | 93.3 |
| UI | 50 | 70 | 110 | 73.3 |
| Integrations | 20 | 32 | 56 | 34.0 |
| QA and deploy | 16 | 24 | 40 | 25.3 |
| Project management | 12 | 18 | 28 | 18.7 |
| **Total** | **174** | **258** | **414** | **270.0** |

Rate: USD 40/h. Contingency: 20%. Margin: 30%.
Expected price: USD 16,848. Range: USD 10,858 - USD 25,834.
<!-- calc:end -->
```

`check` verifies that the generated table matches the computation and that the block totals
equal the sum of the rows.

### 10.4 Complexity and risk signals

Signals adjust the hours of the affected block, with a written rationale. They do not apply a
global percentage.

| Signal | Affected blocks | Why |
|---|---|---|
| Money movement | Data and backend, QA | Consistency, audit, reconciliation |
| Per-client data isolation | Data and backend, QA | Permissions, migrations, test matrix |
| Real-time behavior | Data and backend, UI, QA | Push channel, concurrency, load testing |
| External integrations | Integrations, QA | Contracts, retries, versioning |
| Regulatory compliance | QA, project management | Audit evidence, documentation |
| High volume | Data and backend, QA | Indexing, caching, load tests |

### 10.5 ROI check

The current cost of the problem (from the brief) is a sanity check, not a formula input:

- If the price is higher than the value the client gets in two years, flag it.
- If the current cost is unknown, say so; do not invent it.

### 10.6 Rate rule: user value first, research as fallback

The CLI never ships a rate and never fetches one.

1. If the user provides `hourly_rate` greater than zero, use it. No research.
2. If `hourly_rate` is missing or `unknown`, the orchestrator researches two or three dated
   sources (local job boards, freelance platforms, agency rate cards, community surveys),
   records them in `assumptions.md` under `market_references`, proposes a range, and asks the
   user to confirm one value.
3. `check` fails with `RATE_MISSING` if no confirmed rate greater than zero exists. The estimate
   cannot be approved without it.
4. A provided rate is never silently replaced by a researched number. Research only fills a gap.

---

## 11. Assumptions and variability

`.funky-forge/assumptions.md` is the only place for project-specific variables:

```yaml
---
schema: 1
language: en
proposal_language: en       # defaults to language when omitted
currency: USD
region: "Mexico City, MX"
hourly_rate: 40
hourly_rate_source: "user-provided"   # user-provided | market-reference
contingency_default: 20
margin_default: 30
client_size: smb            # startup | smb | enterprise
taxes: "IVA 16%"
team:
  - role: fullstack
    seniority: mid
    dedication: 1.0
market_references: []       # required when hourly_rate_source is market-reference
---
```

Rules:

- The CLI validates types and ranges; it does not choose values.
- The orchestrator asks for values it does not have.
- `proposal_language` defaults to `language`. It is recorded, not validated: language detection
  is unreliable and is not the CLI's job.
- If `hourly_rate_source` is `market-reference`, `market_references` must contain two or three
  entries with a source and a date.
- Defaults are suggestions printed in the templates, never silently applied.
- If a value is unknown, mark it `unknown`; `check` warns but does not invent.

---

## 12. Delegation and review depth

### 12.1 Principles

- Describe **intent, scope, permissions, and expected result**, never a tool name or a model.
- Reviewers are **read-only**. Writers are the orchestrator and, optionally, a drafting worker.
- Reviewers are **blind**: no conversation, no author rationale.
- A reviewer returns a structured verdict; prose alone cannot gate a phase.
- If the host has no subagents, run the same brief in a fresh session.

### 12.2 Reviewer brief template

```markdown
Delegate an independent review of .funky-forge/design.md.

- Scope: brief.md, design.md, and the cited sources only. Do not include the
  conversation or the author's conclusions.
- Permissions: read-only. Do not modify files.
- Depth: deep (or light, according to the gate).
- Signals: <none, or the risk signals from 10.4 that apply, or the escalation trigger>.
- Result: verdict PASS | PASS_WITH_RISKS | BLOCK; depth; findings with severity
  (blocker | high | medium | low), artifact reference, evidence, and suggested
  fix; and a list of what you could not verify.
- If no subagent is available, open a fresh session with this same brief.

The orchestrator records the verdict in gates/2-design.md and does not advance
when the verdict is BLOCK.
```

### 12.3 Review depth

Every phase has a reviewer. The depth is set by explicit triggers, never by project size.

| Depth | Shape | Cost |
|---|---|---|
| **Light** | One pass, product or client lens, at most 3 findings, no clarification round. Its only possible follow-up is the single deep escalation in trigger 5 | One cheap reviewer call |
| **Deep** | Full brief, all lens questions, evidence per finding, at most 8 findings, one clarification round allowed | One substantial reviewer call |

Phase defaults:

| Phase | Default depth |
|---|---|
| 1. Problem | Light |
| 2. Design | Deep |
| 3. Estimate | Deep |
| 4. Proposal | Light |

Escalation triggers for a light review (any one makes the phase deep):

1. The brief states more than one core flow.
2. A risk signal from section 10.4 is present (money, isolation, real-time, integrations,
   compliance, high volume).
3. The proposal introduces scope that is not present in the estimate.
4. The human asks for a deeper review.
5. A light pass returns `BLOCK` or any `blocker`/`high` finding. The orchestrator then runs the
   same blind brief once more at deep depth and records **only the deep verdict** as the gate
   report, with `escalation_reason` quoting the light finding. One escalation per phase per
   review cycle; a second deep round is a human decision, not an automatic loop.

The phase-1 deterministic gate already requires a measurable metric and a quantified or
explicitly `unknown` current cost, so those conditions are not escalation triggers: they fail
`check` before a reviewer is called.

The gate report records `depth` and `escalation_reason`. Escalation is a response to evidence,
not a pre-classification of the project; this keeps one path and avoids a size threshold.

### 12.4 Reviewer lenses

| Brief | Phase | Lens |
|---|---|---|
| `reviewers/product.md` | 1 | Is the problem worth solving? Is the metric measurable? Is the MVP one flow? |
| `reviewers/design.md` | 2 | What can be cut? What breaks at 10x? What is the simplest alternative? |
| `reviewers/commercial.md` | 3, 4 | Would the client pay? What is missing? Is the scope unambiguous? |

### 12.5 Result contract

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

### 12.6 Fallback matrix

| Capability missing | Fallback |
|---|---|
| Subagents | Fresh session with the same reviewer brief |
| Skills | Read `SKILL.md` as a normal document |
| Shell | Manual gates; no `check` or `calc`; the process degrades but does not disappear |
| Write access | The orchestrator pastes the artifact and the human saves it |
| Web access for market rates | No research: `hourly_rate` stays `unknown`, `check` fails with `RATE_MISSING`, and the skill says the estimate cannot be approved until the human supplies a rate. It never invents a number. |

---

## 13. CLI contract

The executable is `funky-forge`, published by the package of the same name. It does not extend,
wrap, or depend on the `funky` binary of `funky-cli`. Because the agent invokes it through a
shell, no command prompts: anything ambiguous is an exit code and a message.

### 13.1 `funky-forge install`

| Item | Definition |
|---|---|
| Purpose | Install the method pack for a harness |
| Flags | `--target <agents\|claude>`, `--dry-run`, `--with-pointer`, `--force`, `--json` |
| Output | Manifest of written files; detected harness; target path |
| Side effects | Writes only new files in the target path; with `--with-pointer`, appends one marked line to `AGENTS.md` or `CLAUDE.md` |
| Exit | `0` success; `1` error or refused overwrite; `2` `TARGET_AMBIGUOUS` (both markers and no `--target`) |

### 13.2 `funky-forge init`

| Item | Definition |
|---|---|
| Purpose | Create `.funky-forge/` with templates and assumptions |
| Flags | `--language <en\|es>`, `--proposal-language <en\|es>`, `--force`, `--json` |
| Output | Manifest of created files |
| Side effects | Creates `assumptions.md`, `decisions.md`, and the four artifact skeletons as `draft` |
| Exit | `0` success; `1` error or existing directory without `--force` |

### 13.3 `funky-forge check <phase>`

| Item | Definition |
|---|---|
| Purpose | Validate schema, dependencies, approval hash, gate report, arithmetic, and cross-artifact consistency |
| Flags | `--json`, `--strict` (`--strict` turns every warning into an error and exits `1`) |
| Output | Human summary or one JSON object with `ok`, `phase`, `bodyHash`, `errors`, `warnings` |
| Side effects | **None. The command is read-only; there is no `--fix`.** |
| Exit | `0` pass; `1` fail |

Checks per phase:

| Check | Applies to |
|---|---|
| Required fields non-empty | all |
| `dependency.status === approved` | all after phase 1 |
| `status !== stale` for approval | all |
| `approved_hash` matches the normalized body when `status: approved` | all |
| Gate report exists and verdict is not `BLOCK` | all |
| Every brief must-have maps to a design component | design |
| Every design component maps to a brief must-have, or appears in `## Rejected alternatives` as `- <component> - rejected because ...` | design |
| NFR table complete | design |
| Every design component has an estimate block | estimate |
| `O <= M <= P` per block | estimate |
| Generated totals match the blocks | estimate |
| `hourly_rate` confirmed and greater than zero | estimate |
| `pricing.contingency` inside 15-25%, or outside with a non-empty `contingency_reason` | estimate |
| `pricing.margin` present with a non-empty `margin_reason` | estimate |
| `pricing.tco_monthly` present and excluded from the price | estimate |
| `market_references` has two or three dated entries when `hourly_rate_source: market-reference` | estimate |
| Gate report finding headings parse as `### F<id> - Severity: <level>` | all |
| `not_verified` present in the gate report (may be empty) | all |
| `PASS_WITH_RISKS`: every `blocker`/`high` finding has an `accepted_risks` entry | all |
| Every estimate block appears in a proposal phase (reviewer) | proposal |
| Every brief must-have is included or explicitly excluded (reviewer) | proposal |
| Proposal price matches the estimate | proposal |
| No placeholder tokens (`TBD`, `TODO`, `FIXME`, `[fill]`) and no empty required field | all |

`bodyHash` is always returned, including for a draft: it is the value the orchestrator copies
into `approved_hash` at approval (section 9.2, rule 6). `check` never writes it.

Two rows above are marked `(reviewer)` on purpose. Mapping every estimate block into a proposal
phase, and proving that every brief must-have is included or explicitly excluded, require a
declared correspondence between three documents. The templates do not declare one, so a CLI rule
would be a guess that passes wrong proposals and blocks right ones. The reviewer owns those two
rules until the proposal template carries an explicit scope-coverage table (v0.2). `check`
verifies the part that needs no judgement: the proposal's price against the estimate.

Read-only rationale: a validator that mutates state can revoke approvals silently. Staleness
propagation is an approval decision, so the orchestrator performs it. If it forgets,
`approved_hash` turns the mistake into a failing check.

### 13.4 `funky-forge calc`

| Item | Definition |
|---|---|
| Purpose | Recompute the estimate from blocks and assumptions |
| Flags | `--json`, `--write` |
| Output | Table and totals; with `--write`, updates the `calc` markers in `estimate.md` |
| Side effects | Only with `--write` |
| Exit | `0` success; `1` invalid input |

`--write` on an artifact whose `status` is `approved` succeeds but revokes approval: the body
changed, so `check` fails with `APPROVED_CONTENT_CHANGED` until the estimate is re-gated
(section 9.2, rule 7). The skill runs `calc --write` before the gate, never after approval.

`check` runs the same computation in memory and compares it with the written table.

### 13.5 JSON shapes

`check --json`:

```json
{
  "ok": false,
  "phase": "design",
  "bodyHash": "sha256:9f2c...",
  "errors": [
    { "code": "MISSING_MAPPING", "message": "...", "artifact": "design.md" }
  ],
  "warnings": []
}
```

`calc --json`:

```json
{
  "ok": true,
  "currency": "USD",
  "blocks": [{ "id": "discovery", "optimistic": 16, "likely": 24, "pessimistic": 40, "expected": 25.33 }],
  "totals": { "optimistic": 174, "likely": 258, "pessimistic": 414, "expected": 270 },
  "pricing": { "rate": 40, "contingency": 0.2, "margin": 0.3, "expected": 16848, "low": 10857.6, "high": 25833.6 }
}
```

---

## 14. Gate protocol

### 14.1 Sequence

1. The orchestrator writes or updates the artifact.
2. `funky-forge check <phase>` runs. If it fails, fix and repeat.
3. The orchestrator selects the depth (light or deep) from the defaults and the triggers in
   12.3, then delegates the matching reviewer with its brief. A light pass that returns `BLOCK`
   or a `blocker`/`high` finding gets exactly one deep escalation (12.3, trigger 5).
4. The reviewer returns a verdict and findings.
5. The orchestrator records the report in `.funky-forge/gates/<n>-<phase>.md`, including the
   verbatim findings, the depth, the escalation reason, `not_verified`, and any
   `accepted_risks`.
6. `funky-forge check <phase>` runs again. It passes only if the report exists, parses, its
   verdict is not `BLOCK`, and any `PASS_WITH_RISKS` findings are accounted for.
7. The orchestrator presents the findings and the proposed decision to the human.
8. The human approves, rejects, or accepts risks.
9. The orchestrator reads `bodyHash` from `check --json`, stores it in `approved_hash`, sets
   `status: approved`, `approved_by`, `approved_at`, and appends the decision to
   `decisions.md`.

### 14.2 Verdicts

| Verdict | Meaning | Allowed to advance |
|---|---|---|
| `PASS` | No material findings | Yes, after human approval |
| `PASS_WITH_RISKS` | Findings exist and are accepted | Yes, only if every high or blocker finding has a recorded accepted risk |
| `BLOCK` | Material finding that must be fixed | No |

### 14.3 Accepted risks

An accepted risk is recorded twice: narratively in `decisions.md`, and machine-readably in the
`accepted_risks` list of the gate report (section 9.3), one entry per accepted finding, with the
finding id, severity, reason, human, and date. `check` reads the gate report and allows a
`PASS_WITH_RISKS` verdict only when every `blocker` or `high` finding has a matching entry.
Silently ignoring a `BLOCK` is not a valid path.

### 14.4 Staleness propagation

- Changing an approved artifact marks dependents `stale`.
- `stale` does not delete content; it revokes approval.
- Re-approval requires a new deterministic check and a new gate report.
- The orchestrator performs the propagation. `check` detects the edit through `approved_hash`
  and reports it; it never mutates the artifact.

---

## 15. Worked example

A small SaaS for freelancers: generate and send invoices.

### Brief (abridged)

- Problem today: freelancers build invoices manually in spreadsheets; two hours per month.
- Users: 50 freelancers in the first year.
- Core flow: create a client, create an invoice, export PDF, mark as paid.
- Must-haves: clients, invoices, PDF export, paid status, tax field.
- Out of scope: online payments, multi-user teams, accounting integrations.
- Success metric: 80% of active users create at least one invoice per month.
- Current cost: two hours per month per freelancer, about USD 600 per year per user.

### Design (abridged)

- Modular monolith, server-rendered UI, PostgreSQL, email/password auth.
- NFRs: performance applies (PDF under 2 seconds); availability applies (single region, daily
  backups); security applies (tenant isolation per user); scale does not apply beyond 50 users
  in year one, with a stated migration path.
- Rejected alternatives: microservices, event sourcing, separate PDF service.
- Deferred: payment provider integration.

### Estimate

| Block | O | M | P | Expected |
|---|---:|---:|---:|---:|
| Discovery | 16 | 24 | 40 | 25.3 |
| Data and backend | 60 | 90 | 140 | 93.3 |
| UI | 50 | 70 | 110 | 73.3 |
| Integrations | 20 | 32 | 56 | 34.0 |
| QA and deploy | 16 | 24 | 40 | 25.3 |
| Project management | 12 | 18 | 28 | 18.7 |
| **Total** | **174** | **258** | **414** | **270.0** |

Rate USD 40/h, contingency 20%, margin 30%:

- Expected: USD 16,848
- Range: USD 10,858 - USD 25,834
- TCO: USD 60/month (hosting, database, email), separate from the price
- ROI: the problem costs about USD 600 per user per year, so the expected price of USD 16,848
  is covered by roughly 28 active users for one year, below the 50-user target.

### Proposal (abridged)

- Phase 1: clients, invoices, PDF export, paid status, tax field.
- Phase 2: payment provider integration, recurring invoices.
- Exclusions: accounting integrations, multi-user teams, mobile app.
- Price: USD 10,858 - USD 25,834; expected USD 16,848.
- TCO: paid by the client directly to providers.
- Assumptions: up to 50 users, one region, English-only UI.
- Validity: 30 days.

---

## 16. Migration from current funky-forge

### 16.1 Command lifecycle

`funky-forge` ships no alias for any `funky-cli` command. The two are separate packages with
separate executables, and an alias would force exactly the dependency this RFC forbids.
Deprecating the old commands belongs to funky-ai, in its own repository, with its own tests and
release notes.

| Current (`funky-cli`) | New (`funky-forge`) | Owner of the change |
|---|---|---|
| `funky init` | `funky-forge init` | funky-ai deprecates, then removes |
| `funky assess` | Phase 2 gate with `reviewers/design.md` | funky-ai deprecates; the reviewer replaces it |
| `funky estimate` | Phase 3 plus `funky-forge calc` | funky-ai deprecates; the flags disappear |
| `funky pipeline` | — | funky-ai removes it; no replacement |
| `--context`, `--brief`, topic flags | — | funky-ai removes them |

The sequence is fixed by section 18: the old commands are deprecated only after the pack is
validated (step 9), and funky-ai does the removal together with the P1 fixes in section 16.4.

### 16.2 Artifacts

- New projects use `.funky-forge/`.
- **There is no automated import in v1.** The old canvases are a stack questionnaire; a
  mechanical mapping would carry the wrong structure into the new design. Migration is a
  conversation: the orchestrator reads the old documents and drafts the new artifacts, asking
  the user what is still true.
- If the number of legacy projects later justifies it, a `--raw` option can copy the old files
  into `.funky-forge/legacy/` for reference. It must not transform them.
- `pipeline/context.json` is not read or written by the new commands.

### 16.3 Code removal

- Remove the marker and drift machinery, the TTY/non-TTY confirmation matrix, the artifact kind
  migration, and the prompt templates copied per project.
- Keep the canvas templates only as input material for the new templates; do not ship them as
  per-project prompts.
- Keep `risk-patterns` content as the design reviewer checklist, not as a project file.

### 16.4 If the old commands remain during deprecation

Fix the P1 defects first (see Appendix B), or disable the pipeline command. A deprecated command
that still corrupts its own state is worse than a removed command.

---

## 17. Validation plan before implementation

The method must be proven as a skill before the CLI exists.

1. Author the skill pack (English) without writing any CLI code.
2. Run it manually on two projects in temporary directories:
   - **Project A:** a small internal CRUD, one developer, about three weeks.
   - **Project B:** a medium SaaS with auth, a payment provider, and one integration, about
     three months.
3. Create `.funky-forge/` by hand from the pack's templates. The method must stand with no CLI
   at all: do not use `funky-cli` or `funky pipeline`.
4. Measure:

| Metric | Target |
|---|---|
| Phases skipped | 0 |
| Gate findings that were material | At least 1 per project |
| Gate findings that were noise | Less than half |
| User can explain the price in two minutes | Yes |
| Artifacts consistent after changes | Yes |
| Skill loaded correctly in two harnesses | Yes |
| Turns per phase (median) | Record, do not optimize yet |
| Light reviews that escalated | Record the trigger; a healthy rate is evidence the triggers work |

5. If the method fails, revise this RFC before writing code.

---

## 18. Implementation plan

| Step | Deliverable | Depends on |
|---|---|---|
| 1 | This RFC reviewed and accepted | — |
| 2 | Repository scaffold: `package.json` named `funky-forge`, `bin/funky-forge.js`, `skill/` | 1 |
| 3 | Skill pack authored: `SKILL.md`, references, reviewer briefs, templates | 2 |
| 4 | Manual validation on Projects A and B | 3 |
| 5 | `funky-forge install` and `init` with auto-detection, `--dry-run`, and exit code `2` | 4 |
| 6 | `funky-forge calc` with tests for the formula and edge cases | 5 |
| 7 | `funky-forge check` with tests for every validation rule, including `approved_hash` and `bodyHash` | 6 |
| 8 | Gate protocol wired into the skill and exercised end-to-end | 7 |
| 9 | Deprecation of the old commands in funky-ai; docs updated; release notes for both packages | 8 |
| 10 | Deferred: `funky-forge report` static HTML export (not part of the first implementation) | 9 |

No date estimates are included. The order is the contract.

---

## 19. Risks and resolved design questions

### Risks

- **Model variance.** Two runs may produce different findings. The deterministic checks and the
  verdict contract limit the damage.
- **Reviewer cost.** Reviewers spend tokens. Depth control keeps the cost proportional: light by
  default in phases 1 and 4, deep in phases 2 and 3, escalation only on evidence.
- **Context pressure.** The orchestrator must delegate; if it tries to hold the whole project,
  it degrades. The artifacts, not the chat, are the memory.
- **Skill discovery differences.** Some hosts load skills differently. The description must be
  explicit, and the method must degrade to reading `SKILL.md` as a document.
- **Market data freshness.** Rates and provider prices age. Every reference carries a date and
  a source; stale references are a warning, not a silent default.
- **Language.** The method is English; artifacts follow `assumptions.language`; the proposal
  follows `proposal_language`. Mixed-language projects need an explicit choice.
- **Windows paths.** The CLI must normalize paths and avoid non-ASCII characters in file names
  and identifiers.
- **Name collision inside funky-ai.** That repository already has `docs/funky-forge/` and the
  `funky init` pipeline. Every new document names the package and the executable explicitly and
  says which repository owns which command, so a reader never confuses the old in-repo feature
  with the published package.

### Resolved design questions

| # | Question | Resolution |
|---|---|---|
| 1 | Does phase 1 need an independent reviewer? | **Always a reviewer; depth scales with risk.** Phase 1 is light by default and escalates to deep on an explicit trigger (section 12.3). No project-size threshold. |
| 2 | Should `check` fix staleness (`--fix`)? | **No. `check` is read-only.** Staleness is propagated by the orchestrator. `approved_hash` detects post-approval edits. A separate `funky-forge stale` command may be added later if needed; it is not a flag on `check`. |
| 3 | Does the proposal need its own language? | **Yes.** `proposal_language` in `assumptions.md`, defaulting to `language`. The CLI records it; the orchestrator writes the proposal in that language. |
| 4 | When does the orchestrator research market rates? | **User value first.** If the user provides a rate, use it. If the rate is missing or unknown, research two or three dated sources, record them, and require the user to confirm one. `check` fails with `RATE_MISSING` without a confirmed rate. |
| 5 | Should `funky-forge import` exist for legacy canvases? | **No in v1.** Migration is a conversation. A `--raw` copy may be added later; no automatic transformation. |
| 6 | Is a static HTML report worth it in v1? | **No.** Markdown and PDF are enough. If a client later needs a branded deliverable, add `funky-forge report` as a static, self-contained export with no server or state. |
| 7 | What is the product, repository, package, and executable name? | **`funky-forge`, with no version suffix.** Repository, npm package, executable, and skill share the name; the version lives only in `package.json`. `funky-forge` was unclaimed on npm when this revision was written. |
| 8 | Does the pack live inside `funky-cli` or in its own repository? | **Its own repository and package.** No dependency on `funky-cli` and no alias for its commands; funky-ai deprecates those in its own repository. |
| 9 | Where do project artifacts live? | **`.funky-forge/` at the project root.** One fixed path for every command, out of the docs tree, and easy to exclude per project. |

No open design questions remain as of revision 3.

---

## 20. Acceptance criteria

The RFC is implemented when:

1. A user can install the method on a clean project in one command, with a clear manifest and
   no changes to existing configuration.
2. A user can run the four phases end-to-end with any of the supported harnesses, and the skill
   loads without a slash command.
3. Every phase has a reviewer; light and deep depths are selectable through the explicit
   triggers in section 12.3, and the gate report records the depth and the reason.
4. `funky-forge check` rejects missing fields, unapproved dependencies, stale artifacts,
   post-approval edits (`APPROVED_CONTENT_CHANGED`), malformed or `BLOCK` gate reports, an
   unaccounted `PASS_WITH_RISKS` finding, broken arithmetic, missing rates (`RATE_MISSING`), and
   scope/price mismatches.
5. `funky-forge calc` reproduces the estimate exactly from the blocks and assumptions, and
   refuses invalid input.
6. No project contains copied prompts or a separate state file.
7. The proposal is written in `proposal_language`, and internal artifacts use `language`.
8. funky-ai deprecates the old commands with a documented migration and no silent data loss;
   `funky-forge` itself ships no alias and no dependency on `funky-cli`.
9. On both validation projects, no phase is skipped, at least one material finding is caught per
   project, and the user can explain the price in two minutes.
10. The method pack stays within the size guardrails in section 7.4.
11. `npm install funky-forge` yields the `funky-forge` executable, and `funky-forge install` on a
   clean project needs no question and no second command.
12. Every artifact path, gate path, and error message contains no version suffix.

---

## Appendix A — Decision log

These decisions were made during the design discussion that produced this RFC.

| # | Decision | Rationale |
|---|---|---|
| D1 | Do not build a new harness | Commodity, lock-in, maintenance cost; the product is the method |
| D2 | Portable skill pack + thin CLI | Runs on Pi, Claude Code, OpenCode, Codex, and gentle-ai |
| D3 | No slash commands | Not portable; adds an adapter per host |
| D4 | One registered skill plus internal references | One activation point; avoids nested-skill dependency |
| D5 | Do not modify `AGENTS.md` by default | User-owned context; applies to all tasks, not just planning |
| D6 | Natural-language delegation | Tool names and models are host-specific |
| D7 | Reviewers read-only, blind, and structured | A second opinion without a verdict cannot gate |
| D8 | English for the method and names | International audience; avoids non-ASCII file names |
| D9 | Auto-detect install target; shared standard first | Most harnesses use `.agents/skills`; Claude is the exception |
| D10 | No web UI in the first version | Avoid a second data model to sync with the agent |
| D11 | Three-layer enforcement: identity, procedure, executable checks | Prompts are not a reliable enforcement mechanism |
| D12 | Artifacts are the state; no `context.json` | Eliminates a state store that can lie |
| D13 | One path, variable depth | Avoids a scenario matrix and per-flag branches |
| D14 | Four phases with gates | Problem, design, estimate, proposal |
| D15 | Blocks plus three-point estimation | Defensible and explainable to a client |
| D16 | No hardcoded rates | Variability lives in project assumptions and dated sources |
| D17 | One contingency band, explicit margin, separate TCO | Removes invented per-flag percentages |
| D18 | Optional static report only | If a client needs a view, export; do not build an app |
| D19 | Always a reviewer; light/deep by triggers | A reviewer is always valuable; the cost is controlled by depth, not by project size |
| D20 | `check` read-only plus `approved_hash` | Never revoke approvals silently; detect forgotten propagation deterministically |
| D21 | Separate `proposal_language` | Internal team language and client language are different variables |
| D22 | User rate first; research as fallback | Respect the user's number; research only fills a gap, with dated sources and confirmation |
| D23 | No automated legacy import in v1 | Mechanical mapping would carry the wrong structure; migration is a conversation |
| D24 | No HTML report in v1 | Presentation is not planning; add a static export when a client asks |
| D25 | One name for repository, package, executable, and skill: `funky-forge`, no version suffix | One name to install, cite, and search; the version lives in `package.json` |
| D26 | Independent repository and package; no `funky-cli` dependency and no command alias | A public pack cannot own another package's command surface, and an alias would force the dependency |
| D27 | Project artifacts in `.funky-forge/` | One fixed path for every command, out of the docs tree, easy to exclude per project |
| D28 | No interactive prompt in the CLI: ambiguity is exit code `2` plus a message | The agent invokes the CLI through a shell with no TTY; a prompt would hang |

---

## Appendix B — Evidence of current defects

Reproduced on the current codebase, `funky-cli` 4.9.1 in the funky-ai repository. The version,
`bin.funky = ./bin/funky.js`, and `ARTIFACT_KINDS = ['generated', 'living']` were re-verified
against the working tree when revision 3 was written:

| Defect | Evidence |
|---|---|
| Context invalid after a successful pipeline | `estimate` writes `kind: "guide"`; `ARTIFACT_KINDS` accepts only `generated` and `living`; `pipeline status` then fails with `context.json does not match schema v2` |
| JSON output reports a running phase | `pipeline all --json` exits 0 with `estimate.status: "running"` and `currentPhase: "estimate"` |
| Assess completes without a session | `runAssess` marks `completed` when the prompt file is copied |
| `--brief` is a no-op | The generated guide is byte-identical with `--brief`, `--brief file.md`, or no flag |
| `--pricing-team` can quote zero | The embedded table contains `$0.00`; the guide says to use it exclusively; no validation |
| No completeness gate | The CLI warns about unfilled sections and continues |
| Tests miss the round-trip | Pipeline tests mock `readContext`, so the real state transition is never exercised |
| Documentation drift | `escenarios-de-uso.md` and `pipeline.md` still reference `architecture-review.md`, removed in v4.6/v4.7; the NFR paragraph copied from assess to estimate remains |
| RFC drift | The planning RFC mentions `--observability` and `--e2e-testing`, which do not exist; its buffers say 10-25% while the topic fragments reach 40% |

These defects justify the redesign rather than another patch cycle.

---

## Appendix C — Templates and examples

### C.1 Artifact skeleton

```markdown
---
schema: 1
phase: design
status: draft
depends_on: [problem]
language: en
proposal_language: en
approved_by: null
approved_at: null
approved_hash: null
method_version: 1
---

# Design

## Architecture at a glance

## Components and responsibilities

## Data model and retention

## Auth and permissions

## Integrations

## NFR decisions

| NFR | Applies | How it is met | Not applicable because |
|---|---|---|---|
| Performance |  |  |  |
| Availability |  |  |  |
| Security |  |  |  |
| Scale |  |  |  |

## Risks and mitigations

## Rejected alternatives

## Stack decision

## Gate

- [ ] Every must-have maps to a component
- [ ] Every component maps to a must-have
- [ ] NFR table complete
- [ ] Rejected alternatives present
- [ ] Reviewer report recorded in `gates/2-design.md`
```

### C.2 `check` output example

```
$ funky-forge check estimate

funky-forge check - estimate
  schema ................ ok
  dependencies .......... ok (problem approved, design approved)
  status ................ draft
  approved hash ......... n/a (not approved yet)
  body hash ............. sha256:9f2c... (copy into approved_hash at approval)
  blocks ................ 6
  arithmetic ............ ok
  rate .................. 40 USD/h (user-provided)
  contingency ........... 20%
  margin ................ 30%
  tco separation ........ ok
  gate report ........... missing

1 error:
  GATE_REPORT_MISSING: .funky-forge/gates/3-estimate.md does not exist.
  Run the commercial reviewer and record the verdict before approving.
```

### C.3 Reviewer brief (commercial)

```markdown
Delegate an independent commercial review of .funky-forge/estimate.md.

- Scope: brief.md, design.md, estimate.md, assumptions.md, and the cited sources.
  Do not include the conversation or the author's conclusions.
- Permissions: read-only.
- Depth: deep (or light, according to the gate).
- Signals: <none, or the risk signals from 10.4 that apply>.
- Lens:
  1. Would the client pay this price? Why or why not?
  2. What is the cheapest credible version that still solves the brief?
  3. What will the client ask for later that is missing from the range?
  4. Is the range defensible from the stated assumptions and sources?
  5. Is the recurring cost visible and separate from the price?
- Result: verdict PASS | PASS_WITH_RISKS | BLOCK; depth; findings with severity,
  artifact reference, evidence, and suggested fix; and what you could not verify.
- If no subagent is available, open a fresh session with this same brief.
```

### C.4 Market reference entry

```yaml
market_references:
  - source: "local fullstack survey"
    date: 2026-09
    url: "https://example.com/survey"
    note: "mid-level fullstack, remote, 30-45 USD/h"
  - source: "agency rate card"
    date: 2026-08
    url: "https://example.com/rates"
    note: "small agency, 35-50 USD/h"
```

---

## Closing note

This RFC deliberately removes more than it adds. The value of funky-forge is not the number of
documents it can generate; it is the discipline of four phases, an independent second opinion,
and a price that can be explained line by line. Everything else is optional.
