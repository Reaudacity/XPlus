/**
 * All scaffold templates used by `x+ init` and `x+ new`.
 * Kept in one place so the CLI commands stay thin.
 */

export interface InitOptions {
  name: string;
  description: string;
  port: number;
  language: "typescript" | "javascript";
  plugins: string[]; // e.g. ["xplus:tailwindcss", "xplus:meta"]
}

// ── xplus.yml ────────────────────────────────────────────────────────────────

export function xplusYml(opts: InitOptions): string {
  const pluginLines = opts.plugins.length
    ? opts.plugins.map((p) => `  - "${p}"`).join("\n")
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
#   xplus:<n>          built-in X+ plugin  (e.g. xplus:tailwindcss)
#   ./plugins/my.ts    local file          (.ts or .js, relative to project root)
#   some-npm-package   npm package
#
plugins:
${pluginLines}

# Plugin-specific options (keyed by plugin name without the xplus: prefix)
# pluginOptions:
#   tailwindcss:
#     cdn: true
`;
}

// ── app/page.xp ──────────────────────────────────────────────────────────────

export function rootPage(opts: InitOptions): string {
  const ext = opts.language === "typescript" ? "ts" : "js";
  return `\
<?xml version="1.1" encoding="UTF-8"?>

<XPlusPage title="${opts.name}" description="${opts.description}">

  <h1>${opts.name}</h1>
  <p>Welcome to your new X+ project.</p>

  <!--
    xscript nodes are server-only API routes.
    They are invisible in the transpiled HTML output.
    Handlers can be TypeScript (.ts) or JavaScript (.js).
  -->
  <xscript path="/api/hello" file="../api/hello.${ext}" method="GET"></xscript>

</XPlusPage>
`;
}

// ── api/hello.ts ─────────────────────────────────────────────────────────────

export function helloHandlerTS(): string {
  return `\
import { Request, Response } from "express";

/**
 * GET /api/hello
 *
 * This is an xscript handler. It runs on the server inside a Node VM sandbox.
 * Available globals: req, res, next, console, require, Buffer, fetch, process.env
 */
export default function handler(req: Request, res: Response) {
  const name = req.query.name ?? "World";
  res.json({ message: \`Hello, \${name}!\` });
}
`;
}

// ── api/hello.js ─────────────────────────────────────────────────────────────

export function helloHandlerJS(): string {
  return `\
/**
 * GET /api/hello
 *
 * This is an xscript handler. It runs on the server inside a Node VM sandbox.
 * Available globals: req, res, next, console, require, Buffer, fetch, process.env
 *
 * Export a default function, or write inline code that calls res.json() directly.
 */
module.exports = function handler(req, res) {
  const name = req.query.name ?? "World";
  res.json({ message: \`Hello, \${name}!\` });
};
`;
}

// ── package.json ─────────────────────────────────────────────────────────────

export function packageJson(opts: InitOptions): string {
  const devDeps =
    opts.language === "typescript"
      ? `,\n  "devDependencies": {\n    "@types/express": "^4.17.21",\n    "typescript": "^5.3.3"\n  }`
      : "";

  return `\
{
  "name": "${slugify(opts.name)}",
  "version": "0.1.0",
  "description": "${opts.description}",
  "scripts": {
    "dev": "xserver",
    "build": "xplus build"
  }${devDeps}
}
`;
}

// ── tsconfig.json ────────────────────────────────────────────────────────────

export function tsconfigJson(): string {
  return `\
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./"
  },
  "include": ["api/**/*"],
  "exclude": ["node_modules", "dist", ".xp"]
}
`;
}

// ── .gitignore ────────────────────────────────────────────────────────────────

export function gitignore(): string {
  return `\
node_modules/
dist/
.xp/
*.log
`;
}

// ── New page scaffold ─────────────────────────────────────────────────────────

export function newPage(title: string, description = ""): string {
  return `\
<?xml version="1.1" encoding="UTF-8"?>

<XPlusPage title="${title}" description="${description || title}">

  <h1>${title}</h1>
  <p>Add your content here.</p>

</XPlusPage>
`;
}

// ── New handler scaffolds ─────────────────────────────────────────────────────

export function newHandlerTS(routePath: string): string {
  return `\
import { Request, Response } from "express";

export default function handler(req: Request, res: Response) {
  res.json({ route: "${routePath}", ok: true });
}
`;
}

export function newHandlerJS(routePath: string): string {
  return `\
module.exports = function handler(req, res) {
  res.json({ route: "${routePath}", ok: true });
};
`;
}

// ── New plugin scaffolds ──────────────────────────────────────────────────────

export function newPluginTS(name: string): string {
  return `\
import type { XPlusPlugin, PluginContext } from "xmplus";

/**
 * ${name} — X+ plugin
 *
 * Available hooks:
 *   setup(ctx)                      runs once at server/build startup
 *   onComponentsReady(registry)     after component scan
 *   transformDocument(doc, route)   each time a page is parsed
 *   transformHTML(html, route)      after HTML is rendered, before cache
 */
const plugin: XPlusPlugin = {
  name: "${name}",

  setup(ctx: PluginContext) {
    ctx.log("${name} loaded");
  },

  async transformHTML(html: string, route: string): Promise<string> {
    // Modify the HTML here and return it
    return html;
  },
};

export default plugin;
`;
}

export function newPluginJS(name: string): string {
  return `\
/**
 * ${name} — X+ plugin
 *
 * Available hooks:
 *   setup(ctx)                      runs once at server/build startup
 *   onComponentsReady(registry)     after component scan
 *   transformDocument(doc, route)   each time a page is parsed
 *   transformHTML(html, route)      after HTML is rendered, before cache
 */
module.exports = {
  name: "${name}",

  setup(ctx) {
    ctx.log("${name} loaded");
  },

  async transformHTML(html, route) {
    // Modify the HTML here and return it
    return html;
  },
};
`;
}

// ── Utilities ────────────────────────────────────────────────────────────────

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}
