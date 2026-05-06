export class InputBuffer {
  private _buf: Uint8Array;
  private _len: number;

  constructor(capacity = 64 * 1024) {
    this._buf = new Uint8Array(capacity);
    this._len = 0;
  }

  get length(): number {
    return this._len;
  }

  get bytes(): Uint8Array {
    return this._buf;
  }

  push(chunk: Uint8Array): void {
    this.ensureCapacity(this._len + chunk.byteLength);
    this._buf.set(chunk, this._len);
    this._len += chunk.byteLength;
  }

  shift(n: number): void {
    if (n <= 0) {
      return;
    }
    if (n >= this._len) {
      this._len = 0;
      return;
    }
    this._buf.copyWithin(0, n, this._len);
    this._len -= n;
  }

  private ensureCapacity(capacity: number): void {
    if (capacity <= this._buf.byteLength) {
      return;
    }

    let nextCapacity = this._buf.byteLength;
    while (nextCapacity < capacity) {
      nextCapacity *= 2;
    }

    const newBuffer = new Uint8Array(nextCapacity);
    newBuffer.set(this._buf.subarray(0, this._len));
    this._buf = newBuffer;
  }
}
