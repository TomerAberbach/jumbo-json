export type ParseFileConfig = {
  /**
   * Use `JSON.parse` for any files smaller than this value in bytes.
   * Defaults to 1MB (TODO: Find out what is actually a good value)
   */
  minimumFileSize?: number;
};

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
  ExpectColon: 2,
  ExpectCommaOrClose: 3,
  Number: 4,
  String: 5,
  Escape: 6,
} as const;
export type ParserState = typeof ParserState;
