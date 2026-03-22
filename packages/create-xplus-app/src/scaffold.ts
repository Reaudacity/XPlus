import fs from "fs";
import path from "path";
import { execSync, spawnSync } from "child_process";
import { Listr } from "listr2";
import chalk from "chalk";

import {
  ScaffoldOptions,
  tplXplusYml,
  tplRootPage,
  tplHandlerTS,
  tplHandlerJS,
  tplPackageJson,
  tplTsConfig,
  tplPrettierRc,
  tplPrettierIgnore,
  tplGitIgnore,
} from "./templates";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScaffoldResult {
  createdFiles: string[];
  targetDir:    string;
}

interface TaskContext {
  targetDir: string;
  created:   string[];
}

// ── Main scaffold function ────────────────────────────────────────────────────

export async function scaffold(
  opts:      ScaffoldOptions,
  targetDir: string,
): Promise<ScaffoldResult> {
  const abs = path.resolve(process.cwd(), targetDir);

  const ctx: TaskContext = { targetDir: abs, created: [] };

  const tasks = new Listr<TaskContext>(
    [
      // ── Directory ──────────────────────────────────────────────────────────
      {
        title: "Create project directory",
        task:  (ctx) => {
          fs.mkdirSync(ctx.targetDir, { recursive: true });
        },
      },

      // ── Project files ──────────────────────────────────────────────────────
      {
        title: "Write project files",
        task:  (ctx, task) =>
          task.newListr(buildFileTask(opts, ctx), { concurrent: false }),
      },

      // ── Git ────────────────────────────────────────────────────────────────
      ...(opts.initGit
        ? [{
            title: "Initialize git repository",
            task:  (ctx: TaskContext) => {
              try {
                execSync("git init", { cwd: ctx.targetDir, stdio: "ignore" });
                execSync("git add -A", { cwd: ctx.targetDir, stdio: "ignore" });
              } catch {
                // git may not be installed — silently skip
              }
            },
          }]
        : []),

      // ── Install dependencies ───────────────────────────────────────────────
      {
        title: "Install dependencies",
        task:  (ctx, task) =>
          task.newListr(buildInstallTasks(opts, ctx), { concurrent: false }),
      },
    ],
    {
      ctx,
      concurrent:  false,
      rendererOptions: { collapseSubtasks: false },
    },
  );

  await tasks.run();

  return { createdFiles: ctx.created, targetDir: abs };
}

// ── File tasks ────────────────────────────────────────────────────────────────

function buildFileTask(opts: ScaffoldOptions, ctx: TaskContext) {
  const ext = opts.language === "typescript" ? "ts" : "js";

  const files: Record<string, string> = {
    "xplus.yml":             tplXplusYml(opts),
    "app/page.xp":           tplRootPage(opts),
    [`api/hello.${ext}`]:    opts.language === "typescript" ? tplHandlerTS() : tplHandlerJS(),
    ".gitignore":            tplGitIgnore(),
    "package.json":          tplPackageJson(opts),
    ...(opts.language === "typescript" ? { "tsconfig.json": tplTsConfig() } : {}),
    ...(opts.usePrettier
      ? { ".prettierrc": tplPrettierRc(), ".prettierignore": tplPrettierIgnore() }
      : {}),
  };

  return Object.entries(files).map(([rel, content]) => ({
    title: chalk.hex("#475569")(rel),
    task:  () => {
      const full = path.join(ctx.targetDir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, "utf-8");
      ctx.created.push(rel);
    },
  }));
}

// ── Install tasks ─────────────────────────────────────────────────────────────

function buildInstallTasks(opts: ScaffoldOptions, ctx: TaskContext) {
  const pm  = opts.packageManager;
  const cwd = ctx.targetDir;

  // Dev dependencies to install
  const devDeps: string[] = ["xmplus"];

  if (opts.language === "typescript") {
    devDeps.push("typescript", "@types/node", "@types/express");
  }

  if (opts.usePrettier) {
    devDeps.push("prettier", "@prettier/plugin-xml");
  }

  const addCmd = buildAddCommand(pm, devDeps, true);

  return [
    {
      title: `${pm} install`,
      task:  () => {
        const result = spawnSync(pm, ["install"], {
          cwd,
          stdio: "ignore",
          shell: process.platform === "win32",
        });
        if (result.status !== 0) {
          throw new Error(`${pm} install failed (exit ${result.status})`);
        }
      },
    },
    {
      title: `Add devDependencies: ${devDeps.join(", ")}`,
      task:  () => {
        const result = spawnSync(addCmd.cmd, addCmd.args, {
          cwd,
          stdio: "ignore",
          shell: process.platform === "win32",
        });
        if (result.status !== 0) {
          throw new Error(`Failed to add devDependencies`);
        }
      },
    },
  ];
}

function buildAddCommand(
  pm:      string,
  deps:    string[],
  isDev:   boolean,
): { cmd: string; args: string[] } {
  const devFlag: Record<string, string> = {
    npm:  "--save-dev",
    pnpm: "--save-dev",
    yarn: "--dev",
    bun:  "--dev",
  };

  const addVerb: Record<string, string> = {
    npm:  "install",
    pnpm: "add",
    yarn: "add",
    bun:  "add",
  };

  return {
    cmd:  pm,
    args: [addVerb[pm] ?? "add", ...(isDev ? [devFlag[pm] ?? "--save-dev"] : []), ...deps],
  };
}