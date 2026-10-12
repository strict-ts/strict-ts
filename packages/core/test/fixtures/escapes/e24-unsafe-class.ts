// A method of a class that an unsafe directory exports.
import { Reader } from './unsafe/leaky.js';
export const text = new Reader().read();
