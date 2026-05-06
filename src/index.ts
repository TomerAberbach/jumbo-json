import { InputBuffer } from './input-buffer.ts';
import { ParserState } from './types.ts';
import { tokenize } from './tokenize.ts';
import { ParseError } from './error.ts';
import { ParserContext } from './context.ts';

const DEFAULT_NATIVE_THRESHOLD = 512 * 1024 * 1024;

export interface ParseOptions {
  /** Byte length of the stream, when known ahead of time. Used to decide whether to fall back to native `JSON.parse`. */
  sizeHint?: number;
  /** Inputs at or below this byte size are parsed with native `JSON.parse` instead of the streaming parser. Defaults to 512 MiB. */
  streamingThreshold?: number;
}

/**
 * Parses a JSON document.
 *
 * For large inputs, a custom streaming parser is used to avoid materializing
 * the entire document in memory at once. Inputs at or below `streamingThreshold`
 * (default 512 MiB) are handed off to native `JSON.parse` for better performance.
 */
async function parse<T = unknown>(input: string): Promise<T>;
async function parse<T = unknown>(
  input: Blob,
  options?: Pick<ParseOptions, 'streamingThreshold'>,
): Promise<T>;
async function parse<T = unknown>(
  input: ReadableStream<Uint8Array>,
  options?: ParseOptions,
): Promise<T>;
async function parse<T = unknown>(
  input: string | Blob | ReadableStream<Uint8Array>,
  options?: ParseOptions,
): Promise<T> {
  if (typeof input === 'string') {
    return JSON.parse(input);
  }

  const { sizeHint, streamingThreshold = DEFAULT_NATIVE_THRESHOLD } =
    options ?? {};

  if (input instanceof Blob) {
    if (input.size <= streamingThreshold) {
      return JSON.parse(await input.text());
    }
    return parse<T>(input.stream());
  }

  if (sizeHint !== undefined && sizeHint <= streamingThreshold) {
    const chunks: Uint8Array[] = [];
    const reader = input.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const combined = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder().decode(combined));
  }

  const inputBuffer = new InputBuffer();
  const ctx = new ParserContext();
  const reader = input.getReader();

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
    throw new Error(
      `Expected to have a single root frame, found ${ctx.frames.length}`,
    );
  }

  return ctx.frames[0]!.value as T;
}

export const JumboJSON = {
  parse,
};
