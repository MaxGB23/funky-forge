# Pinned numbers

Two messages in `scripts/open-pr.js` carry a number a human reads to decide what to do next. Both were
computed correctly and neither was checked.

Found by the secure session's review of the hardening pull request, which asked a narrower question —
"what happens to the printed budget when the argument changes?" — and by this session's answer, which
was measured rather than remembered: five mutations, each naming the one test it breaks.

## Specs

- **S1** The creation ceiling reports the ceiling the child was **handed**, not the timeout the command
  declared. `lastCeilingMs` is taken per child inside the exec wrapper; the test now spends part of the
  declared budget first, so the two numbers differ and the wrong one is refused.
- **S2** The final wait message reports the seconds the wait **received**. `waitSeconds` is computed
  before the wait; the test spends two children's worth first, demands `20s` of a declared `30`, and
  refuses `30s` outright.

## Why this was worth a pull request

With nothing spent yet, "the seconds left" and "the declared timeout" are the same value, so a message
printing either one passes every assertion. The string can lie and no test objects. That is the shape of
a correct line that nobody has checked — and the sibling repository measured it directly: there, these
two strings could be changed with zero tests failing.

Neither number was wrong when this record was written. What was missing was the refusal.

## Tasks

| id | spec | commit on `main` |
|---|---|---|
| T1 | S1 | `632db3a` |
| T2 | S2 | `632db3a` |

One commit: the two tests share a shape and a rationale, and splitting them would have produced two
changes of twenty lines each with the same argument twice.

## Log

**L1 — the instruction that covered this repository, quoted verbatim:**

> dale, ambos. Y recuerda a forge tambien

**L2 — how the expectation for S2 was corrected, recorded because the correction is the evidence.**
The first version of the test expected `25s` and the code produced `20s`. The arithmetic was mine and
wrong: the creation is itself a child. The expectation moved to the delivered value, and both mutations
were kept in the pull request body so that "adjusted to match the output" and "pinned to the delivered
number" could be told apart by anyone reading it later.
