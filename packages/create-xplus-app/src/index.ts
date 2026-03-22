#!/usr/bin/env node
import fs from "fs";
import path from "path";
import chalk from "chalk";
import { runPrompts } from "./prompts";
import { scaffold } from "./scaffold";

// ── Version ───────────────────────────────────────────────────────────────────

const VERSION = "1.0.0";

// ── Intercept --help / --version ──────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--version") || args.includes("-v")) {
  console.log(VERSION);
  process.exit(0);
}

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const dirArg = args.find(a => !a.startsWith("-"));

main(dirArg).catch(err => {
  console.error(chalk.red("\n  Error: ") + err.message);
  process.exit(1);
});

async function main(dirArg?: string): Promise<void> {
  // Guard: if a positional dir was given and already exists, warn early
  if (dirArg) {
    const abs = path.resolve(process.cwd(), dirArg);
    if (fs.existsSync(abs) && fs.readdirSync(abs).length > 0) {
      const { default: inquirer } = await import("inquirer");
      const { ok } = await inquirer.prompt([{
        type:    "confirm",
        name:    "ok",
        message: chalk.yellow(`"${dirArg}"`) + " already exists and is not empty. Continue?",
        default: false,
      }]);
      if (!ok) {
        console.log(chalk.hex("#475569")("\n  Aborted.\n"));
        process.exit(0);
      }
    }
  }

  // Gather all options from the user
  const opts = await runPrompts(dirArg);

  console.log("");

  // Run the scaffold tasks
  const result = await scaffold(opts, opts.targetDir);

  // Done
  printSuccess(opts, result.targetDir);
}

// ── Output ────────────────────────────────────────────────────────────────────

function printSuccess(
  opts:      { name: string; language: string; packageManager: string; usePrettier: boolean },
  targetDir: string,
): void {
  const rel        = path.relative(process.cwd(), targetDir);
  const isCurrentDir = rel === "" || rel === ".";
  const pm         = opts.packageManager;

  const devCmd: Record<string, string> = {
    npm:  "npm run dev",
    pnpm: "pnpm dev",
    yarn: "yarn dev",
    bun:  "bun dev",
  };

  const buildCmd: Record<string, string> = {
    npm:  "npm run build",
    pnpm: "pnpm build",
    yarn: "yarn build",
    bun:  "bun build",
  };

  console.log(
    "\n  " +
    chalk.bold.hex("#34d399")("✔") +
    "  " +
    chalk.bold.hex("#e2e8f0")(opts.name) +
    chalk.hex("#64748b")(" created successfully") +
    "\n",
  );

  const steps: string[] = [];
  if (!isCurrentDir) steps.push(`  ${chalk.hex("#c084fc")("cd")} ${rel}`);
  steps.push(`  ${chalk.hex("#c084fc")(devCmd[pm] ?? "xserver")}      ${chalk.hex("#475569")("→ start dev server")}`);
  steps.push(`  ${chalk.hex("#c084fc")(buildCmd[pm] ?? "xplus build")}    ${chalk.hex("#475569")("→ export static HTML")}`);

  console.log(chalk.hex("#64748b")("  Next steps:\n") + steps.join("\n") + "\n");

  console.log(
    chalk.hex("#334155")(
      [
        `  Language:  ${opts.language === "typescript" ? "TypeScript" : "JavaScript"}`,
        `  Prettier:  ${opts.usePrettier ? "yes (with @prettier/plugin-xml for .xp files)" : "no"}`,
        `  Runtime:   xmplus`,
      ].join("\n"),
    ) + "\n",
  );
}

function printHelp(): void {
  const c = chalk.hex("#c084fc");
  const g = chalk.hex("#475569");

  console.log(`
  ${chalk.bold.hex("#c084fc")("create-xplus-app")} ${chalk.hex("#64748b")(`v${VERSION}`)}

  ${chalk.bold("Usage")}
    ${c("npm create xplus-app@latest")}
    ${c("npm create xplus-app@latest")} ${g("<directory>")}
    ${c("npx create-xplus-app")} ${g("<directory>")}

  ${chalk.bold("Options")}
    ${c("-v, --version")}   print version
    ${c("-h, --help")}      show this help
`);
}