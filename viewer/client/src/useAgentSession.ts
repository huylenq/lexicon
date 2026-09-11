import { useEffect, useRef, useState } from "react";
import type { NavigationCommand, ViewerMessage, ViewerSession, ViewerState } from "../../shared/agent";
import { request } from "./ui";

const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const json = (method: string, value: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(value) });

/** One mounted project surface owns one ephemeral externally addressable session. */
export function useAgentSession(projectId: string, state: ViewerState | null, execute: (command: NavigationCommand, signal: AbortSignal) => Promise<void>, refresh: () => Promise<void>) {
  const latest = useRef({ state, execute, refresh });
  latest.current = { state, execute, refresh };
  const [session, setSession] = useState<string>();
  const reconnect = useRef<() => void>(() => {});
  const ready = !!state;
  useEffect(() => {
    if (!ready) return;
    let stopped = false, stream: EventSource | undefined, id: string | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const base = `/api/agent/projects/${encodeURIComponent(projectId)}/sessions`;
    const pending = new Map<string, AbortController>();
    const close = () => {
      for (const controller of pending.values()) controller.abort();
      pending.clear();
      stream?.close();
      if (id) void request(`${base}/${id}`, { method: "DELETE", keepalive: true }).catch(() => {});
      id = undefined;
      setSession(undefined);
    };
    const restart = () => {
      if (stopped || retry) return;
      close();
      retry = setTimeout(() => { retry = undefined; void connect(); }, 2_000);
    };
    reconnect.current = restart;
    const connect = async () => {
      try {
        const created = await request<ViewerSession>(base, json("POST", latest.current.state));
        if (stopped) { void request(`${base}/${created.id}`, { method: "DELETE" }).catch(() => {}); return; }
        id = created.id;
        const sessionId = id;
        setSession(sessionId);
        stream = new EventSource(`${base}/${sessionId}/events`);
        stream.onmessage = async event => {
          const message = JSON.parse(event.data) as ViewerMessage;
          if (message.type === "ready") {
            // Reconnection always reconciles with the authoritative model.
            void latest.current.refresh();
          } else if (message.type === "refresh") {
            if (message.revision !== latest.current.state?.modelRevision) void latest.current.refresh();
          } else if (message.type === "cancel") {
            pending.get(message.operationId)?.abort();
          } else {
            const command = message.command;
            const controller = new AbortController();
            pending.set(command.id, controller);
            let error: string | undefined;
            try {
              if (controller.signal.aborted || stopped || id !== sessionId || Date.now() >= command.expiresAt) return;
              await latest.current.refresh();
              await frame();
              if (controller.signal.aborted || stopped || id !== sessionId || Date.now() >= command.expiresAt) return;
              await latest.current.execute(command, controller.signal);
              await frame();
              await frame();
            } catch (e) { error = (e as Error).message; }
            finally { pending.delete(command.id); }
            if (!controller.signal.aborted && !stopped && id === sessionId)
              void request(`${base}/${sessionId}/ack`, json("POST", { operationId: command.id, state: latest.current.state, ...(error ? { error } : {}) })).catch(() => {});
          }
        };
        stream.onerror = restart;
      } catch { restart(); }
    };
    void connect();
    return () => { stopped = true; clearTimeout(retry); reconnect.current = () => {}; close(); };
  }, [projectId, ready]);
  const value = JSON.stringify(state);
  useEffect(() => {
    if (!session || !state) return;
    let active = true;
    const publish = () => request(`/api/agent/projects/${encodeURIComponent(projectId)}/sessions/${session}`, json("PUT", latest.current.state)).catch(() => { if (active) reconnect.current(); });
    void publish();
    const heartbeat = setInterval(() => void publish(), 10_000);
    return () => { active = false; clearInterval(heartbeat); };
  }, [projectId, session, value]);
  return session;
}
