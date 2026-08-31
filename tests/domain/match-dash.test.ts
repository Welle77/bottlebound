import { describe, expect, it } from "vitest";

import {
  createSetup,
  dash,
  endMatch,
  finishTurn,
  generateInitiative,
  reopenMatch,
  resolveBasicAttack,
  restoreStateFromEvents,
  startMatch,
  undoLastEvent,
} from "../../src/domain/match";
import { queuedRandom } from "./match-test-support";

describe("Dash", () => {
  it("spends the active character's full movement and normal action", () => {
    const setup = createSetup("dash-match", "2026-08-31T07:32:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-31T07:33:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-31T07:34:00.000Z");
    const sourceCharacterId = started.state.initiative[0]?.characterId;
    if (!sourceCharacterId)
      throw new Error("The Match needs an active character.");

    const dashed = dash(
      started.state,
      sourceCharacterId,
      "2026-08-31T07:35:00.000Z",
    );

    expect(dashed.state).toMatchObject({
      remainingMovementPaces: 0,
      majorActionUsed: true,
    });
    expect(dashed.event).toMatchObject({
      type: "Dashed",
      sourceCharacterId,
      movementPaces: 2,
      remainingMovementPaces: 0,
    });
    expect(() =>
      resolveBasicAttack(
        dashed.state,
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
        "2026-08-31T07:36:00.000Z",
      ),
    ).toThrow("A second Basic Attack needs a recorded referee override.");

    expect(
      finishTurn(dashed.state, "2026-08-31T07:37:00.000Z").state,
    ).toMatchObject({ remainingMovementPaces: 2, majorActionUsed: false });

    const ended = endMatch(dashed.state, {
      occurredAt: "2026-08-31T07:38:00.000Z",
      confirmed: true,
      random: { nextUint32: () => 0 },
    });
    expect(
      reopenMatch(ended.state, "2026-08-31T07:39:00.000Z").state,
    ).toMatchObject({
      movementPaces: 2,
      remainingMovementPaces: 0,
      majorActionUsed: true,
    });
  });

  it("replays and undoes a Dash through canonical Match history", () => {
    const setup = createSetup("dash-history", "2026-08-31T07:40:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-31T07:41:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-31T07:42:00.000Z");
    const sourceCharacterId = started.state.initiative[0]?.characterId;
    if (!sourceCharacterId)
      throw new Error("The Match needs an active character.");
    const dashed = dash(
      started.state,
      sourceCharacterId,
      "2026-08-31T07:43:00.000Z",
    );
    const events = [setup.event, generated.event, started.event, dashed.event];

    expect(restoreStateFromEvents(events)).toEqual(dashed.state);
    const undone = undoLastEvent(dashed.state, events, {
      occurredAt: "2026-08-31T07:44:00.000Z",
      confirmed: true,
    });
    expect(undone.event).toMatchObject({
      targetSequence: dashed.event.sequence,
      targetType: "Dashed",
    });
    expect(undone.state).toEqual({ ...started.state, sequence: 5 });
    expect(restoreStateFromEvents([...events, undone.event])).toEqual(
      undone.state,
    );
  });
});
