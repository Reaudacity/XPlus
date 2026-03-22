import vm from "vm";
import { createRequire } from "module";
import path from "path";
import { Request, Response, NextFunction } from "express";

/**
 * The context injected into every xscript VM sandbox.
 *
 * Handlers can access everything here as top-level variables.
 * Intentionally restricted: no direct `process.exit`, no `fs` unless
 * the handler requires it explicitly through `require`.
 */
export interface XScriptContext extends vm.Context {
  // ── HTTP ─────────────────────────────────────────────────────────────────
  req: Request;
  res: Response;
  next: NextFunction;

  // ── Node globals ─────────────────────────────────────────────────────────
  console: typeof console;
  Buffer: typeof Buffer;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
  setImmediate: typeof setImmediate;
  clearImmediate: typeof clearImmediate;
  fetch: typeof fetch;

  // ── Process (read-only subset) ───────────────────────────────────────────
  process: {
    env: NodeJS.ProcessEnv;
    version: string;
    platform: NodeJS.Platform;
  };

  // ── CommonJS shim ─────────────────────────────────────────────────────────
  /** Resolves modules relative to the original handler file's directory. */
  require: NodeRequire;
  module: { exports: Record<string, unknown> };
  exports: Record<string, unknown>;

  // ── File info ─────────────────────────────────────────────────────────────
  __filename: string;
  __dirname: string;
}

/**
 * Builds a fresh VM context for each request.
 * A new context is created per-invocation so handlers cannot bleed state
 * across requests (no shared `let` mutations, etc.).
 */
export function buildContext(
  req: Request,
  res: Response,
  next: NextFunction,
  handlerPath: string, // original file path, used to resolve require()
): XScriptContext {
  // Require resolves relative to the *original* handler's directory, not the
  // transpile cache, so relative imports inside handlers work correctly.
  const localRequire = createRequire(handlerPath);

  const moduleShim: { exports: Record<string, unknown> } = { exports: {} };

  const ctx: XScriptContext = {
    // HTTP
    req,
    res,
    next,

    // Node globals
    console,
    Buffer,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    setImmediate,
    clearImmediate,
    fetch,

    // Restricted process
    process: {
      env: process.env,
      version: process.version,
      platform: process.platform,
    },

    // CommonJS shim
    require: localRequire,
    module: moduleShim,
    exports: moduleShim.exports,

    // File meta
    __filename: handlerPath,
    __dirname: path.dirname(handlerPath),
  };

  return vm.createContext(ctx) as XScriptContext;
}
