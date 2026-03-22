import { XValue } from "../types";

export interface XNodeData {
  name: string;
  attributes: Record<string, XValue>;
  textContent?: string;
}

export interface NodeInformation {
  name: string;
}
