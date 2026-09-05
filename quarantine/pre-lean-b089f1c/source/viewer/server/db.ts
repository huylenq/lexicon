import { Database } from "bun:sqlite";
import { resolve } from "node:path";

const DB_PATH = resolve(import.meta.dir, "..", "lexicon-viewer.db");

export const db = new Database(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    root_path TEXT NOT NULL UNIQUE,
    added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_opened_at TEXT
  );
`);

export interface ProjectRow {
  id: number;
  name: string;
  root_path: string;
  added_at: string;
  last_opened_at: string | null;
}

export const projects = {
  list(): ProjectRow[] {
    return db.query<ProjectRow, []>(
      "SELECT * FROM projects ORDER BY last_opened_at DESC NULLS LAST, added_at DESC"
    ).all();
  },
  get(id: number): ProjectRow | null {
    return db.query<ProjectRow, [number]>(
      "SELECT * FROM projects WHERE id = ?"
    ).get(id);
  },
  add(name: string, rootPath: string): ProjectRow {
    const row = db.query<ProjectRow, [string, string]>(
      "INSERT INTO projects (name, root_path) VALUES (?, ?) RETURNING *"
    ).get(name, rootPath);
    if (!row) throw new Error("insert failed");
    return row;
  },
  remove(id: number): void {
    db.run("DELETE FROM projects WHERE id = ?", [id]);
  },
  touch(id: number): void {
    db.run("UPDATE projects SET last_opened_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
  },
};
