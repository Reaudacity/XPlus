// ── Types ─────────────────────────────────────────────────────────────────────

export type Language = "typescript" | "javascript";
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface ScaffoldOptions {
  name:           string;
  description:    string;
  port:           number;
  language:       Language;
  plugins:        string[];
  usePrettier:    boolean;
  initGit:        boolean;
  packageManager: PackageManager;
}

// ── xplus.yml ─────────────────────────────────────────────────────────────────

export function tplXplusYml(opts: ScaffoldOptions): string {
  const pluginLines = opts.plugins.length
    ? opts.plugins.map(p => `  - "${p}"`).join("\n")
    : "  []";

  return `\
########## X+ Application Configuration ##########
#
# Run pages:  xplus build
# Run server: xserver  (or: xplus serve)
#

name: ${opts.name}
description: ${opts.description}

server:
  port: ${opts.port}

router:
  directory: app

components:
  directory: components

# Plugins — three specifier formats:
#   xplus:<name>       built-in plugin (e.g. xplus:tailwindcss)
#   ./plugins/my.ts    local .ts or .js file
#   some-npm-package   npm package
plugins:
${pluginLines}
`;
}

// ── app/page.xp ──────────────────────────────────────────────────────────────

export function tplRootPage(opts: ScaffoldOptions): string {
  const ext = opts.language === "typescript" ? "ts" : "js";
  return `\
<?xml version="1.1" encoding="UTF-8"?>

<XPlusPage title="${opts.name}" description="${opts.description}">

  <h1>${opts.name}</h1>
  <p>Welcome to your X+ project.</p>

  <!--
    xscript registers a server-side API route.
    Invisible in transpiled HTML — server-only.
  -->
  <xscript path="/api/hello" file="../api/hello.${ext}" method="GET"></xscript>

</XPlusPage>
`;
}

// ── api/hello.ts ──────────────────────────────────────────────────────────────

export function tplHandlerTS(): string {
  return `\
import { Request, Response } from "express";

/**
 * GET /api/hello
 *
 * xscript handler — runs on the server inside a Node VM sandbox.
 * Globals: req, res, next, console, require, Buffer, fetch, process.env
 */
export default function handler(req: Request, res: Response) {
  const name = req.query.name ?? "World";
  res.json({ message: \`Hello, \${name}!\` });
}
`;
}

// ── api/hello.js ──────────────────────────────────────────────────────────────

export function tplHandlerJS(): string {
  return `\
/**
 * GET /api/hello
 *
 * xscript handler — runs on the server inside a Node VM sandbox.
 * Globals: req, res, next, console, require, Buffer, fetch, process.env
 */
module.exports = function handler(req, res) {
  const name = req.query.name ?? "World";
  res.json({ message: \`Hello, \${name}!\` });
};
`;
}

// ── package.json ──────────────────────────────────────────────────────────────

export function tplPackageJson(opts: ScaffoldOptions): string {
  return JSON.stringify(
    {
      name:        slugify(opts.name),
      version:     "0.1.0",
      description: opts.description,
      scripts: {
        dev:   "xserver",
        build: "xplus build",
        serve: "xplus serve",
      },
    },
    null,
    2,
  ) + "\n";
}

// ── tsconfig.json ─────────────────────────────────────────────────────────────

export function tplTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target:          "ES2020",
        module:          "commonjs",
        strict:          true,
        esModuleInterop: true,
        skipLibCheck:    true,
        outDir:          "./dist",
        rootDir:         "./",
      },
      include:  ["api/**/*"],
      exclude:  ["node_modules", "dist", ".xp"],
    },
    null,
    2,
  ) + "\n";
}

// ── .prettierrc ───────────────────────────────────────────────────────────────

export function tplPrettierRc(): string {
  return JSON.stringify(
    {
      semi:           true,
      singleQuote:    false,
      trailingComma:  "all",
      printWidth:     100,
      tabWidth:       2,
      plugins:        ["@prettier/plugin-xml"],
      overrides: [
        {
          files:   ["*.xp"],
          options: { parser: "xml", xmlSelfClosingSpace: true },
        },
      ],
    },
    null,
    2,
  ) + "\n";
}

// ── .prettierignore ───────────────────────────────────────────────────────────

export function tplPrettierIgnore(): string {
  return `dist/\n.xp/\nnode_modules/\n`;
}

// ── .gitignore ────────────────────────────────────────────────────────────────

export function tplGitIgnore(): string {
  return `\
node_modules/
dist/
.xp/
*.log
.env
.env.local
`;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

export function slugify(str: string): string {
  return str.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}