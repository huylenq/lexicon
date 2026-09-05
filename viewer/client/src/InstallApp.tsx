import { useEffect, useState } from "react";

interface InstallPrompt extends Event {
  prompt(): Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  useEffect(() => {
    const available = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const installed = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  if (!prompt) return null;
  return <button className="quiet install-app" onClick={async () => {
    setPrompt(null);
    try { await prompt.prompt(); } catch { /* Browser install menu stays available. */ }
  }}>Install app</button>;
}
