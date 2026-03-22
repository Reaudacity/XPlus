import { XPlusPlugin } from "../index";
import { tailwindcssPlugin } from "./tailwindcss";
import { metaPlugin } from "./meta";

/**
 * Registry of all plugins that ship with X+.
 *
 * Accessed via the `xplus:<name>` specifier in xplus.yml:
 *
 *   plugins:
 *     - "xplus:tailwindcss"
 *     - "xplus:meta"
 *
 * To add a new built-in plugin:
 *   1. Create `src/plugins/builtin/<name>.ts` exporting an `XPlusPlugin`
 *   2. Import and register it here
 */
const BUILTIN_REGISTRY: Record<string, XPlusPlugin> = {
  tailwindcss: tailwindcssPlugin,
  meta: metaPlugin,
};

/**
 * Resolves a built-in plugin by name (without the `xplus:` prefix).
 * Returns null if no built-in with that name is registered.
 */
export function resolveBuiltin(name: string): XPlusPlugin | null {
  return BUILTIN_REGISTRY[name] ?? null;
}

/** Returns a sorted list of all registered built-in plugin names. */
export function listBuiltins(): string[] {
  return Object.keys(BUILTIN_REGISTRY).sort();
}
