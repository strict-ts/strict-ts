// A property written under a key that is one of several names: the value fits one and is written to another.
type Sizes = { readonly width?: number; readonly label?: string };
const put = (key: 'width' | 'label', value: number | string): Sizes => ({ [key]: value });
const sizes = put('width', 'wide');
if (sizes.width !== undefined && typeof sizes.width !== 'number') console.log('BROKEN c07: width is typed number and is', typeof sizes.width);
export {};
