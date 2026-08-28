import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { buildRulesReference } from "../../build/rules-reference";
import { resolveRulesSurface } from "../../src/rules-reference/rules-reference";
import { RULES_REFERENCE } from "virtual:rules-reference";

const sourcePath = new URL("../../bottlebound_rules_final.md", import.meta.url);

describe("Ruleset reference contract", () => {
  test("builds generic navigation and records without a guide schema", () => {
    const fixture = `# A Field Guide

### 9. Later Topic

Rules about **turns** and [safe movement](https://example.test/movement).

##### Earlier Topic

This section explains initiative.

## First Topic

The guide is still useful when its sections are reordered and renumbered.
`;

    const reference = buildRulesReference(fixture, "current-guide");

    expect(reference.records.map(({ title }) => title)).toEqual([
      "A Field Guide",
      "9. Later Topic",
      "Earlier Topic",
      "First Topic",
    ]);
    expect(reference.records.map(({ kind }) => kind)).toEqual([
      "heading",
      "heading",
      "heading",
      "heading",
    ]);
    expect(reference.navigation.map(({ title }) => title)).toEqual([
      "First Topic",
    ]);
    expect(reference.html).toContain('id="rules-heading-a-field-guide"');
    expect(reference.html).not.toMatch(/<script|onerror=|javascript:/i);
  });

  test("covers the current bundled guide without extracting roster or card data", async () => {
    const source = await readFile(sourcePath, "utf8");
    const reference = buildRulesReference(source, "current-guide");

    expect(reference.headings).toHaveLength(55);
    expect(reference.navigation).toHaveLength(16);
    expect(reference.records).toHaveLength(reference.headings.length);
    expect(reference.html).toContain("BOTTLEBOUND");
    expect(reference.html).toContain("Backstab");
    expect(reference.html).toContain("Referee Quick Reference");
    expect(Object.keys(reference)).toEqual([
      "version",
      "html",
      "headings",
      "navigation",
      "records",
    ]);
  });

  test("deep-freezes the generated and bundled Ruleset reference", async () => {
    const source = await readFile(sourcePath, "utf8");

    for (const reference of [
      buildRulesReference(source, "current-guide"),
      RULES_REFERENCE,
    ]) {
      expect(Object.isFrozen(reference)).toBe(true);
      expect(Object.isFrozen(reference.headings)).toBe(true);
      expect(Object.isFrozen(reference.headings[0])).toBe(true);
      expect(Object.isFrozen(reference.navigation)).toBe(true);
      expect(Object.isFrozen(reference.records)).toBe(true);
      expect(Object.isFrozen(reference.records[0])).toBe(true);
    }
  });

  test("keeps raw HTML rejection and unsafe-link sanitization for generic content", () => {
    const unsafeLink = buildRulesReference(
      "# Guide\n\n[unsafe](javascript:globalThis.pwned=true)",
      "current-guide",
    );
    expect(unsafeLink.html).not.toMatch(/<a|javascript:/i);
    expect(() =>
      buildRulesReference(
        '# Guide\n\n### Heading <img src=x onerror="globalThis.pwned=true">',
        "current-guide",
      ),
    ).toThrow("Raw HTML is not allowed");
  });

  test("generates unique internal anchors for duplicate or empty-looking headings", () => {
    const reference = buildRulesReference(
      "# Guide\n\n## Repeat\n\n## Repeat\n\n## !!!",
      "current-guide",
    );

    expect(reference.headings.map(({ anchor }) => anchor)).toEqual([
      "rules-heading-guide",
      "rules-heading-repeat",
      "rules-heading-repeat-2",
      "rules-heading-heading-4",
    ]);
    expect(new Set(reference.headings.map(({ anchor }) => anchor)).size).toBe(
      reference.headings.length,
    );
  });

  test("shows only the current bundled guide without resolving Match State", () => {
    expect(resolveRulesSurface()).toEqual({
      status: "available",
      reference: RULES_REFERENCE,
    });
  });
});
