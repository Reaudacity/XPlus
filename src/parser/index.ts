import fs from "fs";
import path from "path";
import { JPathOrMatcher, XMLParser } from "fast-xml-parser";
import { XDocument } from "../document/index";
import { XNode, NodeRegistry } from "../node";
import { XNodeData } from "../node/types";
import { XPlusConfig } from "../types";
import { XPlusDocumentConfig } from "../document/types";
import { ComponentRegistry } from "../components";
import { IXDocument } from "../interfaces";
import { validateSource } from "../validator";

const ATTR_PREFIX = "@_";
const TEXT_KEY = "#text";
const ROOT_ELEMENT = "XPlusPage";

// Layout files use a different root element
const LAYOUT_ROOT = "XPlusLayout";

// Component files
const COMPONENT_ROOT = "XPlusComponent";

interface ParsedXML {
  [key: string]: any;
}

export class XPlusParser {
  private xmlParser: XMLParser;
  private nodeRegistry: NodeRegistry;
  private componentRegistry: ComponentRegistry;

  constructor(
    nodeRegistry: NodeRegistry,
    componentRegistry = new ComponentRegistry(),
  ) {
    this.nodeRegistry = nodeRegistry;
    this.componentRegistry = componentRegistry;
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: ATTR_PREFIX,
      textNodeName: TEXT_KEY,
      parseTagValue: true,
      parseAttributeValue: true,
      trimValues: true,
      isArray: (
        _n: string,
        _j: JPathOrMatcher,
        isLeaf: boolean,
        isAttr: boolean,
      ) => !isAttr && !isLeaf,
    });
  }

  // ── Public ──────────────────────────────────────────────────────────────────

  parseFile(filePath: string, config: XPlusConfig): XDocument {
    const source = fs.readFileSync(filePath, "utf-8");

    const validation = validateSource(source);
    if (!validation.valid) {
      const err = validation.errors[0];
      const loc = err.line ? ` (line ${err.line}, col ${err.col})` : "";
      throw new Error(
        `XML validation failed in ${filePath}${loc}: ${err.message}`,
      );
    }

    return this.parseSource(source, config, path.dirname(filePath));
  }

  /**
   * Parses a layout.xp file. Same as parseFile but expects XPlusLayout root.
   */
  parseLayoutFile(filePath: string, config: XPlusConfig): XDocument {
    const source = fs.readFileSync(filePath, "utf-8");
    return this.parseSource(
      source,
      config,
      path.dirname(filePath),
      LAYOUT_ROOT,
    );
  }

  parseSource(
    source: string,
    config: XPlusConfig,
    sourceDir = process.cwd(),
    rootEl = ROOT_ELEMENT,
  ): XDocument {
    const raw = this.xmlParser.parse(source) as ParsedXML;
    const pageArray = raw[rootEl] as ParsedXML[];

    if (!pageArray?.length) {
      throw new Error(`Invalid .xp file: missing <${rootEl}> root element.`);
    }

    const page = pageArray[0];

    const docConfig: XPlusDocumentConfig = {
      title: String(page[`${ATTR_PREFIX}title`] ?? "Untitled"),
      description: String(page[`${ATTR_PREFIX}description`] ?? ""),
    };

    const doc = new XDocument(config, docConfig, this.nodeRegistry);

    const styleAttr = page[`${ATTR_PREFIX}style`];
    if (typeof styleAttr === "string" && styleAttr) {
      doc.pageStylePath = path.resolve(sourceDir, styleAttr);
    }

    doc.setRoot(this.buildNode(doc, rootEl, page, new Set(), sourceDir));
    return doc;
  }

  // ── Tree building ────────────────────────────────────────────────────────────

  private buildNode(
    doc: XDocument,
    tagName: string,
    raw: ParsedXML,
    resolving: Set<string>,
    sourceDir: string,
  ): XNode {
    // X+-only node
    const xplusNode = this.nodeRegistry.find(tagName);
    if (xplusNode) {
      return xplusNode.createXNode(
        doc,
        this.extractNodeData(tagName, raw),
        this.buildChildren(doc, raw, resolving, sourceDir),
      );
    }

    // Component reference
    if (this.componentRegistry.has(tagName)) {
      return this.inlineComponent(doc, tagName, resolving);
    }

    // Plain HTML node
    return new XNode(
      doc,
      { name: tagName },
      this.extractNodeData(tagName, raw),
      this.buildChildren(doc, raw, resolving, sourceDir),
      false,
    );
  }

  private inlineComponent(
    doc: XDocument,
    tagName: string,
    resolving: Set<string>,
  ): XNode {
    if (resolving.has(tagName)) {
      throw new Error(
        `Circular component reference: ${[...resolving, tagName].join(" → ")}`,
      );
    }

    const component = this.componentRegistry.get(tagName)!;
    const componentDir = path.dirname(component.filePath);
    const next = new Set(resolving).add(tagName);

    let componentCss: string | null = null;
    if (component.styleAttr) {
      const cssPath = path.resolve(componentDir, component.styleAttr);
      if (fs.existsSync(cssPath))
        componentCss = fs.readFileSync(cssPath, "utf-8");
    }

    const children = this.buildChildrenFromRaw(
      doc,
      component.rawChildren,
      next,
      componentDir,
    );
    return new XPlusFragment(doc, tagName, children, componentCss ?? undefined);
  }

  private buildChildren(
    doc: XDocument,
    raw: ParsedXML,
    resolving: Set<string>,
    sourceDir: string,
  ): XNode[] {
    const stripped: ParsedXML = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!k.startsWith(ATTR_PREFIX) && k !== TEXT_KEY) stripped[k] = v;
    }
    return this.buildChildrenFromRaw(doc, stripped, resolving, sourceDir);
  }

  private buildChildrenFromRaw(
    doc: XDocument,
    raw: ParsedXML,
    resolving: Set<string>,
    sourceDir: string,
  ): XNode[] {
    const children: XNode[] = [];

    for (const [key, value] of Object.entries(raw)) {
      if (key.startsWith(ATTR_PREFIX) || key === TEXT_KEY) continue;

      const isKnownTag =
        this.nodeRegistry.isRegistered(key) || this.componentRegistry.has(key);

      const elements = Array.isArray(value) ? value : [value];

      for (const el of elements) {
        if (!isKnownTag && (typeof el === "string" || typeof el === "number")) {
          children.push(this.textNode(doc, key, String(el)));
        } else {
          const childRaw = typeof el === "object" && el !== null ? el : {};
          children.push(
            this.buildNode(doc, key, childRaw, resolving, sourceDir),
          );
        }
      }
    }

    return children;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private extractNodeData(tagName: string, raw: ParsedXML): XNodeData {
    const attributes: Record<string, any> = {};
    for (const key of Object.keys(raw)) {
      if (key.startsWith(ATTR_PREFIX))
        attributes[key.slice(ATTR_PREFIX.length)] = raw[key];
    }
    const textContent =
      typeof raw[TEXT_KEY] === "string" || typeof raw[TEXT_KEY] === "number"
        ? String(raw[TEXT_KEY]).trim() || undefined
        : undefined;
    return { name: tagName, attributes, textContent };
  }

  private textNode(doc: XDocument, tagName: string, text: string): XNode {
    return new XNode(
      doc,
      { name: tagName },
      { name: tagName, attributes: {}, textContent: text },
      [],
      false,
    );
  }
}

// ── Fragment ──────────────────────────────────────────────────────────────────

export class XPlusFragment extends XNode {
  constructor(
    document: IXDocument,
    componentName: string,
    children: XNode[],
    private css?: string,
  ) {
    super(
      document,
      { name: `xp:fragment(${componentName})` },
      { name: `xp:fragment(${componentName})`, attributes: {} },
      children,
      false,
    );
  }

  override buildHTMLRootNode(indent = 0): string {
    const pad = "  ".repeat(indent);
    const styleBlock = this.css
      ? `${pad}<style>\n${this.css}\n${pad}</style>\n`
      : "";
    const body = this.getChildren()
      .filter((c) => !c.isXPlusNode())
      .map((c) => c.buildHTMLRootNode(indent))
      .join("\n");
    return styleBlock + body;
  }
}
