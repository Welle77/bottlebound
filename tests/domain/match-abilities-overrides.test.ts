import { describe, expect, it } from "vitest";

import {
  resolveAbility,
  resolveBasicAttack,
  restoreStateFromEvents,
  type ActionResolvedEvent,
} from "../../src/domain/match";
import {
  abilityId,
  advanceTo,
  CONFIRMATIONS,
  play,
  startedAuditMatch,
  stamp,
} from "./match-rules-audit-fixtures";

/**
 * Override-recording evidence for the state-invalid Ability branches of the
 * single mutation path (spec decision: "Wrong-active-character and
 * already-Spent states surface as explicit override recordings"). Every test
 * drives the public resolveAbility command only.
 *
 * The ability Override gates the command, and its referee sentence is
 * persisted on the committed ActionResolvedEvent (like majorActionOverride)
 * so every judgment stays in the event log alongside spent Abilities,
 * effects, and any second-Major-Action override text. Each overridden
 * resolution must replay exactly from its event history.
 */

const ABILITY_OVERRIDE =
  "The referee recorded an Override for this state-invalid ability choice.";
const SECOND_MAJOR_OVERRIDE =
  "Referee confirmed a second Major Action this turn.";

function asResolution(result: {
  readonly event: unknown;
}): ActionResolvedEvent {
  const event = result.event as ActionResolvedEvent;
  if (event.type !== "ActionResolved" || event.actionType !== "Ability") {
    throw new Error("The command must record one Ability Action Resolution.");
  }
  return event;
}

describe("resolveAbility override-recording branches", () => {
  it("requires an Override for a wrong-active-character Ability choice", () => {
    const run = startedAuditMatch("ability-override-wrong-active");
    // Slot 1 is the Duergar Ranger; Arcane Bolt belongs to the Drow Sorcerer.
    const input = {
      abilityId: abilityId("drow-sorcerer", "Arcane Bolt"),
      targetCharacterIds: ["duergar-ranger"],
    };
    expect(() => resolveAbility(run.state, input, stamp(1))).toThrow(
      "wrong-active-character",
    );
    expect(() =>
      resolveAbility(run.state, { ...input, abilityOverride: null }, stamp(2)),
    ).toThrow("wrong-active-character");

    const overridden = resolveAbility(
      run.state,
      { ...input, abilityOverride: ABILITY_OVERRIDE },
      stamp(3),
    );
    play(run, overridden);
    const event = asResolution(overridden);
    expect(event.sourceCharacterId).toBe("drow-sorcerer");
    expect(event.targetCharacterIds).toEqual(["duergar-ranger"]);
    expect(event.spentAbilityIds).toEqual([
      abilityId("drow-sorcerer", "Arcane Bolt"),
    ]);
    expect(event.majorActionOverride).toBeNull();
    // The recorded Override sentence stays in the event log.
    expect(event.abilityOverride).toBe(ABILITY_OVERRIDE);
    expect(event.effects).toEqual([
      {
        characterId: "duergar-ranger",
        damage: 1,
        hpBefore: 3,
        hpAfter: 2,
        downedBefore: false,
        downedAfter: false,
      },
    ]);
    // The overridden out-of-turn resolution replays exactly from the log.
    expect(restoreStateFromEvents(run.events)).toEqual(overridden.state);
  });

  it("requires an Override for an already-spent Ability choice before the second-Major-Action override", () => {
    const run = startedAuditMatch("ability-override-already-spent");
    const markId = abilityId("duergar-ranger", "Hunter's Mark");
    const unoverridden = resolveAbility(
      run.state,
      { abilityId: markId, targetCharacterIds: ["drow-wizard"] },
      stamp(1),
    );
    play(run, unoverridden);
    // A resolution without a state-invalid choice records no Override text.
    expect(asResolution(unoverridden).abilityOverride).toBeNull();
    expect(run.state.spentAbilityIds).toEqual([markId]);
    expect(run.state.majorActionUsed).toBe(true);

    const repeat = { abilityId: markId, targetCharacterIds: ["drow-wizard"] };
    expect(() => resolveAbility(run.state, repeat, stamp(2))).toThrow(
      "ability-already-spent",
    );
    // Gate order: the spent Override alone still leaves the second Major
    // Action of this turn unrecorded.
    expect(() =>
      resolveAbility(
        run.state,
        { ...repeat, abilityOverride: ABILITY_OVERRIDE },
        stamp(3),
      ),
    ).toThrow("A second ability needs a recorded referee override.");

    const overridden = resolveAbility(
      run.state,
      {
        ...repeat,
        abilityOverride: ABILITY_OVERRIDE,
        majorActionOverride: SECOND_MAJOR_OVERRIDE,
      },
      stamp(4),
    );
    play(run, overridden);
    const event = asResolution(overridden);
    expect(event.majorActionOverride).toBe(SECOND_MAJOR_OVERRIDE);
    expect(event.abilityOverride).toBe(ABILITY_OVERRIDE);
    expect(overridden.state.spentAbilityIds).toEqual([markId]);
    expect(
      overridden.state.activeEffects.some(
        (effect) => effect.kind === "hunters-mark",
      ),
    ).toBe(true);
    expect(restoreStateFromEvents(run.events)).toEqual(overridden.state);
  });

  it("requires an Override when a targeted Ability Attack target violates the relation policy", () => {
    const run = startedAuditMatch("ability-override-target-relation");
    const sorcererTurn = advanceTo(run, "drow-sorcerer");
    const input = {
      abilityId: abilityId("drow-sorcerer", "Arcane Bolt"),
      targetCharacterIds: ["drow-wizard"],
    };
    expect(() => resolveAbility(sorcererTurn, input, stamp(1))).toThrow(
      "invalid-target-relation",
    );

    const overridden = resolveAbility(
      sorcererTurn,
      { ...input, abilityOverride: ABILITY_OVERRIDE },
      stamp(2),
    );
    play(run, overridden);
    const event = asResolution(overridden);
    expect(event.targetCharacterIds).toEqual(["drow-wizard"]);
    expect(event.abilityOverride).toBe(ABILITY_OVERRIDE);
    expect(event.effects).toEqual([
      {
        characterId: "drow-wizard",
        damage: 1,
        hpBefore: 3,
        hpAfter: 2,
        downedBefore: false,
        downedAfter: false,
      },
    ]);
    expect(restoreStateFromEvents(run.events)).toEqual(overridden.state);
  });

  it("requires an Override when a targeted Ability Attack target violates the life-state policy", () => {
    const run = startedAuditMatch("ability-override-target-life-state");
    // Down the Duergar Ranger through his own recorded Basic Attacks so the
    // Downed state lives inside the event history, not in a test mutation.
    for (let attack = 0; attack < 3; attack += 1) {
      play(
        run,
        resolveBasicAttack(
          advanceTo(run, "duergar-ranger"),
          {
            sourceCharacterId: "duergar-ranger",
            affectedCharacterIds: ["duergar-ranger"],
            physicalConfirmations: CONFIRMATIONS,
            majorActionOverride: null,
          },
          stamp(20 + attack),
        ),
      );
      expect(
        run.state.characters.find(
          ({ characterId }) => characterId === "duergar-ranger",
        )?.hp,
      ).toBe(2 - attack);
    }
    const sorcererTurn = advanceTo(run, "drow-sorcerer");
    const input = {
      abilityId: abilityId("drow-sorcerer", "Arcane Bolt"),
      targetCharacterIds: ["duergar-ranger"],
    };
    expect(() => resolveAbility(sorcererTurn, input, stamp(1))).toThrow(
      "invalid-target-life-state",
    );

    const overridden = resolveAbility(
      sorcererTurn,
      { ...input, abilityOverride: ABILITY_OVERRIDE },
      stamp(2),
    );
    play(run, overridden);
    const event = asResolution(overridden);
    expect(event.targetCharacterIds).toEqual(["duergar-ranger"]);
    expect(event.abilityOverride).toBe(ABILITY_OVERRIDE);
    expect(event.effects).toEqual([
      {
        characterId: "duergar-ranger",
        damage: 1,
        hpBefore: 0,
        hpAfter: 0,
        downedBefore: true,
        downedAfter: true,
      },
    ]);
    expect(restoreStateFromEvents(run.events)).toEqual(overridden.state);
  });
});
