# funky-forge

Plan and quote software projects in four gated phases: problem, design, estimate, proposal.
A portable skill pack for any agent harness, plus a small deterministic CLI for schemas,
arithmetic, and validation.

> **Status:** pre-release. Not published to npm. The method lives in `skill/`; the CLI is under
> construction. See `rfcs/funky-forge-skill-pack-rfc.md` for the design.

## Install the method (once the CLI exists)

```sh
funky-forge install --target agents
```

## Project artifacts

```text
.funky-forge/
  assumptions.md
  brief.md
  design.md
  estimate.md
  proposal.md
  decisions.md
  gates/1-problem.md ... gates/4-proposal.md
```

## Development

```sh
pnpm test
npm pack --dry-run
```

## License

MIT
