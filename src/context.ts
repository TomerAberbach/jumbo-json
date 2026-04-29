import type { Frame } from './types.ts';
import { FrameKind, ParserState } from './types.ts';

export class ParserContext {
  chunkBaseOffset: number;
  frames: Frame[];
  state: ParserState[keyof ParserState];
  string: {
    chunks: Buffer[];
    hasEscapes: boolean;
  };

  constructor() {
    this.chunkBaseOffset = 0;
    this.frames = [{ kind: FrameKind.Root, value: undefined }];
    this.state = ParserState.ExpectValue;
    this.string = {
      chunks: [],
      hasEscapes: false,
    };
  }

  get isNotInRoot() {
    return this.frames[this.frames.length - 1]?.kind !== FrameKind.Root;
  }

  get isInObject() {
    return this.frames[this.frames.length - 1]?.kind === FrameKind.Object;
  }

  get isInArray() {
    return this.frames[this.frames.length - 1]?.kind === FrameKind.Array;
  }

  startArray() {
    this.frames.push({ kind: FrameKind.Array, value: [] });
    this.state = ParserState.ExpectValue;
  }

  endArray() {
    this.commit(this.frames.pop()!.value);
  }

  startString(index: number) {
    this.string.chunks = [];
    this.string.hasEscapes = false;
    this.state = ParserState.String;
  }

  endString(lastChunk: Buffer) {
    this.string.chunks.push(lastChunk);
    this.commit(Buffer.concat(this.string.chunks).toString('utf8'));
  }

  commit(value: unknown) {
    const frame = this.frames[this.frames.length - 1]!;
    switch (frame.kind) {
      case FrameKind.Root:
        frame.value = value;
        this.state = ParserState.Done;
        break;

      case FrameKind.Array:
        frame.value.push(value);
        this.state = ParserState.ExpectCommaOrClose;
        break;

      case FrameKind.Object:
        frame.value[frame.pendingKey] = value;
        this.state = ParserState.ExpectCommaOrClose;
        break;
    }
  }
}
