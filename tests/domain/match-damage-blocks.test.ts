import { describe, expect, it } from "vitest";

import {
  resolveBasicAttack,
  restoreStateFromEvents,
  undoLastEvent,
  type MatchEvent,
} from "../../src/domain/match";
import {
  cast,
  CONFIRMATIONS,
  advanceTo,
  play,
  startedAuditMatch,
} from "./match-rules-audit-fixtures";

describe("Damage Blocks", () => {
  it("reduces one point after a damage increase and consumes a triggered Hex", () => {
    const run = startedAuditMatch("damage-block-hex");
    cast(run, "duergar-warlock", {
      abilityName: "Hex",
      input: { targetCharacterIds: ["drow-wizard"] },
      step: 1,
    });
    const result = cast(run, "duergar-ranger", {
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
    const event = run.events.at(-1) as Extract<
      MatchEvent,
      { readonly type: "ActionResolved" }
    >;
    expect(event.reactions[0]?.operations).toEqual([
      { type: "reduce-remaining-damage", characterId: "drow-wizard" },
    ]);
    expect(event.effects[0]).toMatchObject({
      characterId: "drow-wizard",
      damage: 1,
      hpBefore: 3,
      hpAfter: 2,
    });
    expect(event.expiredEffects.map(({ kind }) => kind)).toContain("hex");
    expect(result.activeEffects.some(({ kind }) => kind === "hex")).toBe(false);
    expect(restoreStateFromEvents(run.events)).toEqual(result);
    const undone = undoLastEvent(result, run.events, {
      occurredAt: "2026-08-24T09:04:00.000Z",
      confirmed: true,
    });
    expect(
      undone.state.characters.find(
        ({ characterId }) => characterId === "drow-wizard",
      ),
    ).toMatchObject({ hp: 3 });
    expect(undone.event.type).toBe("UndoApplied");
  });

  it("allows independent Damage Blocks up to incoming capacity", () => {
    const run = startedAuditMatch("damage-block-capacity");
    cast(run, "duergar-ranger", {
      abilityName: "Hunter's Mark",
      input: { targetCharacterIds: ["drow-wizard"] },
      step: 1,
    });
    const result = cast(run, "duergar-ranger", {
      abilityName: "Deadeye",
      input: {
        targetCharacterIds: ["drow-wizard"],
        reactions: [
          {
            reactionId: "drow-paladin-divine-shield",
            protectedCharacterId: "drow-wizard",
            override: null,
          },
          {
            reactionId: "duergar-fighter-shield-wall",
            protectedCharacterId: "drow-wizard",
            override: null,
          },
        ],
      },
      step: 2,
    });
    expect(
      result.characters.find(
        ({ characterId }) => characterId === "drow-wizard",
      ),
    ).toMatchObject({ hp: 3 });
    expect(run.events.at(-1)).toMatchObject({
      effects: [
        expect.objectContaining({ characterId: "drow-wizard", damage: 0 }),
      ],
    });
  });

  it("applies Hold the Line before damage and preserves the legal hit", () => {
    const run = startedAuditMatch("damage-block-hold-the-line");
    cast(run, "duergar-fighter", {
      abilityName: "Hold the Line",
      step: 1,
    });
    const markedAttack = play(
      run,
      resolveBasicAttack(
        advanceTo(run, "duergar-ranger"),
        {
          sourceCharacterId: "duergar-ranger",
          affectedCharacterIds: ["duergar-fighter"],
          physicalConfirmations: CONFIRMATIONS,
          majorActionOverride: null,
        },
        "2026-08-24T09:03:00.000Z",
      ),
    );
    const markedEvent = run.events.at(-1) as Extract<
      MatchEvent,
      { readonly type: "ActionResolved" }
    >;
    expect(markedEvent.effects[0]).toMatchObject({ damage: 0, hpAfter: 4 });
    expect(markedEvent.expiredEffects.map(({ kind }) => kind)).toContain(
      "hold-the-line",
    );
    expect(
      markedAttack.activeEffects.some(({ kind }) => kind === "hold-the-line"),
    ).toBe(false);

    const effectRun = startedAuditMatch("damage-block-attached-effect");
    const backstab = cast(effectRun, "drow-rogue", {
      abilityName: "Backstab",
      input: {
        attackLegs: [{ affectedCharacterIds: ["duergar-ranger"] }],
        physicalConfirmations: CONFIRMATIONS,
        reactions: [
          {
            reactionId: "drow-paladin-divine-shield",
            protectedCharacterId: "duergar-ranger",
            override: null,
          },
        ],
      },
      step: 1,
    });
    const backstabEvent = effectRun.events.at(-1) as Extract<
      MatchEvent,
      { readonly type: "ActionResolved" }
    >;
    expect(backstabEvent.effects[0]).toMatchObject({ damage: 0 });
    expect(backstabEvent.appliedEffects?.map(({ kind }) => kind)).toContain(
      "prohibit-powerful",
    );
    expect(
      backstab.activeEffects.some(({ kind }) => kind === "prohibit-powerful"),
    ).toBe(true);
  });

  it("preserves physical Ability effects when Stunning Strike and Brutal Shove are blocked", () => {
    const stunningRun = startedAuditMatch("damage-block-stunning-strike");
    const stunning = cast(stunningRun, "duergar-monk", {
      abilityName: "Stunning Strike",
      input: {
        attackLegs: [{ affectedCharacterIds: ["drow-sorcerer"] }],
        physicalConfirmations: CONFIRMATIONS,
        reactions: [
          {
            reactionId: "drow-paladin-divine-shield",
            protectedCharacterId: "drow-sorcerer",
            override: null,
          },
        ],
      },
      step: 1,
    });
    const stunningEvent = stunningRun.events.at(-1) as Extract<
      MatchEvent,
      { readonly type: "ActionResolved" }
    >;
    expect(stunningEvent.effects[0]).toMatchObject({ damage: 0 });
    expect(stunningEvent.appliedEffects?.map(({ kind }) => kind)).toContain(
      "prohibit-powerful",
    );
    expect(
      stunning.activeEffects.some(
        ({ kind, affectedCharacterId }) =>
          kind === "prohibit-powerful" &&
          affectedCharacterId === "drow-sorcerer",
      ),
    ).toBe(true);

    const shoveRun = startedAuditMatch("damage-block-brutal-shove");
    const shove = cast(shoveRun, "duergar-barbarian", {
      abilityName: "Brutal Shove",
      input: {
        attackLegs: [{ affectedCharacterIds: ["drow-sorcerer"] }],
        physicalConfirmations: CONFIRMATIONS,
        reactions: [
          {
            reactionId: "drow-paladin-divine-shield",
            protectedCharacterId: "drow-sorcerer",
            override: null,
          },
        ],
      },
      step: 1,
    });
    const shoveEvent = shoveRun.events.at(-1) as Extract<
      MatchEvent,
      { readonly type: "ActionResolved" }
    >;
    expect(shoveEvent.attackId).toBe("duergar-barbarian-brutal-shove");
    expect(shoveEvent.attackLegs[0]?.affectedCharacterIds).toEqual([
      "drow-sorcerer",
    ]);
    expect(shoveEvent.effects[0]).toMatchObject({ damage: 0 });
    expect(
      shove.characters.find(
        ({ characterId }) => characterId === "drow-sorcerer",
      ),
    ).toMatchObject({ hp: 3 });
  });

  it("keeps useful block capacity when low HP would otherwise make damage overkill", () => {
    const run = startedAuditMatch("damage-block-overkill");
    const marked = cast(run, "duergar-ranger", {
      abilityName: "Hunter's Mark",
      input: { targetCharacterIds: ["drow-wizard"] },
      step: 1,
    });
    const lowHp = {
      ...marked,
      characters: marked.characters.map((character) =>
        character.characterId === "drow-wizard"
          ? { ...character, hp: 1 }
          : character,
      ),
    };
    const result = resolveBasicAttack(
      lowHp,
      {
        sourceCharacterId: "duergar-ranger",
        affectedCharacterIds: ["drow-wizard"],
        physicalConfirmations: CONFIRMATIONS,
        reactions: [
          {
            reactionId: "drow-paladin-divine-shield",
            protectedCharacterId: "drow-wizard",
            override: null,
          },
          {
            reactionId: "duergar-fighter-shield-wall",
            protectedCharacterId: "drow-wizard",
            override: null,
          },
        ],
        majorActionOverride: null,
      },
      "2026-08-24T09:03:00.000Z",
    );
    expect(result.event.effects[0]).toMatchObject({
      damage: 0,
      hpBefore: 1,
      hpAfter: 1,
    });
  });
});
