import { IXDocument } from "../interfaces";
import { NodeRegistry, XNode } from "../node";
import { XPlusConfig } from "../types";
import { XPlusDocumentConfig } from "./types";
import { getBaseDocument } from "./utils";

export class XDocument implements IXDocument {
  private baseDocument: string;
  private root: XNode | null = null;

  /** Raw value of style= on <XPlusPage> — resolved by the render pipeline */
  public pageStylePath: string | null = null;

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

  // ── Tree ───────────────────────────────────────────────────────────────────

  setRoot(node: XNode): void {
    this.root = node;
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

  // ── Rendering ──────────────────────────────────────────────────────────────

  /**
   * Renders the document tree to HTML.
   *
   * @param headExtras - Additional HTML to inject into <head>
   *   (style link/block, favicon, HMR script, etc.)
   */
  buildHTML(headExtras = ""): string {
    if (!this.root)
      throw new Error("Cannot build HTML: document has no root node.");

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
      .replace("{XPLUS_HEAD_EXTRAS}", headExtras ? headExtras + "\n" : "")
      .replace("{XPLUS_PAGE_CONTENT}", body);
  }

  collectXPlusNodes(): XNode[] {
    return this.root?.collectXPlusNodes() ?? [];
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}
