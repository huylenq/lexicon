import { expect, test } from 'bun:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSource } from '../server/source';
import { parseModel, serializeModel } from '../server/model';
import { applyPatch } from '../server/chat/model-edit';
import { indexModel } from '../client/src/graph/model';
import { normalizeNavigation } from '../client/src/sourceNavigation';
import { sourceTargetId, legacySourceTargetId, legacySourceLinkKey, type CodeLink, type DocumentLink } from '../shared/model';

const base = { file: 'source.ts', role: 'reference', description: 'Evidence.' };
const code: CodeLink = { ...base, kind: 'code' };
const document: DocumentLink = { ...base, kind: 'document' };
const xml = (links: string) => `<lexicon schema="3.2" id="taxonomy"><name>Taxonomy</name><description>Evidence.</description><context id="scope"><name>Scope</name><description>Meaning.</description>${links}</context></lexicon>`;
const element = (attributes: string) => `<code-link file="source.ts" role="reference" ${attributes}>Evidence.</code-link>`;

test('kind and locator contracts are enforced in XML, edits, and TypeScript', () => {
  const model = parseModel(xml(element('kind="code" symbol="Order"')));
  expect(model.issues).toEqual([]);
  for (const attrs of ['', 'kind="unknown"', 'kind="code" heading="order"', 'kind="document" symbol="Order"', 'kind="document" heading="order" line="1"']) {
    expect(parseModel(xml(element(attrs))).issues.some(i => i.severity === 'error')).toBe(true);
  }
  for (const invalid of [{ ...base }, { ...code, heading: 'order' }, { ...document, symbol: 'Order' }]) {
    expect(() => applyPatch(model, { upsert: [{ ...model.items[0], codeLinks: [invalid] }] })).toThrow();
  }
  expect(parseModel(serializeModel(model)).items[0].codeLinks[0].kind).toBe('code');
  // @ts-expect-error A code link cannot target a document heading.
  const badCode: CodeLink = { ...code, heading: 'order' };
  // @ts-expect-error A document link cannot target a code symbol.
  const badDocument: DocumentLink = { ...document, symbol: 'Order' };
  // @ts-expect-error A document locator cannot be both heading and line.
  const badLocator: DocumentLink = { ...document, heading: 'order', line: 1 };
  void [badCode, badDocument, badLocator];
});

test('the authored kind gates syntax resolution and rendering even for the same file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lexicon-taxonomy-'));
  try {
    await writeFile(join(root, 'source.ts'), 'export interface Order { total: number }\n');
    await writeFile(join(root, 'notes.md'), '# Order\nDetails.\n');
    expect(await readSource(root, { ...code, symbol: 'Order' })).toMatchObject({ kind: 'code', status: 'symbol' });
    expect(await readSource(root, document)).toMatchObject({ kind: 'document', format: 'text', status: 'file', headings: [] });
    expect(await readSource(root, { ...code, file: 'notes.md' })).toEqual({ kind: 'code', file: 'notes.md', status: 'file', text: '# Order\nDetails.\n' });
    expect(await readSource(root, { ...document, line: undefined, file: 'notes.md', heading: 'order' })).toMatchObject({ kind: 'document', format: 'markdown', status: 'heading' });
    await expect(readSource(root, { ...document, symbol: 'Order' } as unknown as DocumentLink)).rejects.toThrow('Document links cannot');
    await expect(readSource(root, { ...code, heading: 'order' } as unknown as CodeLink)).rejects.toThrow('Code links cannot');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('kind separates same-path file and line identities while retaining code and heading IDs', () => {
  expect(sourceTargetId(code)).toBe('code:["source.ts","file",""]');
  expect(sourceTargetId(document)).toBe('code:["source.ts","document-file",""]');
  expect(sourceTargetId({ ...document, line: 2 })).not.toBe(sourceTargetId({ ...code, line: 2 }));
  expect(sourceTargetId({ ...document, line: undefined, file: 'notes.md', heading: 'order' })).toBe('code:["notes.md","heading","order"]');
  const model = parseModel(xml(element('kind="code"') + element('kind="document"')));
  expect(indexModel(model).targets.size).toBe(2);
});

test('legacy document file URLs and inferred mapping IDs migrate without conflating code', () => {
  const model = parseModel(xml(element('kind="document"')));
  const index = indexModel(model);
  const link = model.items[0].codeLinks[0];
  const old = legacySourceTargetId(link);
  const oldMapping = JSON.stringify(['scope', legacySourceLinkKey(link)]);
  const params = new URLSearchParams({ code: old, codeMapping: oldMapping });
  const normalized = normalizeNavigation(params, index);
  expect(normalized.get('code')).toBe(sourceTargetId(link));
  expect(index.mappings.has(normalized.get('codeMapping')!)).toBe(true);
  expect(normalizeNavigation(new URLSearchParams({ code: old }), index).get('code')).toBe(sourceTargetId(link));
  const both = parseModel(xml(element('kind="code" id="implementation"') + element('kind="document" id="policy"')));
  const bothIndex = indexModel(both);
  expect(normalizeNavigation(new URLSearchParams({ code: old }), bothIndex).get('code')).toBe(old);
  expect(normalizeNavigation(new URLSearchParams({ code: old, codeMapping: '["scope","policy"]' }), bothIndex).get('code')).toBe(sourceTargetId(document));
});

test('legacy document canvas references retain placement, notes, and bindings', async () => {
  const { canvasSchema } = await import('../shared/canvas-schema');
  const { migrateModelReferences } = await import('../client/src/canvas/document');
  const { modelShapeId } = await import('../client/src/canvas/references');
  const model = parseModel(xml(element('kind="document"')));
  const index = indexModel(model), link = model.items[0].codeLinks[0];
  const old = legacySourceTargetId(link), current = sourceTargetId(link);
  const page = canvasSchema.types.page.create({ id: 'page:page' as any, name: 'Page', index: 'a1' as any });
  const target = canvasSchema.types.shape.create({ id: modelShapeId(old), type: 'lexicon-object', parentId: page.id, index: 'a1' as any, x: 120, y: 240,
    props: { graphId: old, w: 190, h: 70, group: false, territory: null } });
  const note = canvasSchema.types.shape.create({ id: 'shape:note' as any, type: 'note', parentId: page.id, index: 'a2' as any });
  const binding = canvasSchema.types.binding.create({ id: 'binding:note' as any, type: 'lexicon-note', fromId: note.id, toId: target.id, props: { x: 10, y: 20 } });
  const snapshot = { schema: canvasSchema.serialize(), store: { [page.id]: page, [target.id]: target, [note.id]: note, [binding.id]: binding } };
  const migrated = migrateModelReferences(snapshot, index);
  expect(migrated.store[modelShapeId(current)]).toMatchObject({ x: 120, y: 240, props: { graphId: current } });
  expect(migrated.store[note.id]).toEqual(note);
  expect(migrated.store[binding.id]).toMatchObject({ fromId: note.id, toId: modelShapeId(current), props: { x: 10, y: 20 } });
  expect(migrated.store[target.id]).toBeUndefined();
  expect(snapshot.store[target.id]).toEqual(target);
});

test('legacy Layers URLs normalize to Planes without losing a source location', () => {
  const index = indexModel(parseModel(xml(element('kind="document" heading="rules"'))));
  const target = [...index.targets.keys()][0];
  const normalized = normalizeNavigation(new URLSearchParams({ presentation: 'layers', code: target, item: 'scope' }), index);
  expect(normalized.get('presentation')).toBe('planes');
  expect(normalized.get('code')).toBe(target);
  expect(normalized.get('item')).toBe('scope');
});
