import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { buildRulesReference } from "../../build/rules-reference";
import type { RulesReferenceRecord } from "./types";
import { normalizeRulesQuery, searchRules } from "./rules-search";

const sourcePath = new URL("../../bottlebound_rules_final.md", import.meta.url);

const records: readonly RulesReferenceRecord[] = [
  {
    kind: "section",
    title: "15. Character Ability Cards",
    anchor: "section-15-character-ability-cards",
    sourceOrder: 100,
    text: "Character Ability Cards Backstab and Shadow Step",
  },
  {
    kind: "ability",
    title: "Backstab",
    anchor: "ability-rogue-backstab",
    sourceOrder: 140,
    text: "Backstab Melee 2 paces Line of Sight Yes Ball Required Yes",
  },
  {
    kind: "quick-reference",
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
    ).toEqual(["ability-rogue-backstab", "quick-reference-line-of-sight"]);
  });

  test("ranks exact titles first, then ability cards, then stable source order", () => {
    expect(
      searchRules(records, "Backstab").map(({ anchor }) => anchor),
    ).toEqual(["ability-rogue-backstab", "section-15-character-ability-cards"]);

    const tied = [
      { ...records[2]!, sourceOrder: 300, title: "Late", anchor: "late" },
      { ...records[2]!, sourceOrder: 200, title: "Early", anchor: "early" },
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
    const [result] = searchRules(records, "back backstab");

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
    ).toContain("section-4-battlefield-setup");

    const backstab = searchRules(reference.records, "Backstab").map(
      ({ anchor }) => anchor,
    );
    expect(backstab[0]).toBe("ability-rogue-backstab");
    expect(backstab).toContain("section-11-damage-combos-persistent-effects");
    expect(backstab).toContain("section-15-character-ability-cards");

    expect(
      searchRules(reference.records, "rogue ball required").map(
        ({ anchor }) => anchor,
      ),
    ).toContain("ability-rogue-backstab");
  });

  test("returns no results for a query without normalized terms", () => {
    expect(searchRules(records, "... ---")).toEqual([]);
  });
});
