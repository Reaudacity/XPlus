import { XPlusOnlyNode } from "./node";
import { XScriptNode } from "./nodes";

export class NodeRegistry {
  private map: Map<string, XPlusOnlyNode<any>> = new Map();

  constructor() {
    this.initialize();
  }

  private initialize() {
    this.register(new XScriptNode());
  }

  public register(xnode: XPlusOnlyNode<any>): void {
    this.map.set(xnode.getNodeInformation().name, xnode);
  }

  public find(name: string): XPlusOnlyNode<any> | null {
    return this.map.get(name) ?? null;
  }

  public isRegistered(name: string): boolean {
    return this.map.has(name);
  }

  public all(): XPlusOnlyNode<any>[] {
    return [...this.map.values()];
  }
}
