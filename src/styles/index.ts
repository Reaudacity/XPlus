import fs from "fs";
import crypto from "crypto";
import { Router } from "express";

export type StyleMode = "link" | "inline";

export interface ResolvedStyle {
  /** Short hash used as the route key */
  hash: string;
  /** Absolute path to the CSS file */
  filePath: string;
  /** Raw CSS content */
  css: string;
}

/**
 * Manages CSS files referenced by `style=` attributes.
 *
 * Dev/prod server  → registers GET routes at `/__xplus/styles/<hash>.css`
 *                    and injects `<link rel="stylesheet">` tags.
 *                    The CSS is served as a file so the browser can cache it
 *                    and DevTools shows a proper source.
 *
 * Build (static)   → reads the CSS, optionally processes it through PostCSS
 *                    + Tailwind if available, and inlines it as `<style>`.
 */
export class StyleResolver {
  private styles = new Map<string, ResolvedStyle>();

  // ── Registration ───────────────────────────────────────────────────────────

  /**
   * Registers a CSS file and returns its hash key.
   * Safe to call multiple times with the same path — returns the same hash.
   */
  register(cssPath: string): string {
    // Check if already registered by path
    for (const [hash, style] of this.styles) {
      if (style.filePath === cssPath) return hash;
    }

    const css = fs.readFileSync(cssPath, "utf-8");
    const hash = crypto
      .createHash("md5")
      .update(cssPath)
      .digest("hex")
      .slice(0, 8);
    this.styles.set(hash, { hash, filePath: cssPath, css });
    return hash;
  }

  // ── Server mode ────────────────────────────────────────────────────────────

  /**
   * Returns an Express Router that serves each registered CSS file
   * at `/__xplus/styles/<hash>.css`.
   */
  createRouter(): Router {
    const router = Router();

    router.get("/__xplus/styles/:hash.css", (req, res) => {
      const style = this.styles.get(req.params.hash);
      if (!style) {
        res.status(404).end();
        return;
      }

      // Re-read on each request in dev so edits are reflected immediately
      const css = fs.existsSync(style.filePath)
        ? fs.readFileSync(style.filePath, "utf-8")
        : style.css;

      res.setHeader("Content-Type", "text/css; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.send(css);
    });

    return router;
  }

  /**
   * Returns the HTML `<link>` tag to inject for a registered style hash.
   */
  linkTag(hash: string): string {
    return `<link rel="stylesheet" href="/__xplus/styles/${hash}.css" />`;
  }

  // ── Build mode ─────────────────────────────────────────────────────────────

  /**
   * Returns the CSS for a file as an inline `<style>` block,
   * optionally processed through PostCSS + Tailwind if available.
   */
  async inlineTag(cssPath: string, htmlContext?: string): Promise<string> {
    const raw = fs.readFileSync(cssPath, "utf-8");
    const css = await this.processCSS(raw, cssPath, htmlContext);
    return `<style>\n${css}\n</style>`;
  }

  /**
   * Tries to run PostCSS + Tailwind over the CSS.
   * If neither is installed, returns the raw CSS unchanged.
   */
  private async processCSS(
    css: string,
    filePath: string,
    htmlContext = "",
  ): Promise<string> {
    try {
      const postcss = require("postcss");
      const tailwind = require("tailwindcss");

      const hasTailwindDirectives = /@import "tailwindcss";/.test(css);

      if (!hasTailwindDirectives) {
        // Plain CSS — just return as-is (PostCSS without plugins = no-op)
        return css;
      }

      const result = await postcss([
        tailwind({ content: [{ raw: htmlContext, extension: "html" }] }),
      ]).process(css, { from: filePath });

      return result.css;
    } catch {
      // PostCSS or Tailwind not installed — return raw CSS
      return css;
    }
  }
}
