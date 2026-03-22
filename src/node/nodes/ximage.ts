import { IXDocument } from "../../interfaces";
import { XNode, XPlusOnlyNode } from "../node";
import { XNodeData } from "../types";

/**
 * <ximage src="logo.png" alt="Logo" width="800" widths="320,640,1280" format="webp" />
 *
 * Generates an optimized <img> with srcset at render time.
 * Actual optimization is handled by ImageOptimizer; this node stores
 * the attributes and defers HTML generation to the render pipeline.
 */
export class XImageNode extends XPlusOnlyNode<XNode> {
  constructor() {
    super({ name: "ximage" });
  }

  createXNode(
    document: IXDocument,
    data: XNodeData,
    _children?: XNode[],
  ): XNode {
    return new XImageElement(document, data);
  }
}

export class XImageElement extends XNode {
  constructor(
    document: IXDocument,
    private imgData: XNodeData,
  ) {
    super(document, { name: "ximage" }, imgData, [], false);
  }

  getImageAttributes() {
    const attrs = this.imgData.attributes;
    const widthsRaw = String(attrs.widths ?? "");
    const widths = widthsRaw
      ? widthsRaw
          .split(",")
          .map((w) => parseInt(w.trim(), 10))
          .filter((n) => !isNaN(n))
      : [];

    return {
      src: String(attrs.src ?? ""),
      alt: String(attrs.alt ?? ""),
      width: attrs.width ? Number(attrs.width) : undefined,
      height: attrs.height ? Number(attrs.height) : undefined,
      widths: widths.length ? widths : undefined,
      format: (attrs.format ?? "webp") as "webp" | "avif" | "original",
      quality: attrs.quality ? Number(attrs.quality) : 80,
      class: attrs.class ? String(attrs.class) : undefined,
      loading: (attrs.loading ?? "lazy") as "lazy" | "eager",
    };
  }

  // Default render: plain img tag (optimizer replaces this at render time)
  override buildHTMLRootNode(indent = 0): string {
    const a = this.getImageAttributes();
    const pad = "  ".repeat(indent);
    const parts = [
      `src="${a.src}"`,
      `alt="${a.alt}"`,
      a.width ? `width="${a.width}"` : "",
      a.height ? `height="${a.height}"` : "",
      a.class ? `class="${a.class}"` : "",
      `loading="${a.loading}"`,
      `decoding="async"`,
    ].filter(Boolean);
    return `${pad}<img ${parts.join(" ")} />`;
  }
}
