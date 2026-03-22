import path from "path";
import inquirer from "inquirer";
import chalk from "chalk";
import { ScaffoldOptions, Language, PackageManager } from "./templates";

const BUILTIN_PLUGINS: Array<{ name: string; description: string }> = [
  {
    name:        "xplus:tailwindcss",
    description: "Tailwind CSS — JIT if installed locally, CDN otherwise",
  },
  {
    name:        "xplus:meta",
    description: "Auto Open Graph + Twitter Card meta tags",
  },
];

export interface PromptResult extends ScaffoldOptions {
  targetDir: string;
}

export async function runPrompts(dirArg?: string): Promise<PromptResult> {
  const defaultDir  = dirArg ?? ".";
  const defaultName = dirArg ? path.basename(path.resolve(dirArg)) : "my-xplus-app";

  console.log(
    "\n  " +
    chalk.bold.hex("#c084fc")("X+") +
    chalk.hex("#e2e8f0")(" — the server-first markup language") +
    "\n",
  );

  // ── Step 1: Project basics ─────────────────────────────────────────────────

  const basics = await inquirer.prompt([
    {
      type:     "input",
      name:     "name",
      message:  "Project name",
      default:  defaultName,
      validate: (v: string) => v.trim().length > 0 || "Name is required",
    },
    {
      type:    "input",
      name:    "description",
      message: "Description",
      default: (a: { name: string }) => `${a.name} — built with X+`,
    },
    {
      type:    "input",
      name:    "targetDir",
      message: "Output directory",
      default: (a: { name: string }) => dirArg ?? `./${a.name.toLowerCase().replace(/\s+/g, "-")}`,
    },
    {
      type:    "number",
      name:    "port",
      message: "Dev server port",
      default: 3000,
      validate: (v: number) => (v > 0 && v < 65536) || "Must be a valid port (1–65535)",
    },
  ]);

  // ── Step 2: Language & tooling ────────────────────────────────────────────

  const tooling = await inquirer.prompt([
    {
      type:    "list",
      name:    "language",
      message: "Language",
      choices: [
        {
          name:  "TypeScript  " + chalk.hex("#475569")("(recommended)"),
          value: "typescript",
          short: "TypeScript",
        },
        {
          name:  "JavaScript",
          value: "javascript",
          short: "JavaScript",
        },
      ],
      default: "typescript",
    },
    {
      type:    "list",
      name:    "packageManager",
      message: "Package manager",
      choices: [
        { name: "npm",  value: "npm"  },
        { name: "pnpm", value: "pnpm" },
        { name: "yarn", value: "yarn" },
        { name: "bun",  value: "bun"  },
      ],
      default: "npm",
    },
  ]);

  // ── Step 3: Plugins ────────────────────────────────────────────────────────

  const { plugins } = await inquirer.prompt([
    {
      type:    "checkbox",
      name:    "plugins",
      message: "Enable built-in plugins",
      choices: BUILTIN_PLUGINS.map(p => ({
        name:    `${chalk.hex("#a78bfa")(p.name)}  ${chalk.hex("#475569")(p.description)}`,
        value:   p.name,
        short:   p.name,
        checked: false,
      })),
    },
  ]);

  // ── Step 4: Extras ─────────────────────────────────────────────────────────

  const extras = await inquirer.prompt([
    {
      type:    "checkbox",
      name:    "extras",
      message: "Additional setup",
      choices: [
        {
          name:    "Add Prettier  " + chalk.hex("#475569")("(with XML plugin for .xp files)"),
          value:   "prettier",
          short:   "Prettier",
          checked: true,
        },
        {
          name:    "Initialize git repository",
          value:   "git",
          short:   "Git",
          checked: true,
        },
      ],
    },
  ]);

  return {
    name:           basics.name.trim(),
    description:    basics.description.trim(),
    targetDir:      basics.targetDir.trim(),
    port:           basics.port ?? 3000,
    language:       tooling.language as Language,
    packageManager: tooling.packageManager as PackageManager,
    plugins:        plugins as string[],
    usePrettier:    (extras.extras as string[]).includes("prettier"),
    initGit:        (extras.extras as string[]).includes("git"),
  };
}