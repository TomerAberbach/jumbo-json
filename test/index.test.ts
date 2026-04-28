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

const strToReadable = (text: string, chunkSize: number): Readable => {
  const chunks: Buffer[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(Buffer.from(text.slice(i, i + chunkSize)));
  }
  return Readable.from(chunks);
};

const parseStream = (text: string, chunkSize: number): Promise<unknown> =>
  BigJSON.parseFromReadable(strToReadable(text, chunkSize));

describe('parse (file)', () => {
  test('null', async () => assert.strictEqual(await parse('null'), null));
  test('true', async () => assert.strictEqual(await parse('true'), true));
  test('false', async () => assert.strictEqual(await parse('false'), false));
  test('null with whitespace', async () =>
    assert.strictEqual(await parse(' \t\r\nnull\n\r\t '), null));
});

describe('parseFromReadable (cross-chunk)', () => {
  for (const chunkSize of [1, 2, 3, 4, 5]) {
    test(`null with chunkSize=${chunkSize}`, async () => {
      assert.strictEqual(await parseStream('null', chunkSize), null);
    });
    test(`true with chunkSize=${chunkSize}`, async () => {
      assert.strictEqual(await parseStream('true', chunkSize), true);
    });
    test(`false with chunkSize=${chunkSize}`, async () => {
      assert.strictEqual(await parseStream('false', chunkSize), false);
    });
  }

  test('truncated null throws', async () => {
    await assert.rejects(parseStream('nul', 1), /EOF|truncated/i);
  });
});
