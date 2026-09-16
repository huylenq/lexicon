import { useSyncExternalStore } from "react";

const key = "lexicon.dev.files";
const event = "lexicon-development-options";
const subscribe = (notify: () => void) => {
  window.addEventListener(event, notify); window.addEventListener("storage", notify);
  return () => { window.removeEventListener(event, notify); window.removeEventListener("storage", notify); };
};
const snapshot = () => { try { return localStorage.getItem(key) === "true"; } catch { return false; } };
export const useExperimentalFiles = () => useSyncExternalStore(subscribe, snapshot, () => false);
export function setExperimentalFiles(enabled: boolean) {
  localStorage.setItem(key, String(enabled));
  window.dispatchEvent(new Event(event));
}
