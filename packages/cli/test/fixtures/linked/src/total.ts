import { type Line, priceOf } from "./model.js";

export const total = (lines: readonly Line[]): number => lines.reduce((sum, line) => sum + priceOf(line), 0);
