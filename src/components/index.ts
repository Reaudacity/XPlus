import fs from "fs";
import path from "path";
import { JPathOrMatcher, XMLParser } from "fast-xml-parser";

/**
 * Raw parsed XML for a single component — stored before any resolution.
 * Resolution (inlining nested components) happens at parse-time when a
 * page or another component references this component by tag name.
 */
export interface RawComponent {
  /** The tag name used in pages, e.g. "LoginForm" */
  name: string;
  /** Absolute path to the source .xp file */
  filePath: string;
  /** The raw parsed XML object of the component's children */
  rawChildren: Record<string, any>;
  /** Value of the style= attribute on <XPlusComponent>, if present */
  styleAttr?: string;
}

const ATTR_PREFIX = "@_";
const TEXT_KEY = "#text";
const ROOT_ELEMENT = "XPlusComponent";

/**
 * Global component registry.
 *
 * Scans `<componentsDir>/**\/*.xp` for files whose root element is
 * `<XPlusComponent name="...">` and stores each one by its tag name.
 *
 * Components are registered globally — no imports needed in pages.
 * Any `.xp` file under the components directory can be used in any page
 * or other component just by its tag name.
 */
export class ComponentRegistry {
  private map = new Map<string, RawComponent>();

  private xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ATTR_PREFIX,
    textNodeName: TEXT_KEY,
    parseTagValue: true,
    parseAttributeValue: true,
    trimValues: true,
    isArray: (
      _name: string,
      _jpath: JPathOrMatcher,
      isLeafNode: boolean,
      isAttribute: boolean,
    ) => !isAttribute && !isLeafNode,
  });

  // ── Population ─────────────────────────────────────────────────────────────

  /**
   * Scans the given directory recursively and registers every
   * `<XPlusComponent>` file found.
   *
   * Safe to call when the directory doesn't exist yet — returns 0.
   */
  scan(componentsDir: string): number {
    if (!fs.existsSync(componentsDir)) return 0;

    const files = this.collectXpFiles(componentsDir);
    let registered = 0;

    for (const filePath of files) {
      try {
        const component = this.parseComponentFile(filePath);
        if (component) {
          this.map.set(component.name, component);
          registered++;
        }
      } catch (err: any) {
        // Non-fatal — bad component files are reported by `x+ check`
      }
    }

    return registered;
  }

  // ── Lookup ─────────────────────────────────────────────────────────────────

  has(name: string): boolean {
    return this.map.has(name);
  }

  get(name: string): RawComponent | null {
    return this.map.get(name) ?? null;
  }

  all(): RawComponent[] {
    return [...this.map.values()];
  }

  size(): number {
    return this.map.size;
  }

  // ── Parsing ────────────────────────────────────────────────────────────────

  private parseComponentFile(filePath: string): RawComponent | null {
    const source = fs.readFileSync(filePath, "utf-8");
    const raw = this.xmlParser.parse(source);

    const rootArray: Record<string, any>[] = raw[ROOT_ELEMENT];
    if (!rootArray || rootArray.length === 0) return null;

    const root = rootArray[0];
    const name = root[`${ATTR_PREFIX}name`];

    if (!name || typeof name !== "string") {
      throw new Error(
        `Component at ${filePath} is missing a "name" attribute on <XPlusComponent>.`,
      );
    }

    // Extract style attribute before stripping attrs from rawChildren
    const styleAttr: string | undefined =
      typeof root[`${ATTR_PREFIX}style`] === "string"
        ? root[`${ATTR_PREFIX}style`]
        : undefined;

    // Strip ALL attributes — they belong to the component definition,
    // not its rendered output. What remains is the children.
    const rawChildren: Record<string, any> = {};
    for (const [key, value] of Object.entries(root)) {
      if (!key.startsWith(ATTR_PREFIX)) {
        rawChildren[key] = value;
      }
    }

    return { name, filePath, rawChildren, styleAttr };
  }

  private collectXpFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.collectXpFiles(full));
      } else if (entry.isFile() && entry.name.endsWith(".xp")) {
        results.push(full);
      }
    }
    return results;
  }
}
