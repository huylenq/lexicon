import { createTLSchema, defaultBindingSchemas, defaultShapeSchemas,
  createShapePropsMigrationIds, createShapePropsMigrationSequence, type TLShape, type TLBinding } from "@tldraw/tlschema";
import { T } from "@tldraw/validate";
import { validTerritoryRegion, type TerritoryPreferences } from "./canvas-geometry";

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "lexicon-object": { graphId: string; w: number; h: number; group: boolean; territory: TerritoryPreferences | null };
    "lexicon-connection": {
      graphId: string; path: string; points: { x: number; y: number }[];
      labelX: number; labelY: number; labelWidth: number;
    };
  }
  interface TLGlobalBindingPropsMap { "lexicon-note": { x: number; y: number } }
}
export type ObjectShape = TLShape<"lexicon-object">;
export type ConnectionShape = TLShape<"lexicon-connection">;
export type NoteBinding = TLBinding<"lexicon-note">;
const point = T.object({ x: T.number, y: T.number });
const region = T.arrayOf(T.arrayOf(T.arrayOf(point))).check(value => {
  if (!validTerritoryRegion(value)) throw new Error("Territory polygons need nonempty rings spanning an area.");
});
export const objectProps = { graphId: T.string, w: T.positiveNumber, h: T.positiveNumber, group: T.boolean,
  territory: T.object({
    edits: T.arrayOf(T.object({ id: T.string, add: region, cut: region })),
    legacy: T.object({ points: T.arrayOf(point), label: point }).nullable(),
  }).nullable() };
export const connectionProps = {
  graphId: T.string, path: T.string, points: T.arrayOf(T.object({ x: T.number, y: T.number })),
  labelX: T.number, labelY: T.number, labelWidth: T.positiveNumber,
};
export const noteBindingProps = { x: T.number, y: T.number };
const objectVersions = createShapePropsMigrationIds("lexicon-object", { PositiveSize: 1, Territory: 2, TerritoryPreferences: 3 });
export const objectMigrations = createShapePropsMigrationSequence({ sequence: [{
  id: objectVersions.PositiveSize,
  up: (props) => { props.w = Math.max(1, props.w); props.h = Math.max(1, props.h); },
}, { id: objectVersions.Territory, up: (props) => { props.territory = null; } }, {
  id: objectVersions.TerritoryPreferences,
  up: (props) => { if (props.territory) props.territory = { edits: [], legacy: props.territory }; },
}] });
export const canvasSchema = createTLSchema({
  shapes: { ...defaultShapeSchemas, "lexicon-object": { props: objectProps, migrations: objectMigrations },
    "lexicon-connection": { props: connectionProps } },
  bindings: { ...defaultBindingSchemas, "lexicon-note": { props: noteBindingProps } },
});
