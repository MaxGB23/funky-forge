# The method pack declares the package version

Feature document for issue 25. The issue is the specification of record; this file records the
decisions that refine it, the task order, and the evidence. When in doubt, reread the issue and
`rfcs/02-method-pack-version.md`.

## Specs

- **S1 — Version is the package's.** The skill is bound to the package version, because the pack
  ships inside the tarball and travels with the binary. `method_version: 1` in
  `skill/references/00-map.md` and the four templates is the protocol's clock and does not change.
- **S2 — One declaration, guarded.** `skill/SKILL.md`'s frontmatter carries `version:` equal to
  `package.json`'s, and a test fails naming both files and both numbers when they disagree. Verbatim
  from the issue: "`skill/SKILL.md`'s frontmatter version must equal `package.json`'s, with a failure
  message naming both files and both numbers."
- **S3 — Four outcomes.** Verbatim from the issue: "no copy → installs; same version, identical
  bytes → reports `Current`, writes nothing, exits 0; same version, different bytes → names it as
  local changes on that version and asks before replacing; with no terminal it refuses with a
  `reason:` naming the path, the version and the fact that stdin is not a terminal; a different
  version → names both versions and offers to replace; a copy **newer** than the binary is refused
  with a reason, because the installed protocol cannot be older than its validator."
- **S4 — Forge's exit codes, not secure's.** Verbatim: "forge uses `2` for 'a decision that needs
  the human' and `1` for a failure, where secure uses `3` for a refusal. The mapping has to follow
  forge's own contract, not secure's numbers."
- **S5 — Ask on a terminal.** User verbatim: "Preguntar en terminal, como funky-secure". Answer
  tokens `1`/`2`, default `1` (keep), question on stderr, answer read from stdin.
- **S6 — One state, two surfaces.** User verbatim: "Un solo lugar que calcule el estado, dos que lo
  muestran." The diagnosis lives in `install` and in `--check`; `--check` keeps `0` in sync and `1`
  on divergence and only changes what it prints. `--json` reads the same state. Tone per user
  verbatim: "install en una copia limpia imprime una línea: `Installed · <ruta> (0.1.0)`",
  "`install --check` imprime siempre el estado y la versión", "install solo despliega las cuatro
  variantes cuando tiene que decidir o negarse."
- **S7 — A newer copy keeps secure's answer.** User verbatim: "sigue funky secure": refused outright,
  never a question, with the action that resolves it, and `--force` performs the downgrade.
- **S8 — `--version` reads the manifest.** User verbatim: "Sí, mismo commit con su test." The literal
  `funky-forge 0.1.0` in `src/cli.js` is the same clock and is fixed in the same commit as S2.
- **S9 — Unchanged surface.** `--target`, `--dry-run`, `--with-pointer`, `--force`, `--check`,
  `--json` keep their meaning; `install` still writes only inside the target skill directory, the
  pointer stays one-shot, and the `files` contract does not change. `portfolio-npm-launch.md` stays
  untracked and is never read, edited, or committed.

## Tasks

| ID | Task | Specs | Route | Commit |
|---|---|---|---|---|
| T1 | Record the contract: `rfcs/02-method-pack-version.md`, plus a dated `## Errata` in RFC 1 for §6.2 and §13.1 | S1-S8 | inline (docs) | `19005f9` |
| T2 | Declare the version once and compare it: `version:` in `skill/SKILL.md`, pure `src/lib/pack-version.js` (`readDeclaredVersion`, `compareVersions`, `packState`), `--version` from the manifest, the two guards | S2, S6, S8 | inline | `9be903a` |
| T3 | `install` acts on the state and asks on a terminal: four outcomes, async ripple, `--check`/`--json`/`--dry-run` from the one state, prompt and non-TTY refusal, docs (`docs/cli.md`, `docs/architecture.md`, `README.md`, `skill/SKILL.md`, `src/lib/errors.js`) | S3, S4, S5, S6, S7, S9 | inline | `273d572` |
| T4 | Close: `node --test` and `npm run pack:check` green, one differential check over the commands the diff did not name, evidence logged | all | inline | `5f9d13f` |
| T5 | Native RDD review over the committed slice: four lenses, the provider's refuter, one bounded correction of its four findings, the targeted validator, the acknowledgement | all | inline | `cf9b71b` |

## Log

- **L1 — user, verbatim.** "revisa el issue 25, debemos implementarlo ahora. Ignora el file
  portfolio-npm-launch, se queda untracked."
- **L2 — user, verbatim, on the divergence question.** "Preguntar en terminal, como funky-secure".
  Chosen over "sin preguntar: sale 2 con la acción exacta", so `install` becomes async and
  `docs/cli.md`'s `Never prompts` guarantee has to be restated as "never prompts without a terminal".
- **L3 — user, verbatim, on where the diagnosis lives.** "Por qué --check ya es el modo de solo
  lectura de install. No es un comando ajeno que se suma: es el flag que hace que install no escriba.
  --dry-run imprime el plan, --check informa divergencia. Que el diagnóstico de versión viva ahí no
  agranda su contrato, lo completa: hoy dice «faltan o difieren estos archivos», y le falta la mitad
  de la respuesta, que es de qué versión son los que hay. … La condición Un solo lugar que calcule el
  estado, dos que lo muestran. … install en una copia limpia imprime una línea: Installed · <ruta>
  (0.1.0). install --check imprime siempre el estado y la versión. install solo despliega las cuatro
  variantes cuando tiene que decidir o negarse." Also: "Sobre method_version, nada que decir: queda
  como está, es el reloj del protocolo y no se mezcla con esto."
- **L4 — user, verbatim, on a newer installed copy.** "sigue funky secure". Secure refuses without
  asking; in forge's contract a refusal that no answer can change is exit `1`, and `--force` is the
  documented way to accept the downgrade.
- **L5 — user, verbatim, on `--version`.** "Sí, mismo commit con su test."
- **L6 — evidence, exploration.** `docs/cli.md:92` guarantees `Never prompts` and
  `docs/architecture.md:104` guarantees `No prompts. The CLI never reads stdin`; both must be
  restated, not deleted, because `check`, `calc`, and `init` still never read stdin.
  `tests/skill.test.js:69` asserts the frontmatter keys are exactly `['name','description']`, so the
  `version:` line breaks it by construction and changes in the same commit.
  `install()` is synchronous and in-process in the whole suite (`tests/install.test.js:20`), so the
  prompt makes `install`, `dispatch`, `main`, `bin/funky-forge.js`, and `tests/cli.test.js`'s `run()`
  async.
- **L7 — decision, granularity.** The pack is 18 files, so the state is computed once for the pack:
  `SKILL.md` missing or the destination absent → `absent`; every shipped file present and byte-equal
  → `identical`; otherwise the installed `SKILL.md`'s version is compared with the shipped one →
  `older`/`newer`/`edited`, and `unversioned` when either side declares none. The version is read
  from the bytes, as `funky-secure` does, never from the local `package.json`: a copy that travelled
  by hand still says what it is.
- **L8 — evidence, T2 (`9be903a`).** `tests/skill.test.js` now asserts the keys
  `['name','description','version']` and, separately, that the frontmatter version equals
  `package.json`'s with a message naming both numbers. `tests/pack-version.test.js` (10 cases) covers
  the reading, the ordering (`0.2.0 < 0.10.0`, `0.1 == 0.1.0`, a prerelease keeps its release) and
  every state transition. RED observed twice before the code existed: the key list, then
  `ERR_MODULE_NOT_FOUND` for the new library. `--version` reads `package.json` through
  `import.meta.url`; its test is a pin rather than a RED, because the literal it replaced happened to
  equal the manifest — its value is the bump that used to go unnoticed.
- **L9 — evidence, T3 (`273d572`).** 18 cases in `tests/install.test.js` (14 RED before the command
  changed): one line for a clean install, `Current` on a second run with the file's `mtime` unchanged,
  the non-TTY refusal for `edited`/`older`/`unversioned`, both prompt answers, three invalid answers
  falling back to keep, the `newer` refusal that asks nothing even with a terminal attached, and
  `--check`/`--dry-run`/`--json` reading the same state. A real terminal was proved through a stream
  with `isTTY = true`; a naive `rl.question()` lost the answer typed before the question was
  registered, so answers are queued (`readLines`) instead of raced.
- **L10 — evidence, T4.** `node --test`: 201 tests, 201 pass, 0 fail. `node scripts/pack-guard.js`: 39
  packed files against 6 `files` entries, unchanged. Differential check over the commands this issue
  did not name, since `src/cli.js` changed: `--help`, `init`, `init --help`, `init --json`,
  `check design`, `check --help`, `calc`, `calc --help`, `calc --json` and an unknown command, run
  against the base commit (`3865b8f`) and against this branch, compared on stdout, stderr and exit
  code. All identical. The check earned its place: it caught that `--force` shares one `FLAG_SPECS`
  entry with `init`, so install's new wording leaked into `init --help`; the summary was restored to
  the base string and `init`'s help is byte-identical again. Follow-up, not fixed here: that shared
  summary ("overwrite files that differ from the shipped pack") still describes `install` on
  `init --help`, a pre-existing overlap this issue does not own.
- **L11 — handoff (superseded in part by L12).** Three commits on `feat/method-pack-version`, not
  pushed. Push, pull request and merge stay the maintainer's decision; the PR body should carry
  `Closes #25` and the `type:feature` label, both already on the issue. The branch was cut from
  `main` at `c848f34`, so `git diff main` is exactly this issue's work; comparing against `3865b8f`
  wrongly includes PR #27.
- **L12 — evidence, independent verification, and the two defects it found.** A hostile verifier read
  the spec and the diff before delivery and rejected two behaviours:
  (a) `install --json` on an `edited` copy answered `1` (keep) exited `0` with **empty stdout**,
  breaking the one-object contract on the only path where a human is present to read it;
  (b) `--dry-run --with-pointer` had lost the `POINTER_EXISTS` refusal and printed "Would append the
  pointer to AGENTS.md" for a pointer the real run refuses — the plan promised a write that cannot
  happen. Both are fixed: the JSON payload is built once and every successful path prints it, and the
  pointer conflict is checked before the plan.
  Three corrections came from the same review: a pack directory holding files but no `SKILL.md` is now
  `unversioned` rather than `absent`, so deleting that file asks instead of silently overwriting edited
  templates; `--check`'s row documents that `unversioned` also exits `1`; and `skill/SKILL.md` names all
  three copies the question covers, not just "another version".
  Six tests were added, four of them the verifier's own probes: the JSON keep path, the dry-run pointer
  refusal, a piped answer that is never consumed, the exit codes across every state, a pack without
  `SKILL.md`, and the Claude destination under `--json` (coverage the rewrite had dropped).
  Re-verified after the fix: `node --test` 207 pass, `node scripts/pack-guard.js` green, and the same
  differential check against `main` (`c848f34`) byte-identical for `--help`, `init`, `check` and `calc`
  on stdout, stderr and exit code. Unproven, and stated as such: a real console TTY (the prompt is
  proved through a stream with `isTTY = true`) and the Node 22 leg (this machine has 24 only).
- **L13 — native RDD review: approved on the correction (`cf9b71b`).** Lineage
  `review-b137a7578625aa28`, tier `high` (the runner read `bin/funky-forge.js` as a process boundary),
  16 changed files and 1322 lines frozen, correction budget 200. Four lenses were selected — risk,
  resilience, readability, reliability — and the provider then required a refuter, which corroborated
  four candidate-caused findings:
  - `R3-001` (BLOCKER, reliability): the keep branch returned success before the pointer block, so
    `install --with-pointer` on a divergent pack answered keep, exited `0` and appended nothing, while
    `--json` reported `pointer: null`.
  - `R3-002` (CRITICAL, reliability): presence was the directory, so an empty pre-created skill
    directory counted as a copy with no version to order and either asked or exited `2`. The baseline
    wrote into it.
  - `R4-partial-or-empty-target` (CRITICAL, resilience): requiring every shipped file before the copy
    could be anything but a divergence turned an interrupted install into an edit that needed
    `--force` to repair.
  - `R4-hidden-prompt-hang` (CRITICAL, resilience): the question goes to stderr, so gating it on
    `stdin.isTTY` alone could wait for an answer nobody could see.
  One bounded correction took 196 of the 200 allowed diff lines: the keep now skips only the file
  writes, presence is whether any shipped file is there, a new `incomplete` state completes missing
  files, and asking needs a terminal on both ends. The targeted validator approved the correction, and
  the acknowledgement burned the authority (`gentle-ai.review-acknowledged/v1`). Four advisories remain
  non-blocking follow-ups, none of which reopens this candidate: `R1-001` (risk, `stateLine`),
  `R2-001`, `R2-002` (the `--check` loop and the pointer guard) and `R2-003` (the answer table), the
  last three readability.
- **L14 — boundary.** The reviewed candidate is `cf9b71b`. This log entry and the task row above are
  documentation and ship after it, which is why the pull request names `cf9b71b` as the reviewed tree
  and this commit as the record. Review approval is not delivery authority: the pull request, its
  merge and the release stay ordinary repository policy.
