import type { Frame } from './types.ts';
import { FrameKind, ParserState } from './types.ts';

export class ParserContext {
  chunkBaseOffset: number;
  frames: Frame[];
  state: ParserState[keyof ParserState];

  constructor() {
    this.chunkBaseOffset = 0;
    this.frames = [{ kind: FrameKind.Root, value: undefined }];
    this.state = ParserState.ExpectValue;
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
        break;

      case FrameKind.Object:
        frame.value[frame.pendingKey] = value;
        break;
    }
  }
}
