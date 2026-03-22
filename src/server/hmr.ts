import fs from "fs";
import path from "path";
import { Request, Response, Router } from "express";
import * as chokidar from "chokidar";
import chalk from "chalk";

export type HMREventType = "reload" | "restart";

export interface HMREvent {
  type: HMREventType;
  /** The URL path that changed, if known */
  path?: string;
  reason?: string;
}

/**
 * Manages Server-Sent Event connections and file watching for hot reload.
 *
 * Each page gets a small injected <script> that opens a connection to
 * `/__xplus_hmr`. When a watched file changes, all connected clients
 * receive an event and reload.
 */
export class HMRServer {
  private clients: Set<Response> = new Set();
  private watcher: chokidar.FSWatcher | null = null;

  // ── Express router ────────────────────────────────────────────────────────

  /**
   * Returns an Express router that handles the SSE endpoint.
   * Mount this BEFORE all page routes.
   */
  router(): Router {
    const router = Router();

    router.get("/__xplus_hmr", (req: Request, res: Response) => {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no"); // nginx
      res.flushHeaders();

      // Keep-alive ping every 15s so proxies don't kill idle connections
      const ping = setInterval(() => {
        res.write(": ping\n\n");
      }, 15_000);

      this.clients.add(res);

      req.on("close", () => {
        clearInterval(ping);
        this.clients.delete(res);
      });
    });

    return router;
  }

  // ── Broadcasting ──────────────────────────────────────────────────────────

  broadcast(event: HMREvent): void {
    const data = JSON.stringify(event);
    const msg = `data: ${data}\n\n`;

    for (const client of this.clients) {
      try {
        client.write(msg);
      } catch {
        // Client disconnected between checks
        this.clients.delete(client);
      }
    }
  }

  get connectionCount(): number {
    return this.clients.size;
  }

  // ── File watching ─────────────────────────────────────────────────────────

  /**
   * Starts watching the project for changes.
   *
   * @param appDir        - app/ directory (page routes)
   * @param componentsDir - components/ directory
   * @param projectRoot   - project root (for api/ handlers and other files)
   * @param configPath    - absolute path to xplus.yml
   * @param onInvalidate  - called when a page cache entry should be cleared
   * @param onReScan      - called when the component registry should be rebuilt
   * @param onRestart     - called when xplus.yml changes (full server restart)
   */
  watch(opts: {
    appDir: string;
    componentsDir: string;
    projectRoot: string;
    configPath: string;
    onInvalidate: (filePath: string) => void;
    onReScan: () => void;
    onRestart: () => void;
  }): void {
    const { appDir, componentsDir, projectRoot, configPath } = opts;

    // Watch everything in the project except .xp/, node_modules, dist
    this.watcher = chokidar.watch(projectRoot, {
      ignored: [/node_modules/, /\.xp[\\/]/, /dist[\\/]/, /\.git[\\/]/],
      ignoreInitial: true,
      persistent: true,
      // Small debounce — editors often write multiple times on save
      awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 },
    });

    this.watcher.on("all", (event, filePath) => {
      const abs = path.resolve(filePath);

      // ── xplus.yml → full restart ─────────────────────────────────────────
      if (abs === path.resolve(configPath)) {
        opts.onRestart();
        this.broadcast({ type: "restart", reason: "xplus.yml changed" });
        return;
      }

      // ── components → re-scan + full page reload ──────────────────────────
      if (abs.startsWith(path.resolve(componentsDir))) {
        opts.onReScan();
        this.broadcast({ type: "reload", reason: "component changed" });
        return;
      }

      // ── app/ .xp pages → invalidate that route + reload ─────────────────
      if (abs.startsWith(path.resolve(appDir)) && abs.endsWith(".xp")) {
        opts.onInvalidate(abs);
        this.broadcast({ type: "reload", path: abs });
        return;
      }

      // ── Everything else (api handlers, CSS, TS, etc.) → reload ───────────
      this.broadcast({
        type: "reload",
        reason: path.relative(projectRoot, abs),
      });
    });
  }

  async close(): Promise<void> {
    await this.watcher?.close();
    for (const client of this.clients) {
      try {
        client.end();
      } catch {}
    }
    this.clients.clear();
  }
}

// ── Client script ─────────────────────────────────────────────────────────────

/**
 * Returns the HMR client script to inject into every served HTML page.
 * Minified inline JS — no external file needed.
 */
export function hmrClientScript(): string {
  return `<script>
(function () {
  var url = '/__xplus_hmr';
  var es;
  var reconnectDelay = 1000;

  function connect() {
    es = new EventSource(url);

    es.onmessage = function (e) {
      try {
        var msg = JSON.parse(e.data);
        if (msg.type === 'reload') {
          window.location.reload();
        } else if (msg.type === 'restart') {
          showOverlay('Server restarting\u2026');
          pollUntilBack();
        }
      } catch {}
    };

    es.onerror = function () {
      es.close();
      setTimeout(connect, reconnectDelay);
    };
  }

  function pollUntilBack() {
    fetch(url, { method: 'HEAD' })
      .then(function (r) {
        if (r.ok) { window.location.reload(); }
        else { setTimeout(pollUntilBack, 800); }
      })
      .catch(function () { setTimeout(pollUntilBack, 800); });
  }

  function showOverlay(msg) {
    var el = document.getElementById('__xplus_hmr_overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = '__xplus_hmr_overlay';
      el.style.cssText = [
        'position:fixed', 'bottom:1rem', 'right:1rem', 'z-index:99999',
        'background:#1e1e2e', 'color:#a78bfa', 'font-family:monospace',
        'font-size:0.75rem', 'padding:0.5rem 0.9rem', 'border-radius:6px',
        'border:1px solid #334155', 'box-shadow:0 4px 12px rgba(0,0,0,.5)',
        'transition:opacity .2s',
      ].join(';');
      document.body.appendChild(el);
    }
    el.textContent = '\u26a1 ' + msg;
  }

  connect();
})();
</script>`;
}
