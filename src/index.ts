import { stat, open, readFile } from 'node:fs/promises';
import { InputBuffer } from './input-buffer.ts';
import type { ParseFileConfig } from './types.ts';
import assert from 'node:assert';
import { tokenize } from './tokenize.ts';
import { ParseError } from './error.ts';
import { Readable } from 'node:stream';
import { ParserContext } from './context.ts';

async function parse(
  filePath: string,
  config?: ParseFileConfig,
): Promise<unknown>;
async function parse(readable: Readable): Promise<unknown>;
async function parse(
  input: string | Readable,
  config: ParseFileConfig = {},
): Promise<unknown> {
  const inputBuffer = new InputBuffer();
  const ctx = new ParserContext();
  if (typeof input === 'string') {
    const filePath = input;
    const minimumFileSize = config.minimumFileSize ?? 1024 * 1024;
    if ((await stat(filePath)).size < minimumFileSize) {
      return JSON.parse((await readFile(filePath)).toString());
    }

    const handle = await open(filePath);
    let eof = false;

    try {
      while (!eof) {
        const { buf, offset, capacity } = inputBuffer.reserve(16 * 1024);
        const { bytesRead } = await handle.read(buf, offset, capacity);
        inputBuffer.commit(bytesRead);
        eof = bytesRead === 0;

        const consumed = tokenize(
          ctx,
          inputBuffer.bytes,
          inputBuffer.length,
          eof,
        );
        ctx.chunkBaseOffset += consumed;
        inputBuffer.shift(consumed);

        if (eof && inputBuffer.length > 0) {
          throw ParseError.truncatedInput(ctx.chunkBaseOffset);
        }
      }
    } finally {
      handle.close();
    }
  } else {
    for await (const chunk of input) {
      inputBuffer.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const consumed = tokenize(ctx, inputBuffer.bytes, inputBuffer.length);
      ctx.chunkBaseOffset += consumed;
      inputBuffer.shift(consumed);
    }

    if (inputBuffer.length > 0) {
      const consumed = tokenize(
        ctx,
        inputBuffer.bytes,
        inputBuffer.length,
        true,
      );
      if (consumed < inputBuffer.length) {
        throw ParseError.truncatedInput(ctx.chunkBaseOffset);
      }
    }
  }

  assert(
    ctx.frames.length === 1,
    `Expected to have a single root frame, found ${ctx.frames.length}`,
  );

  return ctx.frames[0]!.value;
}

export const BigJSON = {
  parse,
};
