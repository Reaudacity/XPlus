import path from "path";
import fs from "fs";
import { Command } from "commander";
import chalk from "chalk";

import { loadConfig, findConfig } from "../../config";
import { XPDirectory } from "../../xp-dir";
import { XPlusRouter } from "../../router";
import { logBanner, logFatalError } from "../../server/logger";

export function registerInfo(program: Command): void {
  program
    .command("info")
    .description("Show project configuration and workspace status")
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
      const xpDir = new XPDirectory(projectRoot);

      let routeCount = 0;
      try {
        const router = new XPlusRouter(
          path.resolve(projectRoot, config.router.directory),
        );
        routeCount = router.discoverRoutes().length;
      } catch {
        /* app dir may not exist yet */
      }

      const workspaceExists = fs.existsSync(xpDir.root);
      const transpileFileCount = fs.existsSync(xpDir.transpileDir)
        ? fs.readdirSync(xpDir.transpileDir).length
        : 0;
      const packedFileCount = fs.existsSync(xpDir.packedDir)
        ? fs.readdirSync(xpDir.packedDir).length
        : 0;

      logBanner(config.name);

      printRow("Name", chalk.hex("#e2e8f0")(config.name));
      printRow("Description", chalk.hex("#94a3b8")(config.description));
      printRow("App dir", chalk.hex("#64748b")(config.router.directory + "/"));
      printRow("Pages", chalk.hex("#a78bfa")(String(routeCount)));

      console.log("");

      printRow(
        ".xp/ workspace",
        workspaceExists
          ? chalk.hex("#34d399")("initialised")
          : chalk.hex("#475569")("not initialised"),
      );

      if (workspaceExists) {
        printRow(
          "  transpile cache",
          chalk.hex("#64748b")(
            `${transpileFileCount} file(s)  →  .xp/runtimeOnly/transpile/`,
          ),
        );
        printRow(
          "  packed bundles",
          chalk.hex("#64748b")(`${packedFileCount} file(s)  →  .xp/packed/`),
        );
      }

      console.log("");
    });
}

function printRow(label: string, value: string): void {
  const padded = (label + ":").padEnd(22);
  console.log(`  ${chalk.hex("#64748b")(padded)} ${value}`);
}
