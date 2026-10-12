// See cycle/: started from b, a runs first and is fine; started from a, b reads `a` too early.
import { fromB } from './cycle/a.js';
export const seen = fromB;
