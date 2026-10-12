// A getter of an object that an unsafe directory exports.
import { lazy } from './unsafe/leaky.js';
export const text = lazy.value;
