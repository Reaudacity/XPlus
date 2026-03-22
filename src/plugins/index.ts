import fs from "fs";
import path from "path";
import * as esbuild from "esbuild";
import { XPlusConfig } from "../types";
import { ComponentRegistry } from "../components";
import { XDocument } from "../document/index";
import { resolveBuiltin, listBuiltins } from "./builtin";

// ── Plugin interface ──────────────────────────────────────────────────────────

export interface PluginContext {
  config: XPlusConfig;
  projectRoot: string;
  /** Emit a log line from the plugin (shown with plugin name prefix) */
  log(message: string): void;
  warn(message: string): void;
}

/**
 * The interface every X+ plugin must satisfy.
 *
 * All hooks are optional — implement only what you need.
 *
 * Loading order (per plugin, in sequence):
 *   1. setup()             — runs once at server/build startup
 *   2. onComponentsReady() — runs after component scan
 *   3. transformDocument() — runs each time a page is parsed
 *   4. transformHTML()     — runs after HTML is rendered, before caching/serving
 */
export interface XPlusPlugin {
  /** Display name shown in startup logs */
  name: string;

  /**
   * Called once after config is loaded, before the server starts or build runs.
   * Use this to validate options, set up external watchers, etc.
   */
  setup?(ctx: PluginContext): void | Promise<void>;

  /**
   * Called after the ComponentRegistry has been populated.
   * Plugins can register additional synthetic components here.
   */
  onComponentsReady?(registry: ComponentRegistry): void | Promise<void>;

  /**
   * Called each time a page or component XDocument is fully parsed.
   * Mutations to the document (e.g. injecting nodes) happen here.
   */
  transformDocument?(doc: XDocument, route: string): void | Promise<void>;

  /**
   * Called after `buildHTML()` and client-script bundling.
   * Return a modified HTML string — or the original if unchanged.
   * This is the right hook for injecting CSS frameworks, analytics, etc.
   */
  transformHTML?(html: string, route: string): string | Promise<string>;
}

// ── Loader ────────────────────────────────────────────────────────────────────

export class PluginLoader {
  private plugins: XPlusPlugin[] = [];

  constructor(
    private config: XPlusConfig,
    private projectRoot: string,
    private pluginsDir: string, // .xp/plugins/ for transpiled local files
  ) {}

  // ── Load ───────────────────────────────────────────────────────────────────

  /**
   * Resolves, loads, and runs `setup()` on every plugin listed in config.
   * Local .ts/.js files are transpiled into .xp/plugins/ first.
   */
  async load(): Promise<void> {
    for (const specifier of this.config.plugins) {
      try {
        const plugin = await this.resolve(specifier);
        this.plugins.push(plugin);
      } catch (err: any) {
        throw new Error(`Failed to load plugin "${specifier}": ${err.message}`);
      }
    }
  }

  /** Runs `setup()` on all loaded plugins. Call after `load()`. */
  async setup(
    logFn: (name: string, msg: string) => void,
    warnFn: (name: string, msg: string) => void,
  ): Promise<void> {
    for (const plugin of this.plugins) {
      if (!plugin.setup) continue;
      const ctx = this.buildContext(plugin.name, logFn, warnFn);
      await plugin.setup(ctx);
    }
  }

  // ── Hooks ──────────────────────────────────────────────────────────────────

  async onComponentsReady(registry: ComponentRegistry): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.onComponentsReady?.(registry);
    }
  }

  async transformDocument(doc: XDocument, route: string): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.transformDocument?.(doc, route);
    }
  }

  async transformHTML(html: string, route: string): Promise<string> {
    let result = html;
    for (const plugin of this.plugins) {
      if (plugin.transformHTML) {
        result = await plugin.transformHTML(result, route);
      }
    }
    return result;
  }

  get loaded(): XPlusPlugin[] {
    return this.plugins;
  }

  // ── Resolution ─────────────────────────────────────────────────────────────

  private async resolve(specifier: string): Promise<XPlusPlugin> {
    // Built-in X+ plugin: "xplus:<name>"
    if (specifier.startsWith("xplus:")) {
      return this.resolveBuiltin(specifier);
    }

    // Local file: ends in .ts/.js or starts with ./ or ../
    const isLocal =
      /\.(ts|js)$/.test(specifier) ||
      specifier.startsWith("./") ||
      specifier.startsWith("../");

    if (isLocal) {
      return this.resolveLocal(specifier);
    }

    // npm package
    return this.resolvePackage(specifier);
  }

  private resolveBuiltin(specifier: string): XPlusPlugin {
    const name = specifier.slice("xplus:".length);
    const plugin = resolveBuiltin(name);

    if (!plugin) {
      const available = listBuiltins()
        .map((n) => `xplus:${n}`)
        .join(", ");
      throw new Error(
        `Unknown built-in plugin "${specifier}".\n` +
          `  Available X+ plugins: ${available}\n` +
          `  For third-party plugins use an npm package name or local file path.`,
      );
    }

    return plugin;
  }

  /**
   * Transpiles a local .ts file to `.xp/plugins/` then requires it.
   * .js files are required directly (no transpilation needed).
   */
  private async resolveLocal(specifier: string): Promise<XPlusPlugin> {
    const absPath = path.resolve(this.projectRoot, specifier);

    if (!fs.existsSync(absPath)) {
      throw new Error(`Plugin file not found: ${absPath}`);
    }

    let requirePath = absPath;

    if (absPath.endsWith(".ts")) {
      // Transpile TS → JS in .xp/plugins/
      const outPath = path.join(
        this.pluginsDir,
        path.basename(absPath).replace(/\.ts$/, ".js"),
      );
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

    // Clear require cache so hot-reloading works
    delete require.cache[require.resolve(requirePath)];
    const mod = require(requirePath);
    return this.extractPlugin(mod, specifier);
  }

  private resolvePackage(specifier: string): XPlusPlugin {
    // Resolve relative to project root so local node_modules is found first
    const requirePath = require.resolve(specifier, {
      paths: [this.projectRoot],
    });
    const mod = require(requirePath);
    return this.extractPlugin(mod, specifier);
  }

  private extractPlugin(mod: any, specifier: string): XPlusPlugin {
    const plugin: XPlusPlugin = mod.default ?? mod;

    if (typeof plugin !== "object" || plugin === null) {
      throw new Error(`Plugin must export an object, got ${typeof plugin}`);
    }
    if (typeof plugin.name !== "string" || !plugin.name) {
      throw new Error(`Plugin is missing a "name" string property`);
    }

    return plugin;
  }

  private buildContext(
    pluginName: string,
    logFn: (name: string, msg: string) => void,
    warnFn: (name: string, msg: string) => void,
  ): PluginContext {
    return {
      config: this.config,
      projectRoot: this.projectRoot,
      log: (msg) => logFn(pluginName, msg),
      warn: (msg) => warnFn(pluginName, msg),
    };
  }
}
