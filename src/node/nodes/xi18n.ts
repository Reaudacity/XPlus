import { IXDocument } from "../../interfaces";
import { XNode, XPlusOnlyNode } from "../node";
import { XNodeData } from "../types";

/**
 * <xi18n key="nav.home" locale="fr" />
 *
 * Inlines a translated string from the i18n locale files.
 * Locale defaults to the document's detected locale if omitted.
 * Falls back to the key itself if no translation is found.
 */
export class Xi18nNode extends XPlusOnlyNode<XNode> {
  constructor() {
    super({ name: "xi18n" });
  }

  createXNode(
    document: IXDocument,
    data: XNodeData,
    _children?: XNode[],
  ): XNode {
    return new Xi18nElement(document, data);
  }
}

export class Xi18nElement extends XNode {
  constructor(document: IXDocument, nodeData: XNodeData) {
    super(document, { name: "xi18n" }, nodeData, [], false);
  }

  getI18nKey(): string {
    return String(this.getNodeData().attributes.key ?? "");
  }
  getI18nLocale(): string {
    return String(this.getNodeData().attributes.locale ?? "");
  }

  // Default render: key itself. The render pipeline replaces this with the
  // actual translation when an I18nLoader is available.
  override buildHTMLRootNode(_indent = 0): string {
    return this.escapeHtml(this.getI18nKey());
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}
