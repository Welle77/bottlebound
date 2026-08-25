import { describe, expect, it } from "vitest";

import {
  assignDisplayNames,
  createSetup,
  generateInitiative,
  getUndoPreview,
  normalizeDisplayNames,
  rerollInitiative,
  restoreStateFromEvents,
  startMatch,
  undoLastEvent,
  type MatchState,
} from "./match";
import { RULES_VERSION } from "./ruleset";
import { queuedRandom } from "./match-test-support";

describe("Display Name assignment", () => {
  it("records one atomic reversible event carrying the complete map", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");

    const result = assignDisplayNames(
      setup.state,
      {
        "drow-rogue": "Silk",
        "duergar-cleric": "Ash",
      },
      "2026-08-22T14:01:00.000Z",
    );

    expect(result.event).toEqual({
      type: "DisplayNamesAssigned",
      matchId: "match-1",
      sequence: 2,
      rulesVersion: RULES_VERSION,
      occurredAt: "2026-08-22T14:01:00.000Z",
      displayNames: {
        "drow-rogue": "Silk",
        "duergar-cleric": "Ash",
      },
    });
    expect(result.state.sequence).toBe(2);
    expect(result.state.displayNames).toEqual({
      "drow-rogue": "Silk",
      "duergar-cleric": "Ash",
    });
  });

  it("trims every value and treats empty values as unset", () => {
    expect(
      normalizeDisplayNames({
        "drow-rogue": "  Silk  ",
        "drow-druid": "   ",
        "drow-paladin": "",
        "duergar-cleric": "\tAsh\n",
      }),
    ).toEqual({
      "drow-rogue": "Silk",
      "duergar-cleric": "Ash",
    });

    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const named = assignDisplayNames(
      setup.state,
      { "drow-rogue": "Silk", "drow-druid": "Moss" },
      "2026-08-22T14:01:00.000Z",
    );
    const cleared = assignDisplayNames(
      named.state,
      { "drow-rogue": "  ", "drow-druid": "Reed" },
      "2026-08-22T14:02:00.000Z",
    );

    expect(cleared.state.displayNames).toEqual({ "drow-druid": "Reed" });
    expect(cleared.event.displayNames).toEqual({ "drow-druid": "Reed" });
  });

  it("rejects unknown characters and assignments outside Setup", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");

    expect(() =>
      assignDisplayNames(
        setup.state,
        { "unknown-character": "Silk" },
        "2026-08-22T14:01:00.000Z",
      ),
    ).toThrow("The Display Name references an unknown character.");

    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    expect(() =>
      assignDisplayNames(
        started.state as unknown as typeof setup.state,
        { "drow-rogue": "Silk" },
        "2026-08-22T14:03:00.000Z",
      ),
    ).toThrow("Display Names can only be assigned during Setup.");
  });

  it("restores the previous name map exactly when Undo targets an assignment", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const first = assignDisplayNames(
      setup.state,
      { "drow-rogue": "Silk" },
      "2026-08-22T14:01:00.000Z",
    );
    const second = assignDisplayNames(
      first.state,
      { "drow-rogue": "Web", "duergar-cleric": "Ash" },
      "2026-08-22T14:02:00.000Z",
    );
    const events = [setup.event, first.event, second.event];

    const preview = getUndoPreview(second.state, events);
    expect(preview?.target).toBe(second.event);
    expect(preview?.restoredState).toEqual({ ...first.state, sequence: 4 });

    const undone = undoLastEvent(second.state, events, {
      occurredAt: "2026-08-22T14:03:00.000Z",
      confirmed: true,
    });
    expect(undone.event).toMatchObject({
      type: "UndoApplied",
      sequence: 4,
      targetSequence: 3,
      targetType: "DisplayNamesAssigned",
    });
    expect(undone.state.displayNames).toEqual({ "drow-rogue": "Silk" });
    expect(undone.state).toEqual({ ...first.state, sequence: 4 });

    const replayed = restoreStateFromEvents([...events, undone.event]);
    expect(replayed).toEqual(undone.state);
  });

  it("keeps assigned names through initiative changes, Start Match, and later Undo", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const named = assignDisplayNames(
      setup.state,
      { "drow-rogue": "Silk", "duergar-monk": "Stone" },
      "2026-08-22T14:01:00.000Z",
    );
    const generated = generateInitiative(
      named.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:02:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:03:00.000Z");
    const events = [setup.event, named.event, generated.event, started.event];

    expect(started.state.displayNames).toEqual({
      "drow-rogue": "Silk",
      "duergar-monk": "Stone",
    });
    expect(restoreStateFromEvents(events)).toEqual(started.state);

    const preview = getUndoPreview(started.state, events);
    expect(preview?.restoredState).toEqual({ ...generated.state, sequence: 5 });
    expect(preview?.restoredState.displayNames).toEqual({
      "drow-rogue": "Silk",
      "duergar-monk": "Stone",
    });

    const undone = undoLastEvent(started.state, events, {
      occurredAt: "2026-08-22T14:04:00.000Z",
      confirmed: true,
    });
    const restoredSetup = undone.state as Extract<
      MatchState,
      { phase: "setup" }
    >;
    expect(restoredSetup.phase).toBe("setup");
    expect(restoredSetup.displayNames).toEqual(named.state.displayNames);

    const rerolled = rerollInitiative(
      restoredSetup,
      queuedRandom(
        ...Array.from({ length: 12 }, () => 19),
        ...Array.from({ length: 20 }, () => 0),
      ),
      { occurredAt: "2026-08-22T14:05:00.000Z", confirmed: true },
    );
    expect(rerolled.state.displayNames).toEqual(named.state.displayNames);
  });

  it("replays a naming event recorded before initiative generation", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const named = assignDisplayNames(
      setup.state,
      { "duergar-warlock": "Ember" },
      "2026-08-22T14:01:00.000Z",
    );
    const generated = generateInitiative(
      named.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:02:00.000Z",
    );

    expect(generated.state.displayNames).toEqual({
      "duergar-warlock": "Ember",
    });
    expect(
      restoreStateFromEvents([setup.event, named.event, generated.event]),
    ).toEqual(generated.state);
  });
});
