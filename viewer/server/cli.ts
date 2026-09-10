import { resolve } from "node:path";
import { loadModel } from "./model";
import { readCode } from "./code";

const [command, rawRoot = "..", ...flags] = process.argv.slice(2);
const root = resolve(rawRoot);
const codeIndex = flags.indexOf("--code-root");
const codeRoot = codeIndex >= 0 ? resolve(flags[codeIndex + 1] || "") : root;
if (command !== "check") {
  console.error(
    "Usage: bun server/cli.ts check <artifact-root> [--code-root <code-root>]",
  );
  process.exit(1);
}
try {
  const model = await loadModel(root);
  const errors = model.issues.filter((i) => i.severity === "error");
  for (const issue of model.issues)
    console.error(
      `${issue.severity}: ${issue.item || model.id}: ${issue.message}`,
    );
  {
    let broken = 0,
      unchecked = 0,
      checked = 0;
    for (const item of model.items)
      for (const link of item.codeLinks) {
        try {
          const result = await readCode(codeRoot, link);
          if (["missing-symbol", "ambiguous-symbol"].includes(result.status))
            throw new Error(result.status);
          if (result.status === "unsupported") {
            unchecked++;
            console.error(
              `unchecked: ${item.id}: ${link.file}#${link.symbol} (symbol language unsupported)`,
            );
          } else checked++;
        } catch (error) {
          broken++;
          console.error(
            `broken: ${item.id}: ${link.file}#${link.symbol || ""}: ${(error as Error).message}`,
          );
        }
      }
    console.log(
      `${model.items.length} objects; ${checked} code links checked; ${unchecked} unchecked; ${broken} broken; ${errors.length} model errors.`,
    );
    console.log(
      "These checks establish structure and target resolution. Review relationship claims and rule evidence against source.",
    );
    if (broken || errors.length || unchecked) process.exitCode = 1;
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
