import { IXDocument } from "../../interfaces";
import { XNode, XPlusOnlyNode } from "../node";
import { XNodeData } from "../types";

/**
 * <xstream id="feed" file="api/streamFeed.ts" interval="0">
 *   <p>Loading...</p>
 * </xstream>
 *
 * Renders a placeholder div with an SSE connection that replaces its
 * content as the server pushes data.
 *
 * Handler file exports:
 *   async function*(req) { yield "<p>item</p>"; } // generator = multiple pushes
 *   async function(req)  { return "<p>content</p>"; } // single push
 */
export class XStreamNode extends XPlusOnlyNode<XNode> {
  constructor() {
    super({ name: "xstream" });
  }

  createXNode(
    document: IXDocument,
    data: XNodeData,
    children: XNode[] = [],
  ): XNode {
    return new XStreamElement(document, data, children);
  }
}

export class XStreamElement extends XNode {
  constructor(document: IXDocument, nodeData: XNodeData, children: XNode[]) {
    super(document, { name: "xstream" }, nodeData, children, false);
  }

  getStreamId(): string {
    return String(this.getNodeData().attributes.id ?? "stream");
  }
  getStreamFile(): string {
    return String(this.getNodeData().attributes.file ?? "");
  }
  getInterval(): number {
    return Number(this.getNodeData().attributes.interval ?? 0);
  }

  override buildHTMLRootNode(indent = 0): string {
    const id = this.getStreamId();
    const pad = "  ".repeat(indent);

    // Render children as the initial/fallback content
    const inner = this.getChildren()
      .map((c) => c.buildHTMLRootNode(indent + 1))
      .join("\n");

    return `${pad}<div id="__xstream_${id}">\n${inner}\n${pad}</div>`;
  }
}
