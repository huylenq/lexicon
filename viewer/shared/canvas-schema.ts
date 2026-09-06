import { createTLSchema, defaultBindingSchemas, defaultShapeSchemas,
  createShapePropsMigrationIds, createShapePropsMigrationSequence, type TLShape, type TLBinding } from "@tldraw/tlschema";
import { T } from "@tldraw/validate";

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "lexicon-object": { graphId: string; w: number; h: number; group: boolean };
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
export const objectProps = { graphId: T.string, w: T.positiveNumber, h: T.positiveNumber, group: T.boolean };
export const connectionProps = {
  graphId: T.string, path: T.string, points: T.arrayOf(T.object({ x: T.number, y: T.number })),
  labelX: T.number, labelY: T.number, labelWidth: T.positiveNumber,
};
export const noteBindingProps = { x: T.number, y: T.number };
const objectVersions = createShapePropsMigrationIds("lexicon-object", { PositiveSize: 1 });
export const objectMigrations = createShapePropsMigrationSequence({ sequence: [{
  id: objectVersions.PositiveSize,
  up: (props) => { props.w = Math.max(1, props.w); props.h = Math.max(1, props.h); },
}] });
export const canvasSchema = createTLSchema({
  shapes: { ...defaultShapeSchemas, "lexicon-object": { props: objectProps, migrations: objectMigrations },
    "lexicon-connection": { props: connectionProps } },
  bindings: { ...defaultBindingSchemas, "lexicon-note": { props: noteBindingProps } },
});
