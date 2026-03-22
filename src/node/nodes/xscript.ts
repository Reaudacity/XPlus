import path from "path";
import { IXDocument } from "../../interfaces";
import { XNode, XPlusOnlyNode } from "../node";
import { XNodeData } from "../types";
import { XScriptTranspiler } from "../../runtime/transpiler";
import { compileHandler, CompiledHandler } from "../../runtime/runner";

export interface XScriptAttributes {
  /** Express route path, e.g. /api/hello */
  path: string;
  /**
   * Path to the handler file relative to the project root.
   * Accepts both .ts and .js files.
   */
  file: string;
  /** HTTP method — defaults to GET */
  method?: string;
}

export class XScriptNode extends XPlusOnlyNode<XNode> {
  constructor() {
    super({ name: "xscript" });
  }

  createXNode(
    document: IXDocument,
    data: XNodeData,
    children?: XNode[],
  ): XNode {
    return new XNode(
      document,
      this.getNodeInformation(),
      data,
      children ?? [],
      true,
    );
  }

  /**
   * Transpiles the handler file pointed to by this xscript node and returns
   * a pre-compiled `CompiledHandler` ready for the VM runner.
   *
   * Called once per xscript node during server startup (Phase 1), before any
   * page routes are registered so all API routes are available immediately.
   *
   * @param node        - The parsed <xscript> XNode
   * @param transpiler  - The project's XScriptTranspiler instance
   * @param directory - Absolute project root for path resolution
   */
  static async prepareHandler(
    node: XNode,
    transpiler: XScriptTranspiler,
    directory: string,
  ): Promise<CompiledHandler> {
    const attrs = node.getNodeData().attributes as unknown as XScriptAttributes;

    if (!attrs.path)
      throw new Error("<xscript> is missing a `path` attribute.");
    if (!attrs.file)
      throw new Error("<xscript> is missing a `file` attribute.");

    const absoluteHandlerPath = path.resolve(directory, attrs.file);
    const routePath = attrs.path;
    const method = (attrs.method ?? "GET").toUpperCase();

    // Transpile TypeScript (or normalise JavaScript) → .xp/runtimeOnly/transpile/
    const { code } = await transpiler.transpile(absoluteHandlerPath);

    // Compile into a reusable vm.Script — this happens once, not per request
    return compileHandler(code, absoluteHandlerPath, routePath, method);
  }
}
