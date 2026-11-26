# approve writes the gate: the approval ritual becomes a command

Feature document for issue #71 (`feat: approve writes the gate, so approval stops being a hand-copied
hash`). The CLI implements the read half of the gate rule and none of the write half: nothing in `src/`
writes `status`, `approved_by`, `approved_at` or `approved_hash`, so no code path produces `STALE_ARTIFACT`
or `APPROVED_CONTENT_CHANGED`, and an approval is a `sha256:` digest transcribed by hand. This plan was
judged `J1` before the first source write; the adjudication is in `## Log` at `L4`.

Method source: the RFC's own decision (`rfcs/funky-forge-skill-pack-rfc.md:1259`, Q2: `check` stays
read-only, "a separate `funky-forge stale` command may be added later") and the rule the docs already state
(`docs/cli.md:66-67`, `skill/SKILL.md:75-77`, `skill/references/00-map.md:54-56`). No rule is invented here:
every clause below quotes one of those sources or the issue body, and where a decision has no source it says
so and becomes a test.

## Specs

- **S1 — `approve` writes the approved state, and only as a verdict.** `funky-forge approve <phase>` refuses
  with exit `1` when the artifact's evaluation reports **any** error, and otherwise writes `status: approved`,
  `approved_by`, `approved_at` and `approved_hash`. The refusal set is the evaluation's, not a list this spec
  enumerates: a missing gate report, a malformed gate report (`GATE_REPORT_MALFORMED`, `src/lib/gate.js:62-94`),
  a surviving placeholder, a required section absent, a cross-check failure, a shape error, an artifact that is
  `stale`, or a dependency that is not `approved`. Approval stops being a transcription and becomes the same
  verdict `check` already reaches. (Issue #71 body, "What you propose"; `src/commands/check.js:65-88`.)
- **S2 — The refusal set has three command-specific codes on top.** `APPROVAL_GATE_FAILED` carries the codes
  the evaluation reported; `ALREADY_APPROVED` fires when the stored `approved_hash` already equals the live
  body hash; `DEPENDENCY_NOT_APPROVED` names the dependency that blocks the phase. Each one is reachable by a
  code path a test can drive — which is the defect today, since nothing reaches the state
  `src/commands/check.js:57-58` refuses. (Issue #71 body, "The problem" 1-2.)
- **S3 — Every input state branches explicitly.** `approve` accepts `draft`, `in_review` and `stale`
  (an artifact that kept its content and lost its approval). It refuses `rejected` with
  `STATUS_NOT_APPROVABLE` naming the state, and refuses an `approved` artifact whose hash is unchanged with
  `ALREADY_APPROVED`. `--force` re-dates that one case only: it never bypasses the evaluation, never approves
  a `rejected` artifact and never writes an artifact that would fail. (Issue #71 body; `src/lib/artifact.js:8`
  lists the five states and the plan names each.)
- **S4 — The write touches the approval keys and nothing the hash sees.** Only the four keys change, in the
  order the document already declares; the body, and every frontmatter line the command did not name, are
  preserved. `approved_hash` is computed over the **normalized** body via `normalizeBody`
  (`src/lib/frontmatter.js:65-77`, which strips CRLF, trailing whitespace and outer blank lines), so a CRLF
  file that is written back as LF keeps the same hash — and a body edited only in trailing whitespace is
  invisible to the hash **by design**, stated here so no test claims otherwise. The written file is re-read
  and `bodyHash` re-verified against the value just written, and a mismatch fails the command instead of
  reporting success. (Justification: `src/lib/artifact.js:70` compares that exact value.)
- **S5 — `stale` revokes and propagates, and validates everything before it writes anything.**
  `funky-forge stale <phase>` sets the phase to `status: draft` and removes `approved_by`, `approved_at` and
  `approved_hash`, then marks every dependent `stale` — transitively, per `DEPENDENCIES`
  (`src/lib/artifact.js:14-19`). Every target is read and parsed **before** the first write, so an unreadable
  dependent aborts the command with nothing changed; each changed path is reported; gate reports are not
  touched. The recovery for a mistaken run is the repository's own history, which this spec names instead of
  inventing a rollback. This is the command `skill/references/00-map.md:54-56` currently tells an agent to
  perform by editing YAML. (Issue #71 body, "What you propose".)
- **S6 — One rule set, two readers.** The evaluation `check` performs moves into a single exported function —
  `evaluateArtifact({cwd, phase})` returning `{hash, errors, warnings}` — and `check` becomes a renderer over
  it. `approve` calls the same function, so the two commands cannot drift and `check` gains no write path
  (RFC Q2). `check`'s observable behavior is unchanged: same codes, same messages, same exit codes, same JSON
  — proven by a differential run against the parent commit, not by reading. (Adjudicated from `JD-A-004` and
  `JD-B-006`, both CRITICAL: `src/commands/check.js:21` exports only the side-effecting `check()`, so the
  codes were unreachable from another command.)
- **S7 — The output contract is what the sources state, and no more.** `--json` prints one object with the
  notices on stderr, following the contract `install` states at `docs/cli.md:36` — the object shapes of
  `approve` and `stale` are this feature's decision, so each is pinned by a test rather than generalized from
  another command. `--dry-run` prints the frontmatter it would write, including the `approved_at` date, and
  writes nothing. Exit `0` on a write, `1` on a refusal, and the JSON error side carries
  `{ok: false, errors}` as `calc` does (`src/commands/calc.js:126-130`). (Issue #71 body, "What you propose".)
- **S8 — `approved_at` is the UTC date, and that is this feature's decision.** No source in this repository
  states a timezone — `src/lib/artifact.js:12` constrains the shape only — so the command writes the UTC date
  through an injectable clock, and a test pins the value instead of trusting the machine. (Adjudicated from
  `JD-A-009` and `JD-B-004`: the premise was untested, so it becomes a decision with a test.)
- **S9 — The change ships with everything that describes it, and moves nothing else.** `docs/cli.md` gains the
  two command sections and the new codes in its catalogue; `docs/artifacts.md` and `docs/architecture.md`
  follow; `skill/SKILL.md:75-77` and `skill/references/00-map.md:54-56` replace the manual ritual with the
  command; `README.md` lists them. `init`, `install` and `calc` behave exactly as before, and the falsifier for
  that claim is named: `stdout`, `stderr` and exit code compared against the parent commit for every command
  the diff touches. (Adjudicated from `JD-A-010`, `JD-B-007` and `JD-B-009`; `AGENTS.md`, "Tests and the
  documentation that describes a behaviour travel in the same commit".)
- **S10 — Issue first, and the label is not mine.** Issue #71 exists with `type:feature`; `status:approved` is
  a maintainer judgement no script enforces (`CONTRIBUTING.md:23-24`). Work may be built before the label and
  may not be merged without it.

## Tasks

| ID | Spec | Route | Commit |
|---|---|---|---|
| T1 | S6 | `src/lib/evaluate.js` + `src/commands/check.js`: move the evaluation behind `evaluateArtifact({cwd, phase})`, leave `check` as a renderer. Differential run against the parent commit before and after | pending |
| T2 | S4 | `src/lib/frontmatter.js`: a surgical writer for the four approval keys plus their reader. No serializer exists (`src/lib/yaml.js` exports `parseYaml` and `YamlError`), so the raw block is edited in place instead of re-serialized | pending |
| T3 | S1, S2, S3, S7, S8 | `src/commands/approve.js`: evaluation precondition, the three command codes, the state branch, the write, the re-verification, `--dry-run`, `--json`, injectable clock | pending |
| T4 | S5, S7 | `src/commands/stale.js`: validate every target, then revoke and propagate; same output contract | pending |
| T5 | S7 | `src/cli.js`: dispatch rows, flag specs and help text for both commands. The shared `--force` summary (`src/cli.js:49`) is **not** edited here — `install --help` would change with it, so that stays deferred (`JD-A-010`) | pending |
| T6 | S9 | `docs/cli.md`, `docs/artifacts.md`, `docs/architecture.md`, `skill/SKILL.md`, `skill/references/00-map.md`, `README.md`, in the same commit as the behaviour they describe | pending |
| T7 | S1-S9 | `tests/approve.test.js`, `tests/stale.test.js`, and one regression case per command the diff touches | pending |
| J1 | S1-S10 | Blind `PAIR` before the first source write. Round 1 refuted v1 (`L4`); v2 is under round 2, which attacks the corrections and every deferred row, and nothing else | round 1 done, v2 in round 2 |
| J2 | S1-S9 | Blind `PAIR` once the change's claims are about to be believed | pending |
| J3 | S1-S9 | `SINGLE` closing audit, once every `T*` row is `done` | pending |

## Log

- **L1** — User verbatim: "Investiga el repo, y dime si tienes alguna idea para una nueva feature, ya que
  tenemos cambios desde el último tag pero no son suficientes como para una release. Por eso quiero ver si
  hay algun area de mejora para aprovechar y fixearlo. Delega exploraciones profundas". Then: "Apoyate de
  funky judge para planes y afirmaciones, ademas de marcar en odd las fases J(n). NO OLVIDEMOS de
  actualizar docs, empecemos". Direction chosen by the user from four: **A, `approve` + `stale`**.
- **L2** — Measured, not recalled. `node --test` → 292 tests, 292 pass, 0 fail, 0 skipped, 834 ms.
  `node scripts/pack-guard.js` → "39 packed files against 6 entries of the files contract", exit 0.
  Commits since the last tag: `git rev-list --count v0.2.0..1331189^` → **73**; the same range including this
  record's own commit is **74** (`..1331189`), and both numbers are stated because the range and the commit
  decide which one is true. `git diff --stat v0.2.0..1331189^ -- src/ skill/` → empty, so the product surface
  moved 0 lines while 73 commits landed. The gate defect was reproduced, not inferred: the widened sweep
  `grep -rn "\.status\s*=\|status:\s*['\"]\(approved\|stale\|draft\)\|approved_by\|approved_at" src/` returns
  only **reads** (`src/commands/calc.js:72`, `src/commands/check.js:57`, `src/lib/artifact.js:47-49`), the only
  `writeFileSync` calls in `src/` belong to `init` (skeletons), `install` (the pack) and `calc --write`
  (the calc table only), so the state `check` refuses has no producer anywhere in the CLI. `git diff --stat
  v0.2.0..1331189^ -- src/ skill/` prints nothing; the same range over the whole repository is 21 files,
  3,942 insertions, 90 deletions.
- **L3** — Issue #71 opened (`type:feature`, feature-request form, duplicate search empty — no open issue
  existed), and read back confirmed from the target host: `#71`, body 4,780 bytes.
- **L4** — **J1 round 1, blind `PAIR`, adjudicated.** Artifact `1331189:odd/tasks/approve-staleness.md`, blob
  `5cfb6bc5bc2d9e68550e76378e2c6bc7753ff1b5`, sha256 `8c9f8ca5…e1da`, 83 lines. Judges
  `jd-judge-a` (`deepseek-v4.1-flash`) and `jd-judge-b` (`muse-spark-1.3-contributor`), the same eleven
  questions, neither seeing the other. Every `Qk` was accounted for, so the `cover` round is complete: Q1-Q4
  and Q11 by citation and sweep rows, Q5-Q8 by task-acceptance rows, Q9 by five coverage rows, Q10 by the
  destruction row. `+VERIFY` was **met** and the parent ran the commands above.
  - **Settled, CRITICAL, both judges independently — `JD-A-004` + `JD-B-006`.** The plan required `approve` to
    report "the codes `check` would have reported", but `src/commands/check.js:21` exports only the
    side-effecting `check()` and the error array dies in `finish` (`:174-181`). Verified by reading `check.js`.
    The finding wins: **S6 is new**, the evaluation moves behind `evaluateArtifact`, and T1 becomes its own
    task with a differential proof.
  - **Settled — `JD-B-001`, accepted.** `git rev-list --count v0.2.0..1331189` prints 74, not 73; the plan
    measured before its own commit and then carried the number into the commit. L2 now names both ranges and
    the commit that separates them.
  - **`JD-B-003` + `JD-A-011`, accepted.** The offered sweep could not show absence. L2 now carries the
    widened pattern and its actual output, and states the noun each hit is (a read, not a write).
  - **`JD-A-006`, partially refuted by a fact.** The byte-identity claim is false and the correction stands,
    so S4 now names the normalized body. The *inference* that CRLF would change the body hash is **refuted by
    reading** `normalizeBody` (`src/frontmatter.js:65-77`): it strips CRLF before hashing, so the hash is
    stable across that rewrite. The finding survives as a wording defect only.
  - **`JD-A-005`, accepted.** "No code writes it" does not entail "unreachable" — a hand edit reaches it
    today, which is exactly the defect. S1 and S2 now say *no code path produces it*.
  - **`JD-A-001` + `JD-B-005`, accepted.** `docs/cli.md:36` is the sentence and it is `install`-scoped;
    "exactly one object" was a tightening with no source. S7 now follows the source and makes the new object
    shapes this feature's own, test-pinned decision.
  - **`JD-A-002` + `JD-B-002`, accepted.** `normalizeBody` is `65-77`, not `70-82`. Corrected in S4.
  - **`JD-A-003` + `JD-A-012`, accepted.** `yaml.js` also exports `YamlError`; the digest is 71 characters
    (`sha256:` + 64 hex, `src/lib/artifact.js:11`). Both corrections applied, and T2 no longer claims
    `parseYaml` is the only export.
  - **`JD-A-007` + `JD-A-008` + `JD-B-008`, accepted.** The refusal set closed at four and then reopened, and
    `in_review`, `rejected`, `--force` and `--dry-run` were unaddressed. S1 now delegates the set to the
    evaluation; S3 enumerates all five states and narrows `--force` to re-dating.
  - **`JD-A-009` + `JD-B-004`, accepted.** No source states a timezone; `grep -rn UTC docs/ skill/ src/
    README.md` is empty. The premise was unmeasured, so S8 makes UTC a decision with an injectable clock and
    a test, instead of asserting it.
  - **`JD-A-010` + `JD-B-007`, accepted, and the work is removed.** The shared `FLAG_SPECS` summary at
    `src/cli.js:49` is rendered by both `install` and `init`, so fixing `init --help` breaks S9. T5 now
    explicitly does **not** touch it; the deferred help debt stays with `odd/tasks/method-pack-version.md:106-110`.
  - **`JD-A-013`, accepted.** S5 now validates every target before the first write, reports each changed path,
    leaves gate reports alone, and names the repository's history as the recovery instead of inventing one.
  - **`JD-A-014`, accepted, and stated as a limit.** A trailing-whitespace-only edit cannot move the hash, so
    S4 says so plainly rather than letting a test imply detection.
  - **`JD-B-009`, accepted.** S9 now names the falsifier: `stdout`, `stderr` and exit code compared against the
    parent commit for every command the diff touches.
- **L5** — v2 written from the adjudication above. The load-bearing change is architectural, not editorial:
  v1 could not demonstrate its own central task, and the two judges found that independently. Round 2 is
  dispatched against v2 under the protocol's round cap, and it attacks the corrections and the deferred rows
  only.
