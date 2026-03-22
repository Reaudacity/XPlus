import vm from "vm";
import { createRequire } from "module";
import path from "path";
import { Request, Response, NextFunction } from "express";
import { getPublicEnv } from "../env";

// ── Response helpers ──────────────────────────────────────────────────────────

/**
 * Convenience helpers injected into every xscript sandbox.
 * These wrap common Express patterns so handlers stay concise.
 */
export interface XScriptHelpers {
  /**
   * Send a JSON response.
   * Equivalent to res.status(status).json(data).
   */
  json(data: unknown, status?: number): void;

  /**
   * Send a plain-text response.
   */
  send(body: string, status?: number): void;

  /**
   * Redirect to another URL.
   * @param url    Destination URL
   * @param status HTTP status code (default 302)
   */
  redirect(url: string, status?: number): void;

  /**
   * Set a response header.
   */
  header(name: string, value: string): void;

  /**
   * Set a cookie.
   */
  cookie(name: string, value: string, options?: Record<string, unknown>): void;

  /**
   * Clear a cookie.
   */
  clearCookie(name: string): void;

  /**
   * End the response with a status code and optional message.
   */
  status(code: number, message?: string): void;
}

function buildHelpers(res: Response): XScriptHelpers {
  return {
    json(data, statusCode = 200) {
      res.status(statusCode).json(data);
    },
    send(body, statusCode = 200) {
      res.status(statusCode).send(body);
    },
    redirect(url, statusCode = 302) {
      res.redirect(statusCode, url);
    },
    header(name, value) {
      res.setHeader(name, value);
    },
    cookie(name, value, options = {}) {
      (res as any).cookie(name, value, options);
    },
    clearCookie(name) {
      (res as any).clearCookie(name);
    },
    status(code, message) {
      if (message) res.status(code).send(message);
      else res.status(code).end();
    },
  };
}

// ── Context interface ─────────────────────────────────────────────────────────

export interface XScriptContext extends vm.Context {
  // ── HTTP ──────────────────────────────────────────────────────────────────
  req: Request;
  res: Response;
  next: NextFunction;

  // ── Response helpers ──────────────────────────────────────────────────────
  json: XScriptHelpers["json"];
  send: XScriptHelpers["send"];
  redirect: XScriptHelpers["redirect"];
  header: XScriptHelpers["header"];
  cookie: XScriptHelpers["cookie"];
  clearCookie: XScriptHelpers["clearCookie"];
  status: XScriptHelpers["status"];

  // ── Route params (dynamic routes) ─────────────────────────────────────────
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  body: unknown;

  // ── Node globals ──────────────────────────────────────────────────────────
  console: typeof console;
  Buffer: typeof Buffer;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
  setImmediate: typeof setImmediate;
  clearImmediate: typeof clearImmediate;
  fetch: typeof fetch;

  // ── Process (read-only subset) ─────────────────────────────────────────────
  /**
   * Full process.env — available in xscript because handlers run server-side.
   * Never leaks to the browser; xscript output (res.json etc.) is your boundary.
   */
  process: {
    env: NodeJS.ProcessEnv;
    version: string;
    platform: NodeJS.Platform;
  };

  /**
   * Convenience shortcut: only the X_PUBLIC_* subset of process.env.
   * Useful when you want to forward public config to a JSON response.
   */
  publicEnv: Record<string, string>;

  // ── CommonJS shim ──────────────────────────────────────────────────────────
  require: NodeRequire;
  module: { exports: Record<string, unknown> };
  exports: Record<string, unknown>;

  // ── File info ──────────────────────────────────────────────────────────────
  __filename: string;
  __dirname: string;
}

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildContext(
  req: Request,
  res: Response,
  next: NextFunction,
  handlerPath: string,
): XScriptContext {
  const localRequire = createRequire(handlerPath);
  const moduleShim: { exports: Record<string, unknown> } = { exports: {} };
  const helpers = buildHelpers(res);

  const ctx: XScriptContext = {
    // HTTP
    req,
    res,
    next,

    // Helpers (also available as top-level shortcuts)
    json: helpers.json.bind(helpers),
    send: helpers.send.bind(helpers),
    redirect: helpers.redirect.bind(helpers),
    header: helpers.header.bind(helpers),
    cookie: helpers.cookie.bind(helpers),
    clearCookie: helpers.clearCookie.bind(helpers),
    status: helpers.status.bind(helpers),

    // Common req shortcuts
    params: (req.params ?? {}) as Record<string, string>,
    query: (req.query ?? {}) as Record<string, string | string[]>,
    body: req.body,

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

    // Restricted process — full env available (server-side only)
    process: {
      env: process.env,
      version: process.version,
      platform: process.platform,
    },

    // Public env shortcut
    publicEnv: getPublicEnv(),

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
