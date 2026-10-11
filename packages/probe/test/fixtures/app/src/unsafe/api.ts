// unsafe/: a wrapper as people write them, with a cast that nothing checks and no attempt around the call.
export interface User {
  readonly id: string;
  readonly age: number;
}

export const parseUser = (text: string): { readonly ok: true; readonly value: User } => {
  // SAFETY: the server sends users
  const user = JSON.parse(text) as User;
  return { ok: true, value: user };
};

export function firstTag(text: string): { readonly ok: true; readonly value: string } {
  return { ok: true, value: decodeURIComponent(text) };
}
