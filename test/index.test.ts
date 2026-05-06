import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import { JumboJSON } from '../src/index.ts';

const strToStream = (
  text: string,
  chunkSize: number = 4,
): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(text);
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= encoded.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoded.subarray(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
};

const parseStream = (text: string, chunkSize: number = 4): Promise<unknown> =>
  JumboJSON.parse(strToStream(text, chunkSize));

const multiMethodTest = (
  testName: string,
  input: string | string[],
  testFn: (parse: () => Promise<unknown>, input: string) => Promise<unknown>,
) => {
  if (typeof input === 'string') {
    test(testName, async () => {
      await testFn(() => parseStream(input), input);
    });
  } else {
    for (const i of input) {
      const inputName = i.length > 5 ? `${i.slice(0, 5)}...` : i;
      test(`${testName} (${inputName})`, async () => {
        await testFn(() => parseStream(i, input.length / 2), i);
        await testFn(() => parseStream(i, input.length / 3), i);
      });
    }
  }
};

describe('null', () => {
  multiMethodTest(
    'parses null',
    ['null', '  null', 'null  ', ' null '],
    async (parse) => {
      assert.equal(await parse(), null);
    },
  );

  multiMethodTest('truncated null throws', 'nul', async (parse) => {
    await assert.rejects(parse(), /Unexpected end of input/i);
  });
});

describe('booleans', () => {
  multiMethodTest(
    'true',
    ['true', ' true', 'true ', ' true '],
    async (parse) => {
      assert.equal(await parse(), true);
    },
  );

  multiMethodTest(
    'false',
    ['false', ' false', 'false ', ' false '],
    async (parse) => {
      assert.equal(await parse(), false);
    },
  );
});

describe('strings', () => {
  multiMethodTest(
    'basic strings',
    [
      JSON.stringify(''),
      JSON.stringify('a'),
      JSON.stringify(' a'),
      JSON.stringify('abcdef'),
      JSON.stringify('"'),
      JSON.stringify(' "'),
      JSON.stringify('" '),
      JSON.stringify(' " '),
      JSON.stringify('\n'),
    ],
    async (parse, input) => {
      const value = await parse();
      assert.equal(typeof value, 'string');
      assert.equal(JSON.stringify(value), input);
    },
  );

  multiMethodTest(
    'simple escape sequences',
    [
      JSON.stringify('"'),
      JSON.stringify('\\'),
      JSON.stringify('/'),
      JSON.stringify('\b'),
      JSON.stringify('\f'),
      JSON.stringify('\n'),
      JSON.stringify('\r'),
      JSON.stringify('\t'),
    ],
    async (parse, input) => {
      const value = await parse();
      assert.equal(typeof value, 'string');
      assert.equal(JSON.stringify(value), input);
    },
  );

  multiMethodTest(
    'multiple escape sequences',
    [
      JSON.stringify('\n\t\r'),
      JSON.stringify('\\"\\"\\"'),
      JSON.stringify('a\nb\tc'),
    ],
    async (parse, input) => {
      const value = await parse();
      assert.equal(typeof value, 'string');
      assert.equal(value, JSON.parse(input));
    },
  );

  multiMethodTest(
    'unicode escape sequences',
    [
      '"\\u0041"',
      '"\\u00e9"',
      '"\\u4e2d"',
      '"\\u0000"',
      '"\\uFFFF"',
      '"a\\u0041b"',
    ],
    async (parse, input) => {
      const value = await parse();
      assert.equal(typeof value, 'string');
      assert.equal(value, JSON.parse(input));
    },
  );

  multiMethodTest(
    'unicode surrogate pairs',
    ['"\\uD83D\\uDE00"', '"\\uD83C\\uDF08"'],
    async (parse, input) => {
      const value = await parse();
      assert.equal(typeof value, 'string');
      assert.equal(value, JSON.parse(input));
    },
  );

  test('unicode escape spanning chunk boundary', async () => {
    for (let chunkSize = 1; chunkSize <= 7; chunkSize++) {
      const value = await JumboJSON.parse(strToStream('"\\u0041"', chunkSize));
      assert.equal(value, 'A', `failed at chunkSize=${chunkSize}`);
    }
  });

  test('surrogate pair spanning chunk boundary', async () => {
    for (let chunkSize = 1; chunkSize <= 11; chunkSize++) {
      const value = await JumboJSON.parse(
        strToStream('"\\uD83D\\uDE00"', chunkSize),
      );
      assert.equal(value, '😀', `failed at chunkSize=${chunkSize}`);
    }
  });

  multiMethodTest(
    'unescaped control character throws',
    ['"\x01"', '"\x09"', '"\x1f"'],
    async (parse) => {
      await assert.rejects(parse(), /valid string character/i);
    },
  );

  multiMethodTest(
    'unterminated string throws',
    ['"hello', '"hello\\n'],
    async (parse) => {
      await assert.rejects(parse(), /Unexpected end of input/i);
    },
  );

  multiMethodTest('invalid escape sequence throws', '"\\q"', async (parse) => {
    await assert.rejects(parse(), /valid escape character/i);
  });
});

describe('literals', () => {
  multiMethodTest(
    'cannot have multiple sequential literals',
    'true true',
    async (parse) => {
      await assert.rejects(parse(), /Expected input to end at byte/);
    },
  );
});

describe('numbers', () => {
  multiMethodTest(
    'integers',
    ['0', '1', '-1', '123', '-456', '9007199254740991', '-9007199254740991'],
    async (parse, input) => {
      assert.equal(await parse(), JSON.parse(input));
    },
  );

  multiMethodTest(
    'floats',
    ['0.0', '0.5', '-1.5', '3.14159', '-0.001'],
    async (parse, input) => {
      assert.equal(await parse(), JSON.parse(input));
    },
  );

  multiMethodTest(
    'scientific notation',
    ['1e10', '1E10', '1e+10', '1e-10', '-1.5e+3', '2.5E-4'],
    async (parse, input) => {
      assert.equal(await parse(), JSON.parse(input));
    },
  );

  multiMethodTest('negative zero', ['-0', '-0.0'], async (parse) => {
    const value = await parse();
    assert.ok(Object.is(value, -0), 'expected -0');
  });

  test('number spanning chunk boundary', async () => {
    for (let chunkSize = 1; chunkSize <= 6; chunkSize++) {
      const value = await JumboJSON.parse(strToStream('123.45', chunkSize));
      assert.equal(value, 123.45, `failed at chunkSize=${chunkSize}`);
    }
  });

  multiMethodTest('leading zero is invalid', ['01', '01.5'], async (parse) => {
    await assert.rejects(parse(), /valid number/i);
  });

  multiMethodTest('leading dot is invalid', '.5', async (parse) => {
    await assert.rejects(parse(), /valid JSON character/i);
  });

  multiMethodTest('trailing dot is invalid', ['1.', '-1.'], async (parse) => {
    await assert.rejects(parse(), /valid number/i);
  });

  multiMethodTest(
    'bare exponent is invalid',
    ['1e', '1e+', '1e-'],
    async (parse) => {
      await assert.rejects(parse(), /valid number/i);
    },
  );

  multiMethodTest('double minus is invalid', '--1', async (parse) => {
    await assert.rejects(parse(), /valid number/i);
  });
});

describe('objects', () => {
  multiMethodTest(
    'empty object',
    ['{}', '{ }', ' {}', '{} '],
    async (parse) => {
      const value = await parse();
      assert.deepEqual(value, {});
    },
  );

  multiMethodTest(
    'single key-value pair',
    ['{"a":1}', '{ "a" : 1 }', '{"key":"value"}'],
    async (parse, input) => {
      assert.deepEqual(await parse(), JSON.parse(input));
    },
  );

  multiMethodTest(
    'multiple key-value pairs',
    ['{"a":1,"b":2,"c":3}', '{"x":true,"y":false,"z":null}'],
    async (parse, input) => {
      assert.deepEqual(await parse(), JSON.parse(input));
    },
  );

  multiMethodTest(
    'nested objects',
    ['{"a":{"b":{"c":1}}}', '{"outer":{"inner":{}}}'],
    async (parse, input) => {
      assert.deepEqual(await parse(), JSON.parse(input));
    },
  );

  multiMethodTest(
    'mixed value types',
    ['{"s":"hello","n":42,"f":3.14,"b":true,"nil":null,"arr":[1,2]}'],
    async (parse, input) => {
      assert.deepEqual(await parse(), JSON.parse(input));
    },
  );

  multiMethodTest(
    'objects inside arrays',
    ['[{"a":1},{"b":2}]', '[{},[{}]]'],
    async (parse, input) => {
      assert.deepEqual(await parse(), JSON.parse(input));
    },
  );

  multiMethodTest(
    'escaped characters in keys',
    ['{"key\\nwith\\nnewlines":1}', '{"\\u0041":2}'],
    async (parse, input) => {
      assert.deepEqual(await parse(), JSON.parse(input));
    },
  );

  multiMethodTest('missing colon throws', '{"a" 1}', async (parse) => {
    await assert.rejects(parse(), /':'/);
  });

  multiMethodTest(
    'missing key quotes throws',
    ['{a:1}', '{1:2}'],
    async (parse) => {
      await assert.rejects(parse(), /'"'/);
    },
  );

  multiMethodTest('trailing comma throws', '{"a":1,}', async (parse) => {
    await assert.rejects(parse(), /'"'/);
  });

  multiMethodTest('missing closing brace throws', '{"a":1', async (parse) => {
    await assert.rejects(parse(), /Unexpected end of input/i);
  });
});

describe('arrays', () => {
  multiMethodTest('empty array', ['[]', '[ ]', ' []', '[] '], async (parse) => {
    const value = await parse();
    if (!Array.isArray(value)) {
      throw new Error(`Expected array, found ${JSON.stringify(value)}`);
    }
    assert.equal(JSON.stringify(value), '[]');
  });

  multiMethodTest('single element array', '[ true ]', async (parse) => {
    const value = await parse();
    if (!Array.isArray(value)) {
      throw new Error(`Expected array, found ${JSON.stringify(value)}`);
    }
    assert.equal(JSON.stringify(value), '[true]');
  });

  multiMethodTest(
    'multi element array',
    '[ true, false, null ]',
    async (parse) => {
      const value = await parse();
      if (!Array.isArray(value)) {
        throw new Error(`Expected array, found ${JSON.stringify(value)}`);
      }
      assert.equal(JSON.stringify(value), '[true,false,null]');
    },
  );

  multiMethodTest(
    'nested arrays',
    '[ [true, [false, [null]] ] ]',
    async (parse) => {
      const value = await parse();
      if (!Array.isArray(value)) {
        throw new Error(`Expected array, found ${JSON.stringify(value)}`);
      }
      assert.equal(JSON.stringify(value), '[[true,[false,[null]]]]');
    },
  );
});

describe('round-trip', () => {
  test('arbitrary JSON round-trips through the streaming parser', async () => {
    await fc.assert(
      fc.asyncProperty(fc.json(), async (jsonString) => {
        const result = await parseStream(jsonString);
        assert.deepStrictEqual(result, JSON.parse(jsonString));
      }),
    );
  });
});
