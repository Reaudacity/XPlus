import fs from "fs";
import path from "path";

export interface XPlusRoute {
  urlPath: string;
  filePath: string;
}

export interface XPlus404Route {
  /** The URL directory this 404 covers, e.g. "/" or "/dashboard" */
  urlScope: string;
  filePath: string;
}

/**
 * Scans a directory recursively for `page.xp` and `404.xp` files.
 *
 * Convention:
 *   app/page.xp           → GET /
 *   app/about/page.xp     → GET /about
 *   app/404.xp            → 404 fallback for /  (and all sub-paths with no closer 404)
 *   app/dashboard/404.xp  → 404 fallback scoped to /dashboard/**
 */
export class XPlusRouter {
  constructor(private rootDir: string) {}

  discoverRoutes(): XPlusRoute[] {
    const routes: XPlusRoute[] = [];
    this.scan(this.rootDir, routes);
    routes.sort((a, b) => b.urlPath.length - a.urlPath.length);
    return routes;
  }

  discover404Routes(): XPlus404Route[] {
    const routes: XPlus404Route[] = [];
    this.scan404(this.rootDir, routes);
    // Sort most-specific (longest scope) first so the server finds the closest match
    routes.sort((a, b) => b.urlScope.length - a.urlScope.length);
    return routes;
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private scan(dir: string, routes: XPlusRoute[]): void {
    if (!fs.existsSync(dir))
      throw new Error(`Router directory does not exist: ${dir}`);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.scan(full, routes);
      } else if (entry.isFile() && entry.name === "page.xp") {
        routes.push({ urlPath: this.toUrlPath(full), filePath: full });
      }
    }
  }

  private scan404(dir: string, routes: XPlus404Route[]): void {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.scan404(full, routes);
      } else if (entry.isFile() && entry.name === "404.xp") {
        routes.push({
          urlScope: this.toUrlPath(path.join(dir, "page.xp")),
          filePath: full,
        });
      }
    }
  }

  private toUrlPath(filePath: string): string {
    const relative = path.relative(this.rootDir, filePath);
    const withoutFile = path.dirname(relative);
    if (withoutFile === ".") return "/";
    return "/" + withoutFile.split(path.sep).join("/");
  }
}
