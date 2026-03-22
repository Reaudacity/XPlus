import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Router, Request, Response } from "express";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ImageOptions {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  widths?: number[]; // srcset breakpoints, e.g. [320, 640, 1280]
  format?: "webp" | "avif" | "original";
  quality?: number;
  class?: string;
  loading?: "lazy" | "eager";
}

// ── Cache ─────────────────────────────────────────────────────────────────────

export class ImageOptimizer {
  private processed = new Map<string, ProcessedImage>();

  constructor(
    private projectRoot: string,
    private cacheDir: string, // .xp/images/
  ) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  // ── Server route ───────────────────────────────────────────────────────────

  /**
   * Express Router that serves optimized images at /__xplus/img/:hash
   */
  createRouter(): Router {
    const router = Router();

    router.get("/__xplus/img/:hash", (req: Request, res: Response) => {
      const entry = [...this.processed.values()].find((p) =>
        Object.values(p.variants).some((v) => v.hash === req.params.hash),
      );

      if (!entry) {
        res.status(404).end();
        return;
      }

      const variant = Object.values(entry.variants).find(
        (v) => v.hash === req.params.hash,
      )!;

      if (!fs.existsSync(variant.cachePath)) {
        res.status(404).end();
        return;
      }

      res.setHeader("Content-Type", `image/${variant.format}`);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.sendFile(variant.cachePath);
    });

    return router;
  }

  // ── HTML generation ────────────────────────────────────────────────────────

  /**
   * Generates an optimized <img> tag for the given options.
   * In server mode: images are processed lazily on first access.
   * In build mode: images are processed eagerly.
   */
  async buildImgTag(opts: ImageOptions, assetsDir: string): Promise<string> {
    const srcAbs = path.resolve(assetsDir, opts.src);

    if (!fs.existsSync(srcAbs)) {
      // Return a plain img tag if the source doesn't exist
      return this.plainImgTag(opts);
    }

    let sharp: typeof import("sharp") | null = null;
    try {
      sharp = require("sharp");
    } catch {
      // sharp not installed — fall back to plain img tag
      return this.plainImgTag(opts);
    }

    const widths = opts.widths ?? ([opts.width].filter(Boolean) as number[]);
    if (widths.length === 0) {
      // No resize — just convert format if needed
      return this.plainImgTag(opts);
    }

    const format = opts.format ?? "webp";
    const quality = opts.quality ?? 80;
    const srcsets: string[] = [];

    for (const w of widths) {
      const hash = this.makeHash(srcAbs, w, format, quality);
      const cachePath = path.join(this.cacheDir, `${hash}.${format}`);

      if (!fs.existsSync(cachePath)) {
        let pipeline = sharp!(srcAbs).resize(w);
        if (format === "webp") pipeline = pipeline.webp({ quality }) as any;
        else if (format === "avif")
          pipeline = (pipeline as any).avif({ quality });
        await pipeline.toFile(cachePath);
      }

      const url = `/__xplus/img/${hash}`;
      srcsets.push(`${url} ${w}w`);

      // Register for the router
      this.registerVariant(srcAbs, hash, cachePath, format);
    }

    const fallbackHash = this.makeHash(
      srcAbs,
      widths[widths.length - 1],
      format,
      quality,
    );
    const fallbackUrl = `/__xplus/img/${fallbackHash}`;

    const attrs: string[] = [
      `src="${fallbackUrl}"`,
      srcsets.length > 1 ? `srcset="${srcsets.join(", ")}"` : "",
      opts.alt !== undefined ? `alt="${opts.alt}"` : `alt=""`,
      opts.width !== undefined ? `width="${opts.width}"` : "",
      opts.height !== undefined ? `height="${opts.height}"` : "",
      opts.class !== undefined ? `class="${opts.class}"` : "",
      `loading="${opts.loading ?? "lazy"}"`,
      `decoding="async"`,
    ].filter(Boolean);

    return `<img ${attrs.join(" ")} />`;
  }

  private plainImgTag(opts: ImageOptions): string {
    const attrs: string[] = [
      `src="${opts.src}"`,
      `alt="${opts.alt ?? ""}"`,
      opts.width ? `width="${opts.width}"` : "",
      opts.height ? `height="${opts.height}"` : "",
      opts.class ? `class="${opts.class}"` : "",
      `loading="${opts.loading ?? "lazy"}"`,
    ].filter(Boolean);
    return `<img ${attrs.join(" ")} />`;
  }

  private makeHash(
    src: string,
    width: number,
    format: string,
    quality: number,
  ): string {
    return crypto
      .createHash("md5")
      .update(`${src}:${width}:${format}:${quality}`)
      .digest("hex")
      .slice(0, 12);
  }

  private registerVariant(
    src: string,
    hash: string,
    cachePath: string,
    format: string,
  ): void {
    if (!this.processed.has(src)) {
      this.processed.set(src, { src, variants: {} });
    }
    this.processed.get(src)!.variants[hash] = { hash, cachePath, format };
  }
}

interface ProcessedImage {
  src: string;
  variants: Record<string, { hash: string; cachePath: string; format: string }>;
}
