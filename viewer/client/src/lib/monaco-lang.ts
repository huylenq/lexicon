const LANG_BY_EXT: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  md: "markdown", yaml: "yaml", yml: "yaml", json: "json", xml: "xml", xsd: "xml",
  py: "python", go: "go", rs: "rust", swift: "swift", java: "java",
  css: "css", html: "html", sh: "shell",
};

export function langForFile(file: string): string {
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  return LANG_BY_EXT[ext] ?? "plaintext";
}
