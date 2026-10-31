# AGENTS.md

Where things live in this repository, and the rules that keep it honest. Two axes: a **record** of what
was decided (`rfcs/`, `odd/tasks/`) and the **present** state (`docs/`, code, tests). A record is not
edited once it is settled; the present is edited freely in its own pull request.

## Paths

| Path | What it is |
|---|---|
| `bin/funky-forge.js` | the entry point, and the only thing `bin` in the manifest points at |
| `src/` | `cli.js` for argv and dispatch, `commands/` for one file per command, `lib/` for everything reused |
| `skill/` | the agent skill that ships: `SKILL.md`, `references/`, `templates/` |
| `public/` | the diagram the README renders, and nothing else |
| `docs/architecture.md` | the modules, the flows and the invariants |
| `docs/cli.md` | every command, flag and output shape: the operating manual |
| `docs/method.md` | the method the CLI implements, in prose |
| `docs/artifacts.md` | the files a run produces and what each one is for |
| `docs/validation/` | real projects the method was exercised on |
| `docs/images/diagrams.md` | how the shipped diagram is made, so it can be remade |
| `rfcs/` | the record: what was decided and why, frozen once settled |
| `odd/tasks/` | feature records: specs, tasks and an append-only log |
| `scripts/pack-guard.js` | the publish gate: the packed set against the `files` contract |
| `scripts/check-pr-policy.js` | the pull-request policy CI runs |
| `tests/` | the suite; `node --test`, no framework |
| `CONTRIBUTING.md` | the rules a contributor reads first |
| `.agents/skills/release/SKILL.md` | the release runbook the maintainer follows |

## Working rules

- **Issue first, then wait.** Open an issue with what and why, and wait for `status:approved`. Without
  that label, work may be built and not merged.
- **A recommendation is not authorization.** A review, a comparison, a problem statement or a
  suggestion is read-only: answer, then wait. Implement only when the change itself was asked for.
- **Three facts make a pull request reviewable**, and `scripts/check-pr-policy.js` checks them: the
  body links an issue (`Closes`/`Fixes`/`Refs #N`), exactly one `type:*` label is applied, and the
  branch is `type/description` with a Conventional Commit type.
- **Conventional Commits, one logical change per commit.** The tests and the documentation that
  describe a behaviour travel in the same commit as the behaviour. No `Co-Authored-By` trailers.
- **Before a pull request:** `node --test` and `npm run pack:check`. CI runs the suite on Ubuntu and
  Windows for Node 22 and 24; a red Windows leg is a real failure.
- **Zero dependencies, no build step, no network at runtime.** `engines.node` is 22 or newer and there
  is nothing to install.
- **`files` is the package contract, and the gate enforces it.** `prepublishOnly` runs the suite and
  `scripts/pack-guard.js`, which fails on any packed path outside `files` and on any entry that packed
  nothing. The guard asks npm for JSON explicitly: a lifecycle script inherits the configuration of the
  command that invoked it, so parsing `npm pack`'s human output is a defect that only appears in CI.
- **The record is append-only.** A settled RFC is corrected by a dated `## Errata` or the next record,
  never rewritten; the log of an `odd/tasks/` document is evidence and is only ever appended to.
- **Publishing is a human decision with a mechanical precondition.** CI never publishes directly: it
  stages, and a maintainer approves with 2FA. The order lives in
  [`.agents/skills/release/SKILL.md`](.agents/skills/release/SKILL.md), whose preconditions decide
  whether a release can proceed at all.
