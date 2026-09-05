import { useEffect, useState } from "react";
import type { ChatMessage } from "../../shared/chat";

const labels = { running: "Running", complete: "Done", error: "Failed", interrupted: "Stopped" };
function duration(start: string, end: number) {
  const seconds = Math.max(0, Math.floor((end - Date.parse(start)) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
export default function ChatActivity({ message, activity }: { message: ChatMessage; activity: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (message.status !== "running") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [message.status]);
  const tools = message.tools || [];
  return <>
    {tools.length > 0 && <div className="chat-tools" aria-label="Tool calls">
      {tools.map((tool) => <details key={tool.id} className={`chat-tool tool-${tool.status}`}>
        <summary>
          <span className={`chat-status-dot ${tool.status}`} aria-hidden="true" />
          <span className="chat-tool-title" title={tool.title}>{tool.title}</span>
          <span className="chat-tool-state">{labels[tool.status]}</span>
        </summary>
        <div className="chat-tool-detail">
          {tool.input && <><span>Input</span><pre>{tool.input}</pre></>}
          {tool.output && <><span>Output</span><pre>{tool.output}</pre></>}
          {!tool.input && !tool.output && <p>No details returned by the runtime.</p>}
          <small>{tool.kind} · {duration(tool.startedAt, tool.finishedAt ? Date.parse(tool.finishedAt) : now)}</small>
        </div>
      </details>)}
    </div>}
    <div className={`chat-turn-status turn-${message.status}`} role={message.status === "running" ? "status" : undefined}>
      {message.status === "running" && <span className="chat-status-dot running" aria-hidden="true" />}
      <span>{message.status === "running" ? activity || "Working…" : labels[message.status]}</span>
      {(message.status === "running" || message.finishedAt) && <span>· {duration(message.createdAt, message.finishedAt ? Date.parse(message.finishedAt) : now)}</span>}
      {tools.length > 0 && <span>· {tools.length} tool{tools.length === 1 ? "" : "s"}</span>}
    </div>
  </>;
}
