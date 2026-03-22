/**
 * Minimal interface exposed to XNode so it can reference its owning document
 * without creating a circular import between node/ and document/.
 */
export interface IXDocument {
  getDocConfig(): { title: string; description: string };
}
