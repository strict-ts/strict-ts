import type { Type } from '../provider.js';

const discriminatedOn = (type: Type, property: string): boolean =>
  type.members.every((member) => member.property(property)?.isBooleanLiteral === true);

/** A Result is recognised by its shape, not by its name: every member carries a literal `ok`. */
export const isResult = (type: Type): boolean => discriminatedOn(type, 'ok');

/** An Option is recognised by its shape: every member carries a literal `some`. */
export const isOption = (type: Type): boolean => discriminatedOn(type, 'some');

/** Whether a Result or an Option carries `any` in one of its properties. */
export const carriesAny = (type: Type): boolean =>
  type.members.some((member) => member.properties.some((property) => property.isAny));

/** Whether one member of the type is a Result or an Option: `r | undefined` still carries what must be used. */
export const mayBeResult = (type: Type): boolean =>
  type.members.some((member) => member.property('ok')?.isBooleanLiteral === true);
export const mayBeOption = (type: Type): boolean =>
  type.members.some((member) => member.property('some')?.isBooleanLiteral === true);
export const mayBePromise = (type: Type): boolean => type.members.some((member) => member.isPromise);
