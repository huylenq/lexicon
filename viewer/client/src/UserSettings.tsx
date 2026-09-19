import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { UserSettings, T3PairingInput } from "../../shared/user-settings";
import { request, Theme } from "./ui";
import { setExperimentalFiles, useExperimentalFiles } from "./developmentOptions";
import "./styles/user-settings.css";

type Section = "connections" | "appearance" | "development";
type SettingsContext = {
  settings?: UserSettings; error: string; busy: boolean;
  open: (section?: Section) => void; refresh: () => Promise<void>;
  pair: (input: T3PairingInput) => Promise<void>; disconnect: () => Promise<void>;
};
const Context = createContext<SettingsContext | null>(null);
export function useUserSettings() {
  const value = useContext(Context);
  if (!value) throw new Error("Lexicon settings require UserSettingsProvider.");
  return value;
}
export function UserSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<Section>();
  const sequence = useRef(0);
  const pending = useRef(false);
  const publish = useCallback((next: UserSettings) => {
    setSettings(current => !current || next.revision >= current.revision ? next : current);
    setError("");
  }, []);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const next = await request<UserSettings>("/api/settings", { signal: AbortSignal.timeout(20_000) });
      if (current === sequence.current) publish(next);
    } catch (e) { if (current === sequence.current) setError((e as Error).message); }
  }, [publish]);
  useEffect(() => {
    void refresh();
    const stream = new EventSource("/api/settings/events");
    stream.addEventListener("settings", () => void refresh());
    stream.onerror = () => void refresh();
    const focus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    const poll = setInterval(focus, 15_000);
    return () => { ++sequence.current; stream.close(); clearInterval(poll); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [refresh]);
  const change = async (method: string, input?: T3PairingInput) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); ++sequence.current;
    try {
      const next = await request<UserSettings>("/api/settings/connections/t3", {
        method, headers: { "content-type": "application/json" }, ...(input ? { body: JSON.stringify(input) } : {}),
      });
      ++sequence.current; publish(next);
    } catch (e) { setError((e as Error).message); throw e; }
    finally { pending.current = false; setBusy(false); }
  };
  const value: SettingsContext = { settings, error, busy, open: (next = "connections") => setSection(next), refresh,
    pair: input => change("POST", input), disconnect: () => change("DELETE") };
  return <Context.Provider value={value}>{children}{section && <SettingsDialog section={section} select={setSection} close={() => setSection(undefined)} />}</Context.Provider>;
}
export function UserSettingsButton() {
  const { open } = useUserSettings();
  return <button className="quiet icon-button" aria-label="Lexicon settings" title="Lexicon settings" onClick={() => open()}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m9 3-.5 2.3-2 1.2-2.3-.7-2 3.4 1.8 1.6v2.4l-1.8 1.6 2 3.4 2.3-.7 2 1.2L9 21h4l.5-2.3 2-1.2 2.3.7 2-3.4-1.8-1.6v-2.4l1.8-1.6-2-3.4-2.3.7-2-1.2L13 3Z"/><circle cx="11" cy="12" r="3"/></svg>
  </button>;
}
function SettingsDialog({ section, select, close }: { section: Section; select: (value: Section) => void; close: () => void }) {
  const { settings, error, busy, pair, disconnect, refresh } = useUserSettings();
  const connection = settings?.connections.t3;
  const dialog = useRef<HTMLDialogElement>(null);
  const experimentalFiles = useExperimentalFiles();
  const [url, setUrl] = useState(connection?.url || "http://127.0.0.1:5733");
  const [urlEdited, setUrlEdited] = useState(false);
  const [credential, setCredential] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { if (!urlEdited && connection) setUrl(connection.url); }, [connection?.url, urlEdited]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const dismiss = () => { dialog.current?.close(); close(); };
  return <dialog ref={dialog} className="user-settings" aria-labelledby="user-settings-title" onCancel={dismiss} onKeyDown={event => event.stopPropagation()}>
    <header><div><h2 id="user-settings-title">Lexicon settings</h2><p>Personal configuration across projects and tasks.</p></div><button className="quiet" aria-label="Close settings" onClick={dismiss}>✕</button></header>
    <nav aria-label="Settings sections">{([['connections', 'Connections'], ['appearance', 'Appearance'], ['development', 'Development']] as const).map(([id, label]) =>
      <button key={id} className="quiet" aria-current={section === id ? "page" : undefined} onClick={() => select(id)}>{label}</button>)}</nav>
    {section === "connections" && <section aria-labelledby="settings-t3-title">
      <h3 id="settings-t3-title">T3 Code</h3>
      <p>Pair once for every project and task using this Lexicon server. Generate a pairing token in T3 Code on this computer.</p>
      <p role="status">{!settings ? "Loading connection…" : connection?.connected ? `Connected to ${connection.label || "T3 Code"}` : connection?.configured ? "Paired · T3 Code unavailable" : "Not paired"}</p>
      {connection?.configured && <p className="settings-address">{connection.url}</p>}
      {connection?.error && <p role="alert">{connection.error}</p>}
      <form onSubmit={async event => {
        event.preventDefault(); setNotice("");
        try { await pair({ url, credential }); setNotice("T3 Code pairing saved for all projects and tasks."); setUrlEdited(false); }
        catch { /* Shared request error below. */ }
        finally { setCredential(""); }
      }}>
        <label>T3 server<input type="url" value={url} onChange={event => { setUrlEdited(true); setUrl(event.target.value); }} required disabled={busy} /></label>
        <label>Pairing token<input type="password" autoComplete="off" value={credential} onChange={event => setCredential(event.target.value)} required disabled={busy} /></label>
        <p>The token is exchanged with T3 Code. Its session credential stays on the Lexicon server.</p>
        <div className="settings-actions"><button type="submit" className="primary" disabled={busy || !credential.trim() || !url.trim()}>{busy ? "Updating…" : connection?.configured ? "Pair again" : "Connect"}</button>
          <button type="button" className="quiet" disabled={busy} onClick={() => void refresh()}>Refresh status</button>
          {connection?.configured && <button type="button" className="quiet" disabled={busy} onClick={async () => {
            setNotice(""); setCredential("");
            try { await disconnect(); setNotice("Disconnected for all projects and tasks. Existing T3 tasks are preserved."); } catch { /* Shared request error below. */ }
          }}>Disconnect</button>}</div>
      </form>
      <p>Disconnecting affects all open Lexicon tasks. It does not stop or delete tasks in T3 Code. Existing tasks stay bound to their original T3 environment and checkout.</p>
      {notice && <p role="status">{notice}</p>}
    </section>}
    {section === "appearance" && <section><h3>Appearance</h3><p>Theme applies in this browser. Project files are unaffected.</p><Theme /></section>}
    {section === "development" && <section><h3>Development options</h3><label className="settings-checkbox"><input type="checkbox" checked={experimentalFiles} onChange={event => setExperimentalFiles(event.target.checked)} /> Files / File Map</label><p>Enable the experimental filesystem view. Applies immediately in this browser only.</p></section>}
    {error && <p role="alert">{error}</p>}
    <footer><p>Source discovery filters belong in each project’s Project settings.</p><button className="quiet" onClick={dismiss}>Done</button></footer>
  </dialog>;
}
