# CLI reference

Six commands, no dependencies. Exit codes: `0` pass, `1` failure, `2` a decision only the human
can make. `install` asks one question on a terminal; with no terminal it prints a `reason:` instead, so
an agent never hangs waiting for an answer it cannot give.

```sh
funky-forge <command> --help   # per-command help, generated from the same table that parses flags
funky-forge --help             # all commands
funky-forge --version
```

## Commands

| Command | Purpose | Flags |
|---|---|---|
| `install` | Copy the method pack into a harness skill directory | `--target <agents\|claude>`, `--dry-run`, `--with-pointer`, `--force`, `--check`, `--json` |
| `init` | Create `.funky-forge/` from the shipped templates | `--language <en\|es>`, `--proposal-language <en\|es>`, `--force`, `--json` |
| `check <phase>` | Validate one phase; read-only | `--json`, `--strict` |
| `approve <phase>` | Write the approval a passing gate earned | `--by <name>`, `--dry-run`, `--force`, `--json` |
| `stale <phase>` | Revoke an approval and mark its approved dependents stale | `--dry-run`, `--json` |
| `calc` | Recompute hours and price from the blocks | `--write`, `--json` |

### `install`

| Behavior | Detail |
|---|---|
| Targets | `agents` → `.agents/skills/funky-forge/`, `claude` → `.claude/skills/funky-forge/` |
| Detection | `.claude/` means Claude; `.agents/skills/`, `.opencode/`, `.codex/` mean shared; both → exit `2` with `TARGET_AMBIGUOUS` and the exact re-run commands; neither → shared with a notice |
| Writes | Inside the target directory only, plus the opt-in pointer |
| Version | The pack declares the version of the binary that shipped it, so a stale copy is recognizable. A clean install says one line, `Installed · .agents/skills/funky-forge (0.2.0)`; a second run says `Current · …` and writes nothing |
| Divergent copy | An older copy, a copy with local changes on the version it declares, or one that declares no version is a decision. On a terminal `install` asks with each answer labelled, `[1]` keeps the copy (the default) and `[2]` replaces it, saying when that discards local changes. Without a terminal it exits `2` with a `reason:` naming the path, the versions and the fact that stdin is not a terminal. `--force` replaces without asking |
| Newer copy | Refused with exit `1`, both versions named: an installed protocol cannot be older than its validator. `--force` performs the downgrade |
| Pointer | `--with-pointer` appends one marked block to `AGENTS.md` (shared) or `CLAUDE.md` (Claude) and refuses a second (`POINTER_EXISTS`) |
| `--check` | Prints the state and the version in every case and writes nothing: `0` when the copy is current, `1` when it is absent, incomplete, older, newer, edited or unversioned |
| `--dry-run` | Prints the state and the plan, writes nothing, and never asks |

`--json` prints one object, and the notices go to stderr:

```json
{
  "ok": true,
  "target": "agents",
  "destination": ".agents/skills/funky-forge",
  "state": "older",
  "version": { "installed": "0.0.9", "shipped": "0.2.0" },
  "written": 18,
  "unmodified": 0,
  "pointer": null
}
```

`state` is one of `absent`, `identical`, `incomplete` (files missing, none of the present ones
differing), `older`, `newer`, `edited` (same version, different bytes) or `unversioned`. Missing files
are completed without asking (`Completed · … (0.2.0, 2 file(s) added)`): an interrupted copy is not
divergence. The version is read from the installed `SKILL.md`, never from the local `package.json`, so a
copy that travelled by hand still says what it is.

### `init`

Creates `brief.md`, `design.md`, `estimate.md`, `proposal.md`, `assumptions.md`, `decisions.md` and
`gates/`. Skeletons start as `draft` with the dependency chain already declared. `--language` sets
the internal language; `--proposal-language` defaults to it. An existing `.funky-forge/` is refused
(`DIR_EXISTS`) without `--force`; existing gate reports are never removed.

### `check <phase>`

Read-only by design: there is no `--fix`. Always returns `bodyHash`, including for a draft — it is
the value `funky-forge approve` writes into `approved_hash` at approval.

| Area | Codes |
|---|---|
| Availability | `MISSING_ARTIFACT`, `FRONTMATTER_INVALID`, `PHASE_REQUIRED`, `UNKNOWN_PHASE` |
| Shape | `SCHEMA_UNSUPPORTED`, `METHOD_VERSION_UNSUPPORTED`, `PHASE_MISMATCH`, `STATUS_INVALID`, `DEPENDS_ON_INVALID`, `MISSING_FIELD` |
| Approval | `APPROVED_CONTENT_CHANGED`, `DEPENDENCY_NOT_APPROVED`, `STALE_ARTIFACT` |
| Approval write | `APPROVAL_GATE_FAILED` (carrying the codes the evaluation reported), `ALREADY_APPROVED`, `STATUS_NOT_APPROVABLE` |
| Content | `PLACEHOLDER_FOUND`, `TEMPLATE_COMMENT` (warning), `NFR_INCOMPLETE` |
| Cross-artifact | `MISSING_MAPPING`, `UNDEFINED_COMPONENT`, `COMPONENT_NOT_ESTIMATED`, `COMPONENT_ONLY_OPTIONAL` (warning), `PRICE_MISMATCH`, `ARITHMETIC_MISMATCH` |
| Estimate | `RATE_MISSING`, `PRICING_MISSING`, `BLOCK_INVALID`, `BLOCK_ORDER_INVALID`, `BLOCK_DUPLICATE`, `CONTINGENCY_OUT_OF_BAND`, `MARGIN_MISSING`, `TCO_MISSING`, `CURRENCY_MISMATCH`, `MARKET_REFS_MISSING` (warning) |
| Gateway | `GATE_REPORT_MISSING`, `GATE_REPORT_MALFORMED`, `BLOCK_VERDICT`, `RISK_NOT_ACCEPTED`, `RISK_REASON_MISSING` (warning) |

`--json` prints one object:

```json
{
  "ok": false,
  "phase": "design",
  "bodyHash": "sha256:...",
  "errors": [{ "code": "MISSING_MAPPING", "message": "...", "artifact": "design.md" }],
  "warnings": []
}
```

`--strict` turns every warning into an error and exits `1`. Strictness lives here and nowhere else: a
warning never blocks a write.

### `approve <phase>`

The write half of the gate. `approve` runs the same evaluation `check` renders and refuses with exit
`1` on every error it reports, except the two states it exists to clear: `APPROVED_CONTENT_CHANGED`
and `STALE_ARTIFACT`. On success it writes `status: approved`, `approved_by` (from `--by`),
`approved_at` (the UTC date) and `approved_hash`, then reads the file back and re-verifies the hash
instead of reporting success on faith. Warnings never block.

| State | Result |
|---|---|
| `draft`, `in_review`, `stale` | approvable |
| `approved`, hash matches the body | `ALREADY_APPROVED`, exit `1`; `--force` re-dates it and changes nothing else |
| `approved`, hash no longer matches | approvable: re-approving is the cure for `APPROVED_CONTENT_CHANGED` |
| `rejected` | `STATUS_NOT_APPROVABLE`, exit `1`; `--force` does not change it |

The write is surgical: only the four keys change. A document that declares none of `approved_by`,
`approved_at`, `approved_hash` gains them immediately after `status:`, in that order; a key already
present keeps its position and its neighbours. `--force` never bypasses the evaluation, never approves
a `rejected` artifact and never writes an artifact that would fail. A write needs `--by <name>`:
without it the command refuses with `FLAG_VALUE_MISSING` and writes nothing, because `approved_by` is
required whenever `status` is `approved`. `--dry-run` prints the frontmatter it would write, including
`approved_at`, and writes nothing.

A refusal prints `APPROVAL_GATE_FAILED` carrying the codes the evaluation reported, with each message
verbatim on stderr:

```text
$ funky-forge approve problem --by "the client"
funky-forge approve - problem
  error: APPROVAL_GATE_FAILED: the artifact did not pass the gate: MISSING_ARTIFACT
1 error(s)
  MISSING_ARTIFACT: .funky-forge/brief.md does not exist; run funky-forge init or write the artifact first
```

`--json` prints one object on stdout and the report on stderr:

```json
{
  "ok": true,
  "phase": "problem",
  "artifact": ".funky-forge/brief.md",
  "dryRun": false,
  "status": "approved",
  "approvedBy": "the client",
  "approvedAt": "2026-03-01",
  "approvedHash": "sha256:...",
  "bodyHash": "sha256:...",
  "errors": [],
  "warnings": []
}
```

### `stale <phase>`

Revokes an approval and propagates it: the phase becomes `status: draft` with `approved_by`,
`approved_at` and `approved_hash` removed, and every **approved** dependent is marked `status: stale`,
transitively over the dependency chain. A dependent that was never approved holds no approval to
lose, so it is left byte-identical and reported as `unchanged` with the status it kept. Gate reports
are never touched and no body is edited — the recovery for a mistaken run is the repository's own
history.

| Case | Result |
|---|---|
| Dependent is `approved` | written as `stale`, keeping its content and its approval record |
| Dependent was never approved | left untouched and reported `unchanged` with the status it kept |
| Dependent already `stale` | left untouched and not counted as changed |
| Dependent absent | skipped and reported; there is nothing to mark |
| A target that will be written does not parse | everything aborts before the first write, exit `1` |
| The phase artifact is absent | `MISSING_ARTIFACT`, exit `1` |

`--dry-run` prints the plan and the frontmatter it would write, and writes nothing. `--json` prints one
object on stdout and the report on stderr:

```json
{
  "ok": true,
  "phase": "problem",
  "artifact": ".funky-forge/brief.md",
  "dryRun": false,
  "written": [".funky-forge/brief.md", ".funky-forge/design.md"],
  "skipped": [".funky-forge/estimate.md"],
  "unchanged": [".funky-forge/proposal.md"],
  "errors": []
}
```

### `calc`

| Behavior | Detail |
|---|---|
| Input | The `blocks` and `pricing` YAML blocks plus `assumptions.hourly_rate` |
| Output | The table, totals, and price; `--json` keeps two decimals in hours and unrounded money |
| `--write` | Replaces only the region between `<!-- calc:start -->` and `<!-- calc:end -->`, idempotently |
| Refuses | `CALC_MARKERS_MISSING`, `RATE_MISSING`, `BLOCK_ORDER_INVALID`, `CONTINGENCY_OUT_OF_BAND`, `MARGIN_MISSING`, `BLOCK_DUPLICATE` |
| On an approved estimate | Succeeds, prints `APPROVED_CONTENT_CHANGED` to stderr, and the approval is revoked until re-gated |

`check` runs the same computation in memory, so the written table and the verified table cannot
disagree by construction.

## Argument handling

- `-h` and `--help` are accepted globally and per command.
- An unknown `--flag` or a stray `-x` fails with `UNKNOWN_FLAG` instead of being read as an argument.
- A value flag without a value fails with `FLAG_VALUE_MISSING`.
- The help text is generated from the command table, and a test fails if a command or flag is
  declared without documentation (`helpProblems()`).

## Guarantees

| Guarantee | Why it matters |
|---|---|
| Never prompts without a terminal | `install` asks only when stdin is a terminal. With none, a decision becomes a `reason:` and exit `2`, so an agent never waits for an answer it cannot give, and `check`, `calc`, `init`, `approve` and `stale` never read stdin at all |
| Writes only where documented | `install` inside the skill directory, `calc --write` between markers, `init` inside `.funky-forge/`, `approve` the four approval keys, `stale` the status and the approval keys |
| Deterministic paths | Phase → file → gate report mapping is fixed, so two projects never disagree |
| Same behavior on every harness | No dependency on a model, a provider, or a network |
| Read-only checking | `check` cannot revoke an approval by accident |

## Package manager

The CLI has no dependencies, so the package manager only affects how you obtain and run it. pnpm is
recommended: it supports `minimumReleaseAge`, which refuses a version until it has been public for a
configured number of minutes. This repository pins seven days in `pnpm-workspace.yaml`
(`minimumReleaseAge: 10080`), which is cheap here because nothing ships with dependencies. For
projects with real dependency trees, one to three days is the better trade: long enough for a
compromised release to be caught, short enough that security patches land in time. pnpm also
supports `minimumReleaseAgeExclude` for the rare package that needs an immediate update. npm works
too; it has no built-in equivalent to that setting.

This is a practice we promote, not a requirement of this package. Installing `funky-forge` with npm
is equally safe, because nothing it installs comes from a third party. The pin still earns its place
in the repository: it protects the machine that clones and builds the project, it covers the
toolchain, and it is already in force the moment a first dependency appears. Adopting it before the
need is cheaper than remembering it under deadline, and a policy that has never blocked a build is
easier to keep.

## Next

- File formats the commands read: [artifacts.md](artifacts.md)
- How the phases run: [method.md](method.md)
