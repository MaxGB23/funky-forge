/**
 * `funky-forge install`: copies the shipped method pack into one harness skill directory.
 *
 * The pack declares the version of the binary that shipped it, so this command can tell three states
 * apart that used to look identical: a copy from an older release, a copy from a newer one, and a copy
 * the user edited on purpose. It writes only inside the target directory, asks before replacing a copy
 * a human may own, and refuses with a reason when there is no terminal to ask in. It never touches user
 * configuration except the single opt-in pointer.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { packState, readDeclaredVersion } from '../lib/pack-version.js';

export const SKILL_SOURCE = fileURLToPath(new URL('../../skill', import.meta.url));
export const SKILL_DIR_NAME = 'funky-forge';

export const TARGETS = {
  agents: { skillsDir: '.agents/skills', pointer: 'AGENTS.md', label: 'shared standard' },
  claude: { skillsDir: '.claude/skills', pointer: 'CLAUDE.md', label: 'Claude Code' },
};

const POINTER_BLOCK = ['<!-- funky-forge -->', 'For project planning or quoting, load the `funky-forge` skill.'].join('\n');
export const CLAUDE_MARKER = '.claude';
export const SHARED_MARKERS = ['.agents/skills', '.opencode', '.codex'];

/** The one question this CLI asks, and the two answers it accepts. Empty means keep: a stray return
 * key must never be the reason a copy is overwritten. */
const QUESTION = 'funky-forge install: choose 1 or 2 [1]: ';
const ANSWERS = {
  '': 'keep',
  '1': 'keep',
  k: 'keep',
  keep: 'keep',
  '2': 'replace',
  o: 'replace',
  overwrite: 'replace',
  replace: 'replace',
  y: 'replace',
  yes: 'replace',
};

/**
 * @param {string} line
 * @returns {'keep' | 'replace' | null} `null` when the line is neither answer
 */
export function parseAnswer(line) {
  return ANSWERS[String(line).trim().toLowerCase()] ?? null;
}

export function listSkillFiles(source = SKILL_SOURCE, prefix = '') {
  const files = [];
  for (const entry of readdirSync(join(source, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listSkillFiles(source, relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

export function detectTargets(cwd) {
  const found = [];
  const shared = SHARED_MARKERS.filter((marker) => existsSync(join(cwd, marker)));
  if (shared.length > 0) found.push({ target: 'agents', markers: shared });
  if (existsSync(join(cwd, CLAUDE_MARKER))) found.push({ target: 'claude', markers: [CLAUDE_MARKER] });
  return found;
}

/**
 * The one place that decides what state the installed copy is in. `install`, `--check` and `--json` all
 * read this object, because two comparisons would eventually disagree about the same directory.
 * @param {string} cwd
 * @param {string} skillsDir
 */
function inspect(cwd, skillsDir) {
  const destination = `${skillsDir}/${SKILL_DIR_NAME}`;
  const entries = listSkillFiles().map((file) => {
    const path = join(cwd, skillsDir, SKILL_DIR_NAME, file);
    if (!existsSync(path)) return { file, status: 'new' };
    const shipped = readFileSync(join(SKILL_SOURCE, file));
    const installed = readFileSync(path);
    return { file, status: Buffer.compare(shipped, installed) === 0 ? 'same' : 'modified' };
  });

  const skill = join(cwd, skillsDir, SKILL_DIR_NAME, 'SKILL.md');
  // The unit that has a version is the pack, so presence is the directory: a pack with files but no
  // SKILL.md has no version to read, and calling it absent would overwrite an edit without asking.
  const present = existsSync(join(cwd, skillsDir, SKILL_DIR_NAME));
  const identical = entries.every((entry) => entry.status === 'same');
  const installedVersion = existsSync(skill) ? readDeclaredVersion(readFileSync(skill, 'utf8')) : null;
  const shippedVersion = readDeclaredVersion(readFileSync(join(SKILL_SOURCE, 'SKILL.md'), 'utf8'));

  return {
    destination,
    entries,
    missing: entries.filter((entry) => entry.status === 'new'),
    modified: entries.filter((entry) => entry.status === 'modified'),
    unchanged: entries.filter((entry) => entry.status === 'same'),
    installedVersion,
    shippedVersion,
    state: packState({ present, identical, installedVersion, shippedVersion }),
  };
}

/** One line that says which state the copy is in and which version is involved, in every case. */
function stateLine(found) {
  const { destination, state, installedVersion, shippedVersion, modified } = found;
  if (state === 'absent') return `Absent · ${destination} (ships ${shippedVersion})`;
  if (state === 'identical') return `Current · ${destination} (${shippedVersion})`;
  if (state === 'edited') return `Edited · ${destination} (${installedVersion}, ${modified.length} file(s) differ)`;
  if (state === 'unversioned') return `Unversioned · ${destination} (the copy declares none, this binary ships ${shippedVersion})`;
  return `${state === 'older' ? 'Older' : 'Newer'} · ${destination} (installed ${installedVersion}, this binary ships ${shippedVersion})`;
}

/** How to name the copy that is about to be replaced, or that was kept. */
function copyVersion(found) {
  if (found.state === 'edited') return `${found.installedVersion} with local changes`;
  if (found.state === 'unversioned') return 'unversioned';
  return found.installedVersion;
}

/** The sentence a refusal hands back, so the reason never lives in another command. */
function difference(found) {
  if (found.state === 'edited') return `it carries local changes on version ${found.installedVersion}`;
  if (found.state === 'unversioned') return 'it declares no version line, so where it came from cannot be told';
  return `it is version ${found.installedVersion} and this binary ships ${found.shippedVersion}`;
}

function questionLines(found) {
  const installed =
    found.state === 'unversioned'
      ? 'none declared'
      : `version ${found.state === 'edited' ? `${found.installedVersion} with local changes` : found.installedVersion}`;
  return [
    `funky-forge install: replace ${found.destination}?`,
    `  installed: ${installed}`,
    `  shipped:   version ${found.shippedVersion}`,
  ];
}

/**
 * Lines from a terminal, queued. Readline hands a line to whoever is listening at that moment, and a
 * question asked one tick later would miss an answer already typed; the queue removes that race, and a
 * stream that closes without answering resolves as `null` so the safe answer stands.
 * @param {NodeJS.ReadStream} input
 */
function readLines(input) {
  const queued = [];
  const waiting = [];
  let closed = false;
  const prompt = createInterface({ input, terminal: false });
  prompt.on('line', (line) => {
    const waiter = waiting.shift();
    if (waiter) waiter(line);
    else queued.push(line);
  });
  prompt.on('close', () => {
    closed = true;
    while (waiting.length > 0) waiting.shift()(null);
  });
  return {
    next() {
      if (queued.length > 0) return Promise.resolve(queued.shift());
      if (closed) return Promise.resolve(null);
      return new Promise((resolve) => waiting.push(resolve));
    },
    close() {
      prompt.close();
    },
  };
}

/**
 * Asks on a terminal, in one place. The question goes to stderr so `--json` stdout stays parseable, and
 * three answers that are neither key end the conversation with the safe one.
 * @returns {Promise<boolean>} true when the human chose to replace the copy
 */
async function askToReplace({ found, stdin, err }) {
  for (const line of questionLines(found)) err(line);
  const answers = readLines(stdin);
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      err(QUESTION);
      const line = await answers.next();
      if (line === null) return false;
      const answer = parseAnswer(line);
      if (answer !== null) return answer === 'replace';
    }
    return false;
  } finally {
    answers.close();
  }
}

/**
 * @param {{cwd?: string, flags?: Record<string, string | boolean>, stdout?: (line: string) => void,
 *   stderr?: (line: string) => void, stdin?: NodeJS.ReadStream, confirm?: () => boolean | Promise<boolean>}} [options]
 * @returns {Promise<number>} the exit code
 */
export async function install({ cwd = process.cwd(), flags = {}, stdout, stderr, stdin, confirm } = {}) {
  const out = (line) => (stdout ? stdout(line) : process.stdout.write(`${line}\n`));
  const err = (line) => (stderr ? stderr(line) : process.stderr.write(`${line}\n`));
  // `--json` owns stdout: a caller parses stdout, so progress notices belong on stderr.
  const notice = (line) => (flags.json ? err(line) : out(line));
  const explicit = typeof flags.target === 'string' ? flags.target : null;

  let target = explicit;
  if (target !== null && !Object.hasOwn(TARGETS, target)) {
    err(`UNKNOWN_TARGET: --target must be agents or claude, got "${target}"`);
    return 1;
  }

  if (target === null) {
    const detected = detectTargets(cwd);
    if (detected.length > 1) {
      notice(`Detected: ${detected.map((entry) => `${TARGETS[entry.target].label} (${entry.markers.join(', ')})`).join(', ')}`);
      err('TARGET_AMBIGUOUS: both harness markers exist (exit 2).');
      err('  Re-run with one of:');
      err('    funky-forge install --target agents');
      err('    funky-forge install --target claude');
      return 2;
    }
    if (detected.length === 1) {
      target = detected[0].target;
      notice(`Detected: ${TARGETS[target].label} (${detected[0].markers.join(', ')})`);
    } else {
      target = 'agents';
      notice('No harness marker found: using the shared default (.agents/skills).');
    }
  }

  const spec = TARGETS[target];
  const found = inspect(cwd, spec.skillsDir);

  /** The `--json` object, built once so every path that succeeds prints the same shape. */
  const payload = ({ written, pointer }) =>
    JSON.stringify(
      {
        ok: true,
        target,
        destination: found.destination,
        state: found.state,
        version: { installed: found.installedVersion, shipped: found.shippedVersion },
        written,
        unmodified: found.unchanged.length,
        pointer,
      },
      null,
      2,
    );

  if (flags.check) {
    out(stateLine(found));
    for (const entry of found.missing) out(`  missing: ${found.destination}/${entry.file}`);
    for (const entry of found.modified) out(`  modified: ${found.destination}/${entry.file}`);
    return found.state === 'identical' ? 0 : 1;
  }

  const pointerPath = join(cwd, spec.pointer);
  if (flags['with-pointer'] && existsSync(pointerPath) && readFileSync(pointerPath, 'utf8').includes('<!-- funky-forge -->')) {
    err(`POINTER_EXISTS: ${spec.pointer} already points at funky-forge`);
    return 1;
  }

  if (flags['dry-run']) {
    out(stateLine(found));
    out(`Would install ${found.destination}:`);
    for (const entry of found.entries) out(`  ${entry.status === 'same' ? 'unchanged' : entry.status === 'new' ? 'new     ' : 'overwrite'} ${entry.file}`);
    if (flags['with-pointer']) out(`Would append the pointer to ${spec.pointer}`);
    return 0;
  }

  if (found.state === 'newer' && !flags.force) {
    err(`NEWER_PACK: ${found.destination} is version ${found.installedVersion}, and this binary ships ${found.shippedVersion}`);
    err('  An installed pack cannot be older than the binary that validates it.');
    err(`  Install funky-forge@${found.installedVersion} or newer to keep it, or pass --force to downgrade it.`);
    return 1;
  }

  const sure = found.state === 'absent' || found.state === 'identical';
  let replace = !sure && flags.force === true;

  if (!sure && !flags.force) {
    const decide =
      typeof confirm === 'function'
        ? confirm
        : stdin?.isTTY
          ? () => askToReplace({ found, stdin, err })
          : null;
    if (decide === null) {
      err(`PACK_NOT_ASKED: ${found.destination} needs an answer (exit 2)`);
      err(`  reason: cannot ask whether to replace ${found.destination}: ${difference(found)}, and stdin is not a terminal`);
      err('  Re-run with --force to replace it, or leave the copy as it is.');
      return 2;
    }
    replace = await decide();
    if (!replace) {
      if (flags.json) {
        out(payload({ written: 0, pointer: null }));
        return 0;
      }
      notice(`Kept · ${found.destination} (${copyVersion(found)})`);
      return 0;
    }
  }

  mkdirSync(join(cwd, spec.skillsDir, SKILL_DIR_NAME), { recursive: true });
  for (const entry of found.entries) {
    if (entry.status === 'same') continue;
    const file = join(cwd, spec.skillsDir, SKILL_DIR_NAME, entry.file);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, readFileSync(join(SKILL_SOURCE, entry.file)));
  }

  let pointerAdded = false;
  if (flags['with-pointer']) {
    const existing = existsSync(pointerPath) ? readFileSync(pointerPath, 'utf8') : '';
    const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
    writeFileSync(pointerPath, `${existing}${separator}${existing === '' ? '' : '\n'}${POINTER_BLOCK}\n`);
    pointerAdded = true;
  }

  const replaced = replace && !sure;
  if (flags.json) {
    out(
      payload({
        written: found.missing.length + (replaced ? found.modified.length : 0),
        pointer: pointerAdded ? spec.pointer : null,
      }),
    );
    return 0;
  }

  if (found.state === 'identical') {
    notice(stateLine(found));
  } else if (found.state === 'absent') {
    notice(`Installed · ${found.destination} (${found.shippedVersion})`);
  } else {
    notice(`Replaced · ${found.destination} (${found.shippedVersion}, was ${copyVersion(found)})`);
  }
  if (pointerAdded) notice(`Pointer appended to ${spec.pointer}.`);
  return 0;
}
