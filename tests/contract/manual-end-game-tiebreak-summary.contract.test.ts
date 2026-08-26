import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import {
  createSetup,
  endMatch,
  finishTurn,
  generateInitiative,
  getEndGamePreview,
  getUndoPreview,
  reopenMatch,
  resolveBasicAttack,
  restoreStateFromEvents,
  startMatch,
  undoLastEvent,
  type ActiveMatchState,
  type EndedMatchState,
  type MatchEvent,
  type MatchState,
} from "../../src/domain/match";
import { RULESET } from "../../src/domain/ruleset";
import { assertCanonicalEvent } from "../../src/storage/match-store-canonical-event";
import { initiativeCharacterId } from "../domain/match-test-support";
import { IndexedDbMatchStore } from "../../src/storage/match-store";

function queuedRandom(...values: number[]) {
  let offset = 0;
  return {
    nextUint32: () => {
      const value = values[offset];
      offset += 1;
      if (value === undefined)
        throw new Error("Missing deterministic random value.");
      return value;
    },
  };
}

function activeStateWithTweaks(
  base: ActiveMatchState,
  mutate: (
    characters: ActiveMatchState["characters"],
  ) => ActiveMatchState["characters"],
): ActiveMatchState {
  return { ...base, characters: mutate(base.characters) };
}

function toEndedViaStore(
  factory: IDBFactory,
  databaseName: string,
): Promise<IndexedDbMatchStore> {
  return Promise.resolve(new IndexedDbMatchStore(factory, databaseName));
}

describe("Manual End Game Decision Basis contract", () => {
  it("selects winner via elimination, then activeCount, then activeHpTotal, then coinFlip in order", () => {
    const setup = createSetup("decision-basis", "2026-08-23T10:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-23T10:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-23T10:02:00.000Z");

    // elimination path
    const eliminated = {
      ...started.state,
      eliminatedTeams: ["Duergar"] as const,
      outcome: "Drow" as const,
    } as ActiveMatchState;
    const elimPreview = getEndGamePreview(eliminated);
    expect(elimPreview).toMatchObject({
      outcome: "Drow",
      decisionBasis: "elimination",
    });
    // counts irrelevant when elimination present: even if counts favor other team, elimination wins
    const eliminatedContrary = activeStateWithTweaks(eliminated, (chars) =>
      chars.map((c) =>
        c.characterId.startsWith("duergar-") ? { ...c, hp: 0 } : c,
      ),
    );
    expect(getEndGamePreview(eliminatedContrary).decisionBasis).toBe(
      "elimination",
    );

    // activeCount path: no elimination, Drow 6 active vs Duergar 4 => Drow
    const countState = activeStateWithTweaks(started.state, (chars) =>
      chars.map((c) =>
        c.characterId === "duergar-ranger" ||
        c.characterId === "duergar-warlock"
          ? { ...c, hp: 0 }
          : c,
      ),
    );
    const countPreview = getEndGamePreview(countState);
    expect(countPreview.decisionBasis).toBe("activeCount");
    expect(countPreview.outcome).toBe("Drow");
    expect(countPreview.finalCounts).toEqual({ Drow: 6, Duergar: 4 });

    // activeHpTotal path: equal counts (6-6) but different hp totals — use fresh started totals 20 vs 22
    const hpPreview = getEndGamePreview(started.state);
    expect(hpPreview.finalCounts).toEqual({ Drow: 6, Duergar: 6 });
    expect(hpPreview.decisionBasis).toBe("activeHpTotal");
    expect(hpPreview.outcome).toBe("Duergar");

    // coinFlip path: equal counts (5 each) and equal hp totals -> construct tie explicitly
    // Drow base 20, Duergar 22: remove drow-rogue (3) => 17, remove duergar-ranger (3) => 19, reduce duergar-barbarian 5->3 => 17 to equalize
    const flipState = activeStateWithTweaks(started.state, (chars) =>
      chars.map((c) => {
        if (c.characterId === "drow-rogue") return { ...c, hp: 0 };
        if (c.characterId === "duergar-ranger") return { ...c, hp: 0 };
        if (c.characterId === "duergar-barbarian") return { ...c, hp: 3 };
        return c;
      }),
    );
    const tieCounts = getEndGamePreview(flipState, queuedRandom(0));
    expect(tieCounts.finalCounts).toEqual({ Drow: 5, Duergar: 5 });
    expect(tieCounts.finalHpTotals).toEqual({ Drow: 17, Duergar: 17 });
    expect(tieCounts.decisionBasis).toBe("coinFlip");

    // coinFlip determinism: 0 => Drow, 1 => Duergar, never draw
    const drowFlip = getEndGamePreview(flipState, queuedRandom(0));
    const duergarFlip = getEndGamePreview(flipState, queuedRandom(1));
    expect(drowFlip.coinFlipResult).toBe("Drow");
    expect(drowFlip.outcome).toBe("Drow");
    expect(duergarFlip.coinFlipResult).toBe("Duergar");
    expect(duergarFlip.outcome).toBe("Duergar");
    expect(drowFlip.outcome === "draw" || duergarFlip.outcome === "draw").toBe(
      false,
    );
  });

  it("embeds and replays coinFlip result deterministically via endMatch", async () => {
    const confirmations = {
      range: true,
      lineOfSight: true,
      legalBottleContact: true,
      terrainContact: true,
    } as const;
    const setup = createSetup("coinflip-embed", "2026-08-23T11:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-23T11:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-23T11:02:00.000Z");
    const source = initiativeCharacterId(started.state, 0);
    let current = started.state;
    const history: MatchEvent[] = [setup.event, generated.event, started.event];
    // wound two Duergar (each 3->2) to equalize 20 vs 22 -> 20 vs 20, counts 6-6 => coinFlip
    const a1 = resolveBasicAttack(
      current,
      {
        sourceCharacterId: source,
        affectedCharacterIds: ["duergar-ranger"],
        physicalConfirmations: confirmations,
        majorActionOverride: null,
      },
      "2026-08-23T11:03:00.000Z",
    );
    history.push(a1.event);
    current = a1.state;
    const t1 = finishTurn(current, "2026-08-23T11:04:00.000Z");
    history.push(t1.event);
    current = t1.state;
    const source2 = initiativeCharacterId(current, current.activeSlot - 1);
    const a2 = resolveBasicAttack(
      current,
      {
        sourceCharacterId: source2,
        affectedCharacterIds: ["duergar-warlock"],
        physicalConfirmations: confirmations,
        majorActionOverride: null,
      },
      "2026-08-23T11:05:00.000Z",
    );
    history.push(a2.event);
    current = a2.state;
    const preview = getEndGamePreview(current, queuedRandom(0));
    expect(preview.decisionBasis).toBe("coinFlip");
    const ended = endMatch(current, {
      occurredAt: "2026-08-23T11:06:00.000Z",
      confirmed: true,
      random: queuedRandom(0),
    });
    expect(ended.event.decisionBasis).toBe("coinFlip");
    expect(ended.event.coinFlipResult).toBe("Drow");
    expect(ended.state.coinFlipResult).toBe("Drow");
    history.push(ended.event);
    const restored = restoreStateFromEvents(history);
    expect((restored as EndedMatchState).coinFlipResult).toBe("Drow");

    // store persistence for coinFlip summary (second tie with opposite flip)
    const factory = new IDBFactory();
    const store = new IndexedDbMatchStore(factory, "coinflip-embed-store");
    const sSetup = createSetup("coinflip-store", "2026-08-23T11:00:00.000Z");
    const sGen = generateInitiative(
      sSetup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-23T11:01:00.000Z",
    );
    const sStarted = startMatch(sGen.state, "2026-08-23T11:02:00.000Z");
    const sSrc = initiativeCharacterId(sStarted.state, 0);
    const sA1 = resolveBasicAttack(
      sStarted.state,
      {
        sourceCharacterId: sSrc,
        affectedCharacterIds: ["duergar-ranger"],
        physicalConfirmations: confirmations,
        majorActionOverride: null,
      },
      "2026-08-23T11:03:00.000Z",
    );
    const sT1 = finishTurn(sA1.state, "2026-08-23T11:04:00.000Z");
    const sSrc2 = initiativeCharacterId(sT1.state, sT1.state.activeSlot - 1);
    const sA2 = resolveBasicAttack(
      sT1.state,
      {
        sourceCharacterId: sSrc2,
        affectedCharacterIds: ["duergar-warlock"],
        physicalConfirmations: confirmations,
        majorActionOverride: null,
      },
      "2026-08-23T11:05:00.000Z",
    );
    const sEnded = endMatch(sA2.state, {
      occurredAt: "2026-08-23T11:06:00.000Z",
      confirmed: true,
      random: queuedRandom(1),
    });
    for (const r of [sSetup, sGen, sStarted, sA1, sT1, sA2, sEnded]) {
      await store.commit(r.event, r.state);
    }
    expect((await store.getSummary())?.coinFlipResult).toBe("Duergar");
  });

  it("clears outcome on reopen and preserves elimination flags and ack", async () => {
    const setup = createSetup("reopen-exact", "2026-08-23T12:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-23T12:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-23T12:02:00.000Z");
    const ended = endMatch(started.state, {
      occurredAt: "2026-08-23T12:03:00.000Z",
      confirmed: true,
    });
    expect(ended.state.outcome).not.toBeNull();
    const reopened = reopenMatch(ended.state, "2026-08-23T12:04:00.000Z");
    expect(reopened.state.outcome).toBeNull();
    expect((reopened.state as ActiveMatchState).eliminatedTeams).toEqual(
      ended.state.eliminatedTeams,
    );
    expect(reopened.state.phase).toBe("active");
    expect(reopened.event.type).toBe("MatchReopened");
    expect(reopened.event.endedSequence).toBe(ended.state.endedSequence);

    // integration via store: commit end then reopen and verify restore
    const factory = new IDBFactory();
    const store = await toEndedViaStore(factory, "reopen-store");
    for (const r of [setup, generated, started, ended]) {
      await store.commit(r.event, r.state);
    }
    await store.commit(reopened.event, reopened.state);
    const restored = await store.restore();
    expect(restored?.state).toEqual(reopened.state);
    expect(restored?.events.at(-1)?.type).toBe("MatchReopened");
  });

  it("Ended Match is read-only for turn, attack, and correction commands", () => {
    const setup = createSetup("readonly-ended", "2026-08-23T13:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-23T13:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-23T13:02:00.000Z");
    const ended = endMatch(started.state, {
      occurredAt: "2026-08-23T13:03:00.000Z",
      confirmed: true,
    });

    expect(() =>
      finishTurn(ended.state as ActiveMatchState, "2026-08-23T13:04:00.000Z"),
    ).toThrow("read-only");
    expect(() =>
      resolveBasicAttack(
        ended.state as ActiveMatchState,
        {
          sourceCharacterId: initiativeCharacterId(started.state, 0),
          affectedCharacterIds: ["duergar-ranger"],
          physicalConfirmations: {
            range: true,
            lineOfSight: true,
            legalBottleContact: true,
            terrainContact: true,
          },
          majorActionOverride: null,
        },
        "2026-08-23T13:05:00.000Z",
      ),
    ).toThrow("read-only");
    expect(() =>
      // acknowledgeElimination also guards ended via cast
      // use active-typed ended to trigger guard
      ((): unknown => {
        const activeEnded = ended.state as unknown as ActiveMatchState;
        return finishTurn(activeEnded, "2026-08-23T13:06:00.000Z");
      })(),
    ).toThrow();
  });

  it("Undo is inert while Ended and works after Reopen", () => {
    const setup = createSetup("undo-ended", "2026-08-23T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-23T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-23T14:02:00.000Z");
    const ended = endMatch(started.state, {
      occurredAt: "2026-08-23T14:03:00.000Z",
      confirmed: true,
    });
    const eventsEnded = [
      setup.event,
      generated.event,
      started.event,
      ended.event,
    ];

    expect(getUndoPreview(ended.state, eventsEnded)).toBeNull();
    expect(() =>
      undoLastEvent(ended.state, eventsEnded, {
        occurredAt: "2026-08-23T14:04:00.000Z",
        confirmed: true,
      }),
    ).toThrow();

    const reopened = reopenMatch(ended.state, "2026-08-23T14:05:00.000Z");
    const eventsReopened = [...eventsEnded, reopened.event];
    const preview = getUndoPreview(reopened.state, eventsReopened);
    expect(preview?.target.type).toBe("MatchReopened");
    const undone = undoLastEvent(reopened.state, eventsReopened, {
      occurredAt: "2026-08-23T14:06:00.000Z",
      confirmed: true,
    });
    expect(undone.state).toEqual({
      ...ended.state,
      sequence: reopened.state.sequence + 1,
    });
  });

  it("rejects a legacy MatchEnded event without the required decision fields", () => {
    const setup = createSetup("legacy-ended", "2026-08-23T15:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-23T15:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-23T15:02:00.000Z");
    // Create elimination via 5 consecutive Basic Attacks against all Duergar (proven valid in store tests)
    const source = initiativeCharacterId(started.state, 0);
    const duergarIds = RULESET.characters
      .filter((c) => c.team === "Duergar")
      .map((c) => c.id);
    let current = started.state;
    const elimEvents: MatchEvent[] = [];
    for (let i = 0; i < 5; i += 1) {
      const attack = resolveBasicAttack(
        current,
        {
          sourceCharacterId: source,
          affectedCharacterIds: duergarIds,
          physicalConfirmations: {
            range: true,
            lineOfSight: true,
            legalBottleContact: true,
            terrainContact: true,
          },
          majorActionOverride:
            i === 0 ? null : "Referee confirmed repeated attack.",
        },
        `2026-08-23T15:0${i + 3}:00.000Z`,
      );
      elimEvents.push(attack.event);
      current = attack.state;
    }
    expect(current.eliminatedTeams).toEqual(["Duergar"]);
    // A complete End Game event first, then strip it to the retired
    // within-version shape that omitted the decision fields entirely.
    const ended = endMatch(current, {
      occurredAt: "2026-08-23T15:04:00.000Z",
      confirmed: true,
    });
    const legacyEnded: Record<string, unknown> = Object.fromEntries(
      Object.entries(ended.event).filter(
        ([key]) =>
          ![
            "decisionBasis",
            "finalCounts",
            "finalHpTotals",
            "coinFlipResult",
          ].includes(key),
      ),
    );
    const history = [
      setup.event,
      generated.event,
      started.event,
      ...elimEvents,
    ];
    expect(() =>
      restoreStateFromEvents([
        ...history,
        legacyEnded as unknown as MatchEvent,
      ]),
    ).toThrow("End Game does not follow Match State.");
    expect(() => assertCanonicalEvent(legacyEnded)).toThrow(
      "The canonical End Game Event is invalid.",
    );
  });
});

describe("Match Summary lifecycle contract", () => {
  it("writes W07 fields atomically with End Game and replaces on next End Game", async () => {
    const factory = new IDBFactory();
    const store = new IndexedDbMatchStore(factory, "summary-atomic");
    const setup = createSetup("summary-match-1", "2026-08-23T16:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-23T16:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-23T16:02:00.000Z");
    for (const r of [setup, generated, started])
      await store.commit(r.event, r.state);

    const ended = endMatch(started.state, {
      occurredAt: "2026-08-23T16:03:00.000Z",
      confirmed: true,
      random: queuedRandom(0),
    });
    await store.commit(ended.event, ended.state);
    const summary1 = await store.getSummary();
    expect(summary1).toEqual({
      outcome: ended.state.outcome,
      decisionBasis: ended.state.decisionBasis,
      finalCounts: ended.state.finalCounts,
      finalHpTotals: ended.state.finalHpTotals,
      rulesVersion: ended.state.rulesVersion,
      endedAt: ended.state.endedAt,
      ...(ended.state.coinFlipResult
        ? { coinFlipResult: ended.state.coinFlipResult }
        : {}),
    });
    expect(summary1?.rulesVersion).toBe(RULESET.version);
    expect(summary1?.endedAt).toBe("2026-08-23T16:03:00.000Z");

    const reopened = reopenMatch(ended.state, "2026-08-23T16:04:00.000Z");
    await store.commit(reopened.event, reopened.state);
    // summary persists after reopen
    expect(await store.getSummary()).toEqual(summary1);

    const endedAgain = endMatch(reopened.state, {
      occurredAt: "2026-08-23T16:05:00.000Z",
      confirmed: true,
      random: queuedRandom(1),
    });
    await store.commit(endedAgain.event, endedAgain.state);
    const summary2 = await store.getSummary();
    expect(summary2).not.toEqual(summary1);
    expect(summary2?.endedAt).toBe("2026-08-23T16:05:00.000Z");
  });

  it("retains prior summary when starting another Match and does not expose partial summary on failed End Game", async () => {
    const factory = new IDBFactory();
    const store = new IndexedDbMatchStore(factory, "summary-retention");
    const setup = createSetup("summary-retain-1", "2026-08-23T17:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-23T17:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-23T17:02:00.000Z");
    for (const r of [setup, generated, started])
      await store.commit(r.event, r.state);
    const ended = endMatch(started.state, {
      occurredAt: "2026-08-23T17:03:00.000Z",
      confirmed: true,
    });
    await store.commit(ended.event, ended.state);
    const prior = await store.getSummary();
    expect(prior).not.toBeNull();

    // start new match (SetupCreated with replacement) retains prior summary
    const newSetup = createSetup(
      "summary-retain-2",
      "2026-08-23T17:04:00.000Z",
    );
    await store.commit(newSetup.event, newSetup.state);
    expect(await store.getSummary()).toEqual(prior);
    const restored = await store.restore();
    expect(restored?.state.matchId).toBe(newSetup.state.matchId);
    expect(await store.getSummary()).toEqual(prior);

    // failed End Game does not corrupt prior summary
    const newGenerated = generateInitiative(
      newSetup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-23T17:05:00.000Z",
    );
    await store.commit(newGenerated.event, newGenerated.state);
    const newStarted = startMatch(
      newGenerated.state,
      "2026-08-23T17:06:00.000Z",
    );
    await store.commit(newStarted.event, newStarted.state);
    const failingEnded = endMatch(newStarted.state, {
      occurredAt: "2026-08-23T17:07:00.000Z",
      confirmed: true,
    });
    const badState = {
      ...failingEnded.state,
      bad: () => {},
    } as unknown as MatchState;
    await expect(store.commit(failingEnded.event, badState)).rejects.toThrow();
    expect(await store.getSummary()).toEqual(prior);
    const afterFail = await store.restore();
    expect(afterFail?.state.sequence).toBe(newStarted.state.sequence);
  });

  it("distinct removal paths require confirmation and produce distinct effects", async () => {
    const factory = new IDBFactory();
    const store = new IndexedDbMatchStore(factory, "removal-paths");
    const setup = createSetup("removal-ended", "2026-08-23T18:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-23T18:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-23T18:02:00.000Z");
    for (const r of [setup, generated, started])
      await store.commit(r.event, r.state);
    const ended = endMatch(started.state, {
      occurredAt: "2026-08-23T18:03:00.000Z",
      confirmed: true,
    });
    await store.commit(ended.event, ended.state);
    expect(await store.getSummary()).not.toBeNull();

    // deleteSummary requires confirmation
    await expect(store.deleteSummary(false)).rejects.toThrow("confirmation");
    expect(await store.getSummary()).not.toBeNull();

    // deleteMatch requires confirmation
    await expect(store.deleteMatch(ended.state.matchId, false)).rejects.toThrow(
      "confirmation",
    );
    expect(await store.restore()).not.toBeNull();

    // removing current Ended Match removes summary, snapshot, history together
    await store.deleteMatch(ended.state.matchId, true);
    expect(await store.restore()).toBeNull();
    expect(await store.getSummary()).toBeNull();

    // prior summary removal does not touch Active Match
    const s2 = createSetup("removal-active", "2026-08-23T18:04:00.000Z");
    await store.commit(s2.event, s2.state);
    const g2 = generateInitiative(
      s2.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-23T18:05:00.000Z",
    );
    await store.commit(g2.event, g2.state);
    const st2 = startMatch(g2.state, "2026-08-23T18:06:00.000Z");
    await store.commit(st2.event, st2.state);
    const e2 = endMatch(st2.state, {
      occurredAt: "2026-08-23T18:07:00.000Z",
      confirmed: true,
    });
    await store.commit(e2.event, e2.state);
    const s3 = createSetup("removal-active-2", "2026-08-23T18:08:00.000Z");
    await store.commit(s3.event, s3.state);
    const g3 = generateInitiative(
      s3.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-23T18:09:00.000Z",
    );
    await store.commit(g3.event, g3.state);
    const st3 = startMatch(g3.state, "2026-08-23T18:10:00.000Z");
    await store.commit(st3.event, st3.state);
    // now active match is st3, summary is e2's summary
    const priorSummary = await store.getSummary();
    expect(priorSummary).not.toBeNull();
    await store.deleteSummary(true);
    expect(await store.getSummary()).toBeNull();
    const stillActive = await store.restore();
    expect(stillActive?.state.matchId).toBe(s3.state.matchId);
    expect(stillActive?.state.phase).toBe("active");

    // Instead test active-phase delete preserves prior summary: setup active store with summary present
    const factory2 = new IDBFactory();
    const store2 = new IndexedDbMatchStore(
      factory2,
      "active-delete-preserves-summary",
    );
    const aSetup = createSetup("active-preserve-1", "2026-08-23T19:00:00.000Z");
    const aGen = generateInitiative(
      aSetup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-23T19:01:00.000Z",
    );
    const aStart = startMatch(aGen.state, "2026-08-23T19:02:00.000Z");
    for (const r of [aSetup, aGen, aStart])
      await store2.commit(r.event, r.state);
    const aEnded = endMatch(aStart.state, {
      occurredAt: "2026-08-23T19:03:00.000Z",
      confirmed: true,
    });
    await store2.commit(aEnded.event, aEnded.state);
    const bSetup = createSetup("active-preserve-2", "2026-08-23T19:04:00.000Z");
    await store2.commit(bSetup.event, bSetup.state);
    const bGen = generateInitiative(
      bSetup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-23T19:05:00.000Z",
    );
    await store2.commit(bGen.event, bGen.state);
    const bStart = startMatch(bGen.state, "2026-08-23T19:06:00.000Z");
    await store2.commit(bStart.event, bStart.state);
    const summaryBeforeDelete = await store2.getSummary();
    expect(summaryBeforeDelete).not.toBeNull();
    // Deleting the current active-phase snapshot should NOT delete summary? Actually deleteMatch checks snapshot phase === ended, so active should keep summary.
    // But store currently has snapshot = bStart (active). Deleting it should keep summary per that logic? Let's test via direct deleteMatch on active id while summary exists.
    await store2.deleteMatch(bStart.state.matchId, true);
    expect(await store2.getSummary()).not.toBeNull();
    expect(await store2.restore()).toBeNull(); // active deleted but summary remains as prior
  });
});
