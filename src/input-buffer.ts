export class InputBuffer {
  private _buf: Buffer;
  private _len: number;

  constructor(capacity = 64 * 1024) {
    this._buf = Buffer.allocUnsafe(capacity);
    this._len = 0;
  }

  /**
   * Number of bytes currently buffered
   */
  get length(): number {
    return this._len;
  }

  /**
   * A view of the buffered bytes
   */
  get bytes(): Buffer {
    return this._buf;
  }

  /**
   * Append a chunk
   */
  push(chunk: Buffer): void {
    this.ensureCapacity(this._len + chunk.byteLength);
    chunk.copy(this._buf, this._len);
    this._len += chunk.byteLength;
  }

  /**
   * Reserves `bytes` number of bytes at the tail. Should be paired with `commit`.
   * @param bytes Number of bytes to reserve
   * @returns The underlying buffer and measurements for easy integration
   */
  reserve(bytes: number): { buf: Buffer; offset: number; capacity: number } {
    this.ensureCapacity(this._len + bytes);
    return {
      buf: this._buf,
      offset: this._len,
      capacity: this._buf.byteLength - this._len,
    };
  }

  /**
   * Commits `n` number of bytes
   * @param n Number of bytes to mark as used
   */
  commit(n: number): void {
    this._len += n;
  }

  /**
   * Discard the first `n` bytes from the queue.
   * @param n Number of bytes to discard
   */
  shift(n: number): void {
    if (n <= 0) {
      return;
    }
    if (n >= this._len) {
      this._len = 0;
      return;
    }
    this._buf.copy(this._buf, 0, n, this._len);
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

    const newBuffer = Buffer.allocUnsafe(nextCapacity);
    this._buf.copy(newBuffer, 0, 0, this._len);
    this._buf = newBuffer;
  }
}
