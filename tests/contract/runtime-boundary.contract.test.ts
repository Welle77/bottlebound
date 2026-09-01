import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RUNTIME_ROOTS = ["src/domain", "src/app", "src/storage"] as const;

const RULES_REFERENCE_UI_FILES = new Set([
  "src/ui/RulesModal.svelte",
  "src/ui/format.ts",
  "src/ui/rules-dialog.ts",
]);

function sourceFilesIn(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesIn(path);
    return /\.(?:ts|svelte)$/u.test(entry.name) ? [path] : [];
  });
}

function runtimeSourceFiles(): readonly string[] {
  const applicationFiles = RUNTIME_ROOTS.flatMap(sourceFilesIn);
  const matchUiFiles = sourceFilesIn("src/ui").filter(
    (path) => !RULES_REFERENCE_UI_FILES.has(path),
  );
  return [...applicationFiles, ...matchUiFiles];
}

function boundaryViolations(): readonly string[] {
  const importPattern =
    /(?:from\s*|import\s*\(\s*)["'][^"']*(?:virtual:rules-reference|rules-reference|build\/rules-reference|domain\/ruleset|(?:^|\/)ruleset(?:\.ts)?)[^"']*["']/u;
  return runtimeSourceFiles().flatMap((path) => {
    const source = readFileSync(path, "utf8");
    const violations = [
      ...(path.endsWith("/ruleset.ts")
        ? ["restored domain/ruleset module"]
        : []),
      ...(importPattern.test(source) ? ["guide-derived runtime import"] : []),
      ...(source.match(/\b(?:RULESET|RULES_VERSION)\b/u)
        ? ["obsolete Ruleset runtime symbol"]
        : []),
    ];
    return violations.map((violation) => `${path}: ${violation}`);
  });
}

describe("runtime ownership boundary", () => {
  it("keeps runtime/application/storage/Match UI code independent of guide data", () => {
    expect(boundaryViolations()).toEqual([]);
  });
});
