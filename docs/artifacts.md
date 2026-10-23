# Artifacts and formats

Every project has six files and four gate reports. The CLI reads them; this page is the contract it
enforces. If a field is missing, add it — do not invent a variant.

```text
.funky-forge/
  assumptions.md      rate, currency, region, defaults
  brief.md            phase 1: problem
  design.md           phase 2: design
  estimate.md         phase 3: estimate
  proposal.md         phase 4: the client document
  decisions.md        append-only decision log
  gates/1-problem.md … gates/4-proposal.md
```

File names are fixed and not configurable.

## Frontmatter

| Field | Type | Rule |
|---|---|---|
| `schema` | integer | `1`; anything else is `SCHEMA_UNSUPPORTED` |
| `phase` | string | `problem`, `design`, `estimate`, `proposal`, and must match the file |
| `status` | string | `draft`, `in_review`, `approved`, `stale`, `rejected` |
| `depends_on` | list | the fixed matrix below |
| `language` | string | `en`, `es`, or a BCP-47 tag |
| `proposal_language` | string | proposal only; defaults to `language` |
| `approved_by` | string or null | required when `approved` |
| `approved_at` | `YYYY-MM-DD` or null | required when `approved` |
| `approved_hash` | `sha256:<64 lowercase hex>` or null | required when `approved` |
| `method_version` | integer | `1` |

Invalid YAML or a missing key is `FRONTMATTER_INVALID`.

| Artifact | `depends_on` |
|---|---|
| `brief.md` | `[]` |
| `design.md` | `[problem]` |
| `estimate.md` | `[problem, design]` |
| `proposal.md` | `[problem, design, estimate]` |

## Statuses

| Status | Meaning | Advancing |
|---|---|---|
| `draft` | Being written | No |
| `in_review` | With the reviewer | No |
| `approved` | Hash matches the body | Yes |
| `stale` | A dependency changed after approval | No (`STALE_ARTIFACT`) |
| `rejected` | The human said no | No, until rewritten |

An artifact cannot be `approved` while a dependency is not (`DEPENDENCY_NOT_APPROVED`).

## Normalized body and `approved_hash`

`approved_hash` is `sha256:` plus the lowercase hex SHA-256 of the normalized body:

1. remove the frontmatter block and its `---` delimiters;
2. convert line endings to LF and strip a trailing CR on each line;
3. strip trailing spaces and tabs on each line;
4. trim leading and trailing blank lines;
5. keep exactly one trailing LF;
6. keep the `calc` markers and their content.

`check --json` returns `bodyHash`; copy that value into `approved_hash` at approval. Never compute it
by hand. A mismatch while `approved` is `APPROVED_CONTENT_CHANGED`.

## Required sections

A section counts as present only when its content is non-empty and free of placeholder tokens.
Missing is `MISSING_FIELD` with the section name.

| Phase | Required sections |
|---|---|
| `problem` | One-line summary · Problem today · Users and volume · Core flow · Must-haves · Out of scope · Success metric · Deadline and constraints · Current cost of the problem |
| `design` | Architecture at a glance · Components and responsibilities · the must-have coverage map (matched by shape: `Must-have … map` or `… coverage`) · Data model and retention · Auth and permissions · Integrations · NFR decisions · Risks and mitigations · Rejected alternatives · Stack decision · Open decisions |
| `estimate` | Work blocks · Pricing |
| `proposal` | none: its headings follow `proposal_language` |

## Gate report

```markdown
---
phase: design
verdict: PASS_WITH_RISKS
depth: deep
escalation_reason: null
reviewer: design
date: 2026-10-22
findings: 2
not_verified: []
accepted_risks:
  - finding: R3-F1
    severity: high
    reason: "accepted for launch; the export can wait"
    accepted_by: "the client"
    date: 2026-10-22
---

### F1 - Severity: medium - Slot exclusivity owner

### R3-F1 - Severity: high - Restore path has no journal
```

Rules the CLI enforces:

- `phase` matches the artifact, `verdict` is `PASS`/`PASS_WITH_RISKS`/`BLOCK`, `depth` is
  `light`/`deep`, `reviewer` and `date` are present, `not_verified` is a list even when empty.
- `findings` equals the number of **level-three** headings. Deeper headings (`####`) are notes.
- Each heading parses as `### F<id> - Severity: <blocker|high|medium|low>`; anything else is
  `GATE_REPORT_MALFORMED`.
- `verdict: BLOCK` is `BLOCK_VERDICT` and cannot advance.
- Under `PASS_WITH_RISKS`, every `blocker` and `high` finding needs an `accepted_risks` entry
  (`RISK_NOT_ACCEPTED`); an entry citing an id that is not in the report is `GATE_REPORT_MALFORMED`.
- A missing escalation key is malformed, and a `light` review with a `blocker`/`high` finding must
  state why it escalated.

**Round-scoped ids.** `F1` means round 1; when a phase is reviewed again, prefix the id with the
round (`R3-F1`). Bare ids are normalized to round 1, so a round-3 citation can never silently match
an older finding with the same number.

## Estimate blocks and pricing

Two fenced YAML blocks inside `## Work blocks` and `## Pricing`.

| Field | Rule |
|---|---|
| `blocks[].id` | one of `discovery`, `backend`, `ui`, `integrations`, `qa`, `management`; unique |
| `blocks[].optimistic/likely/pessimistic` | numbers, `optimistic <= likely <= pessimistic`, `> 0` |
| `blocks[].rationale` | one specific line |
| `pricing.currency` | must match `assumptions.currency` |
| `pricing.contingency` | fraction `0.15`–`0.25`; outside needs `contingency_reason` |
| `pricing.margin` | fraction `> 0` and `< 1`, with a non-empty `margin_reason` |
| `pricing.tco_monthly` + `tco_components` | required, and never added to the price |

```text
expected_block = (O + 4M + P) / 6
expected_price = sum(expected_block) * rate * (1 + contingency) * (1 + margin)
```

The rate lives only in `assumptions.hourly_rate`; a researched rate needs two or three dated market
references. Totals and prices are never rounded before display.

## Generated table

`calc --write` replaces only the region between the markers:

```markdown
<!-- calc:start -->
| Block | O | M | P | Expected |
|---|---:|---:|---:|---:|
| Discovery | 16 | 24 | 40 | 25.3 |
| **Total** | **56** | **84** | **130** | **87.0** |

Rate: USD 40/h. Contingency: 20%. Margin: 30%.
Expected price: USD 5,429. Range: USD 3,494 - USD 8,112.
<!-- calc:end -->
```

Hours keep one decimal in the table and two in JSON; money is whole units with `en-US` separators in
text and unrounded in JSON. `check` recomputes and reports `ARITHMETIC_MISMATCH` when a cell differs
from the rendered value by more than `0.01`. Missing markers are `CALC_MARKERS_MISSING`.

## Forbidden content

| Token | Code |
|---|---|
| `TBD`, `TODO`, `FIXME`, `[fill]` | `PLACEHOLDER_FOUND` |
| Template `<!-- ... -->` comments left in the body | `TEMPLATE_COMMENT`, a warning; an error under `--strict` |

`calc` markers are not template comments; they are required.

## Cross-artifact rules

| Phase | Rule |
|---|---|
| `design` | Every component in coverage must exist in the components list (`UNDEFINED_COMPONENT`); every component must be covered or appear as `- <name> - rejected because …` (`MISSING_MAPPING`); the NFR table needs at least three decisions (`NFR_INCOMPLETE`) |
| `estimate` | Every design component must be named in the estimate (`COMPONENT_NOT_ESTIMATED`); a component named only under an optional heading is a warning (`COMPONENT_ONLY_OPTIONAL`) |
| `proposal` | The proposal must state the estimate price (`PRICE_MISMATCH`); scope correspondence is the reviewer's job |

Two scope rules are deliberately not automated: mapping every estimate block into a proposal phase,
and proving every brief must-have is included or excluded. Both need a declared correspondence the
templates do not carry yet, so a rule would guess. They are marked `(reviewer)` in the RFC.

## Next

- Commands and error codes: [cli.md](cli.md)
- How the phases run: [method.md](method.md)
