import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Resolve the checkout even when invoked through an agent's skill symlink.
const bundle = resolve(dirname(realpathSync(import.meta.path)), "../../..");
if (process.argv[2] === "root") {
  console.log(bundle);
} else {
  await import(pathToFileURL(resolve(bundle, "viewer/server/cli.ts")).href);
}
