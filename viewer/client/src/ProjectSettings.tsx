import { useExperimentalFiles, setExperimentalFiles } from "./developmentOptions";
import { useEffect, useRef, useState } from "react";
import { defaultProjectSettings, type ProjectSettings as Settings } from "../../shared/settings";
import { request } from "./ui";
import "./styles/project-settings.css";

export default function ProjectSettings({ projectId, readOnly }: { projectId: string; readOnly?: boolean }) {
  const experimentalFiles = useExperimentalFiles();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false), [ready, setReady] = useState(false);
  const [include, setInclude] = useState(""), [exclude, setExclude] = useState("");
  const [error, setError] = useState(""), [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const abort = new AbortController();
    setReady(false); setError("");
    request<Settings>(`/api/projects/${projectId}/settings`, { signal: abort.signal }).then(settings => {
      setInclude(settings.files.include.join("\n")); setExclude(settings.files.exclude.join("\n")); setReady(true);
    }).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [open, projectId]);
  const close = () => { dialog.current?.close(); setOpen(false); };
  const patterns = (text: string) => text.split("\n").map(s => s.trim()).filter(Boolean);
  return <>
    <button className="quiet icon-button" aria-label="Project settings" title="Project settings" onClick={() => setOpen(true)}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--panel)"/><circle cx="15" cy="17" r="3" fill="var(--panel)"/></svg>
    </button>
    {open && <dialog ref={dialog} className="project-settings" aria-labelledby="project-settings-title" onCancel={close} onKeyDown={e => e.stopPropagation()}>
      <form onSubmit={async e => {
        e.preventDefault(); setSaving(true); setError("");
        try {
          await request(`/api/projects/${projectId}/settings`, { method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ files: { include: patterns(include), exclude: patterns(exclude) } }) });
          window.dispatchEvent(new CustomEvent("lexicon-project-settings", { detail: projectId })); close();
        } catch (e) { setError((e as Error).message); }
        finally { setSaving(false); }
      }}>
        <h2 id="project-settings-title">Project settings</h2>
        <h3>Source files</h3>
        <p>Choose files for model generation and Files browsing. Git-ignored files are always excluded. Existing model items and evidence links are preserved.</p>
        <label>Include globs<textarea autoFocus rows={3} placeholder={"src/**\ndocs/**/*.md"} value={include} disabled={!ready || readOnly || saving} onChange={e => setInclude(e.target.value)} /></label>
        <p>One glob per line, relative to the source root. Leave empty to include all files.</p>
        <label>Exclude globs<textarea rows={3} placeholder={"**/*.test.ts\ngenerated/**"} value={exclude} disabled={!ready || readOnly || saving} onChange={e => setExclude(e.target.value)} /></label>
        <p><code>*</code> matches within a folder; <code>**</code> matches across folders. Exclusions win. Saved in <code>lexicon/settings.json</code>.</p>
        {readOnly && <p>Built-in example settings are read-only.</p>}
        {error && <p role="alert">{error}</p>}
        {error && !ready && !readOnly && <div>
          <p>Load the default filters to replace unreadable settings. Review or edit them, then save to apply.</p>
          <button type="button" onClick={() => {
            setInclude(defaultProjectSettings.files.include.join("\n"));
            setExclude(defaultProjectSettings.files.exclude.join("\n"));
            setReady(true); setError("");
          }}>Load default filters</button>
        </div>}
        <details className="development-options">
          <summary>Development options</summary>
          <label><input type="checkbox" checked={experimentalFiles} onChange={event => setExperimentalFiles(event.target.checked)} /> Files / File Map</label>
          <p>Enable the experimental filesystem view. Applies immediately in this browser only.</p>
        </details>
        <footer><button type="button" className="quiet" onClick={close}>Cancel</button><button type="submit" disabled={!ready || readOnly || saving}>{saving ? "Saving…" : "Save settings"}</button></footer>
      </form>
    </dialog>}
  </>;
}
