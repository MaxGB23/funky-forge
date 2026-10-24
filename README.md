# Funky Forge 👻

Plan and quote software projects in four gated phases: problem, design, estimate, proposal.
A portable skill pack for any agent harness, plus a small deterministic CLI that refuses to let the
method's own rules be broken by accident.

The point is a price you can defend: every number traces back to a written artifact, an independent
review, and a human decision — instead of a spreadsheet nobody remembers building.

## What you get

- **Four artifacts that must agree**: `brief.md`, `design.md`, `estimate.md`, `proposal.md`, in
  `.funky-forge/` next to your code.
- **A reviewer per phase**: independent, read-only, and blind to your conversation.
- **A deterministic check**: schema, dependency chain, approval hash, arithmetic, component
  coverage, and gate reports — `check` either passes or names the file and the field.
- **A price with its arithmetic shown**: PERT hours per work block, contingency and margin with
  stated reasons, a range, and a monthly cost kept out of the price.

It plans and prices. It does not write your code, and it does not replace the person who decides the
project is worth doing.

## Status

Pre-release, version `0.1.0`, published at
[MaxGB23/funky-forge](https://github.com/MaxGB23/funky-forge). The method was validated end to end on
two projects before any CLI code existed ([evidence](docs/validation/project-a.md)); the CLI is
covered by tests and has no runtime dependencies.

## Requirements

Node.js 22 or newer. No dependencies, no build step, no network access. npm works; pnpm is
recommended because we promote one practice whether or not this package needs it:
`minimumReleaseAge`, which refuses a version until it has been public for a while. Nothing here
ships dependencies, so the pin protects the machine that clones and builds the repository, not the
consumer. Why it is recommended anyway, and how to tune it:
[docs/cli.md](docs/cli.md#package-manager).

## Install

```sh
pnpm add --global funky-forge     # npm install --global funky-forge also works
funky-forge install               # inside the project you want to plan
funky-forge init
```

`install` copies the method into a harness skill directory and writes nothing else:

| Harness | Target | Flag |
|---|---|---|
| Pi, OpenCode, Codex, Antigravity CLI... | `.agents/skills/funky-forge/` | `--target agents` |
| Claude Code | `.claude/skills/funky-forge/` | `--target claude` |

Detection is automatic. When both harness markers exist the command refuses to guess, exits `2` with
`TARGET_AMBIGUOUS`, and prints the exact `--target` to use. To run from a clone instead:

```sh
git clone https://github.com/MaxGB23/funky-forge
pnpm add --global link:./funky-forge   # symlinks the clone; edits show up immediately
```

## Quick start

```sh
funky-forge init --language en --proposal-language es
# ... write .funky-forge/brief.md, then:
funky-forge check problem              # must pass before the gate
funky-forge check problem --json       # bodyHash, errors, warnings
funky-forge calc --write               # rewrite the estimate table
funky-forge check estimate --strict
```

The four phases:

| # | Phase | Question | Artifact |
|---|---|---|---|
| 1 | `problem` | Is this worth building, and for whom? | `brief.md` |
| 2 | `design` | What is the minimum design that satisfies the brief? | `design.md` |
| 3 | `estimate` | How much does it cost, and why? | `estimate.md` |
| 4 | `proposal` | What exactly is being sold? | `proposal.md` |

## Documentation

| Document | What it answers |
|---|---|
| [docs/architecture.md](docs/architecture.md) | How the pieces fit: layers, data flow, phase graph, invariants, non-goals |
| [docs/method.md](docs/method.md) | How a phase runs: gates, depth, verdicts, approval, convergence, degraded modes |
| [docs/artifacts.md](docs/artifacts.md) | Every file format: frontmatter, statuses, hashing, required sections, gate reports, estimate schema |
| [docs/cli.md](docs/cli.md) | Commands, flags, exit codes, full error catalogue, JSON shapes, guarantees |
| [docs/validation/](docs/validation/) | Two complete projects planned with the method, with their findings |

## Harnesses and models

The method needs three capabilities: read files, write files, run a shell command. Results, however,
depend on what you configure: the orchestrator and each reviewer run on whatever your platform uses
— Claude Code, OpenCode, Antigravity CLI, Pi, or anything else — and a weak reviewer fails silently
by approving work that should not pass. Put your strongest reasoning model on the reviewer, then on
the `design` and `estimate` reviews, and keep the reviewer in a separate session. Details:
[docs/method.md](docs/method.md#review-quality-and-models).

## Development

```sh
pnpm test                # node --test, no dependencies to install
pnpm pack --dry-run      # inspect exactly what ships
node bin/funky-forge.js  # run the working tree without linking anything
```

`pnpm test` also fails if the generated help drifts from the command table, or if a documentation
link points at a file that does not exist.

## License

MIT
