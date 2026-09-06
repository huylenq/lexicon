import { DEFAULT_THEME, type Editor } from "tldraw";

// Native Small text is 1.125 times this base: 13.5px beside our 14px model labels.
// Keep this prop stable; update the mounted editor when the app theme changes.
export const canvasThemes = { default: { ...DEFAULT_THEME, fontSize: 12 } };

export function syncCanvasTheme(editor: Editor) {
  const mode =
    document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  const accent = getComputedStyle(editor.getContainer())
    .getPropertyValue("--accent")
    .trim();
  const theme = editor.getCurrentTheme();
  // v5 draws selection controls as canvas overlays, independent of UI CSS.
  editor.updateTheme({
    ...theme,
    colors: {
      ...theme.colors,
      [mode]: {
        ...theme.colors[mode],
        selectionStroke: accent,
        selectionFill: `color-mix(in srgb, ${accent} 20%, transparent)`,
        brushStroke: `color-mix(in srgb, ${accent} 70%, transparent)`,
        brushFill: `color-mix(in srgb, ${accent} 8%, transparent)`,
      },
    },
  });
  editor.user.updateUserPreferences({ colorScheme: mode });
}
