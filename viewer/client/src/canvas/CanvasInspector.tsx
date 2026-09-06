import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  renderPlaintextFromRichText,
  useValue,
  type Editor,
  type TLShape,
  type TLShapeId,
} from "tldraw";
import type { GraphPaneProps } from "../GraphPane";
import { isModelShape } from "./shapes";
import { modelShapeId } from "./projection";
import { indexModel, projectGraph } from "../graph/model";

export const noteText = (editor: Editor, shape: TLShape) =>
  shape.type === "note" || shape.type === "text"
    ? renderPlaintextFromRichText(editor, shape.props.richText).trim()
    : "";

export function CanvasInspector({
  editor,
  props,
}: {
  editor: Editor;
  props: GraphPaneProps;
}) {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [targetId, setTargetId] = useState("");
  const [kind, setKind] = useState("explanation"),
    [evidence, setEvidence] = useState("");
  const [promote, setPromote] = useState(false),
    [move, setMove] = useState(false),
    [contextId, setContextId] = useState("");
  const [busy, setBusy] = useState(false),
    [changeId, setChangeId] = useState<string>();
  const selected = useValue(
    "Canvas commands selection",
    () => editor.getSelectedShapes(),
    [editor],
  );
  const annotations = useValue(
    "Canvas notes",
    () =>
      editor
        .getCurrentPageShapes()
        .filter((shape) => shape.type === "note" || shape.type === "text")
        .map((shape) => ({
          shape,
          text: noteText(editor, shape),
          binding: editor.getBindingsFromShape(shape.id, "lexicon-note")[0],
        })),
    [editor],
  );
  const only = selected.length === 1 ? selected[0] : undefined;
  const note = only && annotations.find((entry) => entry.shape.id === only.id);
  const reference = only && isModelShape(only) ? only : undefined;
  const attached = note?.binding && editor.getShape(note.binding.toId);
  const graphId =
    reference?.props.graphId ||
    (attached && isModelShape(attached) ? attached.props.graphId : "");
  const modelId = graphId.startsWith("item:")
    ? graphId.slice(5)
    : graphId.startsWith("relation:")
      ? graphId.slice(9)
      : "";
  const item = props.model.items.find((item) => item.id === modelId);
  const name = (shape?: TLShape) => {
    if (!shape || !isModelShape(shape)) return "Free note";
    const id = shape.props.graphId.replace(/^(item:|relation:)/, "");
    return (
      props.model.items.find((i) => i.id === id)?.name ||
      (shape.props.graphId.startsWith("mapping:")
        ? "Code link"
        : "Missing model reference")
    );
  };
  useEffect(() => {
    setTargetId(item?.id || "");
    setPromote(false);
    setMove(false);
    setError("");
  }, [only?.id]);
  const locate = (id: TLShapeId) => {
    const shape = editor.getShape(id),
      bounds = shape && editor.getShapePageBounds(shape);
    if (!bounds) return;
    editor
      .setCurrentTool("select")
      .select(id)
      .zoomToBounds(bounds, { inset: 100, targetZoom: 1 });
    editor.focus();
  };
  useEffect(() => {
    const id = params.get("shape") as TLShapeId | null;
    if (id && editor.getShape(id)) locate(id);
  }, [params.get("shape")]);
  const linkNote = async (id: TLShapeId) => {
    const url = new URL(window.location.href);
    url.searchParams.set("canvas", "tldraw");
    url.searchParams.set("shape", id);
    try {
      await navigator.clipboard.writeText(url.href);
      setNotice("Note link copied.");
    } catch {
      setNotice(url.href);
    }
  };
  const attach = () => {
    if (!note || !targetId) return;
    const target = props.model.items.find((i) => i.id === targetId);
    const id = modelShapeId(
      `${target?.type === "relationship" ? "relation" : "item"}:${targetId}`,
    );
    if (!editor.getShape(id)) {
      setError("Open this model object on the canvas first.");
      return;
    }
    const page = editor
      .getShapePageTransform(note.shape)
      .applyToPoint({ x: 0, y: 0 });
    const offset = editor.getPointInShapeSpace(id, page);
    editor.markHistoryStoppingPoint("attach note");
    editor.run(() => {
      if (note.binding) editor.deleteBinding(note.binding.id);
      editor.createBinding({
        type: "lexicon-note",
        fromId: note.shape.id,
        toId: id,
        props: { x: offset.x, y: offset.y },
      });
    });
  };
  const command = async (command: unknown) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/projects/${props.projectId}/canvas/model-command`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision: props.modelRevision, command }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "The model change failed.");
      setChangeId(result.changeId);
      setPromote(false);
      setMove(false);
      setNotice("Model updated. The change is also recorded in Chat.");
      props.onModelChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const undo = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/projects/${props.projectId}/chat/undo`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changeId }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setChangeId(undefined);
      setNotice("Model change undone.");
      props.onModelChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const visibleNotes = annotations.filter((entry) =>
    `${entry.text} ${name(entry.binding && editor.getShape(entry.binding.toId))}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="canvas-inspector">
      <div className="canvas-context-tools">
        <button aria-expanded={open} onClick={() => setOpen(!open)}>
          Notes ({annotations.length})
        </button>
        {reference && <span>{name(reference)}</span>}
        {note && (
          <>
            <span>
              {note.binding ? `Attached to ${name(attached)}` : "Free note"}
            </span>
            <button onClick={() => void linkNote(note.shape.id)}>
              Copy note link
            </button>
            <button disabled={!note.text} onClick={() => setPromote(!promote)}>
              Add to model…
            </button>
            {note.binding && (
              <button
                onClick={() => {
                  editor.markHistoryStoppingPoint("detach note");
                  editor.deleteBinding(note.binding!.id);
                }}
              >
                Detach note
              </button>
            )}
            <label>
              Attach to{" "}
              <select
                aria-label="Note attachment"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                <option value="">Choose object</option>
                {props.model.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.type})
                  </option>
                ))}
              </select>
            </label>
            <button disabled={!targetId} onClick={attach}>
              {note.binding ? "Reattach" : "Attach"}
            </button>
          </>
        )}
        {item?.type === "concept" && reference && (
          <button onClick={() => setMove(!move)}>Move to context…</button>
        )}
        {!!selected.length && (
          <button
            onClick={async () => {
              try {
                const ids = new Set(editor.getSelectedShapeIds());
                for (const id of [...ids])
                  editor.visitDescendants(id, (child) => {
                    ids.add(child);
                  });
                // Semantic edges live on the page, outside their concepts' context container.
                for (const edge of projectGraph(
                  indexModel(props.model),
                  props.workspace,
                ).connections) {
                  if (
                    ids.has(modelShapeId(edge.source)) &&
                    ids.has(modelShapeId(edge.target)) &&
                    editor.getShape(modelShapeId(edge.id))
                  )
                    ids.add(modelShapeId(edge.id));
                }
                const result = await editor.toImage([...ids], {
                  format: "png",
                  background: true,
                  padding: 24,
                });
                const url = URL.createObjectURL(result.blob),
                  link = document.createElement("a");
                link.href = url;
                link.download = `${props.model.id}-selection.png`;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Export selection
          </button>
        )}
        {changeId && (
          <button disabled={busy} onClick={() => void undo()}>
            Undo model edit
          </button>
        )}
      </div>
      {notice && (
        <p role="status">
          {notice}
          <button
            aria-label="Dismiss canvas notice"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {promote && note && (
        <form
          className="canvas-command"
          onSubmit={(e) => {
            e.preventDefault();
            void command({
              type: "annotate",
              targetId,
              annotation: {
                kind,
                text: note.text,
                ...(evidence ? { evidence } : {}),
              },
            });
          }}
        >
          <strong>Add this note to the shared model</strong>
          <p>{note.text}</p>
          <label>
            Model object{" "}
            <select
              required
              aria-label="Annotation target"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">Choose object</option>
              {props.model.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kind{" "}
            <input
              value={kind}
              required
              maxLength={80}
              onChange={(e) => setKind(e.target.value)}
            />
          </label>
          <label>
            Evidence{" "}
            <select
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
            >
              <option value="">Unqualified</option>
              <option value="observed">Observed behavior</option>
              <option value="intended">Intended rule</option>
              <option value="enforced">Enforced by a check</option>
            </select>
          </label>
          <button disabled={busy || !targetId} type="submit">
            Add annotation
          </button>
          <button type="button" onClick={() => setPromote(false)}>
            Cancel
          </button>
        </form>
      )}
      {move && item?.type === "concept" && (
        <form
          className="canvas-command"
          onSubmit={(e) => {
            e.preventDefault();
            void command({
              type: "move-concept",
              targetId: item.id,
              contextId,
            });
          }}
        >
          <strong>Change the owning context of {item.name}</strong>
          <label>
            New context{" "}
            <select
              required
              value={contextId}
              onChange={(e) => setContextId(e.target.value)}
            >
              <option value="">Choose context</option>
              {props.model.items
                .filter((i) => i.type === "context" && i.id !== item.context)
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
            </select>
          </label>
          <button disabled={busy || !contextId} type="submit">
            Move concept
          </button>
          <button type="button" onClick={() => setMove(false)}>
            Cancel
          </button>
        </form>
      )}
      {open && (
        <aside className="canvas-note-list" aria-label="Canvas notes">
          <label>
            Search notes{" "}
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {!visibleNotes.length && <p>No matching notes.</p>}
          {visibleNotes.map((entry) => (
            <button
              key={entry.shape.id}
              onClick={() => {
                locate(entry.shape.id);
                const next = new URLSearchParams(params);
                next.set("shape", entry.shape.id);
                setParams(next);
              }}
            >
              <span>{entry.text || "Empty note"}</span>
              <small>
                {name(entry.binding && editor.getShape(entry.binding.toId))}
              </small>
            </button>
          ))}
        </aside>
      )}
    </div>
  );
}
