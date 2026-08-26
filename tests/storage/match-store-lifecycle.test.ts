import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import {
  acknowledgeElimination,
  createSetup,
  endMatch,
  finishTurn,
  generateInitiative,
  reopenMatch,
  resolveBasicAttack,
  ruleSimultaneousElimination,
  startMatch,
  undoLastEvent,
  type MatchEvent,
  type MatchState,
  type ActiveMatchState,
} from "../../src/domain/match";
import { IndexedDbMatchStore } from "../../src/storage/match-store";
import { initiativeCharacterId } from "../domain/match-test-support";
import {
  randomQueue,
  simultaneousEliminationRun,
} from "./match-store.test-helpers";

describe("IndexedDbMatchStore", () => {
  it("needs confirmation and then removes the Match and all history", async () => {
    const store = new IndexedDbMatchStore(new IDBFactory(), "delete-match");
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    await store.commit(setup.event, setup.state);

    await expect(store.deleteMatch("match-1", false)).rejects.toThrow(
      "Discard confirmation is required.",
    );
    await expect(store.restore()).resolves.not.toBeNull();

    await store.deleteMatch("match-1", true);
    await expect(store.restore()).resolves.toBeNull();
  });

  it("atomically commits and restores the exact Active Match", async () => {
    const store = new IndexedDbMatchStore(new IDBFactory(), "restore-active");
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const advanced = finishTurn(started.state, "2026-08-22T14:03:00.000Z");

    for (const result of [setup, generated, started, advanced]) {
      await store.commit(result.event, result.state);
    }

    await expect(store.restore()).resolves.toEqual({
      state: advanced.state,
      events: [setup.event, generated.event, started.event, advanced.event],
      summary: null,
    });
  });

  it("restores Continue, End Game, Reopen, Undo, and confirmed Ended Match removal exactly", async () => {
    const factory = new IDBFactory();
    const store = new IndexedDbMatchStore(factory, "elimination-lifecycle");
    const setup = createSetup("match-elimination", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const initialResults: ReadonlyArray<{
      readonly event: MatchEvent;
      readonly state: MatchState;
    }> = [setup, generated, started];
    const { results, current } = Array.from(
      { length: 5 },
      (_, attackIndex) => attackIndex,
    ).reduce<{
      readonly results: ReadonlyArray<{
        readonly event: MatchEvent;
        readonly state: MatchState;
      }>;
      readonly current: ActiveMatchState;
    }>(
      (progress, attackIndex) => {
        const attack = resolveBasicAttack(
          progress.current,
          {
            sourceCharacterId: initiativeCharacterId(started.state, 0),
            affectedCharacterIds: started.state.characters
              .filter(({ characterId }) => characterId.startsWith("duergar-"))
              .map(({ characterId }) => characterId),
            physicalConfirmations: {
              range: true,
              lineOfSight: true,
              legalBottleContact: true,
              terrainContact: true,
            },
            majorActionOverride:
              attackIndex === 0 ? null : "Referee confirmed repeated attack.",
          },
          `2026-08-22T14:0${String(attackIndex + 3)}:00.000Z`,
        );
        return {
          results: [...progress.results, attack],
          current: attack.state,
        };
      },
      { results: initialResults, current: started.state },
    );
    for (const result of results)
      await store.commit(result.event, result.state);

    const continued = acknowledgeElimination(
      current,
      "Duergar",
      "2026-08-22T14:08:00.000Z",
    );
    await store.commit(continued.event, continued.state);
    await expect(store.restore()).resolves.toEqual({
      state: continued.state,
      events: [...results.map(({ event }) => event), continued.event],
      summary: null,
    });
    const undone = undoLastEvent(
      continued.state,
      [...results.map(({ event }) => event), continued.event],
      { occurredAt: "2026-08-22T14:09:00.000Z", confirmed: true },
    );
    await store.commit(undone.event, undone.state);
    const ended = endMatch(undone.state as typeof current, {
      occurredAt: "2026-08-22T14:10:00.000Z",
      confirmed: true,
    });
    await store.commit(ended.event, ended.state);
    const reopened = reopenMatch(ended.state, "2026-08-22T14:11:00.000Z");
    await store.commit(reopened.event, reopened.state);
    const endedAgain = endMatch(reopened.state, {
      occurredAt: "2026-08-22T14:12:00.000Z",
      confirmed: true,
    });
    await store.commit(endedAgain.event, endedAgain.state);
    await expect(store.restore()).resolves.toEqual({
      state: endedAgain.state,
      events: [
        ...results.map(({ event }) => event),
        continued.event,
        undone.event,
        ended.event,
        reopened.event,
        endedAgain.event,
      ],
      summary: expect.objectContaining({
        outcome: "Drow",
        decisionBasis: "elimination",
      }) as unknown,
    });
    await store.deleteMatch(endedAgain.state.matchId, true);
    await expect(store.restore()).resolves.toBeNull();
  });

  it.each(["Drow", "Duergar", "draw"] as const)(
    "atomically restores a %s simultaneous ruling, End Game, Reopen, and Undo",
    async (outcome) => {
      const factory = new IDBFactory();
      const store = new IndexedDbMatchStore(factory, `simultaneous-${outcome}`);
      const { results, finalState } = simultaneousEliminationRun(
        `match-simultaneous-${outcome}`,
      );
      for (const result of results)
        await store.commit(result.event, result.state);
      expect(finalState).toMatchObject({
        eliminatedTeams: ["Drow", "Duergar"],
        outcome: null,
      });

      const ruled = ruleSimultaneousElimination(finalState, outcome, {
        overrideEvidence:
          "The authoritative rules do not define simultaneous Team Elimination; the referee selected this override.",
        occurredAt: "2026-08-22T14:20:00.000Z",
      });
      await store.commit(ruled.event, ruled.state);
      await expect(store.restore()).resolves.toEqual({
        state: ruled.state,
        events: [...results.map(({ event }) => event), ruled.event],
        summary: null,
      });

      const ended = endMatch(ruled.state, {
        occurredAt: "2026-08-22T14:09:00.000Z",
        confirmed: true,
      });
      await store.commit(ended.event, ended.state);
      const reopened = reopenMatch(ended.state, "2026-08-22T14:10:00.000Z");
      await store.commit(reopened.event, reopened.state);
      const history = [
        ...results.map(({ event }) => event),
        ruled.event,
        ended.event,
        reopened.event,
      ];
      const undone = undoLastEvent(reopened.state, history, {
        occurredAt: "2026-08-22T14:11:00.000Z",
        confirmed: true,
      });
      await store.commit(undone.event, undone.state);
      await expect(store.restore()).resolves.toEqual({
        state: undone.state,
        events: [...history, undone.event],
        summary: expect.objectContaining({
          outcome,
          decisionBasis: "elimination",
        }) as unknown,
      });
    },
  );

  it("keeps the unresolved simultaneous result when ruling storage fails", async () => {
    const store = new IndexedDbMatchStore(
      new IDBFactory(),
      "failed-simultaneous-ruling",
    );
    const { results, finalState: current } = simultaneousEliminationRun(
      "match-failed-simultaneous",
    );
    expect(current).toMatchObject({
      eliminatedTeams: ["Drow", "Duergar"],
      outcome: null,
    });
    for (const result of results)
      await store.commit(result.event, result.state);
    const ruled = ruleSimultaneousElimination(current, "draw", {
      overrideEvidence:
        "The referee selected draw because the rules do not define this outcome.",
      occurredAt: "2026-08-22T14:04:00.000Z",
    });
    const interruptedState = {
      ...ruled.state,
      interruptedWrite: () => undefined,
    };

    await expect(store.commit(ruled.event, interruptedState)).rejects.toThrow();
    await expect(store.restore()).resolves.toEqual({
      state: current,
      events: results.map(({ event }) => event),
      summary: null,
    });
  });

  it("keeps the last committed Active Match when Finish Turn fails", async () => {
    const store = new IndexedDbMatchStore(new IDBFactory(), "failed-finish");
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    for (const result of [setup, generated, started]) {
      await store.commit(result.event, result.state);
    }
    const advanced = finishTurn(started.state, "2026-08-22T14:03:00.000Z");

    const interruptedState = {
      ...advanced.state,
      interruptedWrite: () => undefined,
    };
    await expect(
      store.commit(advanced.event, interruptedState),
    ).rejects.toThrow();
    await expect(store.restore()).resolves.toEqual({
      state: started.state,
      events: [setup.event, generated.event, started.event],
      summary: null,
    });
  });

  it("atomically appends Undo history and restores its exact snapshot", async () => {
    const factory = new IDBFactory();
    const store = new IndexedDbMatchStore(factory, "restore-undo");
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const history = [setup.event, generated.event, started.event];
    for (const result of [setup, generated, started]) {
      await store.commit(result.event, result.state);
    }
    const undone = undoLastEvent(started.state, history, {
      occurredAt: "2026-08-22T14:03:00.000Z",
      confirmed: true,
    });

    await store.commit(undone.event, undone.state);

    const restarted = new IndexedDbMatchStore(factory, "restore-undo");
    await expect(restarted.restore()).resolves.toEqual({
      state: undone.state,
      events: [...history, undone.event],
      summary: null,
    });
  });

  it("keeps the last committed Match when the Undo transaction fails", async () => {
    const store = new IndexedDbMatchStore(new IDBFactory(), "failed-undo");
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
      "2026-08-22T14:01:00.000Z",
    );
    const history = [setup.event, generated.event];
    for (const result of [setup, generated]) {
      await store.commit(result.event, result.state);
    }
    const undone = undoLastEvent(generated.state, history, {
      occurredAt: "2026-08-22T14:02:00.000Z",
      confirmed: true,
    });
    const uncloneableEvent = {
      ...undone.event,
      interruptedWrite: () => undefined,
    };

    await expect(
      store.commit(uncloneableEvent, undone.state),
    ).rejects.toThrow();
    await expect(store.restore()).resolves.toEqual({
      state: generated.state,
      events: history,
      summary: null,
    });
  });
});
