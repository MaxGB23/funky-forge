#!/usr/bin/env node
// Entry point. Real command dispatch is added with the CLI (task T6).
const USAGE = `funky-forge - plan and quote software projects in four gated phases

Usage:
  funky-forge install [--target <agents|claude>] [--dry-run] [--with-pointer] [--force] [--json]
  funky-forge init [--language <en|es>] [--proposal-language <en|es>] [--force] [--json]
  funky-forge check <phase>
  funky-forge calc [--write] [--json]

Run "funky-forge install" once per project, then follow the funky-forge skill.`;

const [, , command, ...rest] = process.argv;

if (!command || command === '--help' || command === '-h' || command === 'help') {
  console.log(USAGE);
  process.exit(0);
}

console.error(`funky-forge: "${command}" is not implemented yet${rest.length ? ` (${rest.join(' ')})` : ''}`);
console.error('');
console.error(USAGE);
process.exit(1);
