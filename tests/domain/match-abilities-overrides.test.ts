import { describe, expect, it } from "vitest";

import {
  resolveAbility,
  resolveBasicAttack,
  restoreStateFromEvents,
  type ActionResolvedEvent,
  type ActiveEffect,
  type AttackLeg,
  type CharacterId,
  type MatchEvent,
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

type HistoricalActionResolvedEvent = Omit<
  ActionResolvedEvent,
  | "abilityId"
  | "attackId"
  | "attackLegs"
  | "attackType"
  | "damage"
  | "rangePaces"
  | "spentAbilityIds"
  | "appliedEffects"
> & {
  readonly abilityId: null;
  readonly attackId: string;
  readonly attackLegs: readonly (Omit<AttackLeg, "attackId" | "rangePaces"> & {
    readonly attackId: string;
    readonly rangePaces: number;
  })[];
  readonly attackType: string;
  readonly damage: number;
  readonly rangePaces: number;
  readonly spentAbilityIds: readonly string[];
  readonly appliedEffects: readonly (Omit<ActiveEffect, "abilityId"> & {
    readonly abilityId: string;
  })[];
};

function asResolution(result: {
  readonly event: unknown;
}): ActionResolvedEvent {
  const event = result.event as ActionResolvedEvent;
  // Widened tag view keeps the guard live for malformed fixture events.
  const eventType: string = event.type;
  if (eventType !== "ActionResolved" || event.actionType !== "Ability") {
    throw new Error("The command must record one Ability Action Resolution.");
  }
  return event;
}

describe("resolveAbility override-recording branches", () => {
  it("restores an Ability resolution that predates its optional abilityId field", () => {
    const run = startedAuditMatch("ability-event-without-ability-id");
    const resolved = resolveAbility(
      run.state,
      {
        abilityId: abilityId("duergar-ranger", "Hunter's Mark"),
        targetCharacterIds: ["drow-wizard"],
      },
      stamp(1),
    );
    const { abilityId: omittedAbilityId, ...legacyEvent } =
      asResolution(resolved);
    void omittedAbilityId;

    expect(restoreStateFromEvents([...run.events, legacyEvent])).toEqual(
      resolved.state,
    );
  });

  it("restores an Ability resolution with a null optional abilityId", () => {
    const run = startedAuditMatch("ability-event-with-null-ability-id");
    const resolved = resolveAbility(
      run.state,
      {
        abilityId: abilityId("duergar-ranger", "Hunter's Mark"),
        targetCharacterIds: ["drow-wizard"],
      },
      stamp(1),
    );
    const legacyEvent = { ...asResolution(resolved), abilityId: null };

    expect(restoreStateFromEvents([...run.events, legacyEvent])).toEqual(
      resolved.state,
    );
  });

  it("restores retired Ability ids and metadata through the historical replay path", () => {
    const run = startedAuditMatch("retired-ability-resolution");
    const resolved = resolveAbility(
      run.state,
      {
        abilityId: abilityId("duergar-ranger", "Hunter's Mark"),
        targetCharacterIds: ["drow-wizard"],
      },
      stamp(1),
    );
    const event = asResolution(resolved);
    const appliedEffect = event.appliedEffects?.[0];
    if (!appliedEffect) {
      throw new Error("Hunter's Mark must apply one active effect.");
    }
    const configurationVersion = "BB-retired";
    const attackId = "duergar-ranger-retired-mark";
    const historicalEvent = {
      ...event,
      configurationVersion,
      attackId,
      abilityId: null,
      attackType: "retired-ability-attack",
      rangePaces: 9,
      damage: 2,
      attackLegs: event.attackLegs.map((leg) => ({
        ...leg,
        attackId,
        rangePaces: 9,
      })),
      spentAbilityIds: [attackId],
      appliedEffects: [{ ...appliedEffect, abilityId: attackId }],
    } as HistoricalActionResolvedEvent;
    const historicalEvents = [
      ...run.events.map((recorded): MatchEvent => ({
        ...recorded,
        configurationVersion,
      })),
      historicalEvent as MatchEvent,
    ];

    expect(restoreStateFromEvents(historicalEvents)).toEqual({
      ...resolved.state,
      configurationVersion,
      spentAbilityIds: [attackId],
      activeEffects: [{ ...appliedEffect, abilityId: attackId }],
    });
  });

  it("requires an Override for a wrong-active-character Ability choice", () => {
    const run = startedAuditMatch("ability-override-wrong-active");
    // Slot 1 is the Duergar Ranger; Arcane Bolt belongs to the Drow Sorcerer.
    const input = {
      abilityId: abilityId("drow-sorcerer", "Arcane Bolt"),
      targetCharacterIds: ["duergar-ranger" as CharacterId],
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

  it("allows an ability Override to authorize a second action", () => {
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

    const repeat = {
      abilityId: markId,
      targetCharacterIds: ["drow-wizard" as CharacterId],
    };
    expect(() => resolveAbility(run.state, repeat, stamp(2))).toThrow(
      "ability-already-spent",
    );
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
      targetCharacterIds: ["drow-wizard" as CharacterId],
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
      targetCharacterIds: ["duergar-ranger" as CharacterId],
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
