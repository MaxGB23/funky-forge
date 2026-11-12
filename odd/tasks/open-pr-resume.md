# open-pr: the candidate set, then resume, then the cost

Forge half of the cross-repository plan held in Engram 1756 (topic `funky-forge/open-pr/resume-and-cost`).
Secure works the same plan in parallel; nothing here depends on it except `resume`, which is specified
identically in both and lands last.

## Specs

- **S1 — The set rule. Decision B, and it lands first.** "The adopted rule, identical in both
  repositories: candidates past the floor, polled until the **id set stops growing**; **any red wins**;
  all green → green printing every id; no red and not all green → `2`; still growing at the budget →
  `2`."
- **S2 — Why the set, and why the trigger list stays.** "The creation is **not** one event: the workflow
  triggers on `labeled`, the label travels in the creation, so `gh pr create --label` fires `opened`
  **and** `labeled`, giving two runs of the same commit." and "The trigger list is not narrowed:
  `labeled` is a real guard for a hand-made pull request."
- **S3 — Order, mandatory.** "**Do this before `resume` in forge**, or the resume work sits on a rule
  that refuses everything."
- **S4 — Resume, the fix.** "on a failed creation, `gh pr list --head <head> --json number,url`; if a
  pull request exists for that head and the floor was read before it, **adopt it** and continue to the
  watch. The floor stays valid: the run being looked for already exists and its id is still greater than
  the floor. No prompt, no `--draft`, nothing to clean up."
- **S5 — Resume, the three cases and the names.** "(a) creation fails and a pull request exists for the
  head → adopted, the command continues and reports the run's verdict; (b) creation fails and no pull
  request exists → still red, naming what `gh` said; (c) a creation that timed out keeps its current
  message — 'whether a pull request was created cannot be told: check `gh pr list --head <head>` before
  rerunning' — which is already better than a guess and must not regress."
- **S6 — Parity of the crossing unit.** "`resume` is specified identically in both plans (same
  behaviour, same three cases, same test names) and lands **last** in each, because it is the only unit
  that crosses. Whichever repository merges it first is the reference and the other copies the diff."
- **S7 — The cost, after resume exists.** "`AGENTS.md` must name the cost, not only the rule." — "One
  clause, next to the existing explanation, and it becomes true once resume exists — which is why it
  goes second."
- **S8 — The shared guard stays still.** "**Secure is copying `scripts/pack-guard.js` verbatim**,
  wired as its own `pack:check`. Keep its exported interface and its CLI output stable while that port
  is open, or say so first: the copy is literal, so a silent change here becomes a silent divergence
  there."
- **S9 — FORGE-X1 accepted with two precisiones that make A executable.** "1. La identificación cambia
  con el camino. En la creación se identifica por piso; en la adopción, por el pull request (`gh pr list
  --head`)." — "2. Conjunto vacío tras adoptar → 2 nombrando el pull request adoptado, y la salida debe
  decir que hubo adopción. Sin eso, un verde que vino de un run adoptado no es auditable."
- **S10 — SEC-X2: the creation label does not reach the `opened` run.** Measured on secure PR #233: "Two
  runs of the same commit, and the `opened` one read an **empty** label set", while the same command
  passed both runs minutes earlier on #231. "The event payload is a snapshot taken before the label is
  queryable, so `PR_LABELS` can be empty in the run that the creation fires." Option A, "vale para los
  dos repos": "the policy reads the labels **live** — `gh pr view <n> --json labels` — instead of trusting
  `PR_LABELS` from the event" ... "as its own unit; the `AGENTS.md` correction lands immediately because
  it is a false statement in a document that tells maintainers what to do."

## Tasks

| Task | Specs | What | Evidence |
| --- | --- | --- | --- |
| T1 | S1, S2, S3 | `findRun` polls until the id set holds still; the verdict is read over the whole set: any red wins, all green is green, a set still growing at the budget is `2`. Tests rewritten to the set | `62a2cdb` |
| T2 | S4, S5, S6, S9 | On a failed creation, `gh pr list --head <head>`; adopt the pull request it names and continue, identified by head, with its three cases and the adopted-empty-set case | `517debc` |
| T3 | S7 | One clause in `AGENTS.md` naming the cost of a ready pull request | `0f4a4be` |
| T4 | S8 | Answer `SEC-X1`; do not touch `scripts/pack-guard.js` while secure's port is open | accepted, nothing changed |
| T5 | S10 | Correct the false claim in `scripts/open-pr.js` (the creation label does not make `PR_LABELS` readable in the `opened` run) | comment only, same commit |
| T6 | S10 | Option A as its own unit: `pr-policy` reads the labels live instead of the event payload, in both repositories | not started, needs authorization and an issue |

## Log

- **L1.** User verbatim, 2026-11-12 (session id, ordering and coordination rules included):
  "Trabajas en paralelo con otra sesión Pi, que trabaja en el proyecto funky-secure-v2:
  01a1c263-d620-726e-951a-6264e3814b74. Tiene autoridad igual que tú; no hay supervisor.

  Antes de empezar: tu plan completo está en `mem_get_observation 1756` (proyecto funky-forge-v2).
  Léelo entero. El orden es obligatorio: primero el cambio de diseño —la regla del conjunto de
  candidatos—, después `resume`, y al final la cláusula del coste en `AGENTS.md`. Si empiezas por
  `resume`, lo construyes encima de una regla que rechaza todos los pull requests.

  Crea también `odd/tasks/open-pr-resume.md` volcando 1756 en Specs / Tasks / Log. Sin ese documento,
  el registro de las decisiones cruzadas no tiene dónde ir.

  No toques el repositorio de la otra sesión (`M:/funky-secure-v2`). Cualquier cambio que lo afecte se
  acuerda y lo aplica su dueña. Ella no toca `M:/funky-forge-v2`.

  Si a mitad de implementación aparece algo imprevisto que toca al otro proyecto (contrato compartido,
  orden de los cambios, nombres, API o versión, comportamiento que el otro ya asumió):

  1. Estaciona ese camino: no avances por ahí y no decidas solo.
  2. Avísalo con `orchestrator_send_message(recipient_session_id:
  "01a1c263-d620-726e-951a-6264e3814b74", reason: "FORGE-X<n> decisión entre proyectos")`. En esta
  máquina discovery y consult están rotos: usa solo `send_message`.
  3. Una línea: `FORGE-X<n> · proyecto · hallazgo · a quién afecta · opciones A/B · qué quedó detenido ·
  propuesta`.
  4. Sigue solo con trabajo independiente. Nada de polling. Si no queda trabajo independiente, cierra
  el turno: el mensaje llega como entrada nueva cuando el turno termina, no mientras esperas.
  5. Al recibir respuesta: `aceptada` → avanza; `contrapropuesta` → converge en una sola ronda.
  Registra el resultado como `FORGE-X<n>` en el `## Log` de `odd/tasks/open-pr-resume.md`.

  Cuando recibas un `SEC-X<n>`, responde exactamente `SEC-X<n>: aceptada` o `SEC-X<n>:
  contrapropuesta — <alternativa>`. Nada más.

  El primer mensaje que recibirás es `SEC-X1`: secure copia `scripts/pack-guard.js` literalmente y lo
  cablea como su `pack:check`. Acepta si mantienes su interfaz exportada y su salida por consola
  estables hasta que secure lo mergee. Contrapón si necesitas cambiarlas."
- **L2.** Source of record: Engram 1756, `funky-forge/open-pr/resume-and-cost` (revision 7), read in
  full before anything was written. State on entry: `main 3675a12` (PR #40 merged), suite 266/266,
  `scripts/open-pr.js` created ready with the floor read before the creation. Branch for this work:
  `fix/open-pr-resume`.
- **L3.** User verbatim, on the cross-project channel: "nos comunicaremos con secure mediante engram,
  cuando tengas alguna observacion que cambie el rumbo del plan, paras y me dices, yo se lo hago saber
  con el id de la memoria". Recorded because it replaces the `send_message` route of L1: that route was
  tried once and the runtime refused it (`session message was not accepted`), and `orchestrator_list`
  answers `session discovery is unavailable (io_error)`. So: observation in Engram, the id handed to the
  human, no polling.
- **L4.** FORGE-X1, raised and parked. The plan's claim that the floor survives adoption is false on the
  path it protects: a rerun takes the floor *after* the adopted pull request's runs exist, so none of
  them is past it and `resume` would end in "no run appeared". Options: A) adopt without the floor and
  decide over every run of that commit with the set rule; B) keep the floor and continue only when a new
  run appears, which leaves `resume` nearly useless. Proposed A. Recorded in Engram 1760
  (`funky-forge/open-pr/resume-floor-after-adoption`) with the one-line relay. **T2 is not written**
  until this is answered; T1 and T3 do not depend on it.
- **L5.** T1 landed as `62a2cdb`: `findRun` no longer refuses a set, it reads again until the ids hold
  still; the verdict is `readSet()` over every id (`run view` per id, `decideGate` per run), a red
  short-circuits the wait, and only an unanswered run is watched (`--exit-status --interval 15`). Suite
  267/267, `npm run pack:check` green (39 packed files, 6 entries). Test set: the two runs the creation
  fires are both green and both ids are printed; a red run wins over a run still going; a set that grew
  between two reads is read again and decides; a set still growing at the budget is `2` and names every
  id it saw; a concluded run is read and not watched. Mutation repeated by hand: `isRed` forced to
  `false` fails exactly the four red-verdict tests (red-in-a-set, the run past the floor, the concluded
  failure, the grown set) and nothing else.
- **L6.** User verbatim, relaying secure's answer: "FORGE-X1: aceptada" with two precisiones (S9), and on
  the shared guard: "SEC-X1 está aceptado. Su propio 1759 lo escribió como T4/S8 —«pack-guard.js stays
  untouched while secure copies it verbatim»—, que es exactamente el congelamiento que le pedí. No hace
  falta que conteste aparte." For the record, the answer to relay if secure wants it written in the
  agreed channel: `SEC-X1: aceptada` — no interface and no console output of `scripts/pack-guard.js`
  changed in T1, T2 or T3, and none will while the port is open.
- **L7.** T2 landed as `517debc`. Adoption is keyed on head, never on the floor: the creation identifies
  the run by the floor it reads before firing, the adopted pull request identifies it by `gh pr list
  --head <head> --json number,url`, and `findRun` is called with `floor: 0` on that path. Output says
  `open-pr: adopted <url> — a pull request for <head> already existed, so none was created`, before any
  wait, so a green from an adopted run is auditable. Cases: adopted → continues to the verdict; no pull
  request → `RED`, `open-pr: gh pr create failed` plus gh's own words; a head nobody can read → `2`, never
  red; adopted with no run → `2` naming the adopted pull request; a create that timed out keeps its
  message and adopts nothing. Suite 271/271, `pack:check` green. Mutation: `floor: adopted ? 0 : floor`
  replaced by `floor` fails exactly the adoption test (`pass 35, fail 1`) and nothing else.
- **L8.** T3 landed as `0f4a4be`: the `AGENTS.md` bullet now states the price — an interrupted ritual
  leaves a real pull request instead of a harmless draft, which is why the command adopts the pull
  request of the head. Suite and `pack:check` green on the same tree.
- **L9.** SEC-X2 received through the human: "SEC-X2 en la memoria 1762 (proyecto funky-forge-v2). Su
  primer PR va a chocar con lo mismo, y la opción A —que pr-policy lea las etiquetas en vivo con gh pr
  view <n> --json labels— vale para los dos repos." Answer: `SEC-X2: aceptada` — A is the right cure and
  it is the same lesson as the floor: a frozen snapshot is not evidence about the present. Measured fact
  from 1762: on secure #233 the `opened` run of a labelled creation read `PR_LABELS` empty while #231
  passed with the same command.
  T5 landed here as a comment correction in `scripts/open-pr.js`: forge's `AGENTS.md` never claimed the
  `opened` run sees the label (it claims only that the label travels in the creation, which is true), so
  the false sentence was the comment above `pr create`; the test suite is untouched and stays 271/271.
  T6 (option A: `pr-policy` reads the labels live, its own unit, identical in both repositories) is **not
  started**: it changes CI behaviour and the shared contract, so it needs authorization and, under this
  repository's policy, an issue with `status:approved` first. Note for whoever takes it: forge calls
  `runPolicy` from `open-pr.js` **before** the pull request exists, so there is no number to read live at
  that step — the live read belongs to the run that already knows its pull request, and the local
  pre-creation check keeps using the label it is about to apply.
