export class ParseError extends Error {
  readonly offset: number;

  private constructor(offset: number, message: string) {
    super(message);
    this.offset = offset;
  }

  static expected(
    offset: number,
    expected: string | number,
    actual: string | number | Uint8Array,
  ): ParseError {
    if (typeof expected === 'number') {
      expected = String.fromCharCode(expected);
    }
    if (typeof actual === 'number') {
      actual = String.fromCharCode(actual);
    }
    if (actual instanceof Uint8Array) {
      actual = new TextDecoder().decode(actual);
    }
    return new ParseError(
      offset,
      `Expected '${expected}' at byte ${offset}, found '${actual}'`,
    );
  }

  static expectedEndOfInput(offset: number): ParseError {
    return new ParseError(
      offset,
      `Expected input to end at byte ${offset} but found non-whitespace character`,
    );
  }

  static unexpectedEndOfInput(offset: number): ParseError {
    return new ParseError(offset, `Unexpected end of input at byte ${offset}`);
  }

  static truncatedInput(offset: number): ParseError {
    return new ParseError(offset, `Truncated input at byte ${offset}`);
  }
}
