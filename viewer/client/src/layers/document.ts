import type { TLRecord, TLStoreSnapshot, TLPageId } from 'tldraw';
import { modelShapeId, isModelShape } from '../canvas/references';
import type { ElementDimension } from '../../../shared/model';

export const pageIds: Record<ElementDimension, TLPageId> = {
  domain: 'page:layers-domain' as TLPageId,
  architecture: 'page:layers-architecture' as TLPageId,
};
export const layerShapeId = (graphId: string, layer: ElementDimension) => modelShapeId(graphId, `layers-${layer}`);
export const isLayerPage = (id: string) => Object.values(pageIds).includes(id as TLPageId);

/** Import the earlier browser-only layout once. Never replace an existing project page. */
export function importLayers(project: TLStoreSnapshot | undefined, legacy: TLStoreSnapshot | undefined): TLStoreSnapshot | undefined {
  if (!legacy || Object.values(project?.store || {}).some(r => r.typeName === 'page' && isLayerPage(r.id))) return project;
  const source = legacy.store;
  const layerOf = (record: TLRecord): ElementDimension | undefined => {
    let id = record.typeName === 'shape' ? record.parentId : record.id;
    const seen = new Set<string>();
    while (source[id]?.typeName === 'shape' && !seen.has(id)) {
      seen.add(id); id = (source[id] as Extract<TLRecord, {typeName:'shape'}>).parentId;
    }
    return id === pageIds.domain ? 'domain' : id === pageIds.architecture ? 'architecture' : undefined;
  };
  const remap = new Map<string, string>();
  for (const r of Object.values(source)) {
    if (r.typeName === 'shape') {
      const layer = layerOf(r); if (!layer) continue;
      remap.set(r.id, isModelShape(r) ? layerShapeId(r.props.graphId, layer) : `shape:layers-import:${r.id.slice(6)}`);
    } else if (r.typeName === 'asset') remap.set(r.id, `asset:layers-import:${r.id.slice(6)}`);
    else if (r.typeName === 'binding') remap.set(r.id, `binding:layers-import:${r.id.slice(8)}`);
    else if (r.typeName === 'page' && isLayerPage(r.id)) remap.set(r.id, r.id);
  }
  const store: Record<string, TLRecord> = { ...project?.store };
  for (const r of Object.values(source)) {
    const id = remap.get(r.id); if (!id) continue;
    let next: unknown = { ...r, id };
    if (r.typeName === 'shape') next = { ...r, id, parentId: remap.get(r.parentId) || r.parentId,
      meta: { ...r.meta, ...(isModelShape(r) ? { lexiconProjection: `layers-${layerOf(r)}` } : {}) },
      props: { ...r.props, ...('assetId' in r.props && r.props.assetId ? { assetId: remap.get(r.props.assetId) || r.props.assetId } : {}) } };
    if (r.typeName === 'binding') {
      if (!remap.has(r.fromId) || !remap.has(r.toId)) continue;
      next = { ...r, id, fromId: remap.get(r.fromId), toId: remap.get(r.toId) };
    }
    if (!store[id]) store[id] = next as TLRecord;
  }
  // A project document owns its own identity and settings.
  if (!project) for (const r of Object.values(source)) if (r.typeName === 'document') store[r.id] = r;
  return { schema: project?.schema || legacy.schema, store };
}

/** Session history is shared by both planes, and reset when another version is installed. */
export function createLayersHistory<T>(equal: (a: T, b: T) => boolean) {
  let past: T[] = [], future: T[] = [], current: T;
  return {
    reset(value: T) { current = value; past = []; future = []; },
    record(value: T) {
      if (equal(current, value)) return;
      past.push(current); if (past.length > 30) past.shift();
      current = value; future = [];
    },
    undo() { if (!past.length) return; future.push(current); return current = past.pop()!; },
    redo() { if (!future.length) return; past.push(current); return current = future.pop()!; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
  };
}
