# approve writes the gate: the approval ritual becomes a command

Feature document for issue #71 (`feat: approve writes the gate, so approval stops being a hand-copied
hash`). The CLI implements the read half of the gate rule and almost none of the write half. Nothing in
`src/` sets `status: stale`, so `STALE_ARTIFACT` (`src/commands/check.js:57-58`) has no producer; the one
existing producer of `APPROVED_CONTENT_CHANGED` is `calc --write` (`src/commands/calc.js:71-74`), which
rewrites the estimate body, prints a warning and leaves `status: approved` in place — and no command can
repair either state. Approval itself is a `sha256:` digest transcribed by hand. This plan was judged `J1`
over three revisions before the first source write; the adjudications are in `## Log` at `L4` and `L7`.

Method source: the RFC's own decision (`rfcs/funky-forge-skill-pack-rfc.md:1259`, Q2: `check` stays
read-only, "a separate `funky-forge stale` command may be added later") and the rule the docs already state
(`docs/cli.md:66-67`, `skill/SKILL.md:75-77`, `skill/references/00-map.md:54-56`). No rule is invented here:
every clause quotes one of those sources or the issue body, and where a decision has no source it says so
and becomes a test.

## Specs

- **S1 — `approve` writes the approved state, and only as a verdict.** `funky-forge approve <phase>` runs the
  shared evaluation and refuses with exit `1` on any error **except the two states the command exists to
  clear**: `APPROVED_CONTENT_CHANGED` and `STALE_ARTIFACT`. Everything else blocks — a missing artifact
  (`:40-43`), invalid frontmatter (`:45-51`), a malformed gate report (`GATE_REPORT_MALFORMED`,
  `src/lib/gate.js:62-94`), a surviving placeholder (`:61-63`), a required section absent or a cross-check
  failure (`:65-88`), a dependency that is absent or not approved (`:146-168`). On success it writes
  `status: approved`, `approved_by`, `approved_at` and `approved_hash`. Approval stops being a transcription
  and becomes the same verdict `check` reaches. (Issue #71 body; `src/commands/check.js:40-88`.)
- **S2 — Two codes are new; the rest are the evaluation's.** New: `APPROVAL_GATE_FAILED`, carrying the codes
  the evaluation reported, and `ALREADY_APPROVED`, when the stored `approved_hash` already equals the live
  body hash. `DEPENDENCY_NOT_APPROVED` already exists in the evaluation (`src/commands/check.js:153,164`) and
  `approve` reports it unchanged, message included: `does not exist` and `is "draft"; approve it first` are
  different facts on the same code. `STATUS_NOT_APPROVABLE` is the third new code and names `rejected`. Each
  is reachable by a code path a test can drive, which is the defect today. (Issue #71 body; `JD-A-002`.)
- **S3 — Every input state branches explicitly.** Of the five states in `src/lib/artifact.js:8`: `draft`,
  `in_review` and `stale` are approvable; `stale` is approvable because it kept its content and lost only its
  approval (`skill/references/00-map.md:54-56`); `approved` with an unchanged hash refuses as
  `ALREADY_APPROVED`; `approved` with a **changed** hash is approvable — re-approving is the cure for
  `APPROVED_CONTENT_CHANGED`, which is why S1 excludes it from the blocking set; `rejected` refuses as
  `STATUS_NOT_APPROVABLE`. `--force` re-dates the `ALREADY_APPROVED` case only: it never bypasses the
  evaluation, never approves a `rejected` artifact and never writes an artifact that would fail. (Issue #71
  body; `JD-B` round 2 on the changed-hash state.)
- **S4 — The write touches the approval keys and nothing the hash sees.** Only the four keys change. A draft
  that declares none of `approved_by`, `approved_at`, `approved_hash` gets them inserted immediately after
  `status:`, in that order; keys already present keep their position and their neighbours. `approved_hash` is
  computed over the **normalized** body via `normalizeBody` (`src/lib/frontmatter.js:65-77`), which strips
  CRLF, trailing whitespace and outer blank lines — verified, not assumed: a CRLF copy of a body and its LF
  original produce the same `bodyHash`, because `splitFrontmatter` slices the normalized text
  (`src/lib/frontmatter.js:55`) rather than the raw one. Two limits are stated here so no test claims
  otherwise: a body edited only in trailing whitespace is invisible to the hash, and a Markdown hard break
  (two trailing spaces) is content the hash cannot see. The written file is re-read and `bodyHash` re-verified
  against the value just written; a mismatch fails the command instead of reporting success. (Justification:
  `src/lib/artifact.js:70`.)
- **S5 — `stale` revokes and propagates, and validates everything before it writes anything.**
  `funky-forge stale <phase>` sets the phase to `status: draft` and removes `approved_by`, `approved_at` and
  `approved_hash`, then marks every **approved** dependent `stale` — transitively over the inverted
  `DEPENDENCIES` map (`src/lib/artifact.js:14-19`). A dependent that was never approved holds no approval to
  lose, so it is left byte-identical and reported as unchanged: marking a `draft` dependent `stale` would
  make `check` refuse `STALE_ARTIFACT` for a state that artifact never entered. A dependent that does not
  exist is skipped and reported as skipped: there is nothing to mark, and it is not an error. A dependent
  already `stale` is left untouched and is not counted as changed. Every target that will be written is read
  and parsed **before** the first write, so a malformed dependent aborts with nothing changed; each written
  path is reported, and gate reports are never touched. The recovery for a mistaken run is the repository's
  own history, named here instead of an invented rollback. This is the command
  `skill/references/00-map.md:54-56` tells an agent to perform by editing YAML. (Issue #71 body; `JD-A-007`,
  `JD-A-008`, `JD-B` round 2; corrected at `L8`.)
- **S6 — One rule set, two readers, and the strictness stays in `check`.** The evaluation `check` performs
  moves into `evaluateArtifact({cwd, phase})` returning `{hash, errors, warnings}`; `check` keeps its
  rendering, its `--strict` promotion (`src/commands/check.js:84-86`) and its exit decision, because
  strictness is a presentation choice and `approve` must never treat a warning as blocking. `approve` calls
  the same evaluation, so the two commands cannot drift and `check` gains no write path (RFC Q2). `check`'s
  observable behavior is unchanged: same codes, same messages, same exit codes, same JSON — proven by a
  fixture matrix run against the parent commit, not by reading. (Adjudicated from `JD-A-004` and `JD-B-006` of
  round 1, and `JD-A-005`/`JD-B` on `--strict` of round 2.)
- **S7 — The output contract is what the sources state, and no more.** `--json` prints one object with the
  notices on stderr, following the contract `install` states at `docs/cli.md:36`; the object shapes of
  `approve` and `stale` are this feature's decision, each pinned by a test rather than generalized from
  another command — `calc`'s error shape (`src/commands/calc.js:126-130`) covers only the failing side.
  `--dry-run` prints the frontmatter it would write, including the `approved_at` date, and writes nothing.
  Exit `0` on a write, `1` on a refusal. (Issue #71 body; `JD-B` round 2 on the calc analogy.)
- **S8 — `approved_at` is the UTC date, and that is this feature's decision with a falsifiable test.** No
  source here states a timezone — `src/lib/artifact.js:12` constrains the shape only. The command takes an
  injectable clock, and the test that pins UTC does so at an instant where a local-date implementation
  differs: `2026-03-01T23:30:00Z` with `TZ=Pacific/Kiritimati` (UTC+14) must still write `2026-03-01`. Without
  a pinned instant and a pinned `TZ` the test would pass either way. (Adjudicated from `JD-A-009`, `JD-B-004`
  of round 1 and `JD-A-009` of round 2.)
- **S9 — The change ships with everything that describes it, and moves nothing else.** `docs/cli.md` gains the
  two command sections and the new codes; `docs/artifacts.md` and `docs/architecture.md` follow;
  `skill/SKILL.md:75-77` and `skill/references/00-map.md:54-56` replace the manual ritual with the command;
  `README.md` lists them. `init`, `install` and `calc` are untouched by this change, and the falsifier is a
  **fixture matrix**, not one artifact: every refusal branch of `check` (missing artifact, invalid
  frontmatter, stale, placeholder, missing gate report, malformed gate report, failing cross-check,
  `--strict` over warnings, clean pass) replayed against the parent commit, comparing `stdout`, `stderr` and
  exit code. (Adjudicated from `JD-A-010`, `JD-B-007`, `JD-B-009` of round 1 and `JD-A-010`, `JD-B` of round 2.)
- **S10 — Issue first, and the label is not mine.** Issue #71 exists with `type:feature`; `status:approved` is
  a maintainer judgement no script enforces (`CONTRIBUTING.md:23-24`). Work may be built before the label and
  may not be merged without it.

## Tasks

| ID | Spec | Route | Commit |
|---|---|---|---|
| T1 | S6 | `src/lib/evaluate.js` + `src/commands/check.js`: move the rules behind `evaluateArtifact({cwd, phase})`; `check` keeps rendering, `--strict` and the exit decision. Fixture matrix against the parent commit before and after | `5a17888` |
| T2 | S4 | `src/lib/frontmatter.js`: a surgical writer for the four keys plus their reader, with the insertion point fixed. No serializer exists (`src/lib/yaml.js` exports `parseYaml` and `YamlError`), so the raw block is edited in place. Bind the normalized text to one name while there: `:55` re-derives `source.replace(/\r\n/g,'\n')` and reads as if it sliced the raw source (`JD-B` refuted) | `3f49082` |
| T3 | S1, S2, S3, S7, S8 | `src/commands/approve.js`: evaluation precondition minus the two clearing states, the three new codes, the five-state branch, the write, the re-verification, `--dry-run`, `--json`, injectable clock | `3f49082` |
| T4 | S5, S7 | `src/commands/stale.js`: validate existing targets, then revoke and propagate; skip absent, leave never-approved and already-stale alone; same output contract | `3f49082` |
| T5 | S7 | `src/cli.js`: dispatch rows, flag specs and help text for both commands. The shared `--force` summary (`src/cli.js:49`) is **not** edited — `install --help` would change with it (`JD-A-010` round 1) | `3f49082` |
| T6 | S9 | `docs/cli.md`, `docs/artifacts.md`, `docs/architecture.md`, `docs/method.md`, `docs/testing.md`, `skill/SKILL.md`, `skill/references/00-map.md`, `README.md`, in the same commit as the behaviour they describe | `3f49082` |
| T7 | S1-S9 | `tests/approve.test.js`, `tests/stale.test.js`, and the S9 fixture matrix | `3f49082` |
| J1 | S1-S10 | Blind `PAIR`. Round 1 refuted v1 (`L4`), round 2 refuted v2 and one premise of mine (`L6`). The round cap is spent; v3 stands on the parent's own reads | done, cap spent |
| J2 | S1-S9 | Blind `PAIR` once the change's claims are about to be believed | pending |
| J3 | S1-S9 | `SINGLE` closing audit, once every `T*` row is `done` | pending |

## Deferred, with an owner

- **`calc --write` leaves a lying approval.** It rewrites the body of an approved estimate, prints
  `APPROVED_CONTENT_CHANGED` and leaves `status: approved` (`src/commands/calc.js:71-74`). This feature makes
  the state repairable (`stale`, then `approve`) but does not change `calc`, because that is a behaviour
  change to a command this issue does not own. Follow-up issue.
- **`init --help` misdescribes `--force`.** One shared summary at `src/cli.js:49`, already recorded at
  `odd/tasks/method-pack-version.md:106-110`. Not touched here for the same reason.

## Log

- **L1** — User verbatim: "Investiga el repo, y dime si tienes alguna idea para una nueva feature, ya que
  tenemos cambios desde el último tag pero no son suficientes como para una release. Por eso quiero ver si
  hay algun area de mejora para aprovechar y fixearlo. Delega exploraciones profundas". Then: "Apoyate de
  funky judge para planes y afirmaciones, ademas de marcar en odd las fases J(n). NO OLVIDEMOS de
  actualizar docs, empecemos". Direction chosen by the user from four: **A, `approve` + `stale`**.
- **L2** — Measured, not recalled. `node --test` → 292 tests, 292 pass, 0 fail, 0 skipped, 834 ms.
  `node scripts/pack-guard.js` → "39 packed files against 6 entries of the files contract", exit 0. Commits
  since the last tag: `git rev-list --count v0.2.0..1331189^` → **73**; the same range including this
  record's own commit is **74** (`..1331189`), and both are stated because the commit decides which is true.
  `git diff --stat v0.2.0..1331189^ -- src/ skill/` prints nothing; the same range over the whole repository
  is 21 files, 3,942 insertions, 90 deletions.
- **L3** — Issue #71 opened (`type:feature`, feature-request form, duplicate search empty), read back
  confirmed from the target host: `#71`, body 4,780 bytes.
- **L4** — **J1 round 1, blind `PAIR`, adjudicated.** Artifact `1331189`, blob `5cfb6bc5…a84ca10`, 83 lines.
  Judges `jd-judge-a` (`deepseek-v4.1-flash`) and `jd-judge-b` (`muse-spark-1.3-contributor`), the same
  eleven questions, neither seeing the other; every `Qk` accounted for, `+VERIFY` met. **Settled, CRITICAL,
  both independently:** `approve` could not report "the codes `check` would have reported", because
  `src/commands/check.js:21` exports only the side-effecting `check()` and the error array dies in `finish`
  (`:174-181`). S6 was added and T1 became the extraction. **Accepted:** the commit count (`74`, not `73`, at
  the frozen commit); the sweep that could not show absence; the misattributed `docs/cli.md:37` (the sentence
  is `:36`, and it is `install`-scoped); `normalizeBody` at `65-77`, not `70-82`; `yaml.js` also exporting
  `YamlError`; the 71-character digest; the refusal set that closed at four and reopened; the five unaddressed
  states; the unmeasured UTC premise; the shared `--force` summary; the unrecoverable `stale`; the
  whitespace-blind hash. **Partially refuted:** the byte-identity claim stands, but the inference that CRLF
  would change the body hash is false — `normalizeBody` strips CRLF before hashing.
- **L5** — v2 written from that adjudication (162 lines). The load-bearing change was architectural: v1 could
  not demonstrate its own central task.
- **L6** — **J1 round 2, blind `PAIR`, adjudicated.** Artifact `b8a82fd`, blob `e638f465…ca10`, 162 lines,
  same two judges, questions confined to the corrections and the deferred rows; every `Qk` accounted for.
  **Settled, CRITICAL, both or one verified by me:** (a) the blocking set made `approve` unable to clear the
  two states it exists for, since the evaluation errors on `stale` and on a changed hash — S1 now excludes
  exactly those two; (b) `DEPENDENCY_NOT_APPROVED` is not new (`src/commands/check.js:153,164`), so S2 now
  names two new codes plus `STATUS_NOT_APPROVABLE`; (c) the `approved`-with-changed-hash state had no branch,
  and re-approving is its cure; (d) `--strict` had no home — it stays in `check`; (e) **my own premise was
  false**: `APPROVED_CONTENT_CHANGED` does have a producer, `calc --write`, verified at
  `src/commands/calc.js:71-74`, so the header, the narrowing and the deferred row below exist because of it;
  (f) the sweep in L2 returned nine lines, not the three named, and `\.status\s*=` also matches `===`, so it
  cannot separate a write from a read by form — replaced by the structural fact that the only three
  `writeFileSync` sites are `init`, `install` and `calc --write`; (g) the UTC test was not falsifiable without
  a pinned instant and `TZ`; (h) one-fixture differentials cannot exercise the refusal branches; (i) a
  dependency that is absent and one that is not approved share a code but not a message.
  **Refuted by a fact I ran:** `JD-B`'s last row claimed `splitFrontmatter` slices the raw CRLF source and
  shifts the body by one byte per line. `src/lib/frontmatter.js:55` slices
  `source.replace(/\r\n/g, '\n')`, and reading a CRLF body and its LF twin returns identical bodies and
  identical hashes. The finding loses; the wording that made it plausible — re-deriving the normal form at the
  slice instead of naming it — survives as a T2 note.
- **L7** — v3 written from L6. The round cap of this family is spent (two judged rounds per artifact), so v3
  is **unjudged by design**: it stands on the parent's own reads, which are recorded above with the commands
  and outputs that produced them. The next judgment on this work is `J2`, over the change rather than the
  plan.
- **L8** — Correction found while implementing T4, and it changes S5. S5 said `stale` marks every *existing*
  dependent, and taken literally that includes a `draft` dependent that never held an approval. `init` creates
  all four artifacts as `draft`, so `stale problem` would have marked `design`, `estimate` and `proposal`
  `stale` before anyone approved anything, and `check design` would then refuse `STALE_ARTIFACT` for a state
  that artifact never entered. The method's own wording is narrower than the spec was:
  `skill/references/00-map.md:51` defines `stale` as "An approved dependency changed". S5 now marks only
  **approved** dependents, leaves a never-approved dependent byte-identical, and reports it as unchanged with
  the status it kept. Pinned test-first: the new case was RED against the literal implementation (`wrote:
  .funky-forge/design.md (stale)`) and GREEN after the correction; the suite is 332 tests, 332 pass, 0 fail,
  0 skipped.
