// `in` narrows a union by a property the other member may hold too, with another type.
type Cat = { readonly meow: string };
type Dog = { readonly bark: string };
const soundOf = (pet: Cat | Dog): string => ('meow' in pet ? pet.meow : pet.bark);
const raw = { bark: 'woof', meow: 42 };
const dog: Dog = raw;
const sound = soundOf(dog);
if (typeof sound !== 'string') console.log('BROKEN a03: sound is typed string and is', typeof sound);
export {};
