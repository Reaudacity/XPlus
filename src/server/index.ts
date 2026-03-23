import path from "path";
import fs from "fs";
import express, { Express, Request, Response, NextFunction } from "express";

import { XPlusConfig } from "../types";
import { NodeRegistry } from "../node";
import { XPlusParser } from "../parser";
import { XPlusRouter, XPlusRoute, XPlus404Route } from "../router";
import { XScriptNode } from "../node/nodes/xscript";
import { XDataCollector } from "../node/nodes/xdata";
import { XStreamElement } from "../node/nodes/xstream";
import { XImageElement } from "../node/nodes/ximage";
import { Xi18nElement } from "../node/nodes/xi18n";
import { XPDirectory } from "../xp-dir";
import { XScriptTranspiler } from "../runtime/transpiler";
import { CompiledHandler, runHandler } from "../runtime/runner";
import { RouteCache } from "../cache";
import { ComponentRegistry } from "../components";
import { PluginLoader } from "../plugins";
import { StyleResolver } from "../styles";
import { resolveAssets, createAssetRouter, faviconLinkTag } from "../asset";
import { HMRServer, hmrClientScript } from "./hmr";
import { xplusplusRouter, xplusplusScript, readSettings } from "./xplusplus";
import { bundleScript } from "../bundler";
import { watchEnv, loadEnv, getPublicEnv } from "../env";
import { discoverLayouts, findLayoutForRoute } from "../layouts";
import { MiddlewareLoader } from "../middleware";
import { I18nLoader, createI18nMiddleware } from "../i18n";
import { ImageOptimizer } from "../image";
import {
  streamClientScript,
  createStreamHandler,
  StreamRegion,
} from "../streaming";
import { SLOT_PLACEHOLDER } from "../node/nodes/xslot";
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
} from "./logger";

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
  private images: ImageOptimizer;
  private i18n: I18nLoader;
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
    this.images = new ImageOptimizer(this.projectRoot, this.xpDir.imagesDir);
    this.i18n = new I18nLoader(config.i18n, this.projectRoot);
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

    // ── Environment variables ────────────────────────────────────────────────
    const envWatch = watchEnv(this.projectRoot, () => {
      logInfo(".env changed — reloading");
      this.cache.clear();
    });
    logInfo(`Loaded .env (${envWatch.keys.size} variable(s))`);

    // ── Plugins ──────────────────────────────────────────────────────────────
    await this.loadPlugins();

    // ── Components ───────────────────────────────────────────────────────────
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

    // ── i18n ─────────────────────────────────────────────────────────────────
    this.i18n.load();
    if (this.config.i18n.locales.length > 1) {
      logInfo(
        `i18n: ${this.config.i18n.locales.join(", ")} (default: ${this.config.i18n.defaultLocale})`,
      );
    }

    // ── Express middleware ────────────────────────────────────────────────────
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // i18n locale detection
    this.app.use(createI18nMiddleware(this.i18n));

    // HMR SSE + X++ settings (dev only)
    if (isDev) {
      this.app.use(this.hmr.router());
      this.app.use(xplusplusRouter());
    }

    // Style file routes, image routes
    this.app.use(this.styles.createRouter());
    this.app.use(this.images.createRouter());

    // Assets (serves assets/ at /)
    const assetInfo = resolveAssets(this.projectRoot);
    if (assetInfo) this.app.use(createAssetRouter(assetInfo));

    // Developer-declared middleware from xplus.yml
    if (this.config.middleware.length > 0) {
      const mwLoader = new MiddlewareLoader(
        this.projectRoot,
        this.xpDir.middlewareDir,
      );
      await mwLoader.apply(this.app, this.config.middleware);
      logInfo(`Applied ${this.config.middleware.length} middleware file(s)`);
    }

    // ── Routes ───────────────────────────────────────────────────────────────
    let routes: XPlusRoute[];
    try {
      routes = this.router.discoverRoutes();
    } catch (err: any) {
      logStartupError(err.message);
      process.exit(1);
    }

    const routes404 = this.router.discover404Routes();
    const layouts = discoverLayouts(this.appDir);
    if (layouts.length > 0) {
      logInfo(`Found ${layouts.length} layout(s)`);
    }

    // Phase 1: xscript API + xstream SSE routes
    const xscriptEntries = await this.registerXScriptRoutes(routes);
    await this.registerStreamRoutes(routes);

    // Phase 2: page routes
    this.registerPageRoutes(routes, assetInfo, layouts);

    // Phase 3: 404 catch-all
    this.register404Handler(routes404, assetInfo);

    // Phase 4: file watchers (dev only)
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

  // ── xstream SSE routes ─────────────────────────────────────────────────────

  private async registerStreamRoutes(routes: XPlusRoute[]): Promise<void> {
    const registered = new Set<string>();

    for (const route of routes) {
      let doc;
      try {
        doc = this.parser.parseFile(route.filePath, this.config);
      } catch {
        continue;
      }

      const streamNodes = doc.collectByType(XStreamElement);
      for (const node of streamNodes) {
        const id = node.getStreamId();
        const file = node.getStreamFile();
        if (!file || registered.has(id)) continue;
        registered.add(id);

        const absFile = path.resolve(this.projectRoot, file);
        if (!fs.existsSync(absFile)) {
          logWarn(`xstream "${id}": file not found: ${file}`);
          continue;
        }

        const region: StreamRegion = {
          id,
          file: absFile,
          interval: node.getInterval(),
        };

        this.app.get(
          `/__xplus/stream/${id}`,
          createStreamHandler(region, this.projectRoot),
        );
      }
    }
  }

  // ── Page routes ────────────────────────────────────────────────────────────

  private registerPageRoutes(
    routes: XPlusRoute[],
    assetInfo: ReturnType<typeof resolveAssets>,
    layouts: ReturnType<typeof discoverLayouts>,
  ): void {
    const isDev = this.mode === "development";

    for (const route of routes) {
      this.app.get(
        route.urlPath,
        async (req: Request & { locale?: string }, res: Response) => {
          const reqStart = Date.now();

          // Build a cache key that includes locale and params
          const locale = req.locale ?? this.i18n.defaultLocale();
          const cacheKey = `${locale}:${route.urlPath}:${JSON.stringify(req.params)}`;

          // Cache hit
          const cached = this.cache.get(cacheKey);
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

          logBuilding(route.urlPath);
          const buildStart = Date.now();

          try {
            const doc = this.parser.parseFile(route.filePath, this.config);

            // Attach runtime context to the document
            doc.routeParams = req.params as Record<string, string>;
            doc.locale = locale;

            // Resolve xdata nodes
            await this.resolveDataNodes(doc);

            // Resolve xi18n nodes
            this.resolveI18nNodes(doc, locale);

            // Resolve ximage nodes
            await this.resolveImageNodes(doc, assetInfo);

            // Build head extras
            const head = this.buildHeadExtras(doc, assetInfo, route.filePath);

            await this.plugins.transformDocument(doc, route.urlPath);

            let html = doc.buildHTML(head);
            html = await this.inlineClientScripts(html, route.filePath);
            html = await this.plugins.transformHTML(html, route.urlPath);

            // Apply layout if one exists for this route
            html = await this.applyLayout(
              html,
              route.urlPath,
              layouts,
              assetInfo,
            );

            // Inject streaming client script if page has xstream nodes
            const streamNodes = doc.collectByType(XStreamElement);
            if (streamNodes.length > 0) {
              const regions = streamNodes.map((n) => ({
                id: n.getStreamId(),
                file: n.getStreamFile(),
                interval: n.getInterval(),
              }));
              html = html.replace(
                "</body>",
                `${streamClientScript(regions)}\n</body>`,
              );
            }

            if (isDev) {
              html = html.replace(
                "</body>",
                `${xplusplusScript()}\n${hmrClientScript()}\n</body>`,
              );
            }

            // Always inject public env vars as window.__xenv — server-only vars are excluded
            html = injectPublicEnv(html);

            const buildMs = Date.now() - buildStart;
            this.cache.set(cacheKey, {
              html,
              filePath: path.resolve(route.filePath),
              builtAt: Date.now(),
              buildMs,
            });

            logBuilt(route.urlPath, buildMs);
            res
              .setHeader("Content-Type", "text/html; charset=utf-8")
              .send(html);
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
        },
      );
    }
  }

  // ── Layout application ─────────────────────────────────────────────────────

  private async applyLayout(
    pageHTML: string,
    urlPath: string,
    layouts: ReturnType<typeof discoverLayouts>,
    assetInfo: ReturnType<typeof resolveAssets>,
  ): Promise<string> {
    const layout = findLayoutForRoute(urlPath, layouts);
    if (!layout) return pageHTML;

    try {
      const layoutDoc = this.parser.parseLayoutFile(
        layout.filePath,
        this.config,
      );
      const layoutHead = this.buildHeadExtras(
        layoutDoc,
        assetInfo,
        layout.filePath,
      );
      let layoutHTML = layoutDoc.buildHTML(layoutHead);

      // Extract the <body> content from the page HTML
      const bodyMatch = pageHTML.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      const pageBody = bodyMatch ? bodyMatch[1] : pageHTML;

      // Replace the slot placeholder in the layout with the page body
      layoutHTML = layoutHTML.replace(SLOT_PLACEHOLDER, pageBody);

      return layoutHTML;
    } catch (err: any) {
      logWarn(`Layout error for ${urlPath}: ${err.message}`);
      return pageHTML;
    }
  }

  // ── xdata resolution ───────────────────────────────────────────────────────

  private async resolveDataNodes(
    doc: import("../document/index").XDocument,
  ): Promise<void> {
    const dataNodes = doc.collectByType(XDataCollector);
    if (dataNodes.length === 0) return;

    const dataPayloads: Record<string, unknown> = {};

    for (const node of dataNodes) {
      const name = node.getDataName();
      const file = node.getDataFile();
      if (!file) continue;

      const absFile = path.resolve(this.projectRoot, file);
      if (!fs.existsSync(absFile)) {
        logWarn(`xdata "${name}": file not found: ${file}`);
        continue;
      }

      try {
        delete require.cache[require.resolve(absFile)];
        const mod = require(absFile);
        const fetcher = mod.default ?? mod;
        if (typeof fetcher === "function") {
          dataPayloads[name] = await fetcher();
        }
      } catch (err: any) {
        logWarn(`xdata "${name}" fetch failed: ${err.message}`);
      }
    }

    // Inject as a <script> block — accessible as window.__xdata on the client
    if (Object.keys(dataPayloads).length > 0) {
      doc.headExtrasFromNodes +=
        `\n    <script id="__xdata" type="application/json">${JSON.stringify(dataPayloads)}</script>` +
        `\n    <script>window.__xdata=${JSON.stringify(dataPayloads)};</script>`;
    }
  }

  // ── xi18n resolution ───────────────────────────────────────────────────────

  private resolveI18nNodes(
    doc: import("../document/index").XDocument,
    locale: string,
  ): void {
    const i18nNodes = doc.collectByType(Xi18nElement);
    // xi18n nodes override their own buildHTMLRootNode at this point
    // by monkey-patching so the loader's t() is used
    for (const node of i18nNodes) {
      const key = node.getI18nKey();
      const nodeLoc = node.getI18nLocale() || locale;
      const value = this.i18n.t(key, nodeLoc);

      // Override buildHTMLRootNode to return the translated value
      (node as any).buildHTMLRootNode = () =>
        value
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
    }
  }

  // ── ximage resolution ──────────────────────────────────────────────────────

  private async resolveImageNodes(
    doc: import("../document/index").XDocument,
    assetInfo: ReturnType<typeof resolveAssets>,
  ): Promise<void> {
    const imageNodes = doc.collectByType(XImageElement);
    if (imageNodes.length === 0) return;

    const assetsDir = assetInfo?.dir ?? path.join(this.projectRoot, "assets");

    for (const node of imageNodes) {
      const opts = node.getImageAttributes();
      const imgTag = await this.images.buildImgTag(opts, assetsDir);
      (node as any).buildHTMLRootNode = () => imgTag;
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

  private buildHeadExtras(
    doc: import("../document/index").XDocument,
    assetInfo: ReturnType<typeof resolveAssets>,
    filePath: string,
  ): string {
    const lines: string[] = [];

    if (assetInfo?.faviconFile || assetInfo?.defaultFavicon) {
      lines.push(`    ${faviconLinkTag(assetInfo)}`);
    }

    if (doc.pageStylePath) {
      if (!fs.existsSync(doc.pageStylePath)) {
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
    const reps: { from: string; to: string }[] = [];
    let match: RegExpExecArray | null;

    while ((match = re.exec(html)) !== null) {
      const [original, src] = match;
      try {
        const { code } = await bundleScript(src, pageDir);
        reps.push({ from: original, to: `<script>${code}</script>` });
      } catch (err: any) {
        logWarn(`Failed to bundle "${src}": ${err.message}`);
      }
    }

    for (const { from, to } of reps) html = html.replace(from, to);
    return html;
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Injects only X_PUBLIC_* environment variables into the page as window.__xenv.
 * Server-only variables are never included — this is safe to send to the browser.
 */
function injectPublicEnv(html: string): string {
  const pub = getPublicEnv();
  if (Object.keys(pub).length === 0) return html;
  const script = `<script>window.__xenv=${JSON.stringify(pub)};</script>`;
  return html.replace("</head>", `${script}\n</head>`);
}

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

function devErrorDocument(route: string, err: Error): string {
  const { devErrorOverlay } =
    require("./overlay") as typeof import("./overlay");
  const { xplusplusScript } =
    require("./xplusplus") as typeof import("./xplusplus");
  const { hmrClientScript } = require("./hmr") as typeof import("./hmr");
  const { readSettings } =
    require("./xplusplus") as typeof import("./xplusplus");

  const showOverlay = readSettings().showErrorOverlay;
  const overlayHTML = showOverlay
    ? devErrorOverlay({ route, message: err.message, stack: err.stack })
    : "";

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

function productionErrorPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>System Error — X+</title>
  <style>
    :root { --bg: #050505; --text: #fafafa; --sub: #71717a; --accent: #ef4444; }
    body { background: var(--bg); color: var(--text); font-family: -apple-system, system-ui, sans-serif; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; -webkit-font-smoothing: antialiased; }
    .container { text-align: center; padding: 2rem; animation: fade 0.6s ease; }
    @keyframes fade { from { opacity: 0; transform: translateY(10px); } }
    .icon { width: 48px; height: 48px; border: 1px solid rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.05); border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem; color: var(--accent); font-weight: bold; }
    h1 { font-size: 1.25rem; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 0.5rem; }
    p { font-size: 0.95rem; color: var(--sub); line-height: 1.6; margin: 0; }
    .actions { margin-top: 2rem; }
    .btn { background: #fff; color: #000; padding: 0.6rem 1.2rem; border-radius: 8px; font-size: 0.85rem; font-weight: 600; text-decoration: none; transition: 0.2s; }
    .btn:hover { background: #e4e4e7; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">!</div>
    <h1>Internal Server Error</h1>
    <p>Something went wrong on our end. Please try again later.</p>
    <div class="actions">
      <a href="/" class="btn">Return Home</a>
    </div>
  </div>
</body>
</html>`;
}

function builtin404Page(urlPath: string): string {
  // Simple escape for the URL to prevent XSS in the error page
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 Not Found — X+</title>
  <style>
    :root { --bg: #030303; --text: #fff; --sub: #52525b; --accent: #6366f1; }
    body { background: var(--bg); color: var(--text); font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; overflow: hidden; }
    
    /* Background Glow */
    body::before { content: ""; position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 100%; height: 100%; background: radial-gradient(circle at center, rgba(99,102,241,0.08) 0%, transparent 70%); pointer-events: none; }
    
    .content { position: relative; z-index: 10; text-align: center; max-width: 480px; padding: 2rem; }
    .status { font-size: 0.75rem; font-weight: 700; color: var(--accent); letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 1rem; }
    h1 { font-size: 2.5rem; font-weight: 800; tracking: -0.04em; margin: 0 0 1rem; }
    
    .path-pill { display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 6px 14px; border-radius: 99px; font-family: ui-monospace, monospace; font-size: 0.85rem; color: #a1a1aa; margin-bottom: 2rem; }
    .path-pill span { color: var(--accent); font-weight: bold; }
    
    p.instruction { font-size: 0.9rem; color: var(--sub); line-height: 1.6; margin-bottom: 2.5rem; }
    code { background: rgba(255,255,255,0.1); padding: 2px 5px; border-radius: 4px; color: #e2e8f0; font-family: ui-monospace, monospace; }
    
    .nav { display: flex; align-items: center; justify-content: center; gap: 24px; }
    .nav a { color: var(--text); text-decoration: none; font-size: 0.9rem; font-weight: 500; transition: 0.2s; opacity: 0.6; }
    .nav a:hover { opacity: 1; color: var(--accent); }
  </style>
</head>
<body>
  <div class="content">
    <div class="status">404 Error</div>
    <h1>Lost in Space.</h1>
    <div class="path-pill"><span>GET</span> ${esc(urlPath)}</div>
    <p class="instruction">
      We couldn't find this page. To customize this view, create a <code>404.xp</code> file in your project root.
    </p>
    <div class="nav">
      <a href="/">← Back Home</a>
      <a href="https://github.com">Documentation</a>
    </div>
  </div>
</body>
</html>`;
}
