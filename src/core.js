/**
 * SevenBitAsciiEncoder
 *
 * The problem: some legacy transports only carry 7-bit ASCII (values 0x00–0x7f).
 * Arbitrary binary data can contain bytes in 0x80–0xff, and even within the
 * 7-bit range some characters are unsafe for certain transports (e.g. control
 * characters, NUL, DEL). We need a reversible encoding that turns any input
 * byte sequence into a string of only printable 7-bit ASCII characters.
 *
 * Design choice (stated plainly so callers know what they get):
 *
 * We use a single-pass, character-wise escape encoding over the printable
 * ASCII range, NOT a chunked encoding like base64. The reason: base64 requires
 * buffering bytes into 3-byte groups and emits a fixed alphabet, which makes
 * streaming and partial-decode awkward when input arrives a byte at a time.
 * Character-wise escaping means each input byte maps to a self-contained
 * output token, so a partial input decodes to a partial output with no
 * carry-over state — which is important for the legacy streaming transports
 * this library targets.
 *
 * Encoding rules (see README for the rationale):
 *
 *  - Every byte in the printable ASCII range 0x21–0x7e (so '!' through '~')
 *    that is NOT the escape character '\' is emitted verbatim.
 *  - Every other byte value (0x00–0x20, 0x7f–0xff) is emitted as a lowercase
 *    hexadecimal escape: a '\' followed by exactly two hex digits.
 *
 * The escape character '\' (0x5c) itself is also escaped, as '\5c', so the
 * decoder is unambiguous: '\' always introduces an escape sequence and never
 * appears in output as a literal. This is why we do not use a second escape
 * character to mean "literal backslash" — one escape rule, one character.
 */
export class SevenBitAsciiEncoder {
  /**
   * The escape byte. Fixed at 0x5c ('\\') because it is the only byte that is
   * both printable and extremely unlikely to collide with the literal payload
   * of the binary data we are encoding (binary rarely contains stray 0x5c
   * in the middle of structured fields). Other choices like 0x7e would work
   * too; '\' is picked because it round-trips visually as "escape".
   */
  static ESCAPE = 0x5c; // '\'

  /**
   * Lower bound (inclusive) of the "emit verbatim" range.
   * 0x21 is the first printable ASCII char after space.
   */
  static PRINTABLE_LO = 0x21; // '!'
  static PRINTABLE_HI = 0x7e; // '~'

  constructor() {
    // No instance configuration today. The class is still constructable
    // rather than being a namespace of static methods so callers can hold
    // an instance (which reads better in DI-heavy code) and so the API has
    // room to grow options later without a breaking change.
  }

  /**
   * Encode a byte sequence into a 7-bit-ASCII-safe string.
   *
   * @param {Uint8Array} input - Bytes to encode. A Uint8Array is required
   *   (not a plain Array) so the caller is explicit about the byte domain;
   *   accepting arbitrary iterables would let a caller pass [300] silently.
   * @returns {string} Only printable ASCII chars ('!'..'~') appear here.
   */
  encode(input) {
    if (!(input instanceof Uint8Array)) {
      throw new TypeError(
        'SevenBitAsciiEncoder.encode expects a Uint8Array; received ' +
          (input === null ? 'null' : typeof input)
      );
    }

    let out = '';
    for (let i = 0; i < input.length; i++) {
      const b = input[i];
      if (
        b >= SevenBitAsciiEncoder.PRINTABLE_LO &&
        b <= SevenBitAsciiEncoder.PRINTABLE_HI &&
        b !== SevenBitAsciiEncoder.ESCAPE
      ) {
        out += String.fromCharCode(b);
      } else {
        // Two-digit lowercase hex. Because b is a byte (0–255) this is
        // always exactly two characters, so every escape token is fixed-
        // width and the decoder does not need to scan for token boundaries.
        const hex = b.toString(16);
        out += '\\' + (hex.length === 1 ? '0' + hex : hex);
      }
    }
    return out;
  }

  /**
   * Decode a string produced by encode() back into the original bytes.
   *
   * Strictness decision: a '\' must always be followed by exactly two hex
   * digits. If it is not, we throw — we do NOT silently emit the '\' as a
   * literal. The reason: "lenient" decoders are a classic source of
   * security bugs (differing implementations disagree on what's literal
   * vs. escaped). Being strict means encode/decode round-trips are exact
   * and malformed input fails loudly instead of being silently massaged.
   *
   * @param {string} input - A string previously produced by encode().
   * @returns {Uint8Array} The original bytes.
   */
  decode(input) {
    if (typeof input !== 'string') {
      throw new TypeError(
        'SevenBitAsciiEncoder.decode expects a string; received ' +
          (input === null ? 'null' : typeof input)
      );
    }

    const bytes = [];
    let i = 0;
    while (i < input.length) {
      const ch = input.charCodeAt(i);
      if (ch === SevenBitAsciiEncoder.ESCAPE) {
        // Need exactly two hex digits after the escape. If we're at the end
        // of the string or the next two chars aren't hex, that's malformed
        // input; throw rather than guess.
        if (i + 2 >= input.length) {
          throw new Error(
            'SevenBitAsciiEncoder.decode: truncated escape at index ' + i
          );
        }
        const h1 = input.charCodeAt(i + 1);
        const h2 = input.charCodeAt(i + 2);
        const v = hexPairToByte(h1, h2);
        if (v < 0) {
          throw new Error(
            'SevenBitAsciiEncoder.decode: invalid hex digit at index ' + (i + 1)
          );
        }
        bytes.push(v);
        i += 3;
      } else if (
        ch >= SevenBitAsciiEncoder.PRINTABLE_LO &&
        ch <= SevenBitAsciiEncoder.PRINTABLE_HI
      ) {
        bytes.push(ch);
        i += 1;
      } else {
        // A literal character outside the printable range means the input
        // was not produced by encode(). Reject it for the same strictness
        // reason: we don't try to reinterpret stray control chars.
        throw new Error(
          'SevenBitAsciiEncoder.decode: unexpected character 0x' +
            ch.toString(16).padStart(2, '0') +
            ' at index ' +
            i
        );
      }
    }
    return new Uint8Array(bytes);
  }
}

/**
 * Convert two ASCII code units (each a hex digit) into a byte value.
 * Returns -1 if either code unit is not a valid hex digit.
 *
 * Kept module-private rather than as a static method because it has no
 * meaningful use outside decode(); exposing it would suggest we support
 * arbitrary hex-string decoding, which we do not.
 */
function hexPairToByte(h1, h2) {
  const hi = hexDigitValue(h1);
  const lo = hexDigitValue(h2);
  if (hi < 0 || lo < 0) return -1;
  return (hi << 4) | lo;
}

function hexDigitValue(code) {
  if (code >= 0x30 && code <= 0x39) return code - 0x30; // '0'-'9'
  if (code >= 0x61 && code <= 0x66) return code - 0x61 + 10; // 'a'-'f'
  // We intentionally do NOT accept uppercase 'A'-'F'. encode() always
  // emits lowercase, so a well-formed input never contains uppercase hex.
  // Accepting uppercase would weaken the round-trip guarantee: it would
  // let two distinct strings (one with upper, one with lower) decode to
  // the same bytes, which we don't want for a canonical encoding.
  return -1;
}
