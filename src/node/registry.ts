import { XPlusOnlyNode } from "./node";
import { XScriptNode } from "./nodes/xscript";
import { XEnvNode } from "./nodes/xenv";
import { XHeadNode } from "./nodes/xhead";
import { XSlotNode } from "./nodes/xslot";
import { XDataNode } from "./nodes/xdata";
import { XStreamNode } from "./nodes/xstream";
import { XImageNode } from "./nodes/ximage";
import { Xi18nNode } from "./nodes/xi18n";

export class NodeRegistry {
  private map = new Map<string, XPlusOnlyNode<any>>();

  constructor() {
    this.initialize();
  }

  private initialize() {
    [
      new XScriptNode(),
      new XEnvNode(),
      new XHeadNode(),
      new XSlotNode(),
      new XDataNode(),
      new XStreamNode(),
      new XImageNode(),
      new Xi18nNode(),
    ].forEach((n) => this.register(n));
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
