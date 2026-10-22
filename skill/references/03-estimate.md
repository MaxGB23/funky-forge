# Phase 3 — Estimate

> Question: **How much does it cost, and why?**

The estimate is arithmetic over blocks plus explicit decisions. If the client asks "why", every
number has a source.

## Inputs

`brief.md`, `design.md`, `.funky-forge/assumptions.md` (rate, currency, region, team).

## Output

`.funky-forge/estimate.md`.

## Blocks

| Block id | Covers |
|---|---|
| `discovery` | Requirements, spikes, validation |
| `backend` | Schema, API, business rules |
| `ui` | Screens, components, states |
| `integrations` | Third-party APIs, webhooks, imports |
| `qa` | Tests, CI, release, monitoring setup |
| `management` | Planning, communication, review |

Every design component belongs to exactly one block. Every block carries three points:
optimistic `O`, likely `M`, pessimistic `P`, plus a one-line rationale.

## Structured input

`estimate.md` contains two fenced YAML blocks. `calc` reads them; `check` verifies them.

```yaml
blocks:
  - id: discovery
    name: Discovery
    optimistic: 16
    likely: 24
    pessimistic: 40
    rationale: "Requirements workshop and two technical spikes"
```

```yaml
pricing:
  currency: USD
  contingency: 0.20
  contingency_reason: "First project with this client; one integration is unproven."
  margin: 0.30
  margin_reason: "SMB client, scope fixed for three months."
  tco_monthly: 60
  tco_components: "hosting, database, transactional email"
```

The rate is not repeated here. It lives in `assumptions.md` as `hourly_rate`; `contingency_default`
and `margin_default` there only prefill the template.

## Formula

```text
expected_block = (O + 4M + P) / 6
expected_total = sum(expected_block)
low_total      = sum(O)
high_total     = sum(P)

expected_price = expected_total * rate * (1 + contingency) * (1 + margin)
low_price      = low_total      * rate * (1 + contingency) * (1 + margin)
high_price     = high_total     * rate * (1 + contingency) * (1 + margin)
```

## Rounding

Hours: two decimals in JSON, one decimal in tables. Money: whole units in text with `en-US`
separators, unrounded in JSON. Comparisons use a `0.01` tolerance.

## Table between markers

`calc --write` regenerates only the region between `<!-- calc:start -->` and `<!-- calc:end -->`.
Never edit inside the markers by hand. Run `calc --write` before the gate: writing after approval
changes the body and revokes approval.

## Rate rule

1. If `hourly_rate` is greater than zero, use it. No research.
2. If it is missing or `unknown`, research two or three dated sources (job boards, freelance
   platforms, agency rate cards, surveys), record them under `market_references`, propose a range,
   and ask the human to confirm one value.
3. Without a confirmed rate the estimate cannot be approved (`RATE_MISSING`).
4. Never replace a rate the user gave.

## Gates

- Every design component has a block; no orphan block either.
- `O <= M <= P` per block; totals match the table.
- Rate confirmed and greater than zero.
- Contingency inside 15-25%, or outside with a non-empty `contingency_reason`.
- `margin` present with a non-empty `margin_reason`.
- TCO present and excluded from the price.
- `market_references` has two or three dated entries when the rate came from research.
- No placeholders; no empty required field.

## Other required content

Assumptions and exclusions; sensitivity (which block moves the price most); ROI check
against the brief's current cost. If the price exceeds the value the client gets in two years, say
so. If the current cost is `unknown`, say so and do not invent it.

## Complexity signals

Signals raise the hours of the affected block with a written rationale; they never apply a global
percentage. Money movement (backend, qa), per-client isolation (backend, qa), real-time (backend,
ui, qa), external integrations (integrations, qa), regulatory compliance (qa, management), high
volume (backend, qa).

## Reviewer

`references/reviewers/commercial.md`, **deep by default**. Pass the signals that apply in the
brief. Lens: would the client pay? what is the cheapest credible version? what will they ask for
later? is the range defensible? is TCO hidden?

## Re-entry

Any change to the estimate marks the proposal `stale`.
