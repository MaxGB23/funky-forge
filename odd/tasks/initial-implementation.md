# funky-forge v1: skill pack + deterministic CLI

Feature document for the initial implementation. The specification is
`rfcs/funky-forge-skill-pack-rfc.md` revision 3; this file records only the decisions that
refine it, the task order, and the evidence. When in doubt, reread the RFC.

## Specs

- **S1 — Name.** `funky-forge` is the single name for the repository, the npm package, the
  executable, and the registered skill. No version suffix (`v2`, `v5`) in any path, message, or
  identifier; the version lives only in `package.json`. (RFC §Identity, D25.)
- **S2 — Artifacts.** Project artifacts live in `.funky-forge/` at the project root, with the
  fixed names of RFC §9.1: `brief.md`, `design.md`, `estimate.md`, `proposal.md`,
  `assumptions.md`, `decisions.md`, `gates/1-problem.md` … `gates/4-proposal.md`.
- **S3 — Independence.** The package does not depend on `funky-cli` and ships no alias for its
  commands. (RFC §16.1, D26.)
- **S4 — No publishing.** User verbatim: "sin publicacion en npm, eso lo omitimos por ahora, ya
  que manejaré ciertas politicas de publicacion que aun no configuro". No `npm publish`, no
  `npm login`, no registry writes. `npm pack --dry-run` is allowed and used as a smoke check.
- **S5 — funky-ai untouched.** User verbatim: "funky-ai no se toca, es un repo legacy, no hay
  paquete publicado, solo fue un experimento inicial". RFC §16.1 and §18 step 9 are out of
  scope and leave this document as historical guidance.
- **S6 — License.** `MIT`, as answered by the user.
- **S7 — Stack.** JavaScript ESM, Node >= 20.11, zero runtime and zero dev dependencies,
  `node --test` with `node:assert/strict`, JSDoc types only, pnpm 12 as package manager with a
  repository-level `minimumReleaseAge`. No TypeScript build, no `dist/`.
- **S8 — Validation first.** Before any CLI code: run the method by hand on two scratch projects
  (A: internal CRUD, one developer, ~3 weeks; B: medium SaaS with auth, a payment provider and
  one integration, ~3 months). User verbatim: "Proyectos A y B completos". Evidence is recorded
  under `docs/validation/`. (RFC §17, acceptance criterion 9.)
- **S9 — CLI surface.** Four commands — `install`, `init`, `check <phase>`, `calc` — with the
  flags, outputs, side effects, and exit codes of RFC §13: `0` success, `1` failure,
  `2` `TARGET_AMBIGUOUS`. No command prompts; the CLI is invoked without a TTY.
- **S10 — Gates.** Gate report at `gates/<n>-<phase>.md` with the frontmatter of RFC §9.3
  (`verdict`, `depth`, `escalation_reason`, `not_verified`, `accepted_risks`), finding headings
  `### F<id> - Severity: <blocker|high|medium|low>`, verdicts `PASS | PASS_WITH_RISKS | BLOCK`,
  one deep escalation per review cycle (RFC §12.3 trigger 5).
- **S11 — Approval hash.** `approved_hash` is `sha256:<lowercase hex>` of the normalized body;
  normalization is exactly RFC §9.2 rule 6. `check --json` returns `bodyHash` and never writes.
  `calc --write` on an approved estimate revokes approval (RFC §9.2 rule 7).
- **S12 — Git.** Local repository only: `git init`, `main`, work on `feat/skill-pack-and-cli`.
  One commit per task, Conventional Commits, no `Co-Authored-By`. No remote, no push, no PR:
  those are the user's decisions.
- **S13 — Derived numbers.** Hours: 2 decimals in `--json`, 1 decimal in tables. Money: whole
  currency units with `en-US` thousands separators in text, unrounded in `--json`; comparison
  tolerance `0.01`. Expected hours `(O + 4M + P) / 6`. (RFC §10.2, §10.3 examples.)
- **S14 — Language.** Code, comments, CLI output, tests, commit messages, and repository docs in
  English. User-facing chat in Spanish.

## Tasks

| ID | Task | Specs | Route | Commit |
|---|---|---|---|---|
| T1 | Scaffold the package: `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `LICENSE`, `README.md`, directories, `bin` stub | S1, S4, S6, S7, S12 | inline | `chore: scaffold funky-forge package` |
| T2 | Author the method core: `SKILL.md`, `references/00-map.md`, `01-problem.md` … `04-proposal.md`, `revision.md` | S1, S2, S10, S14 | inline | `docs(skill): add method core and phase contracts` |
| T3 | Author reviewer briefs, schemas, and templates | S2, S10, S13 | inline | `docs(skill): add reviewer briefs, schemas, and templates` |
| T4 | Validate on Project A (internal CRUD), record evidence | S8, S10 | reviewers delegated | `docs(validation): record project A run` |
| T5 | Validate on Project B (medium SaaS), record evidence | S8, S10 | reviewers delegated | `docs(validation): record project B run` |
| T6 | CLI foundations: markdown/frontmatter/YAML subset parser, artifact model, path mapping, error codes, exit codes | S2, S9, S11, S13 | inline | `feat(cli): add artifact parsing and command plumbing` |
| T7 | `install`: detection, `--target`, `--dry-run`, `--with-pointer`, `--force`, `--check`, exit `2` | S1, S9 | inline | `feat(cli): implement install` |
| T8 | `init`: `.funky-forge/` skeletons, language flags, `--force` | S2, S9 | inline | `feat(cli): implement init` |
| T9 | `calc`: formula, markers, `--write`, `--json` | S9, S11, S13 | inline | `feat(cli): implement calc` |
| T10 | `check`: schema, status rules, dependencies, `approved_hash`/`bodyHash`, placeholders | S9, S10, S11 | inline | `feat(cli): implement check core` |
| T11 | `check`: cross-artifact mappings, NFR table, blocks vs components, `pricing` block, `market_references` | S2, S9, S13 | inline | `feat(cli): add cross-artifact checks` |
| T12 | `check`: gate reports, finding headings, `accepted_risks`, `PASS_WITH_RISKS`, `--json`, `--strict` | S9, S10 | inline | `feat(cli): validate gate reports and risks` |
| T13 | Wire the gate protocol into the skill, finish `README.md`, `docs/`, `npm pack --dry-run` smoke | S4, S9, S10 | inline | `docs: wire gate protocol and document usage` |
| T14 | Acceptance sweep against RFC §20, final review, close the feature | all | assess + review | `chore: close funky-forge v1` |

## Delivery slices

| Slice | Tasks | Review unit |
|---|---|---|
| 1 | T1 | Repository creation and scaffold |
| 2 | T2, T3 | The method pack (prose only, no executable behavior) |
| 3 | T4, T5 | Validation evidence (scratch projects, no production code) |
| 4 | T6, T7, T8 | CLI plumbing, `install`, `init` |
| 5 | T9, T10, T11, T12 | `calc` and `check` |
| 6 | T13, T14 | Documentation, wiring, acceptance sweep |

Prose slices exceed 400 authored lines by design; the review unit is the commit, not the slice
total. Behavior slices stay near or below 400 authored lines.

## Log

- **L1** — User request, verbatim: "quiero arrancar con odd para implementar todo, desde la
  creacion del repo hasta el final, sin publicacion en npm, eso lo omitimos por ahora, ya que
  manejaré ciertas politicas de publicacion que aun no configuro. Dime si falta algo por decidir
  antes de arrancar, el rfc es la base, si algo se olvida se relee para refrescar"
- **L2** — Answers to the four pre-start questions, verbatim: "1. necesito tu opinion, pienso en
  TS ESM y vitest, manejamos pnpm con minimum release age para evitar supply chain. TS no
  ayudará mucho a detectar problemas antes de publicar, eso yo opino, pero quiero tu
  recomendacion" / "2. MIT" / "3. funky-ai no se toca, es un repo legacy, no hay paquete
  publicado, solo fue un experimento inicial." / "4. Proyectos A y B completos"
- **L3** — Decision taken from L2 and recorded as S7: JavaScript ESM with JSDoc types,
  `node --test`, zero dependencies, pnpm with `minimumReleaseAge`; no TypeScript build. Version
  `0.1.0`; MIT copyright holder `funky-forge contributors`. Measured environment: Node 24.16.0,
  npm 11.13.0, pnpm 12.3.4, git 2.47.1 on Windows.
- **L4** — "continuamos, solo paramos si hay algo que requiera mi intervencion, algo critico que se
  deba decidir y preguntame". Standing instruction for the rest of the build: continue through
  T7-T14 without asking for permission at each step; stop only for a decision that needs the human.
- **L5** — Acceptance sweep (T14) by an independent verifier reproduced six defects against RFC
  section 13.3 and S9: `check` never validated required body sections; `NFR_INCOMPLETE` and
  `COMPONENT_NOT_ESTIMATED` were warnings when the RFC names them as checks; the arithmetic
  comparison used 0.05 instead of the 0.01 tolerance; a missing `escalation_reason` key and an
  escalated light review passed; `install --json` printed a notice before the JSON. All six fixed
  in `856b1dd` with tests. Two further RFC 13.3 proposal rules were deliberately left to the
  reviewer: mapping every estimate block into a proposal phase and proving every brief must-have
  is included or excluded need a declared correspondence the templates do not carry, so a CLI rule
  would guess. The RFC rows are marked `(reviewer)` and `revision.md` states the boundary.

## Evidence

| Task | Commit | Result |
|---|---|---|
| T1 | `71284c6` | Package scaffold; `funky-forge --help` exits 0, unknown command exits 1; `pnpm test` finds 0 tests |
| T2 | `130fd79` | Method core: SKILL.md 87 lines, references 00-04, revision.md; pack files 12 excluding templates |
| T3 | `bc269c4` | 3 reviewer briefs (46-60 lines), 2 schemas, 6 templates |
| T4 | `4409477` | Project A validated end-to-end with 6 independent reviews; evidence in `docs/validation/project-a.md` |
| T5 | `83cfb41` | Project B validated end-to-end (7 reviews, 3 design rounds); evidence in `docs/validation/project-b.md` |
| T6 | `b4ac65f`, `8e65a40` | YAML subset parser, frontmatter, body hash (8/8 real approvals reproduced), markdown helpers, paths, error codes, dispatch; 40 tests |
| T7 | `385b906` | `install`: target detection, `TARGET_AMBIGUOUS` exit 2, idempotent copy of 18 files, divergence refusal, `--check`, `--dry-run`, one-shot pointer |
| T8 | `aef6fe7` | `init`: six skeletons from the templates, dependency chain, language flags, `DIR_EXISTS` without `--force`, gates survive |
| T9 | `16ad569` | `calc`: PERT formula, marker-scoped `--write` (idempotent), `--json` precision, `RATE_MISSING`/`BLOCK_ORDER_INVALID`/`CALC_MARKERS_MISSING`; recomputed both validation projects to the documented numbers (153.67 h / USD 8,390 and 396.83 h / USD 27,858) |
| T10 | `a8ca402` | `check` core: schema, status, dependency approvals, `approved_hash`, placeholders, gate presence, `--json` with `bodyHash`, `--strict`; read-only |
| T11 | `1b003f1` | Cross-artifact: component coverage vs components vs rejected alternatives, NFR table, generated-table arithmetic, component pricing, proposal price; 0 errors and 0 warnings on both validation projects |
| T12 | `114b9b6` | Gate reports: verdict/depth/`findings` count/headings, round-scoped ids (`R3-F1`), `not_verified`, `accepted_risks` with dangling-id detection, `BLOCK_VERDICT`; green on all 8 real gate reports |
| T13 | `55bc842` | Gate contract in `revision.md` and `SKILL.md`, full README, packed-tarball smoke: 36 files, install from the tarball copies the pack and `init`/`check` work |
| T14 | `856b1dd` | Acceptance sweep by an independent verifier, then six defects fixed with tests: required body sections, NFR and component errors, 0.01 arithmetic tolerance, gate escalation rules, `install --json` hygiene; 113 tests, 8/8 real phase checks clean |
