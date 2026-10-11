import type { Rule } from '../rule.js';
import { exhaustiveSwitch } from './exhaustive-switch.js';
import { mustUse } from './must-use.js';
import { noAny } from './no-any.js';
import { noCast } from './no-cast.js';
import { noExternalImport } from './no-external-import.js';
import { noNonNull } from './no-non-null.js';
import { noNull } from './no-null.js';
import { noThrow } from './no-throw.js';
import { noTsDirective } from './no-ts-directive.js';
import { safetyComment } from './safety-comment.js';
import { strictCompilerOptions } from './strict-compiler-options.js';
import { unsafeBoundary } from './unsafe-boundary.js';

export const rules: readonly Rule[] = [
  noAny,
  noCast,
  noNonNull,
  noThrow,
  noNull,
  noExternalImport,
  mustUse,
  exhaustiveSwitch,
  noTsDirective,
  unsafeBoundary,
  safetyComment,
  strictCompilerOptions,
];
