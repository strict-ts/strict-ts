// A method written with the method syntax takes a narrower parameter than its interface says.
interface Animal { readonly name: string }
interface Dog extends Animal { readonly tricks: readonly string[] }
interface Handler { handle(animal: Animal): string }
const dogsOnly = { handle(dog: Dog): string { return typeof dog.tricks; } };
const handler: Handler = dogsOnly;
const seen = handler.handle({ name: 'cat' });
if (seen === 'undefined') console.log('BROKEN a04: dog.tricks is typed as an array and is undefined');
export {};
