#!/usr/bin/env node
import { main } from '../src/cli.js';

process.exitCode = main(process.argv.slice(2), {
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
});
