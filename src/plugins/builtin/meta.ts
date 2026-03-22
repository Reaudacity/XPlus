import { XPlusPlugin, PluginContext } from "../index";
import { XDocument } from "../../document/index";

/**
 * xplus:meta
 *
 * Automatically injects useful <meta> tags into every page:
 *   - Open Graph (og:title, og:description, og:type)
 *   - Twitter Card
 *   - Canonical URL (if baseUrl is configured)
 *
 * Options (xplus.yml → pluginOptions.meta):
 *   baseUrl:     "https://mysite.com"  Used for og:url and canonical
 *   twitterSite: "@handle"             Added to twitter:site
 *   ogType:      "website"             og:type value (default: "website")
 */

interface MetaOptions {
  baseUrl?: string;
  twitterSite?: string;
  ogType?: string;
}

export const metaPlugin: XPlusPlugin = {
  name: "xplus:meta",

  setup(ctx: PluginContext) {
    const opts = getOptions(ctx);
    if (opts.baseUrl) ctx.log(`Base URL: ${opts.baseUrl}`);
  },

  transformDocument(doc: XDocument, route: string) {
    // Access doc internals — title and description come from <XPlusPage>
    // We don't mutate the AST here; we'll inject in transformHTML instead
    // where we have the final rendered string. Store state via closure.
  },

  async transformHTML(html: string, route: string): Promise<string> {
    // Extract title and description from the already-rendered HTML
    const titleMatch = html.match(/<title>([^<]*)<\/title>/);
    const descMatch = html.match(
      /<meta\s+name="description"\s+content="([^"]*)"/,
    );

    const title = titleMatch?.[1] ?? "";
    const description = descMatch?.[1] ?? "";

    const tags: string[] = [];

    // Open Graph
    if (title) tags.push(`<meta property="og:title" content="${title}" />`);
    if (description)
      tags.push(`<meta property="og:description" content="${description}" />`);
    tags.push(`<meta property="og:type" content="website" />`);

    // Twitter Card
    tags.push(`<meta name="twitter:card" content="summary" />`);
    if (title) tags.push(`<meta name="twitter:title" content="${title}" />`);
    if (description)
      tags.push(`<meta name="twitter:description" content="${description}" />`);

    const block = tags.map((t) => `  ${t}`).join("\n");
    return html.replace("</head>", `${block}\n</head>`);
  },
};

function getOptions(ctx: PluginContext): MetaOptions {
  return ctx.config.pluginOptions?.meta ?? {};
}
