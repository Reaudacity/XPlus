import path from "path";
import { Command } from "commander";
import chalk from "chalk";

import { loadConfig, findConfig } from "../../config";
import { NodeRegistry } from "../../node";
import { XPlusParser } from "../../parser";
import { XPlusRouter } from "../../router";
import { logBanner, logFatalError, logInfo } from "../../server/logger";

export function registerRoutes(program: Command): void {
  program
    .command("routes")
    .description("List all page routes and xscript API endpoints")
    .option("-c, --config <path>", "Path to xplus.yml")
    .action(async (opts: { config?: string }) => {
      const configPath = opts.config ?? findConfig() ?? "xplus.yml";
      let config;
      try {
        config = loadConfig(configPath);
      } catch (err: any) {
        logFatalError(err.message);
        process.exit(1);
      }

      const projectRoot = process.cwd();
      const appDir = path.resolve(projectRoot, config.router.directory);
      const registry = new NodeRegistry();
      const parser = new XPlusParser(registry);
      const router = new XPlusRouter(appDir);

      let rawRoutes;
      try {
        rawRoutes = router.discoverRoutes();
      } catch (err: any) {
        logFatalError(err.message);
        process.exit(1);
      }

      if (rawRoutes.length === 0) {
        logInfo(`No pages found in ${config.router.directory}/`);
        return;
      }

      logBanner(config.name);

      // ── Pages ────────────────────────────────────────────────────────────
      console.log(`  ${chalk.hex("#64748b")("Pages")}\n`);
      for (const r of rawRoutes) {
        const rel = path.relative(projectRoot, r.filePath);
        console.log(
          `  ${chalk.hex("#64748b")("○")}  ${chalk.hex("#6366f1").bold("GET")}  ` +
            `${chalk.hex("#e2e8f0")(r.urlPath.padEnd(28))}  ${chalk.hex("#475569")(rel)}`,
        );
      }

      // ── xscript ──────────────────────────────────────────────────────────
      const allScripts: Array<{
        method: string;
        routePath: string;
        file: string;
        page: string;
      }> = [];

      for (const r of rawRoutes) {
        try {
          const document = parser.parseFile(r.filePath, config);
          for (const node of document.collectXPlusNodes()) {
            if (node.getNodeInfo().name !== "xscript") continue;
            const attrs = node.getNodeData().attributes as any;
            allScripts.push({
              method: (attrs.method ?? "GET").toUpperCase(),
              routePath: attrs.path ?? "?",
              file: attrs.file ?? "?",
              page: r.urlPath,
            });
          }
        } catch {
          /* check handles parse errors */
        }
      }

      if (allScripts.length > 0) {
        console.log(`\n  ${chalk.hex("#64748b")("API  (xscript)")}\n`);

        const seen = new Set<string>();
        for (const s of allScripts) {
          const key = `${s.method}:${s.routePath}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const badge = methodBadge(s.method);
          console.log(
            `  ${chalk.hex("#a78bfa")("λ")}  ${badge}  ` +
              `${chalk.hex("#e2e8f0")(s.routePath.padEnd(28))}  ${chalk.hex("#475569")(s.file)}` +
              `  ${chalk.hex("#334155")("via " + s.page)}`,
          );
        }

        console.log(
          `\n  ${chalk.hex("#64748b")(`${rawRoutes.length} page(s) · ${seen.size} API endpoint(s)`)}\n`,
        );
      } else {
        console.log(
          `\n  ${chalk.hex("#64748b")(`${rawRoutes.length} page(s) · no xscript routes`)}\n`,
        );
      }
    });
}

function methodBadge(method: string): string {
  const colors: Record<string, string> = {
    GET: "#6366f1",
    POST: "#f59e0b",
    PUT: "#3b82f6",
    PATCH: "#06b6d4",
    DELETE: "#ef4444",
  };
  return chalk.hex(colors[method] ?? "#94a3b8").bold(method.padEnd(6));
}
