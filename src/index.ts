import { stat, open } from 'node:fs/promises';
import type { Readable } from 'node:stream';

const ParseState = {
  Start: 0,
  Array: 1 << 0,
  Character: 1 << 1,
  Characters: 1 << 2,
  Digit: 1 << 3,
  Digits: 1 << 4,
  Element: 1 << 5,
  Elements: 1 << 6,
  Escape: 1 << 7,
  Exponent: 1 << 8,
  Fraction: 1 << 9,
  Hex: 1 << 10,
  Integer: 1 << 11,
  Json: 1 << 12,
  Member: 1 << 13,
  Members: 1 << 14,
  Number: 1 << 15,
  Object: 1 << 16,
  Onenine: 1 << 17,
  Sign: 1 << 18,
  String: 1 << 19,
  Value: 1 << 20,
  Ws: 1 << 21,
} as const;

const Byte = {
  LeftBrace: 0x7b, // {
  RightBrace: 0x7d, // }
  LeftBracket: 0x5b, // [
  RightBracket: 0x5d, // ]
  Colon: 0x3a, // :
  Comma: 0x2c, // ,

  // String delimiters / Escape
  Quote: 0x22, // "
  Backslash: 0x5c, // \
  Solidus: 0x2f, // /

  // Whitespace (RFC 8259 sec 2)
  Space: 0x20,
  Tab: 0x09, // \t
  Newline: 0x0a, // \n
  CarriageReturn: 0x0d, // \r

  // Number
  Minus: 0x2d, // -
  Plus: 0x2b, // +
  Dot: 0x2e, // .
  Zero: 0x30, // 0
  Nine: 0x39, // 9
  LowerE: 0x65, // e
  UpperE: 0x45, // E

  // Keyword leads
  LowerT: 0x74, // t in true
  LowerF: 0x66, // f in false
  LowerN: 0x6e, // n in null

  // Escape continuations after backslash
  LowerB: 0x62, // b -> backspace
  LowerR: 0x72, // r -> CR
  LowerU: 0x75, // u -> unicode escape
} as const;

const TRUE_LE = 0x65757274; // bytes: t r u e
const NULL_LE = 0x6c6c756e; // bytes: n u l l
const FALS_LE = 0x736c6166; // bytes: f a l s

type ParserCtx = { state: number; result: unknown };

// Tokenize as much of `buf[0..validEnd)` as possible. Returns the index of the
// first byte that wasn't fully consumed. Mutates `ctx`.
function tokenize(
  buf: Buffer,
  validEnd: number,
  ctx: ParserCtx,
  isFinalChunk: boolean,
): number {
  let i = 0;
  let consumed = 0;
  chunk: while (i < validEnd) {
    const char = buf[i];

    switch (ctx.state) {
      case ParseState.Start:
      case ParseState.Element: {
        switch (char) {
          case Byte.LeftBrace:
            ctx.state = ParseState.Object;
            i += 1;
            break;
          case Byte.LeftBracket:
            ctx.state = ParseState.Array;
            i += 1;
            break;
          case Byte.Quote:
            ctx.state = ParseState.String;
            i += 1;
            break;
          case Byte.LowerT: {
            if (i + 4 > validEnd) {
              if (isFinalChunk) throw new Error('Unexpected EOF parsing true');
              break chunk;
            }
            if (buf.readUInt32LE(i) !== TRUE_LE) {
              throw new Error('Invalid token: expected true');
            }
            ctx.result = true;
            i += 4;
            break;
          }
          case Byte.LowerN: {
            if (i + 4 > validEnd) {
              if (isFinalChunk) throw new Error('Unexpected EOF parsing null');
              break chunk;
            }
            if (buf.readUInt32LE(i) !== NULL_LE) {
              throw new Error('Invalid token: expected null');
            }
            ctx.result = null;
            i += 4;
            break;
          }
          case Byte.LowerF: {
            if (i + 5 > validEnd) {
              if (isFinalChunk) throw new Error('Unexpected EOF parsing false');
              break chunk;
            }
            if (buf.readUInt32LE(i) !== FALS_LE || buf[i + 4] !== Byte.LowerE) {
              throw new Error('Invalid token: expected false');
            }
            ctx.result = false;
            i += 5;
            break;
          }
          default:
            // TODO: whitespace, numbers, etc. For now, skip unknown bytes.
            i += 1;
        }
        break;
      }
      default:
        // TODO: handle remaining states. For now, advance to avoid infinite loop.
        i += 1;
    }

    consumed = i;
  }
  return consumed;
}

const INITIAL_CARRY_SIZE = 64 * 1024;
const MIN_READ_HEADROOM = 16 * 1024;

// Ensure `carry` has at least `needed` bytes of free space past `carryLen`.
// Returns the (possibly new) buffer; doubles in size as needed.
function ensureCapacity(
  carry: Buffer,
  carryLen: number,
  needed: number,
): Buffer {
  const required = carryLen + needed;
  if (required <= carry.byteLength) return carry;
  let next = carry.byteLength;
  while (next < required) next *= 2;
  const grown = Buffer.allocUnsafe(next);
  carry.copy(grown, 0, 0, carryLen);
  return grown;
}

async function parse(filePath: string): Promise<unknown> {
  const stats = await stat(filePath, { bigint: true });
  if (!stats.isFile()) {
    throw new Error(`TODO: Only works on files`);
  }

  // TODO: If the file is small enough, just use JSON.parse

  let carry: Buffer = Buffer.allocUnsafe(INITIAL_CARRY_SIZE);
  let carryLen = 0;
  const fileHandle = await open(filePath);
  const ctx: ParserCtx = { state: ParseState.Start, result: undefined };
  let eof = false;

  try {
    while (!eof) {
      carry = ensureCapacity(carry, carryLen, MIN_READ_HEADROOM);

      const { bytesRead } = await fileHandle.read(
        carry,
        carryLen,
        carry.byteLength - carryLen,
      );
      carryLen += bytesRead;
      eof = bytesRead === 0;

      const consumed = tokenize(carry, carryLen, ctx, eof);

      if (consumed > 0 && consumed < carryLen) {
        carry.copy(carry, 0, consumed, carryLen);
      }
      carryLen -= consumed;

      if (eof && carryLen > 0) {
        throw new Error('Unexpected EOF: truncated input');
      }
    }
  } finally {
    await fileHandle.close();
  }

  return ctx.result;
}

async function parseFromReadable(stream: Readable): Promise<unknown> {
  let carry: Buffer = Buffer.allocUnsafe(INITIAL_CARRY_SIZE);
  let carryLen = 0;
  const ctx: ParserCtx = { state: ParseState.Start, result: undefined };

  for await (const incoming of stream) {
    const chunk: Buffer = Buffer.isBuffer(incoming)
      ? incoming
      : Buffer.from(incoming);

    carry = ensureCapacity(carry, carryLen, chunk.byteLength);
    chunk.copy(carry, carryLen);
    carryLen += chunk.byteLength;

    const consumed = tokenize(carry, carryLen, ctx, false);
    if (consumed > 0 && consumed < carryLen) {
      carry.copy(carry, 0, consumed, carryLen);
    }
    carryLen -= consumed;
  }

  // Final flush: anything still in carry must form a complete token now or fail.
  if (carryLen > 0) {
    const consumed = tokenize(carry, carryLen, ctx, true);
    if (consumed < carryLen) {
      throw new Error('Unexpected EOF: truncated input');
    }
  }

  return ctx.result;
}

export const BigJSON = {
  parse,
  parseFromReadable,
};
