interface DesktopUpdateNotice {
  version: string;
  url: string;
}
interface Window {
  lexiconDesktop?: {
    getUpdate(): Promise<DesktopUpdateNotice | null>;
    openUpdate(): Promise<void>;
    chooseFolder(): Promise<string | null>;
    onUpdate(callback: (notice: DesktopUpdateNotice) => void): () => void;
  };
}
