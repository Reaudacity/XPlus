import { IXDocument } from "../../interfaces";
import { XNode, XPlusOnlyNode } from "../node";
import { XNodeData } from "../types";

/**
 * <xdata name="users" file="api/fetchUsers.ts" />
 *
 * Fetches data server-side by running a handler file and makes the result
 * available to the page as:
 *   - A JSON script tag: <script id="__xdata_users" type="application/json">...</script>
 *   - window.__xdata.users on the client
 *
 * Handler file must export: async function() { return anySerializableValue; }
 *
 * X+-only — does not render as a visible element.
 */
export class XDataNode extends XPlusOnlyNode<XNode> {
  constructor() {
    super({ name: "xdata" });
  }

  createXNode(
    document: IXDocument,
    data: XNodeData,
    _children?: XNode[],
  ): XNode {
    return new XDataCollector(document, data);
  }
}

export class XDataCollector extends XNode {
  constructor(
    document: IXDocument,
    private data: XNodeData,
  ) {
    super(
      document,
      { name: "xdata" },
      data,
      [],
      true, // server-only
    );
  }

  getDataName(): string {
    return String(this.data.attributes.name ?? "data");
  }

  getDataFile(): string {
    return String(this.data.attributes.file ?? "");
  }
}
