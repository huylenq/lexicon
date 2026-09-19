/** Share short-lived shell reads, including concurrent callers. Mutations invalidate both variants. */
export class ShellCache<T> {
  private entries = new Map<boolean, { pending: Promise<T>; expires: number; loading: boolean }>();
  constructor(private ttl = 100, private now = Date.now) {}
  clear() { this.entries.clear(); }
  read(archived: boolean, load: () => Promise<T>, fresh = false): Promise<T> {
    const existing = this.entries.get(archived);
    if (existing && (existing.loading || (!fresh && existing.expires > this.now()))) return existing.pending;
    const entry = { pending: Promise.resolve().then(load), expires: 0, loading: true };
    this.entries.set(archived, entry);
    entry.pending = entry.pending.then(value => { entry.loading = false; entry.expires = this.now() + this.ttl; return value; }, error => {
      if (this.entries.get(archived) === entry) this.entries.delete(archived);
      throw error;
    });
    return entry.pending;
  }
}
