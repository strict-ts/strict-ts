import { total } from "./total.js";

export const report = (prices: readonly number[]): string => `${total(prices.map((price) => ({ label: "", price })))}`;
