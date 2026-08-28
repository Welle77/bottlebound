import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { buildRulesReference } from "../../build/rules-reference";
import type { RulesReferenceRecord } from "../../src/rules-reference/types";
import {
  normalizeRulesQuery,
  searchRules,
} from "../../src/rules-reference/rules-search";

const sourcePath = new URL("../../bottlebound_rules_final.md", import.meta.url);

const records: readonly RulesReferenceRecord[] = [
  {
    kind: "heading",
    title: "15. Character Ability Cards",
    anchor: "section-15-character-ability-cards",
    sourceOrder: 100,
    text: "Character Ability Cards Backstab and Shadow Step",
  },
  {
    kind: "heading",
    title: "Backstab",
    anchor: "ability-rogue-backstab",
    sourceOrder: 140,
    text: "Backstab Melee 2 paces Line of Sight Yes Ball Required Yes",
  },
  {
    kind: "heading",
    title: "Line of Sight",
    anchor: "quick-reference-line-of-sight",
    sourceOrder: 220,
    text: "Line of Sight Check from the thrower's torso to the target torso",
  },
];

describe("rules search", () => {
  test("normalizes case and punctuation and removes empty or repeated terms", () => {
    expect(normalizeRulesQuery("  LINE-of-sight, line!!  ")).toEqual([
      "line",
      "of",
      "sight",
    ]);
  });

  test("treats apostrophe-bearing and punctuation-free names as equivalent", () => {
    expect(normalizeRulesQuery("Nature’s Renewal")).toEqual([
      "natures",
      "renewal",
    ]);
    expect(normalizeRulesQuery("Natures Renewal")).toEqual([
      "natures",
      "renewal",
    ]);
  });

  test("returns only records that contain every query term", () => {
    expect(
      searchRules(records, "line sight").map(({ anchor }) => anchor),
    ).toEqual(["quick-reference-line-of-sight", "ability-rogue-backstab"]);
  });

  test("ranks exact titles first, then stable source order", () => {
    expect(
      searchRules(records, "Backstab").map(({ anchor }) => anchor),
    ).toEqual(["ability-rogue-backstab", "section-15-character-ability-cards"]);

    const tiedSource = records.at(2);
    if (tiedSource === undefined) {
      throw new Error("Missing fixture record for the tie-break probe.");
    }
    const tied = [
      { ...tiedSource, sourceOrder: 300, title: "Late", anchor: "late" },
      { ...tiedSource, sourceOrder: 200, title: "Early", anchor: "early" },
    ];
    expect(
      searchRules(tied, "target torso").map(({ anchor }) => anchor),
    ).toEqual(["early", "late"]);
  });

  test("returns a source-text excerpt with ranges for every matched term", () => {
    const result = searchRules(records, "LINE sight").find(
      ({ anchor }) => anchor === "quick-reference-line-of-sight",
    );

    expect(result).toMatchObject({
      anchor: "quick-reference-line-of-sight",
      excerpt:
        "Line of Sight Check from the thrower's torso to the target torso",
    });
    expect(result?.highlights.map(({ text }) => text)).toEqual([
      "Line",
      "Sight",
    ]);
    for (const highlight of result?.highlights ?? []) {
      expect(result?.excerpt.slice(highlight.start, highlight.end)).toBe(
        highlight.text,
      );
    }
  });

  test("merges overlapping term ranges into one visible union", () => {
    const result = searchRules(records, "back backstab").find(
      ({ title }) => title === "Backstab",
    );

    expect(result?.highlights).toEqual([
      { start: 0, end: 8, text: "Backstab" },
    ]);
  });

  test("searches production section prose and ranks a production ability before broader sections", async () => {
    const source = await readFile(sourcePath, "utf8");
    const reference = buildRulesReference(source, "test-rules");

    expect(
      searchRules(reference.records, "unsafe movement").map(
        ({ anchor }) => anchor,
      ),
    ).toContain("rules-heading-4-battlefield-setup");

    const backstab = searchRules(reference.records, "Backstab").map(
      ({ anchor }) => anchor,
    );
    expect(backstab[0]).toBe("rules-heading-backstab");
    expect(backstab).toContain(
      "rules-heading-11-damage-combos-persistent-effects",
    );

    expect(
      searchRules(reference.records, "ball required").map(
        ({ anchor }) => anchor,
      ),
    ).toContain("rules-heading-backstab");
  });

  test("searches generic headings after level, number, position, and order changes", () => {
    const reference = buildRulesReference(
      `# Guide

### 20. Movement

Rules about safe movement.

## 3. Initiative

Rules about initiative.
`,
      "current-guide",
    );

    expect(searchRules(reference.records, "safe movement")).toHaveLength(1);
    expect(searchRules(reference.records, "initiative")[0]?.title).toBe(
      "3. Initiative",
    );
  });

  test("returns no results for a query without normalized terms", () => {
    expect(searchRules(records, "... ---")).toEqual([]);
  });
});
