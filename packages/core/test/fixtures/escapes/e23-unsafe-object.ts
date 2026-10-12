// A method of an object that an unsafe directory exports.
import { api } from './unsafe/leaky.js';
export const text = api.read();
