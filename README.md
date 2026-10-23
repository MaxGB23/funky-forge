# funky-forge

Plan and quote software projects in four gated phases: problem, design, estimate, proposal.
A portable skill pack for any agent harness, plus a small deterministic CLI for schemas,
arithmetic, and validation.

The method decides *what* to write and *when* a phase may advance. The CLI decides *whether the
files are consistent*. Neither one prices a project on its own: a human approves every phase and
accepts every risk.

> **Status:** pre-release, version 0.1.0. Not published to npm. Design and rationale live in
> `rfcs/funky-forge-skill-pack-rfc.md`; the method was validated end to end on two projects before
> any CLI code was written (`docs/validation/`).

## Requirements

Node.js 20.11 or newer. No runtime dependencies, no build step, no network access.

## Install

```sh
npm install --global funky-forge     # once published
funky-forge install                  # inside the project you want to plan
funky-forge init
```

With pnpm, install from the registry once published with `pnpm add --global funky-forge`. pnpm 12
removed `pnpm link --global`, so the local-clone workflow uses the `link:` protocol instead:

```sh
git clone https://github.com/MaxGB23/funky-forge
pnpm add --global link:./funky-forge   # symlinks the clone; edits show up immediately
funky-forge --version
pnpm remove --global funky-forge       # to unlink
```

`install` copies the method into the harness skill directory and writes nothing else:

| Harness | Target | Flag |
|---|---|---|
| Pi, OpenCode, Codex CLI | `.agents/skills/funky-forge/` | `--target agents` |
| Claude Code | `.claude/skills/funky-forge/` | `--target claude` |

Detection is automatic: a `.claude/` directory means Claude, a shared marker (`.agents/skills/`,
`.opencode/`, `.codex/`) means the shared path. When both exist the command refuses to guess and
exits `2` with `TARGET_AMBIGUOUS`, printing the exact `--target` to use. `--dry-run` shows the
manifest, `--check` reports divergence, and a modified installed file is never overwritten without
`--force`. `--with-pointer` appends one marked line to `AGENTS.md` or `CLAUDE.md`; without that
flag no user-owned file is opened for writing.

## Quick start

```sh
funky-forge init --language en --proposal-language es
funky-forge calc                       # recompute the estimate from the blocks
funky-forge calc --write               # write the table between the calc markers
funky-forge check problem              # validate before the gate
funky-forge check problem --json       # bodyHash, errors, warnings
```

The full loop for one phase lives in `skill/SKILL.md`: write the artifact, check it, delegate an
independent reviewer, record `gates/<n>-<phase>.md`, check again, then ask the human.

## Commands

| Command | Purpose | Flags |
|---|---|---|
| `install` | Copy the method pack into a harness skill directory | `--target <agents\|claude>`, `--dry-run`, `--with-pointer`, `--force`, `--check`, `--json` |
| `init` | Create `.funky-forge/` from the templates | `--language <en\|es>`, `--proposal-language <en\|es>`, `--force`, `--json` |
| `check <phase>` | Validate schema, dependencies, approval hash, gate report, arithmetic, and cross-artifact mapping | `--json`, `--strict` |
| `calc` | Recompute hours and price from the blocks | `--write`, `--json` |

Exit codes: `0` pass, `1` failure, `2` a decision only the human can make (`TARGET_AMBIGUOUS`).
The CLI never prompts; it is safe to call from an agent with no terminal.

`check` is read-only and has no `--fix`. It always returns `bodyHash`, the value the orchestrator
copies into `approved_hash` at approval, so approval never depends on a hand-computed hash.

## Project artifacts

```text
.funky-forge/
  assumptions.md      rate, currency, region, defaults
  brief.md            phase 1: problem
  design.md           phase 2: design
  estimate.md         phase 3: estimate
  proposal.md         phase 4: the client document
  decisions.md        append-only decision log
  gates/
    1-problem.md
    2-design.md
    3-estimate.md
    4-proposal.md
```

The file names are fixed and not configurable: `check` maps each phase to one artifact and one gate
report.

## What the deterministic half enforces

- Frontmatter shape: `schema: 1`, `phase`, `status`, `depends_on`, `method_version: 1`.
- Dependencies: an artifact cannot be approved while a dependency is not.
- `approved_hash`: `sha256:` of the normalized body, so editing an approved artifact fails with
  `APPROVED_CONTENT_CHANGED` until it is re-gated.
- No placeholder tokens (`TBD`, `TODO`, `FIXME`, `[fill]`) and no leftover template comments.
- Estimate arithmetic: `(O + 4M + P) / 6` per block, totals, price, and the written table within
  `0.01`; contingency band 15–25% or a stated reason; margin with a reason; TCO kept out of the
  price.
- Design coverage: every component maps to a must-have or to a rejected alternative, and every
  component is priced or flagged.
- Proposal price: the sold figure must match the estimate; a different number is a human decision.
- Gate reports: verdict, depth, `findings` count, one level-three heading per finding, round-scoped
  ids, `not_verified`, and an `accepted_risks` entry for every blocker or high finding.

The reviewer still does the part no script can: judgement about scope, risk, and whether the price
makes sense.

## Harnesses and review quality

The method needs three capabilities: read files, write files, run a shell command. Nothing else is
required, and `check` plus `calc` behave identically everywhere.

| Harness | Status | What changes |
|---|---|---|
| Pi with gentle-ai subagents | tested | Drafting and review run as separate agents; this is the path used for both validation projects and the local end-to-end test |
| Pi without subagents | expected to work | Review falls back to a fresh session with the same brief |
| Claude Code | expected to work | Subagents; install with `--target claude` |
| OpenCode, Codex CLI | expected to work | Shared path; reviewers as separate sessions |
| Any shell and editor | degraded | No independent reviewer: the CLI still enforces schemas, dependencies, hashes, arithmetic, coverage, and gate reports, but the review is manual |

Two things do change with the harness. **Reviewer independence** sets the quality ceiling: a gate
is only as strict as the reviewer, and a reviewer that shares the author's context tends to approve
its own work. The tested setup ran the reviewer as a separate read-only agent against the phase
brief, which is why it caught scope and pricing problems the deterministic checks cannot see.
**Determinism does not change**: `check` and `calc` are the same in every harness.

## How long a run takes

Four gates, and each one ends with a human decision. A small project with light reviews takes one
or two rounds per phase; a deep phase can take two or three, and the design phase is usually the
long one. Your decisions set the pace: accepting a risk closes a round, asking for another revision
opens one. The CLI itself is instant; the agent's time dominates.

The method does not converge on its own. After two `BLOCK` rounds on the same phase, either accept
the remaining findings as risks or reshape the scope, rather than reviewing the same objection a
third time.

## Development

```sh
pnpm test                # node --test, no dependencies to install
pnpm pack --dry-run      # or npm pack --dry-run: inspect exactly what ships
node bin/funky-forge.js  # run the working tree without linking anything
```

Layout: `bin/` entry point, `src/cli.js` dispatch, `src/commands/` one file per command,
`src/lib/` parsers and rules, `skill/` the method pack that `install` copies, `tests/` unit and
integration tests against real temporary directories.

## License

MIT
