// `in` narrows a union by a property the other member may hold too, with another type.
type Cat = { readonly meow: string };
type Dog = { readonly bark: string };
const raw = { bark: 'woof', meow: 42 };
const dog: Dog = raw;
const pet: Cat | Dog = dog;
const sound = 'meow' in pet ? pet.meow : pet.bark;
if (typeof sound !== 'string') console.log('BROKEN a03: sound is typed string and is', typeof sound);
export {};
