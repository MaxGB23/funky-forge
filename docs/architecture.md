# Architecture

funky-forge is two halves that never duplicate each other: a **method** an agent follows, and a
**CLI** that refuses to let the method's own rules be broken by accident. Everything a project
knows lives in four Markdown files and four gate reports on disk; there is no database, no service,
and no hidden state.

## The four layers

| Layer | Lives in | Changes when | Who reads it |
|---|---|---|---|
| Method pack | `skill/` | The process changes | The agent, in the project where it was installed |
| CLI | `bin/`, `src/` | A rule becomes checkable | The agent, through the shell |
| Project artifacts | `.funky-forge/*.md` | You plan | You, the agent, the reviewer, the CLI |
| Gate reports | `.funky-forge/gates/*.md` | A review happened | The CLI, and whoever audits the decision |

`install` copies the first layer into a harness skill directory. The other three are created per
project by `init` and written by the agent.

## Data flow

```
you ──conversation──▶ orchestrator agent
                          │  writes
                          ▼
                  .funky-forge/brief.md ──▶ funky-forge check problem
                          │                        │ errors? fix and repeat
                          │  delegates (read-only) ▼
                          └──────────────▶ reviewer agent ──▶ verdict + findings
                                                          │
                                     recorded by the orchestrator
                                                          ▼
                                          .funky-forge/gates/1-problem.md
                                                          │
                                              check problem again
                                                          ▼
                                              you: approve or iterate
                                                          │
                        approval copies `bodyHash` into `approved_hash`
                                                          ▼
                                        next phase may start
```

The same loop runs four times. Phase 2 cannot start until phase 1 is `approved`, and the CLI
enforces it.

## Phase graph

```
problem ──▶ design ──▶ estimate ──▶ proposal
(brief.md)  (design.md)  (estimate.md)  (proposal.md)
```

Each artifact declares its dependencies in frontmatter, and the matrix is fixed:

| Artifact | `depends_on` | Gate report |
|---|---|---|
| `brief.md` | `[]` | `gates/1-problem.md` |
| `design.md` | `[problem]` | `gates/2-design.md` |
| `estimate.md` | `[problem, design]` | `gates/3-estimate.md` |
| `proposal.md` | `[problem, design, estimate]` | `gates/4-proposal.md` |

Editing an approved artifact does not silently propagate: the hash no longer matches, `check` fails
with `APPROVED_CONTENT_CHANGED`, and the orchestrator marks dependents `stale`. The rule is "the
artifact is the state", never a side file.

## Who decides what

| Question | Owner | Why |
|---|---|---|
| Is the schema, the arithmetic, the hash, or the dependency chain valid? | The CLI | Deterministic, repeatable, no judgement needed |
| Is the scope right, is the risk acceptable, does the price make sense? | The reviewer | Needs reading the whole document, not a regex |
| Do we advance, accept a risk, or pay for another round? | You | Consequence lands on the project, not on the tool |

A phase advances only when all three agree: `check` passes, the gate report is not `BLOCK`, and you
approve.

## Repository layout

```text
funky-forge/
  bin/funky-forge.js        entry point: exit code only, no logic
  src/cli.js                command table, argument parsing, generated help
  src/commands/             install, init, check, calc
  src/lib/                  parsers, artifact rules, estimate math, cross-checks, gate rules
  skill/                    the method pack, copied verbatim by install
    SKILL.md                the only registered skill
    references/             phase contracts, review contract, schemas
    templates/              the six files init writes
  tests/                    node --test, real temporary directories
  docs/                     this documentation and the validation evidence
  rfcs/                     the design record behind the method
```

`src/lib` holds no I/O: parsers and rules are pure functions over text and data, which is why the
tests can exercise them without a filesystem. `src/commands` holds all the effects.

## Invariants

1. **One command only reads.** `check` never writes; there is no `--fix`. A validator that mutates
   state can revoke approvals silently.
2. **Two writers, both bounded.** `install` writes only inside the target skill directory, refuses
   to overwrite a modified file without `--force`, and touches `AGENTS.md`/`CLAUDE.md` only with
   `--with-pointer`. `calc --write` rewrites only the region between the calc markers.
3. **The hash is the approval.** `approved_hash` is the SHA-256 of the normalized body, so an edit
   after approval is detectable without trusting anyone's memory.
4. **No prompts.** The CLI never reads stdin, so an agent can call it with no terminal. A decision
   it cannot make becomes exit code `2`.
5. **Fixed paths.** Phases map to file names that are not configurable, so two projects never
   disagree about where a decision lives.

## Non-goals

- No code generation, scaffolding, or deployment: funky-forge plans and prices, it does not build.
- No hosted service, dashboard, or web UI.
- No pricing secrets: the rate comes from `assumptions.md`, and a researched rate must cite its
  sources.
- No harness lock-in: the method needs file access and a shell, nothing else.

## Where to go next

- How a phase actually runs: [method.md](method.md)
- Every field and file format: [artifacts.md](artifacts.md)
- Commands, flags, and error codes: [cli.md](cli.md)
