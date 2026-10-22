# Artifact schema

The CLI validates these shapes. Do not invent variants; if a field is missing, add it.

## Frontmatter

| Field | Type | Allowed / default |
|---|---|---|
| `schema` | integer | `1`; anything else is `SCHEMA_UNSUPPORTED` |
| `phase` | string | `problem`, `design`, `estimate`, `proposal` |
| `status` | string | `draft`, `in_review`, `approved`, `stale`, `rejected` |
| `depends_on` | list of phase names | see the matrix below |
| `language` | string | `en`, `es`, or a BCP-47 tag |
| `proposal_language` | string | proposal only; defaults to `language` |
| `approved_by` | string or null | filled at approval |
| `approved_at` | date string or null | `YYYY-MM-DD` |
| `approved_hash` | string or null | `sha256:<64 lowercase hex>` |
| `method_version` | integer | `1` |

Invalid YAML or a missing required key is `FRONTMATTER_INVALID`.

## Dependency matrix

| Artifact | `depends_on` | Gate report |
|---|---|---|
| `brief.md` | `[]` | `gates/1-problem.md` |
| `design.md` | `[problem]` | `gates/2-design.md` |
| `estimate.md` | `[problem, design]` | `gates/3-estimate.md` |
| `proposal.md` | `[problem, design, estimate]` | `gates/4-proposal.md` |

Dependencies are phase names. The mapping to files and gate reports is fixed by the table.

## Status rules

1. `approved` requires every dependency `approved` (`DEPENDENCY_NOT_APPROVED`).
2. Editing an artifact clears its own approval back to `draft` and marks dependents `stale`.
3. `check` refuses to pass a `stale` artifact for approval (`STALE_ARTIFACT`).
4. `stale` keeps content; it only loses approval.
5. `rejected` cannot advance until rewritten.

## Normalized body and `approved_hash`

`approved_hash` is `sha256:` plus the lowercase hex SHA-256 of the normalized body:

1. remove the frontmatter block and its `---` delimiters;
2. convert line endings to LF and strip a trailing CR on each line;
3. strip trailing spaces and tabs on each line;
4. trim leading and trailing blank lines;
5. keep exactly one trailing LF;
6. keep `calc` markers and their content.

`funky-forge check --json` returns `bodyHash`. Copy it into `approved_hash`; never compute it by
hand. A mismatch while `approved` is `APPROVED_CONTENT_CHANGED`.

## Gate report

`gates/<n>-<phase>.md`:

| Field | Type | Notes |
|---|---|---|
| `phase` | string | must match the artifact phase |
| `verdict` | string | `PASS`, `PASS_WITH_RISKS`, `BLOCK` |
| `depth` | string | `light` or `deep` |
| `escalation_reason` | string or null | quoting the trigger or the light finding |
| `reviewer` | string | `product`, `design`, or `commercial` |
| `date` | date string | `YYYY-MM-DD` |
| `findings` | integer | must equal the number of finding headings |
| `not_verified` | list of strings | may be empty, must be present |
| `accepted_risks` | list | see below |

Finding headings are mandatory and parseable:

```text
### F<id> - Severity: <blocker|high|medium|low>
```

A malformed heading is `GATE_REPORT_MALFORMED`. A missing report is `GATE_REPORT_MISSING`.
`verdict: BLOCK` is `BLOCK_VERDICT` and cannot advance.

## Accepted risks

For `PASS_WITH_RISKS`, every `blocker` or `high` finding needs an entry:

```yaml
accepted_risks:
  - finding: F1
    severity: high
    reason: "..."
    accepted_by: "<human>"
    date: 2026-10-22
```

A missing entry is `RISK_NOT_ACCEPTED`.

## Forbidden content

Placeholder tokens: `TBD`, `TODO`, `FIXME`, `[fill]`. An empty required field is
`MISSING_FIELD`; a placeholder token is `PLACEHOLDER_FOUND`.

Template HTML comments (`<!-- ... -->`) left in an artifact are a warning; under `--strict` they
are an error. Remove them before the gate.

## `check --json`

```json
{
  "ok": false,
  "phase": "design",
  "bodyHash": "sha256:...",
  "errors": [{ "code": "MISSING_MAPPING", "message": "...", "artifact": "design.md" }],
  "warnings": []
}
```

Error codes are stable; messages are meant for humans and may be reworded.
