import type { Rule } from '../rule.js';
import { exhaustiveSwitch } from './exhaustive-switch.js';
import { freezeFresh } from './freeze-fresh.js';
import { mustUse } from './must-use.js';
import { mutFromReadonly } from './mut-from-readonly.js';
import { noAmbient } from './no-ambient.js';
import { noAny } from './no-any.js';
import { noCast } from './no-cast.js';
import { noExternalImport } from './no-external-import.js';
import { noNonNull } from './no-non-null.js';
import { noParamMutation } from './no-param-mutation.js';
import { noNull } from './no-null.js';
import { noThrow } from './no-throw.js';
import { noThrowingCall } from './no-throwing-call.js';
import { noThrowingOperator } from './no-throwing-operator.js';
import { noTsDirective } from './no-ts-directive.js';
import { readonlyTypes } from './readonly-types.js';
import { noTypePredicate } from './no-type-predicate.js';
import { pureDomain } from './pure-domain.js';
import { safetyComment } from './safety-comment.js';
import { strictCompilerOptions } from './strict-compiler-options.js';
import { unreadSources } from './unread-sources.js';
import { unsafeBoundary } from './unsafe-boundary.js';
import { useOnce } from './use-once.js';

/** The catalogue. A new rule goes at the end: hosts number the rules by their place here. */
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
  unreadSources,
  noTypePredicate,
  noAmbient,
  noParamMutation,
  readonlyTypes,
  pureDomain,
  noThrowingCall,
  noThrowingOperator,
  useOnce,
  freezeFresh,
  mutFromReadonly,
];
