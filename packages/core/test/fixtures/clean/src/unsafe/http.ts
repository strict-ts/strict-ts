import { attempt, err, Result } from "@strict-ts/std";

export type HttpError = { kind: "network"; message: string } | { kind: "status"; status: number };

const network = (cause: unknown): HttpError => ({ kind: "network", message: String(cause) });

/** `fetch` and `res.text()` may throw: everything is enclosed in Results. */
export const fetchText = (url: string) =>
  Result.gen(async function* () {
    const res = yield* await attempt(() => fetch(url), network);
    if (!res.ok) return err<HttpError>({ kind: "status", status: res.status });
    return await attempt(() => res.text(), network);
  });
