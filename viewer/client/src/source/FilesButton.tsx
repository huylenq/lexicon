import { useExperimentalFiles } from "../developmentOptions";
import { useSearchParams } from "react-router-dom";
import { CanvasButton } from "../canvas/Toolbar";

/** Files browsing is navigation alongside the canvas, not a dimension. */
export function FilesButton({ beforeOpen }: { beforeOpen: () => void | Promise<unknown> }) {
  const enabled = useExperimentalFiles();
  const [, setParams] = useSearchParams();
  if (!enabled) return null;
  return <CanvasButton icon="open" label="Browse Files" onClick={async () => {
    await beforeOpen();
    setParams(previous => { const next = new URLSearchParams(previous); next.delete("repository"); next.set("files", "1"); return next; });
  }} />;
}
