# When a test is required, and what makes one admissible

This page is the policy a reviewer applies and a contributor can read before writing a test.
Every rule below is stated **true of this suite as it stands**, measured at the commit that
carries this page — 24 test files, 4903 lines, 290 tests, `fail 0`, `skipped 0` on a green
run of `node --test`.
Where the suite violates a rule, the violation is named in [Debt](#debt-not-precedent) with a
`path:line`, as debt, not precedent.

`CONTRIBUTING.md` already states the one rule about *placement*: tests travel in the same
commit as the behaviour they describe. This page states the two rules that rule does not:
*when* a test is owed, and *what* makes one admissible when it arrives.

## Two classes of assertion

1. **The contract**: what a caller can observe. For this CLI that is an exit code, the bytes a
   command prints (the error catalogue of `docs/cli.md` is the product, not decoration), the
   state of the `.funky-forge/` tree after a command, and the set of files a tarball carries.
2. **Presentation**: the prose around the contract — README text, doc wording, a comment.
   A test on presentation is legitimate only when the presentation *is* the change
   (`tests/docs.test.js` tests README rows and doc links because the map is the contract
   there).

## When a test is required

A test is owed when something a caller can observe moves: a new exit code or message, a
changed flag, a different artifact written, a gate that now blocks, a packed file set that
changed. The test asserts the observable — the exit code and the printed bytes, the tree
after the command — not the internals that produced them. `src/lib/` modules are pinned
through their exports, which is their public surface: 13 of the 24 test files import from
`src/lib/`, the code commands and scripts reuse.

## When a test is not required

A page, a comment, a row in a decision record; a spec sentence with no code behind it; a
refactor that moves code without moving any observable. A defect the current suite could not
have seen gets its test the moment it becomes a rule — the test is added with the fix that
closes the defect, not as a ritual apology.

## The five admission tests

1. **It pins the interface that owns the promise.** Run the command or call the export;
   never reach into internal storage to check what should have been printed or written.
2. **It can fail for its own reason.** Delete or break the line under test and this test goes
   red. A test that stays green when its subject breaks is decoration.
3. **It asserts every observable effect.** Exit code, printed bytes when bytes are the
   subject, tree state when a command writes. A rule's own file asserts the verdict *and*
   the message.
4. **It is deterministic.** Measured: zero files under `tests/` or `src/` use a clock, a
   calendar date, or a random draw (`grep -rlE "Date\.now|new Date\(|Math\.random" tests/ src/`
   returns nothing). Where behaviour needs time, the time is passed in.
5. **It is named for the contract**, so a red name says which promise broke without opening
   the file.

## A double is a witness only for what it records

A test that hands work to a stand-in — a fake host, a scripted `gh` — proves what the stand-in answers
and nothing about the arguments the stand-in ignores. When a double drops an input, the test still passes
the value and still names the contract, and it stays green when the code stops supplying that value. It is
green because the input was discarded, not because the code still passes it: admission test 2 applied to
the instrument instead of the subject, since a test cannot fail for a reason its double never sees.

The rule: a double records every input the assertion claims to observe, and the assertion reads what the
double recorded, never the value the test itself has just passed in.

Measured by reading rather than by a command, which is the admission the section below already makes about
"same contract": one test in this suite hands an input to a double that never reads it, and that test is
named under [Debt](#debt-not-precedent).

## Two tests may not own the same contract

The second test on one contract is deleted or narrowed to the part it alone observes.
Measured: no two tests in the suite share a name, and no duplicated contract surfaced in
review — but "same contract" is a reviewer's judgement, not a command's output. This rule is
enforced in review, and this page says so instead of pretending a gate exists.

## Debt, not precedent

The suite's weakest assertions, named, not hidden:

- Eight assertions pin a `typeof` shape rather than a behaviour: `tests/ci.test.js:143-152`
  (five, on parsed issue-form fields — the shape *is* the contract there),
  `tests/open-pr.test.js:735,745` (two, on option defaults), and
  `tests/pack-guard.test.js:82` (one, on a script's presence). Each is admissible for its
  own contract; none of them may be the *only* witness of a behaviour.
- `tests/docs.test.js` did not read `AGENTS.md`, so the paths map had no forcing function.
  That debt is closed by this change: the map's rows are now asserted to exist
  (`tests/docs.test.js`, "every path named in the AGENTS.md map exists").
- `tests/open-pr.test.js:426,447` pass `floor: [opened]` to the `gh` double defined at `:42`, which accepts
  no `floor`: the floor the test believes it set comes from `snapshot`, defaulting to `[]`. Run `1001` is
  absent from both cases because no list ever carries it, so the comment's premise at `:418` — that the
  `opened` run is the floor — is enforced by nothing. The assertion at `:441` holds; the reason given for it
  does not. Its test arrives with the fix, per `When a test is not required`, and neither is scheduled yet.

## Refused, with the reason

- **A coverage percentage.** It rewards the wrong file and says nothing about admissibility;
  a suite can be 100 % covered and 0 % honest.
- **File-length caps.** Length is not a promise. A 400-line file that pins four contracts
  beats four 100-line files that pin none.
- **A meta-test policing test names.** It fails on a rename and passes on a lie.
- **A blanket "never hardcode the message".** This CLI's printed messages are the product;
  the bytes are asserted because they are the contract.

## Not yet built

- No command finds a duplicated contract; admission test 2 ("it can fail for its own
  reason") is applied by deletion in review, not by a gate. Both are stated as gaps here
  rather than covered by a tool nobody wrote.
