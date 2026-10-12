import { randomUUID } from "node:crypto";
import { attempt } from "@strict-ts/std";

export const newId = () => attempt(() => randomUUID(), String);
export const parseJson = (text: string) => attempt((): unknown => JSON.parse(text), String);
