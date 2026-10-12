// Importing this file makes `toEqual` compare two Results by their variant and what they hold: see `resultEquality`.
import { expect } from 'vitest';
import { resultEquality } from '../src/index.js';

expect.addEqualityTesters([resultEquality]);
