import { Result } from "@strict-ts/std";
import { mainPermission, User } from "./domain/user.js";
import { fetchText } from "./unsafe/http.js";
import { parseJson, readEnv } from "./unsafe/json.js";

// `yield*` is Rust's `?` operator. Inferred: Promise<Result<User, HttpError | "invalid-json" | SchemaError>>
const loadUser = (url: string) =>
  Result.gen(async function* () {
    const text = yield* await fetchText(url);
    const json = yield* parseJson(text);
    return User.parse(json);
  });

async function main(): Promise<void> {
  const url = readEnv("USER_URL").unwrapOr("https://example.com/user.json");
  const user = await loadUser(url);
  console.log(
    user.match({
      ok: (u) => `${u.name} (${u.role}), main permission: ${mainPermission(u.role)}`,
      err: (e) => `Failed: ${JSON.stringify(e)}`,
    }),
  );
}

// A promise left unawaited at the top level on purpose: dropped explicitly with `void`.
void main();
