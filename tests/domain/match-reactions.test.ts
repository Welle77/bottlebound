import { describe, expect, it } from "vitest";

import {
  createSetup,
  generateInitiative,
  getProtectiveReactionChoices,
  resolveBasicAttack,
  restoreStateFromEvents,
  startMatch,
  type ActiveMatchState,
} from "../../src/domain/match";
import { MATCH_CONFIGURATION } from "../../src/domain/match-configuration";
import {
  cast,
  CONFIRMATIONS,
  startedAuditMatch,
} from "./match-rules-audit-fixtures";
import { initiativeCharacterId, queuedRandom } from "./match-test-support";

describe("Active Match commands", () => {
  it("applies several protective Reactions only to their selected characters", () => {
    const setup = createSetup("match-reactions", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const result = resolveBasicAttack(
      started.state,
      {
        sourceCharacterId: initiativeCharacterId(started.state, 0),
        affectedCharacterIds: [
          "duergar-ranger",
          "drow-wizard",
          "drow-sorcerer",
          "drow-paladin",
          "duergar-warlock",
        ],
        physicalConfirmations: {
          range: true,
          lineOfSight: true,
          legalBottleContact: true,
          terrainContact: true,
        },
        reactions: [
          {
            reactionId: "drow-paladin-divine-shield",
            protectedCharacterId: "duergar-ranger",
            override: null,
          },
          {
            reactionId: "drow-wizard-misty-escape",
            protectedCharacterId: "drow-wizard",
            override: null,
          },
          {
            reactionId: "drow-sorcerer-mirror-veil",
            protectedCharacterId: "drow-sorcerer",
            override: null,
          },
          {
            reactionId: "duergar-fighter-shield-wall",
            protectedCharacterId: "drow-paladin",
            override: null,
          },
        ],
        majorActionOverride: null,
      },
      "2026-08-22T14:03:00.000Z",
    );

    expect(
      result.event.effects.map(({ characterId, damage }) => [
        characterId,
        damage,
      ]),
    ).toEqual([
      ["duergar-ranger", 0],
      ["drow-wizard", 0],
      ["drow-sorcerer", 0],
      ["drow-paladin", 0],
      ["duergar-warlock", 1],
    ]);
    expect(result.state.spentReactionIds).toEqual([
      "drow-paladin-divine-shield",
      "drow-wizard-misty-escape",
      "drow-sorcerer-mirror-veil",
      "duergar-fighter-shield-wall",
    ]);
    expect(result.event.reactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reactionId: "drow-paladin-divine-shield",
          ownerCharacterId: "drow-paladin",
          protectedCharacterId: "duergar-ranger",
          warnings: [],
          override: null,
          operations: [
            {
              type: "reduce-remaining-damage",
              characterId: "duergar-ranger",
            },
          ],
        }),
        expect.objectContaining({
          reactionId: "drow-wizard-misty-escape",
          operations: [
            {
              type: "prevent-damage-and-effects",
              characterId: "drow-wizard",
            },
            {
              type: "manual-movement",
              characterId: "drow-wizard",
              maxPaces: 2,
              instruction:
                "Move Misty Escape's owner up to 2 paces immediately.",
            },
          ],
        }),
      ]),
    );
    expect(
      restoreStateFromEvents([
        setup.event,
        generated.event,
        started.event,
        result.event,
      ]),
    ).toEqual(result.state);
  });

  it("continues Deflecting Palm as one redirected physical attack", () => {
    const setup = createSetup("match-redirect", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const sourceCharacterId = initiativeCharacterId(started.state, 0);
    const attack = MATCH_CONFIGURATION.basicAttacks.find(
      ({ characterId }) => characterId === sourceCharacterId,
    );
    if (!attack) throw new Error("The test expected a Basic Attack entry.");
    const result = resolveBasicAttack(
      started.state,
      {
        sourceCharacterId,
        attackLegs: [
          { affectedCharacterIds: ["duergar-monk"] },
          {
            affectedCharacterIds: [sourceCharacterId, "drow-paladin"],
          },
        ],
        physicalConfirmations: {
          range: true,
          lineOfSight: true,
          legalBottleContact: true,
          terrainContact: true,
        },
        reactions: [
          {
            reactionId: "duergar-monk-deflecting-palm",
            protectedCharacterId: "duergar-monk",
            override: null,
          },
        ],
        majorActionOverride: null,
      },
      "2026-08-22T14:03:00.000Z",
    );

    expect(result.event.attackLegs).toEqual([
      {
        sequence: 1,
        kind: "initial",
        sourceCharacterId,
        attackId: attack.id,
        rangePaces: attack.rangePaces,
        redirectedByReactionId: null,
        towardCharacterId: null,
        affectedCharacterIds: ["duergar-monk"],
      },
      {
        sequence: 2,
        kind: "redirected",
        sourceCharacterId,
        attackId: attack.id,
        rangePaces: attack.rangePaces,
        redirectedByReactionId: "duergar-monk-deflecting-palm",
        towardCharacterId: sourceCharacterId,
        affectedCharacterIds: [sourceCharacterId, "drow-paladin"],
      },
    ]);
    expect(result.event.reactions[0]).toMatchObject({
      reactionId: "duergar-monk-deflecting-palm",
      protectedCharacterId: "duergar-monk",
      operations: [
        {
          type: "prevent-damage-and-effects",
          characterId: "duergar-monk",
        },
        {
          type: "redirect-physical-attack",
          fromCharacterId: "duergar-monk",
          towardCharacterId: sourceCharacterId,
        },
      ],
    });
    expect(
      result.event.effects.map(({ characterId, damage }) => [
        characterId,
        damage,
      ]),
    ).toEqual([
      ["duergar-monk", 0],
      [sourceCharacterId, 1],
      ["drow-paladin", 1],
    ]);
    expect(result.state.spentReactionIds).toContain(
      "duergar-monk-deflecting-palm",
    );
    expect(
      restoreStateFromEvents([
        setup.event,
        generated.event,
        started.event,
        result.event,
      ]),
    ).toEqual(result.state);
  });

  it("offers Deflecting Palm only for an eligible unspent Monk hit", () => {
    const setup = createSetup("match-palm-choice", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");

    expect(
      getProtectiveReactionChoices(started.state, ["drow-paladin"]).some(
        ({ reactionId }) => reactionId === "duergar-monk-deflecting-palm",
      ),
    ).toBe(false);
    expect(
      getProtectiveReactionChoices(started.state, ["duergar-monk"]).find(
        ({ reactionId }) => reactionId === "duergar-monk-deflecting-palm",
      ),
    ).toMatchObject({
      ownerCharacterId: "duergar-monk",
      protectedCharacterId: "duergar-monk",
      eligible: true,
    });
    expect(
      getProtectiveReactionChoices(
        {
          ...started.state,
          spentReactionIds: ["duergar-monk-deflecting-palm"],
        },
        ["duergar-monk"],
      ).some(({ reactionId }) => reactionId === "duergar-monk-deflecting-palm"),
    ).toBe(false);
  });

  it("omits and rejects Deflecting Palm for non-physical Ability Attacks", () => {
    const run = startedAuditMatch("match-palm-nonphysical");
    expect(
      getProtectiveReactionChoices(run.state, ["duergar-monk"], {
        physicalAttack: false,
      }).some(
        ({ reactionId }) => reactionId === "duergar-monk-deflecting-palm",
      ),
    ).toBe(false);

    for (const override of [
      null,
      "Referee allowed the state-invalid Reaction.",
    ]) {
      const attempt =
        override === null
          ? run
          : startedAuditMatch("match-palm-nonphysical-override");
      expect(() =>
        cast(attempt, "drow-sorcerer", {
          abilityName: "Arcane Bolt",
          input: {
            targetCharacterIds: ["duergar-monk"],
            reactions: [
              {
                reactionId: "duergar-monk-deflecting-palm",
                protectedCharacterId: "duergar-monk",
                override,
              },
            ],
          },
          step: 1,
        }),
      ).toThrow("physical");
    }
  });

  it("identifies Deflecting Palm when a Damage Block precedes it on a physical Ability Attack", () => {
    const run = startedAuditMatch("match-ability-redirect-order");
    const result = cast(run, "duergar-monk", {
      abilityName: "Stunning Strike",
      input: {
        attackLegs: [
          { affectedCharacterIds: ["duergar-monk", "drow-sorcerer"] },
          { affectedCharacterIds: ["drow-paladin"] },
        ],
        physicalConfirmations: CONFIRMATIONS,
        reactions: [
          {
            reactionId: "duergar-fighter-shield-wall",
            protectedCharacterId: "drow-sorcerer",
            override: null,
          },
          {
            reactionId: "duergar-monk-deflecting-palm",
            protectedCharacterId: "duergar-monk",
            override: null,
          },
        ],
      },
      step: 1,
    });
    const event = run.events.at(-1);
    expect(event).toMatchObject({
      attackLegs: [
        { redirectedByReactionId: null },
        { redirectedByReactionId: "duergar-monk-deflecting-palm" },
      ],
    });
    expect(result.characters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ characterId: "drow-sorcerer", hp: 3 }),
        expect.objectContaining({ characterId: "duergar-monk", hp: 4 }),
      ]),
    );
  });

  it("rejects duplicate contacts across the initial and redirected legs", () => {
    const setup = createSetup(
      "match-redirect-duplicate",
      "2026-08-22T14:00:00.000Z",
    );
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    expect(() =>
      resolveBasicAttack(
        started.state,
        {
          sourceCharacterId: initiativeCharacterId(started.state, 0),
          attackLegs: [
            { affectedCharacterIds: ["duergar-monk", "drow-paladin"] },
            { affectedCharacterIds: ["drow-paladin"] },
          ],
          physicalConfirmations: {
            range: true,
            lineOfSight: true,
            legalBottleContact: true,
            terrainContact: true,
          },
          reactions: [
            {
              reactionId: "duergar-monk-deflecting-palm",
              protectedCharacterId: "duergar-monk",
              override: null,
            },
          ],
          majorActionOverride: null,
        },
        "2026-08-22T14:03:00.000Z",
      ),
    ).toThrow("unique");
  });

  it("keeps spent and Downed-owner Reactions behind a recorded Override", () => {
    const setup = createSetup(
      "match-reaction-override",
      "2026-08-22T14:00:00.000Z",
    );
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const state: ActiveMatchState = {
      ...started.state,
      spentReactionIds: ["drow-paladin-divine-shield"],
      characters: started.state.characters.map((character) =>
        character.characterId === "drow-paladin"
          ? { ...character, hp: 0 }
          : character,
      ),
    };
    const choice = getProtectiveReactionChoices(state, ["duergar-ranger"]).find(
      ({ reactionId }) => reactionId === "drow-paladin-divine-shield",
    );
    expect(choice).toMatchObject({
      eligible: false,
      warnings: [
        "Divine Shield is already spent.",
        "Divine Shield's owner is Downed.",
      ],
    });
    const input = {
      sourceCharacterId: initiativeCharacterId(state, 0),
      affectedCharacterIds: ["duergar-ranger"],
      physicalConfirmations: {
        range: true,
        lineOfSight: true,
        legalBottleContact: true,
        terrainContact: true,
      },
      reactions: [
        {
          reactionId: "drow-paladin-divine-shield",
          protectedCharacterId: "duergar-ranger",
          override: null,
        },
      ],
      majorActionOverride: null,
    } as const;
    expect(() =>
      resolveBasicAttack(state, input, "2026-08-22T14:03:00.000Z"),
    ).toThrow("Override");
    const result = resolveBasicAttack(
      state,
      {
        ...input,
        reactions: [
          {
            ...input.reactions[0],
            override: "Referee allowed the state-invalid Reaction.",
          },
        ],
      },
      "2026-08-22T14:03:00.000Z",
    );
    expect(result.event.reactions[0]).toMatchObject({
      warnings: [
        "Divine Shield is already spent.",
        "Divine Shield's owner is Downed.",
      ],
      override: "Referee allowed the state-invalid Reaction.",
    });
  });

  it("rejects two selections from one reacting character", () => {
    const setup = createSetup(
      "match-reaction-limit",
      "2026-08-22T14:00:00.000Z",
    );
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    expect(() =>
      resolveBasicAttack(
        started.state,
        {
          sourceCharacterId: initiativeCharacterId(started.state, 0),
          affectedCharacterIds: ["duergar-ranger", "duergar-warlock"],
          physicalConfirmations: {
            range: true,
            lineOfSight: true,
            legalBottleContact: true,
            terrainContact: true,
          },
          reactions: [
            {
              reactionId: "drow-paladin-divine-shield",
              protectedCharacterId: "duergar-ranger",
              override: null,
            },
            {
              reactionId: "drow-paladin-divine-shield",
              protectedCharacterId: "duergar-warlock",
              override: null,
            },
          ],
          majorActionOverride: null,
        },
        "2026-08-22T14:03:00.000Z",
      ),
    ).toThrow("One character");
  });

  it("rejects a redundant Damage Block and hides it from available choices", () => {
    const setup = createSetup(
      "match-damage-block-limit",
      "2026-08-22T14:00:00.000Z",
    );
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const selected = [
      {
        reactionId: "drow-paladin-divine-shield",
        protectedCharacterId: "duergar-ranger",
        override: null,
      },
    ] as const;
    expect(
      getProtectiveReactionChoices(
        started.state,
        ["duergar-ranger"],
        selected,
      ).find(({ reactionId }) => reactionId === "duergar-fighter-shield-wall"),
    ).toMatchObject({ eligible: false, overrideAllowed: false });
    expect(() =>
      resolveBasicAttack(
        started.state,
        {
          sourceCharacterId: initiativeCharacterId(started.state, 0),
          affectedCharacterIds: ["duergar-ranger"],
          physicalConfirmations: {
            range: true,
            lineOfSight: true,
            legalBottleContact: true,
            terrainContact: true,
          },
          reactions: [
            ...selected,
            {
              reactionId: "duergar-fighter-shield-wall",
              protectedCharacterId: "duergar-ranger",
              override: null,
            },
          ],
          majorActionOverride: null,
        },
        "2026-08-22T14:03:00.000Z",
      ),
    ).toThrow("useful capacity");
  });

  it("makes Attack Avoidance exclusive with every other protection for one character", () => {
    const setup = createSetup(
      "match-avoidance-exclusive",
      "2026-08-22T14:00:00.000Z",
    );
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const sourceCharacterId = initiativeCharacterId(started.state, 0);
    const selected = [
      {
        reactionId: "drow-wizard-misty-escape",
        protectedCharacterId: "drow-wizard",
        override: null,
      },
    ] as const;
    expect(
      getProtectiveReactionChoices(started.state, ["drow-wizard"], {
        selectedReactions: selected,
      }).find(({ reactionId }) => reactionId === "drow-paladin-divine-shield"),
    ).toMatchObject({
      eligible: false,
      overrideAllowed: false,
      warnings: [
        "Attack Avoidance cannot combine with another protective Reaction against this character.",
      ],
    });
    expect(() =>
      resolveBasicAttack(
        started.state,
        {
          sourceCharacterId,
          affectedCharacterIds: ["drow-wizard"],
          physicalConfirmations: {
            range: true,
            lineOfSight: true,
            legalBottleContact: true,
            terrainContact: true,
          },
          reactions: [
            ...selected,
            {
              reactionId: "drow-paladin-divine-shield",
              protectedCharacterId: "drow-wizard",
              override: "Referee allowed the state-invalid Reaction.",
            },
          ],
          majorActionOverride: null,
        },
        "2026-08-22T14:03:00.000Z",
      ),
    ).toThrow("Attack Avoidance cannot combine");
  });

  it("suppresses protective choices and input for a physically Vanished character", () => {
    const setup = createSetup(
      "match-vanish-reaction",
      "2026-08-22T14:00:00.000Z",
    );
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const vanished: ActiveMatchState = {
      ...started.state,
      activeEffects: [
        {
          effectId: "drow-rogue-vanish-draft",
          abilityId: "drow-rogue-vanish",
          kind: "vanish",
          anchorCharacterId: "drow-rogue",
          affectedCharacterId: "drow-rogue",
          duration: {
            kind: "until-boundary",
            boundaryTrigger: "beginning-of-next-turn",
            anchor: "affected",
            removeWhenAffectedDowned: true,
          },
          operations: ["ignore-physical-attack"],
          appliedSequence: 4,
        },
      ],
    };
    const choices = getProtectiveReactionChoices(vanished, ["drow-rogue"]);
    expect(choices).toEqual([]);
    expect(() =>
      resolveBasicAttack(
        vanished,
        {
          sourceCharacterId: initiativeCharacterId(vanished, 0),
          affectedCharacterIds: ["drow-rogue"],
          physicalConfirmations: {
            range: true,
            lineOfSight: true,
            legalBottleContact: true,
            terrainContact: true,
          },
          reactions: [
            {
              reactionId: "drow-paladin-divine-shield",
              protectedCharacterId: "drow-rogue",
              override: "Referee allowed the state-invalid Reaction.",
            },
          ],
          majorActionOverride: null,
        },
        "2026-08-22T14:03:00.000Z",
      ),
    ).toThrow("Vanish");
  });

  it("suppresses attached physical Ability effects after Attack Avoidance", () => {
    const run = startedAuditMatch("match-avoidance-effects");
    const result = cast(run, "drow-rogue", {
      abilityName: "Backstab",
      input: {
        attackLegs: [{ affectedCharacterIds: ["drow-sorcerer"] }],
        physicalConfirmations: CONFIRMATIONS,
        reactions: [
          {
            reactionId: "drow-sorcerer-mirror-veil",
            protectedCharacterId: "drow-sorcerer",
            override: null,
          },
        ],
      },
      step: 1,
    });
    expect(result).toEqual(run.state);
    expect(run.events.at(-1)).toMatchObject({
      effects: [
        {
          characterId: "drow-sorcerer",
          damage: 0,
        },
      ],
      reactions: [
        {
          reactionId: "drow-sorcerer-mirror-veil",
          operations: [
            {
              type: "prevent-damage-and-effects",
              characterId: "drow-sorcerer",
            },
          ],
        },
      ],
    });
    expect(run.state.activeEffects).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "prohibit-powerful",
          affectedCharacterId: "drow-sorcerer",
        }),
      ]),
    );
  });

  it("bounds damage at zero and records the Downed transition", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const atOneHp = {
      ...started.state,
      characters: started.state.characters.map((character) =>
        character.characterId === "duergar-ranger"
          ? { ...character, hp: 1 }
          : character,
      ),
    };
    const resolved = resolveBasicAttack(
      atOneHp,
      {
        sourceCharacterId: initiativeCharacterId(atOneHp, 0),
        affectedCharacterIds: ["duergar-ranger"],
        physicalConfirmations: {
          range: true,
          lineOfSight: true,
          legalBottleContact: true,
          terrainContact: true,
        },
        majorActionOverride: null,
      },
      "2026-08-22T14:03:00.000Z",
    );
    expect(resolved.event.effects[0]).toMatchObject({
      hpBefore: 1,
      hpAfter: 0,
      downedBefore: false,
      downedAfter: true,
    });
  });
});
