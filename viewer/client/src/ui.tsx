import { useEffect, useLayoutEffect, useState } from "react";
import Icon from "./Icon";
export async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(path, options);
  const body = await response.text();
  let data: T & { error?: string };
  try {
    data = JSON.parse(body);
  } catch {
    const detail = body.trim() ? "an invalid response" : "an empty response";
    throw new Error(`Lexicon’s local server returned ${detail} (HTTP ${response.status}). Check that the server is running and try again.`);
  }
  if (!response.ok)
    throw new Error(typeof data?.error === "string" ? data.error : `Unable to load this request (HTTP ${response.status}).`);
  return data;
}
export function Theme() {
  const [dark, setDark] = useState(
    document.documentElement.dataset.theme === "dark",
  );
  useEffect(() => {
    const sync = () => {
      let theme = document.documentElement.dataset.theme;
      try { theme = localStorage.getItem("lexicon.theme") || theme; } catch {}
      document.documentElement.dataset.theme = theme;
      setDark(theme === "dark");
    };
    window.addEventListener("lexicon-theme", sync); window.addEventListener("storage", sync);
    return () => { window.removeEventListener("lexicon-theme", sync); window.removeEventListener("storage", sync); };
  }, []);
  useLayoutEffect(() => {
    // Older installed shells have separate light/dark tags. Chrome may select
    // either by the OS theme, so replace them with one explicit app theme.
    const tags = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    const themeColor = tags.shift() || document.createElement("meta");
    themeColor.name = "theme-color";
    themeColor.removeAttribute("media");
    themeColor.content = getComputedStyle(document.documentElement)
      .getPropertyValue("--panel").trim();
    for (const tag of tags) tag.remove();
    if (!themeColor.isConnected) document.head.append(themeColor);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }, [dark]);
  return (
    <button
      className="quiet"
      aria-label={dark ? "Use light theme" : "Use dark theme"}
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.dataset.theme = next ? "dark" : "light";
        try {
          localStorage.setItem("lexicon.theme", next ? "dark" : "light");
        } catch {}
        window.dispatchEvent(new Event("lexicon-theme"));
      }}
    >
      <Icon name={dark ? "sun" : "moon"} />{" "}
      <span className="theme-label">{dark ? "Light" : "Dark"}</span>
    </button>
  );
}
export function ErrorNotice({ message }: { message: string }) {
  return (
    <div role="alert" className="error">
      {message}
    </div>
  );
}
export function Paragraph({ text }: { text: string }) {
  return <p className="prose">{text}</p>;
}
