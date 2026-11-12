# Port `scripts/wait-for-ci.js`

Feature document for issue #37. The specification is the issue body, approved with `status:approved`;
this file records the decisions that refine it, the task order, and the evidence.

## Specs

- **S1 — Port, do not rewrite.** Issue #37, "What to do": "Copy `scripts/wait-for-ci.js` from
  `funky-secure` (214 lines, plus `tests/wait-for-ci.test.js`, 164 lines). Do not write a new one: the
  value is entirely in two decisions, and a bespoke version that diverged would be worse than having
  none." Source of record: `M:/funky-secure-v2` at `4e7b482`. Both files copied verbatim; the script
  is byte-identical to the source.
- **S2 — Three exit codes.** `0` passed, `1` failed, `2` unknown. Issue: "`2` never means failure — no
  run yet, still running, or the timeout ran out."
- **S3 — The matrix decides, not the summary.** Issue: "read `gh run view <id> --json jobs` and require
  every job to be in `SUCCESS`, `SKIPPED` or `NEUTRAL`."
- **S4 — Resolve the commit first.** Issue: "`gh run list --commit` needs the full SHA; an abbreviated
  one returns `[]`, which reads as \"no run yet\". Call `git rev-parse` before asking."
- **S5 — The four tests this repository needs.** Issue: "a run whose summary says success and whose
  jobs do not; a run that has not started yet, answered as `2` and not as `1`; the stale state field:
  `IN_PROGRESS` in the status while `jobs` shows a completed `success`; a branch push where
  `pr-policy` is `skipped`, which is the guard working and not a failure."
- **S6 — The suite and the packed set are unchanged.** Issue: "`node --test` stays green, and
  `pack-guard` still reports the same file count: **check `files` in `package.json` first** —
  `scripts/` must not enter the tarball."
- **S7 — AGENTS.md names the script and the two rules.** Issue: "`AGENTS.md` gains the line that names
  the script … The two lines already added in `funky-secure` (a watcher keyed on a branch can read an
  earlier commit's run; a suite reporting fewer tests has not run) are worth the same two lines here."
- **S8 — No shared dependency, no fourth exit code, no shipping the script.** Issue, "What not to do".

## Tasks

| ID | Spec | Route | Verified by |
|---|---|---|---|
| T1 | S1 | inline copy of both files from `funky-secure-v2` | `diff` against the source: byte-identical |
| T2 | S5 | inline: the two incidents the ported cases did not yet name | `node --test tests/wait-for-ci.test.js`: 14 cases |
| T3 | S7 | inline: one new rule bullet, one clause in the pre-PR rule | readback of `AGENTS.md` |
| T4 | S6, S2-S4 | inline: suite, pack-guard, live exit codes | 228 tests; 39 packed files; exit `0`, `2` live, `1` per case |

## Log

- **L1.** User verbatim: "quiero que revises el issue #37, debemos implementarlo ahora". Issue #37 is
  open with `status:approved` and label `type:ci`.
- **L2.** Scope decision: the four cases of S5 are a minimum, not a cap. The ported file's twelve cases
  also cover S3 (the matrix against the summary) and S4 (the full-sha resolution); deleting them to
  reach four would remove the only proof of two of the three decisions the issue calls the whole value.
  Kept all twelve, added the two incidents they did not yet name: the stale `IN_PROGRESS` status with a
  completed matrix, and the push to `main` where `pr-policy` reads `skipped`. Result: 14 cases.
- **L3.** No RED was possible for T2. Both new cases pin behaviour the verbatim port already
  implements, so the assertions pass the moment they are written; recording the honest reason instead
  of inventing a lifecycle.
- **L4.** `files` in `package.json` is `bin`, `src`, `skill`, `public`, `README.md`, `LICENSE`, and is
  left untouched: `scripts/` and `tests/` stay out of the tarball, and `pack-guard` still reports 39
  packed files against 6 entries.
- **L5.** Acceptance, live: exit `0` on `c0c4e865bba2069016cc99aa8d1fcd194561e0d8` (green `main` run
  `43125914263`, `pr-policy: skipped`), exit `2` on a commit with no run yet. Exit `1` has no live
  subject here: no commit in this repository's reachable history has a red *latest* run (the one red
  run, `41240301711`, was superseded for its commit by a later green run), so it is evidenced by the
  two cases that assert `FAIL` for a failed job and for a summary that disagrees with its jobs.
- **L6.** One work unit of 474 authored lines, past the ~400-line slice, and deliberately not split:
  214 of those lines are a verbatim copy of a file already reviewed in `funky-secure`, and the rest is
  its proof. Cutting the tests into a second pull request would separate a behaviour from the cases
  that pin it, which is the one split the repository rules forbid. The boundary is the file:
  `scripts/wait-for-ci.js` and `tests/wait-for-ci.test.js` arrive whole, and the rule in `AGENTS.md` is
  one bullet plus one clause in the pre-pull-request rule.
