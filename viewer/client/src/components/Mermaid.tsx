import { useEffect, useRef, useState } from "react";

let counter = 0;

function currentTheme(): "dark" | "default" {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "default";
}

// Renders a ```mermaid fenced block to SVG. Re-renders on the project's
// light/dark toggle (observes the `data-theme` attribute the ThemeToggle
// flips) so diagrams stay legible in both paper modes.
export default function Mermaid({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(`spec-mermaid-${counter++}`);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      try {
        // Lazy import keeps mermaid (large) out of the main bundle — it loads
        // only when a spec with a mermaid diagram is actually viewed.
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: currentTheme(),
          fontFamily: "inherit",
        });
        const { svg } = await mermaid.render(`${idRef.current}-${counter++}`, code);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message ?? String(e));
      }
    };

    render();

    // Re-render when the theme attribute flips.
    const obs = new MutationObserver(muts => {
      if (muts.some(m => m.attributeName === "data-theme")) render();
    });
    obs.observe(document.documentElement, { attributes: true });

    return () => {
      cancelled = true;
      obs.disconnect();
    };
  }, [code]);

  if (error) {
    return <div className="spec-mermaid-error">mermaid render failed: {error}</div>;
  }
  return <div className="spec-mermaid" ref={ref} />;
}
