import { IXDocument } from "../../interfaces";
import { XNode, XPlusOnlyNode } from "../node";
import { XNodeData } from "../types";

/**
 * <XPlusHead>
 *   <title>My Page</title>
 *   <meta name="robots" content="index,follow" />
 *   <link rel="canonical" href="https://example.com/page" />
 *   <script src="/analytics.js" defer></script>
 * </XPlusHead>
 *
 * Content is collected during render and injected into <head>.
 * The node itself does not render in the body.
 */
export class XHeadNode extends XPlusOnlyNode<XNode> {
  constructor() {
    super({ name: "XPlusHead" });
  }

  createXNode(
    document: IXDocument,
    data: XNodeData,
    children: XNode[] = [],
  ): XNode {
    return new XHeadCollector(document, children);
  }
}

export class XHeadCollector extends XNode {
  constructor(document: IXDocument, children: XNode[]) {
    super(
      document,
      { name: "XPlusHead" },
      { name: "XPlusHead", attributes: {} },
      children,
      true, // X+-only — not rendered in body
    );
  }

  /** Renders all children as raw HTML strings for injection into <head>. */
  buildHeadHTML(): string {
    return this.getChildren()
      .map((child) => child.buildHTMLRootNode(1))
      .join("\n");
  }
}
