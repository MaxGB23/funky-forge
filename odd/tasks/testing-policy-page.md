# Testing policy page: when a test is required, and what makes one admissible

Feature document for issue #53 (`feat: a page states when a test is required and what makes
one admissible`). The plan was refuted by a blind two-judge round before implementation
(`round-1-adjudication` kept locally in `.funky-judge-drafts/`); this document records the
adjudicated v2 plan as its specification. The method source is a sibling repository's page
adapted as method only — every number below was measured here.

## Specs

- **S1 — The page.** `docs/testing.md` states when a test is required and what makes one
  admissible, every rule measured against this suite (24 test files, 4862 lines, 288 tests,
  0 skips on a green run). Where the suite violates a rule the page names the violation as
  debt with `path:line`, not precedent. Written refusals carry their reason: no coverage
  target, no file-length caps, no meta-test policing test names. No measured number is
  copied from any other repository. (Issue #53 body, plan v2 T4.)
- **S2 — Three surfaces, no orphan.** The page is linked from `CONTRIBUTING.md:33-39` (the
  checks), a row in the `AGENTS.md` paths map, and a row in the `README.md` docs table —
  the last mandatory because `tests/docs.test.js:92-99` fails without it. No `docs/README.md`
  is created: `README.md:137-142` is this repo's index surface. (Issue #53 body, plan v2 T5.)
- **S3 — The forcing function.** `tests/docs.test.js` gains a test asserting every path
  named in the `AGENTS.md` paths map exists; today no test reads `AGENTS.md`. (Issue #53
  body, plan v2 T6.)
- **S4 — One work unit, checks green.** One Conventional Commit carries page, links and
  test; the feature document lands as its own record commit, as repo precedent does
  (`method-pack-version` T1). `node --test`, `npm pack --dry-run` and `npm run pack:check`
  green before any pull request. (Plan v2 T7; `CONTRIBUTING.md:33-39`, `AGENTS.md:36`.)
- **S5 — Issue first.** Repository policy: work may be built before `status:approved`, not
  merged. Issue #53 exists; the approval label is a maintainer judgement no script enforces
  (`scripts/check-pr-policy.js:7`).

## Tasks

| ID | Spec | Route | Commit |
|---|---|---|---|
| T1 | S5 | Open issue #53 with what and why | — (GitHub, 2026-11-19) |
| T2 | S5 | Wait for `status:approved` on #53 | pending |
| T3 | S1 | Measure this suite: counts, skips, tests that cannot fail for their own reason, duplicated contracts; every number from a command re-run | `bf8b62b` |
| T4 | S1 | Write `docs/testing.md`: rules true of the suite, violations as debt, refusals with reasons | `bf8b62b` |
| T5 | S2 | Link from `CONTRIBUTING.md`, `AGENTS.md` map, `README.md` docs table | `bf8b62b` |
| T6 | S3 | Extend `tests/docs.test.js` to assert the `AGENTS.md` map rows exist (RED on a bogus row, GREEN on the real map) | `bf8b62b` |
| T7 | S4 | One commit, checks green, task rows updated with its hash | `bf8b62b` |

## Log

- **L1** — User verbatim: "revisa la memoria ID: 1805 — funky-secure/policy/testing-page,
  quiero ver cómo podemos adaptarlo a este repo". Then: "usa funky judge para refutar el plan
  antes de implementar". Then: "abre el issue e implementa con odd."
- **L2** — Round 1 (blind PAIR, sha256 `173427f8…f048fda`, 64 lines): C6 refuted — the plan
  missed `tests/docs.test.js:92-99`, which makes the `README.md` docs-table row mandatory;
  C3 misattributed `pack:check` to `CONTRIBUTING.md` (it is `AGENTS.md:36`) and the absence
  claim narrowed (`CONTRIBUTING.md:28-29` already states the travel rule). Adjudicated by the
  parent's own reads; corrections applied to plan v2 (sha256 `757fcb4c…b0f81`, 67 lines).
- **L3** — Issue #53 opened (`type:feature`, feature-request form, duplicate search empty)
  and read back confirmed from the target host.
- **L4 — implementation evidence.** RED observed: a bogus map row
  (`no-such-path-red/`) made `tests/docs.test.js` fail (`fail 1`); removed, the suite went
  green at 289 tests (288 before this change). The page's numbers were re-measured after the
  change (289 tests, 4876 lines) so every figure is true at `bf8b62b`. The README docs-table
  row pushed the README to the 171-line cap boundary; the fix folded a two-line sentence
  into one (identical rendered text) rather than trimming content. Checks at commit:
  `node --test` 289 pass, `npm run pack:check` green (39 packed files), `npm pack --dry-run`
  green. S4 adjusted before the record commit: the work unit is one commit, the feature
  document lands separately, per `method-pack-version` precedent.
- **L5 — approval and delivery.** `status:approved` applied to #53 by the owner's
  instruction. The first delivery attempts were refused by the RDD pre-flight guard; root
  cause (diagnosed by two read-only subagents): the guard retains the committed-range hint
  only when the assess `baseRef` is a full 40/64-hex commit id or a ref name — an
  abbreviated id (`a1310f0`) is rejected by the provider and leaves the hint unset, so the
  same refusal repeats; a shell chain with operators beyond `&& || |` also voids a literal
  `cd` (ambiguous scope). Sanctioned path taken: assess with the full base
  `a1310f00d1568343e0bfad00c4883386cedfb847`, then standalone delivery commands.
  Pushed and PR #54 opened with `node scripts/open-pr.js` (label `type:docs`); both CI
  run sets passed (runs 44421637784, 44421637217: Ubuntu and Windows on Node 22 and 24,
  `pr-policy` green). Merge remains the owner's decision.
