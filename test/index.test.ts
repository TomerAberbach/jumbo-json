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
  return BigJSON.parse(filePath);
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
      testFn(() => parse(input));
    } else {
      for (const i of input) {
        testFn(() => parse(i));
      }
    }
  });
  test(`[stream] ${testName}`, () => {
    if (typeof input === 'string') {
      testFn(() => parseStream(input));
    } else {
      for (const i of input) {
        testFn(() => parseStream(i, input.length / 2));
        testFn(() => parseStream(i, input.length / 3));
      }
    }
  });
};

describe('literals', () => {
  multiMethodTest(
    'null',
    ['null', '  null', 'null  ', ' null '],
    async (parse) => {
      assert.strictEqual(await parse(), null);
    },
  );

  multiMethodTest(
    'true',
    ['true', ' true', 'true ', ' true '],
    async (parse) => {
      assert.strictEqual(await parse(), true);
    },
  );

  multiMethodTest(
    'false',
    ['false', ' false', 'false ', ' false '],
    async (parse) => {
      assert.strictEqual(await parse(), false);
    },
  );

  multiMethodTest('truncated null throws', 'nul', async () => {
    await assert.rejects(parseStream('nul', 1), /Unexpected end of input/i);
  });
});
