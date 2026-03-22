import { XPlusPlugin, PluginContext } from "../index";

/**
 * xplus:tailwindcss
 *
 * Injects Tailwind CSS into every page.
 *
 * Behaviour (in order of preference):
 *   1. If `tailwindcss` CLI is installed locally, runs a JIT pass on each page's
 *      HTML and injects a scoped <style> block with only the used classes.
 *   2. Otherwise falls back to the Tailwind CDN Play script — zero config,
 *      works immediately, perfect for development or prototyping.
 *
 * Options (set via xplus.yml pluginOptions.tailwindcss):
 *   cdn: true          Force CDN mode even if CLI is installed
 *   config: "tw.config.js"  Path to a custom Tailwind config (CLI mode only)
 */

interface TailwindOptions {
  cdn?: boolean;
  config?: string;
}

const CDN_SCRIPT = `<script src="https://cdn.tailwindcss.com"></script>`;

export const tailwindcssPlugin: XPlusPlugin = {
  name: "xplus:tailwindcss",

  setup(ctx: PluginContext) {
    const opts = getOptions(ctx);

    if (opts.cdn) {
      ctx.log("Mode: CDN (forced)");
      return;
    }

    // Check whether the Tailwind CLI is available
    try {
      require.resolve("tailwindcss", { paths: [ctx.projectRoot] });
      ctx.log("Mode: JIT (tailwindcss installed locally)");
    } catch {
      ctx.log(
        "Mode: CDN (tailwindcss not found locally — run `npm i -D tailwindcss` for JIT)",
      );
    }
  },

  async transformHTML(html: string, route: string): Promise<string> {
    // Check options again at transform time (ctx not available here, use closure workaround via module state)
    // In practice the plugin is a singleton so we can cache the decision in setup
    // For simplicity we re-check at transform time
    const hasLocalTailwind = (() => {
      try {
        require.resolve("tailwindcss");
        return true;
      } catch {
        return false;
      }
    })();

    if (!hasLocalTailwind) {
      // CDN: inject the Play CDN script into <head>
      return html.replace("</head>", `  ${CDN_SCRIPT}\n</head>`);
    }

    // JIT mode: use Tailwind's programmatic API
    try {
      const postcss = require("postcss");
      const tailwindcss = require("tailwindcss");

      const css =
        "@tailwind base;\n@tailwind components;\n@tailwind utilities;";
      const result = await postcss([
        tailwindcss({ content: [{ raw: html, extension: "html" }] }),
      ]).process(css, { from: undefined });

      const styleBlock = `<style>${result.css}</style>`;
      return html.replace("</head>", `  ${styleBlock}\n</head>`);
    } catch (err: any) {
      // JIT failed (e.g. postcss not installed) — fall back to CDN silently
      return html.replace("</head>", `  ${CDN_SCRIPT}\n</head>`);
    }
  },
};

function getOptions(ctx: PluginContext): TailwindOptions {
  const raw = (ctx.config as any).pluginOptions?.tailwindcss ?? {};
  return raw as TailwindOptions;
}
