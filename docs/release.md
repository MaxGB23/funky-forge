# Release

A release here is a **staged candidate a human approves**, never a publish a pipeline performs. The
workflow can queue an artifact; only a person with two factors can make it installable. Everything
below follows from that one sentence.

## The model

- The trusted publisher on npm is configured with **`npm stage publish` only**. `npm publish` and
  `npm dist-tag` stay unchecked, so the direct path is closed at the registry even if the workflow were
  changed.
- Package publishing access is **"Require two-factor authentication and disallow tokens"**. An
  interactive `npm login` session still stages, rejects and approves, because it enforces 2FA per
  operation; a stored token can do none of it.
- `id-token: write` exists in one job and nowhere else. There is no `NPM_TOKEN`, no secret and no
  `.npmrc` in this repository.
- The tag does not publish. It **stages**, and the run ends with the stage id in its step summary,
  because approval happens after the job.

## The workflow, and why each step is where it is

| Step | Why it is there, and why in that position |
|---|---|
| `npm install --global npm@^11.15.0` | the npm bundled with Node 24.16 is 11.13.0, and `npm stage` does not exist before 11.15.0 |
| `node scripts/release-guard.js --tag "$GITHUB_REF_NAME"` | a wrong tag must refuse before anything stages; afterwards the only move left is a 2FA reject |
| `npm stage publish --access public --json` | staging is npm's own publish with staging on, so `prepublishOnly` runs first: the suite and `pack-guard.js` |
| `node scripts/stage-report.js --report …` | approval happens after the job, so the id has to leave with the run |

The report is a module and not a heredoc on purpose. Both defects met while shipping
`funky-secure@0.10.2` lived in an inline read of that JSON: the `--json` envelope is **keyed under the
package name**, and `prepublishOnly` inherits stdio, so the gate's output lands in the same file before
npm's payload. Either one alone makes the report fail *after* the package is staged, which is a red run
over a release that really happened and no id for anyone to approve.

**A failed report does not undo the stage.** The candidate is queued: `npm stage list` returns its id and
`npm stage approve <id>` continues the normal path. Do not re-push the tag — it does not move, and the
version it names is already spent — and do not reject the candidate to "clean up": on a package whose
only content is the placeholder, a reject unpublishes the package and destroys its trusted publisher.

## The tag

`vX.Y.Z`, and it must name `package.json`'s `version`; `scripts/release-guard.js` exits `2` when it does
not. A tag is never moved: a correction is a new patch version, and a rejected candidate leaves its tag
in place as the record of what was not released.

## The first publication of a name

A trusted publisher is configured on a package, and a package exists only after something publishes it,
so the first version cannot be staged by CI. Measured on `funky-secure`, 2026-11-07:

1. The owner stages **once** from a local session: `npm login`, then `npm stage publish` from a worktree
   of a commit whose version **will never ship**. Staging a version occupies the same semver unique
   index as publishing it, so claiming with `0.1.0` would make `0.1.0` unstaged-able for CI. Claim with
   a throwaway like `0.0.1`.
2. The owner configures the trusted publisher while the package exists — GitHub Actions, this
   repository, `release.yml`, environment empty, `npm stage publish` only — and the session expires on
   its own: it is a two-hour credential with nothing to log out of.
3. CI stages the real version over OIDC and the owner approves it with 2FA.
4. **Only now** is the throwaway candidate rejected. Rejecting the only content of a placeholder-only
   package **unpublishes the package and destroys its trusted publisher**, and the next run then fails
   with `E401 Unable to authenticate`. A reject at `2026-10-31T20:17:24Z` did exactly that.

## What the registry does not forgive, and what it does

- Unpublishing the whole package locks the name for **24 hours**: `403 "<name>" cannot be republished
  until 24 hours have passed`. After that window the name is recoverable: staging from a tag whose
  number is already spent recreated the placeholder and restored the package with its publisher,
  measured 2026-11-07.
- `name@version` is immutable once it exists, and a staged version occupies the same index as a
  published one. Staged candidates coexist for one package while normal publishing keeps working.
- `npm stage reject` requires **2FA**, exactly like `approve`.
- The `--tag` of a staged candidate is immutable: staging with `latest` needs no re-stage.

## Verifying what a user gets

After the approval, check `npm view funky-forge version`, `dist.integrity`, and `dist.attestations`.
Provenance **survives** staged approval — measured on `funky-secure@0.10.2`, where the SLSA v1
attestation names `git+https://github.com/…@refs/tags/v0.10.2` and its `gitCommit`. That attestation is
the only link between the commit and the bytes a user installs, so it is recorded in the release body.

### Being published is not being indexed

Measured 2026-11-11 on this package. `0.1.0` had been live since 07-nov with a complete description,
five keywords, a `repository` and a 7.9 kB README in the registry document, and the registry's search
returned **no result** for `funky-forge` among the first 250 results of its own exact name, while its
sibling package stood first for its own. Publishing `0.2.0` created the missing index document and the
package came back as the **first** result, with nothing else changed. The plausible trigger is the
window this runbook creates on purpose: the name is claimed and the real version is published from CI
minutes later. Whatever the cause, the distinction is what matters — the registry can hold a published
version whose index document does not exist, and the absence is not evidence that the metadata, the
README or the name is wrong.

So this is a check and not a step: when a package seems invisible, query the search index for its exact
name and compare against a sibling published the same way. If it is missing, publishing again is the
remedy that was measured; rewriting metadata is not.

## The GitHub Release

Written by the maintainer **after** the approval, never by the workflow that staged. Release
immutability must be enabled **before** the release is published: GitHub applies it only to releases
published after the setting is on. The body records the commit the tag points at, the
`dist.integrity` the registry returned, and the provenance URL.

## Merging

A pull request merges when its checks have **finished**, which is a state list and not a feeling:
`gh pr checks <n> --json state` must show nothing outside `SUCCESS`, `SKIPPED` and `NEUTRAL`.
`gh pr checks --watch` is not that gate — it exits `1` while checks are still pending, and that exit
code does not mean failure — and `mergeStateStatus: CLEAN` reports mergeability, not the matrix.

This repository has **no branch protection on purpose**, so this rule is the only barrier between a red
pull request and `main`. The push run on `main` must be green too: the merge commit is what ships.
