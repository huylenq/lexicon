import { expect, test } from "bun:test";
import { fileIconType } from "../client/src/source/fileIconTypes";

test("source icons respect filename and compound suffix precedence", () => {
  expect(fileIconType("packages/web/package.json")).toBe("nodejs");
  expect(fileIconType("packages/web/other.json")).toBe("json");
  expect(fileIconType("src/types.d.ts")).toBe("typescript-def");
  expect(fileIconType("src/order.test.ts")).toBe("test-ts");
  expect(fileIconType("src/order.ts")).toBe("typescript");
  expect(fileIconType("src/Panel.tsx")).toBe("react_ts");
});

test("source icons handle documents, dotfiles, and unknown names", () => {
  expect(fileIconType("docs/README.md")).toBe("readme");
  expect(fileIconType("docs/guide.MD")).toBe("markdown");
  expect(fileIconType(".gitignore")).toBe("git");
  expect(fileIconType(".env.local")).toBe("settings");
  expect(fileIconType("Dockerfile.prod")).toBe("docker");
  for (const path of ["unknown.thing", "__proto__", "constructor"]) expect(fileIconType(path)).toBe("file");
});
