import { IXDocument } from "../interfaces";
import { NodeInformation, XNodeData } from "./types";

// Tags that are self-closing in HTML
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

export class XNode {
  constructor(
    private document: IXDocument,
    private nodeInfo: NodeInformation,
    private nodeData: XNodeData,
    private children: XNode[] = [],
    private xplusNode: boolean,
  ) {}

  /**
   * Recursively renders this node and all its children to an HTML string.
   * Throws if called on an X+-only node — those are server-side only.
   */
  buildHTMLRootNode(indent = 0): string {
    if (this.xplusNode) {
      throw new Error(
        `Node <${this.nodeData.name}> is an X+-only node and cannot be transpiled to HTML.`,
      );
    }

    const tag = this.nodeData.name;
    const attrs = this.resolveAttributes();
    const attrString = attrs.length > 0 ? " " + attrs.join(" ") : "";
    const pad = "  ".repeat(indent);

    // Void (self-closing) elements never have children
    if (VOID_ELEMENTS.has(tag.toLowerCase())) {
      return `${pad}<${tag}${attrString} />`;
    }

    // Render text-only nodes inline
    if (this.children.length === 0 && this.nodeData.textContent) {
      return `${pad}<${tag}${attrString}>${this.nodeData.textContent}</${tag}>`;
    }

    if (this.children.length === 0) {
      return `${pad}<${tag}${attrString}></${tag}>`;
    }

    const childrenHTML = this.children
      .filter((child) => !child.isXPlusNode())
      .map((child) => child.buildHTMLRootNode(indent + 1))
      .join("\n");

    return `${pad}<${tag}${attrString}>\n${childrenHTML}\n${pad}</${tag}>`;
  }

  /**
   * Returns each attribute as a properly formatted HTML attribute string.
   */
  resolveAttributes(): string[] {
    return Object.entries(this.nodeData.attributes)
      .map(([name, value]) => {
        const type = typeof value;
        if (type === "boolean") {
          // Boolean attributes: present = true, omitted = false
          return value ? name : "";
        }
        return `${name}="${String(value)}"`;
      })
      .filter(Boolean);
  }

  isXPlusNode(): boolean {
    return this.xplusNode;
  }

  getNodeData(): XNodeData {
    return this.nodeData;
  }

  getNodeInfo(): NodeInformation {
    return this.nodeInfo;
  }

  getChildren(): XNode[] {
    return this.children;
  }

  /**
   * Recursively walks this node's tree and collects all X+-only nodes.
   * Used by the server to discover xscript routes before booting.
   */
  collectXPlusNodes(): XNode[] {
    const results: XNode[] = [];
    if (this.xplusNode) results.push(this);
    for (const child of this.children) {
      results.push(...child.collectXPlusNodes());
    }
    return results;
  }
}

export abstract class XPlusOnlyNode<T> {
  constructor(private nodeInfo: NodeInformation) {}

  abstract createXNode(
    document: IXDocument,
    data: XNodeData,
    children?: XNode[],
  ): T;

  getNodeInformation(): NodeInformation {
    return this.nodeInfo;
  }
}
