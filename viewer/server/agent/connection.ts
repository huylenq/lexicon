import { readFile, lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export function localOrigin(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new Error("LEXICON_URL must be the running viewer's local HTTP origin.");
  return url;
}
export const desktopConnectionPath = () => process.env.LEXICON_CONNECTION_FILE || join(
  process.platform === "darwin" ? join(homedir(), "Library", "Application Support")
    : process.platform === "win32" ? process.env.APPDATA || join(homedir(), "AppData", "Roaming")
    : process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
  "Lexicon", "agent-connection.json",
);

/** Reread per call so desktop restarts rotate the port/token without MCP reinstallation. */
export async function resolveConnection(explicitURL?: string, token?: string) {
  if (explicitURL) return { base: localOrigin(explicitURL), token };
  const path = desktopConnectionPath();
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || (process.platform !== "win32" && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.())))
      throw new Error("Desktop connection file must be a private file owned by the current user.");
    const value = JSON.parse(await readFile(path, "utf8"));
    if (value.version !== 1 || typeof value.origin !== "string" || typeof value.token !== "string" || !value.token)
      throw new Error("Invalid desktop connection file. Restart Lexicon.");
    return { base: localOrigin(value.origin), token: value.token as string };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" || process.env.LEXICON_CONNECTION_FILE) throw error;
    return { base: localOrigin("http://127.0.0.1:5374"), token };
  }
}
