// Runs in a page, after the generator of values (its text is put before this one). Calls each function of the DOM
// it was given on generated values, and leaves what it saw where the driver reads it.
/* global JOBS, RUNS, SEED, generate, instance, sequence, show, hosts */

/** Objects of the page a function can be called on, or be given. Made again for each function: calls change them. */
function pool() {
  const made = [];
  const add = (make) => {
    try {
      const value = make();
      if (value !== undefined && value !== null) made.push(value);
    } catch {
      // A constructor this browser does not have, or one that needs what a bare page lacks.
    }
  };
  const root = document.createElement('div');
  document.body?.append(root);
  for (const tag of ['div', 'span', 'a', 'button', 'input', 'textarea', 'select', 'option', 'form', 'img', 'canvas', 'video', 'audio', 'table', 'tr', 'td', 'ul', 'li', 'p', 'label', 'template', 'dialog', 'details', 'style', 'script', 'iframe', 'progress', 'fieldset', 'slot', 'object']) {
    add(() => root.appendChild(document.createElement(tag)));
  }
  add(() => document.createElement('div'));
  add(() => document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
  add(() => document.createElementNS('http://www.w3.org/2000/svg', 'path'));
  const element = root.firstElementChild;
  element?.append('text', document.createElement('b'));
  element?.setAttribute('class', 'a b');
  const canvas = root.querySelector('canvas');
  for (const make of [
    () => window, () => document, () => document.documentElement, () => document.body, () => document.head, () => root,
    () => document.createTextNode('text'), () => document.createComment('c'), () => document.createDocumentFragment(), () => document.createAttribute('a'),
    () => document.createRange(), () => getSelection(), () => canvas.getContext('2d'), () => element.classList, () => element.style, () => element.dataset,
    () => element.attributes, () => element.childNodes, () => element.children, () => localStorage, () => sessionStorage, () => navigator, () => performance,
    () => crypto, () => crypto.subtle, () => new URL('https://example.com/a?b=1#c'), () => new URLSearchParams('a=1&b=2'), () => new Headers({ a: 'b' }),
    () => new Request('https://example.com/'), () => new Response('{"a":1}'), () => new Blob(['text']), () => new File(['text'], 'f.txt'), () => new FormData(),
    () => new AbortController(), () => new AbortController().signal, () => new Event('x'), () => new CustomEvent('x'), () => new MouseEvent('click'),
    () => new KeyboardEvent('keydown'), () => new EventTarget(), () => new MessageChannel(), () => new MessageChannel().port1, () => new TextEncoder(),
    () => new TextDecoder(), () => new DOMParser(), () => new XMLSerializer(), () => new MutationObserver(() => undefined), () => new IntersectionObserver(() => undefined),
    () => new ResizeObserver(() => undefined), () => new Image(), () => new DOMRect(), () => new DOMPoint(), () => new DOMMatrix(), () => new Path2D(), () => new ImageData(1, 1),
    () => document.createTreeWalker(root), () => document.createNodeIterator(root), () => new XMLHttpRequest(), () => new BroadcastChannel('x'), () => new CSSStyleSheet(),
    () => matchMedia('(min-width: 1px)'), () => new ReadableStream(), () => new WritableStream(), () => new TransformStream(), () => new FileReader(), () => new DataTransfer(),
    () => document.styleSheets, () => element.getBoundingClientRect(), () => document.implementation, () => customElements, () => screen, () => visualViewport,
    () => new OffscreenCanvas(2, 2), () => new OffscreenCanvas(2, 2).getContext('2d'), () => canvas.getContext('2d').createLinearGradient(0, 0, 1, 1), () => new Option('a'), () => new Audio(),
    () => document.timeline, () => element.animate([], 1), () => new DOMException('x'), () => new PromiseRejectionEvent('x', { promise: Promise.resolve() }), () => new ErrorEvent('x'),
    () => indexedDB, () => new TextEncoderStream(), () => element.shadowRoot ?? document.createElement('div').attachShadow({ mode: 'open' }),
  ]) add(make);
  return { made, clear: () => root.remove() };
}

/** What a declared function is in the page: how to call it, and on what. */
function locate(job, objects) {
  const { owner, member } = job;
  if (owner === '') return typeof globalThis[member] === 'function' ? { receivers: [undefined], call: (_receiver, args) => globalThis[member](...args) } : undefined;
  const holder = globalThis[owner];
  if (member === 'new') return typeof holder === 'function' ? { receivers: [undefined], call: (_receiver, args) => new holder(...args) } : undefined;
  if (job.isStatic) return typeof holder?.[member] === 'function' ? { receivers: [undefined], call: (_receiver, args) => holder[member](...args) } : undefined;
  // A method: on every object of the page that is of the class, or, for what several classes share, that has it.
  const receivers = objects.filter((object) => typeof object[member] === 'function' && (typeof holder !== 'function' || object instanceof holder));
  return receivers.length === 0 ? undefined : { receivers, call: (receiver, args) => receiver[member](...args) };
}

const settle = (value) =>
  typeof value?.then === 'function'
    ? Promise.race([Promise.resolve(value).then(() => undefined, (error) => error ?? new Error('rejected')), new Promise((resolve) => setTimeout(resolve, 1))])
    : undefined;

const results = [];
for (const job of JOBS) {
  const objects = pool();
  // A value of a class of the page, where a parameter asks for one.
  hosts.make = (type, random) => {
    const holder = globalThis[type.name];
    const fitting = typeof holder === 'function' ? objects.made.filter((object) => object instanceof holder) : [];
    return fitting.length === 0 ? undefined : random.pick(fitting);
  };
  const target = locate(job, objects.made);
  if (target === undefined) {
    results.push({ name: job.name, located: false });
    objects.clear();
    continue;
  }
  const result = { name: job.name, located: true, modes: {} };
  for (const plain of [true, false]) {
    const random = sequence(SEED + (plain ? 1 : 2));
    const byCount = {};
    for (let run = 0; run < RUNS; run++) {
      const signature = job.signatures[run % job.signatures.length];
      const required = signature.params.filter((parameter) => !parameter.optional && !parameter.rest).length;
      const most = signature.params.reduce((count, parameter) => count + (parameter.rest ? 2 : 1), 0);
      const count = required + Math.floor(random.next() * (most - required + 1));
      const args = [];
      let missing = false;
      for (const parameter of signature.params) {
        if (args.length >= count) break;
        const value = generate(parameter.type, random, plain);
        // An object of the page that could not be made: the call would not be one the types accept.
        if (value === undefined && parameter.type.k === 'library') missing = true;
        args.push(value);
        if (parameter.rest && args.length < count) args.push(generate(parameter.type, random, plain));
      }
      if (missing) continue;
      const receiver = random.pick(target.receivers);
      const tally = (byCount[args.length] ??= { runs: 0, threw: 0 });
      tally.runs++;
      let error;
      try {
        error = await settle(target.call(receiver, args));
      } catch (caught) {
        error = caught ?? new Error('threw');
      }
      if (error !== undefined && error?.message !== 'Invalid string length') {
        tally.threw++;
        const on = receiver === undefined ? '' : `${receiver?.constructor?.name ?? 'object'} · `;
        tally.example ??= `${on}(${args.map(show).join(', ')}) → ${error?.name ?? 'Error'}`;
      }
    }
    result.modes[plain ? 'plain' : 'any'] = byCount;
  }
  results.push(result);
  objects.clear();
}
// Left where the driver reads it, under whatever the document has become.
const out = document.createElement('script');
out.type = 'application/json';
out.id = 'strict-ts-result';
out.textContent = JSON.stringify(results).replaceAll('<', '\\u003c');
(document.documentElement ?? document).appendChild(out);
