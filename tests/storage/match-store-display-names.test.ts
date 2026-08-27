import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import {
  assignDisplayNames,
  createSetup,
  generateInitiative,
  startMatch,
  undoLastEvent,
} from "../../src/domain/match";
import { randomQueue } from "./match-store.test-helpers";
import { createIndexedDbMatchStore } from "../../src/storage/match-store";

describe("IndexedDbMatchStore Display Name persistence", () => {
  it("preserves assigned names across a store reopen and Start Match", async () => {
    const factory = new IDBFactory();
    const databaseName = "display-names-reopen";
    const firstStore = createIndexedDbMatchStore(factory, databaseName);
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const named = assignDisplayNames(
      setup.state,
      { "drow-rogue": "Silk", "duergar-monk": "Stone" },
      "2026-08-22T14:01:00.000Z",
    );
    for (const result of [setup, named]) {
      await firstStore.commit(result.event, result.state);
    }

    const reopenedStore = createIndexedDbMatchStore(factory, databaseName);

    await expect(reopenedStore.restore()).resolves.toEqual({
      state: named.state,
      events: [setup.event, named.event],
      summary: null,
    });

    const generated = generateInitiative(
      named.state,
      randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
      "2026-08-22T14:02:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:03:00.000Z");
    await reopenedStore.commit(generated.event, generated.state);
    await reopenedStore.commit(started.event, started.state);
    await expect(reopenedStore.restore()).resolves.toEqual({
      state: started.state,
      events: [setup.event, named.event, generated.event, started.event],
      summary: null,
    });
    expect(started.state.displayNames).toEqual(named.state.displayNames);
  });

  it("commits and restores an Undo that restores the previous name map exactly", async () => {
    const store = createIndexedDbMatchStore(
      new IDBFactory(),
      "display-names-undo",
    );
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
    for (const result of [setup, first, second]) {
      await store.commit(result.event, result.state);
    }

    const undone = undoLastEvent(second.state, events, {
      occurredAt: "2026-08-22T14:03:00.000Z",
      confirmed: true,
    });
    await store.commit(undone.event, undone.state);

    await expect(store.restore()).resolves.toEqual({
      state: undone.state,
      events: [...events, undone.event],
      summary: null,
    });
    expect(undone.state.displayNames).toEqual({ "drow-rogue": "Silk" });
  });
});
