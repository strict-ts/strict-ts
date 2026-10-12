// unsafe/: what the compiler knows of a type and does not say in its types.
import { none, type Option, some } from '@strict-ts/std';
import type ts from '@typescript/typescript6';

/** The type arguments of a reference to a generic type (`Map<K, V>`, an array, a tuple): none for another type. */
export function typeArgumentsOf(api: typeof ts, checker: ts.TypeChecker, type: ts.Type): Option<readonly ts.Type[]> {
  if ((type.flags & api.TypeFlags.Object) === 0) return none;
  // SAFETY: a type with the flag Object is an ObjectType, which is where the compiler keeps `objectFlags`.
  const flags = (type as ts.ObjectType).objectFlags;
  if ((flags & api.ObjectFlags.Reference) === 0) return none;
  // SAFETY: an object type with the flag Reference is a TypeReference: the compiler's own guard reads the same flag.
  return some(checker.getTypeArguments(type as ts.TypeReference));
}
