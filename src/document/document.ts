import { IXDocument } from "../interfaces";
import { NodeRegistry, XNode } from "../node";
import { XPlusConfig } from "../types";
import { XPlusDocumentConfig } from "./types";
import { getBaseDocument } from "./utils";
import { XHeadCollector } from "../node/nodes/xhead";
import { XDataCollector } from "../node/nodes/xdata";
import { XStreamElement } from "../node/nodes/xstream";
import { XImageElement } from "../node/nodes/ximage";
import { Xi18nElement } from "../node/nodes/xi18n";

export class XDocument implements IXDocument {
  private baseDocument: string;
  private root: XNode | null = null;

  public pageStylePath: string | null = null;
  /** Extra HTML to inject into <head> from XPlusHead nodes */
  public headExtrasFromNodes: string = "";
  /** Route params from dynamic routes, e.g. { slug: "hello-world" } */
  public routeParams: Record<string, string> = {};
  /** Active locale for this request */
  public locale: string = "";

  constructor(
    private xplusConfig: XPlusConfig,
    private docConfig: XPlusDocumentConfig,
    private nodeRegistry: NodeRegistry,
  ) {
    this.baseDocument = getBaseDocument();
  }

  // ── IXDocument ─────────────────────────────────────────────────────────────

  getDocConfig(): XPlusDocumentConfig {
    return this.docConfig;
  }
  getRoot(): XNode | null {
    return this.root;
  }
  getNodeRegistry(): NodeRegistry {
    return this.nodeRegistry;
  }
  getXPlusConfig(): XPlusConfig {
    return this.xplusConfig;
  }

  setRoot(node: XNode): void {
    this.root = node;
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  buildHTML(headExtras = ""): string {
    if (!this.root)
      throw new Error("Cannot build HTML: document has no root node.");

    // Collect XPlusHead node content
    this.collectHeadNodes();

    const allHeadExtras = [headExtras, this.headExtrasFromNodes]
      .filter(Boolean)
      .join("\n");

    const body = this.root
      .getChildren()
      .filter((c) => !c.isXPlusNode())
      .map((c) => c.buildHTMLRootNode(1))
      .join("\n");

    return this.baseDocument
      .replace("{XPLUS_PAGE_TITLE}", this.escapeHtml(this.docConfig.title))
      .replace(
        "{XPLUS_PAGE_DESCRIPTION}",
        this.escapeHtml(this.docConfig.description),
      )
      .replace("{XPLUS_HEAD_EXTRAS}", allHeadExtras ? allHeadExtras + "\n" : "")
      .replace("{XPLUS_PAGE_CONTENT}", body);
  }

  collectXPlusNodes(): XNode[] {
    return this.root?.collectXPlusNodes() ?? [];
  }

  collectByType<T extends XNode>(cls: new (...args: any[]) => T): T[] {
    const results: T[] = [];
    this.walk(this.root, (node) => {
      if (node instanceof cls) results.push(node);
    });
    return results;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private collectHeadNodes(): void {
    const headNodes = this.collectByType(XHeadCollector);
    if (headNodes.length === 0) return;

    this.headExtrasFromNodes = headNodes
      .map((n) => n.buildHeadHTML())
      .join("\n");
  }

  private walk(node: XNode | null, fn: (n: XNode) => void): void {
    if (!node) return;
    fn(node);
    for (const child of node.getChildren()) this.walk(child, fn);
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}
