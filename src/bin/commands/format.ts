import fs from "fs";
import path from "path";
import { Command } from "commander";
import chalk from "chalk";

import { loadConfig, findConfig } from "../../config";
import { XPlusRouter } from "../../router";
import {
  logSuccess,
  logInfo,
  logFatalError,
  logWarn,
} from "../../server/logger";
import prettier from "prettier";
import xmlPlugin from "@prettier/plugin-xml";

/**
 * Collects every .xp file under a directory recursively.
 * Covers app/, components/, and any other directories the user points at.
 */
function collectXpFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectXpFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".xp")) {
      results.push(full);
    }
  }

  return results;
}

export function registerFormat(program: Command): void {
  program
    .command("format [files...]")
    .description("Format .xp files using Prettier with the XML plugin")
    .option("-c, --config <path>", "Path to xplus.yml")
    .option(
      "--check",
      "Check formatting without writing — exits 1 if any file would change",
    )
    .option("--no-color", "Disable colour output")
    .action(
      async (files: string[], opts: { config?: string; check?: boolean }) => {
        // ── Collect target files ───────────────────────────────────────────────

        let targets: string[];

        if (files.length > 0) {
          // Explicit file/glob arguments — resolve and filter to .xp only
          targets = files
            .map((f) => path.resolve(process.cwd(), f))
            .filter((f) => f.endsWith(".xp") && fs.existsSync(f));
        } else {
          // No files given — discover from project config
          const configPath = opts.config ?? findConfig() ?? "xplus.yml";
          let config;
          try {
            config = loadConfig(configPath);
          } catch (err: any) {
            logFatalError(err.message);
            process.exit(1);
          }

          const projectRoot = process.cwd();
          targets = [
            ...collectXpFiles(
              path.resolve(projectRoot, config.router.directory),
            ),
            ...collectXpFiles(
              path.resolve(projectRoot, config.components.directory),
            ),
          ];
        }

        if (targets.length === 0) {
          logInfo("No .xp files found.");
          return;
        }

        const mode = opts.check ? "check" : "write";
        logInfo(
          `${mode === "check" ? "Checking" : "Formatting"} ` +
            chalk.hex("#94a3b8")(`${targets.length} file(s)`) +
            chalk.hex("#475569")(" with Prettier"),
        );
        console.log("");

        // ── Prettier options for .xp files ────────────────────────────────────
        // .xp files are XML — we use the xml parser from @prettier/plugin-xml.
        // These options match a sensible default; a .prettierrc in the project
        // root will be merged automatically by prettier.resolveConfig().

        const basePrettierOptions: Record<string, unknown> = {
          parser: "xml",
          plugins: [xmlPlugin],
          // XML-specific
          xmlSelfClosingSpace: true, // <xscript ... /> not <xscript.../>
          xmlWhitespaceSensitivity: "ignore",
          printWidth: 100,
          tabWidth: 2,
        };

        // ── Format / check each file ───────────────────────────────────────────

        let changed = 0;
        let unchanged = 0;
        let errors = 0;

        for (const filePath of targets) {
          const rel = path.relative(process.cwd(), filePath);
          const source = fs.readFileSync(filePath, "utf-8");

          try {
            // Merge with any .prettierrc the project has
            const resolvedConfig =
              (await prettier.resolveConfig(filePath)) ?? {};
            const options = {
              ...basePrettierOptions,
              ...resolvedConfig,
              // These two must always be enforced
              parser: "xml",
              plugins: [
                xmlPlugin,
                ...(Array.isArray(resolvedConfig.plugins)
                  ? resolvedConfig.plugins
                  : []),
              ],
            } as prettier.Config;

            const formatted = await prettier.format(source, options);

            if (mode === "check") {
              if (formatted !== source) {
                console.log(
                  `  ${chalk.hex("#f59e0b")("✖")}  ${chalk.hex("#e2e8f0")(rel)}`,
                );
                changed++;
              } else {
                console.log(
                  `  ${chalk.hex("#34d399")("✔")}  ${chalk.hex("#64748b")(rel)}`,
                );
                unchanged++;
              }
            } else {
              if (formatted !== source) {
                fs.writeFileSync(filePath, formatted, "utf-8");
                console.log(
                  `  ${chalk.hex("#34d399")("+")}  ${chalk.hex("#e2e8f0")(rel)}`,
                );
                changed++;
              } else {
                console.log(
                  `  ${chalk.hex("#475569")("·")}  ${chalk.hex("#475569")(rel)}`,
                );
                unchanged++;
              }
            }
          } catch (err: any) {
            console.log(
              `  ${chalk.hex("#f87171")("✖")}  ${chalk.hex("#f87171")(rel)}  ` +
                chalk.hex("#475569")(err.message.split("\n")[0]),
            );
            errors++;
          }
        }

        // ── Summary ────────────────────────────────────────────────────────────

        console.log("");

        if (mode === "check") {
          if (changed === 0) {
            logSuccess(`All ${unchanged} file(s) are correctly formatted.`);
          } else {
            console.log(
              `  ${chalk.hex("#f59e0b")("▲")}  ` +
                chalk.hex("#f59e0b")(
                  `${changed} file(s) would be reformatted`,
                ) +
                chalk.hex("#64748b")(`, ${unchanged} unchanged`),
            );
            if (errors > 0) logWarn(`${errors} file(s) had parse errors`);
            process.exit(1); // non-zero so CI fails
          }
        } else {
          if (changed > 0) {
            logSuccess(
              `Formatted ${changed} file(s)${unchanged > 0 ? `, ${unchanged} unchanged` : ""}.`,
            );
          } else {
            logSuccess(`All ${unchanged} file(s) already formatted.`);
          }
          if (errors > 0)
            logWarn(`${errors} file(s) had parse errors and were skipped.`);
        }

        console.log("");
      },
    );
}
