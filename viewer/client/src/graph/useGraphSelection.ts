import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { GraphSelection } from "./model";

type SelectableNode = {
  id: string;
  selected?: boolean;
  data: { selection?: GraphSelection };
};

export type ModifierSelectionGesture = {
  selected: Set<string>;
  x: number;
  y: number;
  ignoredContext?: string;
};

type ModifierSelectionStart = Omit<ModifierSelectionGesture, "selected">;

function selectionKey(selection?: GraphSelection) {
  if (!selection) return "";
  return selection.kind === "bundle"
    ? `bundle:${selection.relationships.join(",")}:${selection.mappings.join(",")}`
    : `${selection.kind}:${selection.id}`;
}

function nodeMatchesSelection(node: SelectableNode, selection?: GraphSelection) {
  const nodeSelection = node.data.selection;
  return !!(
    nodeSelection &&
    "id" in nodeSelection &&
    selection &&
    "id" in selection &&
    nodeSelection.kind === selection.kind &&
    nodeSelection.id === selection.id
  );
}

function setOnlySelection<NodeType extends SelectableNode>(
  nodes: NodeType[],
  selection?: GraphSelection,
) {
  return nodes.map((node) => {
    const selected = nodeMatchesSelection(node, selection);
    return node.selected === selected ? node : { ...node, selected };
  });
}

function applyModifierSelection<NodeType extends SelectableNode>(
  nodes: NodeType[],
  gesture: ModifierSelectionGesture,
  toggled: Set<string>,
) {
  return nodes.map((node) => ({
    ...node,
    selected: toggled.has(node.id)
      ? !gesture.selected.has(node.id)
      : gesture.selected.has(node.id),
  }));
}

export function useGraphSelection<NodeType extends SelectableNode>({
  nodes,
  setNodes,
  readerSelection,
  onSelect,
  onClearSelection,
}: {
  nodes: NodeType[];
  setNodes: Dispatch<SetStateAction<NodeType[]>>;
  readerSelection?: GraphSelection;
  onSelect: (selection: GraphSelection) => void;
  onClearSelection: () => void;
}) {
  const [multiSelecting, setMultiSelecting] = useState(false);
  const [modifierSelectionBase, setModifierSelectionBase] =
    useState<Set<string>>();
  const modifierGesture = useRef<ModifierSelectionGesture>();
  const pendingReaderEcho = useRef<string>();
  const readerSelectionKey = selectionKey(readerSelection);

  useEffect(() => {
    // Reader navigation echoes a graph click through the URL. It must not
    // replace a multi-selection that began before that echo arrived.
    if (pendingReaderEcho.current === readerSelectionKey) {
      pendingReaderEcho.current = undefined;
      return;
    }
    pendingReaderEcho.current = undefined;
    setMultiSelecting(false);
    setNodes((current) => setOnlySelection(current, readerSelection));
  }, [readerSelectionKey, setNodes]);

  const resetModifierGesture = () => {
    modifierGesture.current = undefined;
    setModifierSelectionBase(undefined);
  };

  const beginModifierGesture = (start?: ModifierSelectionStart) => {
    const gesture = start
      ? {
          ...start,
          selected: new Set(
            nodes.filter((node) => node.selected).map((node) => node.id),
          ),
        }
      : undefined;
    modifierGesture.current = gesture;
    setModifierSelectionBase(gesture?.selected);
  };

  const completeModifierClick = (x: number, y: number) => {
    const gesture = modifierGesture.current;
    const ignoredContext = gesture?.ignoredContext;
    if (
      !gesture ||
      !ignoredContext ||
      // Pointer events retain fractions; click coordinates may round each axis.
      Math.abs(x - gesture.x) > 1 ||
      Math.abs(y - gesture.y) > 1
    )
      return false;
    setMultiSelecting(true);
    setNodes((current) =>
      applyModifierSelection(current, gesture, new Set([ignoredContext])),
    );
    resetModifierGesture();
    return true;
  };

  const completeMarquee = (touched?: Set<string>) => {
    setMultiSelecting(true);
    const gesture = modifierGesture.current;
    if (gesture && touched)
      setNodes((current) => applyModifierSelection(current, gesture, touched));
    resetModifierGesture();
  };

  const preserveIgnoredContext = (id: string, selected: boolean) => {
    const gesture = modifierGesture.current;
    return gesture?.ignoredContext === id
      ? gesture.selected.has(id)
      : selected;
  };

  const select = (chosen: GraphSelection) => {
    pendingReaderEcho.current = selectionKey(chosen);
    setMultiSelecting(false);
    setNodes((current) => setOnlySelection(current, chosen));
    onSelect(chosen);
  };

  const toggle = (chosen: GraphSelection) => {
    setMultiSelecting(true);
    setNodes((current) =>
      current.map((node) =>
        nodeMatchesSelection(node, chosen)
          ? { ...node, selected: !node.selected }
          : node,
      ),
    );
  };

  const clear = () => {
    pendingReaderEcho.current = undefined;
    setMultiSelecting(false);
    resetModifierGesture();
    setNodes((current) => setOnlySelection(current));
    onClearSelection();
  };

  return {
    multiSelecting,
    modifierSelectionBase,
    beginModifierGesture,
    completeModifierClick,
    completeMarquee,
    currentModifierGesture: () => modifierGesture.current,
    preserveIgnoredContext,
    activateMultiSelection: () => setMultiSelecting(true),
    select,
    toggle,
    clear,
  };
}
