// A private name read on an object that is not of the class.
class Vault {
  readonly #secret = 1;
  static open(of: Vault): number {
    return of.#secret;
  }
}
const lookalike = Object.create(Vault.prototype) as Vault;
export const secret = Vault.open(lookalike);
