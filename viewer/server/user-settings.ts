import { db } from "./db";

/** Private, server-owned user configuration. Keep the existing pairing intact. */
export interface T3Connection { url: string; cookie: string; environment: string }
db.exec("CREATE TABLE IF NOT EXISTS t3_connection (id INTEGER PRIMARY KEY CHECK(id = 1), url TEXT NOT NULL, cookie TEXT NOT NULL, environment TEXT NOT NULL)");
export const userSettings = {
  t3: {
    get: () => db.query<T3Connection, []>("SELECT url, cookie, environment FROM t3_connection WHERE id = 1").get(),
    set: (value: T3Connection) => { db.run("INSERT OR REPLACE INTO t3_connection VALUES (1, ?, ?, ?)", [value.url, value.cookie, value.environment]); },
    clear: () => { db.run("DELETE FROM t3_connection"); },
  },
};
