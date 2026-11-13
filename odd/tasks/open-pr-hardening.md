# open-pr hardening: four rules proven in funky-secure

Port four rules the sibling repository proved, into `scripts/open-pr.js` and `scripts/pack-guard.js`.
Behaviour, not code: the two repositories diverged deliberately, and a port inherits the original's gaps
without inheriting the context that justified them.

Source of truth: Engram `1769` (handoff from the secure session), itself grounded in secure's
`docs/decisions.md` **I-74**, **I-75**, **I-76** and in `SEC-X3` (`1764`), `SEC-X4` (`1766`), `SEC-X5` (`1767`).
The order below is mandatory: the first is the only one that can produce a false green.

## Specs

**S1 — Adoption needs evidence, and the ceiling is never adopted.** — the rule quoted from `1769`:

> adoption happens **only** when `created.ok !== true` (a creation that succeeded with an unreadable URL is
> the red it always was);
>
> the lookup row must be **at the commit under test** — `headRefOid === sha`. `gh`'s refusal wording is
> **not** evidence: a fork pull request carrying the same head branch name is adopted on that wording alone;
>
> a creation killed at its **ceiling** is **never** adopted, whatever the lookup then finds. A pull request
> that timed-out creation made itself sits at this commit exactly like one that already existed, so nothing
> can tell them apart — `createdAt` would be a clock guess. Refuse, do not guess.

Each clause is its own test: a creation that succeeded with an unreadable URL is RED and does not look for a
pull request; a lookup row whose `headRefOid` differs from `sha` is not adopted; a creation that timed out is
`2` and adopts nothing. "There is no pull request for this head" stays distinct from "the pull request of this
head cannot be read".

**S2 — `pack-guard.js` finds npm on Unix.** — from `SEC-X3` (`1764`):

> Fixed in secure as `npmOnPath` with injectable probes (`env`, `exists`, `real`), resolving `PATH`/`Path`
> and following the symlink to `npm-cli.js`, never accepting a shell shim.

Today `npmCli()` answers only `npm_execpath` or the CLI bundled beside `process.execPath`, and throws
otherwise, so a human running `node scripts/pack-guard.js` directly on Unix — where `npm` is a symlink to
`npm-cli.js` in a different prefix — gets a refusal that names the wrong problem. The resolution must accept
`PATH` and `Path`, follow a symlink to the CLI, refuse a `.cmd`/shell shim, and stay injectable so the tests
do not depend on the machine.

**S3 — The wait follows the pull request's head, not the local HEAD.** — from `SEC-X4` (`1766`):

> Fixed in secure as PR **#243**: `git ls-remote origin refs/heads/<head>` before anything is created,
> refusing with both shas when the remote branch is not the commit in front of you; a remote that cannot be
> read is a refusal, never an assumption of equality.

Measured cost before the fix: 10m 50s spent and `2`, with a reason that was true and useless. The check
belongs before the creation, next to the floor read, and it must name both shas.

**S4 — One decreasing budget.** — from `SEC-X5` (`1767`):

> Fixed in secure as PR **#245**: one deadline taken before the first `gh` child, every child reading
> `remainingMs()` floored at one second, the wait handed `remainingSeconds()` and printing that number.

Before: 600 s for the floor read, 600 for the creation, 600 for the wait and 600 per `run view` — a declared
ten minutes that could hold the ritual open for forty. After: a declared ten minutes is ten minutes.

## Tasks

| ID | Spec | Route | Commit |
|---|---|---|---|
| T1 | S1 | inline, test-first: three RED tests (one per clause), then the fix | `618cf20` — fix(scripts): adopt only the pull request of this commit, only after a failed creation |
| T2 | S2 | inline, test-first with injected probes | `a774649` — fix(scripts): find npm on Unix by following its path to the CLI |
| T3 | S3 | inline, test-first with an injected remote reader | `99ed08e` — fix(scripts): refuse when origin's branch is not the commit in front of you |
| T4 | S4 | inline, test-first: the budget is measured, not assumed | `6db3ba5` — fix(scripts): spend one budget, so a declared timeout is the whole ritual |

T1 and T2 are disjoint in files; T2 may travel in its own commit while T1 is being proven. T3 and T4 change
`scripts/open-pr.js` again and land after T1, so each is reviewable alone.

## Log

- **L1.** User's request, verbatim: "revisa la memoria 1769, quiero trabajar en ello, odd y rdd. Dime si está
  todo listo para arrancar".
- **L2.** User's decision, verbatim: "arranca, 1 issue" — one issue for the four rules, and work starts.
- **L3.** Audit of the four rules against this repository before any write: base `main 8637843` (the merge of
  #42), tree clean, RDD on. (1) one of three clauses present — the ceiling guard at `scripts/open-pr.js:468`,
  while `:473` also enters adoption when the creation succeeded with an unreadable URL, and the lookup at
  `:231` asks `--json number,url` without `headRefOid`; (2) absent — `scripts/pack-guard.js:96-102` answers
  only `npm_execpath` or the bundled CLI; (3) absent — no `git ls-remote` anywhere; (4) absent —
  `scripts/open-pr.js:366` hands every `gh` call the whole timeout, and only the wait keeps its own account
  (`:279`). Live trap while (1) is unfixed: if the ritual prints `adopted`, compare `headRefOid` by hand
  before trusting the verdict.
- **L4.** T1 in `618cf20`. RED first: the two new tests failed while the script still adopted on a succeeded
  creation and on a row from another commit. The lookup now asks `--json number,url,headRefOid` and a row is
  adopted only at the commit under test; a creation that reported success never enters the adoption branch,
  so its unreadable URL is red; the ceiling guard stays. Three mutations, each failing exactly one test:
  the old entry condition (`not ok 35`), the row taken without asking its commit (`not ok 36`), the ceiling
  guard removed (`not ok 30`). Restored byte for byte (`sha1sum`).
- **L5.** T2 in `a774649`. `npmCli` is exported and takes injected probes (`env`, `exists`, `real`):
  `npm_execpath`, then the bundled CLI, then `npm` on `PATH`/`Path` whose link is followed and whose target
  decides, a shim never being an answer because this interpreter cannot run it. Five tests; four mutations
  isolate them one by one — bundled not consulted (`not ok 8`), link not followed (`9`), only `PATH` read
  (`10`), any target accepted (`11`).
- **L6.** T3 in `99ed08e`. `git ls-remote origin refs/heads/<head>` runs before the floor read and answers
  three ways kept apart: the commit, which must be the one in front of you; no such branch; a remote that
  did not answer. A mismatch names both commits and creates nothing. Three mutations isolate the three
  tests. The 18 existing `run()` fixtures now answer about the remote too, which is the point: a machine
  that cannot answer is a refusal.
- **L7.** T4 in `6db3ba5`. One deadline taken before the first child, `remainingMs()` for every child with a
  one-second floor, `remainingSeconds()` for the wait and for the line it prints, and the poll inside the wait
  bounded by the same deadline instead of its own clock — that last part is why the first attempt still
  handed two polls the same number. Four mutations isolate the three tests. The old test that pinned "every
  child is handed 30 s" was pinning the defect and now pins the replacement.
- **L8.** Verification: `node --test` 285/285, `npm run pack:check` green (39 packed files against 6 entries),
  every mutation repeated by hand and every script restored byte for byte. Risk: item 1 (a false green is the
  failure this file exists to prevent), item 3 (the adoption contract and the printed messages other tooling
  reads), item 5 (the ritual that opens pull requests) and item 6 (a wait nobody can observe in a unit test).
  High risk, so the native review is due before delivery.
- **L9.** Native review, lineage `review-d5c34bfe71fac667`, tier `high`, 581 changed lines, lenses
  risk/resilience/reliability, correction budget 200. Three reviewers and the refuter ran; the refuter
  admitted one candidate-caused BLOCKER, mine: the new `Path` test in `tests/pack-guard.test.js` fabricated
  `C:\tools` and split it with the host delimiter, so on POSIX the drive letter's colon split the value and
  the case would have failed on the platform it was not describing — a green Windows leg is not a green
  matrix. Corrected in `74efbfe` (10 diff lines against the frozen 200): the directory is built with `join`,
  which keeps the point and drops the claim the case could not make on Linux. Targeted validator approved it,
  and the acknowledgement burned the authority (`gentle-ai.review-acknowledged/v1`).
- **L10.** Six advisory findings stand as later work and do not reopen this candidate: R3-002
  (`scripts/open-pr.js:220`), R3-003 (`:550`), R3-004 (`scripts/pack-guard.js:139`), R3-005 (SUGGESTION,
  `scripts/open-pr.js:788-798`), R4-001 (`:648`), R4-002 (`scripts/pack-guard.js:132`).
- **L11.** Delivered as pull request #44, opened by `node scripts/open-pr.js` with `type:bug` and `Closes #43`
  (suite green, packed set green, policy green). The run of `f125bff` was read over the set: `43370335326`
  and `43370334715`, both `passed`, every job success on `ubuntu-24.04` and `windows-2025` for Node 22 and
  24 — the Ubuntu legs are the ones the corrected `Path` case protects. Two of the four rules showed
  themselves in that output: the wait printed `up to 894s`, the seconds left of the declared 900 after the
  suite and the packed set rather than the declared number, and the remote check passed before anything was
  created.
- **L12.** CI on `b770e61` came back red: `test (windows-2025, 24)` failed with `29999 !== 30000` in
  `every gh call is bounded, not only the watch` — my own assertion, in the test I updated for S4. The
  deadline is taken from a real clock and the milliseconds already spent are subtracted, so a machine one
  millisecond slower hands the first child 29 999; the fake-clock cases pin the arithmetic exactly, and that
  one had no business demanding a constant. Fixed in `9175022`: no child past the budget, none handed
  nothing, the first handed the whole of it minus what was already spent. Run `43370600961` passed on all
  four legs.
- **L13.** The fix changed the candidate, so `assess` reported the review due again. Second lineage
  `review-4d7dd00fbca339d4`, one lens (`reliability`, because what changed is what a test pins), 610 lines,
  correction budget 200: approved with three advisory findings, none blocking (`scripts/open-pr.js:648`,
  `tests/open-pr.test.js:738`, and a suggestion at `scripts/open-pr.js:789-799`). Explicitly not
  re-reviewed as a whole under three lenses — the four rules were already approved in
  `review-d5c34bfe71fac667`, and a change that touches one concern pays for one lens.
