# Reference map

Paths in this pack are relative to the pack root: `skill/` in the repository, installed as
`.agents/skills/funky-forge/` or `.claude/skills/funky-forge/`. Read this once at activation.
Everything the method writes lives in `.funky-forge/` at the project root; nothing lives in a
separate state file.

## Artifact layout

| File | Phase | `depends_on` | Gate report |
|---|---|---|---|
| `.funky-forge/assumptions.md` | — (variables) | — | — |
| `.funky-forge/brief.md` | `problem` | `[]` | `gates/1-problem.md` |
| `.funky-forge/design.md` | `design` | `[problem]` | `gates/2-design.md` |
| `.funky-forge/estimate.md` | `estimate` | `[problem, design]` | `gates/3-estimate.md` |
| `.funky-forge/proposal.md` | `proposal` | `[problem, design, estimate]` | `gates/4-proposal.md` |
| `.funky-forge/decisions.md` | append-only log | — | — |

`depends_on` lists phase names, never file names. The names, paths, and gate file names are
fixed; do not invent variants.

## Frontmatter

Every artifact starts with:

```yaml
---
schema: 1
phase: design            # problem | design | estimate | proposal
status: draft            # draft | in_review | approved | stale | rejected
depends_on: [problem]    # phase names
language: en
proposal_language: en    # proposal only; defaults to language
approved_by: null
approved_at: null
approved_hash: null      # sha256:<hex> of the normalized body
method_version: 1
---
```

`schema` is the artifact format the CLI validates; `method_version` is the pack version recorded
when the artifact was written. Never change either by hand.

## Statuses

| Status | Meaning | Can advance |
|---|---|---|
| `draft` | Being written | No |
| `in_review` | Gate in progress | No |
| `approved` | Human approved after a passing gate | Yes |
| `stale` | An approved dependency changed | No, until re-gated |
| `rejected` | Human declined the phase | No, until rewritten |

An artifact can be `approved` only when every dependency is `approved`. Changing an approved
artifact marks every dependent `stale` and revokes its own approval: set its status back to
`draft` and clear `approved_*`. `stale` keeps the content; it only loses approval.

## Commands

| Command | Does | Exit |
|---|---|---|
| `funky-forge install [--target <agents\|claude>] [--dry-run] [--with-pointer] [--force] [--json]` | Copies the pack into `.agents/skills/funky-forge` or `.claude/skills/funky-forge` | `0` ok, `1` error, `2` `TARGET_AMBIGUOUS` |
| `funky-forge init [--language <en\|es>] [--proposal-language <en\|es>] [--force] [--json]` | Creates `.funky-forge/` with templates and skeletons | `0` ok, `1` error |
| `funky-forge check <phase> [--json] [--strict]` | Validates schema, dependencies, hash, gate report, arithmetic, consistency; read-only | `0` pass, `1` fail |
| `funky-forge calc [--write] [--json]` | Recomputes the estimate | `0` ok, `1` invalid input |

`check --json` returns `{ ok, phase, bodyHash, errors, warnings }`. `bodyHash` is the value you
copy into `approved_hash`; never compute it yourself. `--strict` turns warnings into errors.

## Approval procedure

1. `check` passes.
2. Reviewer gate passes and `gates/<n>-<phase>.md` exists.
3. `check` passes again with the report on disk.
4. Human approves.
5. `approved_hash` ← `bodyHash` from `check --json`; `status: approved`; `approved_by`,
   `approved_at` filled; decision appended to `decisions.md`.

## If the CLI is unavailable

Apply every check listed in the phase reference by hand, say `check: manual` in the gate report
body, and record what you verified. The process degrades; it does not become optional.

## Rules that are easy to break

- Do not copy prompts or guides into the project. The method is versioned with the tool.
- Do not keep a second source of truth: no notes file, no TODO list of phases, no state JSON.
- Do not approve on the reviewer's prose. The verdict must be a recorded report.
- Do not re-run a phase after approval to "improve" it; that is a new revision with a new gate.
