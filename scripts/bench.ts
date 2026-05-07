import { Session } from 'node:inspector/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as fc from 'fast-check';
import { JumboJSON } from '../src/index.ts';

const encoder = new TextEncoder();

function* strToIterable(text: string, chunkSize: number): Iterable<Uint8Array> {
  const encoded = encoder.encode(text);
  for (let i = 0; i < encoded.length; i += chunkSize) {
    yield encoded.subarray(i, i + chunkSize);
  }
}

const chunkedJsonStrings = fc.sample(
  fc
    .tuple(fc.jsonValue(), fc.integer({ min: 1, max: 50 }))
    .map(([value, chunkSize]) =>
      strToIterable(JSON.stringify(value), chunkSize),
    ),
  { seed: 42, numRuns: 50_000 },
);

const session = new Session();
session.connect();
await session.post('Profiler.enable');
await session.post('Profiler.start');

for (const chunkedJsonString of chunkedJsonStrings) {
  JumboJSON.parse(chunkedJsonString);
}

const { profile } = await session.post('Profiler.stop');
session.disconnect();

mkdirSync('profiles', { recursive: true });
writeFileSync('profiles/bench.cpuprofile', JSON.stringify(profile));
