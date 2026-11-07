---
name: release
description: Ship a funky-forge version through a staged candidate, a human approval and a GitHub Release. Use when the owner says a version ships.
---

# Release

Stage it, review it, approve it, then write the notes. This is the order a maintainer runs, and
[`AGENTS.md`](../../../AGENTS.md) is where the rules behind it live.

## Activation

Runs when the owner says a version ships. It never decides that a version ships, never approves a
candidate, never moves a tag, and never runs `npm publish`.

## Preconditions

Any one of these being false means the release stops here, before anything touches the registry.

- A clean tree on `main`, and a gate that was green for the commit the tag will name.
- `package.json` `version` equals the tag without its `v`. `node scripts/release-guard.js --tag vX.Y.Z`
  answers that with exit `2` on a mismatch, and the release workflow runs the same guard before the
  stage: after the stage the only move left is a reject, which needs 2FA.
- `npm --version` is 11.15.0 or higher. `npm stage` does not exist before it.
- 2FA is enabled for writes on the account.
- The package's trusted publisher allows **`npm stage publish` only**, never `npm publish`.
- A release workflow on `main` stages on a `v*` tag. Without it nothing stages, and there is nothing to
  approve.
- No unpublish in the last 24 hours: the registry locks the name and answers
  `403 "<name>" cannot be republished until 24 hours have passed`.

## The sequence

1. **Green gate on that commit** — the owner. `node --test` and `npm run pack:check`. The same gate
   runs again inside `prepublishOnly` when the candidate is staged.
2. **Push the tag** — the owner. `git tag vX.Y.Z && git push origin vX.Y.Z`, on the commit from step 1.
3. **Stages the candidate** — the release workflow, over OIDC, with no credential anywhere. It ends
   with the stage id in its step summary and does not publish.
4. **Reviews the candidate** — the maintainer. `npm stage list`, `npm stage view <id>`,
   `npm stage download <id>`, then read the tarball's file set against the `files` contract.
5. **Approves with 2FA** — the maintainer. Nothing is installable before this.
6. **Verifies what users get** — the maintainer. `npm view funky-forge@<version>`,
   `npm view funky-forge@<version> dist.integrity`, `dist.attestations`, and
   `npx funky-forge@<version> --version`. The attestation is the only link between the commit and the
   bytes a user installs, and it survives staged approval — measured on `funky-secure@0.10.2`.
7. **Publishes the Release** — the maintainer, after the approval and never before. Release
   immutability is enabled **first** (Settings → Releases), because GitHub applies it only to releases
   published after the setting is on. Write `RELEASE_NOTES.md` with the tagged commit, the
   `dist.integrity` and the provenance URL, run
   `gh release create vX.Y.Z --title "vX.Y.Z" --notes-file RELEASE_NOTES.md`, then delete the file.

## First publication

One release in a package's life cannot follow that sequence, because a trusted publisher is configured
on a package and a package exists only after a first publish.

1. From the commit the tag names, stage the first candidate locally: `npm login`, then
   `npm stage publish --access public`, **with a version that will never ship** (`0.0.1`). A staged
   version occupies the same semver index as a published one, so claiming with the release version
   would make that version impossible to stage from CI. A local session is a two-hour credential that
   expires on its own and appears in no token list, so there is nothing to log out of.
2. Configure the trusted publisher, and let the session expire.
3. Stage the **next** version from CI over OIDC and approve it with 2FA. **Do not reject the candidate
   from step 1 first.** Rejecting the only content of a placeholder-only package unpublishes the
   package and destroys its trusted publisher, and the next run then fails with
   `E401 Unable to authenticate`, which reads like a wrong field and is really a package that no
   longer exists.
4. Reject the leftover candidate only once a real version is published. Until then, leave it queued.
   `npm stage reject` asks for 2FA exactly like `approve`, so it needs a live session: log in again if
   the first one expired.

## Hard rules

- Nothing is published from CI directly. A compromised workflow reaches a queued candidate, never an
  installable version.
- The GitHub Release is created **after** the approval. With release immutability enabled a release
  freezes its tag, so a premature one turns a rejectable candidate into a permanent record.
- A tag is never moved. A candidate that is never approved leaves its tag in place as the record of
  what was not released; a correction is a new patch version.
- `RELEASE_NOTES.md` is transient: passed with `--notes-file` so backticks survive the shell, never
  committed, deleted after success.
- The integrity recorded is `dist.integrity`, the sha512 the registry publishes. A sha256 of the tarball
  does not exist anywhere, so recording one would be an invented number.
- An unpublish is not reversible: `name@version` never comes back and the name is locked for 24 hours.
  A first publication is one attempt with a recovery window, not a retry loop.
- Enable "release immutability" in the repository settings, so the tag binding is enforced rather than
  promised.

## Output

When it finishes, report the version, the tag, the stage id, the approval, the `dist.integrity` value
and the Release URL. When it stops, report which step, which precondition failed, and what is left
pending.
