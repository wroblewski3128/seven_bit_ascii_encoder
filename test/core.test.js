import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SevenBitAsciiEncoder, encoder } from '../src/index.js';

/**
 * Tests for SevenBitAsciiEncoder.
 *
 * Each test exercises behaviour that the implementation actually supports;
 * nothing here invents a feature the code doesn't claim to have.
 */

const enc = new SevenBitAsciiEncoder();

function bytes(...arr) {
  return new Uint8Array(arr);
}

test('printable ASCII bytes pass through verbatim', () => {
  // 0x21..0x7e excluding the escape char 0x5c
  const input = bytes(
    0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a
  );
  const out = enc.encode(input);
  assert.equal(out, '!"#$%&\'()*');
  assert.deepEqual(Array.from(enc.decode(out)), Array.from(input));
});

test('the escape character 0x5c is itself escaped', () => {
  const input = bytes(0x5c);
  const out = enc.encode(input);
  assert.equal(out, '\\5c');
  assert.deepEqual(Array.from(enc.decode(out)), [0x5c]);
});

test('control bytes 0x00..0x20 are hex-escaped', () => {
  const input = bytes(0x00, 0x01, 0x09, 0x0a, 0x0d, 0x20);
  const out = enc.encode(input);
  assert.equal(out, '\\00\\01\\09\\0a\\0d\\20');
  assert.deepEqual(Array.from(enc.decode(out)), Array.from(input));
});

test('DEL and high bytes 0x7f..0xff are hex-escaped', () => {
  const input = bytes(0x7f, 0x80, 0xff, 0xab, 0xcd);
  const out = enc.encode(input);
  assert.equal(out, '\\7f\\80\\ff\\ab\\cd');
  assert.deepEqual(Array.from(enc.decode(out)), Array.from(input));
});

test('every byte value 0x00..0xff round-trips', () => {
  const all = new Uint8Array(256);
  for (let i = 0; i < 256; i++) all[i] = i;
  const encoded = enc.encode(all);
  const decoded = enc.decode(encoded);
  assert.deepEqual(Array.from(decoded), Array.from(all));
});

test('empty input round-trips to empty output', () => {
  const empty = new Uint8Array(0);
  assert.equal(enc.encode(empty), '');
  assert.equal(enc.decode('').length, 0);
});

test('mixed printable and escaped bytes interleave correctly', () => {
  const input = bytes(0x41, 0x00, 0x42, 0x5c, 0x43, 0xff, 0x44);
  // A, NUL, B, backslash, C, 0xff, D
  const out = enc.encode(input);
  assert.equal(out, 'A\\00B\\5cC\\ffD');
  assert.deepEqual(Array.from(enc.decode(out)), Array.from(input));
});

test('decoding rejects uppercase hex digits (strict round-trip)', () => {
  // encode() always emits lowercase, so uppercase is malformed.
  assert.throws(
    () => enc.decode('\\0A'),
    /invalid hex digit/
  );
});

test('decoding rejects a truncated escape at end of string', () => {
  assert.throws(
    () => enc.decode('abc\\0'),
    /truncated escape/
  );
});

test('decoding rejects a lone escape character with no digits', () => {
  assert.throws(
    () => enc.decode('abc\\'),
    /truncated escape/
  );
});

test('decoding rejects a literal control character in the input', () => {
  // 0x01 is not printable, so it is not valid in an encoded string.
  assert.throws(
    () => enc.decode('a\x01b'),
    /unexpected character/
  );
});

test('encode throws TypeError on non-Uint8Array input', () => {
  assert.throws(
    () => enc.encode([1, 2, 3]),
    { name: 'TypeError' }
  );
  assert.throws(
    () => enc.encode(null),
    { name: 'TypeError' }
  );
});

test('decode throws TypeError on non-string input', () => {
  assert.throws(
    () => enc.decode(123),
    { name: 'TypeError' }
  );
  assert.throws(
    () => enc.decode(null),
    { name: 'TypeError' }
  );
});

test('module-level singleton encoder works identically', () => {
  const input = bytes(0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x21);
  const out = encoder.encode(input);
  assert.equal(out, 'Hello\\00!');
  assert.deepEqual(Array.from(encoder.decode(out)), Array.from(input));
});

test('ESCAPE, PRINTABLE_LO, PRINTABLE_HI are exported as static constants', () => {
  assert.equal(SevenBitAsciiEncoder.ESCAPE, 0x5c);
  assert.equal(SevenBitAsciiEncoder.PRINTABLE_LO, 0x21);
  assert.equal(SevenBitAsciiEncoder.PRINTABLE_HI, 0x7e);
});

test('decoding a string not produced by encode still succeeds if it only contains printable chars', () => {
  // Plain printable ASCII (0x21..0x7e) with no escapes is a valid
  // (degenerate) encoding. Space (0x20) is NOT in the printable range
  // and must be escaped, so we avoid it here.
  const out = enc.decode('Hello,world!');
  assert.deepEqual(
    Array.from(out),
    [0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x2c, 0x77, 0x6f, 0x72, 0x6c, 0x64, 0x21]
  );
});
