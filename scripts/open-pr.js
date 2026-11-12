/**
 * Opens a pull request through the whole ritual, in one command, because the ritual has more steps
 * than the mistake and gets skipped.
 *
 * Five round trips were lost in one day to the same class of mistake: a pull request opened without its
 * label, so the `opened` run reads `PR_LABELS` empty; a `gh run rerun --failed` that replays the frozen
 * event payload and fails identically; a wait loop keyed on the branch, so it answers with an earlier
 * commit's run; and a branch pushed with a suite that does not parse. Every one of those is cheap to
 * prevent and easy to forget, so the order lives here instead: the suite, the packed set, the policy, a
 * labelled draft, ready, and then the run of *this* commit.
 *
 * The decisions are pure functions and every `gh` invocation goes through one injected `exec`, so the
 * tests read a verdict without a network, a repository or a pull request.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { run as runPolicy } from './check-pr-policy.js';
import { decideGate } from './wait-for-ci.js';

/** The three exits: the run passed, it failed, and nobody can say yet. `2` is never a failure. */
export const GREEN = 0;
export const RED = 1;
export const UNKNOWN = 2;

export const USAGE =
  'node scripts/open-pr.js --base main --title "<title>" --body-file <path> --label <type:...> ' +
  '[--head <branch>] [--repo <owner/name>] [--timeout <seconds>]';

const DEFAULT_TIMEOUT_SECONDS = 600;
const DEFAULT_INTERVAL_SECONDS = 15;
const RUN_FIELDS = 'databaseId,headSha,status,conclusion';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
/**
 * The gate `npm run pack:check` runs, named as a path from the root rather than as a script name, and
 * run through `process.execPath`: `npm` is not an executable on Windows without a shell, and a shell
 * here buys quoting bugs for a command with no arguments.
 */
const PACK_SCRIPT = 'scripts/pack-guard.js';

/**
 * The command line as options and the reasons it cannot run, so a missing `--label` is one line
 * instead of a pull request created without it.
 *
 * @param {string[]} [argv]
 * @returns {{ options: { base: string, title: string|null, bodyFile: string|null, label: string|null, head: string|null, repo: string|null, timeout: number }, problems: string[] }}
 */
export function parseArgs(argv = []) {
  const options = {
    base: 'main',
    title: null,
    bodyFile: null,
    label: null,
    head: null,
    repo: null,
    timeout: DEFAULT_TIMEOUT_SECONDS,
  };
  const problems = [];

  // Asking how it works is not a malformed command line: it answers 0 and creates nothing.
  if (argv.includes('--help') || argv.includes('-h')) return { options, problems, help: true };

  const known = new Set(['base', 'title', 'body-file', 'label', 'head', 'repo', 'timeout']);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = String(argv[index]);
    if (!argument.startsWith('--')) {
      problems.push(`unexpected argument "${argument}"`);
      continue;
    }

    const name = argument.slice(2);
    if (!known.has(name)) {
      problems.push(`unknown option "--${name}"`);
      continue;
    }

    const value = argv[index + 1];
    if (value === undefined || String(value).startsWith('--')) {
      problems.push(`--${name} needs a value`);
      continue;
    }
    index += 1;

    if (name === 'timeout') {
      const seconds = Number(value);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        problems.push(`--timeout takes a positive number of seconds, not "${value}"`);
        continue;
      }
      options.timeout = seconds;
      continue;
    }

    if (name === 'body-file') options.bodyFile = String(value);
    else options[name] = String(value);
  }

  if (options.title === null) problems.push('--title is required');
  if (options.bodyFile === null) problems.push('--body-file is required');
  if (options.label === null) problems.push('--label is required: it travels in the creation');

  return { options, problems };
}

/**
 * What one conclusion means, in the only three answers worth printing. A run that was cancelled, timed
 * out or skipped is not a verdict on the code, so it is unknown rather than failed: collapsing the two
 * is what makes a green run look broken.
 *
 * @param {{ conclusion?: string|null } | null} run
 * @returns {{ code: number, state: 'passed'|'failed'|'unknown', reason: string }}
 */
export function decideVerdict(answer) {
  // The gate is the matrix, not the run's summary, and it is the same function `wait-for-ci` uses: a
  // run that says success while a job failed is exactly the reading that makes a red check look green,
  // and two copies of that rule is how two answers drift (I-64). This module keeps no rule of its own.
  return decideGate({ run: answer, jobs: answer?.jobs ?? [] });
}

/**
 * The floor of one commit's run ids: the greatest `databaseId` among the runs of that commit, or `0` when
 * the branch has none.
 *
 * `databaseId` is global and monotone by creation, so the run of an event fired after this floor was
 * taken has a greater id, whether or not the API has made it visible when the floor is read. That is
 * exactly what a set of ids cannot say: a set that already existed can grow after it is read, and the
 * `opened` event of `gh pr create --draft` carries this same commit, so a set would have to decide the
 * race it cannot see. One number cannot.
 *
 * @param {Array<{ databaseId?: number|string, headSha?: string }>} runs
 * @param {string} sha
 * @returns {number}
 */
export function floorOf(runs, sha) {
  if (!Array.isArray(runs)) return 0;

  let floor = 0;
  for (const run of runs) {
    if (run?.headSha !== sha) continue;
    const id = Number(run.databaseId);
    if (Number.isFinite(id) && id > floor) floor = id;
  }

  return floor;
}

/**
 * The runs of one commit whose id is past the floor: the only ones that can belong to an event fired
 * after it was taken. Never the newest run of the branch: `gh run list --branch` answers the newest run
 * first, and while the run for the new commit is still queued that answer belongs to the previous one.
 *
 * Zero, one, or several of them. Several is not a choice to make — the answer says nothing about which
 * event fired which run — so the caller refuses it instead of picking one.
 *
 * @param {Array<{ databaseId?: number|string, headSha?: string }>} runs
 * @param {string} sha
 * @param {number} [floor]
 * @returns {Array<{ databaseId?: number|string, headSha?: string }>}
 */
export function runsPastFloor(runs, sha, floor = 0) {
  if (!Array.isArray(runs)) return [];

  const base = Number.isFinite(Number(floor)) ? Number(floor) : 0;
  return runs.filter((run) => {
    if (run?.headSha !== sha) return false;
    const id = Number(run.databaseId);
    return Number.isFinite(id) && id > base;
  });
}

/**
 * The URL `gh pr create` prints and the number at its end. Both come from the creation itself, so the
 * steps that follow cannot act on a different pull request.
 *
 * @param {string} stdout
 * @returns {{ url: string, number: number } | null}
 */
export function pullRequestFrom(stdout) {
  const match = /https?:\/\/\S+\/pull\/(\d+)/.exec(typeof stdout === 'string' ? stdout : '');
  return match === null ? null : { url: match[0], number: Number(match[1]) };
}

/**
 * How many tests failed, from the reporter's own summary. Both reporters this suite can emit are read:
 * the spec reporter writes `ℹ fail 2` and TAP writes `# fail 2`. A suite that died before it could
 * summarize answers `null`, which still refuses.
 *
 * @param {string} output
 * @returns {number | null}
 */
export function failingCount(output) {
  const match = /^(?:ℹ|#) fail (\d+)$/m.exec(typeof output === 'string' ? output : '');
  return match === null ? null : Number(match[1]);
}

/**
 * Polls for a run of one commit past the floor until one appears or the attempts run out. The bound is a
 * count of attempts rather than a clock, so a test drives it without waiting and a real wait still stops.
 *
 * Every candidate is answered, not the first one found: two runs past the floor cannot be told apart,
 * and choosing between them is the reading this replaced.
 *
 * @param {{ exec: Function, head: string, repo?: string|null, sha: string, floor?: number, sleep: (ms: number) => Promise<void>, timeoutSeconds?: number, intervalSeconds?: number }} options
 * @returns {Promise<{ candidates: Array<object>, sha: string, spentSeconds: number }>}
 */
export async function findRun({
  exec,
  head,
  repo = null,
  sha,
  floor = 0,
  sleep,
  timeoutSeconds = DEFAULT_TIMEOUT_SECONDS,
  intervalSeconds = DEFAULT_INTERVAL_SECONDS,
}) {
  const interval = Math.max(1, intervalSeconds);
  const attempts = Math.max(0, Math.ceil(Math.max(1, timeoutSeconds) / interval));

  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    const runs = listRuns(exec, { head, repo, timeoutMs: timeoutSeconds * 1000 });
    const candidates = runsPastFloor(runs ?? [], sha, floor);
    if (candidates.length > 0) return { candidates, sha, spentSeconds: attempt * interval };

    if (attempt < attempts) await sleep(interval * 1000);
  }

  return { candidates: [], sha, spentSeconds: attempts * interval };
}

/**
 * The command line, and the ritual it refuses to skip.
 *
 * @param {{ argv?: string[], exec?: Function, suite?: () => { ok: boolean, stdout: string }, pack?: () => { ok: boolean, stdout: string } | null, resolveHead?: () => string, resolveSha?: () => string, sleep?: (ms: number) => Promise<void>, out?: { write: Function }, err?: { write: Function } }} [deps]
 * @returns {Promise<number>}
 */
export async function run(deps = {}) {
  const argv = deps.argv ?? process.argv.slice(2);
  const out = deps.out ?? process.stdout;
  const err = deps.err ?? process.stderr;
  const exec = deps.exec ?? defaultExec;
  const suite = deps.suite ?? defaultSuite;
  const pack = deps.pack ?? defaultPack;
  const resolveHead = deps.resolveHead ?? defaultResolveHead;
  const resolveSha = deps.resolveSha ?? defaultResolveSha;
  const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  const { options, problems, help } = parseArgs(argv);
  if (help === true) {
    out.write(`open-pr: ${USAGE}\n`);
    return 0;
  }

  if (problems.length > 0) {
    for (const problem of problems) err.write(`open-pr: ${problem}\n`);
    err.write(`open-pr: ${USAGE}\n`);
    err.write('open-pr: nothing was created\n');
    return UNKNOWN;
  }

  // The head branch is resolved once and passed everywhere else, so the policy check, the creation and
  // the run lookup cannot disagree about which branch this is.
  const head = options.head ?? resolveHead();
  if (typeof head !== 'string' || head === '') {
    err.write('open-pr: the head branch is unknown (detached HEAD): pass --head <branch>\n');
    return UNKNOWN;
  }

  // Every `gh` call is bounded by the wait budget, not only the watch. A create, a ready or a list
  // that stalls holds the ritual open exactly as a watch does, and a stalled child does not fail: it
  // hangs.
  const gh = (args) => exec(args, { timeoutMs: options.timeout * 1000 });

  // 1. The suite. A branch that does not parse is cheaper to fix here than in a run nobody watches.
  const tested = suite();
  if (!tested.ok) {
    const count = failingCount(tested.stdout);
    const named = count === null ? '' : ` (${count} failing test${count === 1 ? '' : 's'})`;
    err.write(`open-pr: refusing: the suite is red${named}, so nothing was created\n`);
    err.write('open-pr: run node --test and fix it first\n');
    return RED;
  }
  out.write('open-pr: suite green\n');

  // 2. The packed set, through the gate `npm run pack:check` runs. A branch can be green and still
  // publish a tarball that leaks a file or misses one the `files` contract promised, and that one is
  // found after publication if it is found at all. The gate names itself and its own command: a
  // refusal that reuses another step's words cannot be told apart from that step's.
  const packed = pack();
  if (packed !== null && packed.ok !== true) {
    err.write(`open-pr: refusing: the packed-set gate (${PACK_SCRIPT}) is red, so nothing was created\n`);
    // The gate's own words, because "the packed set is not the files contract" means nothing without
    // the path that broke it, and the gate is the one place that knows which.
    if (typeof packed.stdout === 'string' && packed.stdout.trim() !== '') {
      err.write(`${packed.stdout.trim()}\n`);
    }
    err.write(`open-pr: run node ${PACK_SCRIPT} and fix it first\n`);
    return RED;
  }
  // A repository with no guard to run is not refused for it: the step is skipped silently.
  if (packed !== null) out.write('open-pr: packed set green\n');

  // 3. The policy, through the same function CI runs: its message is the failure message, and a
  // reminder here would be a second description of the rule that can drift from the first.
  let body;
  try {
    body = readFileSync(options.bodyFile, 'utf8');
  } catch (error) {
    err.write(`open-pr: cannot read --body-file ${options.bodyFile}: ${error.message}\n`);
    return UNKNOWN;
  }

  const refused = runPolicy({ PR_BODY: body, PR_LABELS: options.label, PR_HEAD_REF: head }, out, err);
  if (refused !== 0) {
    err.write('open-pr: refusing: the policy refuses this pull request, so nothing was created\n');
    return RED;
  }

  // The commit is resolved from the head branch, not from this checkout. `--head other` used to be
  // created for `other` and then waited on the commit of the working tree, so the run it looked for
  // belonged to a branch nobody had asked about: the wait spent its whole budget and answered unknown.
  const sha = resolveSha(head);
  if (typeof sha !== 'string' || sha === '') {
    err.write(
      `open-pr: refusing: the commit of ${head} cannot be resolved, so no run could be matched to it, and nothing was created\n`,
    );
    return UNKNOWN;
  }

  // A fail-closed read, before anything is created: a blind API refuses with nothing created. Its ids are
  // discarded rather than turned into a floor. A floor read here would be `0` on any branch without an
  // earlier run of this commit — the ordinary case — and a floor of `0` lets the `opened` run that the
  // creation itself fires be the only run above it, which is the false green this criterion replaces,
  // moved rather than closed. The floor is the second read below, taken when it can mean something.
  const gate = listRuns(gh, { head, repo: options.repo });
  if (gate === null) {
    err.write('open-pr: refusing: the runs of this branch cannot be read, so nothing was created\n');
    return UNKNOWN;
  }

  // 4. The label travels in the creation itself, which is the whole point: the `opened` run then reads
  // `PR_LABELS` filled, and a label attached afterwards never achieves that.
  const created = gh(
    withRepo(options.repo, [
      'pr',
      'create',
      '--draft',
      '--label',
      options.label,
      '--base',
      options.base,
      '--head',
      head,
      '--title',
      options.title,
      '--body-file',
      options.bodyFile,
    ]),
  );

  const pullRequest = pullRequestFrom(created?.stdout);
  if (created?.ok !== true || pullRequest === null) {
    err.write('open-pr: gh pr create failed\n');
    for (const chunk of [created?.stdout, created?.stderr]) {
      if (typeof chunk === 'string' && chunk.trim() !== '') err.write(`${chunk.trim()}\n`);
    }
    return RED;
  }
  out.write(`open-pr: ${pullRequest.url}\n`);

  // The floor, read immediately before the event that decides. This is the read that carries meaning:
  // `databaseId` is global and monotone by creation, so the run of an event fired after this read has a
  // greater id whether or not the API shows it yet, and the draft exists by now — the `opened` run it
  // fired is normally behind the floor, where the `ready_for_review` run is the only one past it. A set
  // of ids could not say that: it can grow after it is read. A floor that cannot be read refuses
  // instead, and a draft that never fires the deciding event is harmless, where a guess is not.
  const before = listRuns(gh, { head, repo: options.repo });
  if (before === null) {
    out.write(
      `open-pr: unknown — the runs of this branch cannot be read, so no floor can be taken: the draft ${pullRequest.url} was created and deliberately not marked ready, so the event that decides was never fired; this is not a failure\n`,
    );
    return UNKNOWN;
  }
  const floor = floorOf(before, sha);

  // 5. This fires the event that decides.
  const ready = gh(withRepo(options.repo, ['pr', 'ready', String(pullRequest.number)]));
  // A ready that changed nothing fired no event, so no run past the floor belongs to it: whatever the
  // branch has was caused by something else, and reading a verdict out of it would judge that instead.
  if (alreadyReady(ready)) {
    out.write(
      `open-pr: unknown — gh pr ready ${pullRequest.number} reported that the pull request was already ready, so it fired no event and no run can be attributed to one; this is not a failure\n`,
    );
    return UNKNOWN;
  }
  if (ready?.ok !== true) {
    err.write(`open-pr: gh pr ready ${pullRequest.number} failed: the deciding run never fired\n`);
    return RED;
  }

  // 6. The run of this commit past the floor, polled until it exists. A wait that prints nothing is
  // indistinguishable from a hang, so the line is written before the first poll and not after the last.
  out.write(`open-pr: waiting for the run of ${sha} (up to ${options.timeout}s)\n`);

  const found = await findRun({
    exec,
    head,
    repo: options.repo,
    sha,
    floor,
    sleep,
    timeoutSeconds: options.timeout,
    intervalSeconds: DEFAULT_INTERVAL_SECONDS,
  });

  const ids = found.candidates.map((candidate) => String(candidate.databaseId));

  if (ids.length === 0) {
    out.write(
      `open-pr: unknown — no run of ${sha} appeared within ${options.timeout}s; this is not a failure\n`,
    );
    return UNKNOWN;
  }

  // More than one run past the floor is an answer that says nothing about which event fired which of
  // them. Picking one is the mistake this replaced, so none is picked.
  if (ids.length > 1) {
    out.write(
      `open-pr: unknown — ${ids.length} runs of ${sha} are past the floor of ${floor} (${ids.join(', ')}), so which one the ready event fired cannot be told and none was chosen; this is not a failure\n`,
    );
    return UNKNOWN;
  }

  const id = ids[0];

  // 7. The watch is bounded, because a command that never returns is how the wait it replaces got
  // skipped in the first place.
  const remaining = Math.max(1, Math.round(options.timeout - found.spentSeconds));
  const watched = exec(
    withRepo(options.repo, [
      'run',
      'watch',
      id,
      '--exit-status',
      '--interval',
      String(DEFAULT_INTERVAL_SECONDS),
    ]),
    { timeoutMs: remaining * 1000 },
  );

  if (watched?.timedOut === true) {
    out.write(`open-pr: run ${id}\n`);
    out.write(`open-pr: unknown — the run did not conclude within ${remaining}s; this is not a failure\n`);
    return UNKNOWN;
  }

  // The watch says whether it is over; the run's own answer says what it was, and the verdict comes
  // from the matrix inside that answer. A cancelled run is not a failed one, and a summary is not a
  // gate.
  const viewed = gh(
    withRepo(options.repo, ['run', 'view', id, '--json', 'status,conclusion,jobs']),
  );
  const answer = parseJson(viewed?.stdout);
  if (answer === null) {
    out.write(`open-pr: run ${id}\n`);
    out.write('open-pr: unknown — the run concluded but its conclusion could not be read\n');
    return UNKNOWN;
  }

  // The matrix travels with the verdict, because a verdict nobody can audit is the reading this
  // script exists to replace. The id travels too, so a failure names the run it is about.
  const verdict = decideVerdict({ ...answer, databaseId: id });
  for (const line of verdict.lines ?? []) out.write(`${line}\n`);
  const reason = verdict.code === RED ? ` — ${verdict.reason}` : '';
  out.write(`open-pr: run ${id}  ·  ${verdict.state}${reason}\n`);
  out.write(`open-pr: ${pullRequest.url}  ·  ${verdict.state}\n`);
  return verdict.code;
}

/**
 * Runs `gh` and reports what it answered, including whether it ran out of time instead of answering.
 *
 * @param {string[]} args
 * @param {{ timeoutMs?: number }} [options]
 * @returns {{ ok: boolean, stdout: string, stderr: string, timedOut: boolean }}
 */
function defaultExec(args, { timeoutMs } = {}) {
  const result = spawnSync('gh', args, { encoding: 'utf8', timeout: timeoutMs });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    // A kill leaves no status, which is the only evidence that the bound was reached rather than the
    // command finishing with an answer.
    timedOut: result.status === null,
  };
}

/**
 * The suite, in the repository root, with both streams kept because the failing count is read from the
 * reporter's summary.
 *
 * @returns {{ ok: boolean, stdout: string }}
 */
/** A suite that runs longer than this is not slow: a test is holding the event loop open. */
const SUITE_TIMEOUT_MS = 900_000;

/**
 * How the suite child is started. The timeout is the point: `node --test` on a test that opens a
 * server and never closes it does not fail, it hangs, and this script exists so no turn is lost to a
 * wait that cannot end — including the wait for its own suite.
 *
 * @returns {{ cwd: string, encoding: 'utf8', maxBuffer: number, timeout: number }}
 */
export function suiteOptions() {
  return { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: SUITE_TIMEOUT_MS };
}

function defaultSuite() {
  const result = spawnSync(process.execPath, ['--test'], suiteOptions());
  return { ok: result.status === 0, stdout: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/** A packed-set gate that runs longer than this is not slow: `npm pack` is stuck on a cache or a lock. */
const PACK_TIMEOUT_MS = 120_000;

/**
 * How the packed-set child is started. Its ceiling is its own, next to the suite's and for the same
 * reason: `npm pack` on a cold cache can wait, and a step that can wait forever is the step that gets
 * skipped. Measured at under a second in this repository, so two minutes is headroom rather than a
 * budget — enough for a cold Windows cache, short enough that it cannot hold a turn open.
 *
 * @returns {{ cwd: string, encoding: 'utf8', maxBuffer: number, timeout: number }}
 */
export function packOptions() {
  return { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: PACK_TIMEOUT_MS };
}

/**
 * The packed-set gate, or `null` when this repository has no guard to run. Both streams are kept,
 * because a red gate's output is forwarded as the reason and its exit is what the refusal reads.
 *
 * @returns {{ ok: boolean, stdout: string } | null}
 */
function defaultPack() {
  if (!existsSync(join(ROOT, PACK_SCRIPT))) return null;

  const result = spawnSync(process.execPath, [PACK_SCRIPT], packOptions());
  return { ok: result.status === 0, stdout: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/** A local git call that takes longer than this is not slow: it is stuck on a lock. */
const LOCAL_GIT_TIMEOUT_MS = 30_000;

/** @returns {string} the branch this checkout is on, or the empty string on a detached HEAD */
function defaultResolveHead() {
  const result = spawnSync('git', ['branch', '--show-current'], {
    encoding: 'utf8',
    timeout: LOCAL_GIT_TIMEOUT_MS,
  });
  return result.status === 0 ? result.stdout.trim() : '';
}

/**
 * @param {string} head the branch the run must belong to
 * @returns {string} the commit that branch points at, or the empty string when it cannot be resolved
 */
function defaultResolveSha(head) {
  // The local branch, then its remote-tracking copy: a branch pushed from another worktree has only
  // the second one here.
  for (const candidate of [head, `origin/${head}`]) {
    const result = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`], {
      encoding: 'utf8',
      timeout: LOCAL_GIT_TIMEOUT_MS,
    });
    if (result.status === 0 && result.stdout.trim() !== '') return result.stdout.trim();
  }

  // The working tree is the last resort and only when it is on that branch. Falling back to it
  // unconditionally is the defect the refusal above exists to prevent.
  if (head === defaultResolveHead()) {
    const result = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], {
      encoding: 'utf8',
      timeout: LOCAL_GIT_TIMEOUT_MS,
    });
    if (result.status === 0) return result.stdout.trim();
  }

  return '';
}

/**
 * Whether `gh pr ready` answered that the pull request was already ready. `gh` writes that sentence and
 * not an error status, so the status alone cannot tell a fired event from a step that changed nothing.
 *
 * @param {{ stdout?: string, stderr?: string } | null} answer
 * @returns {boolean}
 */
function alreadyReady(answer) {
  const said = `${answer?.stdout ?? ''}${answer?.stderr ?? ''}`;
  return /already ready/i.test(said);
}

/**
 * @param {string|null} repo
 * @param {string[]} args
 * @returns {string[]} the same arguments, addressed to `--repo` when one was named
 */
function withRepo(repo, args) {
  return repo === null ? args : [...args, '--repo', repo];
}

/**
 * @param {(args: string[], options?: object) => { ok: boolean, stdout?: string }} exec
 * @param {{ head: string, repo?: string|null, timeoutMs?: number }} target
 * @returns {Array<object>|null} the runs of that branch, newest first, or `null` when the API cannot
 *   answer — an empty list is a measurement, a failed call is not, and the two cannot share an answer
 */
function listRuns(exec, { head, repo = null, timeoutMs }) {
  const answer = exec(withRepo(repo, ['run', 'list', '--branch', head, '--json', RUN_FIELDS]), {
    timeoutMs,
  });
  if (answer?.ok !== true) return null;

  const runs = parseJson(answer.stdout);
  return Array.isArray(runs) ? runs : [];
}

/**
 * @param {string} text
 * @returns {any | null}
 */
function parseJson(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = await run();
  process.exitCode = code;
}
