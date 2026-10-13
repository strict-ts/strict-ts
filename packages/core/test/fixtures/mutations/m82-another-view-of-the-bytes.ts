// A typed array or a DataView made over the bytes of one that was given is a view of them, not a copy.
function a(bytes: Uint8Array): void {
  try {
    new Uint8Array(bytes.buffer)[0] = 9;
  } catch {
    // Nothing to do.
  }
}
function b(bytes: Uint8Array): void {
  try {
    new DataView(bytes.buffer).setUint8(1, 9);
  } catch {
    // Nothing to do.
  }
}
const bytes = Uint8Array.of(1, 2);
a(bytes);
b(bytes);
if (bytes[0] !== 1 || bytes[1] !== 2) console.log('BROKEN m82: neither takes Mut and the bytes are', bytes[0], bytes[1]);
