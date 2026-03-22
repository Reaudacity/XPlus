import fs from "fs";
import path from "path";
import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";

import {
  InitOptions,
  xplusYml,
  rootPage,
  helloHandlerTS,
  helloHandlerJS,
  packageJson,
  tsconfigJson,
  gitignore,
} from "../../scaffold";
import { listBuiltins } from "../../plugins/builtin";
import {
  logBanner,
  logSuccess,
  logInfo,
  logFileCreated,
  logFileSkipped,
} from "../../server/logger";

type Language = "typescript" | "javascript";

export function registerInit(program: Command): void {
  program
    .command("init [directory]")
    .description("Scaffold a new X+ project")
    .option("-y, --yes", "Accept all defaults without prompting")
    .action(async (directory: string | undefined, opts: { yes?: boolean }) => {
      logBanner("New Project");

      const targetDir = path.resolve(process.cwd(), directory ?? ".");
      const isCurrentDir = targetDir === process.cwd();

      // ── Gather answers ────────────────────────────────────────────────────

      let options: InitOptions;

      if (opts.yes) {
        const name = path.basename(targetDir);
        options = {
          name,
          description: `${name} — built with X+`,
          port: 3000,
          language: "typescript",
          plugins: [],
        };
        logInfo("Using defaults (--yes)");
      } else {
        const defaultName = path.basename(targetDir);
        const builtinPlugins = listBuiltins();

        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "name",
            message: "Project name",
            default: defaultName,
            validate: (v: string) => v.trim().length > 0 || "Name is required",
          },
          {
            type: "input",
            name: "description",
            message: "Description",
            default: (a: { name: string }) => `${a.name} — built with X+`,
          },
          {
            type: "number",
            name: "port",
            message: "Dev server port",
            default: 3000,
            validate: (v: number) =>
              (v > 0 && v < 65536) || "Enter a valid port number",
          },
          {
            type: "list",
            name: "language",
            message: "Language",
            choices: [
              { name: "TypeScript  (recommended)", value: "typescript" },
              { name: "JavaScript", value: "javascript" },
            ],
            default: "typescript",
          },
          {
            type: "checkbox",
            name: "plugins",
            message: "Enable plugins",
            choices: builtinPlugins.map((name) => ({
              name: `xplus:${name}`,
              value: `xplus:${name}`,
              checked: false,
            })),
            // Show a hint only when there are plugins available
            ...(builtinPlugins.length === 0 ? { when: () => false } : {}),
          },
        ]);

        options = {
          name: answers.name.trim(),
          description: answers.description.trim(),
          port: answers.port ?? 3000,
          language: answers.language as Language,
          plugins: (answers.plugins ?? []) as string[],
        };
      }

      // ── Confirm if target directory already exists ─────────────────────────

      if (!isCurrentDir && fs.existsSync(targetDir)) {
        const { ok } = await inquirer.prompt([
          {
            type: "confirm",
            name: "ok",
            message: `${chalk.yellow(path.relative(process.cwd(), targetDir))} already exists. Continue?`,
            default: false,
          },
        ]);
        if (!ok) {
          logInfo("Aborted.");
          return;
        }
      }

      // ── Write files ────────────────────────────────────────────────────────

      console.log("");

      const ext = options.language === "typescript" ? "ts" : "js";
      const files: Record<string, string> = {
        "xplus.yml": xplusYml(options),
        "app/page.xp": rootPage(options),
        [`api/hello.${ext}`]:
          options.language === "typescript"
            ? helloHandlerTS()
            : helloHandlerJS(),
        ".gitignore": gitignore(),
        "package.json": packageJson(options),
        ...(options.language === "typescript"
          ? { "tsconfig.json": tsconfigJson() }
          : {}),
      };

      for (const [relative, content] of Object.entries(files)) {
        const full = path.join(targetDir, relative);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        if (fs.existsSync(full)) {
          logFileSkipped(relative);
        } else {
          fs.writeFileSync(full, content, "utf-8");
          logFileCreated(relative);
        }
      }

      // ── Done ──────────────────────────────────────────────────────────────

      console.log("");
      logSuccess("Project ready!");
      if (options.plugins.length > 0) {
        logInfo(`Plugins enabled: ${options.plugins.join(", ")}`);
      }
      console.log("");

      const cdStep = !isCurrentDir
        ? `  ${chalk.hex("#c084fc")("cd")} ${path.relative(process.cwd(), targetDir)}\n`
        : "";

      console.log(
        chalk.hex("#64748b")("  Next steps:\n") +
          cdStep +
          `  ${chalk.hex("#c084fc")("npm install")}\n` +
          `  ${chalk.hex("#c084fc")("xserver")}          ${chalk.hex("#475569")("→ start dev server")}\n` +
          `  ${chalk.hex("#c084fc")("xplus build")}      ${chalk.hex("#475569")("→ build static HTML")}\n`,
      );
    });
}
