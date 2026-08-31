import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import {
  createSetup,
  dash,
  generateInitiative,
  startMatch,
  undoLastEvent,
} from "../../src/domain/match";
import { assertValidatedEvent } from "../../src/storage/match-store-validated-event";
import { createIndexedDbMatchStore } from "../../src/storage/match-store";
import { queuedRandom } from "../domain/match-test-support";

describe("IndexedDbMatchStore Dash persistence", () => {
  it("validates, restores, and undoes a validated Dash event", async () => {
    const store = createIndexedDbMatchStore(new IDBFactory(), "dash-store");
    const setup = createSetup("dash-store", "2026-08-31T07:45:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-31T07:46:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-31T07:47:00.000Z");
    const sourceCharacterId = started.state.initiative[0]?.characterId;
    if (!sourceCharacterId)
      throw new Error("The Match needs an active character.");
    const dashed = dash(
      started.state,
      sourceCharacterId,
      "2026-08-31T07:48:00.000Z",
    );
    const events = [setup.event, generated.event, started.event, dashed.event];

    expect(() => {
      assertValidatedEvent(dashed.event);
    }).not.toThrow();
    expect(() => {
      assertValidatedEvent({ ...dashed.event, remainingMovementPaces: 1 });
    }).toThrow("The validated Dash Event is invalid.");
    for (const result of [setup, generated, started, dashed]) {
      await store.commit(result.event, result.state);
    }
    await expect(store.restore()).resolves.toEqual({
      state: dashed.state,
      events,
      summary: null,
    });

    const undone = undoLastEvent(dashed.state, events, {
      occurredAt: "2026-08-31T07:49:00.000Z",
      confirmed: true,
    });
    await store.commit(undone.event, undone.state);
    await expect(store.restore()).resolves.toEqual({
      state: undone.state,
      events: [...events, undone.event],
      summary: null,
    });
  });
});
