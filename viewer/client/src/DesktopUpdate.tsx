import { useEffect, useState } from "react";
import "./styles/desktop.css";

export default function DesktopUpdate() {
  const [notice, setNotice] = useState<DesktopUpdateNotice | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const desktop = window.lexiconDesktop;
    if (!desktop) return;
    let active = true;
    const update = (value: DesktopUpdateNotice | null) => { if (active) setNotice(value); };
    const unsubscribe = desktop.onUpdate(update);
    void desktop.getUpdate().then(update).catch(() => {});
    return () => { active = false; unsubscribe(); };
  }, []);
  if (!notice || notice.version === dismissed) return null;
  return <aside className="desktop-update" aria-label="Application update">
    <span role="status">Lexicon {notice.version} is available</span>
    <button className="quiet" onClick={async () => {
      try { await window.lexiconDesktop?.openUpdate(); }
      catch { setError("Could not open the download page. Try Check for Updates in the Lexicon menu."); }
    }}>View update</button>
    <button className="quiet" aria-label="Dismiss update notice" onClick={() => { setDismissed(notice.version); setError(""); }}>Later</button>
    {error && <span role="alert">{error}</span>}
  </aside>;
}
