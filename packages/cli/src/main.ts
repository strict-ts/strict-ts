#!/usr/bin/env node
// The command line (file discovery, tsconfig, options) is not written yet. Until it is, the gate refuses: a check
// that cannot read the program must not report it as safe.
console.error('strict-ts: the command line is not available yet.');
process.exitCode = 2;
