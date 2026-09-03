import { describe, expect, it } from "vitest";

import {
  createSetup,
  finishTurn,
  generateInitiative,
  resolveAbility,
  resolveBasicAttack,
  restoreStateFromEvents,
  startMatch,
  type ActionResolvedEvent,
  type MatchEvent,
} from "../../src/domain/match";
import { queuedRandom } from "./match-test-support";

// Distinct d20 results keep every initiative total unique (no tie flips) and
// place the Druid (+1 modifier, roll 19, total 20) alone in slot 1.
const druidFirstInitiative = [10, 19, 11, 8, 7, 14, 11, 12, 10, 9, 6, 5];

function startedMatchWithActiveDruid() {
  const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
  const generated = generateInitiative(
    setup.state,
    queuedRandom(...druidFirstInitiative),
    "2026-08-22T14:01:00.000Z",
  );
  const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
  return { setup, generated, started };
}

describe("Ability resolution", () => {
  it("consumes one action for Standard and both actions for Powerful abilities", () => {
    const { started } = startedMatchWithActiveDruid();
    const standard = resolveAbility(
      started.state,
      { abilityId: "drow-druid-shapeshift" },
      "2026-08-22T14:03:00.000Z",
    );
    expect(standard.state.actionsUsed).toBe(1);

    const powerfulState = {
      ...started.state,
      initiative: started.state.initiative.map((entry, index) =>
        index === 0 ? { ...entry, characterId: "drow-rogue" as const } : entry,
      ),
    };
    const powerful = resolveAbility(
      powerfulState,
      { abilityId: "drow-rogue-vanish" },
      "2026-08-22T14:04:00.000Z",
    );
    expect(powerful.state.actionsUsed).toBe(2);
  });

  it("rejects a Powerful Ability after one action without an Override", () => {
    const { started } = startedMatchWithActiveDruid();
    const state = {
      ...started.state,
      initiative: started.state.initiative.map((entry, index) =>
        index === 0 ? { ...entry, characterId: "drow-rogue" as const } : entry,
      ),
      actionsUsed: 1 as const,
      majorActionUsed: true,
    };
    expect(() =>
      resolveAbility(
        state,
        { abilityId: "drow-rogue-vanish" },
        "2026-08-22T14:04:00.000Z",
      ),
    ).toThrow("A Powerful Ability needs both unused actions");
  });

  it("resolves the Druid's Shapeshift as one reversible Match Event", () => {
    const { started } = startedMatchWithActiveDruid();
    expect(started.state.initiative[0]?.characterId).toBe("drow-druid");

    const result = resolveAbility(
      started.state,
      { abilityId: "drow-druid-shapeshift" },
      "2026-08-22T14:03:00.000Z",
    );

    expect(result.event).toMatchObject({
      type: "ActionResolved",
      sequence: 4,
      actionType: "Ability",
      sourceCharacterId: "drow-druid",
      abilityId: "drow-druid-shapeshift",
      targetCharacterIds: ["drow-druid"],
    });
    expect(result.event.effects).toEqual([
      {
        characterId: "drow-druid",
        damage: 0,
        hpBefore: 3,
        hpAfter: 4,
        downedBefore: false,
        downedAfter: false,
      },
    ]);
    expect(result.event.appliedEffects?.map(({ kind }) => kind)).toEqual([
      "shapeshift",
    ]);
    expect(result.state.characters).toEqual(
      started.state.characters.map((character) =>
        character.characterId === "drow-druid"
          ? { ...character, currentMaxHp: 4, hp: 4 }
          : character,
      ),
    );
    expect(result.state.activeEffects).toMatchObject([
      {
        kind: "shapeshift",
        anchorCharacterId: "drow-druid",
        affectedCharacterId: "drow-druid",
        operations: ["change-max-hp"],
      },
    ]);
    expect(result.state.spentAbilityIds).toEqual(["drow-druid-shapeshift"]);
  });

  it("replays a recorded Shapeshift Action Resolution through Match Events", () => {
    const { setup, generated, started } = startedMatchWithActiveDruid();
    const resolved = resolveAbility(
      started.state,
      { abilityId: "drow-druid-shapeshift" },
      "2026-08-22T14:03:00.000Z",
    );
    const events = [
      setup.event,
      generated.event,
      started.event,
      resolved.event,
    ];

    const restored = restoreStateFromEvents(events);

    expect(restored).toEqual(resolved.state);
    expect(
      restored.characters.find(
        ({ characterId }) => characterId === "drow-druid",
      ),
    ).toMatchObject({ currentMaxHp: 4, hp: 4 });
  });

  it("replays a historical Powerful Ability as two actions and blocks a following action", () => {
    const { setup, generated, started } = startedMatchWithActiveDruid();
    let rogueTurn = started.state;
    const events: MatchEvent[] = [setup.event, generated.event, started.event];
    while (
      rogueTurn.initiative[rogueTurn.activeSlot - 1]?.characterId !==
      "drow-rogue"
    ) {
      const finished = finishTurn(rogueTurn, "2026-08-22T14:03:00.000Z");
      events.push(finished.event);
      rogueTurn = finished.state;
    }
    const vanished = resolveAbility(
      rogueTurn,
      { abilityId: "drow-rogue-vanish" },
      "2026-08-22T14:04:00.000Z",
    );
    expect(vanished.event).toMatchObject({ actionCost: 2 });
    const historicalVanish = Object.fromEntries(
      Object.entries(vanished.event).filter(([key]) => key !== "abilityId"),
    ) as ActionResolvedEvent;

    const replayed = restoreStateFromEvents([...events, historicalVanish]);

    expect(replayed.actionsUsed).toBe(2);
    if (replayed.phase !== "active") {
      throw new Error("The replayed Match must remain active.");
    }
    expect(() =>
      resolveBasicAttack(
        replayed,
        {
          sourceCharacterId: "drow-rogue",
          affectedCharacterIds: ["duergar-ranger"],
          physicalConfirmations: {
            range: true,
            lineOfSight: true,
            legalBottleContact: true,
            terrainContact: true,
          },
          majorActionOverride: null,
        },
        "2026-08-22T14:05:00.000Z",
      ),
    ).toThrow("Basic Attack needs an unused action");
  });
});
