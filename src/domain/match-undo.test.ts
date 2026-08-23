import { describe, expect, it } from "vitest";

import {
  createSetup,
  finishTurn,
  generateInitiative,
  getUndoPreview,
  rerollInitiative,
  restoreStateFromEvents,
  startMatch,
  undoLastEvent,
} from "./match";
import { queuedRandom } from "./match-test-support";

describe("Undo commands", () => {
  it("rejects InitiativeRerolled before initiative exists during restore", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );

    expect(() =>
      restoreStateFromEvents([
        setup.event,
        { ...generated.event, type: "InitiativeRerolled" },
      ]),
    ).toThrow("Initiative Reroll needs an existing initiative result.");
  });

  it("rejects InitiativeGenerated after initiative exists during restore", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const rerolled = rerollInitiative(
      generated.state,
      queuedRandom(18, 18, 17, 17, 16, 13, 11, 10, 11, 10, 10, 9),
      { occurredAt: "2026-08-22T14:02:00.000Z", confirmed: true },
    );

    expect(() =>
      restoreStateFromEvents([
        setup.event,
        generated.event,
        { ...rerolled.event, type: "InitiativeGenerated" },
      ]),
    ).toThrow("Initiative Generate needs an empty initiative result.");
  });

  it("previews and restores the complete state before the newest reversible event", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const advanced = finishTurn(started.state, "2026-08-22T14:03:00.000Z");
    const events = [
      setup.event,
      generated.event,
      started.event,
      advanced.event,
    ];

    const preview = getUndoPreview(advanced.state, events);

    expect(preview).toEqual({
      target: advanced.event,
      currentState: advanced.state,
      restoredState: { ...started.state, sequence: 5 },
    });
    expect(() =>
      undoLastEvent(advanced.state, events, {
        occurredAt: "2026-08-22T14:04:00.000Z",
        confirmed: false,
      }),
    ).toThrow("Undo confirmation is required.");

    const undone = undoLastEvent(advanced.state, events, {
      occurredAt: "2026-08-22T14:04:00.000Z",
      confirmed: true,
    });
    expect(undone.state).toEqual({ ...started.state, sequence: 5 });
    expect(undone.event).toMatchObject({
      type: "UndoApplied",
      sequence: 5,
      targetSequence: 4,
      targetType: "TurnFinished",
    });
  });

  it("moves backward through effective events without changing prior history", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const originalEvents = [setup.event, generated.event, started.event];
    const undoStart = undoLastEvent(started.state, originalEvents, {
      occurredAt: "2026-08-22T14:03:00.000Z",
      confirmed: true,
    });
    const eventsAfterStartUndo = [...originalEvents, undoStart.event];

    expect(getUndoPreview(undoStart.state, eventsAfterStartUndo)?.target).toBe(
      generated.event,
    );
    const undoInitiative = undoLastEvent(
      undoStart.state,
      eventsAfterStartUndo,
      { occurredAt: "2026-08-22T14:04:00.000Z", confirmed: true },
    );

    expect(undoStart.state).toMatchObject({
      phase: "setup",
      initiative: generated.state.initiative,
    });
    expect(undoInitiative.state).toEqual({ ...setup.state, sequence: 5 });
    expect(undoInitiative.event).toMatchObject({
      type: "UndoApplied",
      targetSequence: 2,
      targetType: "InitiativeGenerated",
    });
    expect(eventsAfterStartUndo).toEqual([...originalEvents, undoStart.event]);
    expect(
      getUndoPreview(undoInitiative.state, [
        ...eventsAfterStartUndo,
        undoInitiative.event,
      ]),
    ).toBeNull();
  });

  it("restores the prior complete initiative result when it undoes a reroll", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const rerolled = rerollInitiative(
      generated.state,
      queuedRandom(
        ...Array.from({ length: 12 }, () => 19),
        ...Array.from({ length: 20 }, () => 0),
      ),
      { occurredAt: "2026-08-22T14:02:00.000Z", confirmed: true },
    );
    const events = [setup.event, generated.event, rerolled.event];

    const undone = undoLastEvent(rerolled.state, events, {
      occurredAt: "2026-08-22T14:03:00.000Z",
      confirmed: true,
    });

    expect(undone.state).toEqual({ ...generated.state, sequence: 4 });
    expect(undone.event).toMatchObject({
      targetSequence: 3,
      targetType: "InitiativeRerolled",
    });
  });
});
