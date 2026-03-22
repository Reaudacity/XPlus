import path from "path";
import express, { Express, Request, Response, NextFunction } from "express";

import { XPlusConfig } from "../types";
import { NodeRegistry } from "../node";
import { XPlusParser } from "../parser";
import { XPlusRouter, XPlusRoute, XPlus404Route } from "../router";
import { XScriptNode } from "../node/nodes";
import { XPDirectory } from "../xp-dir";
import { XScriptTranspiler } from "../runtime/transpiler";
import { CompiledHandler, runHandler } from "../runtime/runner";
import { RouteCache } from "../cache";
import { ComponentRegistry } from "../components";
import { PluginLoader } from "../plugins";
import { StyleResolver } from "../styles";
import { resolveAssets, createAssetRouter, faviconLinkTag } from "../assets";
import { HMRServer, hmrClientScript } from "./hmr";
import { devErrorOverlay } from "./overlay";
import { xplusplusRouter, xplusplusScript, readSettings } from "./xplusplus";
import { bundleScript } from "../bundler";
import {
  logBanner,
  logReady,
  logRouteTable,
  logXScriptTable,
  logRequest,
  logBuilding,
  logBuilt,
  logCacheInvalidated,
  logError,
  logStartupError,
  logWarn,
  logInfo,
  logSuccess,
  BuildResult,
} from "./logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ServerMode = "development" | "production";

export interface ServerOptions {
  port?: number;
  projectRoot?: string;
  configPath?: string;
  mode?: ServerMode;
}

// ── Server ────────────────────────────────────────────────────────────────────

export class XPlusServer {
  private app: Express;
  private parser: XPlusParser;
  private router: XPlusRouter;
  private registry: NodeRegistry;
  private componentRegistry: ComponentRegistry;
  private xpDir: XPDirectory;
  private transpiler: XScriptTranspiler;
  private cache: RouteCache;
  private hmr: HMRServer;
  private plugins: PluginLoader;
  private styles: StyleResolver;
  private projectRoot: string;
  private appDir: string;
  private mode: ServerMode;

  constructor(
    private config: XPlusConfig,
    options: ServerOptions = {},
  ) {
    this.projectRoot = options.projectRoot ?? process.cwd();
    this.appDir = path.resolve(this.projectRoot, config.router.directory);
    this.mode = options.mode ?? "development";
    this.app = express();
    this.registry = new NodeRegistry();
    this.componentRegistry = new ComponentRegistry();
    this.parser = new XPlusParser(this.registry, this.componentRegistry);
    this.router = new XPlusRouter(this.appDir);
    this.xpDir = new XPDirectory(this.projectRoot);
    this.transpiler = new XScriptTranspiler(this.xpDir, this.projectRoot);
    this.cache = new RouteCache();
    this.hmr = new HMRServer();
    this.styles = new StyleResolver();
    this.plugins = new PluginLoader(
      config,
      this.projectRoot,
      this.xpDir.pluginsDir,
    );
  }

  async start(port = 3000, configPath = "xplus.yml"): Promise<void> {
    const isDev = this.mode === "development";

    logBanner(this.config.name);
    if (isDev) logInfo("Mode: development");

    this.xpDir.initialize();

    // ── Plugins ────────────────────────────────────────────────────────────
    await this.loadPlugins();

    // ── Components ─────────────────────────────────────────────────────────
    const componentsDir = path.resolve(
      this.projectRoot,
      this.config.components.directory,
    );
    const componentCount = this.componentRegistry.scan(componentsDir);
    if (componentCount > 0) {
      logInfo(
        `Loaded ${componentCount} component(s) from ${this.config.components.directory}/`,
      );
    }
    await this.plugins.onComponentsReady(this.componentRegistry);

    // ── Middleware ─────────────────────────────────────────────────────────
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // HMR SSE endpoint — must be first
    if (isDev) this.app.use(this.hmr.router());

    // X++ settings API (dev only)
    if (isDev) this.app.use(xplusplusRouter());

    // Style file routes
    this.app.use(this.styles.createRouter());

    // Assets (serves assets/ at /)
    const assetInfo = resolveAssets(this.projectRoot);
    this.app.use(createAssetRouter(assetInfo));
    if (!assetInfo.defaultFavicon) {
      logInfo(`Assets served from assets/`);
    }

    // ── Route discovery ────────────────────────────────────────────────────
    let routes: XPlusRoute[];
    try {
      routes = this.router.discoverRoutes();
    } catch (err: any) {
      logStartupError(err.message);
      process.exit(1);
    }
    const routes404 = this.router.discover404Routes();

    // ── Phase 1: xscript API routes ────────────────────────────────────────
    const xscriptEntries = await this.registerXScriptRoutes(routes);

    // ── Phase 2: page routes ───────────────────────────────────────────────
    this.registerPageRoutes(routes, assetInfo);

    // ── Phase 3: 404 catch-all ─────────────────────────────────────────────
    this.register404Handler(routes404, assetInfo);

    // ── Phase 4: file watcher (dev only) ───────────────────────────────────
    if (isDev) {
      this.hmr.watch({
        appDir: this.appDir,
        componentsDir,
        projectRoot: this.projectRoot,
        configPath: path.resolve(this.projectRoot, configPath),
        onInvalidate: (filePath) => {
          this.cache.invalidateByFile(filePath);
          const route = routes.find(
            (r) => path.resolve(r.filePath) === filePath,
          );
          if (route) logCacheInvalidated(route.urlPath);
        },
        onReScan: () => {
          logInfo("Component changed — re-scanning");
          this.componentRegistry.scan(componentsDir);
          this.cache.clear();
        },
        onRestart: () => {
          logWarn("xplus.yml changed — restarting");
          setTimeout(() => process.exit(0), 100);
        },
      });
    }

    // ── Ready ──────────────────────────────────────────────────────────────
    logRouteTable(routes);
    logXScriptTable(xscriptEntries);
    logReady(port, routes, xscriptEntries.length);

    this.app.listen(port);
  }

  // ── Plugin loading ─────────────────────────────────────────────────────────

  private async loadPlugins(): Promise<void> {
    if (!this.config.plugins.length) return;
    await this.plugins.load();
    await this.plugins.setup(
      (name, msg) => logInfo(`[${name}] ${msg}`),
      (name, msg) => logWarn(`[${name}] ${msg}`),
    );
    for (const p of this.plugins.loaded) logSuccess(`Plugin: ${p.name}`);
  }

  // ── xscript routes ─────────────────────────────────────────────────────────

  private async registerXScriptRoutes(
    routes: XPlusRoute[],
  ): Promise<Array<{ method: string; routePath: string; file: string }>> {
    const registered = new Set<string>();
    const entries: Array<{ method: string; routePath: string; file: string }> =
      [];

    for (const route of routes) {
      let doc;
      try {
        doc = this.parser.parseFile(route.filePath, this.config);
      } catch {
        continue;
      }

      for (const node of doc.collectXPlusNodes()) {
        if (node.getNodeInfo().name !== "xscript") continue;
        try {
          const compiled = await XScriptNode.prepareHandler(
            node,
            this.transpiler,
            this.projectRoot,
          );
          const key = `${compiled.method}:${compiled.routePath}`;
          if (registered.has(key)) continue;
          registered.add(key);

          const method = compiled.method.toLowerCase() as keyof Express;
          (this.app as any)[method](
            compiled.routePath,
            async (req: Request, res: Response, next: NextFunction) => {
              const t = Date.now();
              await runHandler(compiled, req, res, next);
              logRequest(
                compiled.method,
                compiled.routePath,
                res.statusCode,
                Date.now() - t,
                "built",
              );
            },
          );

          const attrs = node.getNodeData().attributes as any;
          entries.push({
            method: compiled.method,
            routePath: compiled.routePath,
            file: attrs.file ?? "",
          });
        } catch (err: any) {
          logWarn(`xscript failed: ${err.message}`);
        }
      }
    }

    return entries;
  }

  // ── Page routes ────────────────────────────────────────────────────────────

  private registerPageRoutes(
    routes: XPlusRoute[],
    assetInfo: ReturnType<typeof resolveAssets>,
  ): void {
    const isDev = this.mode === "development";

    for (const route of routes) {
      this.app.get(route.urlPath, async (req: Request, res: Response) => {
        const reqStart = Date.now();

        // Cache hit
        const cached = this.cache.get(route.urlPath);
        if (cached) {
          res
            .setHeader("Content-Type", "text/html; charset=utf-8")
            .send(cached.html);
          logRequest(
            req.method,
            route.urlPath,
            200,
            Date.now() - reqStart,
            "cached",
          );
          return;
        }

        // Build
        logBuilding(route.urlPath);
        const buildStart = Date.now();

        try {
          const doc = this.parser.parseFile(route.filePath, this.config);
          const head = this.buildHeadExtras(doc, assetInfo, route.filePath);
          await this.plugins.transformDocument(doc, route.urlPath);
          let html = doc.buildHTML(head);
          html = await this.inlineClientScripts(html, route.filePath);
          html = await this.plugins.transformHTML(html, route.urlPath);
          // Inject X++ overlay + HMR client (dev only)
          if (isDev) {
            html = html.replace(
              "</body>",
              `${xplusplusScript()}\n${hmrClientScript()}\n</body>`,
            );
          }

          const buildMs = Date.now() - buildStart;
          this.cache.set(route.urlPath, {
            html,
            filePath: path.resolve(route.filePath),
            builtAt: Date.now(),
            buildMs,
          });

          logBuilt(route.urlPath, buildMs);
          res.setHeader("Content-Type", "text/html; charset=utf-8").send(html);
          logRequest(
            req.method,
            route.urlPath,
            200,
            Date.now() - reqStart,
            "built",
          );
        } catch (err: any) {
          logError(route.urlPath, err.message);

          const html = isDev
            ? devErrorDocument(route.urlPath, err)
            : productionErrorPage();

          res
            .status(500)
            .setHeader("Content-Type", "text/html; charset=utf-8")
            .send(html);
          logRequest(
            req.method,
            route.urlPath,
            500,
            Date.now() - reqStart,
            "error",
          );
        }
      });
    }
  }

  // ── 404 handler ────────────────────────────────────────────────────────────

  private register404Handler(
    routes404: XPlus404Route[],
    assetInfo: ReturnType<typeof resolveAssets>,
  ): void {
    this.app.use(async (req: Request, res: Response) => {
      if (isBrowserNoise(req.path)) {
        res.status(404).end();
        return;
      }

      const reqStart = Date.now();
      const segments = req.path.replace(/\/$/, "").split("/").filter(Boolean);
      let matched: XPlus404Route | null = null;

      for (let i = segments.length; i >= 0; i--) {
        const scope = i === 0 ? "/" : "/" + segments.slice(0, i).join("/");
        const found = routes404.find((r) => r.urlScope === scope);
        if (found) {
          matched = found;
          break;
        }
      }

      if (matched) {
        try {
          const doc = this.parser.parseFile(matched.filePath, this.config);
          const head = this.buildHeadExtras(doc, assetInfo, matched.filePath);
          let html = doc.buildHTML(head);
          if (this.mode === "development") {
            html = html.replace(
              "</body>",
              `${xplusplusScript()}\n${hmrClientScript()}\n</body>`,
            );
          }
          res
            .status(404)
            .setHeader("Content-Type", "text/html; charset=utf-8")
            .send(html);
          logRequest(req.method, req.path, 404, Date.now() - reqStart, "built");
          return;
        } catch (err: any) {
          logError(req.path, err.message);
        }
      }

      res.status(404).send(builtin404Page(req.path));
      logRequest(req.method, req.path, 404, Date.now() - reqStart, "error");
    });
  }

  // ── Head extras ────────────────────────────────────────────────────────────

  /**
   * Builds the string injected into <head> for a page:
   *   - Favicon link (from assets/)
   *   - Page stylesheet (link tag in server mode)
   */
  private buildHeadExtras(
    doc: import("../document/index").XDocument,
    assetInfo: ReturnType<typeof resolveAssets>,
    filePath: string,
  ): string {
    const lines: string[] = [];

    // Favicon
    // Favicon — always present (project file or built-in default)
    lines.push(`    ${faviconLinkTag(assetInfo)}`);

    // Page stylesheet — server mode: register route + inject <link>
    if (doc.pageStylePath) {
      if (!require("fs").existsSync(doc.pageStylePath)) {
        logWarn(`Style file not found: ${doc.pageStylePath}`);
      } else {
        const hash = this.styles.register(doc.pageStylePath);
        lines.push(`    ${this.styles.linkTag(hash)}`);
      }
    }

    return lines.join("\n");
  }

  // ── Client scripts ─────────────────────────────────────────────────────────

  private async inlineClientScripts(
    html: string,
    pageFilePath: string,
  ): Promise<string> {
    const pageDir = path.dirname(pageFilePath);
    const re = /<script\s+src="([^"]+)"><\/script>/g;
    const replacements: { from: string; to: string }[] = [];
    let match: RegExpExecArray | null;

    while ((match = re.exec(html)) !== null) {
      const [original, src] = match;
      try {
        const { code } = await bundleScript(src, pageDir);
        replacements.push({ from: original, to: `<script>${code}</script>` });
      } catch (err: any) {
        logWarn(`Failed to bundle "${src}": ${err.message}`);
      }
    }

    for (const { from, to } of replacements) html = html.replace(from, to);
    return html;
  }
}

// ── Noise filter ──────────────────────────────────────────────────────────────

function isBrowserNoise(urlPath: string): boolean {
  const EXACT = new Set([
    "/favicon.ico",
    "/favicon.png",
    "/robots.txt",
    "/sitemap.xml",
    "/installHook.js",
    "/installHook.js.map",
    "/__webpack_hmr",
  ]);
  const PREFIX = [
    "/.well-known/",
    "/__webpack",
    "/apple-touch-icon",
    "/apple-app-site-association",
  ];
  const SUFFIX = [".js.map", ".css.map", ".ts.map"];

  return (
    EXACT.has(urlPath) ||
    PREFIX.some((p) => urlPath.startsWith(p)) ||
    SUFFIX.some((s) => urlPath.endsWith(s))
  );
}

// ── Error pages ───────────────────────────────────────────────────────────────

/** Dev mode: shows the error overlay — but only if showErrorOverlay is enabled in ~/.xp/settings.json */
function devErrorDocument(route: string, err: Error): string {
  const { devErrorOverlay } =
    require("./overlay") as typeof import("./overlay");
  const { xplusplusScript } =
    require("./xplusplus") as typeof import("./xplusplus");
  const { hmrClientScript } = require("./hmr") as typeof import("./hmr");

  // Check the setting server-side — far more reliable than an async client fetch
  // because the JS engine runs the overlay script before any fetch completes.
  const showOverlay = readSettings().showErrorOverlay;

  const overlayHTML = showOverlay
    ? devErrorOverlay({ route, message: err.message, stack: err.stack })
    : "";

  // Always inject X++ so the developer can toggle the overlay setting even
  // from the error page, and HMR so the page auto-reloads when the error is fixed.
  return [
    "<!DOCTYPE html>",
    `<html><head><meta charset="UTF-8"><title>Error \u2014 ${route}</title></head>`,
    `<body>`,
    overlayHTML,
    xplusplusScript(),
    hmrClientScript(),
    `</body></html>`,
  ].join("\n");
}

/** Production mode: generic "something went wrong" — no error details exposed */
function productionErrorPage(): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Error</title>
<style>body{font-family:monospace;background:#0f0f11;color:#94a3b8;
display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.wrap{text-align:center}.code{font-size:4rem;font-weight:700;color:#1e1e2e}
p{margin-top:.5rem;color:#475569}</style></head>
<body><div class="wrap"><div class="code">500</div>
<p>Something went wrong.</p></div></body></html>`;
}

/** Built-in 404 fallback */
function builtin404Page(urlPath: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>404 — Not Found</title>
<style>*{box-sizing:border-box;margin:0;padding:0}
body{font-family:monospace;background:#0f0f11;color:#e2e8f0;
display:flex;align-items:center;justify-content:center;min-height:100vh}
.wrap{text-align:center;padding:2rem;max-width:420px}
.code{font-size:6rem;font-weight:700;color:#1e1e2e;letter-spacing:-.05em;line-height:1}
.label{font-size:.85rem;color:#a78bfa;letter-spacing:.15em;text-transform:uppercase;margin:.75rem 0 1.5rem}
.path{background:#1e1e2e;color:#64748b;padding:.4rem .8rem;border-radius:4px;
font-size:.8rem;border:1px solid #334155}
.hint{margin-top:2rem;font-size:.75rem;color:#475569}
.hint a{color:#6366f1;text-decoration:none}</style></head>
<body><div class="wrap">
<div class="code">404</div>
<div class="label">Page not found</div>
<div class="path">${urlPath}</div>
<p class="hint">Add <code>404.xp</code> to your app directory to customise this page.<br>
<a href="/">← Back home</a></p>
</div></body></html>`;
}
