import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import {
  assignDisplayNames,
  createSetup,
  finishTurn,
  generateInitiative,
  resolveAbility,
  resolveBasicAttack,
  startMatch,
  undoLastEvent,
  type ActionResolvedEvent,
  type MatchEvent,
  type MatchState,
} from "../domain/match";
import { randomQueue } from "./match-store.test-helpers";
import { IndexedDbMatchStore } from "./match-store";

/**
 * Store-seam acceptance evidence: one committed Match history that combines
 * Display Names, Spent Abilities, and Action Resolution effect ledgers must
 * restore exactly through reopen, and Undo of an ability resolution must
 * persist through the same seam.
 */
const UNIQUE_TOTAL_ROLLS = [19, 17, 15, 13, 12, 9, 14, 6, 5, 4, 3, 1];

describe("IndexedDbMatchStore combined Display Name and Ability persistence", () => {
  it("restores names, spent abilities, and effect ledgers across a store reopen", async () => {
    const factory = new IDBFactory();
    const databaseName = "completeness-roundtrip";
    const firstStore = new IndexedDbMatchStore(factory, databaseName);
    const setup = createSetup("match-completeness", "2026-08-24T08:00:00.000Z");
    const named = assignDisplayNames(
      setup.state,
      { "duergar-fighter": "Stone", "drow-wizard": "Web" },
      "2026-08-24T08:02:00.000Z",
    );
    const generated = generateInitiative(
      named.state,
      randomQueue(UNIQUE_TOTAL_ROLLS),
      "2026-08-24T08:03:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-24T08:04:00.000Z");
    const results: Array<{ event: MatchEvent; state: MatchState }> = [
      setup,
      named,
      generated,
      started,
    ];

    let state = started.state;
    const turn = (occurredAt: string) => {
      const turned = finishTurn(state, occurredAt);
      results.push(turned);
      state = turned.state;
    };

    // Slots 1-2 close; slot 3 is the Ranger.
    turn("2026-08-24T08:05:00.000Z");
    turn("2026-08-24T08:06:00.000Z");
    const marked = resolveAbility(
      state,
      {
        abilityId: "duergar-ranger-hunter-s-mark",
        targetCharacterIds: ["drow-wizard"],
      },
      "2026-08-24T08:07:00.000Z",
    );
    results.push(marked);
    state = marked.state;

    // Slots 3-4 close; slot 5 is the Wizard.
    turn("2026-08-24T08:08:00.000Z");
    turn("2026-08-24T08:09:00.000Z");
    const attacked = resolveBasicAttack(
      state,
      {
        sourceCharacterId: "drow-wizard",
        affectedCharacterIds: ["duergar-fighter"],
        physicalConfirmations: {
          range: true,
          lineOfSight: true,
          legalBottleContact: true,
          terrainContact: true,
        },
        majorActionOverride: null,
      },
      "2026-08-24T08:10:00.000Z",
    );
    results.push(attacked);
    state = attacked.state;

    // Slots 5-8 close; slot 9 is the Fighter at 3/4 HP.
    turn("2026-08-24T08:11:00.000Z");
    turn("2026-08-24T08:12:00.000Z");
    turn("2026-08-24T08:13:00.000Z");
    turn("2026-08-24T08:14:00.000Z");
    const healed = resolveAbility(
      state,
      { abilityId: "duergar-fighter-second-wind" },
      "2026-08-24T08:15:00.000Z",
    );
    results.push(healed);
    state = healed.state;

    expect(state.displayNames).toEqual({
      "duergar-fighter": "Stone",
      "drow-wizard": "Web",
    });
    expect(state.spentAbilityIds).toEqual([
      "duergar-ranger-hunter-s-mark",
      "duergar-fighter-second-wind",
    ]);
    expect(
      state.activeEffects.some(
        (effect) =>
          effect.kind === "hunters-mark" &&
          effect.affectedCharacterId === "drow-wizard",
      ),
    ).toBe(true);
    expect(
      state.characters.find(
        ({ characterId }) => characterId === "duergar-fighter",
      )?.hp,
    ).toBe(4);

    for (const result of results) {
      await firstStore.commit(result.event, result.state);
    }

    const reopenedStore = new IndexedDbMatchStore(factory, databaseName);
    const restored = await reopenedStore.restore();
    if (!restored) throw new Error("The combined history must restore.");
    expect(restored.summary).toBeNull();
    expect(restored.events).toEqual(results.map(({ event }) => event));
    expect(restored.state.displayNames).toEqual({
      "duergar-fighter": "Stone",
      "drow-wizard": "Web",
    });
    expect(restored.state.spentAbilityIds).toContain(
      "duergar-ranger-hunter-s-mark",
    );
    expect(restored.state.spentAbilityIds).toContain(
      "duergar-fighter-second-wind",
    );
    expect(
      restored.state.activeEffects.some(
        (effect) =>
          effect.kind === "hunters-mark" &&
          effect.affectedCharacterId === "drow-wizard",
      ),
    ).toBe(true);
    expect(
      restored.state.characters.find(
        ({ characterId }) => characterId === "duergar-fighter",
      )?.hp,
    ).toBe(4);

    const undone = undoLastEvent(restored.state, restored.events, {
      occurredAt: "2026-08-24T08:16:00.000Z",
      confirmed: true,
    });
    await reopenedStore.commit(undone.event, undone.state);

    const afterUndo = await reopenedStore.restore();
    if (!afterUndo) throw new Error("The undone history must restore.");
    expect(afterUndo.events).toEqual([
      ...results.map(({ event }) => event),
      undone.event,
    ]);
    expect(
      afterUndo.state.characters.find(
        ({ characterId }) => characterId === "duergar-fighter",
      )?.hp,
    ).toBe(3);
    expect(afterUndo.state.spentAbilityIds).not.toContain(
      "duergar-fighter-second-wind",
    );
    expect(afterUndo.state.spentAbilityIds).toContain(
      "duergar-ranger-hunter-s-mark",
    );
    expect(afterUndo.state.displayNames).toEqual(undone.state.displayNames);
  });

  it("restores a recorded Ability Override sentence across a store reopen", async () => {
    const factory = new IDBFactory();
    const databaseName = "completeness-override-roundtrip";
    const firstStore = new IndexedDbMatchStore(factory, databaseName);
    const setup = createSetup(
      "match-completeness-override",
      "2026-08-24T08:00:00.000Z",
    );
    const generated = generateInitiative(
      setup.state,
      randomQueue(UNIQUE_TOTAL_ROLLS),
      "2026-08-24T08:03:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-24T08:04:00.000Z");
    const history: Array<{ event: MatchEvent; state: MatchState }> = [
      setup,
      generated,
      started,
    ];
    let state = started.state;
    let minute = 4;
    const sorcererSlot = state.initiative.find(
      ({ characterId }) => characterId === "drow-sorcerer",
    )?.slot;
    if (sorcererSlot === undefined) {
      throw new Error("The initiative must contain the Drow Sorcerer.");
    }
    while (state.activeSlot !== sorcererSlot) {
      minute += 1;
      const turned = finishTurn(
        state,
        `2026-08-24T08:${String(minute).padStart(2, "0")}:00.000Z`,
      );
      history.push(turned);
      state = turned.state;
    }

    // The sorcerer targets its own Wizard, violating the enemy relation
    // policy; the referee sentence must ride the committed event.
    const OVERRIDE =
      "The referee recorded an Override for this state-invalid ability choice.";
    const overridden = resolveAbility(
      state,
      {
        abilityId: "drow-sorcerer-arcane-bolt",
        targetCharacterIds: ["drow-wizard"],
        abilityOverride: OVERRIDE,
      },
      "2026-08-24T09:00:00.000Z",
    );
    expect(overridden.event).toMatchObject({
      actionType: "Ability",
      sourceCharacterId: "drow-sorcerer",
      targetCharacterIds: ["drow-wizard"],
      abilityOverride: OVERRIDE,
      majorActionOverride: null,
    });
    for (const record of history) {
      await firstStore.commit(record.event, record.state);
    }
    history.push(overridden);
    await firstStore.commit(overridden.event, overridden.state);

    const reopenedStore = new IndexedDbMatchStore(factory, databaseName);
    const restored = await reopenedStore.restore();
    if (!restored) throw new Error("The overridden history must restore.");
    // Restore validates every event canonically and replays the history
    // against the snapshot, so reaching this point already proves the
    // recorded sentence survives storage and exact replay.
    expect(restored.events.at(-1)).toEqual(overridden.event);
    const restoredResolution = restored.events.find(
      (event): event is ActionResolvedEvent =>
        event.type === "ActionResolved" && event.actionType === "Ability",
    );
    expect(restoredResolution?.abilityOverride).toBe(OVERRIDE);
    expect(restored.state.spentAbilityIds).toContain(
      "drow-sorcerer-arcane-bolt",
    );
    expect(
      restored.state.characters.find(
        ({ characterId }) => characterId === "drow-wizard",
      )?.hp,
    ).toBe(2);
  });
});
