import { SevenBitAsciiEncoder } from './core.js';

/**
 * Public surface of the seven-bit-ascii library.
 *
 * The default export is the Encoder class itself so callers can either build
 * many instances (useful when they want different encoder options per stream)
 * or use the shared module-level singleton, `encoder`, for convenience.
 */
export { SevenBitAsciiEncoder } from './core.js';
export { SevenBitAsciiEncoder as default } from './core.js';

/**
 * A ready-to-use encoder with library defaults (no line wrapping).
 * Provided as a convenience for callers who don't need per-instance options.
 */
import { SevenBitAsciiEncoder as Encoder } from './core.js';
export const encoder = new Encoder();
