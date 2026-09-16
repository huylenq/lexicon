export interface ProjectSettings {
  files: { include: string[]; exclude: string[] };
}
export const defaultProjectSettings: ProjectSettings = { files: { include: [], exclude: ["**/*.lock", "**/.*/**"] } };
