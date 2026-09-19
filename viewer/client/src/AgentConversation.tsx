import { useEffect, useMemo, useRef, useState } from "react";
import AgentTranscript from "./AgentTranscript";
import type { ModelItem } from "../../shared/model";
import { emptyAgent, type AgentState } from "../../shared/agent-runtime";
import { applyAgentStateFrame, type AgentStateFrame } from "../../shared/agent-state-stream";
import { request } from "./ui";
import { useUserSettings } from "./UserSettings";
import ObjectName from "./ObjectName";
import type { AgentSession } from "../../shared/agent-session";
import { useAgentWork } from "./AgentWork";
import { getModelDraft } from "./agentDraft";
import { DraftActions, DraftFields, DraftMetadata } from "./AgentDraftReview";

const json = (value: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
type Props = { detailsOpen: boolean; onCloseDetails: () => void; onLifecycle: (action: "archive" | "settle" | "discard" | "restore" | "unsettle") => void; lifecycleBusy: boolean; agent: AgentSession; initialText?: string; viewerSessionId?: string; onModelChanged: () => void; onTaskChange: () => void; onClose: () => void; agentId: string; projectId: string; projectRoot: string; active: boolean; selected?: ModelItem; modelRevision: string; example?: boolean; focusRequest?: number; onRunningChange: (running: boolean) => void; onSelect: (id: string) => void; onOpenFile: (file: string) => void };

export default function AgentConversation({ detailsOpen, onCloseDetails, onLifecycle, lifecycleBusy, agent, initialText, viewerSessionId, onModelChanged, onTaskChange, onClose, agentId, projectId, projectRoot, active, selected, modelRevision, example, focusRequest, onRunningChange, onSelect, onOpenFile }: Props) {
  const userSettings = useUserSettings();
  const workspace = useAgentWork();
  const watching = active || workspace?.activeAgentId === agentId;
  const connection = userSettings.settings?.connections.t3;
  const empty = useRef(emptyAgent());
  const state = workspace?.states[agentId] || empty.current;
  const acceptState = workspace?.update, beginConnection = workspace?.beginConnection, captureRequest = workspace?.captureRequest;
  const [sessions, setSessions] = useState<{ id: string; title: string; active: number }[]>([]);
  const [version, setVersion] = useState(0);
  const [text, setText] = useState(initialText || "");
  const [includeContext, setIncludeContext] = useState(true);
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [transportError, setTransportError] = useState("");
  const [diff, setDiff] = useState<{ diff: string; checkpoint: number }>();
  const [answers, setAnswers] = useState<Record<string, Record<string, string[]>>>({});
  const [following, setFollowing] = useState(true);
  const input = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const diffView = useRef<HTMLElement>(null);
  const details = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!detailsOpen) return;
    details.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Element && !details.current?.contains(event.target) && !event.target.closest(".agent-details-toggle")) onCloseDetails();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [detailsOpen, onCloseDetails]);
  const nearBottom = useRef(true);
  const identity = useRef("");
  identity.current = `${projectId}:${state.thread?.id || ""}:${state.checkpoint}`;
  const base = `/api/projects/${encodeURIComponent(projectId)}/agent`;
  const endpoint = (action: string) => `${base}/${action}?agent=${encodeURIComponent(agentId)}`;
  const reload = () => setVersion(value => value + 1);

  useEffect(() => {
    let stopped = false, token = beginConnection?.(agentId) || 0;
    void request<typeof sessions>(endpoint("sessions")).then(value => { if (!stopped) { setSessions(value); } }).catch(error => { if (!stopped) setTransportError(error.message); });
    const refresh = async () => {
        const requestToken = { ...(captureRequest?.(agentId) || { sequence: 0 }), connection: token };
        try { const next = await request<AgentState>(endpoint("state"), { signal: AbortSignal.timeout(5000) }); if (!stopped && acceptState?.(agentId, next, requestToken)) setTransportError(""); }
        catch { if (!stopped) setTransportError("Connection interrupted. Reconnecting…"); }
      };
    if (!watching) {
      void refresh();
      const poll = setInterval(() => void refresh(), 3000);
      return () => { stopped = true; beginConnection?.(agentId); clearInterval(poll); };
    }
    const stream = new EventSource(endpoint("events"));
    let lastEvent = Date.now(), streamState: AgentState | undefined, resyncing = false;
    stream.addEventListener("open", () => { if (!stopped) { token = beginConnection?.(agentId) || 0; streamState = undefined; } });
    stream.addEventListener("state", event => {
      if (stopped || resyncing) return;
      try {
        streamState = applyAgentStateFrame(streamState, JSON.parse((event as MessageEvent).data) as AgentStateFrame);
        if (acceptState?.(agentId, streamState, { ...(captureRequest?.(agentId) || { sequence: 0 }), connection: token })) setTransportError("");
        lastEvent = Date.now();
      } catch {
        // A missing delta cannot be repaired against a possibly newer HTTP snapshot.
        resyncing = true; stream.close(); token = beginConnection?.(agentId) || 0;
        setTransportError("Refreshing the agent session…"); void refresh(); reload();
      }
    });
    stream.addEventListener("ping", () => { lastEvent = Date.now(); });
    stream.onerror = () => { if (!stopped) { token = beginConnection?.(agentId) || 0; streamState = undefined; setTransportError("Connection interrupted. Reconnecting…"); void refresh(); } };
    const watchdog = setInterval(() => { if (Date.now() - lastEvent > 5000) void refresh(); if (Date.now() - lastEvent > 15_000) reload(); }, 5000);
    return () => { stopped = true; beginConnection?.(agentId); stream.close(); clearInterval(watchdog); };
  }, [base, agentId, watching, version, userSettings.settings?.revision, acceptState, beginConnection, captureRequest]);
  useEffect(() => { onRunningChange(state.running); }, [state.running, onRunningChange]);
  useEffect(() => { if (active) input.current?.focus(); }, [active, focusRequest]);
  useEffect(() => { setIncludeContext(true); }, [selected?.id]);
  useEffect(() => { setDiff(undefined); setAnswers({}); }, [state.thread?.id]);
  useEffect(() => {
    if (diff && (diff.checkpoint !== state.checkpoint || (state.codeReview?.status === "ready" && !state.codeReview.hasChanges))) setDiff(undefined);
  }, [state.checkpoint, state.codeReview?.status, state.codeReview?.hasChanges, diff]);
  useEffect(() => { if (active && diff) diffView.current?.scrollIntoView({ block: "nearest" }); }, [diff, active]);
  useEffect(() => {
    if (active && nearBottom.current && transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [state.revision, active]);
  useEffect(() => {
    const choices = (connection?.models || []).filter(choice => state.scope === "code" || choice.modelOnly);
    const current = choices.find(choice => choice.instanceId === state.thread?.instanceId && choice.id === state.thread?.model);
    if (!choices.length) setModel("");
    else if (current) setModel(JSON.stringify([current.instanceId, current.id]));
    else if (!choices.some(choice => JSON.stringify([choice.instanceId, choice.id]) === model) && choices[0]) setModel(JSON.stringify([choices[0].instanceId, choices[0].id]));
  }, [connection, state.scope, state.thread?.instanceId, state.thread?.model]);
  async function action(name: string, value: unknown = {}) {
    setBusy(true); setError("");
    const token = captureRequest?.(agentId) || { connection: 0, sequence: 0 };
    try {
      const next = await request<AgentState>(endpoint(name), json(value));
      acceptState?.(agentId, next, token);
      if (name === "send" || name === "scope" || name === "context") { reload(); onTaskChange(); }
      if (name === "draft-apply") onModelChanged();
      return true;
    } catch (error) { setError((error as Error).message); if (name === "send") reload(); return false; }
    finally { setBusy(false); }
  }
  async function send() {
    if (!text.trim() || !model || busy || state.running || !connection?.connected) return;
    const [instanceId, modelId] = JSON.parse(model) as [string, string];
    nearBottom.current = true; setFollowing(true);
    if (await action("send", { text, instanceId, model: modelId, modelRevision, viewerSessionId, ...(includeContext && selected ? { contextId: selected.id } : {}) })) setText("");
  }
  async function openInT3() {
    setBusy(true); setError("");
    try { await request(endpoint("open"), json({})); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function showDiff() {
    const owner = identity.current;
    setBusy(true); setError("");
    try { const value = await request<{ diff: string; checkpoint: number }>(endpoint("diff")); if (identity.current === owner) setDiff(value.diff.trim() ? value : undefined); }
    catch (error) { if (identity.current === owner) setError((error as Error).message); }
    finally { setBusy(false); }
  }
  const selectedSession = sessions.find(session => session.active)?.id || "";
  const offline = !!transportError || !connection?.connected || (!!selectedSession && !state.connected);
  const changed = useRef(onModelChanged); changed.current = onModelChanged;
  // Only durable saves change the document. Draft and navigation receipts must
  // not reload an unchanged model and disturb its authored canvas projection.
  const savedReceiptStamp = useMemo(() => JSON.stringify([...new Set(state.receipts.flatMap(receipt =>
    !receipt.error && receipt.changeId ? [receipt.changeId] : []))].sort()), [state.receipts]);
  useEffect(() => { if (savedReceiptStamp !== "[]") changed.current(); }, [savedReceiptStamp]);
  const draft = getModelDraft(state.work, state.scope);
  const historical = !!agent.lifecycle && agent.lifecycle !== "active";
  const displayedError = (!detailsOpen && error) || transportError || state.error || userSettings.error || connection?.error;
  return <div className="implementation-pane" hidden={!active}>
    {detailsOpen && <dialog ref={details} open className="agent-task-details" aria-label="Task details" onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCloseDetails(); }
    }}>
      <div className="agent-details-heading"><strong>Task details</strong><button className="quiet" aria-label="Close task details" onClick={onCloseDetails}>×</button></div>
      <dl><dt>Connection</dt><dd>{connection?.label || "T3 Code"}{!connection?.connected && " · Disconnected"}</dd>
        <dt>Checkout</dt><dd><strong>{state.thread?.branch || "Current checkout"}</strong><span>{state.thread?.workspace || projectRoot}</span></dd></dl>
      {state.thread && <button className="quiet" disabled={busy || offline} onClick={() => void openInT3()}>Open in T3 Code ↗</button>}
      {error && <p role="alert" className="chat-error">{error}</p>}
      <div className="agent-details-lifecycle">
        {agent.bound && !historical && <button className="quiet" disabled={lifecycleBusy || busy} onClick={() => { onCloseDetails(); onLifecycle("settle"); }}>Mark settled</button>}
        {!historical && <button className="quiet" disabled={lifecycleBusy || busy} onClick={() => { onCloseDetails(); onLifecycle(agent.bound ? "archive" : "discard"); }}>{agent.bound ? "Archive task" : "Discard task"}</button>}
      </div>
    </dialog>}
    {connection && offline && <div className="agent-connection-notice" role="status">
      <span>{!connection.configured ? "Connect T3 Code to start this task." : "Connection interrupted."}</span>
      {!connection.configured ? <button className="quiet" onClick={() => userSettings.open("connections")}>Open settings</button>
        : <button className="quiet" disabled={busy} onClick={() => { void userSettings.refresh(); reload(); }}>Reconnect</button>}
    </div>}
    {state.codeReview?.status === "error" && <div className="agent-connection-notice" role="status">
      <span>Could not check code changes.</span><button className="quiet" disabled={busy || offline} onClick={() => void showDiff()}>Retry code review</button>
    </div>}
    <AgentTranscript active={active} state={state} example={example} bound={!!agent.bound} historical={historical}
      busy={busy} offline={offline} lifecycleBusy={lifecycleBusy} transcript={transcript} diffView={diffView} diff={diff}
      onSelect={onSelect} onOpenFile={onOpenFile} onLifecycle={onLifecycle} showDiff={showDiff} onCloseDiff={() => setDiff(undefined)}
      onScroll={() => {
        const element = transcript.current;
        if (element?.getClientRects().length) { nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100; setFollowing(nearBottom.current); }
      }} />
    {draft && <section className="agent-chat-draft" aria-label={draft.approvalPending ? "Saved model approval" : "Unsaved model draft"}>
      <div><strong>{draft.approvalPending ? "Model saved" : "Model draft"} <small>{draft.approvalPending ? "Finish approval" : "Unsaved"}</small></strong>{workspace?.hasSurface && <button className="quiet" onClick={() => { workspace.setActiveAgentId(agentId); workspace.dismissInspection(); onClose(); }}>Review model draft</button>}</div>
      <p>{draft.summary}</p>
      {!workspace?.hasSurface && <details><summary>Review model draft</summary><DraftMetadata draft={draft} />{draft.changes.map(change => <details key={change.itemId}><summary>{draft.migration ? "Draft item" : ({ add: "Add", modify: "Change", remove: "Remove" })[change.kind]} {(change.after || change.before)?.name || change.itemId}</summary><DraftFields change={change} draft={draft} items={workspace?.items || []} /></details>)}<DraftActions draft={draft} busy={busy} running={state.running} onApprove={draftId => void action("draft-apply", { draftId })} onDiscard={draftId => void action("draft-discard", { draftId })} /></details>}
    </section>}
    {!following && <button className="chat-jump quiet" onClick={() => { nearBottom.current = true; setFollowing(true); if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight; }}>Jump to latest ↓</button>}
    <div className="implementation-requests">
      {state.scope === "model" && !!state.approvals.length && <p className="hint">Broader access is declined in Model only. Stop this turn and choose Code + model if source changes are needed.</p>}
      {state.scope === "code" && state.approvals.map(approval => <section key={approval.id} className="chat-questions" aria-label="Agent approval"><p>{approval.detail}</p><div className="chat-options">{approval.options.map(option => <button key={option.decision} title={option.warning} disabled={busy || offline} onClick={() => void action("approve", { id: approval.id, decision: option.decision })}>{option.label}{option.warning && <small>{option.warning}</small>}</button>)}</div></section>)}
      {state.questions.map(request => <form key={request.id} className="chat-questions" onSubmit={event => { event.preventDefault(); void action("answer", { id: request.id, answers: answers[request.id] || {} }); }}>
        {request.questions.map(question => <fieldset key={question.id}><legend>{question.text}</legend><div className="chat-options">{question.options.map(option => {
          const checked = answers[request.id]?.[question.id]?.includes(option.label) || false;
          return <button type="button" key={option.label} aria-pressed={checked} className={checked ? "selected" : ""} title={option.description} onClick={() => setAnswers(value => ({ ...value, [request.id]: { ...value[request.id], [question.id]: question.multiple ? checked ? (value[request.id]?.[question.id] || []).filter(label => label !== option.label) : [...(value[request.id]?.[question.id] || []), option.label] : [option.label] } }))}>{option.label}</button>;
        })}</div>{question.custom && <input aria-label={question.text} placeholder="Your answer" value={(answers[request.id]?.[question.id] || []).join(", ")} onChange={event => setAnswers(value => ({ ...value, [request.id]: { ...value[request.id], [question.id]: [event.target.value] } }))} />}</fieldset>)}
        <button disabled={busy || offline}>Continue</button>{request.dismissible && <button type="button" disabled={busy || offline} onClick={() => void action("dismiss", { id: request.id })}>Dismiss</button>}
      </form>)}
    </div>
    {historical ? <div className="chat-composer"><p className="agent-composer-scope-note">This task is {agent.lifecycle}. Its model draft can be reviewed without resuming the conversation.</p>{agent.lifecycle !== "deleted" && <button disabled={busy || lifecycleBusy} onClick={() => onLifecycle(agent.lifecycle === "archived" ? "restore" : "unsettle")}>Resume conversation</button>}{displayedError && <p role="alert" className="chat-error">{displayedError}</p>}</div> : <form className="chat-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
      {selected && !agent.contextIds?.includes(selected.id) && <label className="chat-attachment"><input type="checkbox" checked={includeContext} onChange={event => setIncludeContext(event.target.checked)} /><ObjectName type={selected.type} name={selected.name} size={14} /><small>{selected.codeLinks.length} source links</small></label>}
      <div className="chat-input-wrap"><textarea ref={input} aria-label="Message the agent" placeholder={state.messages.length ? "Ask a follow-up…" : "Ask a question or describe a task…"} rows={2} maxLength={20_000} value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
        {state.running ? <button type="button" className="chat-send" aria-label="Stop" disabled={busy || offline} onClick={() => void action("stop")}>■</button> : <button className="chat-send" aria-label="Send" disabled={busy || offline || !model || !text.trim()}>↑</button>}
      </div>
      <div className="agent-composer-controls">
        <select aria-label="Editing scope" title={state.scope === "model" ? "Model only: inspect source and draft model changes for approval" : "Code + model: allow source and model changes"} value={state.scope} disabled={busy || state.running} onChange={event => void action("scope", { scope: event.target.value })}>
          <option value="model">Model only</option><option value="code" disabled={example || !!draft}>Code + model</option>
        </select>
        <select aria-label="Agent model" value={model} disabled={busy || state.running} onChange={event => setModel(event.target.value)}><option value="" disabled>Select model</option>{connection?.models.filter(choice => state.scope === "code" || choice.modelOnly).map(choice => <option key={JSON.stringify([choice.instanceId, choice.id])} value={JSON.stringify([choice.instanceId, choice.id])}>{choice.name}</option>)}</select>
      </div>
      {state.scope === "model" && <p className="agent-composer-scope-note">Model changes stay in a draft until you approve them.{draft && " Approve or discard the draft before switching to Code + model."}</p>}
      {displayedError && <p role="alert" className="chat-error">{displayedError}</p>}
    </form>}
  </div>;
}
