import type { Dispatch, SetStateAction } from "react";
import type { Model } from "../../../shared/model";
import type { GraphSelection } from "../graph/model";
import type { Workspace } from "../graph/storage";

export type CanvasCommand = {
  sequence: number;
  action: "locate" | "expand";
  selection: GraphSelection;
};

export type CanvasPaneProps = {
  model: Model;
  projectKey?: string;
  projectId: string;
  modelRevision: string;
  onModelChanged: () => void;
  statusHost: HTMLDivElement | null;
  visible: boolean;
  workspace: Workspace;
  setWorkspace: Dispatch<SetStateAction<Workspace>>;
  selection?: GraphSelection;
  query: string;
  matches: string[];
  onSelect: (selection: GraphSelection) => void;
  onClearSelection: () => void;
  command?: CanvasCommand;
};
