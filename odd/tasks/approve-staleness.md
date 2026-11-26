# approve writes the gate: the approval ritual becomes a command

Feature document for issue #71 (`feat: approve writes the gate, so approval stops being a hand-copied
hash`). The CLI implements the read half of the gate rule and none of the write half: nothing in `src/`
writes `status`, `approved_by`, `approved_at` or `approved_hash`, so `STALE_ARTIFACT` is unreachable and an
approval is a 64-character hash copied by hand. This plan is frozen and judged `J1` before the first source
write; its adjudication lands in `## Log`.

Method source: the RFC's own decision (`rfcs/funky-forge-skill-pack-rfc.md:1259`, Q2: `check` stays
read-only, "a separate `funky-forge stale` command may be added later") and the rule the docs already state
(`docs/cli.md:66-67`, `skill/SKILL.md:75-77`, `skill/references/00-map.md:54-56`). No rule is invented here:
every clause below quotes one of those sources or the issue body.

## Specs

- **S1 — `approve` writes the approved state, and only as a verdict.** `funky-forge approve <phase>` computes
  `bodyHash` exactly as `check --json` does (`src/lib/frontmatter.js:84`, over the normalized body), then
  writes `status: approved`, `approved_by`, `approved_at` (UTC, `YYYY-MM-DD`) and `approved_hash`. It refuses,
  exit `1`, when `check <phase>` would not pass: a missing gate report, a surviving placeholder token, an
  artifact already `stale`, or a dependency that is not `approved`. Approval stops being a transcription and
  becomes the same verdict `check` already knows how to reach. (Issue #71 body, "What you propose".)
- **S2 — The refusals are exact and reachable.** `APPROVAL_GATE_FAILED` carries the codes `check` would have
  reported; `ALREADY_APPROVED` fires when the stored `approved_hash` already equals the live body hash
  (`--force` re-dates it); `DEPENDENCY_NOT_APPROVED` names the dependency that blocks the phase. Each of the
  three is produced by a code path a test can reach, which is the defect today: `STALE_ARTIFACT` at
  `src/commands/check.js:57-58` is unreachable because no code writes the state it refuses. (Issue #71 body,
  "The problem" 1-2.)
- **S3 — Every other byte of the artifact is preserved.** The write is surgical: only the four keys change,
  in the order the document already declares; the body and every untouched frontmatter line stay byte
  identical. The written file is re-read and `bodyHash` re-verified against the value just written before the
  command reports success, so a write that would revoke its own approval fails loudly instead of passing a
  gate with a hash that no longer matches. Justification: `APPROVED_CONTENT_CHANGED`
  (`src/lib/artifact.js:70`) compares that exact value, and `normalizeBody`
  (`src/lib/frontmatter.js:70-82`) is what makes it stable. (Issue #71 body, "The problem" 3.)
- **S4 — `stale` revokes and propagates.** `funky-forge stale <phase>` sets the phase back to `status: draft`,
  clears `approved_by`, `approved_at` and `approved_hash`, and marks every dependent `stale` — transitively,
  per `DEPENDENCIES` (`src/lib/artifact.js:14-19`) — without touching any body. This is the command
  `skill/references/00-map.md:54-56` currently tells an agent to perform by editing YAML. (Issue #71 body,
  "What you propose".)
- **S5 — Output contract matches the commands that already exist.** `--json` prints exactly one object with
  notices on stderr, as `docs/cli.md:37` states for `install`. `--dry-run` prints the frontmatter it would
  write and writes nothing, as `install --dry-run` does (`src/commands/install.js:288-294`). Exit `0` on a
  write, `1` on a refusal, and the JSON error side carries `{ok: false, errors}` like `calc`
  (`src/commands/calc.js:126-130`) rather than plain stderr text. (Issue #71 body, "What you propose".)
- **S6 — The change ships with everything that describes it, and moves nothing else.** `docs/cli.md` gains
  the two command sections and the new codes in its catalogue; `docs/artifacts.md` and
  `docs/architecture.md` follow; `skill/SKILL.md:75-77` and `skill/references/00-map.md:54-56` replace the
  manual ritual with the command; `README.md` lists them. `check` keeps no write path (RFC Q2), and `init`,
  `install` and `calc` behave exactly as before. (Issue #71 body, "Surfaces that move with it";
  `AGENTS.md`, "Tests and the documentation that describes a behaviour travel in the same commit".)
- **S7 — Issue first, and the label is not mine.** Issue #71 exists with `type:feature`; `status:approved` is
  a maintainer judgement no script enforces (`CONTRIBUTING.md:23-24`). Work may be built before the label and
  may not be merged without it. (Issue #71; `AGENTS.md`, "Issue first, then wait".)

## Tasks

| ID | Spec | Route | Commit |
|---|---|---|---|
| T1 | S3, S5 | `src/lib/frontmatter.js`: a surgical frontmatter field writer and its reader for the four approval keys. No `stringifyYaml` exists (`src/lib/yaml.js` exports `parseYaml` only), so the writer edits the raw block in place instead of re-serializing it | pending |
| T2 | S1, S2, S5 | `src/commands/approve.js`: gate precondition reuse, the three refusals, the write, the re-verification, `--dry-run`, `--json` | pending |
| T3 | S4, S5 | `src/commands/stale.js`: revoke own approval, mark dependents transitively, same output contract | pending |
| T4 | S1, S5 | `src/cli.js`: dispatch rows, flag specs, help text, and the shared `--force` summary that `init --help` still misdescribes (`odd/tasks/method-pack-version.md:108-110`) | pending |
| T5 | S6 | The documentation and skill surfaces named in S6, in the same commit as the behaviour they describe | pending |
| T6 | S1-S5 | `tests/approve.test.js` and `tests/stale.test.js`: one RED per rule, plus the regression case for each existing command | pending |
| J1 | S1-S7 | Blind `PAIR` over this plan before the first source write | pending |
| J2 | S1-S6 | Blind `PAIR` over the change once its claims are about to be believed | pending |
| J3 | S1-S6 | `SINGLE` closing audit, once every `T*` row is `done` | pending |

## Log

- **L1** — User verbatim: "Investiga el repo, y dime si tienes alguna idea para una nueva feature, ya que
  tenemos cambios desde el último tag pero no son suficientes como para una release. Por eso quiero ver si
  hay algun area de mejora para aprovechar y fixearlo. Delega exploraciones profundas". Then: "Apoyate de
  funky judge para planes y afirmaciones, ademas de marcar en odd las fases J(n). NO OLVIDEMOS de
  actualizar docs, empecemos". Direction chosen by the user from four: **A, `approve` + `stale`**.
- **L2** — Measured before planning, not recalled: `node --test` → 292 tests, 292 pass, 0 fail, 0 skipped;
  `node scripts/pack-guard.js` → 39 packed files against 6 `files` entries, clean. The gate defect was
  reproduced, not inferred: `grep -rn "approved_hash\s*=\|status:\s*'approved'" src/` returns only the
  comparison at `src/lib/artifact.js:70`, and the only `writeFileSync` calls in `src/` belong to `init`,
  `install` and `calc --write`. Since `v0.2.0` the repository has 73 commits and 0 changed lines in `src/`
  or `skill/`, which is why a release had nothing to carry.
- **L3** — Issue #71 opened (`type:feature`, feature-request form, duplicate search empty — no open issue
  existed), and read back confirmed from the target host: `#71`, body 4,780 bytes.
