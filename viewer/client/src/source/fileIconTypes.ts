/** Common source and document types. Filename rules take precedence over suffixes. */
const names = new Map<string, string>([
  ["package.json", "nodejs"], ["package-lock.json", "npm"], ["npm-shrinkwrap.json", "npm"],
  ["bun.lock", "bun"], ["bun.lockb", "bun"], ["pnpm-lock.yaml", "pnpm"], ["yarn.lock", "yarn"],
  ["dockerfile", "docker"], ["containerfile", "docker"], ["docker-compose.yml", "docker"], ["docker-compose.yaml", "docker"],
  [".gitignore", "git"], [".gitattributes", "git"], [".gitmodules", "git"],
  ["makefile", "settings"], ["cmakelists.txt", "settings"], [".editorconfig", "settings"],
]);
const suffixes = new Map<string, string>();
for (const [icon, extensions] of Object.entries({
  "typescript-def": "d.ts d.mts d.cts", "test-ts": "test.ts spec.ts", "test-js": "test.js spec.js",
  typescript: "ts mts cts", react_ts: "tsx", javascript: "js mjs cjs", react: "jsx", vue: "vue", svelte: "svelte",
  python: "py pyi pyw ipynb", go: "go", rust: "rs", java: "java jar", kotlin: "kt kts", c: "c h", cpp: "cc cpp cxx hpp hxx",
  csharp: "cs csx", ruby: "rb rake gemspec", php: "php", swift: "swift", scala: "scala sc", dart: "dart", elixir: "ex exs",
  haskell: "hs lhs", lua: "lua", r: "r rmd", html: "html htm", css: "css", sass: "scss sass", less: "less",
  markdown: "md mdx markdown", document: "txt rst adoc tex", pdf: "pdf", word: "doc docx odt", powerpoint: "ppt pptx odp",
  json: "json jsonc json5", yaml: "yaml yml", toml: "toml", xml: "xml xsd xsl xslt plist", settings: "ini cfg conf env properties",
  database: "sql sqlite sqlite3 db csv tsv xls xlsx ods", graphql: "graphql gql", prisma: "prisma", proto: "proto",
  console: "sh bash zsh fish", powershell: "ps1 psm1 psd1", command: "bat cmd", image: "png jpg jpeg gif webp avif ico bmp tiff",
  svg: "svg", video: "mp4 mov webm mkv avi", audio: "mp3 wav ogg flac m4a", font: "woff woff2 ttf otf",
  zip: "zip gz tar tgz bz2 xz 7z rar", lock: "lock",
})) for (const extension of extensions.split(" ")) suffixes.set(extension, icon);

export function fileIconType(path: string): string {
  const name = path.split("/").at(-1)!.toLowerCase();
  const exact = names.get(name);
  if (exact) return exact;
  if (/^readme(?:\.|$)/.test(name)) return "readme";
  if (/^(?:dockerfile|containerfile)\./.test(name)) return "docker";
  if (/^vite\.config\./.test(name)) return "vite";
  if (/^\.env(?:\.|$)/.test(name)) return "settings";
  // Match compound suffixes before their shorter language suffix.
  for (let dot = name.indexOf("."); dot !== -1; dot = name.indexOf(".", dot + 1)) {
    const type = suffixes.get(name.slice(dot + 1));
    if (type) return type;
  }
  return "file";
}
