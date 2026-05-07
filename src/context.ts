import type { Frame } from './types.ts';
import { FrameKind, ParserState } from './types.ts';

const decoder = new TextDecoder();

export class ParserContext {
  chunkBaseOffset: number;
  frames: Frame[];
  state: ParserState[keyof ParserState];
  private stringChunks: (Uint8Array | string)[];
  private numberChunks: string[];
  private parsingObjectKey: boolean;

  constructor() {
    this.chunkBaseOffset = 0;
    this.frames = [{ kind: FrameKind.Root, value: undefined }];
    this.state = ParserState.ExpectValue;
    this.stringChunks = [];
    this.numberChunks = [];
    this.parsingObjectKey = false;
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

  startObject() {
    this.frames.push({ kind: FrameKind.Object, value: {}, pendingKey: '' });
    this.state = ParserState.ExpectKeyOrClose;
  }

  endObject() {
    this.commit(this.frames.pop()!.value);
  }

  startNumber() {
    this.numberChunks = [];
    this.state = ParserState.Number;
  }

  addNumberChunk(chunk: string) {
    this.numberChunks.push(chunk);
  }

  getNumberSoFar(): string {
    return this.numberChunks.join('');
  }

  startObjectKey() {
    this.parsingObjectKey = true;
    this.stringChunks = [];
    this.state = ParserState.String;
  }

  startString() {
    this.stringChunks = [];
    this.state = ParserState.String;
  }

  addStringChunk(chunk: string | Uint8Array) {
    this.stringChunks.push(chunk);
  }

  endString(lastChunk: Uint8Array) {
    this.stringChunks.push(lastChunk);
    const result = this.stringChunks
      .map((c) => (typeof c === 'string' ? c : decoder.decode(c)))
      .join('');
    if (this.parsingObjectKey) {
      this.parsingObjectKey = false;
      const frame = this.frames[this.frames.length - 1]!;
      (frame as Extract<Frame, { kind: FrameKind['Object'] }>).pendingKey =
        result;
      this.state = ParserState.ExpectColon;
    } else {
      this.commit(result);
    }
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
        if (frame.pendingKey === '__proto__') {
          // Assigning `__proto__` via normal assignment would modify the
          // protoype instead of adding an own property.
          Object.defineProperty(frame.value, frame.pendingKey, {
            value,
            writable: true,
            enumerable: true,
            configurable: true,
          });
        } else {
          frame.value[frame.pendingKey] = value;
        }
        this.state = ParserState.ExpectCommaOrClose;
        break;
    }
  }
}
