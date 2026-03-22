import fs from "fs";
import path from "path";

export interface XPlusRoute {
  urlPath: string;
  filePath: string;
  /** True if this route contains dynamic [param] segments */
  dynamic: boolean;
  /** Map of param names, e.g. { id: "123" } at runtime */
  params: string[]; // param names extracted from path, e.g. ["id", "slug"]
}

export interface XPlus404Route {
  urlScope: string;
  filePath: string;
}

/**
 * Scans the app directory recursively for page.xp, 404.xp files.
 *
 * Dynamic routes:
 *   app/blog/[slug]/page.xp  →  /blog/:slug  (Express)  →  /blog/[slug]  (display)
 *   app/user/[id]/[tab]/page.xp  →  /user/:id/:tab
 *
 * Static routes take precedence over dynamic ones at the same level.
 */
export class XPlusRouter {
  constructor(private rootDir: string) {}

  discoverRoutes(): XPlusRoute[] {
    const routes: XPlusRoute[] = [];
    this.scan(this.rootDir, routes);

    // Sort: static routes first, then dynamic — most specific first within each group
    routes.sort((a, b) => {
      if (a.dynamic !== b.dynamic) return a.dynamic ? 1 : -1;
      return b.urlPath.length - a.urlPath.length;
    });

    return routes;
  }

  discover404Routes(): XPlus404Route[] {
    const routes: XPlus404Route[] = [];
    this.scan404(this.rootDir, routes);
    routes.sort((a, b) => b.urlScope.length - a.urlScope.length);
    return routes;
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private scan(dir: string, routes: XPlusRoute[]): void {
    if (!fs.existsSync(dir))
      throw new Error(`Router directory does not exist: ${dir}`);

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.scan(full, routes);
      } else if (entry.isFile() && entry.name === "page.xp") {
        const { urlPath, params } = this.toRoute(full);
        routes.push({
          urlPath,
          filePath: full,
          dynamic: params.length > 0,
          params,
        });
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
        const rel = path.relative(this.rootDir, dir);
        const urlScope =
          rel === "." || rel === "" ? "/" : "/" + rel.split(path.sep).join("/");
        routes.push({ urlScope, filePath: full });
      }
    }
  }

  private toRoute(filePath: string): { urlPath: string; params: string[] } {
    const relative = path.relative(this.rootDir, filePath);
    const withoutFile = path.dirname(relative);
    const segments = withoutFile === "." ? [] : withoutFile.split(path.sep);

    const params: string[] = [];
    const expressSegments = segments.map((seg) => {
      const match = seg.match(/^\[(.+)\]$/);
      if (match) {
        params.push(match[1]);
        return `:${match[1]}`; // Express dynamic param
      }
      return seg;
    });

    const urlPath =
      expressSegments.length === 0 ? "/" : "/" + expressSegments.join("/");
    return { urlPath, params };
  }
}
