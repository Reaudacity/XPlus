import boxen from "boxen";
import chalk from "chalk";
import { XPlusRoute } from "../router";

// ── Symbols & palette ────────────────────────────────────────────────────────

const SYM = {
  dot: "●",
  circle: "○",
  lambda: "λ",
  arrow: "→",
  warn: "▲",
  error: "✖",
  check: "✔",
  spinner: "⟳",
  pipe: "│",
  corner: "╭",
  floor: "╰",
  hline: "─",
};

// ── Startup banner ────────────────────────────────────────────────────────────

export function logBanner(name: string, version = "1.0.0"): void {
  console.log("");
  console.log(
    "  " +
      chalk.bold.hex("#c084fc")("X+") +
      " " +
      chalk.hex("#e2e8f0")(name) +
      " " +
      chalk.hex("#64748b")(`v${version}`),
  );
  console.log("");
}

// ── Ready banner ─────────────────────────────────────────────────────────────

export function logReady(
  port: number,
  routes: XPlusRoute[],
  xscriptCount: number,
): void {
  const local = chalk.hex("#38bdf8").underline(`http://localhost:${port}`);
  const routes_ = chalk.hex("#94a3b8")(
    `${routes.length} page(s) · ${xscriptCount} API endpoint(s)`,
  );
  const mode =
    chalk.hex("#a78bfa")("on-demand") +
    chalk.hex("#64748b")("  · builds on first request, cached until changed");

  const content = [
    `${chalk.bold("Local")}     ${local}`,
    "",
    `${chalk.bold("Routes")}    ${routes_}`,
    `${chalk.bold("Mode")}      ${mode}`,
  ].join("\n");

  console.log(
    boxen(content, {
      padding: { top: 0, bottom: 0, left: 1, right: 2 },
      margin: { top: 0, bottom: 1, left: 2, right: 0 },
      borderStyle: "round",
      borderColor: "#334155",
    }),
  );
}

// ── Route table ───────────────────────────────────────────────────────────────

export function logRouteTable(routes: XPlusRoute[]): void {
  if (routes.length === 0) return;

  console.log(`  ${chalk.hex("#64748b")("Pages")}`);
  console.log("");

  for (const route of routes) {
    const sym = chalk.hex("#64748b")(SYM.circle);
    const badge = chalk.hex("#6366f1").bold("GET");
    const path = chalk.hex("#e2e8f0")(route.urlPath);
    console.log(`    ${sym}  ${badge}  ${path}`);
  }

  console.log("");
}

// ── xscript route table ───────────────────────────────────────────────────────

interface XScriptEntry {
  method: string;
  routePath: string;
  file: string;
}

export function logXScriptTable(entries: XScriptEntry[]): void {
  if (entries.length === 0) return;

  console.log(`  ${chalk.hex("#64748b")("API  (xscript)")}`);
  console.log("");

  for (const entry of entries) {
    const sym = chalk.hex("#a78bfa")(SYM.lambda);
    const badge = methodBadge(entry.method);
    const route = chalk.hex("#e2e8f0")(entry.routePath.padEnd(24));
    const file = chalk.hex("#475569")(entry.file);
    console.log(`    ${sym}  ${badge}  ${route}  ${file}`);
  }

  console.log("");
}

// ── Request log ───────────────────────────────────────────────────────────────

export type BuildResult = "cached" | "built" | "error";

export function logRequest(
  method: string,
  urlPath: string,
  status: number,
  ms: number,
  buildResult: BuildResult,
): void {
  const time = formatMs(ms);
  const statusStr = statusColor(status)(String(status));
  const methodStr = chalk.hex("#64748b")(method.padEnd(4));
  const pathStr = chalk.hex("#e2e8f0")(urlPath);
  const indicator = buildIndicator(buildResult);

  console.log(
    `  ${indicator}  ${methodStr} ${pathStr}  ${statusStr}  ${chalk.hex("#475569")(time)}`,
  );
}

// ── Build events ─────────────────────────────────────────────────────────────

export function logBuilding(urlPath: string): void {
  console.log(
    `  ${chalk.hex("#f59e0b")(SYM.spinner)}  ${chalk.hex("#64748b")("building")}  ${chalk.hex("#94a3b8")(urlPath)}`,
  );
}

export function logBuilt(urlPath: string, ms: number): void {
  console.log(
    `  ${chalk.hex("#34d399")(SYM.check)}  ${chalk.hex("#64748b")("built")}     ${chalk.hex("#e2e8f0")(urlPath)}  ${chalk.hex("#475569")(formatMs(ms))}`,
  );
}

export function logCacheInvalidated(urlPath: string): void {
  console.log(
    `  ${chalk.hex("#f59e0b")(SYM.warn)}  ${chalk.hex("#64748b")("changed")}   ${chalk.hex("#94a3b8")(urlPath)}`,
  );
}

// ── Errors ────────────────────────────────────────────────────────────────────

export function logError(urlPath: string, message: string): void {
  console.log(
    `  ${chalk.red(SYM.error)}  ${chalk.red("error")}     ${chalk.hex("#94a3b8")(urlPath)}`,
  );
  console.log(
    `     ${chalk.hex("#64748b")(SYM.pipe)}  ${chalk.hex("#f87171")(message)}`,
  );
}

export function logStartupError(message: string): void {
  console.log(`\n  ${chalk.red(SYM.error)}  ${chalk.red(message)}\n`);
}

export function logWarn(message: string): void {
  console.log(
    `  ${chalk.hex("#f59e0b")(SYM.warn)}  ${chalk.hex("#94a3b8")(message)}`,
  );
}

// ── xscript registration ──────────────────────────────────────────────────────

export function logXScriptRegistered(method: string, routePath: string): void {
  const badge = methodBadge(method);
  console.log(
    `  ${chalk.hex("#a78bfa")(SYM.lambda)}  ${badge}  ${chalk.hex("#e2e8f0")(routePath)}`,
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function buildIndicator(result: BuildResult): string {
  switch (result) {
    case "cached":
      return chalk.hex("#64748b")(SYM.circle);
    case "built":
      return chalk.hex("#34d399")(SYM.dot);
    case "error":
      return chalk.red(SYM.error);
  }
}

function methodBadge(method: string): string {
  const colors: Record<string, string> = {
    GET: "#6366f1",
    POST: "#f59e0b",
    PUT: "#3b82f6",
    PATCH: "#06b6d4",
    DELETE: "#ef4444",
  };
  const color = colors[method.toUpperCase()] ?? "#94a3b8";
  return chalk.hex(color).bold(method.toUpperCase().padEnd(6));
}

function statusColor(status: number): typeof chalk {
  if (status < 300) return chalk.hex("#34d399");
  if (status < 400) return chalk.hex("#f59e0b");
  if (status < 500) return chalk.hex("#f87171");
  return chalk.red;
}

function formatMs(ms: number): string {
  if (ms < 1) return `< 1ms`;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ── Command-level helpers (used by CLI commands) ──────────────────────────────

export function logSuccess(message: string): void {
  console.log(
    `  ${chalk.hex("#34d399")("✔")}  ${chalk.hex("#e2e8f0")(message)}`,
  );
}

export function logInfo(message: string): void {
  console.log(
    `  ${chalk.hex("#64748b")("·")}  ${chalk.hex("#94a3b8")(message)}`,
  );
}

export function logFatalError(message: string): void {
  console.log(`\n  ${chalk.red("✖")}  ${chalk.hex("#f87171")(message)}\n`);
}

export function logFileCreated(relative: string): void {
  console.log(
    `  ${chalk.hex("#34d399")("+")}  ${chalk.hex("#e2e8f0")(relative)}`,
  );
}

export function logFileSkipped(relative: string): void {
  console.log(
    `  ${chalk.hex("#475569")("·")}  ${chalk.hex("#475569")(relative)}  ${chalk.hex("#334155")("already exists")}`,
  );
}
