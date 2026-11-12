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
| `docs/release.md` | how a version ships: staging over OIDC, the human approval, the tag, the registry traps |
| `docs/images/diagrams.md` | how the shipped diagram is made, so it can be remade |
| `rfcs/` | the record: what was decided and why, frozen once settled |
| `odd/tasks/` | feature records: specs, tasks and an append-only log |
| `scripts/pack-guard.js` | the publish gate: the packed set against the `files` contract |
| `scripts/release-guard.js` | the release gate: the tag must name the version in the manifest |
| `scripts/stage-report.js` | reads the stage id out of npm's `--json` report and puts it in the run summary |
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
- **A pull request is created ready, and the runs it fires are decided as a set.**
  `node scripts/open-pr.js` puts the label in the creation and never opens a draft, because GitHub does
  not say which pull-request action created a run: a draft's `opened` run and the `ready_for_review` run
  carry the same commit and both report `event: pull_request`, so a ritual with two events cannot tell
  them apart afterwards, and one that avoids the second event does not have to. The price of that choice
  is named rather than hidden: an interrupted ritual leaves a **real pull request** instead of a harmless
  draft, which is why `node scripts/open-pr.js` adopts the pull request of the head instead of failing on
  a creation that finds it already there. It is not one event
  either — the workflow triggers on `labeled`, so a labelled creation fires `opened` and `labeled`, two
  runs of this commit. The floor of run ids is read before anything is created, every run past it is a
  candidate, the set is polled until it stops growing, and the set decides: any red wins, an all-green
  set is green printing every id, and anything still running is `2`. The trigger list is not narrowed for
  it: `labeled` is a real guard for a hand-made pull request. A state string can
  still be stale — `gh pr checks --json state` has shown `IN_PROGRESS` for a job whose `conclusion` was
  `success` on a completed run — so read the conclusion with `gh run view <run> --json jobs` when the two
  disagree, and never wait on the state list.
- **Waiting for CI is `node scripts/wait-for-ci.js <commit>`, and it is never a loop written by hand.**
  It exits `0` passed, `1` failed and `2` unknown, and `2` never means failure: no run yet, still
  running, or the timeout ran out. Wait on the commit and not on the branch — a watcher keyed on the
  branch can answer with an earlier commit's run, which is how a green run gets reported as a problem.
  The gate it reads is the matrix and not the run summary: on a push to `main` the guard makes
  `pr-policy` read `skipped`, and that is not a failure to investigate.
- **A pull request is opened with `node scripts/open-pr.js`, never a sequence written by hand.** The
  suite, the packed set, the policy, a labelled ready pull request, then the run of this commit: one
  command runs that order.
- **Conventional Commits, one logical change per commit.** The tests and the documentation that
  describe a behaviour travel in the same commit as the behaviour. No `Co-Authored-By` trailers.
- **Before a pull request:** `node --test` and `npm run pack:check`. A suite reporting fewer tests than
  the last run has not run faster, so read the count before trusting a green. CI runs the suite on
  Ubuntu and Windows for Node 22 and 24; a red Windows leg is a real failure.
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
