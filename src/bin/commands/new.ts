import fs from "fs";
import path from "path";
import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";

import { loadConfig, findConfig } from "../../config";
import {
  newPage,
  newHandlerTS,
  newHandlerJS,
  newPluginTS,
  newPluginJS,
} from "../../scaffold";
import { logSuccess, logFatalError, logInfo } from "../../server/logger";

export function registerNew(program: Command): void {
  program
    .command("new <type> <n>")
    .description("Scaffold a new resource  (types: page, handler, plugin)")
    .option("-c, --config <path>", "Path to xplus.yml")
    .option("--js", "Generate JavaScript instead of TypeScript")
    .action(
      async (
        type: string,
        name: string,
        opts: { config?: string; js?: boolean },
      ) => {
        const configPath = opts.config ?? findConfig() ?? "xplus.yml";
        let config;
        try {
          config = loadConfig(configPath);
        } catch {
          logFatalError(
            "Could not find xplus.yml. Run " +
              chalk.hex("#c084fc")("x+ init") +
              " first.",
          );
          process.exit(1);
        }

        const projectRoot = process.cwd();

        switch (type.toLowerCase()) {
          case "page":
            await newPageCommand(
              name,
              projectRoot,
              config.router.directory,
              opts,
            );
            break;
          case "handler":
          case "script":
            await newHandlerCommand(name, projectRoot, opts);
            break;
          case "plugin":
            await newPluginCommand(name, projectRoot, opts);
            break;
          default:
            logFatalError(
              `Unknown type "${type}". Use ` +
                `${chalk.hex("#c084fc")("page")}, ${chalk.hex("#c084fc")("handler")}, ` +
                `or ${chalk.hex("#c084fc")("plugin")}.`,
            );
            process.exit(1);
        }
      },
    );
}

// ── x+ new page <route> ───────────────────────────────────────────────────────

async function newPageCommand(
  route: string,
  projectRoot: string,
  appDir: string,
  _opts: { js?: boolean },
): Promise<void> {
  const normalised = route.replace(/^\//, "").replace(/\/$/, "");
  const urlPath = "/" + normalised;
  const lastSegment = normalised.split("/").pop() ?? normalised;
  const defaultTitle = toTitle(lastSegment);

  const filePath = path.join(projectRoot, appDir, normalised, "page.xp");

  if (fs.existsSync(filePath)) {
    logFatalError(
      `${urlPath} already exists at ${path.relative(projectRoot, filePath)}`,
    );
    process.exit(1);
  }

  const { description } = await inquirer.prompt([
    {
      type: "input",
      name: "description",
      message: "Page description",
      default: defaultTitle,
    },
  ]);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, newPage(defaultTitle, description), "utf-8");

  console.log("");
  logSuccess(
    `Page ${chalk.hex("#e2e8f0")(urlPath)}  ` +
      `${chalk.hex("#475569")("→")}  ` +
      `${chalk.hex("#64748b")(path.relative(projectRoot, filePath))}`,
  );
  console.log("");
}

// ── x+ new handler <n> ────────────────────────────────────────────────────────

async function newHandlerCommand(
  name: string,
  projectRoot: string,
  opts: { js?: boolean },
): Promise<void> {
  const tsconfigExists = fs.existsSync(path.join(projectRoot, "tsconfig.json"));
  const routePath = "/" + name.replace(/^\//, "");
  const slug = name.replace(/^\//, "").replace(/\//g, "-");

  const questions: any[] = [];

  // Only ask language if --js not passed and no tsconfig detected
  if (!opts.js && !tsconfigExists) {
    questions.push({
      type: "list",
      name: "language",
      message: "Language",
      choices: [
        { name: "TypeScript  (recommended)", value: "typescript" },
        { name: "JavaScript", value: "javascript" },
      ],
      default: "typescript",
    });
  }

  questions.push({
    type: "list",
    name: "method",
    message: "HTTP method",
    choices: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    default: "GET",
  });

  const answers = await inquirer.prompt(questions);

  const useJS =
    opts.js || (!tsconfigExists && answers.language === "javascript");
  const ext = useJS ? "js" : "ts";
  const method = answers.method as string;
  const filePath = path.join(projectRoot, "api", `${slug}.${ext}`);

  if (fs.existsSync(filePath)) {
    logFatalError(
      `Handler already exists: ${path.relative(projectRoot, filePath)}`,
    );
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    useJS ? newHandlerJS(routePath) : newHandlerTS(routePath),
    "utf-8",
  );

  console.log("");
  logSuccess(
    `Handler ${chalk.hex("#e2e8f0")(method + " " + routePath)}  ` +
      `${chalk.hex("#475569")("→")}  ` +
      `${chalk.hex("#64748b")(path.relative(projectRoot, filePath))}`,
  );
  console.log("");
  logInfo("Add to your page.xp:");
  console.log(
    `\n    ${chalk.hex("#64748b")(
      `<xscript path="${routePath}" file="${path.relative(projectRoot, filePath)}" method="${method}"></xscript>`,
    )}\n`,
  );
}

// ── x+ new plugin <name> ──────────────────────────────────────────────────────

async function newPluginCommand(
  name: string,
  projectRoot: string,
  opts: { js?: boolean },
): Promise<void> {
  const tsconfigExists = fs.existsSync(path.join(projectRoot, "tsconfig.json"));

  const questions: any[] = [];

  if (!opts.js && !tsconfigExists) {
    questions.push({
      type: "list",
      name: "language",
      message: "Language",
      choices: [
        { name: "TypeScript  (recommended)", value: "typescript" },
        { name: "JavaScript", value: "javascript" },
      ],
      default: "typescript",
    });
  }

  const answers = questions.length > 0 ? await inquirer.prompt(questions) : {};

  const useJS =
    opts.js || (!tsconfigExists && answers.language === "javascript");
  const ext = useJS ? "js" : "ts";
  const slug = name
    .replace(/\s+/g, "-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  const filePath = path.join(projectRoot, "plugins", `${slug}.${ext}`);

  if (fs.existsSync(filePath)) {
    logFatalError(
      `Plugin already exists: ${path.relative(projectRoot, filePath)}`,
    );
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    useJS ? newPluginJS(name) : newPluginTS(name),
    "utf-8",
  );

  const relPath = path.relative(projectRoot, filePath);

  console.log("");
  logSuccess(
    `Plugin ${chalk.hex("#e2e8f0")(name)}  ` +
      `${chalk.hex("#475569")("→")}  ` +
      `${chalk.hex("#64748b")(relPath)}`,
  );
  console.log("");
  logInfo("Register it in xplus.yml:");
  console.log(
    `\n    ${chalk.hex("#64748b")(`plugins:\n      - "./${relPath}"`)}\n`,
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function toTitle(str: string): string {
  return str.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
