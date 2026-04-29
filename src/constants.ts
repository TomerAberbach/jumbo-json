export const Byte = {
  LeftBrace: 0x7b, // {
  RightBrace: 0x7d, // }
  LeftBracket: 0x5b, // [
  RightBracket: 0x5d, // ]
  Colon: 0x3a, // :
  Comma: 0x2c, // ,

  // String delimiters / Escape
  Quote: 0x22, // "
  Backslash: 0x5c, // \
  Solidus: 0x2f, // /

  // Whitespace (RFC 8259 sec 2)
  Space: 0x20,
  Tab: 0x09, // \t
  Newline: 0x0a, // \n
  CarriageReturn: 0x0d, // \r

  // Number
  Minus: 0x2d, // -
  Plus: 0x2b, // +
  Dot: 0x2e, // .
  Zero: 0x30, // 0
  Nine: 0x39, // 9
  LowerE: 0x65, // e
  UpperE: 0x45, // E

  // Keyword leads
  LowerT: 0x74, // t in true
  LowerF: 0x66, // f in false
  LowerN: 0x6e, // n in null

  // Escape continuations after backslash
  LowerB: 0x62, // b -> backspace
  LowerR: 0x72, // r -> CR
  LowerU: 0x75, // u -> unicode escape
} as const;

export const StringBytes = {
  TrueLE: 0x65757274, // bytes: t r u e
  NullLE: 0x6c6c756e, // bytes: n u l l
  FalsLE: 0x736c6166, // bytes: f a l s
};
