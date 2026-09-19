import type { AgentConnection } from "./agent-runtime";

/** User configuration shared by every project and task on this Lexicon server.
 * Credentials are deliberately absent from this public contract. */
export interface UserSettings {
  revision: number;
  connections: { t3: AgentConnection };
}
export interface T3PairingInput { url: string; credential: string }
