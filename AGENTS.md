# AGENTS.md

Where things live in this repository, and the rules that keep it honest. Two axes: a **record** of what
was decided (`rfcs/`, `odd/tasks/`) and the **present** state (`docs/`, code, tests). A record is frozen
once settled; the present is edited freely in its own pull request.

## Paths

| Path | What it is |
|---|---|
| `src/` | `cli.js` for argv and dispatch, `commands/` for one file per command, `lib/` for what is reused |
| `skill/` | The agent skill that ships: `SKILL.md`, `references/`, `templates/`. |
| `scripts/` | The gates: `open-pr.js`, `wait-for-ci.js`, `check-pr-policy.js`, `pack-guard.js`, `release-guard.js`. |
| `docs/` | Architecture, the CLI manual, the method, artifacts and release; `docs/validation/` holds real runs. |
| `rfcs/` | The record: what was decided and why, frozen once settled. |
| `odd/tasks/` | Feature records: specs, tasks and an append-only log. |
| `CONTRIBUTING.md` | The rules a contributor reads first, the three facts of a pull request, and the checks. |

The module map, file by file, is in [`docs/architecture.md`](docs/architecture.md).

## Working rules

- **Issue first, then wait.** Open an issue with what and why, and wait for `status:approved`. Without
  that label, work may be built and not merged.
- **Three facts make a pull request reviewable**, and `scripts/check-pr-policy.js` checks them: the body
  links an issue (`Closes`/`Fixes`/`Refs #N`), exactly one `type:*` label, and a `type/description`
  branch with a Conventional Commit type.
- **A pull request is opened with `node scripts/open-pr.js`, never a sequence written by hand.** It puts
  the label in the creation, never opens a draft, adopts the pull request of the head instead of failing
  on a creation that finds it there, and decides on the **set** of runs of this commit: any red wins,
  `2` while any run is still going.
- **Waiting for CI is `node scripts/wait-for-ci.js <commit>`, never a loop written by hand.** Exit `0`
  passed, `1` failed, and **`2` never means failure**. Wait on the commit, not on the branch. It reads
  the matrix, not the run summary; on a push to `main` `pr-policy` reads `skipped`, which is not a
  failure to investigate.
- **Before a pull request:** `node --test` and `npm run pack:check`. A suite reporting fewer tests than
  the last run has not run faster. CI runs Ubuntu and Windows on Node 22 and 24; a red Windows leg is a
  real failure.
- **Conventional Commits, one logical change per commit.** Tests and the documentation that describes a
  behaviour travel in the same commit. No `Co-Authored-By` trailers.
- **Zero dependencies, no build step, no network at runtime.** `engines.node` is 22 or newer.
- **`files` is the package contract, and `prepublishOnly` enforces it**: `scripts/pack-guard.js` fails on
  any packed path outside `files` and on any entry that packed nothing. Ask npm for JSON explicitly — a
  lifecycle script inherits the configuration of its caller, so parsing human output fails only in CI.
- **The record is append-only.** A settled RFC is corrected by a dated `## Errata` or the next record,
  never rewritten; the log of an `odd/tasks/` document is only ever appended to.
- **Publishing is a human decision with a mechanical precondition.** CI stages and a maintainer approves
  with 2FA; the order and its preconditions are in
  [`.agents/skills/release/SKILL.md`](.agents/skills/release/SKILL.md).
