import path from "path";
import { Command } from "commander";
import chalk from "chalk";

import { loadConfig, findConfig } from "../../config";
import { NodeRegistry } from "../../node";
import { XPlusParser } from "../../parser";
import { XPlusRouter } from "../../router";
import {
  logBanner,
  logFatalError,
  logSuccess,
  logInfo,
} from "../../server/logger";

interface CheckResult {
  route: string;
  file: string;
  ok: boolean;
  error?: string;
  xscripts: number;
}

export function registerCheck(program: Command): void {
  program
    .command("check")
    .description("Parse all .xp files and report errors without building")
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

      let routes;
      try {
        routes = router.discoverRoutes();
      } catch (err: any) {
        logFatalError(err.message);
        process.exit(1);
      }

      if (routes.length === 0) {
        logInfo(`No pages found in ${config.router.directory}/`);
        return;
      }

      logBanner(config.name);
      logInfo(
        `Checking ${routes.length} page(s) in ${config.router.directory}/`,
      );
      console.log("");

      const results: CheckResult[] = [];

      for (const route of routes) {
        const rel = path.relative(projectRoot, route.filePath);
        try {
          const document = parser.parseFile(route.filePath, config);
          const xscripts = document
            .collectXPlusNodes()
            .filter((n) => n.getNodeInfo().name === "xscript").length;
          results.push({ route: route.urlPath, file: rel, ok: true, xscripts });
        } catch (err: any) {
          results.push({
            route: route.urlPath,
            file: rel,
            ok: false,
            error: err.message,
            xscripts: 0,
          });
        }
      }

      // Print results
      for (const r of results) {
        const status = r.ok
          ? chalk.hex("#34d399")("✔")
          : chalk.hex("#f87171")("✖");
        const route = r.ok
          ? chalk.hex("#e2e8f0")(r.route.padEnd(28))
          : chalk.hex("#f87171")(r.route.padEnd(28));
        const file = chalk.hex("#475569")(r.file);
        const xstr =
          r.xscripts > 0 ? "  " + chalk.hex("#a78bfa")(`λ ${r.xscripts}`) : "";

        console.log(`  ${status}  ${route}  ${file}${xstr}`);

        if (!r.ok && r.error) {
          console.log(
            `     ${chalk.hex("#64748b")("│")}  ${chalk.hex("#f87171")(r.error)}`,
          );
        }
      }

      console.log("");

      const passed = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok).length;
      const scripts = results.reduce((a, r) => a + r.xscripts, 0);

      if (failed === 0) {
        logSuccess(
          `${passed} page(s) valid` +
            (scripts > 0 ? `  ·  ${scripts} xscript route(s)` : ""),
        );
      } else {
        console.log(
          `  ${chalk.hex("#f87171")("✖")}  ${chalk.hex("#f87171")(failed + " error(s)")}  ${chalk.hex("#64748b")("·")}  ${chalk.hex("#64748b")(passed + " passed")}`,
        );
        process.exit(1);
      }

      console.log("");
    });
}
