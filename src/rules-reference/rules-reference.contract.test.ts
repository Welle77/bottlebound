import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { buildRulesReference } from "../../build/rules-reference";
import { RULESET } from "../domain/ruleset";
import { RULES_REFERENCE } from "virtual:rules-reference";
import { resolveRulesReference, resolveRulesSurface } from "./rules-reference";
import type { RulesReference } from "./types";

const sourcePath = new URL("../../bottlebound_rules_final.md", import.meta.url);

function assertStructuredRulesetMatchesReference(
  reference: RulesReference,
  structured: typeof RULESET,
): void {
  for (const sourceCharacter of reference.characters) {
    const character = structured.referenceCharacters.find(
      ({ id }) => id === sourceCharacter.id,
    );
    if (!character) {
      throw new Error(
        `Structured roster is missing "${sourceCharacter.name}".`,
      );
    }
    for (const field of [
      "role",
      "baseHp",
      "initiativeModifier",
      "basicAttack",
    ] as const) {
      if (character[field] !== sourceCharacter[field]) {
        throw new Error(
          `Structured character "${sourceCharacter.name}" ${field} drifts from the authoritative rules.`,
        );
      }
    }
    for (const sourceAbility of sourceCharacter.abilities) {
      const ability = character.abilities.find(
        ({ sourceAnchor }) => sourceAnchor === sourceAbility.anchor,
      );
      if (!ability) {
        throw new Error(
          `Structured character "${sourceCharacter.name}" is missing ability "${sourceAbility.name}".`,
        );
      }
      const structuredFields = {
        Type: ability.type,
        Target: ability.target,
        "Attack Type": ability.attackType,
        Range: ability.range,
        "Line of Sight": ability.lineOfSight,
        "Ball Required": ability.ballRequired,
        Effect: ability.effect,
        Duration: ability.duration,
      };
      for (const [field, sourceValue] of Object.entries(sourceAbility.fields)) {
        if (
          structuredFields[field as keyof typeof structuredFields] !==
          sourceValue
        ) {
          throw new Error(
            `Structured ability "${sourceAbility.name}" ${field} drifts from the authoritative rules.`,
          );
        }
      }
    }
  }
}

interface MutableRulesetFixture {
  referenceCharacters: Array<{
    role: string;
    basicAttack: string;
    abilities: Array<{ effect: string }>;
  }>;
}

function mutableRuleset(): MutableRulesetFixture {
  return structuredClone(RULESET) as unknown as MutableRulesetFixture;
}

describe("Ruleset reference contract", () => {
  test("covers every authoritative section, character, ability, and quick-reference row", async () => {
    const source = await readFile(sourcePath, "utf8");
    const reference = buildRulesReference(source, RULESET.version);

    expect(reference.version).toBe("BB20260822A1");
    expect(reference.sections).toHaveLength(16);
    expect(reference.characters).toHaveLength(12);
    expect(reference.abilities).toHaveLength(24);
    expect(reference.quickReference).toHaveLength(14);
    expect(new Set(reference.records.map(({ anchor }) => anchor)).size).toBe(
      reference.records.length,
    );
    expect(reference.html).toContain('id="section-1-game-overview"');
    expect(reference.html).toContain('id="character-drow-rogue"');
    expect(reference.html).toContain('id="ability-rogue-backstab"');
    expect(reference.html).toContain('id="quick-reference-turn"');
    expect(reference.html).not.toMatch(/<script|onerror=|javascript:/i);
  });

  test("deep-freezes the generated and bundled Ruleset reference", async () => {
    const source = await readFile(sourcePath, "utf8");
    const generated = buildRulesReference(source, RULESET.version);

    for (const reference of [generated, RULES_REFERENCE]) {
      expect(Object.isFrozen(reference)).toBe(true);
      expect(Object.isFrozen(reference.sections)).toBe(true);
      expect(Object.isFrozen(reference.sections[0])).toBe(true);
      expect(Object.isFrozen(reference.characters)).toBe(true);
      expect(Object.isFrozen(reference.characters[0])).toBe(true);
      expect(Object.isFrozen(reference.characters[0]?.abilities)).toBe(true);
      expect(Object.isFrozen(reference.characters[0]?.abilities[0])).toBe(true);
      expect(
        Object.isFrozen(reference.characters[0]?.abilities[0]?.fields),
      ).toBe(true);
      expect(Object.isFrozen(reference.records)).toBe(true);
      expect(Object.isFrozen(reference.records[0])).toBe(true);
    }
  });

  test("rejects raw HTML in headings and matching roster and card values", async () => {
    const source = await readFile(sourcePath, "utf8");
    const maliciousHeading = source.replace(
      "## 4. Battlefield Setup",
      '## 4. Battlefield <img src=x onerror="globalThis.pwned=true"> Setup',
    );
    const maliciousRosterAndCard = source
      .replaceAll("Rogue", 'Rogue<img src=x onerror="globalThis.pwned=true">')
      .replaceAll("Backstab", 'Backstab<svg onload="globalThis.pwned=true">');

    expect(() =>
      buildRulesReference(maliciousHeading, RULESET.version),
    ).toThrow("Raw HTML is not allowed");
    expect(() =>
      buildRulesReference(maliciousRosterAndCard, RULESET.version),
    ).toThrow("Raw HTML is not allowed");
  });

  test("fails precisely when a required ability field is malformed", async () => {
    const source = await readFile(sourcePath, "utf8");
    const malformed = source.replace(
      "| **Duration**      | Until the end of each affected character’s next turn.",
      "| **Timing**        | Until the end of each affected character’s next turn.",
    );

    expect(() => buildRulesReference(malformed, RULESET.version)).toThrow(
      'Ability "Backstab" is missing required field "Duration".',
    );
  });

  test("fails precisely for duplicate anchors, unsupported structure, and incomplete coverage", async () => {
    const source = await readFile(sourcePath, "utf8");
    const duplicateAnchor = source.replace(
      "| **Major Action**     |",
      "| **Turn**             |",
    );
    const unsupportedStructure = source.replace(
      "## 16. Referee Quick Reference",
      "### 16. Referee Quick Reference",
    );
    const incompleteRoster = source.replace(
      "| Duergar | Cleric    | Support     | 3   | +0    | Ranged — 6 paces |\n",
      "",
    );

    expect(() => buildRulesReference(duplicateAnchor, RULESET.version)).toThrow(
      'Duplicate source anchor "quick-reference-turn".',
    );
    expect(() =>
      buildRulesReference(unsupportedStructure, RULESET.version),
    ).toThrow("Expected 16 numbered rules sections; found 15.");
    expect(() =>
      buildRulesReference(incompleteRoster, RULESET.version),
    ).toThrow("Expected 12 roster entries; found 11.");
  });

  test("exposes immutable roster and verbatim ability-card fields to the application", () => {
    const rogue = RULESET.referenceCharacters.find(
      ({ id }) => id === "drow-rogue",
    );

    expect(rogue).toMatchObject({
      role: "Striker",
      basicAttack: "Melee — 2 paces",
      sourceAnchor: "character-drow-rogue",
    });
    expect(rogue?.abilities).toHaveLength(2);
    expect(rogue?.abilities[0]).toMatchObject({
      name: "Backstab",
      sourceAnchor: "ability-rogue-backstab",
      type: "Standard",
      target: "None — physical throw",
      attackType: "Melee",
      range: "2 paces",
      lineOfSight: "Yes",
      ballRequired: "Yes",
      duration: "Until the end of each affected character’s next turn.",
    });
    expect(() => {
      (rogue?.abilities as unknown[]).push({});
    }).toThrow();
  });

  test("exposes immutable structured Basic Attacks and the five automated Reactions", () => {
    expect(RULESET.basicAttacks).toHaveLength(12);
    expect(RULESET.basicAttacks[0]).toEqual({
      id: "drow-rogue-basic-attack",
      characterId: "drow-rogue",
      attackType: "melee",
      rangePaces: 2,
      damage: 1,
      use: "unlimited",
      physicalChecks: [
        "range",
        "line-of-sight",
        "legal-bottle-contact",
        "terrain-contact",
      ],
      sourceAnchor: "character-drow-rogue-roster",
    });
    expect(
      RULESET.reactions.map(({ id, operations }) => ({ id, operations })),
    ).toEqual([
      {
        id: "drow-paladin-divine-shield",
        operations: [{ type: "prevent-damage-and-effects" }],
      },
      {
        id: "drow-wizard-misty-escape",
        operations: [
          { type: "prevent-damage-and-effects" },
          { type: "manual-movement", character: "owner", maxPaces: 2 },
        ],
      },
      {
        id: "drow-sorcerer-mirror-veil",
        operations: [{ type: "prevent-damage-and-effects" }],
      },
      {
        id: "duergar-monk-deflecting-palm",
        operations: [
          { type: "prevent-damage-and-effects" },
          { type: "redirect-physical-attack", toward: "original-thrower" },
        ],
      },
      {
        id: "duergar-fighter-shield-wall",
        operations: [{ type: "prevent-damage-and-effects" }],
      },
    ]);
    expect(Object.isFrozen(RULESET.basicAttacks)).toBe(true);
    expect(Object.isFrozen(RULESET.basicAttacks[0]?.physicalChecks)).toBe(true);
    expect(Object.isFrozen(RULESET.reactions)).toBe(true);
    expect(Object.isFrozen(RULESET.reactions[0]?.operations)).toBe(true);
    expect(
      RULESET.reactions.map(({ name, target, range, lineOfSight, source }) => ({
        name,
        target,
        range,
        lineOfSight,
        effect: source.effect,
      })),
    ).toEqual([
      {
        name: "Divine Shield",
        target: "Self or 1 ally",
        range: "3 paces",
        lineOfSight: "No",
        effect:
          "When an attack would affect the chosen character, prevent all damage and effects from that attack against that character. The same attack may still affect other characters normally.",
      },
      {
        name: "Misty Escape",
        target: "Self",
        range: "Self",
        lineOfSight: "N/A",
        effect:
          "When an attack would affect the Wizard, prevent all damage and effects from that attack against the Wizard. The Wizard may then immediately move up to 2 paces. This is ability-granted movement and does not consume the Wizard’s next turn movement, but existing movement restrictions still apply unless explicitly overridden.",
      },
      {
        name: "Mirror Veil",
        target: "Self",
        range: "Self",
        lineOfSight: "N/A",
        effect:
          "When an attack would affect the Sorcerer, prevent all damage and effects from that attack against the Sorcerer. The attack may still affect other characters normally.",
      },
      {
        name: "Deflecting Palm",
        target: "Self",
        range: "Self",
        lineOfSight: "N/A",
        effect:
          "When a physical ball hits the Monk, prevent all damage and effects from that attack against the Monk. The same ball is immediately redirected toward the original thrower’s current bottle position. It remains the same attack: all attached ball effects remain attached, each bottle may still be affected at most once, and the attack keeps its original source and hard maximum range.",
      },
      {
        name: "Shield Wall",
        target: "Self or 1 ally",
        range: "2 paces",
        lineOfSight: "No",
        effect:
          "When an attack affects the chosen character, reduce all damage from that attack against that character to 0 and prevent its attached effects against that character. Other characters affected by the same attack resolve normally.",
      },
    ]);
  });

  test("rejects induced structured roster drift from the authoritative Markdown", async () => {
    const source = await readFile(sourcePath, "utf8");
    const reference = buildRulesReference(source, RULESET.version);
    assertStructuredRulesetMatchesReference(reference, RULESET);
    const drifted = mutableRuleset();
    drifted.referenceCharacters[0]!.role = "Controller";

    expect(() =>
      assertStructuredRulesetMatchesReference(
        reference,
        drifted as unknown as typeof RULESET,
      ),
    ).toThrow(
      'Structured character "Rogue" role drifts from the authoritative rules.',
    );
  });

  test("rejects induced Basic Attack drift from the authoritative Markdown", async () => {
    const source = await readFile(sourcePath, "utf8");
    const reference = buildRulesReference(source, RULESET.version);
    const drifted = mutableRuleset();
    drifted.referenceCharacters[0]!.basicAttack = "Ranged — 99 paces";

    expect(() =>
      assertStructuredRulesetMatchesReference(
        reference,
        drifted as unknown as typeof RULESET,
      ),
    ).toThrow(
      'Structured character "Rogue" basicAttack drifts from the authoritative rules.',
    );
  });

  test("rejects induced ability-card field drift from the authoritative Markdown", async () => {
    const source = await readFile(sourcePath, "utf8");
    const reference = buildRulesReference(source, RULESET.version);
    const drifted = mutableRuleset();
    drifted.referenceCharacters[0]!.abilities[0]!.effect = "No effect.";

    expect(() =>
      assertStructuredRulesetMatchesReference(
        reference,
        drifted as unknown as typeof RULESET,
      ),
    ).toThrow(
      'Structured ability "Backstab" Effect drifts from the authoritative rules.',
    );
  });

  test("binds reference content to one exact Ruleset version without fallback", () => {
    expect(resolveRulesReference("BB20260822A1")?.version).toBe("BB20260822A1");
    expect(resolveRulesReference("BB-unknown")).toBeNull();
  });

  test("shows the exact unavailable version for an active Match without fallback", () => {
    const activeMatch = {
      phase: "active" as const,
      rulesVersion: "BB-prior-release",
    };

    expect(resolveRulesSurface(activeMatch.rulesVersion)).toEqual({
      status: "unavailable",
      version: "BB-prior-release",
      message:
        "This Match uses Ruleset BB-prior-release, but matching rules content is not bundled. The console will not substitute another version.",
    });
  });
});
