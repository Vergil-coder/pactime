/** Bounded data-URL cache, including in-flight reads, for the native application picker. */
export class IconCache {
  private entries = new Map<string, { value?: string; bytes: number; retryAt: number }>();
  private pending = new Map<string, Promise<string | undefined>>();
  private waiting: Array<() => void> = [];
  private active = 0;
  private bytes = 0;
  constructor(private readonly read: (path: string) => Promise<string | undefined>, private readonly capacity = 128, private readonly byteLimit = 4 * 1024 * 1024) {}
  cached(path: string): string | undefined { return this.entries.get(path)?.value; }
  async get(path: string): Promise<string | undefined> {
    const cached = this.entries.get(path);
    if (cached && (cached.value || Date.now() < cached.retryAt)) {
      this.entries.delete(path); this.entries.set(path, cached); return cached.value;
    }
    const existing = this.pending.get(path); if (existing) return existing;
    // Icons are optional. Prefer a letter placeholder to an unbounded native-work queue.
    if (this.pending.size >= this.capacity) return undefined;
    const request = this.load(path).finally(() => { this.pending.delete(path); });
    this.pending.set(path, request); return request;
  }
  private async load(path: string): Promise<string | undefined> {
    if (this.active >= 4) await new Promise<void>(resolve => this.waiting.push(resolve));
    else this.active++;
    let value: string | undefined;
    try { value = await this.read(path); } catch { /* Moved or unreadable apps use a placeholder. */ }
    finally { const next = this.waiting.shift(); if (next) next(); else this.active--; }
    const size = value ? Buffer.byteLength(value, 'utf8') : 0;
    const old = this.entries.get(path); if (old) { this.bytes -= old.bytes; this.entries.delete(path); }
    if (size <= this.byteLimit) {
      this.entries.set(path, { value, bytes: size, retryAt: Date.now() + 60_000 }); this.bytes += size;
      while (this.entries.size > this.capacity || this.bytes > this.byteLimit) {
        const key = this.entries.keys().next().value!; this.bytes -= this.entries.get(key)!.bytes; this.entries.delete(key);
      }
    }
    return value;
  }
}
