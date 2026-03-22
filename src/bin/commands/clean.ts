import fs from "fs";
import { Command } from "commander";
import chalk from "chalk";

import { XPDirectory } from "../../xp-dir";
import { confirm } from "../prompt";
import { logSuccess, logInfo } from "../../server/logger";

export function registerClean(program: Command): void {
  program
    .command("clean")
    .description(
      "Remove the .xp/ internal workspace (transpile cache, packed bundles)",
    )
    .option("-f, --force", "Skip confirmation prompt")
    .action(async (opts: { force?: boolean }) => {
      const xpDir = new XPDirectory(process.cwd());

      if (!fs.existsSync(xpDir.root)) {
        logInfo(".xp/ does not exist — nothing to clean.");
        return;
      }

      if (!opts.force) {
        const ok = await confirm(
          `Delete ${chalk.hex("#f59e0b")(".xp/")} and all cached files?`,
          false,
        );
        if (!ok) {
          logInfo("Aborted.");
          return;
        }
      }

      fs.rmSync(xpDir.root, { recursive: true, force: true });
      console.log("");
      logSuccess("Removed .xp/");
      console.log("");
    });
}
