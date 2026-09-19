import type { ModelItem, ModelProblem } from "../../shared/model";
import type { AgentSession } from "../../shared/agent-session";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type HTMLAttributes } from "react";
import { useAgentWork } from "./AgentWork";
import type { ReaderOpenMode } from "./readerState";
import AgentConversation from "./AgentConversation";
import Icon from "./Icon";
import AgentResizeHandles from "./AgentResizeHandles";
import type { AgentSize, Point, Viewport } from "./agentCanvas";
import "./styles/chat.css";

export default function ChatPane({ agent, projectId, projectRoot, style, dragHandle, resizeViewport, onResizeStart, onResize, inCanvas, expanded, onExpand, open, focusRequest, selected, modelRevision, viewerSessionId, example, onClose, onRunningChange, onModelChanged, onSelect, onOpenFile, onTaskChange, initialText, onLifecycle, lifecycleBusy }: {
  onLifecycle: (action: "archive" | "settle" | "discard" | "restore" | "unsettle") => void; lifecycleBusy: boolean;
  initialText?: string;
  resizeViewport?: Viewport; onResizeStart: (point: Point) => void; onResize: (size: AgentSize) => void;
  agent: AgentSession; projectId: string; projectRoot: string; style?: CSSProperties; dragHandle?: HTMLAttributes<HTMLDivElement>; inCanvas: boolean; expanded: boolean; onExpand: () => void; open: boolean; focusRequest?: number;
  selected?: ModelItem; modelRevision: string; viewerSessionId?: string;
  empty: boolean; problem?: ModelProblem; example?: boolean; onClose: () => void; onRunningChange: (running: boolean) => void;
  onModelChanged: () => void; onSelect: (id: string, mode?: ReaderOpenMode) => void; onOpenFile: (file: string) => void; onTaskChange: () => void;
}) {
  const task = useAgentWork()?.tasks.find(task => task.agent.id === agent.id);
  const status = task?.status && task.status !== "Ready" ? task.status : undefined;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsButton = useRef<HTMLButtonElement>(null);
  const closeDetails = useCallback(() => { setDetailsOpen(false); detailsButton.current?.focus(); }, []);
  useEffect(() => { if (!open) setDetailsOpen(false); }, [open]);
  return <aside id={open ? "chat-pane" : `agent-pane-${agent.id}`} className={`chat-pane agent-conversation-card${inCanvas ? " in-canvas" : " reading-agent"}`} style={style} aria-label={`${agent.name} conversation`} hidden={!open}>
    <div className={`chat-heading${inCanvas ? " agent-drag-heading" : ""}`} {...(inCanvas ? dragHandle : {})}>
      <span className={`work-dot${task?.state?.running ? " working" : ""}${status === "Needs attention" || status === "Needs input" ? " attention" : ""}`} aria-hidden="true" />
      <span className="pane-title" title={agent.name}>{agent.name}</span>
      {status && <span className="agent-heading-status" role="status">{status}</span>}
      <div className="chat-heading-actions">
        <button className="quiet icon-button" aria-label={expanded ? "Return conversation to canvas" : "Expand conversation"} title={expanded ? "Return to canvas" : "Expand conversation"} onClick={onExpand}><Icon name={expanded ? "panel-right" : "open"} /></button>
        <button className="quiet icon-button" aria-label="Minimize agent" title="Minimize" onClick={onClose}><span aria-hidden="true">⌃</span></button>
        <button ref={detailsButton} className="quiet icon-button agent-details-toggle" aria-label="Task details" aria-haspopup="dialog" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(value => !value)}><Icon name="more" /></button>
      </div>
    </div>
    <AgentConversation detailsOpen={detailsOpen} onCloseDetails={closeDetails} onLifecycle={onLifecycle} lifecycleBusy={lifecycleBusy} agent={agent} initialText={initialText} agentId={agent.id} projectId={projectId} projectRoot={projectRoot} active={open} focusRequest={focusRequest} selected={selected} modelRevision={modelRevision} viewerSessionId={viewerSessionId} example={example} onRunningChange={onRunningChange} onModelChanged={onModelChanged} onTaskChange={onTaskChange} onClose={onClose} onSelect={onSelect} onOpenFile={onOpenFile} />

    {open && <AgentResizeHandles fromLeft={!inCanvas} viewport={resizeViewport} onStart={onResizeStart} onResize={onResize} />}
  </aside>;
}
