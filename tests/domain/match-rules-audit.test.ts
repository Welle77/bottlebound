/* eslint-disable functional/no-let, functional/prefer-immutable-types -- Test harnesses build event histories and mutable run accumulators incrementally; this is the sanctioned mutability boundary for tests. */
import { describe, expect, it } from "vitest";

import {
  assignDisplayNames,
  createSetup,
  endMatch,
  finishTurn,
  generateInitiative,
  reopenMatch,
  resolveAbility,
  resolveBasicAttack,
  restoreStateFromEvents,
  startMatch,
  type ActiveMatchState,
  type MatchEvent,
} from "../../src/domain/match";
import {
  advanceTo,
  abilityId,
  AUDIT_ROLLS,
  BASE_TIME,
  cast,
  CONFIRMATIONS,
  play,
  slotOf,
  stamp,
  startedAuditMatch,
  type AuditRun,
} from "./match-rules-audit-fixtures";
import { queuedRandom } from "./match-test-support";

describe("rules coverage audit: attack damage pipeline", () => {
  it("applies Hunter’s Mark’s written +1 damage to an ability attack and consumes the Mark", () => {
    const run = startedAuditMatch("audit-mark-bolt");
    cast(run, "duergar-ranger", {
      abilityName: "Hunter's Mark",
      input: { targetCharacterIds: ["drow-wizard"] },
      step: 1,
    });

    const bolted = cast(run, "duergar-ranger", {
      abilityName: "Deadeye",
      input: { targetCharacterIds: ["drow-wizard"] },
      step: 2,
    });

    expect(
      bolted.characters.find(
        ({ characterId }) => characterId === "drow-wizard",
      ),
    ).toMatchObject({ hp: 1 });
    expect(run.events.at(-1)).toMatchObject({
      effects: [
        {
          characterId: "drow-wizard",
          damage: 2,
          hpBefore: 3,
          hpAfter: 1,
          downedBefore: false,
          downedAfter: false,
        },
      ],
    });
    const resolution = run.events.at(-1) as Extract<
      MatchEvent,
      { readonly type: "ActionResolved" }
    >;
    expect(resolution.expiredEffects?.map(({ kind }) => kind)).toEqual([
      "hunters-mark",
    ]);
    expect(
      bolted.activeEffects.some(({ kind }) => kind === "hunters-mark"),
    ).toBe(false);
  });

  it("triggers Hex with +1 damage and attaches the resulting 1-pace restriction", () => {
    const run = startedAuditMatch("audit-hex-blast");
    cast(run, "duergar-warlock", {
      abilityName: "Hex",
      input: { targetCharacterIds: ["drow-paladin"] },
      step: 1,
    });

    cast(run, "duergar-warlock", {
      abilityName: "Eldritch Blast",
      input: { targetCharacterIds: ["drow-paladin"] },
      step: 2,
    });

    const resolution = run.events.at(-1) as Extract<
      MatchEvent,
      { readonly type: "ActionResolved" }
    >;
    expect(resolution.effects).toEqual([
      {
        characterId: "drow-paladin",
        damage: 2,
        hpBefore: 5,
        hpAfter: 3,
        downedBefore: false,
        downedAfter: false,
      },
    ]);
    expect(resolution.appliedEffects?.map(({ kind }) => kind)).toEqual([
      "movement-cap",
    ]);
    expect(run.state.activeEffects.some(({ kind }) => kind === "hex")).toBe(
      false,
    );
  });

  it("does not trigger Hex when a Reaction finalizes the attack at 0 damage", () => {
    const run = startedAuditMatch("audit-hex-prevented");
    cast(run, "duergar-warlock", {
      abilityName: "Hex",
      input: { targetCharacterIds: ["drow-wizard"] },
      step: 1,
    });

    cast(run, "duergar-ranger", {
      abilityName: "Deadeye",
      input: {
        targetCharacterIds: ["drow-wizard"],
        reactions: [
          {
            reactionId: "drow-paladin-divine-shield",
            protectedCharacterId: "drow-wizard",
            override: null,
          },
        ],
      },
      step: 2,
    });

    const resolution = run.events.at(-1) as Extract<
      MatchEvent,
      { readonly type: "ActionResolved" }
    >;
    expect(resolution.effects[0]).toMatchObject({
      characterId: "drow-wizard",
      damage: 0,
      hpAfter: 3,
    });
    expect(resolution.expiredEffects ?? []).toEqual([]);
    expect(run.state.activeEffects.some(({ kind }) => kind === "hex")).toBe(
      true,
    );
  });

  it("records Deadeye's printed 8-pace range on the resolution evidence", () => {
    const run = startedAuditMatch("audit-deadeye-range");
    cast(run, "duergar-ranger", {
      abilityName: "Deadeye",
      input: { targetCharacterIds: ["drow-wizard"] },
      step: 1,
    });
    const resolution = run.events.at(-1) as Extract<
      MatchEvent,
      { readonly type: "ActionResolved" }
    >;
    expect(resolution.rangePaces).toBe(8);
    expect(resolution.attackLegs[0]?.rangePaces).toBe(8);
  });
});

describe("rules coverage audit: Basic Attacks carry character-based effects", () => {
  it("lets Hunter’s Mark add +1 damage to a Basic Attack and replays the history exactly", () => {
    const run = startedAuditMatch("audit-mark-basic");
    cast(run, "duergar-ranger", {
      abilityName: "Hunter's Mark",
      input: { targetCharacterIds: ["drow-wizard"] },
      step: 1,
    });

    const attacked = advanceTo(run, "duergar-fighter");
    play(
      run,
      resolveBasicAttack(
        attacked,
        {
          sourceCharacterId: "duergar-fighter",
          affectedCharacterIds: ["drow-wizard"],
          physicalConfirmations: CONFIRMATIONS,
          majorActionOverride: null,
        },
        stamp(2),
      ),
    );

    const resolution = run.events.at(-1) as Extract<
      MatchEvent,
      { readonly type: "ActionResolved" }
    >;
    expect(resolution.effects).toEqual([
      {
        characterId: "drow-wizard",
        damage: 2,
        hpBefore: 3,
        hpAfter: 1,
        downedBefore: false,
        downedAfter: false,
      },
    ]);
    expect(resolution.expiredEffects?.map(({ kind }) => kind)).toEqual([
      "hunters-mark",
    ]);
    expect(
      run.state.activeEffects.some(({ kind }) => kind === "hunters-mark"),
    ).toBe(false);
    expect(restoreStateFromEvents(run.events)).toEqual(run.state);
  });

  it("keeps Vanish immune to physically thrown Basic Attack balls without spending it", () => {
    const run = startedAuditMatch("audit-vanish-basic");
    cast(run, "drow-rogue", { abilityName: "Vanish", step: 1 });

    const attacked = advanceTo(run, "duergar-fighter");
    play(
      run,
      resolveBasicAttack(
        attacked,
        {
          sourceCharacterId: "duergar-fighter",
          affectedCharacterIds: ["drow-rogue"],
          physicalConfirmations: CONFIRMATIONS,
          majorActionOverride: null,
        },
        stamp(2),
      ),
    );

    const resolution = run.events.at(-1) as Extract<
      MatchEvent,
      { readonly type: "ActionResolved" }
    >;
    expect(resolution.effects).toEqual([
      {
        characterId: "drow-rogue",
        damage: 0,
        hpBefore: 3,
        hpAfter: 3,
        downedBefore: false,
        downedAfter: false,
      },
    ]);
    expect(run.state.activeEffects.some(({ kind }) => kind === "vanish")).toBe(
      true,
    );
  });

  it("reduces the first damaging Basic Attack by Rage's written 1 and consumes Rage", () => {
    const run = startedAuditMatch("audit-rage-basic");
    cast(run, "duergar-barbarian", { abilityName: "Rage", step: 1 });

    const attacked = advanceTo(run, "duergar-ranger");
    play(
      run,
      resolveBasicAttack(
        attacked,
        {
          sourceCharacterId: "duergar-ranger",
          affectedCharacterIds: ["duergar-barbarian"],
          physicalConfirmations: CONFIRMATIONS,
          majorActionOverride: null,
        },
        stamp(2),
      ),
    );

    const resolution = run.events.at(-1) as Extract<
      MatchEvent,
      { readonly type: "ActionResolved" }
    >;
    expect(resolution.effects).toEqual([
      {
        characterId: "duergar-barbarian",
        damage: 0,
        hpBefore: 5,
        hpAfter: 5,
        downedBefore: false,
        downedAfter: false,
      },
    ]);
    expect(resolution.expiredEffects?.map(({ kind }) => kind)).toEqual([
      "rage",
    ]);
    expect(run.state.activeEffects.some(({ kind }) => kind === "rage")).toBe(
      false,
    );
  });
});

describe("rules coverage audit: card life-state gates", () => {
  function withCharacterAt(
    run: AuditRun,
    characterId: string,
    hp: number,
  ): ActiveMatchState {
    return {
      ...run.state,
      characters: run.state.characters.map((character) =>
        character.characterId === characterId
          ? { ...character, hp }
          : character,
      ),
    };
  }

  it("cannot target a Downed character with Nature's Renewal", () => {
    const run = startedAuditMatch("audit-heal-natures-renewal");
    advanceTo(run, "drow-druid");
    expect(() =>
      resolveAbility(
        withCharacterAt(run, "drow-bard", 0),
        {
          abilityId: abilityId("drow-druid", "Nature's Renewal"),
          targetCharacterIds: ["drow-bard"],
        },
        stamp(1),
      ),
    ).toThrow("Downed character cannot be targeted");
  });

  it("cannot target a Downed character with Inspiring Words", () => {
    const run = startedAuditMatch("audit-heal-inspiring-words");
    advanceTo(run, "drow-bard");
    expect(() =>
      resolveAbility(
        withCharacterAt(run, "drow-wizard", 0),
        {
          abilityId: abilityId("drow-bard", "Inspiring Words"),
          targetCharacterIds: ["drow-wizard"],
        },
        stamp(1),
      ),
    ).toThrow("Downed character cannot be targeted");
  });

  it("still heals an active ally exactly 1 HP up to current maximum", () => {
    const run = startedAuditMatch("audit-heal-active");
    advanceTo(run, "drow-druid");
    const wounded = withCharacterAt(run, "drow-bard", 2);
    const healed = resolveAbility(
      wounded,
      {
        abilityId: abilityId("drow-druid", "Nature's Renewal"),
        targetCharacterIds: ["drow-bard"],
      },
      stamp(1),
    );
    expect(
      healed.state.characters.find(
        ({ characterId }) => characterId === "drow-bard",
      ),
    ).toMatchObject({ hp: 3 });
  });

  it("requires Revivify's target to be a Downed ally", () => {
    const run = startedAuditMatch("audit-revivify-gate");
    advanceTo(run, "duergar-cleric");
    expect(() =>
      resolveAbility(
        run.state,
        {
          abilityId: abilityId("duergar-cleric", "Revivify"),
          targetCharacterIds: ["duergar-fighter"],
        },
        stamp(1),
      ),
    ).toThrow("Downed ally");

    const downedAlly = withCharacterAt(run, "duergar-barbarian", 0);
    const revived = resolveAbility(
      downedAlly,
      {
        abilityId: abilityId("duergar-cleric", "Revivify"),
        targetCharacterIds: ["duergar-barbarian"],
      },
      stamp(2),
    );
    expect(
      revived.state.characters.find(
        ({ characterId }) => characterId === "duergar-barbarian",
      ),
    ).toMatchObject({ hp: 1 });
  });

  it("activates Shapeshift only while the Druid is at 2 or 3 HP", () => {
    const run = startedAuditMatch("audit-shapeshift-gate");
    advanceTo(run, "drow-druid");
    expect(() =>
      resolveAbility(
        withCharacterAt(run, "drow-druid", 1),
        {
          abilityId: abilityId("drow-druid", "Shapeshift"),
        },
        stamp(1),
      ),
    ).toThrow("2 or 3 HP");

    const shifted = resolveAbility(
      withCharacterAt(run, "drow-druid", 2),
      {
        abilityId: abilityId("drow-druid", "Shapeshift"),
      },
      stamp(2),
    );
    expect(
      shifted.state.characters.find(
        ({ characterId }) => characterId === "drow-druid",
      ),
    ).toMatchObject({ hp: 3, currentMaxHp: 4 });
  });
});

describe("rules coverage audit: Powerful prohibition and expiry boundaries", () => {
  it("blocks a Powerful Ability during a recorded Backstab prohibition and frees it afterwards", () => {
    const run = startedAuditMatch("audit-prohibit-powerful");
    cast(run, "drow-rogue", {
      abilityName: "Backstab",
      input: {
        attackLegs: [{ affectedCharacterIds: ["drow-sorcerer"] }],
        physicalConfirmations: CONFIRMATIONS,
      },
      step: 1,
    });
    expect(run.state.activeEffects.map(({ kind }) => kind)).toEqual([
      "prohibit-powerful",
    ]);

    const prohibited = advanceTo(run, "drow-sorcerer");
    expect(() =>
      resolveAbility(
        prohibited,
        {
          abilityId: abilityId("drow-sorcerer", "Arcane Bolt"),
          targetCharacterIds: ["duergar-ranger"],
        },
        stamp(2),
      ),
    ).toThrow("Powerful Ability is prohibited");

    // The prohibition expires at the end of the Sorcerer's own next turn.
    const endedProhibitedTurn = finishTurn(prohibited, stamp(3));
    run.record(endedProhibitedTurn);
    expect(
      endedProhibitedTurn.event.expiredEffects?.map(({ kind }) => kind),
    ).toEqual(["prohibit-powerful"]);

    const freed = advanceTo(run, "drow-sorcerer");
    const bolt = resolveAbility(
      freed,
      {
        abilityId: abilityId("drow-sorcerer", "Arcane Bolt"),
        targetCharacterIds: ["duergar-ranger"],
      },
      stamp(4),
    );
    expect(bolt.event.effects[0]).toMatchObject({
      characterId: "duergar-ranger",
      damage: 1,
    });
  });

  it("keeps Battle Hymn's self-buff beyond the casting turn and expires it after the Bard's next turn", () => {
    const run = startedAuditMatch("audit-hymn-self");
    cast(run, "drow-bard", {
      abilityName: "Battle Hymn",
      input: { targetCharacterIds: ["drow-bard", "drow-wizard"] },
      step: 1,
    });
    expect(run.state.activeEffects).toHaveLength(2);

    // Finish the Bard's own casting turn: both buffs must survive it.
    const current = play(run, finishTurn(run.state, stamp(2)));
    const firstResolution = run.events.at(-1) as Extract<
      MatchEvent,
      { readonly type: "TurnFinished" }
    >;
    expect(firstResolution.expiredEffects ?? []).toEqual([]);
    expect(current.activeEffects).toHaveLength(2);

    // Advance through the Wizard's next turn; her buff expires at its end
    // while the Bard's own buff waits for her next turn's end.
    let wizardEnded = finishTurn(current, stamp(3));
    while (
      wizardEnded.event.activeSlot !== 2 &&
      !wizardEnded.event.skippedSlots.includes(2)
    ) {
      run.recordEvent(wizardEnded.event);
      wizardEnded = finishTurn(
        wizardEnded.state,
        stamp(60 + run.events.length),
      );
    }
    run.record(wizardEnded);
    expect(wizardEnded.event.activeSlot).toBe(2);

    const endsHisNextTurn = finishTurn(wizardEnded.state, stamp(4));
    expect(
      endsHisNextTurn.event.expiredEffects?.map(
        ({ affectedCharacterId }) => affectedCharacterId,
      ),
    ).toEqual(["drow-wizard"]);
    expect(
      endsHisNextTurn.state.activeEffects.map(
        ({ affectedCharacterId }) => affectedCharacterId,
      ),
    ).toEqual(["drow-bard"]);
  });

  it("keeps Hunter's Mark alive through the end of the Ranger's next scheduled position", () => {
    const run = startedAuditMatch("audit-mark-expiry");
    cast(run, "duergar-ranger", {
      abilityName: "Hunter's Mark",
      input: { targetCharacterIds: ["drow-wizard"] },
      step: 1,
    });

    let current = run.state;
    for (let step = 0; step < 40; step += 1) {
      if (
        current.round === 2 &&
        current.activeSlot === slotOf(current, "duergar-ranger")
      ) {
        break;
      }
      current = play(run, finishTurn(current, stamp(70 + step)));
    }
    expect(current.round).toBe(2);
    expect(current.activeSlot).toBe(slotOf(current, "duergar-ranger"));
    expect(
      current.activeEffects.some(({ kind }) => kind === "hunters-mark"),
    ).toBe(true);

    const ended = finishTurn(current, stamp(99));
    run.recordEvent(ended.event);
    expect(ended.event.expiredEffects?.map(({ kind }) => kind)).toEqual([
      "hunters-mark",
    ]);
    expect(ended.state.activeEffects).toEqual([]);
    expect(restoreStateFromEvents(run.events)).toEqual(ended.state);
  });
});

describe("rules coverage audit: immediate effect expiry on a Basic Attack", () => {
  it("ends a Downed bearer's Hex and its triggered restriction immediately (rules §9)", () => {
    const run = startedAuditMatch("audit-basic-downed-cleanup");

    // Round 1: the Barbarian (slot 3) wounds the Wizard to 2 HP.
    const wounded = advanceTo(run, "duergar-barbarian");
    play(
      run,
      resolveBasicAttack(
        wounded,
        {
          sourceCharacterId: "duergar-barbarian",
          affectedCharacterIds: ["drow-wizard"],
          physicalConfirmations: CONFIRMATIONS,
          majorActionOverride: null,
        },
        stamp(1),
      ),
    );
    expect(
      run.state.characters.find(
        ({ characterId }) => characterId === "drow-wizard",
      ),
    ).toMatchObject({ hp: 2 });

    // The Warlock (slot 9) then pends a Hex on the wounded Wizard.
    cast(run, "duergar-warlock", {
      abilityName: "Hex",
      input: { targetCharacterIds: ["drow-wizard"] },
      step: 2,
    });

    // Round 2, Fighter (slot 8): base 1 + Hex 1 downs the Wizard. Rules §9
    // ends the attached effects immediately — the triggered 1-pace
    // restriction must not survive the attack that laid him flat.
    const killing = advanceTo(run, "duergar-fighter");
    const resolution = play(
      run,
      resolveBasicAttack(
        killing,
        {
          sourceCharacterId: "duergar-fighter",
          affectedCharacterIds: ["drow-wizard"],
          physicalConfirmations: CONFIRMATIONS,
          majorActionOverride: null,
        },
        stamp(3),
      ),
    );
    const killEvent = run.events.at(-1) as Extract<
      MatchEvent,
      { readonly type: "ActionResolved" }
    >;

    expect(killEvent.effects[0]).toMatchObject({
      characterId: "drow-wizard",
      damage: 2,
      hpBefore: 2,
      hpAfter: 0,
      downedAfter: true,
    });
    expect(killEvent.expiredEffects?.map(({ kind }) => kind)).toEqual([
      "hex",
      "movement-cap",
    ]);
    expect(resolution.activeEffects).toEqual([]);
    expect(resolution.outcome).toBeNull();
    expect(restoreStateFromEvents(run.events)).toEqual(resolution);
  });

  it("ends Shapeshift at once when a Basic Attack reduces the Druid below 3 HP (rules §15)", () => {
    const run = startedAuditMatch("audit-basic-shapeshift-damage");

    // The Druid (slot 4) shifts at 3 HP to 4/4.
    cast(run, "drow-druid", { abilityName: "Shapeshift", step: 1 });

    // The Warlock (slot 9) pends a Hex on the shifted Druid.
    cast(run, "duergar-warlock", {
      abilityName: "Hex",
      input: { targetCharacterIds: ["drow-druid"] },
      step: 2,
    });

    // Round 2, Fighter (slot 8): base 1 + Hex 1 = 2 damage drops the Druid
    // from 4 to 2 HP. The card ends Shapeshift immediately and its maximum
    // HP returns to 3; the successfully triggered Hex restriction remains.
    const attacking = advanceTo(run, "duergar-fighter");
    const resolution = play(
      run,
      resolveBasicAttack(
        attacking,
        {
          sourceCharacterId: "duergar-fighter",
          affectedCharacterIds: ["drow-druid"],
          physicalConfirmations: CONFIRMATIONS,
          majorActionOverride: null,
        },
        stamp(3),
      ),
    );
    const strikeEvent = run.events.at(-1) as Extract<
      MatchEvent,
      { readonly type: "ActionResolved" }
    >;

    expect(strikeEvent.effects[0]).toMatchObject({
      characterId: "drow-druid",
      damage: 2,
      hpBefore: 4,
      hpAfter: 2,
    });
    expect(strikeEvent.expiredEffects?.map(({ kind }) => kind)).toEqual([
      "hex",
      "shapeshift",
    ]);
    expect(
      resolution.characters.find(
        ({ characterId }) => characterId === "drow-druid",
      ),
    ).toMatchObject({ hp: 2, currentMaxHp: 3 });
    expect(resolution.activeEffects.map(({ kind }) => kind)).toEqual([
      "movement-cap",
    ]);
    expect(restoreStateFromEvents(run.events)).toEqual(resolution);
  });

  it("keeps Display Names inside the Match record across End Game and Reopen", () => {
    const setup = createSetup("audit-reopen-names", BASE_TIME);
    const named = assignDisplayNames(
      setup.state,
      { "drow-rogue": "Shadow" },
      BASE_TIME,
    );
    const generated = generateInitiative(
      named.state,
      queuedRandom(...AUDIT_ROLLS),
      BASE_TIME,
    );
    const started = startMatch(generated.state, BASE_TIME);
    const ended = endMatch(started.state, {
      occurredAt: stamp(1),
      confirmed: true,
      random: { nextUint32: () => 0 },
    });
    const reopened = reopenMatch(ended.state, stamp(2));

    expect(reopened.state.displayNames).toEqual({ "drow-rogue": "Shadow" });
    expect(ended.state.displayNames).toEqual({ "drow-rogue": "Shadow" });
    expect(
      restoreStateFromEvents([
        setup.event,
        named.event,
        generated.event,
        started.event,
        ended.event,
        reopened.event,
      ]),
    ).toEqual(reopened.state);
  });
});
