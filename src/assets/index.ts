import fs from "fs";
import path from "path";
import { Router, Request, Response } from "express";
import serveStatic from "serve-static";

// ── Default favicon ───────────────────────────────────────────────────────────

/**
 * The default X+ favicon — the fixed X+ logo SVG, base64-encoded.
 * Served at /favicon.ico when the developer has not placed a favicon in assets/.
 * Override by adding any favicon.* file to your project's assets/ directory.
 */
const DEFAULT_FAVICON_B64 =
  "PHN2ZyB3aWR0aD0iNTAwIiBoZWlnaHQ9IjUwMCIgdmlld0JveD0iMCAwIDY4MCA2ODAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3QgeD0iOTAiIHk9IjkwIiB3aWR0aD0iNTAwIiBoZWlnaHQ9IjUwMCIgcng9IjcyIiBmaWxsPSIjMDkwOTBmIi8+PHJlY3QgeD0iMTc4IiB5PSIzMjYiIHdpZHRoPSIyNjAiIGhlaWdodD0iNTAiIHJ4PSI5IiBmaWxsPSIjZjBlZWZmIiB0cmFuc2Zvcm09InJvdGF0ZSg0NSwzMDgsMzUxKSIvPjxyZWN0IHg9IjE3OCIgeT0iMzI2IiB3aWR0aD0iMjYwIiBoZWlnaHQ9IjUwIiByeD0iOSIgZmlsbD0iI2YwZWVmZiIgdHJhbnNmb3JtPSJyb3RhdGUoLTQ1LDMwOCwzNTEpIi8+PGNpcmNsZSBjeD0iMzA4IiBjeT0iMzUxIiByPSIxMSIgZmlsbD0iIzA5MDkwZiIvPjxyZWN0IHg9IjQzNSIgeT0iMjAzIiB3aWR0aD0iNjIiIGhlaWdodD0iMTQiIHJ4PSI0IiBmaWxsPSIjYTc4YmZhIi8+PHJlY3QgeD0iNDU5IiB5PSIxNzkiIHdpZHRoPSIxNCIgaGVpZ2h0PSI2MiIgcng9IjQiIGZpbGw9IiNhNzhiZmEiLz48Y2lyY2xlIGN4PSI0NjYiIGN5PSIyMTAiIHI9IjUiIGZpbGw9IiM3YzNhZWQiLz48L3N2Zz4=";

export const DEFAULT_FAVICON_SVG: string = Buffer.from(
  DEFAULT_FAVICON_B64,
  "base64",
).toString("utf-8");

// ── Types ─────────────────────────────────────────────────────────────────────

const FAVICON_NAMES = [
  "favicon.ico",
  "favicon.png",
  "favicon.svg",
  "favicon.jpg",
  "favicon.webp",
];

export interface AssetInfo {
  dir: string;
  publicPath: string;
  faviconFile?: string;
  /** True when no favicon exists in assets/ — the default X+ logo is served */
  defaultFavicon: boolean;
}

// ── Resolution ────────────────────────────────────────────────────────────────

/**
 * Scans the assets directory and returns metadata.
 * Always succeeds — defaultFavicon is true when no project favicon is found.
 */
export function resolveAssets(
  projectRoot: string,
  assetsDir = "assets",
): AssetInfo {
  const dir = path.resolve(projectRoot, assetsDir);

  if (!fs.existsSync(dir)) {
    return { dir, publicPath: "/", defaultFavicon: true };
  }

  const files = fs.readdirSync(dir);
  const faviconFile = files.find((f) =>
    FAVICON_NAMES.includes(f.toLowerCase()),
  );

  return { dir, publicPath: "/", faviconFile, defaultFavicon: !faviconFile };
}

// ── Router ────────────────────────────────────────────────────────────────────

/**
 * Returns an Express Router that:
 *   - When no project favicon: serves the default X+ SVG at /favicon.ico
 *   - Serves everything in assets/ at the root path (assets/logo.png → /logo.png)
 */
export function createAssetRouter(info: AssetInfo): Router {
  const router = Router();

  if (info.defaultFavicon) {
    const faviconBuf = Buffer.from(DEFAULT_FAVICON_B64, "base64");
    router.get("/favicon.ico", (_req: Request, res: Response) => {
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(faviconBuf);
    });
  }

  if (fs.existsSync(info.dir)) {
    router.use(serveStatic(info.dir, { index: false }));
  }

  return router;
}

// ── Head tag ──────────────────────────────────────────────────────────────────

/**
 * Returns the <link rel="icon"> tag for a page's <head>.
 * Uses the project favicon if present, otherwise the default at /favicon.ico.
 */
export function faviconLinkTag(info: AssetInfo): string {
  if (info.defaultFavicon) {
    return '<link rel="icon" type="image/svg+xml" href="/favicon.ico" />';
  }

  const ext = path.extname(info.faviconFile!).toLowerCase();
  const type =
    ext === ".svg"
      ? "image/svg+xml"
      : ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : "image/x-icon";

  return `<link rel="icon" type="${type}" href="/${info.faviconFile}" />`;
}

// ── Build helpers ─────────────────────────────────────────────────────────────

/**
 * For static builds: returns the default favicon as a data URI so the
 * <link> tag works without needing a server route.
 */
export function defaultFaviconDataURI(): string {
  return `data:image/svg+xml;base64,${DEFAULT_FAVICON_B64}`;
}

/**
 * Writes the default favicon SVG to a destination file.
 * Used by `xplus build` to copy the default favicon into dist/.
 */
export function writeDefaultFavicon(destPath: string): void {
  fs.writeFileSync(destPath, Buffer.from(DEFAULT_FAVICON_B64, "base64"));
}
