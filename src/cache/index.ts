import * as chokidar from "chokidar";
import path from "path";

export interface CacheEntry {
  html: string;
  filePath: string;
  builtAt: number; // Date.now()
  buildMs: number; // how long the build took
}

export type CacheStatus = "hit" | "miss" | "stale";

/**
 * In-memory route cache with file-watcher invalidation.
 *
 * Keys are URL paths (e.g. "/", "/about").
 * Entries are invalidated automatically when their source .xp file changes.
 */
export class RouteCache {
  private store = new Map<string, CacheEntry>();
  private watcher: chokidar.FSWatcher | null = null;

  // ── Read ──────────────────────────────────────────────────────────────────

  get(urlPath: string): CacheEntry | null {
    return this.store.get(urlPath) ?? null;
  }

  has(urlPath: string): boolean {
    return this.store.has(urlPath);
  }

  status(urlPath: string): CacheStatus {
    return this.store.has(urlPath) ? "hit" : "miss";
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  set(urlPath: string, entry: CacheEntry): void {
    this.store.set(urlPath, entry);
  }

  invalidate(urlPath: string): void {
    this.store.delete(urlPath);
  }

  invalidateByFile(filePath: string): void {
    for (const [urlPath, entry] of this.store) {
      if (entry.filePath === filePath) {
        this.store.delete(urlPath);
        return;
      }
    }
  }

  clear(): void {
    this.store.clear();
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  size(): number {
    return this.store.size;
  }

  entries(): IterableIterator<[string, CacheEntry]> {
    return this.store.entries();
  }

  // ── File watcher ──────────────────────────────────────────────────────────

  /**
   * Watches `watchDir` for changes to .xp files.
   * When a file changes, its corresponding cache entry is invalidated so the
   * next request triggers a fresh build.
   */
  watch(watchDir: string): void {
    if (this.watcher) return;

    this.watcher = chokidar.watch(path.join(watchDir, "**/*.xp"), {
      ignoreInitial: true,
      persistent: true,
    });

    this.watcher.on("change", (filePath: string) => {
      this.invalidateByFile(path.resolve(filePath));
    });

    this.watcher.on("unlink", (filePath: string) => {
      this.invalidateByFile(path.resolve(filePath));
    });
  }

  async close(): Promise<void> {
    await this.watcher?.close();
    this.watcher = null;
  }
}
