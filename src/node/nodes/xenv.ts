import { IXDocument } from "../../interfaces";
import { XNode, XPlusOnlyNode } from "../node";
import { XNodeData } from "../types";
import { getPublicEnvValue, isPublicVar, PUBLIC_PREFIX } from "../../env";
import { logWarn } from "../../server/logger";

/**
 * <xenv key="X_PUBLIC_APP_NAME" fallback="My App" />
 *
 * Inlines a public environment variable as escaped text at render time.
 *
 * ONLY variables prefixed with X_PUBLIC_ are accessible here — they are
 * intentionally safe to bake into HTML sent to the browser.
 *
 * Server-only variables (no X_PUBLIC_ prefix) are blocked and produce
 * an empty string + a build warning. Access those in xscript handlers
 * via process.env instead.
 */
export class XEnvNode extends XPlusOnlyNode<XNode> {
  constructor() {
    super({ name: "xenv" });
  }

  createXNode(
    document: IXDocument,
    data: XNodeData,
    _children?: XNode[],
  ): XNode {
    const key = String(data.attributes.key ?? "");
    const fallback = String(data.attributes.fallback ?? "");

    if (!isPublicVar(key)) {
      // Server-only variable — block it and surface a clear message
      logWarn(
        `[X+] <xenv key="${key}"> blocked: only ${PUBLIC_PREFIX}* variables can be ` +
          `inlined into page HTML. Access server-only variables in xscript handlers ` +
          `via process.env.`,
      );
      return new XEnvValueNode(document, fallback, true);
    }

    const value = getPublicEnvValue(key, fallback);
    return new XEnvValueNode(document, value, false);
  }
}

export class XEnvValueNode extends XNode {
  constructor(
    document: IXDocument,
    private value: string,
    private wasBlocked: boolean,
  ) {
    super(
      document,
      { name: "xenv:value" },
      { name: "xenv:value", attributes: {}, textContent: value },
      [],
      false,
    );
  }

  override buildHTMLRootNode(_indent = 0): string {
    if (this.wasBlocked) return "";
    return escapeHtml(this.value);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
