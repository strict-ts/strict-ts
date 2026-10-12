// An override says `this: Mut<…>`, or asks Mut of its parameter, where the method it stands for does not.
import type { Mut } from '@strict-ts/std';
type Cart = { total: Mut<number> };
class Base {
  count: Mut<number> = 0;
  read(): number {
    return this.count;
  }
  visit(cart: Cart): number {
    return cart.total;
  }
}
class Loud extends Base {
  override read(this: Mut<Loud>): number {
    this.count += 1;
    return this.count;
  }
  override visit(cart: Mut<Cart>): number {
    cart.total = 0;
    return 0;
  }
}
function look(base: Base, cart: Cart): number {
  return base.read() + base.visit(cart);
}
const loud = new Loud();
const cart = { total: 3 };
look(loud, cart);
if (loud.count !== 0 || cart.total !== 3) console.log('BROKEN m50: look takes no Mut and count, total are', loud.count, cart.total);
