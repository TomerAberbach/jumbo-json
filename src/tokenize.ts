import { Byte, StringBytes } from './constants.ts';
import { ParserContext } from './context.ts';
import { ParseError } from './error.ts';
import { ParserState } from './types.ts';

/**
 * Returns the index of the first byte that wasn't consumed
 * @param ctx Current parser state
 * @param buf Buffer to read from
 * @param end Length of the buffer or subset of buffer to be read
 */
export function tokenize(
  ctx: ParserContext,
  buf: Buffer,
  end: number,
  isLastChunk: boolean = false,
): number {
  let consumed = 0;
  while (consumed < end) {
    switch (ctx.state) {
      case ParserState.ExpectValue: {
        consumed = ws(ctx, buf, consumed, end);
        if (consumed >= end) {
          return consumed;
        }

        const char = buf[consumed]!;
        if (char === Byte.LowerN) {
          const next = parseNull(ctx, buf, consumed, end, isLastChunk);
          if (next === null) return consumed;
          consumed = next;
          continue;
        } else if (char === Byte.LowerF) {
          const next = parseFalse(ctx, buf, consumed, end, isLastChunk);
          if (next === null) return consumed;
          consumed = next;
          continue;
        } else if (char === Byte.LowerT) {
          const next = parseTrue(ctx, buf, consumed, end, isLastChunk);
          if (next === null) return consumed;
          consumed = next;
          continue;
        }
        break;
      }

      case ParserState.ExpectKeyOrClose: {
        throw new Error('Not yet implemented');
        break;
      }

      case ParserState.ExpectColon: {
        throw new Error('Not yet implemented');
        break;
      }

      case ParserState.ExpectCommaOrClose: {
        throw new Error('Not yet implemented');
        break;
      }

      case ParserState.Number: {
        throw new Error('Not yet implemented');
        break;
      }

      case ParserState.String: {
        throw new Error('Not yet implemented');
        break;
      }

      case ParserState.Escape: {
        throw new Error('Not yet implemented');
        break;
      }
    }
    throw ParseError.expected(
      ctx.chunkBaseOffset + consumed,
      'valid JSON character',
      buf[consumed] ?? 0,
    );
  }
  return consumed;
}

/**
 * Returns the new index or null if more bytes are needed.
 */
const parseTrue = (
  ctx: ParserContext,
  buf: Buffer,
  index: number,
  end: number,
  isLastChunk: boolean,
): number | null => {
  if (index + 4 > end) {
    if (isLastChunk) throw ParseError.endOfInput(ctx.chunkBaseOffset + index);
    return null;
  }
  if (buf.readUInt32LE(index) !== StringBytes.TrueLE) {
    throw ParseError.expected(
      ctx.chunkBaseOffset + index,
      'true',
      buf.subarray(index, index + 4),
    );
  }
  ctx.commit(true);
  return index + 4;
};

/**
 * Returns the new index or null if more bytes are needed.
 */
const parseFalse = (
  ctx: ParserContext,
  buf: Buffer,
  index: number,
  end: number,
  isLastChunk: boolean,
): number | null => {
  if (index + 5 > end) {
    if (isLastChunk) throw ParseError.endOfInput(ctx.chunkBaseOffset + index);
    return null;
  }
  if (
    buf.readUInt32LE(index) !== StringBytes.FalsLE ||
    buf[index + 4] !== Byte.LowerE
  ) {
    throw ParseError.expected(
      ctx.chunkBaseOffset + index,
      'false',
      buf.subarray(index, index + 5),
    );
  }
  ctx.commit(false);
  return index + 5;
};

/**
 * Returns the new index or null if more bytes are needed.
 */
const parseNull = (
  ctx: ParserContext,
  buf: Buffer,
  index: number,
  end: number,
  isLastChunk: boolean,
): number | null => {
  if (index + 4 > end) {
    if (isLastChunk) throw ParseError.endOfInput(ctx.chunkBaseOffset + index);
    return null;
  }
  if (buf.readUInt32LE(index) !== StringBytes.NullLE) {
    throw ParseError.expected(
      ctx.chunkBaseOffset + index,
      'null',
      buf.subarray(index, index + 4),
    );
  }
  ctx.commit(null);
  return index + 4;
};

const ws = (
  ctx: ParserContext,
  buf: Buffer,
  index: number,
  end: number,
): number => {
  while (index < end) {
    const char = buf[index];
    if (
      char !== Byte.Space &&
      char !== Byte.Tab &&
      char !== Byte.Newline &&
      char !== Byte.CarriageReturn
    ) {
      return index;
    }
    index += 1;
  }
  return index;
};
