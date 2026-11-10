/**
 * The method pack's version, as a rule rather than an assumption.
 *
 * `install` has to answer "which version is this copy?" about bytes it did not write, so the reading
 * and the ordering are pure functions over text. Every surface that needs the verdict — `install`,
 * `--check`, `--json` — reads it from here, because two comparisons would eventually disagree about
 * the same directory, and that is the worst failure available.
 */

/** The frontmatter a harness reads: fenced, first thing in the file, closed by its own `---`. */
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;

/**
 * The version a pack declares in its own frontmatter. Read from the bytes rather than from the running
 * `package.json`: a copy that travelled by hand, was vendored, or was packed separately still says what
 * it is, and the manifest would only say what the installer is.
 * @param {string} text the pack's `SKILL.md`, as it sits on disk
 * @returns {string | null} the declared version, or `null` when this pack declares none
 */
export function readDeclaredVersion(text) {
  const block = FRONTMATTER.exec(text);
  if (block === null) return null;
  const declared = /^version:[ \t]*(\S+)[ \t]*$/m.exec(block[1]);
  return declared === null ? null : declared[1];
}

/**
 * Orders two versions by their numeric segments. A missing segment counts as zero, so `0.1` and
 * `0.1.0` are the same version, and a `-prerelease` suffix does not change which release it belongs
 * to: `0.1.0-beta.2` is `0.1.0` for the purpose of telling a stale copy from a current one.
 * @param {string} left
 * @param {string} right
 * @returns {-1 | 0 | 1}
 */
export function compareVersions(left, right) {
  /** @param {string} value @returns {number[]} */
  const segments = (value) =>
    value
      .split('-')[0]
      .split('.')
      .map((segment) => Number.parseInt(segment, 10) || 0);
  const a = segments(left);
  const b = segments(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const mine = a[index] ?? 0;
    const theirs = b[index] ?? 0;
    if (mine !== theirs) return mine < theirs ? -1 : 1;
  }
  return 0;
}

/**
 * The one verdict every surface shows.
 *
 * `identical` means every file that is present matches the shipped bytes, and `missing` counts the ones
 * that are not there. Missing files are not divergence: an interrupted copy is `incomplete`, and
 * completing it is what `install` is for, so neither asks. A pack whose version cannot be read is a
 * question rather than an error: the copies that `0.1.0` installed carry no version line, and accusing
 * their owners of an edit they did not make would be the wrong answer to the right observation.
 * @param {{present: boolean, identical: boolean, missing?: number, installedVersion: string | null, shippedVersion: string | null}} found
 * @returns {'absent' | 'identical' | 'incomplete' | 'older' | 'newer' | 'edited' | 'unversioned'}
 */
export function packState({ present, identical, missing = 0, installedVersion, shippedVersion }) {
  if (!present) return 'absent';
  if (identical) return missing > 0 ? 'incomplete' : 'identical';
  if (installedVersion === null || shippedVersion === null) return 'unversioned';
  const order = compareVersions(installedVersion, shippedVersion);
  if (order < 0) return 'older';
  if (order > 0) return 'newer';
  return 'edited';
}
