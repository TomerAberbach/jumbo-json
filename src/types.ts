export const FrameKind = {
  Root: 0,
  Array: 1,
  Object: 2,
} as const;
export type FrameKind = typeof FrameKind;

export type Frame =
  | {
      kind: FrameKind['Root'];
      value: unknown;
    }
  | {
      kind: FrameKind['Array'];
      value: unknown[];
    }
  | {
      kind: FrameKind['Object'];
      value: Record<string, unknown>;
      pendingKey: string;
    };

export const ParserState = {
  ExpectValue: 0,
  ExpectKeyOrClose: 1,
  ExpectKey: 2,
  ExpectColon: 3,
  ExpectCommaOrClose: 4,
  Number: 5,
  String: 6,
  Done: 7,
} as const;
export type ParserState = typeof ParserState;
