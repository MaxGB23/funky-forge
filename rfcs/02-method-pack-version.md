# RFC: the method pack declares the package version

> **STATUS: ACCEPTED — implementation in progress.**
>
> **Decision record:** issue [#25](https://github.com/MaxGB23/funky-forge/issues/25), approved by the
> maintainer. This RFC is the contract that issue describes; where the two disagree, this document is
> the later record and says so explicitly.
>
> **Amends:** `rfcs/funky-forge-skill-pack-rfc.md` §6.2 (installation behavior), §7.2 (the `SKILL.md`
> outline) and §13.1 (`funky-forge install`). The amendments are appended there as dated errata; the
> settled RFC is not rewritten.
>
> **Does not touch:** `method_version: 1` in `skill/references/00-map.md` and the four templates. That
> is the protocol's clock and stays where it is. `schema: 1` is unchanged.
>
> **Scope:** one line in a file that already ships, one pure library, the `install` command, its three
> output surfaces, and the documentation that states them. No new command, no new dependency, no
> change to the `files` contract in `package.json`.

---

## 1. Context

`skill/` is the method pack: the protocol an agent follows to produce `brief.md`, `design.md`,
`estimate.md` and `proposal.md`, and the templates and references `check` validates against. It ships
inside the tarball, so it travels with the binary and cannot be replaced separately.

It declares no version, and `install` compares nothing. A user who installed the pack with `0.1.0`
and later upgrades the CLI has no way to learn that the copy on disk is older than the binary.

Three different states are indistinguishable today, and each needs a different answer:

| What the bytes show | What it means | The answer that fits |
|---|---|---|
| differ from the shipped pack | the user edited their copy, on purpose | ask; replace only if told to |
| differ from the shipped pack | the copy came from an older release | offer the current one |
| differ from the shipped pack | the copy came from a newer release | refuse: the protocol cannot be older than its validator |

`--force` already overwrites any of them, which is why the current behavior is not wrong so much as
unable to speak.

## 2. Why it matters more here than in a rule-list skill

A stale rule list gives stale advice. A stale **protocol** gives a contract mismatch: the agent writes
frontmatter the current `check` rejects. That fails loudly, but halfway through a phase, after the
work. The reverse case is worse: a pack *newer* than the binary is accepted silently, because the
older `check` does not know the field it is not validating.

## 3. Decisions

- **D1 — The skill is bound to the package version.** The pack ships inside the tarball and travels
  with the binary, so its version is the package's. `method_version` is a different clock and it is
  not this one.
- **D2 — One declaration, guarded by a test.** `skill/SKILL.md`'s frontmatter carries `version:`, and a
  test asserts it equals `package.json`'s, failing with a message that names both files and both
  numbers. The declaration is what ships; the guard is what keeps it honest, because a manifest bump
  that forgets the frontmatter would otherwise ship a pack labelled with the old version and leave the
  suite green. Sibling package `funky-secure` gained exactly that guard after a field session exposed
  the failure it permits; its install tests read their expected version from the same file, so the
  stale number was validated by the test meant to catch it.
- **D3 — The version is read from the bytes, never from the running `package.json`.** A copy that
  travelled by hand, a vendored checkout, or a packed skill directory still says what it is. Reading
  the local manifest would label every installed copy with the *installer's* version, which is the
  question being asked, not the answer.
- **D4 — One state function, two surfaces that show it.** `install` and `--check` both need the
  verdict, and `--json` is derived from the same object. Two comparisons would eventually disagree,
  and the symptom is the worst available: two commands of the same binary saying different things
  about the same copy.
- **D5 — The state is computed for the pack, not per file.** The unit that has a version is the pack;
  the unit that has bytes is the file. `SKILL.md` missing or the destination absent is `absent`;
  every shipped file present and byte-equal is `identical`; otherwise the installed `SKILL.md`'s
  version is compared with the shipped one to give `older`, `newer`, or `edited`, with `unversioned`
  when either side declares none.
- **D6 — A copy from before this feature is `unversioned`, and that is a question, not an error.**
  Every pack installed by `0.1.0` carries no version line. Treating it as "current" would be a lie;
  treating it as "modified" would accuse the user of an edit they did not make.
- **D7 — `install` asks on a terminal and refuses with a reason without one.** Two answers, `1` keep
  (the default) and `2` replace, mirroring `funky-secure skill --install`. Without a terminal it
  prints a `reason:` naming the path, the versions and the fact that stdin is not a terminal, and the
  action that resolves it. `--force` bypasses the question; `--dry-run` never asks.
- **D8 — A newer copy keeps `funky-secure`'s answer: refused, never asked about.** An installed
  protocol cannot be older than its validator, so there is no question to put to the human. The
  refusal names both versions and the action (install the newer package), and `--force` performs the
  downgrade when the human has decided the old protocol is what they want.
- **D9 — The diagnosis is visible where it is asked and where it is audited.** `--check` is
  `install`'s read-only mode, not a separate command: it prints the state and the version in every
  case, and keeps its exit contract (`0` in sync, `1` on divergence) untouched. What changes is what
  it prints, not what the number means.
- **D10 — A clean install says one line.** `Installed · <path> (0.1.0)`. The four variants are
  expanded only when `install` has to decide or refuse, so the ordinary case stays quiet.

## 4. The state machine

| State | Computed as | `install` | Exit |
|---|---|---|---|
| `absent` | destination missing, or its `SKILL.md` missing | writes the pack | `0` |
| `identical` | every shipped file present and byte-equal | writes nothing, reports `Current` | `0` |
| `older` | installed version orders before the shipped one | asks; `--force` replaces | `0` replaced or kept, `2` without a terminal |
| `edited` | same version, some file's bytes differ | asks; `--force` replaces | `0` replaced or kept, `2` without a terminal |
| `unversioned` | either `SKILL.md` declares no `version:` line | asks; `--force` replaces | `0` replaced or kept, `2` without a terminal |
| `newer` | installed version orders after the shipped one | refuses, naming both versions | `1`, or `0` with `--force` (downgrade) |

Version comparison ignores a `-prerelease` suffix and compares numeric segments, treating a missing
segment as zero: `0.1.0` and `0.1` are the same version, `0.1.0` orders before `0.1.1`.

## 5. Exit codes

Forge's contract has three codes (`0` success, `1` failure, `2` a decision that needs the human), where
`funky-secure` has four and uses `3` for "understood but refused". The mapping follows forge's own
contract, not secure's numbers:

| Secure's outcome | Secure | Forge | Why |
|---|---|---|---|
| identical | `0` | `0` | nothing to do |
| older / edited, replaced or kept after an answer | `0` | `0` | nothing failed |
| older / edited, no terminal to ask | `3` | `2` | the agent must resolve it with the human; that is exactly what `2` means here |
| newer | `3` | `1` | no answer changes it: this binary cannot satisfy the request |

A fourth code was rejected. `2` already means "a decision that needs the human", and a new number
would be a new contract for every script and every agent that already branches on three.

## 6. Alternatives considered and rejected

- **Never ask; always exit `2` with the exact re-run command.** Cheaper to implement, keeps `install`
  synchronous, and keeps the `Never prompts` guarantee literally true. Rejected by the maintainer:
  the human is already in a terminal, and a two-key answer is cheaper than reading a message and
  retyping a command.
- **A fourth exit code `3`, mirroring secure.** Rejected in §5.
- **Reading the shipped version from the running `package.json`.** Rejected by D3.
- **A `version:` line in every file of the pack.** Rejected: one protocol, one clock. Eighteen
  declarations can disagree, and the ones that disagree are the templates an agent copies.
- **A `--keep` flag.** Not adopted: `--check` is already the read-only surface, and the non-terminal
  refusal now names "leave it as it is" as a valid answer.
- **Diagnosing only in `--check`.** Rejected: it obliges `install` to act on a verdict it never shows,
  and a refusal whose reason lives in another command is the pattern this repository already rejected
  in the review contract.

## 7. Consequences

- **`install` becomes async.** Asking needs `node:readline`; `dispatch`, `main`, `bin/funky-forge.js`
  and the in-process test helpers follow. No other command reads stdin.
- **Two documented guarantees are restated, not deleted.** `docs/cli.md`'s `Never prompts` and
  `docs/architecture.md`'s `No prompts. The CLI never reads stdin` become "never prompts without a
  terminal": `check`, `calc` and `init` still never read stdin, and a caller with no terminal still
  gets an answer, a reason and an exit code instead of a hang.
- **`install`'s exit for a divergence moves from `1` to `2`.** `MODIFIED_FILE` was a failure; a copy
  that differs is a decision. Anyone scripting `install` sees the change; `MODIFIED_FILE` disappears
  from the documentation with its reason, and `--check` keeps `1`.
- **A clean install prints one line instead of five.** The `Written:` / `Unmodified:` counters go; the
  version line states what was there before.
- **The tarball is unchanged in shape.** The `files` contract and `scripts/pack-guard.js` are
  untouched: the frontmatter gains one line inside a file that already travels.
- **`--version` stops lying.** It printed the literal `0.1.0`; it now reads `package.json`. Same clock,
  same commit, and a test that would have caught it.

## 8. Evidence

- Issue #25: the three conflated states, the reference outcomes table, and the guard that does not
  depend on this design.
- `funky-secure` `0.10.2`, `src/lib/skill-install.js`: `readSkillVersion`, `compareVersions`,
  `inspectInstallation`, `writeInstallation`; `src/commands/skill.js`: the decision tree, the
  `stdin.isTTY` gate, `parseAnswer` and the question lines; `tests/docs-contract.test.js`, "the
  shipped skill declares the version the manifest owns".
- This repository before the change: `skill/SKILL.md` carried `name` and `description` only; `install`
  read no version; `src/cli.js` printed `funky-forge 0.1.0` as a literal; no test covered either.
