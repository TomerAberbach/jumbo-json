# jumbo-json

Do you ever find yourself needing to load in some JSON which is just plain too
big? Then you try using a streaming parser and it becomes a headache
trying to find the pieces you need and stitch them together?

Try 🎉`jumbo-json`🎉! The only\* JSON library that will load in
arbitrarily\*\* large JSON files entirely in to memory for you to use without
any headache.

## Why would I use this?

Did you know that there's a maximum string length? This limits how much JSON you
can load up at once. jumbo-json reads straight from the file bytes at a time so
you don't have to worry about that. This also makes it useful on resource
constrained systems where you don't have the RAM available for loading large
chunks of JSON all at once.

## Usage

`JumboJSON.parse` accepts any [`ReadableStream<Uint8Array>`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream), so it works in any JS runtime.

### Parse from a file (Node.js, zero-copy)

Use `FileHandle.readableWebStream()` so the OS writes file bytes directly into
the stream's buffer.

```js
import { JumboJSON } from 'jumbo-json';
import { open } from 'node:fs/promises';

const handle = await open('/path/to/huge.json');
try {
  const data = await JumboJSON.parse(handle.readableWebStream());
} finally {
  await handle.close();
}
```

### Parse from a fetch response (browser / edge)

```js
import { JumboJSON } from 'jumbo-json';

const response = await fetch('/path/to/data.json');
const data = await JumboJSON.parse(response.body);
```

### Parse from a stream

```js
import { JumboJSON } from 'jumbo-json';

const stream = new ReadableStream({
  /* ... */
});
const data = await JumboJSON.parse(stream);
```

---

\* - there's probably others out there

\*\* - within reason. I didn't invent infinite memory
