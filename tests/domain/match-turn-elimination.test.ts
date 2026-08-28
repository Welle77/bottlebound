import { describe, expect, it } from "vitest";

import {
  acknowledgeElimination,
  createSetup,
  endMatch,
  finishTurn,
  generateInitiative,
  reopenMatch,
  resolveBasicAttack,
  restoreStateFromEvents,
  ruleSimultaneousElimination,
  startMatch,
  type CharacterId,
  undoLastEvent,
  type ActiveMatchState,
  type MatchEvent,
} from "../../src/domain/match";
import { MATCH_CONFIGURATION } from "../../src/domain/match-configuration";
import {
  initiativeCharacterId,
  queuedRandom,
  simultaneousEliminationRun,
} from "./match-test-support";

describe("Active Match commands", () => {
  it("needs a complete initiative order and starts Round 1 at slot 1", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");

    expect(() => startMatch(setup.state, "2026-08-22T14:01:00.000Z")).toThrow(
      "A complete 12-slot initiative result is required.",
    );

    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const firstEntry = generated.state.initiative?.[0];
    if (!firstEntry) {
      throw new Error("The test expected complete initiative.");
    }
    const initiative = generated.state.initiative;
    expect(() =>
      startMatch(
        {
          ...generated.state,
          initiative: initiative.map((entry, index) =>
            index === 1 ? { ...firstEntry, slot: 2 } : entry,
          ),
        },
        "2026-08-22T14:02:00.000Z",
      ),
    ).toThrow("A complete 12-slot initiative result is required.");

    const result = startMatch(generated.state, "2026-08-22T14:02:00.000Z");

    expect(result.state).toMatchObject({
      phase: "active",
      sequence: 3,
      round: 1,
      activeSlot: 1,
    });
    expect(result.event).toMatchObject({
      type: "MatchStarted",
      sequence: 3,
      round: 1,
      activeSlot: 1,
    });
  });

  it("advances one fixed slot and increments the round once after slot 12", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const statesAfterTurns = Array.from(
      { length: 11 },
      (_, step) => step,
    ).reduce<readonly ActiveMatchState[]>(
      (states, step) => {
        const expectedSlot = step + 2;
        const previousState = states.at(-1);
        if (previousState === undefined) {
          throw new Error("The test turn sequence is empty.");
        }
        const result = finishTurn(
          previousState,
          `2026-08-22T14:${String(expectedSlot + 1).padStart(2, "0")}:00.000Z`,
        );
        expect(result.state).toMatchObject({
          round: 1,
          activeSlot: expectedSlot,
        });
        expect(result.event).toMatchObject({
          type: "TurnFinished",
          fromRound: 1,
          fromSlot: expectedSlot - 1,
          round: 1,
          activeSlot: expectedSlot,
        });
        return [...states, result.state];
      },
      [startMatch(generated.state, "2026-08-22T14:02:00.000Z").state],
    );
    const currentState = statesAfterTurns.at(-1);
    if (currentState === undefined) {
      throw new Error("The test turn sequence produced no states.");
    }

    const wrapped = finishTurn(currentState, "2026-08-22T14:14:00.000Z");
    expect(wrapped.state).toMatchObject({ round: 2, activeSlot: 1 });
    expect(wrapped.event).toMatchObject({
      type: "TurnFinished",
      fromRound: 1,
      fromSlot: 12,
      round: 2,
      activeSlot: 1,
    });
  });

  it("keeps a newly Downed active character until Finish Turn skips Downed slots and wraps", () => {
    const setup = createSetup("match-skip", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const activeId = initiativeCharacterId(started.state, 0);
    const downed = {
      ...started.state,
      activeSlot: 11,
      majorActionUsed: true,
      characters: started.state.characters.map((character) =>
        [
          initiativeCharacterId(started.state, 10),
          initiativeCharacterId(started.state, 11),
          initiativeCharacterId(started.state, 0),
        ].includes(character.characterId)
          ? { ...character, hp: 0 }
          : character,
      ),
    };

    expect(
      resolveBasicAttack(
        {
          ...started.state,
          characters: started.state.characters.map((character) =>
            character.characterId === activeId
              ? { ...character, hp: 1 }
              : character,
          ),
        },
        {
          sourceCharacterId: activeId,
          affectedCharacterIds: [activeId],
          physicalConfirmations: {
            range: true,
            lineOfSight: true,
            legalBottleContact: true,
            terrainContact: true,
          },
          majorActionOverride: null,
        },
        "2026-08-22T14:03:00.000Z",
      ).state,
    ).toMatchObject({ activeSlot: 1 });

    const advanced = finishTurn(downed, "2026-08-22T14:04:00.000Z");
    expect(advanced.state).toMatchObject({
      round: 2,
      activeSlot: 2,
      majorActionUsed: false,
    });
    expect(advanced.event).toMatchObject({
      fromRound: 1,
      fromSlot: 11,
      round: 2,
      activeSlot: 2,
      skippedSlots: [12, 1],
    });
  });

  it("records normal Team Elimination and supports Continue, End Game, and Reopen", () => {
    const setup = createSetup("match-elimination", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const sourceCharacterId = initiativeCharacterId(started.state, 0);
    const nearlyEliminated = {
      ...started.state,
      characters: started.state.characters.map((character) =>
        character.characterId.startsWith("duergar-")
          ? {
              ...character,
              hp: character.characterId === "duergar-ranger" ? 1 : 0,
            }
          : character,
      ),
    };
    const attack = resolveBasicAttack(
      nearlyEliminated,
      {
        sourceCharacterId,
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

    expect(attack.state).toMatchObject({
      eliminatedTeams: ["Duergar"],
      outcome: "Drow",
      phase: "active",
    });
    const continued = acknowledgeElimination(
      attack.state,
      "Duergar",
      "2026-08-22T14:04:00.000Z",
    );
    expect(continued.state).toMatchObject({
      phase: "active",
      acknowledgedEliminations: ["Duergar"],
      eliminatedTeams: ["Duergar"],
      outcome: "Drow",
    });
    expect(continued.event).toMatchObject({
      type: "EliminationContinued",
      eliminatedTeam: "Duergar",
      outcome: "Drow",
    });

    const ended = endMatch(attack.state, {
      occurredAt: "2026-08-22T14:05:00.000Z",
      confirmed: true,
    });
    expect(ended.state).toMatchObject({
      phase: "ended",
      outcome: "Drow",
      endedAt: "2026-08-22T14:05:00.000Z",
    });
    const reopened = reopenMatch(ended.state, "2026-08-22T14:06:00.000Z");
    expect(reopened.state).toEqual({
      ...attack.state,
      sequence: 6,
      outcome: null,
    });
    expect(reopened.event).toMatchObject({
      type: "MatchReopened",
      endedSequence: 5,
    });
  });

  it("replays and repeatedly undoes elimination acknowledgement and reopening exactly", () => {
    const setup = createSetup(
      "match-elimination-replay",
      "2026-08-22T14:00:00.000Z",
    );
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const sourceCharacterId = initiativeCharacterId(started.state, 0);
    const baseHistory: readonly MatchEvent[] = [
      setup.event,
      generated.event,
      started.event,
    ];
    const afterAttacks = Array.from(
      { length: 5 },
      (_, attackIndex) => attackIndex,
    ).reduce<{
      readonly history: readonly MatchEvent[];
      readonly current: ActiveMatchState;
    }>(
      (progress, attackIndex) => {
        const attack = resolveBasicAttack(
          progress.current,
          {
            sourceCharacterId,
            affectedCharacterIds: MATCH_CONFIGURATION.characters
              .filter(({ team }) => team === "Duergar")
              .map(({ id }) => id),
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
          history: [...progress.history, attack.event],
          current: attack.state,
        };
      },
      { history: baseHistory, current: started.state },
    );
    const current = afterAttacks.current;
    expect(current).toMatchObject({
      eliminatedTeams: ["Duergar"],
      outcome: "Drow",
    });

    const continued = acknowledgeElimination(
      current,
      "Duergar",
      "2026-08-22T14:08:00.000Z",
    );
    const historyAfterContinued = [...afterAttacks.history, continued.event];
    expect(restoreStateFromEvents(historyAfterContinued)).toEqual(
      continued.state,
    );
    const undoContinue = undoLastEvent(continued.state, historyAfterContinued, {
      occurredAt: "2026-08-22T14:09:00.000Z",
      confirmed: true,
    });
    const historyAfterUndoContinue = [
      ...historyAfterContinued,
      undoContinue.event,
    ];
    expect(undoContinue.state).toEqual({ ...current, sequence: 10 });

    const ended = endMatch(undoContinue.state as typeof current, {
      occurredAt: "2026-08-22T14:10:00.000Z",
      confirmed: true,
    });
    const historyAfterEnded = [...historyAfterUndoContinue, ended.event];
    const reopened = reopenMatch(ended.state, "2026-08-22T14:11:00.000Z");
    const history = [...historyAfterEnded, reopened.event];
    expect(restoreStateFromEvents(history)).toEqual(reopened.state);
    const undoReopen = undoLastEvent(reopened.state, history, {
      occurredAt: "2026-08-22T14:12:00.000Z",
      confirmed: true,
    });
    expect(undoReopen.state).toEqual({ ...ended.state, sequence: 13 });
  });

  it("records simultaneous elimination without using contact order as a tiebreak", () => {
    const setup = createSetup(
      "match-simultaneous-elimination",
      "2026-08-22T14:00:00.000Z",
    );
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const sourceCharacterId = initiativeCharacterId(started.state, 0);
    const finalCharacters: readonly CharacterId[] = [
      "drow-paladin",
      "duergar-ranger",
    ];
    const nearlyEliminated = {
      ...started.state,
      characters: started.state.characters.map((character) => ({
        ...character,
        hp:
          character.characterId === sourceCharacterId ||
          finalCharacters.includes(character.characterId)
            ? 1
            : 0,
      })),
    };

    const drowFirst = resolveBasicAttack(
      nearlyEliminated,
      {
        sourceCharacterId,
        affectedCharacterIds: [...finalCharacters, sourceCharacterId],
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
    const duergarFirst = resolveBasicAttack(
      nearlyEliminated,
      {
        sourceCharacterId,
        affectedCharacterIds: [
          sourceCharacterId,
          ...[...finalCharacters].reverse(),
        ],
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

    expect(drowFirst.state).toMatchObject({
      eliminatedTeams: ["Drow", "Duergar"],
      outcome: null,
    });
    expect(duergarFirst.state).toMatchObject({
      eliminatedTeams: ["Drow", "Duergar"],
      outcome: null,
    });
    expect(drowFirst.event.eliminatedTeams).toEqual(["Drow", "Duergar"]);
    expect(duergarFirst.event.eliminatedTeams).toEqual(["Drow", "Duergar"]);
    expect(() =>
      endMatch(drowFirst.state, {
        occurredAt: "2026-08-22T14:04:00.000Z",
        confirmed: true,
      }),
    ).toThrow("resolved Team Elimination");
    expect(() =>
      acknowledgeElimination(
        drowFirst.state,
        "Drow",
        "2026-08-22T14:04:00.000Z",
      ),
    ).toThrow("one normal Team Elimination");
  });

  it.each(["Drow", "Duergar", "draw"] as const)(
    "records a %s simultaneous-elimination ruling and restores it exactly",
    (outcome) => {
      const { steps, finalState } = simultaneousEliminationRun(
        `match-simultaneous-${outcome}`,
      );
      expect(finalState).toMatchObject({
        eliminatedTeams: ["Drow", "Duergar"],
        outcome: null,
      });
      const evidence =
        "The authoritative rules do not define simultaneous Team Elimination; the referee selected the recorded result.";
      const ruled = ruleSimultaneousElimination(finalState, outcome, {
        overrideEvidence: evidence,
        occurredAt: "2026-08-22T14:20:00.000Z",
      });

      expect(ruled.state).toMatchObject({
        eliminatedTeams: ["Drow", "Duergar"],
        outcome,
      });
      expect(ruled.event).toMatchObject({
        type: "SimultaneousEliminationRuled",
        eliminatedTeams: ["Drow", "Duergar"],
        outcome,
        overrideEvidence: evidence,
      });
      const ended = endMatch(ruled.state, {
        occurredAt: "2026-08-22T14:21:00.000Z",
        confirmed: true,
      });
      expect(ended.state).toMatchObject({
        phase: "ended",
        eliminatedTeams: ["Drow", "Duergar"],
        outcome,
      });
      expect(
        reopenMatch(ended.state, "2026-08-22T14:22:00.000Z").state,
      ).toEqual({
        ...ruled.state,
        sequence: ended.state.sequence + 1,
        outcome: null,
      });

      const history: readonly MatchEvent[] = [
        ...steps.map(({ event }) => event),
        ruled.event,
      ];
      expect(restoreStateFromEvents(history)).toEqual(ruled.state);
      const undoRuling = undoLastEvent(ruled.state, history, {
        occurredAt: "2026-08-22T14:23:00.000Z",
        confirmed: true,
      });
      const historyAfterUndoRuling = [...history, undoRuling.event];
      expect(undoRuling.state).toEqual({
        ...finalState,
        sequence: ruled.state.sequence + 1,
      });
      const undoAttack = undoLastEvent(
        undoRuling.state,
        historyAfterUndoRuling,
        {
          occurredAt: "2026-08-22T14:24:00.000Z",
          confirmed: true,
        },
      );
      expect(undoAttack.state).toMatchObject({
        phase: "active",
        eliminatedTeams: [],
        outcome: null,
      });
    },
  );
});
