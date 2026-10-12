import { describe, expect, test } from 'vitest';
import './result-equality.js';
import { bodyJson, err, fromUriComponent, ok, uriComponent } from '../src/index.js';

describe('the JSON a request or an answer carries', () => {
  test('is read as a value of no known shape', async () => {
    expect(await bodyJson(new Request('https://example.test/', { method: 'POST', body: '{"a":[1]}' }))).toEqual(ok({ a: [1] }));
    expect(await bodyJson(new Response('3'))).toEqual(ok(3));
  });

  test('is a failure when the text is not JSON, and when the body cannot be read', async () => {
    expect((await bodyJson(new Response('{'))).ok).toBe(false);
    const used = new Response('1');
    await used.text();
    expect((await bodyJson(used)).ok).toBe(false);
    expect(await bodyJson({ text: () => Promise.reject(new Error('gone')) })).toEqual(err('gone'));
  });
});

describe('a part of a URL', () => {
  test('is written and read back', () => {
    expect(uriComponent('a b/é')).toEqual(ok('a%20b%2F%C3%A9'));
    expect(fromUriComponent('a%20b%2F%C3%A9')).toEqual(ok('a b/é'));
  });

  test('is a failure where the platform throws', () => {
    expect(uriComponent('\ud800').ok).toBe(false);
    expect(fromUriComponent('%E0%A4%A').ok).toBe(false);
  });
});

describe('two Results compared by a test', () => {
  test('are equal when they are the same variant holding the same thing', () => {
    expect(ok({ a: 1 })).toEqual(ok({ a: 1 }));
    expect(ok(1)).not.toEqual(ok(2));
    expect(err('x')).toEqual(err('x'));
    expect(err('x')).not.toEqual(err('y'));
    expect(ok('x')).not.toEqual(err('x'));
    expect(ok(1)).not.toEqual(1);
  });
});
