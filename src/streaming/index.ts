import { Request, Response } from "express";
import vm from "vm";
import { createRequire } from "module";
import path from "path";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StreamRegion {
  id: string;
  /** Absolute path to the handler file that produces streamed content */
  file: string;
  /** Interval in ms for polling handlers (0 = single push) */
  interval: number;
}

// ── Client script ─────────────────────────────────────────────────────────────

/**
 * Returns the inline <script> injected into pages that contain <xstream> nodes.
 * Connects to /__xplus/stream/:id and replaces the placeholder element content.
 */
export function streamClientScript(regions: StreamRegion[]): string {
  if (regions.length === 0) return "";

  const ids = JSON.stringify(regions.map((r) => r.id));

  return `<script>
(function () {
  var ids = ${ids};
  ids.forEach(function (id) {
    var el = document.getElementById('__xstream_' + id);
    if (!el) return;
    var es = new EventSource('/__xplus/stream/' + id);
    es.onmessage = function (e) {
      try {
        var data = JSON.parse(e.data);
        if (data.html !== undefined) el.innerHTML = data.html;
        if (data.done) es.close();
      } catch {}
    };
    es.onerror = function () { es.close(); };
  });
})();
</script>`;
}

/**
 * Returns an SSE Express handler for a stream region.
 * The handler file should export: async function* stream(req) { yield "<p>...</p>"; }
 * OR:                             export default async function(req) { return "<p>...</p>"; }
 */
export function createStreamHandler(region: StreamRegion, projectRoot: string) {
  return async (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (html: string, done = false) => {
      const data = JSON.stringify({ html, done });
      res.write(`data: ${data}\n\n`);
    };

    try {
      const localRequire = createRequire(region.file);
      delete require.cache[require.resolve(region.file)];
      const mod = require(region.file);
      const handler = mod.default ?? mod;

      if (typeof handler !== "function") {
        send("<span>xstream: handler must export a function</span>", true);
        res.end();
        return;
      }

      const result = await handler(req);

      // Async generator: yield chunks as they arrive
      if (result && typeof result[Symbol.asyncIterator] === "function") {
        for await (const chunk of result as AsyncIterable<string>) {
          send(String(chunk));
        }
        send("", true);
      } else {
        // Single value
        send(String(result), true);
      }
    } catch (err: any) {
      send(
        `<span style="color:red">xstream error: ${err.message}</span>`,
        true,
      );
    }

    res.end();
  };
}
