import { memo, type RefObject } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AgentState } from "../../shared/agent-runtime";
import ObjectName from "./ObjectName";

type Props = {
  active: boolean; state: AgentState; example?: boolean; bound: boolean; historical: boolean;
  busy: boolean; offline: boolean; lifecycleBusy: boolean;
  transcript: RefObject<HTMLDivElement>; diffView: RefObject<HTMLElement>;
  diff?: { diff: string; checkpoint: number };
  onSelect: (id: string) => void; onOpenFile: (file: string) => void;
  onLifecycle: (action: "settle") => void; onScroll: () => void;
  showDiff: () => Promise<void>; onCloseDiff: () => void;
};

/** Retain the last DOM/scroll position while hidden, but defer all history rendering.
 * Opening always renders the latest accepted snapshot and fresh action handlers. */
export default memo(function AgentTranscript({ active, state, example, bound, historical, busy, offline, lifecycleBusy,
  transcript, diffView, diff, onSelect, onOpenFile, onLifecycle, onScroll, showDiff, onCloseDiff }: Props) {
  if (!active) return null;
  const receiptView = (receipt: AgentState["receipts"][number]) => <div key={receipt.id} className={receipt.error ? "chat-error" : "chat-change"} role="status"><span>{receipt.text}</span>{receipt.error && <p>{receipt.error}</p>}</div>;
  return (
    <div className="chat-transcript" aria-label="Conversation" ref={transcript} onScroll={onScroll}>
      {!state.messages.length && <div className="chat-welcome"><p>{example ? "Ask about this project. The example is read-only." : "What would you like to understand or change?"}</p></div>}
      {state.messages.map(message => <section key={message.id} className={`chat-message chat-${message.role === "user" ? "user" : "assistant"}`} aria-label={message.role === "user" ? "Your request" : "Agent reply"}>
        <div className="chat-author">{message.role === "user" ? "You" : message.role === "reasoning" ? "Reasoning" : "Agent"}{message.streaming && <small> · Writing…</small>}</div>
        {message.context && <details className="chat-message-context"><summary><ObjectName type={message.context.type} name={message.context.name} size={14} />{!!message.context.codeLinks.length && <small>{message.context.codeLinks.length} sources</small>}</summary><div><button className="quiet" onClick={() => onSelect(message.context!.id)}>View {message.context.name} and sources ↗</button>{message.context.codeLinks.map((link, index) => <span key={index} title={link.file}><strong>{link.role}</strong> · {link.heading || link.symbol || (link.line ? `${link.file}:${link.line}` : link.file)}</span>)}</div></details>}
        <div className="chat-message-body"><Markdown remarkPlugins={[remarkGfm]}>{message.text}</Markdown></div>
        {state.receipts.filter(receipt => receipt.messageId === message.id).map(receiptView)}
      </section>)}
      {state.receipts.filter(receipt => !receipt.messageId).map(receiptView)}
      {!!state.activities.length && <details className="chat-tool-group" open={state.running}><summary>Activity <small>{state.activities.length}</small></summary><div className="chat-tools">{state.activities.map(activity => <details className={`chat-tool${activity.error ? " tool-error" : ""}`} key={activity.id}><summary><span className="chat-tool-title">{activity.title}</span>{activity.error && <small className="chat-tool-state">Failed</small>}</summary><pre>{activity.detail}</pre></details>)}</div></details>}
      {!!state.changes.length && <div className="implementation-changes">
        <button disabled={busy || offline} onClick={() => void showDiff()}>Review changes</button>
        <small>Completed turn {state.checkpoint}{state.running ? " · newer changes may still be in progress" : ""}</small>
        {state.changes.map(file => <button className="quiet implementation-file" key={file.path} onClick={() => onOpenFile(file.path)}><span>{file.path}</span><small>+{file.additions} −{file.deletions}</small></button>)}
      </div>}
      {bound && !historical && !state.running && state.turnState === "completed" && <div className="agent-result-actions"><button className="quiet" disabled={lifecycleBusy || busy} onClick={() => onLifecycle("settle")}>Mark settled</button></div>}
      {diff && <section ref={diffView} className="implementation-diff" aria-label="Implementation changes"><div><strong>Changes through turn {diff.checkpoint}</strong><button className="quiet" onClick={onCloseDiff}>Close diff</button></div><pre>{diff.diff || "No code changes in this session."}</pre></section>}
    </div>
  );
}, (_previous, next) => !next.active);
