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

### Parse from a file

```js
import { JumboJSON } from 'jumbo-json';

const data = await JumboJSON.parse('/path/to/huge.json');
```

Files smaller than 1MB are passed through `JSON.parse` automatically. You can
adjust that threshold:

```js
const data = await JumboJSON.parse('/path/to/file.json', {
  minimumFileSize: 10 * 1024 * 1024, // use streaming parser for files >= 10MB
});
```

### Parse from a stream

```js
import { JumboJSON } from 'jumbo-json';
import { createReadStream } from 'node:fs';

const stream = createReadStream('/path/to/huge.json');
const data = await JumboJSON.parse(stream);
```

---

\* - there's probably others out there

\*\* - within reason. I didn't invent infinite memory
