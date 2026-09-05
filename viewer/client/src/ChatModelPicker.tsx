import { useEffect, useId, useRef, useState } from "react";
import { providers, type ModelCatalog, type ModelChoice, type Provider } from "../../shared/chat";
import { request } from "./ui";

export interface ChatSelection { provider: Provider; model: string; effort?: string; fast?: boolean }
const names: Record<Provider, string> = { codex: "Codex", grok: "Grok", claude: "Claude" };
function savedSelection(projectId: string, provider: Provider): Partial<ChatSelection> {
  try { return JSON.parse(localStorage.getItem(`lexicon.chat.model.${projectId}.${provider}`) || "{}"); } catch { return {}; }
}
export default function ChatModelPicker({ projectId, initialProvider, disabled, onSelect, connection, checking, onCheck }: {
  projectId: string;
  initialProvider: Provider;
  disabled: boolean;
  onSelect: (selection: ChatSelection) => void;
  connection: { state: "ready" | "checking" | "offline" | "error" | "unknown"; label: string };
  checking: boolean;
  onCheck: () => void;
}) {
  const [catalogs, setCatalogs] = useState<Partial<Record<Provider, ModelCatalog>>>({});
  const [errors, setErrors] = useState<Partial<Record<Provider, string>>>({});
  const [loading, setLoading] = useState<Partial<Record<Provider, boolean>>>({});
  const [selection, setSelection] = useState<ChatSelection>(() => {
    const saved = savedSelection(projectId, initialProvider);
    return { provider: initialProvider, model: typeof saved.model === "string" ? saved.model : "", effort: saved.effort, fast: saved.fast === true };
  });
  const current = useRef(selection);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [reload, setReload] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();
  const choose = (value: ChatSelection) => {
    current.current = value;
    setSelection(value);
    onSelect(value);
    try {
      localStorage.setItem(`lexicon.chat.model.${projectId}.${value.provider}`, JSON.stringify(value));
      localStorage.setItem(`lexicon.chat.provider.${projectId}`, value.provider);
    } catch {}
  };
  useEffect(() => {
    let cancelled = false;
    for (const provider of providers) {
      setLoading((s) => ({ ...s, [provider]: true }));
      setErrors((s) => ({ ...s, [provider]: undefined }));
      void request<ModelCatalog>(`/api/providers/${provider}/models`).then((catalog) => {
        if (cancelled) return;
        setCatalogs((s) => ({ ...s, [provider]: catalog }));
        if (current.current.provider !== provider) return;
        const model = current.current.model || catalog.defaultModel || catalog.models[0]?.id || "";
        const choice = catalog.models.find((m) => m.id === model);
        const effort = choice?.efforts?.includes(current.current.effort || "") ? current.current.effort : choice?.defaultEffort;
        const value = { provider, model, effort, fast: !!choice?.fastMode && current.current.fast === true };
        current.current = value;
        setSelection(value);
        onSelect(value);
      }).catch((e) => {
        if (!cancelled) setErrors((s) => ({ ...s, [provider]: (e as Error).message }));
      }).finally(() => {
        if (!cancelled) setLoading((s) => ({ ...s, [provider]: false }));
      });
    }
    return () => { cancelled = true; };
  }, [projectId, reload, onSelect]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const choice = catalogs[selection.provider]?.models.find((m) => m.id === selection.model);
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = (text: string) => terms.every((term) => text.toLowerCase().includes(term));
  const rows: { provider: Provider; choice?: ModelChoice }[] = providers.flatMap((provider) => {
    const models = (catalogs[provider]?.models || []).filter((m) => matches(`${names[provider]} ${m.name} ${m.id} ${m.description || ""}`));
    return [...models.map((choice) => ({ provider, choice })), ...(matches(`${names[provider]} custom model`) ? [{ provider }] : [])];
  });
  const activeIndex = Math.min(active, Math.max(0, rows.length - 1));
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listId, open]);
  const selectRow = (row: typeof rows[number]) => {
    const saved = savedSelection(projectId, row.provider);
    const effort = row.choice?.id === saved.model && row.choice?.efforts?.includes(saved.effort || "") ? saved.effort : row.choice?.defaultEffort;
    choose({ provider: row.provider, model: row.choice?.id || "", effort, fast: !!row.choice?.fastMode && row.choice.id === saved.model && saved.fast === true });
    close();
  };
  return <div className="chat-model-picker" ref={root} onBlur={(e) => {
    if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
  }}>
    <div className="chat-model-controls">
      <div className="chat-model-field">
        <button type="button" ref={trigger} className="chat-model-trigger" aria-label="Choose provider and model" aria-haspopup="dialog" aria-expanded={open} disabled={disabled}
          title={`${connection.label}${choice?.description ? ` · ${choice.description}` : ""}`} onClick={() => { setOpen(!open); setQuery(""); setActive(0); }}>
          <span className={`chat-connection-dot ${connection.state}`} role="img" aria-label={connection.label} />
          <span className="chat-picker-provider">{names[selection.provider]}</span>
          <span className="chat-picker-model">{choice?.name || selection.model || "Choose model"}</span><span aria-hidden="true">⌄</span>
        </button>
      </div>
      {!!choice?.efforts?.length && <label className="chat-effort-field" title="Reasoning effort">
        <select aria-label="Reasoning effort" disabled={disabled} value={selection.effort || choice.defaultEffort || choice.efforts[0]}
          onChange={(e) => choose({ ...selection, effort: e.target.value })}>
          {choice.efforts.map((effort) => <option key={effort} value={effort}>{effort === "xhigh" ? "Extra high" : effort[0].toUpperCase() + effort.slice(1)}</option>)}
        </select>
      </label>}
      {choice?.fastMode && <button type="button" className="chat-fast-toggle" aria-label="Fast mode" aria-pressed={selection.fast === true} disabled={disabled}
        title={`${selection.fast ? "Fast mode on" : "Fast mode off"} · ${choice.fastMode.description}`}
        onClick={() => choose({ ...selection, fast: !selection.fast })}>
        <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true"><path d="M11.5 2 4.5 11h5l-1 7 7-10h-5l1-6Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
      </button>}
    </div>
    {!choice && !loading[selection.provider] && <input aria-label="Custom model ID" placeholder={`${names[selection.provider]} model ID`} maxLength={200} value={selection.model} disabled={disabled}
      onChange={(e) => choose({ ...selection, model: e.target.value.trim(), effort: undefined, fast: false })} />}
    {open && <div className="chat-model-popover" role="dialog" aria-label="Choose a model" onKeyDown={(e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    }}>
      <div className="chat-model-search-row">
        <input ref={search} role="combobox" aria-label="Search models" aria-autocomplete="list" aria-expanded="true" aria-controls={listId}
          aria-activedescendant={rows.length ? `${listId}-${activeIndex}` : undefined} value={query} placeholder="Search models or providers…"
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault(); setActive((activeIndex + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % (rows.length || 1));
            }
            if (e.key === "Enter") { e.preventDefault(); if (rows[activeIndex]) selectRow(rows[activeIndex]); }
          }} />
        <button type="button" className="quiet chat-model-refresh" aria-label="Refresh models" title="Refresh models" disabled={Object.values(loading).some(Boolean)} onClick={() => setReload((v) => v + 1)}>↻</button>
      </div>
      <div className="chat-model-results" id={listId} role="listbox" aria-label="Models">
        {providers.filter((provider) => rows.some((r) => r.provider === provider) || matches(names[provider])).map((provider) => <div key={provider} role="group" aria-label={names[provider]}>
          {(rows.some((r) => r.provider === provider) || loading[provider] || errors[provider]) && <div className="chat-model-group">{names[provider]}{loading[provider] && <span>Loading…</span>}</div>}
          {rows.map((row, i) => row.provider === provider && <button key={`${provider}.${row.choice?.id || "custom"}`} type="button" role="option" id={`${listId}-${i}`} tabIndex={-1}
            aria-selected={selection.provider === provider && !!row.choice && selection.model === row.choice.id}
            className={`chat-model-option ${activeIndex === i ? "active" : ""}`} onMouseMove={() => setActive(i)} onClick={() => selectRow(row)}>
            <span>{row.choice?.name || "Custom model…"}</span>
            {row.choice?.description && <small>{row.choice.description}</small>}
          </button>)}
          {errors[provider] && <p className="chat-model-load-error" role="alert">{errors[provider]}</p>}
        </div>)}
        {!rows.length && <p className="chat-model-empty">No models match “{query}”.</p>}
      </div>
      <div className="chat-picker-connection">
        <span>{connection.label}</span>
        <button type="button" className="quiet" disabled={checking} onClick={onCheck}>Check connection</button>
      </div>
    </div>}
  </div>;
}
