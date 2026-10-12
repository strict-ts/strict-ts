// A method that does not say `this: Mut<…>` calls, on `super`, one that does.
import type { Mut } from '@strict-ts/std';
class Base {
  count: Mut<number> = 0;
  bump(this: Mut<Base>): void {
    this.count += 1;
  }
  read(): number {
    return this.count;
  }
}
class Loud extends Base {
  override read(): number {
    super.bump();
    return this.count;
  }
}
function look(base: Base): number {
  return base.read();
}
const loud = new Loud();
look(loud);
if (loud.count !== 0) console.log('BROKEN m49: look takes no Mut and count is', loud.count);
