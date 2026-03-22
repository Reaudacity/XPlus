import fs from "fs";
import path from "path";
import * as esbuild from "esbuild";
import consola from "consola";
import chalk from "chalk";

import { XPDirectory } from "../xp-dir";

export type HandlerLanguage = "typescript" | "javascript";

export interface TranspileResult {
  /** Absolute path to the output .js file inside .xp/runtimeOnly/transpile/ */
  outPath: string;
  /** The transpiled JS source */
  code: string;
  language: HandlerLanguage;
}

/**
 * Transpiles xscript handler files (TypeScript or JavaScript) and writes the
 * output to `.xp/runtimeOnly/transpile/` so the VM runner can load them.
 *
 * TypeScript files are fully transpiled via esbuild (CJS output, no bundling —
 * we only transform, keeping imports as `require()` so the VM's `require` hook
 * can resolve them at runtime).
 *
 * JavaScript files are passed through esbuild for CJS normalisation (handles
 * ESM `import`/`export` syntax too).
 */
export class XScriptTranspiler {
  constructor(
    private xpDir: XPDirectory,
    private projectRoot: string,
  ) {}

  /**
   * Transpiles a single handler file.
   * Returns the output path and source so callers can compile a vm.Script.
   */
  async transpile(handlerPath: string): Promise<TranspileResult> {
    const abs = path.resolve(this.projectRoot, handlerPath);
    const ext = path.extname(abs).toLowerCase();
    const lang: HandlerLanguage =
      ext === ".ts" || ext === ".tsx" ? "typescript" : "javascript";

    const source = fs.readFileSync(abs, "utf-8");

    const { code } = await this.transform(source, lang, abs);

    const outPath = this.xpDir.transpilePathFor(abs, this.projectRoot);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, code, "utf-8");

    consola.debug(
      `  ${chalk.magenta("transpile")} ${chalk.gray(path.relative(this.projectRoot, abs))} → ${chalk.gray(path.relative(this.projectRoot, outPath))}`,
    );

    return { outPath, code, language: lang };
  }

  /**
   * Transpiles a source string directly (no disk read), returns the JS.
   * Used when we need the code without touching the cache.
   */
  async transpileSource(
    source: string,
    lang: HandlerLanguage,
    originalPath: string,
  ): Promise<string> {
    const { code } = await this.transform(source, lang, originalPath);
    return code;
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async transform(
    source: string,
    lang: HandlerLanguage,
    filePath: string,
  ): Promise<{ code: string }> {
    const result = await esbuild.transform(source, {
      loader: lang === "typescript" ? "ts" : "js",
      format: "cjs", // CommonJS so module.exports / require() work in VM
      platform: "node",
      target: "node18",
      // No bundling here — we transform only. External imports stay as require().
      sourcemap: false,
      sourcefile: filePath,
    });

    if (result.warnings.length > 0) {
      for (const w of result.warnings) {
        consola.warn(`xscript transpile warning in ${filePath}: ${w.text}`);
      }
    }

    return { code: result.code };
  }
}
