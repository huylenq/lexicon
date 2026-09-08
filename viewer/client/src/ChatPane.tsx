import { useCallback, useEffect, useRef, useState } from "react";
import type { ModelItem } from "../../shared/model";
import {
  providers,
  type Provider,
  type ProviderStatus,
  type ChatState,
} from "../../shared/chat";
import { request } from "./ui";
import Icon from "./Icon";
import ObjectName from "./ObjectName";
import ChatModelPicker, { type ChatSelection } from "./ChatModelPicker";
import ChatActivity from "./ChatActivity";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./styles/chat.css";

const names: Record<Provider, string> = {
  codex: "Codex",
  grok: "Grok",
  claude: "Claude",
  pi: "pi",
  omp: "Oh My Pi",
  hermes: "Hermes",
};
export default function ChatPane({
  projectId,
  open,
  attached,
  onToggleAttachment,
  selected,
  modelRevision,
  empty,
  example,
  onClose,
  onRunningChange,
  onModelChanged,
  onSelect,
}: {
  projectId: string;
  open: boolean;
  attached: boolean;
  onToggleAttachment: () => void;
  selected?: ModelItem;
  modelRevision: string;
  empty: boolean;
  example?: boolean;
  onClose: () => void;
  onRunningChange: (running: boolean) => void;
  onModelChanged: () => void;
  onSelect: (id: string) => void;
}) {
  const [state, setState] = useState<ChatState>();
  const [initialProvider] = useState<Provider>(() => {
    try {
      const saved = localStorage.getItem(`lexicon.chat.provider.${projectId}`);
      if (providers.includes(saved as Provider)) return saved as Provider;
    } catch {}
    return "codex";
  });
  const [statuses, setStatuses] = useState<ProviderStatus[]>();
  const [selection, setSelection] = useState<ChatSelection>();
  const provider = selection?.provider || initialProvider;
  const [checking, setChecking] = useState(false);
  const probed = useRef(false);
  const [text, setText] = useState("");
  const [includeContext, setIncludeContext] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const input = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const [following, setFollowing] = useState(true);
  const changed = useRef(onModelChanged);
  changed.current = onModelChanged;
  const changeStamp = useRef<string>();
  const accept = useCallback((next: ChatState) => {
    setState((previous) =>
      previous && previous.revision > next.revision ? previous : next,
    );
    const stamp = JSON.stringify(
      next.messages
        .filter((m) => m.change)
        .map((m) => [m.id, m.change?.undone]),
    );
    if (changeStamp.current !== undefined && stamp !== changeStamp.current)
      changed.current();
    changeStamp.current = stamp;
  }, []);
  useEffect(() => {
    let stream: EventSource;
    let retry: ReturnType<typeof setTimeout>;
    let closed = false;
    const connect = () => {
      if (closed) return;
      stream = new EventSource(`/api/projects/${projectId}/chat/events`);
      stream.addEventListener("state", (event) => {
        setConnected(true);
        accept(JSON.parse((event as MessageEvent).data));
      });
      stream.onerror = () => {
        setConnected(false);
        stream.close();
        if (!closed) retry = setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      stream.close();
    };
  }, [projectId, accept]);
  const check = useCallback(async () => {
    setChecking(true);
    try {
      setStatuses(await request<ProviderStatus[]>("/api/providers"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }, []);
  useEffect(() => {
    if (open && !probed.current) {
      probed.current = true;
      void check();
    }
  }, [open, check]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => onRunningChange(!!state?.running), [state?.running, onRunningChange]);
  useEffect(() => setIncludeContext(true), [selected?.id]);
  useEffect(() => setAnswers({}), [state?.pending?.id]);
  useEffect(() => {
    if (nearBottom.current && transcript.current)
      transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [state?.revision, open]);
  const action = async (name: string, body: unknown = {}) => {
    setBusy(true);
    setError("");
    try {
      accept(
        await request<ChatState>(`/api/projects/${projectId}/chat/${name}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      if (name === "undo") changed.current();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const send = async (prompt = text) => {
    if (!prompt.trim() || busy || state?.running || !selection?.model || selection.provider !== provider) return;
    nearBottom.current = true;
    setFollowing(true);
    if (
      await action("send", {
        text: prompt,
        provider,
        model: selection.model,
        fast: selection.fast === true,
        ...(selection.effort ? { effort: selection.effort } : {}),
        modelRevision,
        ...(includeContext && selected ? { contextId: selected.id } : {}),
      })
    )
      setText("");
  };
  const status = statuses?.find((s) => s.id === provider);
  const unavailable =
    status && (!status.installed || status.authenticated === false);
  const modelReady = selection?.provider === provider && !!selection.model;
  return (
    <aside
      id="chat-pane"
      className={`chat-pane${attached ? " chat-attached" : ""}`}
      aria-label="Project conversation"
      hidden={!open}
    >
      <div className="chat-heading">
        <span className="pane-title">Chat</span>
        <div className="chat-heading-actions">
          <button className="quiet icon-button chat-attach-toggle" aria-label={attached ? "Float Agent window" : "Attach Agent to right side"}
            title={attached ? "Float Agent window" : "Attach Agent to right side"} aria-pressed={attached} onClick={onToggleAttachment}>
            <Icon name={attached ? "open" : "panel-right"} />
          </button>
            <button className="quiet icon-button" aria-label="Minimize Chat" title="Minimize" onClick={onClose}>
              <Icon name="minus" />
            </button>
          <button className="quiet icon-button" aria-label="Close Chat pane" title="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
      </div>
      {!!state?.messages.length && <div className="chat-conversation-actions">
        <button className="quiet" disabled={busy || state?.running || !state?.undoAvailable} onClick={() => void action("undo")} title="Undo the latest model change">Undo edit</button>
        <button className="quiet" aria-label="New conversation" disabled={busy || state?.running} onClick={() => void action("reset")}><Icon name="plus" /> New conversation</button>
      </div>}
      <div
        className="chat-transcript"
        ref={transcript}
        onScroll={() => {
          const el = transcript.current;
          if (el) {
            nearBottom.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 100;
            setFollowing(nearBottom.current);
          }
        }}
      >
        {!state?.messages.length && (
          <div className="chat-welcome">
            <p>
              {empty
                ? "Ask about this project and build its model as you go."
                : "Ask about the implementation or refine the model."}
            </p>
            <div className="chat-starters">
              <button
                disabled={busy || state?.running || unavailable || !modelReady}
                onClick={() =>
                  void send(
                    empty
                      ? "Read the project and give me a small overview. Explain the main responsibilities, then ask which area I want to model first. Do not create a model yet."
                      : "Explain the selected concept or the project overview using its implementation. Do not change the model.",
                  )
                }
              >
                {empty
                  ? "Give me a small overview"
                  : "Explain what I’m looking at"}
                <Icon name="arrow-right" />
              </button>
              {!empty && [
                { label: "How does this connect?", prompt: "Explain how the selected concept or area connects to the rest of the project. Do not change the model." },
                { label: "What rules apply here?", prompt: "Explain the rules for the selected concept or area, distinguishing intended rules from checks enforced in code. Do not change the model." },
              ].map(({ label, prompt }) => <button key={label} disabled={busy || state?.running || unavailable || !modelReady} onClick={() => void send(prompt)}>
                {label}<Icon name="arrow-right" />
              </button>)}
              {empty && (
                <button
                  disabled={busy || state?.running || unavailable}
                  onClick={() => {
                    setText("Help me model ");
                    input.current?.focus();
                  }}
                >
                  Start modeling an area
                  <Icon name="plus" />
                </button>
              )}
            </div>
            {example && (
              <p className="hint">
                This worked example is read-only. Add your own project to refine
                its model.
              </p>
            )}
          </div>
        )}
        {state?.messages.map((message) => (
          <section
            key={message.id}
            className={`chat-message chat-${message.role}`}
            aria-label={
              message.role === "user"
                ? "Your message"
                : `${names[message.provider]} reply`
            }
          >
            <div className="chat-author">
              {message.role === "user" ? "You" : names[message.provider]}
              {message.role === "assistant" && message.model && <span className="chat-message-model">{message.model}{message.effort ? ` · ${message.effort}` : ""}{message.fast ? " · Fast" : ""}</span>}
            </div>
            {message.role === "assistant" && <ChatActivity message={message} activity={state.activity} />}
            {message.context && (
              <details className="chat-context-snapshot">
                <summary>
                  {message.context.name} · {message.context.codeLinks.length}{" "}
                  code links
                </summary>
                <button
                  className="quiet"
                  onClick={() => onSelect(message.context!.id)}
                >
                  Open {message.context.name}
                </button>
                {message.context.codeLinks.map((link, i) => (
                  <div key={i}>
                    <code>
                      {link.file}
                      {link.symbol
                        ? `#${link.symbol}`
                        : link.line
                          ? `:${link.line}`
                          : ""}
                    </code>
                  </div>
                ))}
              </details>
            )}
            <div
              className={`chat-prose ${message.role === "assistant" ? "chat-markdown" : ""}`}
            >
              {message.role === "assistant" ? (
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  disallowedElements={["img"]}
                  components={{
                    a: ({ href, children }) =>
                      /^https?:\/\//.test(href || "") ? (
                        <a href={href} target="_blank" rel="noreferrer">
                          {children}
                        </a>
                      ) : (
                        <span>{children}</span>
                      ),
                  }}
                >
                  {message.text}
                </Markdown>
              ) : (
                message.text
              )}
            </div>
            {message.change && (
              <div
                className={`chat-change ${message.change.undone ? "undone" : ""}`}
              >
                <span>
                  <Icon name="check" />{" "}
                  {message.change.undone
                    ? "Model change undone"
                    : "Model updated"}
                </span>
                {(["added", "updated", "removed"] as const).map(
                  (kind) =>
                    message.change![kind].length > 0 && (
                      <div key={kind}>
                        {kind[0].toUpperCase() + kind.slice(1)}:{" "}
                        {message.change![kind].join(", ")}
                      </div>
                    ),
                )}
              </div>
            )}
            {message.error && (
              <p className="chat-error" role="alert">
                {message.error}
              </p>
            )}
            {message.role === "assistant" && message.status !== "running" && !state.running &&
              <button type="button" className="quiet chat-reuse" onClick={() => {
                const index = state.messages.indexOf(message);
                const prompt = state.messages.slice(0, index).reverse().find((m) => m.role === "user");
                if (prompt) { setText(prompt.text); input.current?.focus(); }
              }}>Reuse prompt</button>}
          </section>
        ))}
      </div>
      {!following && <button type="button" className="chat-jump quiet" onClick={() => {
        if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
        nearBottom.current = true;
        setFollowing(true);
      }}>Jump to latest ↓</button>}
      {state?.pending && (
        <form
          className="chat-questions"
          onSubmit={(e) => {
            e.preventDefault();
            void action("answer", { requestId: state.pending!.id, answers });
          }}
        >
          {state.pending.questions.map((question) => (
            <fieldset key={question.id}>
              <legend>{question.text}</legend>
              {question.options.length > 0 && (
                <div className="chat-options">
                  {question.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={
                        answers[question.id] === option ? "selected" : ""
                      }
                      onClick={() =>
                        setAnswers((a) => ({ ...a, [question.id]: option }))
                      }
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
              <input
                aria-label={question.text}
                value={answers[question.id] || ""}
                required
                placeholder="Your answer"
                onChange={(e) =>
                  setAnswers((a) => ({ ...a, [question.id]: e.target.value }))
                }
              />
            </fieldset>
          ))}
          <button className="primary" disabled={busy}>
            Continue
          </button>
        </form>
      )}
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {selected && (
          <label className="chat-attachment">
            <input
              type="checkbox"
              checked={includeContext}
              onChange={(e) => setIncludeContext(e.target.checked)}
            />
            <ObjectName type={selected.type} name={selected.name} size={14} />
            <small>{selected.codeLinks.length} code links</small>
          </label>
        )}
        <div className="chat-input-wrap">
        <textarea
          ref={input}
          aria-label="Message the coding agent"
          placeholder={
            example
              ? "Ask about this model…"
              : "Ask a question or describe a model change…"
          }
          value={text}
          maxLength={20_000}
          rows={3}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void send();
            }
            if (e.key === "Escape") {
              e.stopPropagation();
              onClose();
            }
          }}
        />
        {state?.running ? (
          <button type="button" className="chat-send" aria-label="Stop" title="Stop response" disabled={busy} onClick={() => void action("stop")}>
            <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="5" width="10" height="10" rx="1" fill="currentColor" /></svg>
          </button>
        ) : (
          <button type="submit" className="chat-send" aria-label="Send" title="Send message" disabled={!connected || busy || unavailable || !text.trim() || !modelReady}>
            <Icon name="arrow-right" size={20} className="chat-send-arrow" />
          </button>
        )}
        </div>
        {open && <ChatModelPicker key={projectId} projectId={projectId} initialProvider={provider} disabled={!!state?.running || busy} onSelect={setSelection}
          connection={{ state: !connected ? "offline" : checking ? "checking" : unavailable ? "error" : status?.authenticated ? "ready" : "unknown",
            label: !connected ? "Reconnecting to the conversation" : checking ? "Checking local agents" : status?.detail || "Connection not checked" }}
          checking={checking} onCheck={() => void check()} />}
        {error && (
          <p role="alert" className="chat-error">
            {error}
          </p>
        )}
      </form>
    </aside>
  );
}
