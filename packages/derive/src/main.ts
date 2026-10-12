#!/usr/bin/env node
import { attempt } from '@strict-ts/std';
import { run } from './index.js';

// Nothing escapes as a stack trace: a crash is said in one line, with the exit code of a project not checked.
const code = attempt(
  () => run(process.argv.slice(2), { cwd: process.cwd(), out: (line) => console.log(line), err: (line) => console.error(line) }),
  (cause) => (cause instanceof Error ? cause.message : String(cause)),
);
process.exitCode = code.match({
  ok: (exit) => exit,
  err: (reason) => {
    console.error(`strict-ts-derive: crashed: ${reason}`);
    return 2;
  },
});
