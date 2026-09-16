import { useSyncExternalStore } from "react";
import { fileIconType } from "./fileIconTypes";
import icon0 from "material-icon-theme/icons/file.svg?url";
import icon3 from "material-icon-theme/icons/typescript.svg?url";
import icon4 from "material-icon-theme/icons/typescript-def.svg?url";
import icon5 from "material-icon-theme/icons/react_ts.svg?url";
import icon6 from "material-icon-theme/icons/javascript.svg?url";
import icon7 from "material-icon-theme/icons/react.svg?url";
import icon8 from "material-icon-theme/icons/vue.svg?url";
import icon9 from "material-icon-theme/icons/svelte.svg?url";
import icon10 from "material-icon-theme/icons/python.svg?url";
import icon11 from "material-icon-theme/icons/go.svg?url";
import icon12 from "material-icon-theme/icons/rust.svg?url";
import icon13 from "material-icon-theme/icons/java.svg?url";
import icon14 from "material-icon-theme/icons/kotlin.svg?url";
import icon15 from "material-icon-theme/icons/c.svg?url";
import icon16 from "material-icon-theme/icons/cpp.svg?url";
import icon17 from "material-icon-theme/icons/csharp.svg?url";
import icon18 from "material-icon-theme/icons/ruby.svg?url";
import icon19 from "material-icon-theme/icons/php.svg?url";
import icon20 from "material-icon-theme/icons/swift.svg?url";
import icon21 from "material-icon-theme/icons/scala.svg?url";
import icon22 from "material-icon-theme/icons/dart.svg?url";
import icon23 from "material-icon-theme/icons/elixir.svg?url";
import icon24 from "material-icon-theme/icons/haskell.svg?url";
import icon25 from "material-icon-theme/icons/lua.svg?url";
import icon26 from "material-icon-theme/icons/r.svg?url";
import icon27 from "material-icon-theme/icons/html.svg?url";
import icon28 from "material-icon-theme/icons/css.svg?url";
import icon29 from "material-icon-theme/icons/sass.svg?url";
import icon30 from "material-icon-theme/icons/less.svg?url";
import icon31 from "material-icon-theme/icons/markdown.svg?url";
import icon32 from "material-icon-theme/icons/readme.svg?url";
import icon33 from "material-icon-theme/icons/pdf.svg?url";
import icon34 from "material-icon-theme/icons/document.svg?url";
import icon35 from "material-icon-theme/icons/word.svg?url";
import icon36 from "material-icon-theme/icons/powerpoint.svg?url";
import icon37 from "material-icon-theme/icons/json.svg?url";
import icon38 from "material-icon-theme/icons/yaml.svg?url";
import icon39 from "material-icon-theme/icons/toml.svg?url";
import icon40 from "material-icon-theme/icons/xml.svg?url";
import icon41 from "material-icon-theme/icons/settings.svg?url";
import icon42 from "material-icon-theme/icons/docker.svg?url";
import icon43 from "material-icon-theme/icons/git.svg?url";
import icon44 from "material-icon-theme/icons/nodejs.svg?url";
import icon45 from "material-icon-theme/icons/npm.svg?url";
import icon46 from "material-icon-theme/icons/bun.svg?url";
import icon47 from "material-icon-theme/icons/pnpm.svg?url";
import icon48 from "material-icon-theme/icons/yarn.svg?url";
import icon49 from "material-icon-theme/icons/vite.svg?url";
import icon50 from "material-icon-theme/icons/test-ts.svg?url";
import icon51 from "material-icon-theme/icons/test-js.svg?url";
import icon52 from "material-icon-theme/icons/database.svg?url";
import icon53 from "material-icon-theme/icons/graphql.svg?url";
import icon54 from "material-icon-theme/icons/prisma.svg?url";
import icon55 from "material-icon-theme/icons/proto.svg?url";
import icon56 from "material-icon-theme/icons/console.svg?url";
import icon57 from "material-icon-theme/icons/powershell.svg?url";
import icon58 from "material-icon-theme/icons/command.svg?url";
import icon59 from "material-icon-theme/icons/image.svg?url";
import icon60 from "material-icon-theme/icons/svg.svg?url";
import icon61 from "material-icon-theme/icons/video.svg?url";
import icon62 from "material-icon-theme/icons/audio.svg?url";
import icon63 from "material-icon-theme/icons/font.svg?url";
import icon64 from "material-icon-theme/icons/zip.svg?url";
import icon65 from "material-icon-theme/icons/lock.svg?url";
import icon66 from "material-icon-theme/icons/toml_light.svg?url";
import icon67 from "material-icon-theme/icons/bun_light.svg?url";
import icon68 from "material-icon-theme/icons/pnpm_light.svg?url";

// A small bundled subset, with no CDN or theme generator in the browser.
const urls: Record<string, string> = {
  "file": icon0,
  "typescript": icon3,
  "typescript-def": icon4,
  "react_ts": icon5,
  "javascript": icon6,
  "react": icon7,
  "vue": icon8,
  "svelte": icon9,
  "python": icon10,
  "go": icon11,
  "rust": icon12,
  "java": icon13,
  "kotlin": icon14,
  "c": icon15,
  "cpp": icon16,
  "csharp": icon17,
  "ruby": icon18,
  "php": icon19,
  "swift": icon20,
  "scala": icon21,
  "dart": icon22,
  "elixir": icon23,
  "haskell": icon24,
  "lua": icon25,
  "r": icon26,
  "html": icon27,
  "css": icon28,
  "sass": icon29,
  "less": icon30,
  "markdown": icon31,
  "readme": icon32,
  "pdf": icon33,
  "document": icon34,
  "word": icon35,
  "powerpoint": icon36,
  "json": icon37,
  "yaml": icon38,
  "toml": icon39,
  "xml": icon40,
  "settings": icon41,
  "docker": icon42,
  "git": icon43,
  "nodejs": icon44,
  "npm": icon45,
  "bun": icon46,
  "pnpm": icon47,
  "yarn": icon48,
  "vite": icon49,
  "test-ts": icon50,
  "test-js": icon51,
  "database": icon52,
  "graphql": icon53,
  "prisma": icon54,
  "proto": icon55,
  "console": icon56,
  "powershell": icon57,
  "command": icon58,
  "image": icon59,
  "svg": icon60,
  "video": icon61,
  "audio": icon62,
  "font": icon63,
  "zip": icon64,
  "lock": icon65,
  "toml_light": icon66,
  "bun_light": icon67,
  "pnpm_light": icon68
};
export function sourceIconUrl(path: string, dark = false) {
  const type = fileIconType(path);
  return (!dark && urls[`${type}_light`]) || urls[type] || urls.file;
}

const themeSnapshot = () => document.documentElement.dataset.theme === "dark";
const subscribeTheme = (listener: () => void) => {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
};
export const useSourceTheme = () => useSyncExternalStore(subscribeTheme, themeSnapshot, () => false);

// Cache decoded images by icon type, never by repository file. Loading a batch
// invalidates the map once per animation frame, including the shared 3D map.
const images = new Map<string, HTMLImageElement>();
const listeners = new Set<() => void>();
let revision = 0, frame = 0;
const snapshot = () => revision;
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useSourceIconRevision = () => useSyncExternalStore(subscribe, snapshot, snapshot);
export function sourceIconImage(url: string) {
  let image = images.get(url);
  if (!image) {
    image = new Image();
    images.set(url, image);
    image.onload = () => {
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0; revision++; listeners.forEach(listener => listener());
      });
    };
    image.src = url;
  }
  return image.complete && image.naturalWidth ? image : undefined;
}
