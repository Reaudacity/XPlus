import vm from "vm";
import path from "path";
import consola from "consola";
import chalk from "chalk";
import { Request, Response, NextFunction } from "express";

import { buildContext } from "./context";

/**
 * A pre-compiled xscript handler.
 *
 * The `vm.Script` is compiled once at server startup from the transpiled JS.
 * Per request, we spin up a fresh context and run the script inside it.
 */
export interface CompiledHandler {
  script: vm.Script;
  handlerPath: string; // original source file path (for require() resolution)
  routePath: string;
  method: string;
}

/**
 * Compiles transpiled JS code into a reusable `vm.Script`.
 *
 * @param code        - Transpiled CJS JavaScript source
 * @param handlerPath - Original source file path (shown in stack traces)
 * @param routePath   - Express route, used for logging only
 * @param method      - HTTP method, used for logging only
 */
export function compileHandler(
  code: string,
  handlerPath: string,
  routePath: string,
  method: string,
): CompiledHandler {
  const script = new vm.Script(code, {
    filename: handlerPath, // makes stack traces point to original file
    lineOffset: 0,
  });

  return { script, handlerPath, routePath, method };
}

/**
 * Runs a pre-compiled handler script for a single HTTP request.
 *
 * Execution model:
 *   1. A fresh VM context is created with `req`, `res`, `next`, etc.
 *   2. The script is run inside that context.
 *   3. If the script assigned a function to `module.exports` (or `exports.default`),
 *      that function is called with `(req, res, next)` — this supports the common
 *      `export default function handler(req, res) { ... }` pattern.
 *   4. Otherwise we assume the script handled the response inline
 *      (e.g. `res.json({ ok: true })` at the top level).
 */
export async function runHandler(
  compiled: CompiledHandler,
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const ctx = buildContext(req, res, next, compiled.handlerPath);

  try {
    compiled.script.runInContext(ctx, { timeout: 10_000 });

    // Check for export default / module.exports handler pattern
    const exported = ctx.module.exports;

    // Support: export default fn  →  module.exports = { default: fn }
    const fn =
      typeof exported === "function"
        ? exported
        : typeof (exported as any).default === "function"
          ? (exported as any).default
          : null;

    if (fn) {
      await fn(req, res, next);
    }
    // else: inline execution already handled the response
  } catch (err: any) {
    const rel = path.relative(process.cwd(), compiled.handlerPath);
    consola.error(
      `${chalk.red("xscript error")} in ${chalk.cyan(compiled.routePath)} ` +
        `(${chalk.gray(rel)}): ${err.message}`,
    );
    if (!res.headersSent) {
      res.status(500).json({
        error: "xscript runtime error",
        message: err.message,
      });
    }
  }
}
