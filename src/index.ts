import { InputBuffer } from './input-buffer.ts';
import { ParserState } from './types.ts';
import { tokenize } from './tokenize.ts';
import { ParseError } from './error.ts';
import { ParserContext } from './context.ts';

async function parse(stream: ReadableStream<Uint8Array>): Promise<unknown> {
  const inputBuffer = new InputBuffer();
  const ctx = new ParserContext();
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      inputBuffer.push(value);
      const consumed = tokenize(ctx, inputBuffer.bytes, inputBuffer.length);
      ctx.chunkBaseOffset += consumed;
      inputBuffer.shift(consumed);
    }
  } finally {
    reader.releaseLock();
  }

  const consumed = tokenize(ctx, inputBuffer.bytes, inputBuffer.length, true);
  ctx.chunkBaseOffset += consumed;
  inputBuffer.shift(consumed);
  if (inputBuffer.length > 0) {
    throw ParseError.truncatedInput(ctx.chunkBaseOffset);
  }

  if (ctx.state !== ParserState.Done) {
    throw ParseError.unexpectedEndOfInput(ctx.chunkBaseOffset);
  }

  if (ctx.frames.length !== 1) {
    throw new Error(`Expected to have a single root frame, found ${ctx.frames.length}`);
  }

  return ctx.frames[0]!.value;
}

export const JumboJSON = {
  parse,
};
