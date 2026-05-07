# jumbo-json

Do you ever find yourself needing to load in some JSON which is just plain too
big? Then you try using a streaming parser and it becomes a headache
trying to find the pieces you need and stitch them together?

Try 🎉`jumbo-json`🎉! The only\* JSON library that will load in
arbitrarily\*\* large JSON files entirely in to memory for you to use without
any headache.

## When should I use this?

V8's string size cap (~512 MB) means `JSON.parse` throws a `RangeError` on
large inputs before it even starts parsing. jumbo-json reads straight from bytes
so that limit doesn't apply.

Below that threshold, `JSON.parse` is roughly 6–10× faster than jumbo-json
because it runs native C++ code rather than a JS tokenizer. jumbo-json handles
this automatically — when the input size is known and small enough, it falls
back to `JSON.parse` for you.

## Usage

jumbo-json exposes two methods:

- **`JumboJSON.parse`**: synchronous, accepts a `string`, `Uint8Array`, or `Iterable<Uint8Array>`
- **`JumboJSON.parseAsync`**:
  asynchronous, accepts a [`ReadableStream<Uint8Array>`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream) or [`Blob`](https://developer.mozilla.org/en-US/docs/Web/API/Blob)

Passing a `Blob` to `parseAsync` is preferred over a stream because [its size is known](https://developer.mozilla.org/en-US/docs/Web/API/Blob/size) ahead of time.

### Parse from a file (Node.js, zero-copy)

Use [`openAsBlob`](https://nodejs.org/api/fs.html#fsopenasblobpath-options) with `parseAsync`:

```js
import { JumboJSON } from 'jumbo-json';
import { openAsBlob } from 'node:fs';

const blob = await openAsBlob('/path/to/huge.json');
const data = await JumboJSON.parseAsync(blob);
```

Or use `readFileSync` with the synchronous `parse`:

```js
import { JumboJSON } from 'jumbo-json';
import { readFileSync } from 'node:fs';

const bytes = readFileSync('/path/to/huge.json');
const data = JumboJSON.parse(bytes);
```

### Parse from a fetch response (browser / edge)

```js
import { JumboJSON } from 'jumbo-json';

const response = await fetch('/path/to/data.json');
const data = await JumboJSON.parseAsync(response.body);
```

### Automatic fallback to `JSON.parse`

When the input size is at or below `streamingThreshold` (default: 512 MB),
`jumbo-json` buffers the input and delegates to `JSON.parse` automatically —
so you can use a single code path regardless of payload size.

If you know the size ahead of time but can't create a `Blob`, pass a `sizeHint`:

```js
import { JumboJSON } from 'jumbo-json';
import { open, stat } from 'node:fs/promises';

const { size } = await stat('/path/to/data.json');
const handle = await open('/path/to/data.json');
try {
  const data = await JumboJSON.parseAsync(handle.readableWebStream(), {
    sizeHint: size,
  });
} finally {
  await handle.close();
}
```

Override `streamingThreshold` to change the cutoff:

```js
// Always use the native parser (never stream)
const data = await JumboJSON.parseAsync(stream, {
  sizeHint: payloadBytes,
  streamingThreshold: Infinity,
});
```

The same `sizeHint` and `streamingThreshold` options work with the synchronous `parse` when passing an `Iterable<Uint8Array>`:

```js
const data = JumboJSON.parse(iterableOfChunks, {
  sizeHint: totalBytes,
  streamingThreshold: Infinity,
});
```

### Parse from a stream

```js
import { JumboJSON } from 'jumbo-json';

const stream = new ReadableStream({
  /* ... */
});
const data = await JumboJSON.parseAsync(stream);
```

---

\* - there's probably others out there

\*\* - within reason. I didn't invent infinite memory
