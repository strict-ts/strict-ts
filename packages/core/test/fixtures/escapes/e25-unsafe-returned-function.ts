// A function that an unsafe function returns.
import { make } from './unsafe/leaky.js';
export const text = make()();
