import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { BigJSON } from '../src/index.ts';

const dir = await mkdtemp(join(tmpdir(), 'big-json-'));
let counter = 0;

after(() => rm(dir, { recursive: true, force: true }));

const parse = async (text: string): Promise<unknown> => {
  const filePath = join(dir, `input-${counter++}.json`);
  await writeFile(filePath, text);
  return BigJSON.parse(filePath, { minimumFileSize: 1 });
};

const strToReadable = (text: string, chunkSize: number = 4): Readable => {
  const chunks: Buffer[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(Buffer.from(text.slice(i, i + chunkSize)));
  }
  return Readable.from(chunks);
};

const parseStream = (text: string, chunkSize: number = 4): Promise<unknown> =>
  BigJSON.parse(strToReadable(text, chunkSize));

const multiMethodTest = (
  testName: string,
  input: string | string[],
  testFn: (parse: () => Promise<unknown>) => Promise<unknown>,
) => {
  test(`[file]   ${testName}`, async () => {
    if (typeof input === 'string') {
      await testFn(() => parse(input));
    } else {
      for (const i of input) {
        await testFn(() => parse(i));
      }
    }
  });
  test(`[stream] ${testName}`, async () => {
    if (typeof input === 'string') {
      await testFn(() => parseStream(input));
    } else {
      for (const i of input) {
        await testFn(() => parseStream(i, input.length / 2));
        await testFn(() => parseStream(i, input.length / 3));
      }
    }
  });
};

describe('literals', () => {
  multiMethodTest(
    'null',
    ['null', '  null', 'null  ', ' null '],
    async (parse) => {
      assert.equal(await parse(), null);
    },
  );

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

  multiMethodTest('truncated null throws', 'nul', async (parse) => {
    await assert.rejects(parse(), /Unexpected end of input/i);
  });

  multiMethodTest(
    'cannot have multiple sequential literals',
    'true true',
    async (parse) => {
      await assert.rejects(parse(), /Expected input to end at byte/);
    },
  );
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
