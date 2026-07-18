// Common interface for call-flow providers (spec: code-lens-design.md, D7).
// One implementation per language: tsserver (TypeScript), pyright (Python).
// The supervisor routes each anchored file to the right provider.
//
// Positions are 0-based (line, character) — the LSP / tree-sitter convention.
// tsserver's 1-based protocol is converted inside its client.

export interface CallSite {
  name: string;
  file: string;     // absolute
  line: number;     // 0-based
  character: number; // 0-based
}

export interface CallFlowProvider {
  open(file: string): Promise<void>;
  incomingCalls(file: string, line: number, character: number): Promise<CallSite[]>;
  outgoingCalls(file: string, line: number, character: number): Promise<CallSite[]>;
  // Resolve the symbol at a position to its definition location — used to
  // disambiguate same-named structural references across modules. null if
  // unresolved (caller degrades to name-match).
  goToDefinition(file: string, line: number, character: number): Promise<CallSite | null>;
  // Health signal (D7): count of unresolved-import diagnostics for a file. A root
  // with many is misprovisioned — its call edges are untrustworthy.
  unresolvedImportCount(file: string): Promise<number>;
  shutdown(): void;
}
