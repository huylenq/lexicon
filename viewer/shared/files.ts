import type { SourceLink } from "./model";
import { isMarkdownFile } from "./source";

export type FileMetric =
  | { loc: number; status: "counted" }
  | { loc: null; status: "binary" | "too-large" | "unavailable" | "deferred" };

export type FileInventory = {
  files: string[];
  truncated: boolean;
  scope: "git" | "directory";
  metrics?: Record<string, FileMetric>;
};

export function fileMetricLabel(metric?: FileMetric) {
  if (metric?.status === "counted") return `${metric.loc.toLocaleString()} LOC${metric.loc === 0 ? " · minimum-size tile" : ""}`;
  const reason = metric?.status === "binary" ? "Binary file" : metric?.status === "too-large" ? "File exceeds LOC scan limit"
    : metric?.status === "deferred" ? "LOC scan budget reached" : "LOC unavailable";
  return `${reason} · minimum-size tile`;
}

export const fileSelectionId = (file: string) => `repository:${JSON.stringify(file)}`;
export function fileSelectionPath(id: string): string | undefined {
  if (!id.startsWith("repository:")) return;
  try {
    const file = JSON.parse(id.slice(11));
    if (typeof file === "string" && file && !file.startsWith("/") && !file.includes("\\") &&
      !file.split("/").some(part => !part || part === "." || part === "..") && !file.includes("\0")) return file;
  } catch { /* Malformed locations remain unavailable. */ }
}

/** A reader location, not an authored evidence mapping. */
export const fileSourceLink = (file: string): SourceLink => {
  const base = { file, role: "reference", description: "Project file." };
  return isMarkdownFile(file) || /\.(txt|rst|adoc)$/i.test(file)
    ? { ...base, kind: "document" } : { ...base, kind: "code" };
};
