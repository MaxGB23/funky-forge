---
schema: 1
phase: estimate
status: draft
depends_on: [problem, design]
language: en
approved_by: null
approved_at: null
approved_hash: null
method_version: 1
---

# Estimate — <project name>

<!-- Arithmetic over blocks plus explicit decisions. Replace every comment with real content.
     Run "funky-forge calc --write" before the gate, never after approval. -->

## Work blocks

```yaml
blocks: []
```

<!-- One entry per block: discovery, backend, ui, integrations, qa, management.
     Each with optimistic, likely, pessimistic, and a project-specific rationale. -->

## Pricing

```yaml
pricing:
  currency: USD
  contingency: null
  contingency_reason: ""
  margin: null
  margin_reason: ""
  tco_monthly: null
  tco_components: ""
```

## Computed range

<!-- calc --write replaces only what is between the markers. Do not edit inside them. -->

<!-- calc:start -->
<!-- calc:end -->

## Assumptions and exclusions

<!-- What the estimate assumes, and what it excludes. -->

## Sensitivity

<!-- Which block moves the price most, and by how much. -->

## TCO

<!-- Monthly recurring cost, its components, and who pays each provider. Separate from the price. -->

## ROI sanity check

<!-- Current cost of the problem from the brief, compared with the expected price. If unknown, say so. -->

## Gate

- [ ] Every design component has a block
- [ ] `O <= M <= P` per block
- [ ] Totals match the table
- [ ] Rate confirmed and greater than zero
- [ ] Contingency in band or justified
- [ ] Margin explicit and justified
- [ ] TCO separate from the price
- [ ] Reviewer report recorded in `gates/3-estimate.md`
