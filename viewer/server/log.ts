import { appendFileSync, mkdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogScope = "http" | "model" | "canvas" | "mcp" | "agent" | "desktop" | "server";
export type LogFields = {
  msg: string;
  error?: string;
  ms?: number;
  projectId?: string;
  taskId?: string;
  messageId?: string;
  changeId?: string;
  revision?: string;
  requestId?: string;
} & Record<string, unknown>;

const ranks: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };
const MAX_BYTES = 2 * 1024 * 1024;

function testing() {
  return process.argv.includes("test") || process.argv.some(arg => arg.includes(".test."));
}

function config() {
  const spec = process.env.LEXICON_LOG;
  const parts = spec?.split(",").map(part => part.trim()).filter(Boolean) || [];
  let floor = spec == null || spec === "" ? (testing() ? 4 : 1) : 1;
  const debugScopes = new Set<string>();
  for (const part of parts) {
    if (part in ranks) floor = ranks[part]!;
    else debugScopes.add(part);
  }
  return { floor, debugScopes };
}

function enabled(level: LogLevel, scope: LogScope) {
  const { floor, debugScopes } = config();
  if (ranks[level]! >= floor && floor < 4) return true;
  return level === "debug" && debugScopes.has(scope);
}

export function logDirectory() {
  if (process.platform === "darwin") return join(homedir(), "Library/Logs/Lexicon");
  return join(process.env.XDG_STATE_HOME || join(homedir(), ".local/state"), "lexicon");
}

function logFile() {
  if (process.env.LEXICON_LOG_FILE != null) return process.env.LEXICON_LOG_FILE || null;
  if (testing() && process.env.LEXICON_LOG == null) return null;
  if (process.env.LEXICON_DESKTOP_TOKEN) return null;
  return join(logDirectory(), "dev.log");
}

function rotate(path: string) {
  try { if (statSync(path).size < MAX_BYTES) return; } catch { return; }
  try { unlinkSync(`${path}.2`); } catch {}
  try { renameSync(`${path}.1`, `${path}.2`); } catch {}
  try { renameSync(path, `${path}.1`); } catch {}
}

function compact(fields: LogFields) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) out[key] = value;
  return out;
}

export function emit(level: LogLevel, scope: LogScope, fields: LogFields) {
  if (!enabled(level, scope)) return;
  const line = `${JSON.stringify({ ts: new Date().toISOString(), level, scope, ...compact(fields), pid: process.pid })}\n`;
  try { process.stderr.write(line); } catch {}
  const file = logFile();
  if (!file) return;
  try {
    mkdirSync(dirname(file), { recursive: true });
    rotate(file);
    appendFileSync(file, line);
  } catch {}
}

export const debug = (scope: LogScope, fields: LogFields) => emit("debug", scope, fields);
export const info = (scope: LogScope, fields: LogFields) => emit("info", scope, fields);
export const warn = (scope: LogScope, fields: LogFields) => emit("warn", scope, fields);
export const error = (scope: LogScope, fields: LogFields) => emit("error", scope, fields);

export function finish(level: LogLevel, scope: LogScope, fields: LogFields, started: number) {
  const ms = Math.round(performance.now() - started);
  emit(level, scope, { ...fields, ms });
  if (ms > 500) emit("warn", scope, { msg: "slow", of: fields.msg, ms, projectId: fields.projectId, taskId: fields.taskId });
}
