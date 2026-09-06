import type { CanvasModelCommand } from "../shared/canvas";
import type { Annotation, Model } from "../shared/model";
import { applyPatch } from "./chat/model-edit";

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Validate the wire input before Chat's existing lock, revision, and undo workflow applies it. */
export function readCanvasCommand(input: unknown): {
  revision: string;
  command: CanvasModelCommand;
} {
  if (!object(input) || typeof input.revision !== "string")
    throw new Error("A model revision is required.");
  const raw = input.command;
  if (!object(raw) || typeof raw.targetId !== "string")
    throw new Error("Choose a model command and target.");
  let command: CanvasModelCommand;
  if (raw.type === "annotate") {
    const annotation = raw.annotation;
    if (
      !object(annotation) ||
      typeof annotation.text !== "string" ||
      !annotation.text.trim() ||
      annotation.text.length > 20_000 ||
      typeof annotation.kind !== "string" ||
      !annotation.kind.trim() ||
      annotation.kind.length > 80
    )
      throw new Error(
        "An annotation needs a kind and text (up to 20,000 characters).",
      );
    if (
      annotation.evidence !== undefined &&
      (typeof annotation.evidence !== "string" ||
        !["observed", "intended", "enforced"].includes(annotation.evidence))
    )
      throw new Error("Invalid annotation evidence.");
    // Preserve all annotation fields so applyPatch also rejects unknown fields.
    command = {
      type: "annotate",
      targetId: raw.targetId,
      annotation: annotation as unknown as Annotation,
    };
  } else if (raw.type === "move-concept" && typeof raw.contextId === "string") {
    command = {
      type: "move-concept",
      targetId: raw.targetId,
      contextId: raw.contextId,
    };
  } else throw new Error("Unknown canvas model command.");
  return { revision: input.revision, command };
}

/** Semantic command rules do not depend on a provider, conversation, or filesystem. */
export function canvasModelEdit(model: Model, command: CanvasModelCommand) {
  const item = model.items.find((item) => item.id === command.targetId);
  if (!item) throw new Error("The selected model object is unavailable.");
  let updated = item,
    text: string;
  switch (command.type) {
    case "annotate":
      updated = {
        ...item,
        annotations: [...item.annotations, command.annotation],
      };
      text = `Added a ${command.annotation.kind} annotation to ${item.name} from the canvas: ${command.annotation.text}`;
      break;
    case "move-concept": {
      const context = model.items.find(
        (item) => item.id === command.contextId && item.type === "context",
      );
      if (item.type !== "concept" || !context || context.id === item.context)
        throw new Error("Choose a different owning context for this concept.");
      updated = { ...item, context: context.id };
      text = `Moved ${item.name} to ${context.name} from the canvas.`;
      break;
    }
  }
  return { next: applyPatch(model, { upsert: [updated] }), item, text };
}
