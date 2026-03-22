import fs from "fs";
import path from "path";
import chokidar from "chokidar";

// ── Public prefix ─────────────────────────────────────────────────────────────

/**
 * Only variables prefixed with X_PUBLIC_ are safe to expose to the browser.
 * All other variables are server-only — accessible in xscript handlers and
 * middleware but never inlined into page HTML or injected into client JS.
 */
export const PUBLIC_PREFIX = "X_PUBLIC_";

export function isPublicVar(key: string): boolean {
  return key.startsWith(PUBLIC_PREFIX);
}

/**
 * Returns a copy of process.env containing only X_PUBLIC_* keys.
 * Safe to serialize and send to the client.
 */
export function getPublicEnv(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (isPublicVar(key) && value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

// ── Loader ────────────────────────────────────────────────────────────────────

/**
 * Loads a .env file and merges into process.env.
 * Existing process.env values are NOT overwritten (same behaviour as dotenv).
 * Returns the set of keys that were loaded.
 */
export function loadEnv(projectRoot: string): Set<string> {
  const envFile = path.join(projectRoot, ".env");
  if (!fs.existsSync(envFile)) return new Set();

  const raw = fs.readFileSync(envFile, "utf-8");
  const loaded = new Set<string>();

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
    loaded.add(key);
  }

  return loaded;
}

export function reloadEnv(
  projectRoot: string,
  prevKeys: Set<string>,
): Set<string> {
  for (const key of prevKeys) delete process.env[key];
  return loadEnv(projectRoot);
}

// ── Watcher ───────────────────────────────────────────────────────────────────

export function watchEnv(
  projectRoot: string,
  onReload: () => void,
): { close: () => Promise<void>; keys: Set<string> } {
  let keys = loadEnv(projectRoot);
  const envFile = path.join(projectRoot, ".env");
  const watcher = chokidar.watch(envFile, { ignoreInitial: true });

  watcher.on("change", () => {
    keys = reloadEnv(projectRoot, keys);
    onReload();
  });
  watcher.on("add", () => {
    keys = reloadEnv(projectRoot, keys);
    onReload();
  });

  return { keys, close: () => watcher.close() };
}

// ── Resolver ──────────────────────────────────────────────────────────────────

/**
 * Returns the value of an environment variable for use in <xenv> page nodes.
 *
 * ONLY X_PUBLIC_* keys are allowed — these are safe to bake into HTML.
 * Accessing a server-only key returns the fallback and logs a warning.
 */
export function getPublicEnvValue(key: string, fallback = ""): string {
  if (!isPublicVar(key)) {
    // Return fallback silently — the warning is emitted at the node level
    return fallback;
  }
  return process.env[key] ?? fallback;
}

/**
 * Returns the value of any environment variable for server-side use only
 * (xscript handlers, middleware, xdata fetchers).
 */
export function getServerEnvValue(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}
