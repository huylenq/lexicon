import { useState } from "react";
export async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Unable to load this request.");
  return data;
}
export function Theme() {
  const [dark, setDark] = useState(
    document.documentElement.dataset.theme === "dark",
  );
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
      }}
    >
      {dark ? "◑" : "◐"}{" "}
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
