import { describe, expect, test } from "bun:test";
import { planeTransform, projectPoint, unprojectPoint } from "../client/src/layers/geometry";

describe("perspective plane coordinates", () => {
  test("recovers positions and drag distances on an oblique plane", () => {
    const m = planeTransform([{ x: 120, y: 80 }, { x: 810, y: 140 }, { x: 950, y: 640 }, { x: 40, y: 520 }]);
    for (const p of [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: .27, y: .61 }, { x: 1.2, y: -.1 }]) {
      const roundtrip = unprojectPoint(m, projectPoint(m, p));
      expect(roundtrip.x).toBeCloseTo(p.x, 10);
      expect(roundtrip.y).toBeCloseTo(p.y, 10);
    }
    expect(projectPoint(m, { x: 1, y: 0 }).x).toBeCloseTo(810, 10);
    expect(projectPoint(m, { x: 1, y: 0 }).y).toBeCloseTo(140, 10);
  });
  test("also supports a flat focused plane", () => {
    const m = planeTransform([{ x: 30, y: 50 }, { x: 1030, y: 50 }, { x: 1030, y: 610 }, { x: 30, y: 610 }]);
    expect(unprojectPoint(m, { x: 530, y: 330 })).toEqual({ x: .5, y: .5 });
  });
  test("rejects a degenerate plane", () => {
    expect(() => planeTransform([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }])).toThrow();
  });
});

import { importLayers, layerShapeId, pageIds, createLayersHistory } from '../client/src/layers/document';
import { modelShapeId, isPrimary } from '../client/src/canvas/references';
import { canvasSchema } from '../shared/canvas-schema';
import { validateCanvas } from '../server/canvas';
import type { TLRecord, TLPage, TLShape } from 'tldraw';

test('importing Layers preserves original pages and remaps notes, bindings, and assets without stealing model references', () => {
  const page = canvasSchema.types.page.create({ id: 'page:original' as any, name: 'Original', index: 'a1' as any }) as TLPage;
  const domain = canvasSchema.types.page.create({ id: pageIds.domain, name: 'Domain', index: 'a2' as any }) as TLPage;
  const shape = canvasSchema.types.shape.create({ id: modelShapeId('item:order'), type: 'lexicon-object', parentId: domain.id, index: 'a1' as any,
    x: 123, y: 234, props: { graphId: 'item:order', w: 190, h: 70, group: false, territory: null } }) as TLShape;
  const note = canvasSchema.types.shape.create({ id: 'shape:note' as any, type: 'note', parentId: domain.id, index: 'a2' as any, props: { color:'black', richText:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Keep this note'}]}]}, size:'m', font:'draw', align:'middle', verticalAlign:'middle', labelColor:'black', growY:0, fontSizeAdjustment:1, url:'', scale:1, textLastEditedBy:null } });
  const binding = canvasSchema.types.binding.create({ id: 'binding:note' as any, type: 'lexicon-note', fromId: note.id, toId: shape.id, props: { x: 20, y: 30 } });
  const asset = canvasSchema.types.asset.create({ id: 'asset:legacy' as any, type: 'image', props: { name:'test.png', src:`asset:${'a'.repeat(64)}.png`, w:1, h:1, mimeType:'image/png', isAnimated:false } });
  const image = canvasSchema.types.shape.create({ id: 'shape:image' as any, type:'image', parentId:domain.id, index:'a3' as any, props:{ w:80,h:80,assetId:asset.id,playing:true,url:'',crop:null,flipX:false,flipY:false,altText:'Keep image' } });
  const originalShape = { ...shape, parentId: page.id, x: 80 };
  const snapshot = (records: TLRecord[]) => ({ schema: canvasSchema.serialize(), store: Object.fromEntries(records.map(r => [r.id, r])) });
  const project = snapshot([page, originalShape]);
  const legacy = snapshot([domain, shape, note, binding, asset, image]);
  const imported = importLayers(project, legacy)!;
  expect(imported.store[originalShape.id]).toEqual(originalShape);
  const scoped = imported.store[layerShapeId('item:order', 'domain')];
  expect(scoped.typeName === 'shape' && scoped.x).toBe(123);
  expect(scoped.typeName === 'shape' && isPrimary(scoped)).toBe(true);
  const attached = Object.values(imported.store).find(r => r.typeName === 'binding');
  expect(attached?.typeName === 'binding' && attached.toId).toBe(layerShapeId('item:order', 'domain'));
  expect(importLayers(imported, legacy)).toBe(imported);
  const importedImage = Object.values(imported.store).find(r => r.typeName === 'shape' && r.type === 'image');
  expect(importedImage?.typeName === 'shape' && importedImage.type === 'image' && importedImage.props.assetId).toBe('asset:layers-import:legacy' as any);
  expect(Object.values(imported.store).filter(r => r.typeName === 'asset')).toHaveLength(1);
  expect(validateCanvas({ format:'lexicon-canvas', version:2, id:'test-canvas', modelId:'shop', snapshot:imported }, 'shop').snapshot.store[originalShape.id]).toEqual(originalShape);
  expect(project.store[originalShape.id]).toEqual(originalShape);
});

test('one history spans edits on both planes and external installs invalidate its old timeline', () => {
  const history = createLayersHistory<{domain:number; architecture:number}>((a,b) => JSON.stringify(a) === JSON.stringify(b));
  history.reset({domain:0,architecture:0});
  history.record({domain:10,architecture:0});
  history.record({domain:10,architecture:20});
  expect(history.undo()).toEqual({domain:10,architecture:0});
  expect(history.undo()).toEqual({domain:0,architecture:0});
  expect(history.redo()).toEqual({domain:10,architecture:0});
  history.record({domain:30,architecture:0});
  expect(history.canRedo).toBe(false);
  history.reset({domain:100,architecture:100});
  expect(history.canUndo).toBe(false);
  expect(history.canRedo).toBe(false);
});
