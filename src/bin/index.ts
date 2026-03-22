#!/usr/bin/env node
import path from "path";
import fs from "fs";
import { program } from "commander";
import chalk from "chalk";
import boxen from "boxen";

import { loadConfig, findConfig } from "../config";
import { NodeRegistry } from "../node";
import { XPlusParser } from "../parser";
import { XPlusRouter } from "../router";
import { XPlusServer, ServerMode } from "../server";
import { XPDirectory } from "../xp-dir";
import { ComponentRegistry } from "../components";
import { StyleResolver } from "../styles";
import {
  resolveAssets,
  faviconLinkTag,
  defaultFaviconDataURI,
} from "../assets";
import { bundleScriptToFile } from "../bundler";
import { XPLUS_VERSION, XSERVER_VERSION } from "../version";
import {
  logBanner,
  logBuilt,
  logBuilding,
  logError,
  logWarn,
  logInfo,
} from "../server/logger";

import {
  registerInit,
  registerNew,
  registerClean,
  registerCheck,
  registerRoutes,
  registerInfo,
  registerFormat,
} from "./commands";
import consola from "consola";

// ─── Custom help ──────────────────────────────────────────────────────────────

function printHelp(): void {
  const b = chalk.bold;
  const c = chalk.hex("#c084fc");
  const g = chalk.hex("#475569");

  console.log(`
  ${chalk.bold.hex("#c084fc")("X+")} ${chalk.hex("#e2e8f0")("— the server-first markup language")}

  ${b("Usage")}
    ${c("x+")} ${g("<command> [options]")}

  ${b("Scaffold")}
    ${c("x+ init")} ${g("[directory]")}        scaffold a new project
    ${c("x+ new page")} ${g("<route>")}         create a page
    ${c("x+ new handler")} ${g("<n>")}          create an xscript handler
    ${c("x+ new plugin")} ${g("<n>")}           create a plugin

  ${b("Develop")}
    ${c("xserver")} / ${c("x+ dev")}           start dev server  ${g("(HMR, error overlay)")}
    ${c("x+ serve")}                  start production server
    ${c("x+ check")}                   validate all .xp files
    ${c("x+ format")}                  format .xp files with Prettier
    ${c("x+ routes")}                  list all page + API routes

  ${b("Build")}
    ${c("x+ build")}                   transpile .xp → static HTML

  ${b("Workspace")}
    ${c("x+ info")}                    show project config + workspace status
    ${c("x+ clean")}                   clear .xp/ internal workspace

  ${b("Flags")}
    ${c("-v, --version")}              print version
    ${c("-h, --help")}                 show this help
`);
}

// ─── Custom version ───────────────────────────────────────────────────────────

function printVersion(): void {
  const content =
    `${chalk.bold.hex("#c084fc")("XPlus")}  ` +
    `${chalk.hex("#e2e8f0")("v" + XPLUS_VERSION)}\n` +
    `${chalk.hex("#64748b")("XServer")} ` +
    `${chalk.hex("#94a3b8")("v" + XSERVER_VERSION)}  ` +
    chalk.hex("#475569")("(implementing XServer specification)");

  console.log(
    boxen(content, {
      padding: { top: 0, bottom: 0, left: 1, right: 2 },
      margin: { top: 1, bottom: 1, left: 2, right: 0 },
      borderStyle: "round",
      borderColor: "#334155",
    }),
  );
}

// ─── Intercept flags before Commander sees argv ───────────────────────────────

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  printVersion();
  process.exit(0);
}

// ─── Program setup ────────────────────────────────────────────────────────────

program.name("xplus").helpOption(false).addHelpCommand(false).action(printHelp);

// ─── Register commands ────────────────────────────────────────────────────────

registerInit(program);
registerNew(program);
registerClean(program);
registerCheck(program);
registerRoutes(program);
registerInfo(program);
registerFormat(program);

// ─── build ────────────────────────────────────────────────────────────────────

program
  .command("build")
  .description("Transpile .xp files to static HTML")
  .option("-c, --config <path>", "Path to xplus.yml", "xplus.yml")
  .option("-o, --out <dir>", "Output directory", "dist")
  .action(async (opts: { config: string; out: string }) => {
    const config = resolveConfig(opts.config);
    const projectRoot = process.cwd();
    const outDir = path.resolve(projectRoot, opts.out);
    const appDir = path.resolve(projectRoot, config.router.directory);

    const xpDir = new XPDirectory(projectRoot);
    xpDir.initialize();
    fs.mkdirSync(outDir, { recursive: true });

    const registry = new NodeRegistry();
    const componentRegistry = new ComponentRegistry();
    componentRegistry.scan(
      path.resolve(projectRoot, config.components.directory),
    );

    const parser = new XPlusParser(registry, componentRegistry);
    const styles = new StyleResolver();
    const router = new XPlusRouter(appDir);
    const routes = router.discoverRoutes();
    const assetInfo = resolveAssets(projectRoot);

    logBanner(config.name);
    console.log(
      `  ${chalk.hex("#64748b")("Building")} ${chalk.hex("#94a3b8")(routes.length + " page(s)")}  ${chalk.hex("#475569")("→")}  ${chalk.hex("#64748b")(opts.out + "/")}\n`,
    );

    let built = 0,
      errors = 0;

    for (const route of routes) {
      const outFile = path.join(
        outDir,
        route.urlPath === "/" ? "index.html" : `${route.urlPath}/index.html`,
      );
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      logBuilding(route.urlPath);
      const start = Date.now();

      try {
        const doc = parser.parseFile(route.filePath, config);

        // Build head extras: favicon + inlined style
        const headLines: string[] = [];
        if (assetInfo.defaultFavicon) {
          headLines.push(
            `    <link rel="icon" type="image/x-icon" href="${defaultFaviconDataURI()}" />`,
          );
        } else if (assetInfo.faviconFile) {
          headLines.push(`    ${faviconLinkTag(assetInfo)}`);
        }
        if (doc.pageStylePath) {
          const styleTag = await styles.inlineTag(
            doc.pageStylePath,
            doc.buildHTML(),
          );
          headLines.push(`    ${styleTag}`);
        }

        let html = doc.buildHTML(headLines.join("\n"));
        html = await bundleClientScripts(
          html,
          route.filePath,
          xpDir,
          projectRoot,
        );
        fs.writeFileSync(outFile, html, "utf-8");
        logBuilt(route.urlPath, Date.now() - start);
        built++;
      } catch (err: any) {
        logError(route.urlPath, err.message);
        errors++;
      }
    }

    // Copy assets/ to dist/
    if (assetInfo) {
      const assetsOutDir = path.join(outDir);
      fs.mkdirSync(assetsOutDir, { recursive: true });
      for (const file of fs.readdirSync(assetInfo.dir)) {
        fs.copyFileSync(
          path.join(assetInfo.dir, file),
          path.join(assetsOutDir, file),
        );
      }
      logInfo(`Copied assets to ${opts.out}/`);
    }

    const summary =
      errors === 0
        ? chalk.hex("#34d399")(`✔  ${built} page(s) built successfully`)
        : chalk.hex("#f87171")(`✖  ${errors} error(s)  `) +
          chalk.hex("#64748b")(`${built} built`);

    console.log(`\n  ${summary}\n`);
  });

// ─── dev server (xserver / x+ dev) ───────────────────────────────────────────

program
  .command("dev")
  .description("Start the X+ development server (HMR, error overlay)")
  .option("-c, --config <path>", "Path to xplus.yml")
  .option("-p, --port <number>", "Port to listen on", "3000")
  .action(async (opts: { config?: string; port: string }) => {
    await spawnServer(opts, "development");
  });

// ─── production server (x+ serve) ────────────────────────────────────────────

program
  .command("serve")
  .description("Start the X+ production server (no HMR, no error details)")
  .option("-c, --config <path>", "Path to xplus.yml")
  .option("-p, --port <number>", "Port to listen on", "3000")
  .action(async (opts: { config?: string; port: string }) => {
    await spawnServer(opts, "production");
  });

// ─── Parse ────────────────────────────────────────────────────────────────────

// When invoked as `xserver`, route to the dev command
if (path.basename(process.argv[1] ?? "").startsWith("xserver")) {
  process.argv.splice(2, 0, "dev");
}

program.parse(process.argv);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveConfig(configFlag?: string) {
  const configPath = configFlag ?? findConfig() ?? "xplus.yml";
  return loadConfig(configPath);
}

/**
 * Spawns the server in a child process so that `xplus.yml` changes
 * can trigger a clean respawn. Exit code 0 = restart signal from HMR watcher.
 */
async function spawnServer(
  opts: { config?: string; port: string },
  mode: "development" | "production",
): Promise<void> {
  const configPath = opts.config ?? findConfig() ?? "xplus.yml";

  if (process.env.__XPLUS_SERVER_CHILD !== "1") {
    const { spawn } = await import("child_process");

    const spawnChild = () => {
      const child = spawn(process.execPath, process.argv.slice(1), {
        stdio: "inherit",
        env: { ...process.env, __XPLUS_SERVER_CHILD: "1" },
      });
      // Code 0 = deliberate restart (xplus.yml changed); anything else = stop
      child.on("exit", (code) => {
        if (code === 0) spawnChild();
      });
    };

    spawnChild();
    return;
  }

  const config = resolveConfig(configPath);
  const port = parseInt(opts.port, 10);
  const server = new XPlusServer(config, {
    projectRoot: process.cwd(),
    configPath: path.resolve(process.cwd(), configPath),
    mode,
  });
  await server.start(port, configPath);
}

async function bundleClientScripts(
  html: string,
  pageFilePath: string,
  xpDir: XPDirectory,
  projectRoot: string,
): Promise<string> {
  const pageDir = path.dirname(pageFilePath);
  const scriptSrcRe = /<script\s+src="([^"]+)"><\/script>/g;
  const replacements: { original: string; replacement: string }[] = [];

  let match: RegExpExecArray | null;
  while ((match = scriptSrcRe.exec(html)) !== null) {
    const [original, src] = match;
    const absoluteSrc = path.resolve(pageDir, src);
    const packedPath = xpDir.packedPathFor(absoluteSrc, projectRoot);

    try {
      await bundleScriptToFile(src, packedPath, pageDir);
      const relPacked = path.relative(path.dirname(pageFilePath), packedPath);
      replacements.push({
        original,
        replacement: `<script src="${relPacked}"></script>`,
      });
    } catch (err: any) {
      consola.warn(`Failed to bundle "${src}": ${err.message}`);
    }
  }

  for (const { original, replacement } of replacements) {
    html = html.replace(original, replacement);
  }
  return html;
}
