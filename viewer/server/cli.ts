import { resolve, join } from "node:path";
import { writeFile } from "node:fs/promises";
import { loadModel, serializeModel } from "./model";
import { readCode } from "./code";

const [command, rawRoot = "..", ...flags] = process.argv.slice(2);
const root = resolve(rawRoot);
const codeIndex = flags.indexOf("--code-root");
const codeRoot = codeIndex >= 0 ? resolve(flags[codeIndex + 1] || "") : root;
if (!["check", "convert"].includes(command)) {
  console.error(
    "Usage: bun server/cli.ts check|convert <artifact-root> [--code-root <code-root>] [--write]",
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
  if (command === "check") {
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
  } else {
    if (errors.length)
      throw new Error("Resolve model errors before converting.");
    const xml = serializeModel(model);
    if (flags.includes("--write")) {
      await writeFile(join(root, "lexicon/model.xml"), xml, { flag: "wx" });
      console.log(
        "Created lexicon/model.xml. Review imported meanings and links. Earlier files are preserved.",
      );
    } else process.stdout.write(xml);
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
