import path from "path";
import * as esbuild from "esbuild";
import fs from "fs";
import { Express, Request, Response, NextFunction } from "express";

// ── Types ─────────────────────────────────────────────────────────────────────

export type XPlusMiddlewareFn = (
  req: Request,
  res: Response,
  next: NextFunction,
) => void | Promise<void>;

// ── Loader ────────────────────────────────────────────────────────────────────

/**
 * Loads middleware files listed in xplus.yml `middleware:` and registers them
 * on the Express app IN ORDER before any page or xscript routes.
 *
 * Each middleware file must export a default function matching Express middleware
 * signature: (req, res, next) => void.
 *
 * TypeScript files are transpiled to a temp location via esbuild before being required.
 */
export class MiddlewareLoader {
  constructor(
    private projectRoot: string,
    private cacheDir: string, // .xp/middleware/
  ) {}

  async apply(app: Express, specifiers: string[]): Promise<void> {
    for (const specifier of specifiers) {
      const fn = await this.load(specifier);
      app.use(fn);
    }
  }

  private async load(specifier: string): Promise<XPlusMiddlewareFn> {
    const absPath = path.resolve(this.projectRoot, specifier);

    if (!fs.existsSync(absPath)) {
      throw new Error(`Middleware file not found: ${absPath}`);
    }

    let requirePath = absPath;

    if (absPath.endsWith(".ts")) {
      const outPath = path.join(
        this.cacheDir,
        path.basename(absPath).replace(/\.ts$/, ".js"),
      );
      fs.mkdirSync(path.dirname(outPath), { recursive: true });

      const source = fs.readFileSync(absPath, "utf-8");
      const result = await esbuild.transform(source, {
        loader: "ts",
        format: "cjs",
        platform: "node",
        target: "node18",
        sourcefile: absPath,
      });
      fs.writeFileSync(outPath, result.code, "utf-8");
      requirePath = outPath;
    }

    delete require.cache[require.resolve(requirePath)];
    const mod = require(requirePath);
    const fn = mod.default ?? mod;

    if (typeof fn !== "function") {
      throw new Error(
        `Middleware at "${specifier}" must export a function, got ${typeof fn}`,
      );
    }

    return fn as XPlusMiddlewareFn;
  }
}
