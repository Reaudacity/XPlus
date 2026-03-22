import { IXDocument } from "../../interfaces";
import { XNode, XPlusOnlyNode } from "../node";
import { XNodeData } from "../types";

export const SLOT_PLACEHOLDER = "<!--__XPLUS_SLOT__-->";

/**
 * <XPlusSlot />
 *
 * Used inside layout.xp files to mark where the page content is injected.
 * Renders as a unique HTML comment placeholder; the server replaces it
 * with the rendered page content after layout and page are both rendered.
 */
export class XSlotNode extends XPlusOnlyNode<XNode> {
  constructor() {
    super({ name: "XPlusSlot" });
  }

  createXNode(
    document: IXDocument,
    data: XNodeData,
    _children?: XNode[],
  ): XNode {
    return new XSlotPlaceholder(document);
  }
}

export class XSlotPlaceholder extends XNode {
  constructor(document: IXDocument) {
    super(
      document,
      { name: "XPlusSlot" },
      { name: "XPlusSlot", attributes: {} },
      [],
      false, // not X+-only so buildHTMLRootNode is called
    );
  }

  override buildHTMLRootNode(_indent = 0): string {
    return SLOT_PLACEHOLDER;
  }
}
