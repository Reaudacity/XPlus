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
        dev:   "x+ dev",
        build: "x+ build",
        serve: "x+ serve",
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

// ── README.md ─────────────────────────────────────────────────────────────────

export function tplReadme(opts: ScaffoldOptions): string {
  const pm    = opts.packageManager;
  const ext   = opts.language === "typescript" ? "ts" : "js";
  const isTS  = opts.language === "typescript";

  const devCmd:   Record<PackageManager, string> = { npm: "npm run dev",   pnpm: "pnpm dev",   yarn: "yarn dev",   bun: "bun dev"   };
  const buildCmd: Record<PackageManager, string> = { npm: "npm run build", pnpm: "pnpm build", yarn: "yarn build", bun: "bun build" };
  const addCmd:   Record<PackageManager, string> = { npm: "npm install",   pnpm: "pnpm add",   yarn: "yarn add",   bun: "bun add"   };

  const pluginSection = opts.plugins.length
    ? `\n## Plugins\n\nThis project has the following X+ plugins enabled:\n\n${opts.plugins.map(p => `- \`${p}\``).join("\n")}\n\nAdd or remove plugins in \`xplus.yml\` under the \`plugins\` key.\n`
    : "";

  return `# ${opts.name}

${opts.description}

Built with [X+](https://github.com/Reaudacity/xplus) — the server-first XML markup language.

## Getting started

\`\`\`bash
${devCmd[pm]}
\`\`\`

Open [http://localhost:${opts.port}](http://localhost:${opts.port}) in your browser.

## Project structure

\`\`\`
${slugify(opts.name)}/
  xplus.yml            # project configuration
  app/
    page.xp            # → route: /
  components/          # reusable .xp components
  api/
    hello.${ext}          # xscript API handler → GET /api/hello
  assets/              # static files served at /
\`\`\`

## Commands

| Command | Description |
|---|---|
| \`${devCmd[pm]}\` | Start the development server with HMR |
| \`${buildCmd[pm]}\` | Export static HTML to \`dist/\` |
| \`xplus check\` | Validate all \`.xp\` files |
| \`xplus routes\` | List all page and API routes |

## Pages

Pages are \`.xp\` files inside \`app/\`. The directory structure maps directly to URL routes:

\`\`\`
app/page.xp           →  /
app/about/page.xp     →  /about
app/blog/post/page.xp →  /blog/post
\`\`\`

Create a new page:

\`\`\`bash
xplus new page about
\`\`\`

## API routes

API routes are declared with \`<xscript>\` inside any page. The handler file runs on the server inside a Node VM sandbox.

\`\`\`xml
<xscript path="/api/hello" file="../api/hello.${ext}" method="GET"></xscript>
\`\`\`

\`\`\`${isTS ? "typescript" : "javascript"}
${isTS
  ? `import { Request, Response } from "express";\n\nexport default function handler(req: Request, res: Response) {\n  res.json({ message: "Hello!" });\n}`
  : `module.exports = function handler(req, res) {\n  res.json({ message: "Hello!" });\n};`
}
\`\`\`

Create a new handler:

\`\`\`bash
xplus new handler users
\`\`\`

## Components

Components live in \`components/\` and are available globally — no imports needed.

\`\`\`xml
<!-- components/navbar.xp -->
<XPlusComponent name="Navbar">
  <nav>
    <a href="/">Home</a>
  </nav>
</XPlusComponent>
\`\`\`

\`\`\`xml
<!-- app/page.xp -->
<Navbar />
\`\`\`
${pluginSection}
## Configuration

Edit \`xplus.yml\` to configure the project:

\`\`\`yaml
name: ${opts.name}
description: ${opts.description}

server:
  port: ${opts.port}

router:
  directory: app

components:
  directory: components

plugins: []
\`\`\`

## Adding dependencies

\`\`\`bash
# Add a runtime dependency
${addCmd[pm]} some-package

# Add a dev dependency
${addCmd[pm]} ${pm === "npm" ? "--save-dev" : "--dev"} some-package
\`\`\`

## Learn more

- [X+ documentation](https://github.com/Reaudacity/xplus)
- [xmplus on npm](https://www.npmjs.com/package/xmplus)
`;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

export function slugify(str: string): string {
  return str.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}