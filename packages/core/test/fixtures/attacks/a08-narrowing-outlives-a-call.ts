// What a test narrowed is still taken as narrowed after a call that changes it.
import type { Mut } from '@strict-ts/std';
const box: Mut<{ value: string | undefined }> = { value: 'x' };
const clear = (): void => {
  box.value = undefined;
};
if (box.value !== undefined) {
  clear();
  const after: string = box.value;
  if (typeof after !== 'string') console.log('BROKEN a08: after is typed string and is', typeof after);
}
