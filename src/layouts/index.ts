import fs from "fs";
import path from "path";

export interface XPlusLayout {
  /** Absolute path to the layout.xp file */
  filePath: string;
  /**
   * The URL scope this layout covers.
   * "/" = root layout wrapping everything.
   * "/dashboard" = wraps only /dashboard/** routes.
   */
  urlScope: string;
}

/**
 * Discovers all layout.xp files under the app directory.
 *
 * Convention (identical to Next.js):
 *   app/layout.xp            → wraps /  (and all sub-routes)
 *   app/dashboard/layout.xp  → wraps /dashboard/**
 *
 * Returns layouts sorted most-specific first so the closest layout
 * to the page is applied first.
 */
export function discoverLayouts(appDir: string): XPlusLayout[] {
  const layouts: XPlusLayout[] = [];
  scanLayouts(appDir, appDir, layouts);
  layouts.sort((a, b) => b.urlScope.length - a.urlScope.length);
  return layouts;
}

function scanLayouts(dir: string, rootDir: string, acc: XPlusLayout[]): void {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanLayouts(full, rootDir, acc);
    } else if (entry.isFile() && entry.name === "layout.xp") {
      const rel = path.relative(rootDir, dir);
      const urlScope =
        rel === "." || rel === "" ? "/" : "/" + rel.split(path.sep).join("/");
      acc.push({ filePath: full, urlScope });
    }
  }
}

/**
 * Finds the most specific layout that covers a given URL path.
 * Returns null if no layout applies.
 *
 * Example:
 *   layouts: [ /dashboard (specific), / (root) ]
 *   url: /dashboard/users → returns /dashboard layout
 *   url: /about           → returns / layout
 */
export function findLayoutForRoute(
  urlPath: string,
  layouts: XPlusLayout[],
): XPlusLayout | null {
  // Already sorted most-specific first
  for (const layout of layouts) {
    if (layout.urlScope === "/") return layout;
    if (
      urlPath === layout.urlScope ||
      urlPath.startsWith(layout.urlScope + "/")
    ) {
      return layout;
    }
  }
  return null;
}
