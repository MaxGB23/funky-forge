# CLI reference

Four commands, no prompts, no dependencies. Exit codes: `0` pass, `1` failure, `2` a decision only
the human can make.

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
| `calc` | Recompute hours and price from the blocks | `--write`, `--json` |

### `install`

| Behavior | Detail |
|---|---|
| Targets | `agents` → `.agents/skills/funky-forge/`, `claude` → `.claude/skills/funky-forge/` |
| Detection | `.claude/` means Claude; `.agents/skills/`, `.opencode/`, `.codex/` mean shared; both → exit `2` with `TARGET_AMBIGUOUS` and the exact re-run commands; neither → shared with a notice |
| Writes | New files inside the target directory only |
| Divergence | A file that differs from the shipped pack is refused (`MODIFIED_FILE`) unless `--force`; `--check` reports it and writes nothing |
| Pointer | `--with-pointer` appends one marked block to `AGENTS.md` (shared) or `CLAUDE.md` (Claude) and refuses a second (`POINTER_EXISTS`) |
| Idempotent | A second run reports `Unmodified: 18` and writes nothing |

### `init`

Creates `brief.md`, `design.md`, `estimate.md`, `proposal.md`, `assumptions.md`, `decisions.md` and
`gates/`. Skeletons start as `draft` with the dependency chain already declared. `--language` sets
the internal language; `--proposal-language` defaults to it. An existing `.funky-forge/` is refused
(`DIR_EXISTS`) without `--force`; existing gate reports are never removed.

### `check <phase>`

Read-only by design: there is no `--fix`. Always returns `bodyHash`, including for a draft — it is
the value you copy into `approved_hash` at approval.

| Area | Codes |
|---|---|
| Availability | `MISSING_ARTIFACT`, `FRONTMATTER_INVALID`, `PHASE_REQUIRED`, `UNKNOWN_PHASE` |
| Shape | `SCHEMA_UNSUPPORTED`, `METHOD_VERSION_UNSUPPORTED`, `PHASE_MISMATCH`, `STATUS_INVALID`, `DEPENDS_ON_INVALID`, `MISSING_FIELD` |
| Approval | `APPROVED_CONTENT_CHANGED`, `DEPENDENCY_NOT_APPROVED`, `STALE_ARTIFACT` |
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

`--strict` turns every warning into an error and exits `1`.

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
| Never prompts | Safe to call from an agent with no terminal; a real decision becomes exit `2` |
| Writes only where documented | `install` inside the skill directory, `calc --write` between markers, `init` inside `.funky-forge/` |
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

## Next

- File formats the commands read: [artifacts.md](artifacts.md)
- How the phases run: [method.md](method.md)
