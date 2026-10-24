# Contributing

`funky-forge` is a small, dependency-free package with one maintainer. These rules exist so review is
predictable, not to gate your work: nothing here is enforced by branch protection.

## Before you write code

Open an issue first. Describe what you want to change and why. Wait for the `status:approved` label:
without it, you may be building something that will not be merged.

## The three facts a pull request must satisfy

The `pr-policy` job checks these on every pull request. It is feedback, not a gate, but a red check
means the pull request is not ready for review.

1. **The body links an issue.** Write `Closes #12`, `Fixes #12` or `Refs #12`.
2. **Exactly one `type:*` label is applied.** `type:feature`, `type:bug`, `type:docs`, `type:chore`,
   `type:refactor`, `type:perf`, `type:test`, `type:build` or `type:ci`. Two labels are rejected, not
   guessed.
3. **The branch is named `type/description`,** lowercase, matching a Conventional Commit type:
   `feat/must-have-plural`, `fix/gate-verdict`, `docs/contributing`.

A fourth requirement is deliberately not automated: the issue carries `status:approved`. That is a
maintainer judgement, so the maintainer checks it by hand while reviewing.

## Commits

Conventional Commits, one logical change per commit. Keep the tests and the documentation that
describe a behaviour in the same commit as the behaviour. No `Co-Authored-By` trailers.

## Checks to run before opening the pull request

```bash
node --test
npm pack --dry-run
```

`node --test` must be green on your machine. The same command runs in CI on Ubuntu and Windows for
Node 22 and 24; a red Windows leg is a real failure, not an environment quirk. `npm pack --dry-run`
shows exactly which files a consumer receives.

Node 22 or newer is required (`engines.node` in `package.json`). There is no dependency install, no
build step and no network access at runtime.

## What CI enforces about itself

`.github/workflows/test.yml` is covered by `tests/ci.test.js`. If you change the runner labels, the
Node matrix, `check-latest`, the job names or an action pin, that test tells you what else has to stay
consistent. The pins are refreshed by hand, because this repository has no Dependabot; the procedure
is a comment at the top of the workflow.

Do not add `-latest` runner labels: they would let the vendor migrate the image and turn a green
suite red on its schedule instead of ours.

## Security

Report a vulnerability privately through GitHub's security advisories rather than in a public issue.
