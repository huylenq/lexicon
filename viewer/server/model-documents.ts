import { Buffer } from "node:buffer";
import { readModelDocument, readXml } from "./model";
import { fingerprint } from "./model-edit";

/** Read-only viewer projections, keyed by exact XML bytes. Writers validate independently. */
export class ModelDocuments {
  private documents = new Map<string, { revision: string; bytes: number; document: Promise<Awaited<ReturnType<typeof readModelDocument>>> }>();
  constructor(private parse = readModelDocument, private maxEntries = 16, private maxBytes = 8 * 1024 * 1024) {}
  async revision(root: string) { return fingerprint(await readXml(root)); }
  async read(root: string) {
    const xml = await readXml(root), revision = fingerprint(xml);
    let entry = this.documents.get(root);
    if (!entry || entry.revision !== revision) {
      entry = { revision, bytes: Buffer.byteLength(xml || ""), document: this.parse(root, xml) };
      this.documents.set(root, entry);
      const retained = entry;
      void entry.document.catch(() => { if (this.documents.get(root) === retained) this.documents.delete(root); });
    } else {
      this.documents.delete(root);
      this.documents.set(root, entry);
    }
    let bytes = [...this.documents.values()].reduce((sum, value) => sum + value.bytes, 0);
    while (this.documents.size > this.maxEntries || bytes > this.maxBytes) {
      const oldest = this.documents.keys().next().value!;
      bytes -= this.documents.get(oldest)!.bytes;
      this.documents.delete(oldest);
    }
    return { document: await entry.document, revision };
  }
  forget(root: string) { this.documents.delete(root); }
}
export const modelDocuments = new ModelDocuments();
