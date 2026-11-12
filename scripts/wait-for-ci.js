/**
 * Waits for the CI run of one commit and reports one of three outcomes instead of a boolean.
 *
 * This exists because a hand-rolled polling loop compares what it printed with what it expected, and
 * gets it wrong in a way that looks like a CI problem: a loop that emits `completed|success` and then
 * matches `completed/success*` never fires, spins to its own timeout, and reports a green run as a
 * failure. Two of those in one day, once on a stale status field from the API and once on a separator
 * mismatch, are why the predicate lives here and not in a shell one-liner.
 *
 * The accepted conclusions are the ones `AGENTS.md` names for the merge gate. A run whose own
 * conclusion says success but which carries a failed job is a failure here, because the gate is the
 * matrix and not the run's summary. The reverse is not symmetric: a summary that disagrees with a
 * green matrix is the stale field that once reported a green run as a problem, so it is unknown and
 * never a failure.
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** The process exits: a passed gate, a failed one, and one nobody can decide. */
export const PASS = 0;
export const FAIL = 1;
export const UNKNOWN = 2;

const ACCEPTED = new Set(['success', 'skipped', 'neutral']);
const DEFAULT_TIMEOUT_SECONDS = 900;
const DEFAULT_INTERVAL_SECONDS = 15;

/**
 * The options every child process gets. The timeout is not a nicety: `gh` on a network stall, or
 * waiting for a credential it will never be given, does not return, and a poll that cannot return is
 * a hang wearing the costume of a wait. Bounded by the wait's own budget, so `--timeout 30` cannot
 * take minutes because one call blocked.
 *
 * @param {number} timeoutMs
 */
export function childOptions(timeoutMs) {
  return { encoding: 'utf8', timeout: timeoutMs };
}

/**
 * The gate, as a function of what the API answered. No clock, no process: the three callers — the
 * command line, the tests and any later reader — cannot disagree about what a given answer means.
 *
 * @param {{ run?: { databaseId?: number, status?: string, conclusion?: string } | null, jobs?: Array<{ name?: string, conclusion?: string }> }} answer
 * @returns {{ code: number, state: 'passed'|'failed'|'unknown', reason: string, lines: string[] }}
 */
export function decideGate({ run = null, jobs = [] } = {}) {
  const list = Array.isArray(jobs) ? jobs : [];

  if (run === null || typeof run !== 'object') {
    return { code: UNKNOWN, state: 'unknown', reason: 'no run for this commit yet', lines: [] };
  }
  if (run.status !== 'completed') {
    return {
      code: UNKNOWN,
      state: 'unknown',
      reason: `the run is ${run.status ?? 'in an unreadable state'}`,
      lines: [],
    };
  }

  const lines = list.map((job) => `  ${job.name ?? '(unnamed job)'}: ${job.conclusion ?? 'unknown'}`);
  if (list.length === 0) {
    return { code: UNKNOWN, state: 'unknown', reason: 'the run reports no job', lines };
  }

  // The matrix is the gate, so a failed job is a failure whatever the run summary says. The reverse
  // does not follow: a summary that disagrees with a green matrix is the stale field this command
  // exists to survive, and a stale field is a run nobody can decide yet — never a red check.
  const rejected = list.filter((job) => !ACCEPTED.has(job.conclusion));

  if (rejected.length > 0) {
    return {
      code: FAIL,
      state: 'failed',
      reason: `${rejected.length} job(s) outside success, skipped and neutral`,
      lines,
    };
  }

  if (!ACCEPTED.has(run.conclusion)) {
    return {
      code: UNKNOWN,
      state: 'unknown',
      reason: `the run concluded ${run.conclusion ?? 'in an unreadable state'} while every job is accepted`,
      lines,
    };
  }

  return { code: PASS, state: 'passed', reason: `run ${run.databaseId ?? ''}`.trim(), lines };
}

/**
 * Asks the API about one commit, through the answer shapes `decideGate` reads.
 *
 * @param {(args: string[]) => { ok: boolean, stdout: string }} exec
 * @param {string} sha
 * @returns {{ run: object | null, jobs: Array<object> }}
 */
export function query(exec, sha) {
  const listed = exec(['run', 'list', '--commit', sha, '--limit', '1', '--json', 'databaseId,status,conclusion']);
  if (!listed.ok) return { run: null, jobs: [] };

  let runs;
  try {
    runs = JSON.parse(listed.stdout);
  } catch {
    return { run: null, jobs: [] };
  }
  if (!Array.isArray(runs) || runs.length === 0) return { run: null, jobs: [] };

  const run = runs[0];
  if (run?.status !== 'completed') return { run, jobs: [] };

  const viewed = exec(['run', 'view', String(run.databaseId), '--json', 'jobs']);
  if (!viewed.ok) return { run, jobs: [] };
  try {
    const parsed = JSON.parse(viewed.stdout);
    return { run, jobs: Array.isArray(parsed?.jobs) ? parsed.jobs : [] };
  } catch {
    return { run, jobs: [] };
  }
}

/**
 * Polls until the gate is decided or the attempts run out. A timeout returns `UNKNOWN` and never
 * `FAIL`: "I could not find out" is not "it broke", and collapsing the two is the defect this command
 * exists to prevent.
 *
 * @param {{ sha: string, exec: Function, sleep: (ms: number) => Promise<void>, out: { write: Function }, timeoutSeconds?: number, intervalSeconds?: number }} options
 * @returns {Promise<number>}
 */
export async function wait({
  sha,
  exec,
  sleep,
  out,
  timeoutSeconds = DEFAULT_TIMEOUT_SECONDS,
  intervalSeconds = DEFAULT_INTERVAL_SECONDS,
}) {
  const interval = Math.max(1, intervalSeconds);
  const attempts = Math.max(0, Math.ceil(Math.max(1, timeoutSeconds) / interval));

  let verdict = decideGate({ run: null, jobs: [] });
  let lastReason = null;
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    const answer = query(exec, sha);
    verdict = decideGate(answer);

    if (verdict.code !== UNKNOWN) {
      out.write(`wait-for-ci  ${sha}  ·  ${verdict.reason}\n`);
      for (const line of verdict.lines) out.write(`${line}\n`);
      out.write(`wait-for-ci: ${verdict.state}\n`);
      return verdict.code;
    }

    // A wait that prints nothing is indistinguishable from a hang, which is how a 15-minute default
    // looked like a stuck command the first time this ran. One line per change of answer, no line for
    // a repeated one.
    if (verdict.reason !== lastReason) {
      out.write(`wait-for-ci  ${sha}  ·  ${verdict.reason}\n`);
      lastReason = verdict.reason;
    }

    if (attempt < attempts) await sleep(interval * 1000);
  }

  // The last answer is kept: a timeout on a run that was still going names the run, and a timeout
  // with no run at all says so instead of blaming the matrix.
  out.write(`wait-for-ci  ${sha}  ·  ${verdict.reason}\n`);
  for (const line of verdict.lines) out.write(`${line}\n`);
  out.write(
    `wait-for-ci: unknown — gave up after ${timeoutSeconds}s; this is not a failure, ask the API again\n`,
  );
  return UNKNOWN;
}

/**
 * The command line: `node scripts/wait-for-ci.js <commit> [--timeout <seconds>] [--interval <seconds>]`.
 *
 * The commit is resolved through `git rev-parse` before it reaches the API, because `gh run list
 * --commit` matches nothing for an abbreviated SHA — it answers an empty list, which this command
 * would read as "no run yet" and wait out the whole timeout for. That is what happened on the first
 * run of this script against its own merge commit.
 *
 * @param {{ argv?: string[], exec?: Function, spawn?: Function, sleep?: Function, out?: { write: Function }, resolveSha?: (arg: string) => string }} [deps]
 * @returns {Promise<number>}
 */
export async function run(deps = {}) {
  const argv = deps.argv ?? process.argv.slice(2);
  const out = deps.out ?? process.stdout;

  const option = (name, fallback) => {
    const index = argv.indexOf(`--${name}`);
    if (index === -1) return fallback;
    const value = Number(argv[index + 1]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };

  const positional = argv.filter((argument, index) => {
    if (argument.startsWith('--')) return false;
    const previous = argv[index - 1];
    return previous !== '--timeout' && previous !== '--interval';
  });
  const sha = positional[0];
  const timeoutSeconds = option('timeout', DEFAULT_TIMEOUT_SECONDS);
  const intervalSeconds = option('interval', DEFAULT_INTERVAL_SECONDS);

  // A child process that never returns would hold the process open past the wait it belongs to, so
  // every call carries the wait's own budget as its ceiling.
  const spawn = deps.spawn ?? spawnSync;
  const callOptions = childOptions(Math.max(1, timeoutSeconds) * 1000);
  const exec =
    deps.exec ??
    ((args) => {
      const result = spawn('gh', args, callOptions);
      return { ok: result.status === 0, stdout: result.stdout ?? '' };
    });
  const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const resolveSha =
    deps.resolveSha ??
    ((argument) => {
      const result = spawn('git', ['rev-parse', '--verify', `${argument}^{commit}`], callOptions);
      return result.status === 0 ? result.stdout.trim() : argument;
    });

  if (typeof sha !== 'string' || sha === '') {
    out.write('wait-for-ci: a commit is required: node scripts/wait-for-ci.js <commit>\n');
    return UNKNOWN;
  }

  return wait({
    sha: resolveSha(sha),
    exec,
    sleep,
    out,
    timeoutSeconds,
    intervalSeconds,
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = await run();
  process.exitCode = code;
}
