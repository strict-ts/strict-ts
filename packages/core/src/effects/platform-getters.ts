// The properties of the web platform that throw when they are read. Written by hand from the standards that are
// named: a property is not called, so the script that runs the functions of the DOM in a browser does not see
// them. A short list of the ones a page meets, and not all there are: see docs/known-limits.md.

/** By the class the property is read on, as `Class.property`, with what it throws. */
export const platformGetters: Readonly<Record<string, string>> = {
  // HTML standard, « The localStorage getter steps » and « The sessionStorage getter steps ».
  'Window.localStorage': 'throws a SecurityError where the page may not use storage',
  'Window.sessionStorage': 'throws a SecurityError where the page may not use storage',
  // HTML standard, « The cookie attribute »: a document in a sandbox with no origin of its own.
  'Document.cookie': 'throws a SecurityError in a document that has no origin of its own',
  // Indexed Database standard, « The result getter steps » and « The error getter steps ».
  'IDBRequest.result': 'throws an InvalidStateError while the request is not done',
  'IDBRequest.error': 'throws an InvalidStateError while the request is not done',
  // XMLHttpRequest standard, « The responseText getter steps » and « The responseXML getter steps ».
  'XMLHttpRequest.responseText': 'throws an InvalidStateError when the response is not asked as a text',
  'XMLHttpRequest.responseXML': 'throws an InvalidStateError when the response is not asked as a document',
};

/** Those that are read with no object in front: a name of the page itself. */
export const platformGlobals: Readonly<Record<string, string>> = {
  localStorage: 'Window.localStorage',
  sessionStorage: 'Window.sessionStorage',
};
