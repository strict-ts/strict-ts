// What a test narrowed before a loop, changed at the end of a turn and relied on at the start of the next.
import type { Mut } from '@strict-ts/std';
const box: Mut<{ value: string | undefined }> = { value: 'x' };
const clear = (): void => {
  box.value = undefined;
};
if (box.value !== undefined) {
  for (const turn of [1, 2]) {
    const now: string = box.value;
    if (typeof now !== 'string') console.log('BROKEN c06: now is typed string and is', typeof now, 'at turn', turn);
    clear();
  }
}
