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
| T1 | S1 | inline, test-first: three RED tests (one per clause), then the fix | `fix(scripts): adopt only the pull request of this commit, only after a failed creation` |
| T2 | S2 | inline, test-first with injected probes | `fix(scripts): find npm on Unix by following its path to the CLI` |
| T3 | S3 | inline, test-first with an injected remote reader | `fix(scripts): refuse when origin's branch is not the commit in front of you` |
| T4 | S4 | inline, test-first: the budget is measured, not assumed | `fix(scripts): spend one budget, so a declared timeout is the whole ritual` |

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
