import { describe, expect, it } from "vitest";

import { MATCH_CONFIGURATION } from "../../src/domain/match-configuration";

type MutableCharacterName = { name: string };
type MutableOperations = string[];

function expectDeeplyFrozen(value: unknown): void {
  expect(Object.isFrozen(value)).toBe(true);
  if (typeof value !== "object" || value === null) return;
  for (const child of Object.values(value)) {
    expectDeeplyFrozen(child);
  }
}

describe("application-owned Match Configuration", () => {
  it("publishes the fixed roster, attacks, abilities, and Reactions", () => {
    expect(MATCH_CONFIGURATION.version).toBe("BB20260902A1");
    expect(MATCH_CONFIGURATION.roster).toHaveLength(12);
    expect(MATCH_CONFIGURATION.roster[0]).toEqual({
      id: "drow-rogue",
      name: "Rogue",
      role: "Striker",
      team: "Drow",
      baseHp: 3,
      initiativeModifier: 3,
    });
    expect(MATCH_CONFIGURATION.roster.at(-1)).toEqual({
      id: "duergar-cleric",
      name: "Cleric",
      role: "Support",
      team: "Duergar",
      baseHp: 3,
      initiativeModifier: 0,
    });
    expect(MATCH_CONFIGURATION.basicAttacks).toHaveLength(12);
    expect(MATCH_CONFIGURATION.basicAttacks[0]).toEqual({
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
    });
    expect(MATCH_CONFIGURATION.abilities).toHaveLength(24);
    expect(
      MATCH_CONFIGURATION.abilities.find(({ name }) => name === "Deadeye"),
    ).toMatchObject({
      id: "duergar-ranger-deadeye",
      ownerCharacterId: "duergar-ranger",
      actionType: "powerful",
      attackType: "Ability Attack",
      interaction: "targeted-attack",
      targetPolicy: {
        relation: "enemy",
        cardinality: "one",
        lifeState: "active",
      },
      range: "8 paces",
      rulesText:
        "The target takes 1 damage automatically. No accuracy throw is made. Physical cover does not prevent the damage, but bottle-to-bottle Line of Sight is still required. Legal Reactions may prevent or modify the attack.",
      operations: ["deal-damage"],
    });
    expect(
      MATCH_CONFIGURATION.abilities.find(({ name }) => name === "Battle Hymn"),
    ).toMatchObject({
      ownerCharacterId: "drow-bard",
      interaction: "ally",
      targetPolicy: {
        relation: "any",
        cardinality: "all-in-range",
        lifeState: "active",
      },
    });
    expect(MATCH_CONFIGURATION.reactions).toMatchObject([
      {
        id: "drow-paladin-divine-shield",
        ownerCharacterId: "drow-paladin",
        name: "Divine Shield",
        trigger: "attack-would-affect",
        target: "Self or 1 ally",
        range: "3 paces",
        lineOfSight: "No",
        operations: [{ type: "reduce-remaining-damage" }],
      },
      {
        id: "drow-wizard-misty-escape",
        ownerCharacterId: "drow-wizard",
        name: "Misty Escape",
        trigger: "attack-would-affect",
        target: "Self",
        range: "Self",
        lineOfSight: "N/A",
        operations: [
          { type: "prevent-damage-and-effects" },
          { type: "manual-movement", character: "owner", maxPaces: 2 },
        ],
      },
      {
        id: "drow-sorcerer-mirror-veil",
        ownerCharacterId: "drow-sorcerer",
        name: "Mirror Veil",
        trigger: "attack-would-affect",
        target: "Self",
        range: "Self",
        lineOfSight: "N/A",
        operations: [{ type: "prevent-damage-and-effects" }],
      },
      {
        id: "duergar-monk-deflecting-palm",
        ownerCharacterId: "duergar-monk",
        name: "Deflecting Palm",
        trigger: "physical-ball-hits-owner",
        target: "Self",
        range: "Self",
        lineOfSight: "N/A",
        operations: [
          { type: "prevent-damage-and-effects" },
          { type: "redirect-physical-attack", toward: "original-thrower" },
        ],
      },
      {
        id: "duergar-fighter-shield-wall",
        ownerCharacterId: "duergar-fighter",
        name: "Shield Wall",
        trigger: "attack-would-affect",
        target: "Self or 1 ally",
        range: "2 paces",
        lineOfSight: "No",
        operations: [{ type: "reduce-remaining-damage" }],
      },
    ]);
  });

  it("keeps labels, referee instructions, and operation declarations explicit", () => {
    expect(MATCH_CONFIGURATION.labels).toEqual({
      basicAttack: "Basic Attack",
      ability: "Ability",
      initiative: "Initiative",
      turn: "Turn",
      endGame: "End Game",
      undo: "Undo",
      standardAbility: "Standard Ability",
      powerfulAbility: "Powerful Ability",
      reaction: "Reaction",
      physicalChecks: {
        range: "Range is legal",
        "line-of-sight": "Line of Sight is legal",
        "legal-bottle-contact": "Every selected bottle was physically hit",
        "terrain-contact": "Terrain contact was resolved",
      },
    });
    expect(MATCH_CONFIGURATION.refereeInstructions).toEqual({
      secondMajorAction: "Referee confirmed a second Major Action this turn.",
      stateInvalidAbility:
        "The referee recorded an Override for this state-invalid ability choice.",
      stateInvalidReaction: "Referee allowed a state-invalid Reaction.",
      manualPhysicalConfirmations: "Manual physical confirmations",
    });
    expect(MATCH_CONFIGURATION.operationDeclarations).toMatchObject({
      "deal-damage":
        "Apply the attack's damage to each legal affected character.",
      "prevent-damage-and-effects":
        "Attack Avoidance prevents damage and attached effects for the protected character.",
      "reduce-remaining-damage":
        "Reduce remaining damage by the declared amount.",
      "redirect-physical-attack":
        "Redirect the same physical attack toward the original thrower.",
    });
  });

  it("is deeply immutable at the public configuration boundary", () => {
    expectDeeplyFrozen(MATCH_CONFIGURATION);
    const [firstCharacter] = MATCH_CONFIGURATION.roster;
    const [firstAbility] = MATCH_CONFIGURATION.abilities;
    if (!firstCharacter || !firstAbility)
      throw new Error("Configuration is empty.");
    expect(() => {
      (firstCharacter as MutableCharacterName).name = "Changed";
    }).toThrow();
    expect(() => {
      (firstAbility.operations as MutableOperations).push("invented-operation");
    }).toThrow();
  });
});
