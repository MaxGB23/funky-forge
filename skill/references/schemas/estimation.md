# Estimation schema

Two fenced YAML blocks in `estimate.md` are read by `calc` and verified by `check`. The rate lives
only in `assumptions.md`.

## `blocks`

| Field | Type | Rules |
|---|---|---|
| `id` | string | one of `discovery`, `backend`, `ui`, `integrations`, `qa`, `management`; unique |
| `name` | string | display name |
| `optimistic` | number | `> 0`, `<= likely` |
| `likely` | number | `>= optimistic`, `<= pessimistic` |
| `pessimistic` | number | `>= likely` |
| `rationale` | string | one line, non-empty, specific to this project |

All six blocks are present, or a block is present and its absence is explained in the estimate
prose. `O <= M <= P` is checked per block (`BLOCK_ORDER_INVALID`).

## `pricing`

| Field | Type | Rules |
|---|---|---|
| `currency` | string | ISO code; must match `assumptions.currency` |
| `contingency` | number | fraction `0.15`-`0.25`; outside needs `contingency_reason` |
| `contingency_reason` | string | required when outside the band |
| `margin` | number | fraction, `> 0`, `< 1` |
| `margin_reason` | string | non-empty |
| `tco_monthly` | number | `>= 0`; never added to the price |
| `tco_components` | string | what the monthly cost covers |

Missing values: `PRICING_MISSING`. Contingency outside the band without a reason:
`CONTINGENCY_OUT_OF_BAND`. Margin without a reason: `MARGIN_MISSING`. TCO missing or folded into
the price: `TCO_MISSING`.

## `assumptions.md` fields used here

| Field | Type | Rules |
|---|---|---|
| `hourly_rate` | number or `unknown` | required for approval; `> 0` |
| `hourly_rate_source` | string | `user-provided` or `market-reference` |
| `market_references` | list | two or three entries when the source is researched |
| `contingency_default` | number | template prefill only |
| `margin_default` | number | template prefill only |
| `currency` | string | ISO code |
| `client_size` | string | `startup`, `smb`, `enterprise` |

A missing or zero rate is `RATE_MISSING`. A researched rate without two or three dated entries is
`MARKET_REFS_MISSING`.

## Arithmetic

```text
expected_block = (O + 4M + P) / 6
expected_total = sum(expected_block)
low_total      = sum(optimistic)
high_total     = sum(pessimistic)

expected_price = expected_total * rate * (1 + contingency) * (1 + margin)
low_price      = low_total      * rate * (1 + contingency) * (1 + margin)
high_price     = high_total     * rate * (1 + contingency) * (1 + margin)
```

Totals and prices are never rounded before the final display step.

## Generated table

`calc --write` replaces only the region between the markers:

```markdown
<!-- calc:start -->
| Block | O | M | P | Expected |
|---|---:|---:|---:|---:|
| Discovery | 16 | 24 | 40 | 25.3 |
| **Total** | **174** | **258** | **414** | **270.0** |

Rate: USD 40/h. Contingency: 20%. Margin: 30%.
Expected price: USD 16,848. Range: USD 10,858 - USD 25,834.
<!-- calc:end -->
```

Format: hours with one decimal in the table, money as whole units with `en-US` thousands
separators, `en-US` decimal point. `check` reports `ARITHMETIC_MISMATCH` when the table differs
from a fresh computation by more than `0.01`.

## `calc --json`

```json
{
  "ok": true,
  "currency": "USD",
  "blocks": [{ "id": "discovery", "optimistic": 16, "likely": 24, "pessimistic": 40, "expected": 25.33 }],
  "totals": { "optimistic": 174, "likely": 258, "pessimistic": 414, "expected": 270 },
  "pricing": { "rate": 40, "contingency": 0.2, "margin": 0.3, "expected": 16848, "low": 10857.6, "high": 25833.6 }
}
```

In JSON, block hours keep two decimals and money is unrounded. `ok: false` means invalid input and
the command exits `1` with an `errors` list.

## Markers

Both `<!-- calc:start -->` and `<!-- calc:end -->` are required after the YAML blocks. Without
them, `calc --write` refuses to write (`CALC_MARKERS_MISSING`) rather than guess where the table
goes.
