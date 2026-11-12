# Port `scripts/open-pr.js`

Feature document for issue #39. The specification is the issue body, approved with `status:approved`
and label `type:ci`; this file records the decisions that refine it, the task order, and the evidence.

## Specs

- **S1 — Source of record, at the commit the issue names.** `funky-secure` at `main 5cfd372`. Issue
  #39: "read it there, do not fetch it from memory or from an older copy". Files: `scripts/open-pr.js`
  (467 lines), `tests/open-pr.test.js` (390, 15 cases), `scripts/wait-for-ci.js` (268),
  `tests/wait-for-ci.test.js` (273, 19 cases).
- **S2 — The command line.** Issue, verbatim:
  `node scripts/open-pr.js --base main --title "<title>" --body-file <path> --label <type:...> [--head <branch>] [--repo <owner/name>] [--timeout <seconds>]`.
  "A missing required option prints every problem at once, prints that usage, and creates nothing.
  `--help` prints the same usage and exits `0` without touching `gh`."
- **S3 — The decisions the port must keep.** Issue: "The suite runs first and a red one refuses, naming
  the failing count, before anything is created"; "`check-pr-policy` runs through the function CI runs —
  `run` imported from `scripts/check-pr-policy.js`"; "The label travels in the creation: `gh pr create
  --draft --label`"; "The run is selected by `headSha`, never by being the newest of the branch";
  "`decideGate` is imported from `scripts/wait-for-ci.js`, never re-implemented"; "Every child is
  bounded. `gh` by the wait budget, the suite and `npm pack` by their own ceilings, local `git` by a
  local one"; "The verdict is the matrix"; "A timeout is exit `2`"; "The matrix is printed".
- **S4 — Porting hazards.** Issue: "The default repository name. Secure's copy defaults to its own
  repository. A literal copy that still names `funky-secure` opens the pull request in the wrong
  repository"; "`scripts/` must stay out of the published tarball"; "The suite command, in one place,
  not spelled in two."
- **S5 — `AGENTS.md`.** Issue: "One line, next to the existing ones: open a pull request with
  `node scripts/open-pr.js` and never a hand-rolled loop. Do not add a rule about the label race
  without the mechanism that removes it."
- **S6 — Acceptance.** Issue: "The 15 tests ported, plus whatever the port itself needs. Every refusal
  is covered: a red suite, a policy refusal, an incomplete command line, `--help` touching nothing";
  "Two mutations, recorded in the pull request: disable the red-suite refusal and confirm that exactly
  its test fails; make the verdict read the run summary instead of the matrix and confirm that exactly
  its test fails"; "The pull request that introduces the script is opened by it"; "`npm pack --dry-run`
  does not list `scripts/`"; "The suite stays green (230 tests on `main` today)".

## Tasks

| ID | Spec | Route | Verified by |
|---|---|---|---|
| T1 | S1 | worker: refresh `wait-for-ci.*` to `5cfd372` and restore the two incidents #37 pinned | 21 cases |
| T2 | S1-S4 | worker: adapt `open-pr.*`, remove the source repository's name, add the bounded packed-set gate | 17+ cases |
| T3 | S5 | worker: the rule that names the command | readback of `AGENTS.md` |
| T4 | S6 | parent: mutations, suite, pack-guard, `npm pack --dry-run` | recorded in the PR |
| T5 | S6 | parent: commit, push, open the pull request **with the script itself** | the PR |

## Log

- **L1.** User verbatim: "tenemos un nuevo issue , hay que atacarlo igual, odd y rdd". Issue #39 is open
  with `status:approved` and `type:ci`.
- **L2.** User chose the base: merge #38 first, then branch from `main`. #38 was merged as `4142ceb`,
  so `ci/open-pr` starts from it and carries no commit of the previous port.
- **L3.** The issue names `npm pack` among the children that must be bounded, and `5cfd372` has no such
  step: `open-pr.js` there runs only the suite. The port therefore adds one bounded step between the
  suite and the policy, invoking `process.execPath` on `scripts/pack-guard.js` — which is exactly what
  `npm run pack:check` runs, and the only form that works on Windows, where `npm` is not an executable
  without a shell. It refuses with its own message and creates nothing, and it is skipped silently when
  the guard is absent.
- **L4.** `5cfd372`'s `wait-for-ci.js` already carries the two corrections #37's review demanded (a
  non-accepted summary over a green matrix is `unknown`; every `spawnSync` carries `childOptions`), so
  the refresh is additive: `describe()` and `query.problem`, which make a failed `gh` call name itself
  instead of claiming "no run for this commit yet". Two incidents #37 pinned — the stale `IN_PROGRESS`
  status and the push where `pr-policy` reads `skipped` — are absent upstream and are restored here.
- **L5.** The two mutations of S6, run against throwaway copies of the ported pair so the worktree was
  never mutated (`open-pr.test.js`, 18 cases each time):
  - red-suite refusal disabled (`if (!tested.ok)` → `if (false && !tested.ok)`) leaves **exactly one**
    case failing: `a red suite refuses before anything is created and names the failing count`.
  - verdict taken from the run summary instead of the matrix, keeping `decideGate`'s printed lines
    leaves **exactly one** case failing: `the gate is the matrix, and the summary is not`.
  Mutation hygiene, learned the hard way here: the first attempt at the second mutation replaced the
  verdict wholesale, so it also dropped the matrix lines and broke two cases. A mutation that changes
  two things proves neither, so the recorded one keeps the output shape and moves only the signal.
- **L6.** `npm pack --dry-run` lists no path under `scripts/`; the packed set is still 39 files against
  the six entries of `files`, and `pack-guard` agrees.
- **L7.** Slice boundary, recorded because the two commits are 207 and 1197 authored lines: this port is
  two work units and no more. The first is the `wait-for-ci` refresh, which is a different behaviour
  from the ritual and stands alone. The second is `open-pr.js` with its 18 cases, and it is not split
  further: separating a ported script from the cases that pin it would separate a behaviour from its
  proof, and cutting the script itself into two commits would present half a ritual as a step.
- **L8.** The native review (`review-28b861b24bb2b020`, lenses resilience and reliability) confirmed
  five candidate-caused findings, two of them `BLOCKER`, and the ritual diverges from `5cfd372` to
  answer them. They were three defects wearing five numbers:
  - `R3-001`/`R4-001`: only the watch passed a ceiling; `gh pr create`, `pr ready`, `run list` and
    `run view` were unbounded, so a stalled `gh` held the ritual open while the issue requires every
    child to be bounded. Every call now goes through one `gh` wrapper carrying the wait's budget.
  - `R3-002`/`R4-002`: the pre-ready snapshot was taken *after* the creation, so the `opened` run of the
    same commit could be invisible to it and later selected as the deciding run; and a failed `run
    list` returned `[]`, which is the same answer as "no runs". The snapshot now happens before the
    creation, and `listRuns` answers `null` on failure so the command refuses instead of guessing.
  - `R4-003`: the commit was always read from the working tree, so `--head other` waited on a branch
    nobody asked about until the timeout, and a `git` failure yielded an empty SHA silently. It is now
    resolved from the head branch (local, then `origin/<head>`, then the working tree only when it is
    on that branch), and an unresolvable commit refuses before anything is created.
  Three cases pin the corrections: every `gh` call carries the budget, a blind snapshot refuses, an
  unresolvable commit refuses. 21 cases in the file, 256 in the suite.
- **L9.** The targeted validator **rejected** the correction (`state: escalated`,
  `targeted_validator_rejected`). Three findings it accepted as addressed: `R3-001`/`R4-001` (every `gh`
  call now carries the budget), `R3-002` (a failed snapshot refuses instead of returning `[]`) and
  `R4-003` (the commit comes from the head branch, and an unresolvable one refuses before the first
  call). One it did not, and it is right: moving the snapshot *before* the creation means the `opened`
  run that this very command fires can never be in the exclusion set, so `findRun` can still select it
  after `gh pr ready` and report a green draft as the verdict. That is `REG-001`, a regression my own
  correction introduced, and no amount of re-running fixes it: the deciding run has to be told apart
  from the draft's, and by id alone it cannot be. The correction budget is spent, so the next step is a
  maintainer decision, not another attempt inside this lineage.
- **L10.** The criterion was wrong, not just the placement. A reviewer of the sibling repository named it
  and the reasoning is now the specification: identifying the deciding run **by exclusion of a set** has
  a race in every arrangement, because the set can grow after it is read. Waiting for the draft's run
  before `gh pr ready` — my first proposal — only trades the race for a tool that refuses in every
  repository whose CI skips drafts, which is the common arrangement, so it would be unusable where it is
  most needed. The replacement is a floor, not a set: `databaseId` is global and monotone by creation, so
  the run of the earlier event has the smaller id whether or not it is visible yet.
  - `maxIdBefore` = the greatest `databaseId` among the runs of this commit, taken immediately before
    `gh pr ready`, or `0` when the branch has none.
  - After ready, the deciding run is the one of this commit whose id is above that floor. Exactly one,
    it decides. Two or more, it is ambiguous and the answer is `2`, never a pick. None within the
    budget, `2`.
  - A `gh pr ready` that reports the pull request was already ready fired no event, so no run can be
    attributed to it: `2`.
  - No `Date.now()`, no `createdAt`: the API's clock and this machine's are not the same clock. That
    constraint is the reason the floor is an id.
  The false green is the worst defect this script can carry — it authorizes what was not authorized and
  breaks nothing visible — so the first test is that false green, written red before the fix.
- **L11.** Two reads, because they have two jobs, and the fork was worth naming:
  1. **Before `gh pr create`** — fail-closed only: if the runs cannot be read, refuse and create nothing.
     The ids it returns are discarded; its value is that a blind command never creates a pull request.
  2. **Immediately before `gh pr ready`** — the actual `maxIdBefore`. The draft exists by then, so the
     `opened` run it fired is normally behind the floor. If this second read fails, the draft was created
     and is deliberately **not** marked ready: a draft that never fires the deciding event is harmless,
     and guessing is not.
  Taking the floor only before the creation (the first implementation) leaves floor `0` in the common
  case, so the `opened` run is still the sole candidate above it and the false green survives: the
  placement is part of the criterion, not a detail of it.
- **L12.** The second review (`review-5c63c4b2448a0e3b`) confirmed six findings that were again three
  defects, all in the same decision:
  - **A single candidate is not a decision.** The `opened` run is created before the deciding one but can
    become visible after the floor was read, and a floor read while it was invisible is `0` — so a poll
    could see it alone and report the draft's verdict. The criterion is now a property, not a mechanism:
    a set decides only when a second read one interval later agrees. One id twice decides; a set that
    grew is `2` naming both ids. No dependence on drafts and none on the clock.
  - **A timeout is never a red gate.** The suite, the packed set, `gh pr create` and `gh pr ready` read
    only `ok`, so a child killed at its ceiling was reported as `1`. All four answer `2` now, each naming
    the state it may have left behind, through one `unanswered()` helper so the wording cannot drift.
  - **Each poll spends the remaining budget**, not the whole one: a stalled `run list` on every attempt
    used to cost `attempts × timeout`.
  **Errata to L10.** L10 forbids `Date.now()` and `createdAt`. The constraint is about *identifying and
  ordering runs* — the floor is an id precisely because the API's clock is not this machine's. Local
  elapsed-time accounting is a different question and is now used for the remaining budget (`findRun`),
  where both ends of the measurement are this process. The prohibition stands for identity; it never
  covered the wait's own stopwatch.
- **L13.** The targeted validator **rejected** the second correction (`state: escalated`) with two
  mechanical findings, and both are right:
  - `R3-002`/`R3-003` (timeouts) and the `listRuns` contract were accepted as addressed.
  - **`R3-004`/`R4-002` unmet, mechanically:** `findRun` computes the remaining budget and passes it to
    `listRuns`, but `listRuns` calls the `gh` wrapper, and the wrapper ignores per-call options and always
    uses `options.timeout * 1000`. The remaining budget never reaches the poll. A one-line class of bug.
  - **`R3-001`/`R4-001` unmet, and this is the design conclusion:** a second read agreeing does not
    discriminate, because the two states — "the deciding run has not been created yet" and "this is the
    deciding run" — produce the same single candidate. The draft's run always has the smaller id and can
    surface at any time, so **no poll over ids can tell them apart**. The id floor is a pre-filter, not
    proof of provenance.
  **What would actually close it.** Provenance has to come from the event, not from the ordering: read the
  run's own `createdAt` and the `ready_for_review` event's `created_at` from the API, and require the run
  to be at or after the event. That is the one clock comparison that is legitimate — the earlier
  prohibition on clocks was about comparing this machine's clock with the API's, and here both ends come
  from `gh`. The id floor stays as the cheap pre-filter; the provenance test replaces the second read.
  A cheaper alternative, if the API call is not wanted: refuse (`2`) whenever the newest run of this
  commit was created before the ready call could have taken effect, and say the deciding run could not be
  attributed — a tool that says "I cannot tell" instead of "passed".
- **L14.** Third review (`review-5c63c4b2448a0e3b`) ended `escalated`: the targeted validator rejected the
  correction with two findings. Both were checked against the code, not taken on trust, and they did not
  have the same status:
  - **`R3-004`/`R4-002` — refuted.** The finding said the remaining budget never reaches a poll because
    `listRuns` calls the `gh` wrapper, which ignores per-call options. `listRuns` takes the `exec` it is
    given and forwards `timeoutMs` to it (`scripts/open-pr.js:676-679`), and `findRun` passes the raw
    `exec`, not the closure, with `remaining * 1000` (`scripts/open-pr.js:227-228`). The closure the
    finding pointed at is `gh` (`scripts/open-pr.js:309`), used for a single floor read that has no wait
    budget to spend. Recorded as refuted with those lines, not as fixed.
  - **`R3-001`/`R4-001` — accepted**, and it is the one that mattered.
  **The fixed rule, now written as a property instead of a mechanism:** *a run belongs to the event that
  created it.* Ids only narrow the field; they cannot decide, because the draft's run carries the same
  commit, has the smaller id, and can surface at any time — so "the deciding run does not exist yet" and
  "this is the deciding run" are the same observation. What separates them is the stamp the API put on
  the event: `open-pr.js` reads the newest `ready_for_review` `created_at`
  (`gh api repos/{owner}/{repo}/issues/N/timeline --paginate --jq`), and a run is a candidate only when
  its `createdAt` is at or after it. **Both ends come from GitHub**, which is why this is not the clock
  L10 forbids: that rule is about trusting this machine's clock against a remote one.
  A time that cannot be read is not guessed: the pull request is already ready, the run fires, and the
  command answers `2` saying it was not watched. The two-read agreement stays as a second net.
  **Evidence**: 4 new cases (`readyEventTime` parsing, the draft's run alone and forever, the deciding run
  appearing later, an unreadable event time); `tests/open-pr.test.js` 31 → **35**, suite 266 → **270**.
  Mutation: returning the runs unfiltered kills exactly those two cases that pin the property and
  nothing else, which is what a property looks like when it is load-bearing.
