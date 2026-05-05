import { Byte, SimpleEscapeSequence, StringBytes } from './constants.ts';
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
  // Numbers end implicitly at EOF. When the final tokenize call arrives with
  // an empty buffer, the while loop below won't run, so we finalize here
  if (isLastChunk && end === 0 && ctx.state === ParserState.Number) {
    const str = ctx.getNumberSoFar();
    if (!NUMBER_RE.test(str)) {
      throw ParseError.expected(ctx.chunkBaseOffset, 'valid number', str);
    }
    ctx.commit(Number(str));
    return 0;
  }

  let consumed = 0;
  while (consumed < end) {
    switch (ctx.state) {
      case ParserState.Done: {
        consumed = ws(buf, consumed, end);
        if (consumed >= end) {
          return consumed;
        }

        throw ParseError.expectedEndOfInput(ctx.chunkBaseOffset + consumed);
      }

      case ParserState.ExpectValue: {
        consumed = ws(buf, consumed, end);
        if (consumed >= end) {
          return consumed;
        }

        const char = buf[consumed]!;
        if (char === Byte.LowerN) {
          const next = parseNull(ctx, buf, consumed, end, isLastChunk);
          if (next === null) return consumed;
          consumed = next;
          ctx.commit(null);
          continue;
        } else if (char === Byte.LowerF) {
          const next = parseFalse(ctx, buf, consumed, end, isLastChunk);
          if (next === null) return consumed;
          consumed = next;
          ctx.commit(false);
          continue;
        } else if (char === Byte.LowerT) {
          const next = parseTrue(ctx, buf, consumed, end, isLastChunk);
          if (next === null) return consumed;
          consumed = next;
          ctx.commit(true);
          continue;
        } else if (char === Byte.Quote) {
          consumed += 1;
          ctx.startString();
          continue;
        } else if (char === Byte.LeftBracket) {
          ctx.startArray();
          consumed += 1;
          continue;
        } else if (char === Byte.RightBracket) {
          ctx.endArray();
          consumed += 1;
          continue;
        } else if (char === Byte.LeftBrace) {
          ctx.startObject();
          consumed += 1;
          continue;
        } else if (
          char === Byte.Minus ||
          (char >= Byte.Zero && char <= Byte.Nine)
        ) {
          ctx.startNumber();
          continue;
        }
        break;
      }

      case ParserState.ExpectKeyOrClose: {
        consumed = ws(buf, consumed, end);
        if (consumed >= end) {
          return consumed;
        }
        const char = buf[consumed]!;
        if (char === Byte.RightBrace) {
          ctx.endObject();
          consumed += 1;
        } else if (char === Byte.Quote) {
          consumed += 1;
          ctx.startObjectKey();
        } else {
          throw ParseError.expected(ctx.chunkBaseOffset + consumed, '"', char);
        }
        continue;
      }

      case ParserState.ExpectKey: {
        consumed = ws(buf, consumed, end);
        if (consumed >= end) {
          return consumed;
        }
        const char = buf[consumed]!;
        if (char === Byte.Quote) {
          consumed += 1;
          ctx.startObjectKey();
        } else {
          throw ParseError.expected(ctx.chunkBaseOffset + consumed, '"', char);
        }
        continue;
      }

      case ParserState.ExpectColon: {
        consumed = ws(buf, consumed, end);
        if (consumed >= end) {
          return consumed;
        }
        const char = buf[consumed]!;
        if (char !== Byte.Colon) {
          throw ParseError.expected(ctx.chunkBaseOffset + consumed, ':', char);
        }
        consumed += 1;
        ctx.state = ParserState.ExpectValue;
        continue;
      }

      case ParserState.ExpectCommaOrClose: {
        consumed = ws(buf, consumed, end);
        if (consumed >= end) {
          return consumed;
        }

        const char = buf[consumed]!;
        if (char === Byte.Comma) {
          consumed += 1;
          ctx.state = ctx.isInArray
            ? ParserState.ExpectValue
            : ParserState.ExpectKey;
        } else if (ctx.isInArray) {
          if (char === Byte.RightBracket) {
            ctx.endArray();
            consumed += 1;
          } else {
            throw ParseError.expected(
              ctx.chunkBaseOffset + consumed,
              ']',
              char,
            );
          }
        } else if (ctx.isInObject) {
          if (char === Byte.RightBrace) {
            ctx.endObject();
            consumed += 1;
          } else {
            throw ParseError.expected(
              ctx.chunkBaseOffset + consumed,
              '}',
              char,
            );
          }
        } else {
          throw new Error('Unreachable');
        }
        continue;
      }

      case ParserState.Number: {
        let i = consumed;
        while (i < end && isNumberChar(buf[i]!)) {
          i++;
        }

        if (i < end || isLastChunk) {
          const str = ctx.getNumberSoFar() + buf.toString('ascii', consumed, i);
          if (!NUMBER_RE.test(str)) {
            throw ParseError.expected(
              ctx.chunkBaseOffset + consumed,
              'valid number',
              str,
            );
          }
          ctx.commit(Number(str));
          consumed = i;
        } else {
          ctx.addNumberChunk(buf.toString('ascii', consumed, i));
          return i;
        }
        continue;
      }

      case ParserState.String: {
        let chunkStart = consumed;
        let i = consumed;
        let stringClosed = false;
        for (; i < end; i++) {
          const char = buf[i]!;
          if (char === Byte.Backslash) {
            // Need at least one more byte to know the escape type
            if (i + 1 >= end) {
              if (i > chunkStart) {
                ctx.addStringChunk(Buffer.from(buf.subarray(chunkStart, i)));
              }
              return i;
            }
            const nextChar = buf[i + 1]!;
            const simple = SimpleEscapeSequence[nextChar];
            if (simple !== undefined) {
              if (i > chunkStart) {
                ctx.addStringChunk(Buffer.from(buf.subarray(chunkStart, i)));
              }
              ctx.addStringChunk(simple);
              i += 1;
              chunkStart = i + 1;
            } else if (nextChar === Byte.LowerU) {
              // \uXXXX — need 6 bytes total (\, u, 4 hex digits)
              if (i + 6 > end) {
                if (i > chunkStart) {
                  ctx.addStringChunk(Buffer.from(buf.subarray(chunkStart, i)));
                }
                return i;
              }
              const hex = buf.toString('ascii', i + 2, i + 6);
              if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
                throw ParseError.expected(
                  ctx.chunkBaseOffset + i + 2,
                  'hex digit',
                  buf[i + 2]!,
                );
              }
              let codePoint = parseInt(hex, 16);
              // Handle surrogate pairs
              if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
                // High surrogate — look for low surrogate following it
                if (i + 12 > end) {
                  if (i > chunkStart) {
                    ctx.addStringChunk(
                      Buffer.from(buf.subarray(chunkStart, i)),
                    );
                  }
                  return i;
                }
                if (
                  buf[i + 6] === Byte.Backslash &&
                  buf[i + 7] === Byte.LowerU
                ) {
                  const lowHex = buf.toString('ascii', i + 8, i + 12);
                  if (!/^[0-9a-fA-F]{4}$/.test(lowHex)) {
                    throw ParseError.expected(
                      ctx.chunkBaseOffset + i + 8,
                      'hex digit',
                      buf[i + 8]!,
                    );
                  }
                  const lowSurrogate = parseInt(lowHex, 16);
                  if (lowSurrogate >= 0xdc00 && lowSurrogate <= 0xdfff) {
                    codePoint =
                      0x10000 +
                      ((codePoint - 0xd800) << 10) +
                      (lowSurrogate - 0xdc00);
                    if (i > chunkStart) {
                      ctx.addStringChunk(
                        Buffer.from(buf.subarray(chunkStart, i)),
                      );
                    }
                    ctx.addStringChunk(String.fromCodePoint(codePoint));
                    i += 11;
                    chunkStart = i + 1;
                    continue;
                  }
                }
              }
              if (i > chunkStart) {
                ctx.addStringChunk(Buffer.from(buf.subarray(chunkStart, i)));
              }
              ctx.addStringChunk(String.fromCodePoint(codePoint));
              i += 5;
              chunkStart = i + 1;
            } else {
              throw ParseError.expected(
                ctx.chunkBaseOffset + i + 1,
                'valid escape character',
                nextChar,
              );
            }
          } else if (char === Byte.Quote) {
            ctx.endString(buf.subarray(chunkStart, i));
            consumed = i + 1;
            stringClosed = true;
            break;
          } else if (char < 0x20) {
            throw ParseError.expected(
              ctx.chunkBaseOffset + i,
              'valid string character',
              char,
            );
          }
        }

        if (!stringClosed) {
          if (isLastChunk) {
            throw ParseError.unexpectedEndOfInput(ctx.chunkBaseOffset + i);
          }
          if (i > chunkStart) {
            ctx.addStringChunk(Buffer.from(buf.subarray(chunkStart, i)));
          }
          return i;
        }
        continue;
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
    if (isLastChunk)
      throw ParseError.unexpectedEndOfInput(ctx.chunkBaseOffset + index);
    return null;
  }
  if (buf.readUInt32LE(index) !== StringBytes.TrueLE) {
    throw ParseError.expected(
      ctx.chunkBaseOffset + index,
      'true',
      buf.subarray(index, index + 4),
    );
  }
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
    if (isLastChunk)
      throw ParseError.unexpectedEndOfInput(ctx.chunkBaseOffset + index);
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
    if (isLastChunk)
      throw ParseError.unexpectedEndOfInput(ctx.chunkBaseOffset + index);
    return null;
  }
  if (buf.readUInt32LE(index) !== StringBytes.NullLE) {
    throw ParseError.expected(
      ctx.chunkBaseOffset + index,
      'null',
      buf.subarray(index, index + 4),
    );
  }
  return index + 4;
};

const NUMBER_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

const isNumberChar = (char: number): boolean =>
  (char >= Byte.Zero && char <= Byte.Nine) ||
  char === Byte.Dot ||
  char === Byte.LowerE ||
  char === Byte.UpperE ||
  char === Byte.Minus ||
  char === Byte.Plus;

const ws = (buf: Buffer, index: number, end: number): number => {
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
