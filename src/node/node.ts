import { IXDocument } from "../interfaces";
import { NodeInformation, XNodeData } from "./types";

export const VOID_ELEMENTS = new Set([
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

  buildHTMLRootNode(indent = 0): string {
    if (this.xplusNode) {
      throw new Error(
        `<${this.nodeData.name}> is an X+-only node and cannot be transpiled to HTML.`,
      );
    }

    const tag = this.nodeData.name;
    const attrs = this.resolveAttributes();
    const attrString = attrs.length > 0 ? " " + attrs.join(" ") : "";
    const pad = "  ".repeat(indent);

    if (VOID_ELEMENTS.has(tag.toLowerCase())) {
      return `${pad}<${tag}${attrString} />`;
    }

    const visibleChildren = this.children.filter((c) => !c.isXPlusNode());

    // No children at all — render inline if there's text, empty tag otherwise
    if (visibleChildren.length === 0) {
      return this.nodeData.textContent
        ? `${pad}<${tag}${attrString}>${this.nodeData.textContent}</${tag}>`
        : `${pad}<${tag}${attrString}></${tag}>`;
    }

    // Has children — render them. If there's also textContent (mixed content
    // where the parser stored leading text on the node instead of as a child),
    // prepend it directly so it isn't lost.
    const parts: string[] = [];

    if (this.nodeData.textContent) {
      // Leading text before the first child element
      parts.push(`${pad}  ${this.nodeData.textContent}`);
    }

    for (const child of visibleChildren) {
      // Inline text nodes (XTextNode) render without extra indentation padding
      if (child instanceof XTextNode) {
        parts.push(child.buildHTMLRootNode(0));
      } else {
        parts.push(child.buildHTMLRootNode(indent + 1));
      }
    }

    // If the content is purely inline (all XTextNode children + plain text),
    // collapse to a single line. Otherwise use block formatting.
    const allInline = visibleChildren.every((c) => c instanceof XTextNode);

    if (allInline && !this.nodeData.textContent) {
      const inner = parts.join("");
      return `${pad}<${tag}${attrString}>${inner}</${tag}>`;
    }

    if (allInline && this.nodeData.textContent) {
      const inner = [
        this.nodeData.textContent,
        ...visibleChildren.map((c) => c.buildHTMLRootNode(0)),
      ].join("");
      return `${pad}<${tag}${attrString}>${inner}</${tag}>`;
    }

    return `${pad}<${tag}${attrString}>\n${parts.join("\n")}\n${pad}</${tag}>`;
  }

  resolveAttributes(): string[] {
    return Object.entries(this.nodeData.attributes)
      .map(([name, value]) => {
        if (typeof value === "boolean") return value ? name : "";
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
  getDocument(): IXDocument {
    return this.document;
  }

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

/**
 * A raw text node with no wrapping tag.
 * Created by the parser whenever text content appears alongside child elements
 * in the same parent — e.g. the "Example " in <p>Example <span>hi</span></p>.
 */
export class XTextNode extends XNode {
  constructor(
    document: IXDocument,
    private text: string,
  ) {
    super(
      document,
      { name: "#text" },
      { name: "#text", attributes: {} },
      [],
      false,
    );
  }

  override buildHTMLRootNode(_indent = 0): string {
    return this.text;
  }
}
