import type { Dispatch, SetStateAction } from "react";
import type { Model } from "../../../shared/model";
import type { GraphSelection } from "../graph/model";
import type { Workspace } from "../graph/storage";
import type { ReaderOpenMode } from "../readerState";

export type CanvasCommand = {
  sequence: number;
  action: "locate" | "expand" | "fit";
  selection: GraphSelection;
  expiresAt?: number;
  signal?: AbortSignal;
  complete?: (error?: string) => void;
};

export type CanvasPaneProps = {
  model: Model;
  projectKey?: string;
  projectId: string;
  modelRevision: string;
  onModelChanged: () => void;
  statusHost: HTMLDivElement | null;
  assistantHost?: (element: HTMLDivElement | null) => void;
  visible: boolean;
  workspace: Workspace;
  setWorkspace: Dispatch<SetStateAction<Workspace>>;
  selection?: GraphSelection;
  query: string;
  matches: string[];
  onSelect: (selection: GraphSelection, mode?: ReaderOpenMode) => void;
  onClearSelection: () => void;
  command?: CanvasCommand;
};
