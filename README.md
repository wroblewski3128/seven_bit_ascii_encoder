# seven-bit-ascii

Encodes arbitrary bytes into a 7-bit-ASCII-safe string and back. Output contains only the printable ASCII range `!` through `~`.

## Usage

```js
import { SevenBitAsciiEncoder, encoder } from './src/index.js';

const e = new SevenBitAsciiEncoder();
const encoded = e.encode(new Uint8Array([0x48, 0x00, 0xff, 0x5c]));
// encoded === 'H\\00\\ff\\5c'
const back = e.decode(encoded);
// back is a Uint8Array equal to the original

// Or use the shared singleton:
encoder.encode(new Uint8Array([0x41])); // 'A'
```

`encode(input: Uint8Array): string` — turns each byte into either a verbatim printable ASCII char or a `\xx` lowercase hex escape.
`decode(input: string): Uint8Array` — strict inverse of `encode`; throws on malformed input.

The class also exposes the static constants `ESCAPE` (`0x5c`), `PRINTABLE_LO` (`0x21`), and `PRINTABLE_HI` (`0x7e`) that define the encoding rules.

## Why this exists

Some transports (legacy serial lines, pagers, certain SMTP relays, ancient terminal protocols) only carry 7-bit ASCII and actively choke on NUL, DEL, and other control bytes. You need a reversible encoding whose output never leaves the printable ASCII range.

The trade-off taken here: this is a character-wise escape encoding, not base64. That means each input byte maps to a self-contained output token (either one verbatim char or three chars `\xx`), so a partial input decodes to a partial output with no carry-over state — which matters when you are streaming over a flaky link and may need to resume mid-message. The cost is larger output than base64 for pure binary data: worst case every byte becomes three characters (a 3x expansion) versus base64's 4/3. For the small, intermittent payloads this is designed for, that is the right swap.

## The awkward edge

`decode` is strict on purpose. A `\` must always be followed by exactly two lowercase hex digits. `\0A` (uppercase), `\0` (truncated), or `\` (lone) all throw instead of being silently reinterpreted. If you are decoding data that may have passed through a system that rewrote casing or stripped trailing characters, normalise it before calling `decode` — the library will not guess for you.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

