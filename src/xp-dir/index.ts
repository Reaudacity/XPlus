import fs from "fs";
import path from "path";

/**
 * Manages the `.xp/` internal directory — the CLI's private workspace.
 *
 * Layout:
 *   .xp/
 *     runtimeOnly/transpile/  ← xscript TS handlers transpiled to JS
 *     packed/                 ← client-side esbuild bundles
 *     plugins/                ← local plugin files transpiled to JS
 *     .gitignore
 */
export class XPDirectory {
  public readonly root: string;
  public readonly transpileDir: string;
  public readonly packedDir: string;
  public readonly pluginsDir: string;

  constructor(projectRoot: string) {
    this.root = path.join(projectRoot, ".xp");
    this.transpileDir = path.join(this.root, "runtimeOnly", "transpile");
    this.packedDir = path.join(this.root, "packed");
    this.pluginsDir = path.join(this.root, "plugins");
  }

  initialize(): void {
    fs.mkdirSync(this.transpileDir, { recursive: true });
    fs.mkdirSync(this.packedDir, { recursive: true });
    fs.mkdirSync(this.pluginsDir, { recursive: true });
    this.writeGitignore();
  }

  transpilePathFor(originalPath: string, projectRoot: string): string {
    const relative = path.relative(projectRoot, originalPath);
    const flattened = relative
      .replace(/[\\/]/g, "__")
      .replace(/\.tsx?$/, ".js");
    return path.join(this.transpileDir, flattened);
  }

  packedPathFor(originalPath: string, projectRoot: string): string {
    const relative = path.relative(projectRoot, originalPath);
    const flattened = relative.replace(/[\\/]/g, "__").replace(/\.[^.]+$/, "");
    return path.join(this.packedDir, `${flattened}.bundle.js`);
  }

  pluginPathFor(originalPath: string, projectRoot: string): string {
    const relative = path.relative(projectRoot, originalPath);
    const flattened = relative
      .replace(/[\\/]/g, "__")
      .replace(/\.tsx?$/, ".js");
    return path.join(this.pluginsDir, flattened);
  }

  private writeGitignore(): void {
    const gitignore = path.join(this.root, ".gitignore");
    if (!fs.existsSync(gitignore)) {
      fs.writeFileSync(
        gitignore,
        "# Managed by X+ CLI — do not edit\n*\n",
        "utf-8",
      );
    }
  }
}
