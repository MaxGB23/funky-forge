/**
 * `funky-forge install`: copies the shipped method pack into one harness skill directory.
 * Writes only new files inside that directory, reports divergence instead of overwriting it,
 * and never touches user configuration except the single opt-in pointer.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_SOURCE = fileURLToPath(new URL('../../skill', import.meta.url));
export const SKILL_DIR_NAME = 'funky-forge';

export const TARGETS = {
  agents: { skillsDir: '.agents/skills', pointer: 'AGENTS.md', label: 'shared standard' },
  claude: { skillsDir: '.claude/skills', pointer: 'CLAUDE.md', label: 'Claude Code' },
};

const POINTER_BLOCK = ['<!-- funky-forge -->', 'For project planning or quoting, load the `funky-forge` skill.'].join('\n');
export const CLAUDE_MARKER = '.claude';
export const SHARED_MARKERS = ['.agents/skills', '.opencode', '.codex'];

/**
 * @param {string} source
 * @param {string} [prefix]
 * @returns {string[]} POSIX-relative file paths, sorted
 */
export function listSkillFiles(source = SKILL_SOURCE, prefix = '') {
  const files = [];
  for (const entry of readdirSync(join(source, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listSkillFiles(source, relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

/**
 * @param {string} cwd
 * @returns {{target: string, markers: string[]}[]}
 */
export function detectTargets(cwd) {
  const found = [];
  const shared = SHARED_MARKERS.filter((marker) => existsSync(join(cwd, marker)));
  if (shared.length > 0) found.push({ target: 'agents', markers: shared });
  if (existsSync(join(cwd, CLAUDE_MARKER))) found.push({ target: 'claude', markers: [CLAUDE_MARKER] });
  return found;
}

/**
 * @param {string} cwd
 * @param {string} skillsDir
 * @returns {{file: string, status: 'new' | 'same' | 'modified'}[]}
 */
function plan(cwd, skillsDir) {
  return listSkillFiles().map((file) => {
    const destination = join(cwd, skillsDir, SKILL_DIR_NAME, file);
    if (!existsSync(destination)) return { file, status: 'new' };
    const shipped = readFileSync(join(SKILL_SOURCE, file), 'utf8');
    const installed = readFileSync(destination, 'utf8');
    return { file, status: shipped === installed ? 'same' : 'modified' };
  });
}

/**
 * @param {{cwd?: string, flags?: Record<string, string | boolean>, stdout?: (line: string) => void, stderr?: (line: string) => void}} options
 * @returns {number}
 */
export function install({ cwd = process.cwd(), flags = {}, stdout, stderr } = {}) {
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
  const destination = `${spec.skillsDir}/${SKILL_DIR_NAME}`;
  const entries = plan(cwd, spec.skillsDir);
  const missing = entries.filter((entry) => entry.status === 'new');
  const modified = entries.filter((entry) => entry.status === 'modified');
  const unchanged = entries.filter((entry) => entry.status === 'same');

  if (flags.check) {
    if (missing.length === 0 && modified.length === 0) {
      out(`${destination}: in sync (${unchanged.length} files)`);
      return 0;
    }
    for (const entry of missing) out(`  missing: ${destination}/${entry.file}`);
    for (const entry of modified) out(`  modified: ${destination}/${entry.file}`);
    return 1;
  }

  if (modified.length > 0 && !flags.force) {
    err(`MODIFIED_FILE: ${modified.length} installed file(s) differ from the shipped pack; re-run with --force to overwrite`);
    for (const entry of modified) err(`  ${destination}/${entry.file}`);
    return 1;
  }

  const pointerPath = join(cwd, spec.pointer);
  if (flags['with-pointer'] && existsSync(pointerPath) && readFileSync(pointerPath, 'utf8').includes('<!-- funky-forge -->')) {
    err(`POINTER_EXISTS: ${spec.pointer} already points at funky-forge`);
    return 1;
  }

  if (flags['dry-run']) {
    out(`Would install ${destination}:`);
    for (const entry of entries) out(`  ${entry.status === 'same' ? 'unchanged' : entry.status === 'new' ? 'new     ' : 'overwrite'} ${entry.file}`);
    if (flags['with-pointer']) out(`Would append the pointer to ${spec.pointer}`);
    return 0;
  }

  mkdirSync(join(cwd, spec.skillsDir, SKILL_DIR_NAME), { recursive: true });
  for (const entry of entries) {
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

  if (flags.json) {
    out(
      JSON.stringify(
        {
          ok: true,
          target,
          destination,
          written: missing.length + (flags.force ? modified.length : 0),
          unmodified: unchanged.length,
          pointer: pointerAdded ? spec.pointer : null,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  out(`Installed ${destination}:`);
  for (const entry of entries) out(`  ${entry.file}`);
  out(`Written: ${missing.length}${flags.force ? ` (+${modified.length} overwritten)` : ''}`);
  out(`Unmodified: ${unchanged.length}`);
  if (pointerAdded) out(`Pointer appended to ${spec.pointer}.`);
  else out('Unmodified: every user-owned file (AGENTS.md, CLAUDE.md, configuration).');
  return 0;
}
