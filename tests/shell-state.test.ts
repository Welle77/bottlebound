/**
 * Focused coverage for the runes-backed shell store (T03 seam).
 *
 * Imports the store module directly (`shell-state.svelte.ts`), whose runes
 * require the Svelte compilation pipeline. Expected values below are written
 * out independently; no assertion derives its expectation from the
 * implementation's own spread logic.
 */
import { describe, expect, it } from "vitest";

import {
  patchShellState,
  rulesUi,
  state,
  type ShellState,
} from "../src/ui/shell-state.svelte";
import { settle, trackShellReadings } from "./shell-state-reactivity.svelte.ts";

/** Independently authored baseline snapshot, used to seed the store. */
function baselineSnapshot(overrides: Partial<ShellState> = {}): ShellState {
  const baseline: ShellState = {
    network: "online",
    serviceWorker: "unsupported",
    appShellCache: "checking",
    validatedStorage: "checking",
    storageDetail: "Running a write and removal safety check.",
    match: null,
    events: [],
    matchLoaded: true,
    matchError: null,
    confirmation: null,
    endGamePreview: null,
    actionDraft: null,
    abilityPickerOpen: false,
    requirePhysicalConfirmations: true,
    saving: false,
    summary: null,
  };
  return { ...baseline, ...overrides };
}

describe("patchShellState", () => {
  it("replaces the snapshot wholesale with exactly the patched values", () => {
    patchShellState(baselineSnapshot());
    const before = state.current;

    patchShellState({ saving: true });

    // Independent full expectation: the patched snapshot equals the
    // baseline with only `saving` flipped, and is a new object.
    expect(state.current).toEqual({ ...baselineSnapshot(), saving: true });
    expect(state.current).not.toBe(before);
  });

  it("never mutates the previous snapshot in place", () => {
    patchShellState(baselineSnapshot());
    const before = state.current;
    const beforeEvents = before.events;

    patchShellState({
      confirmation: "undo",
      storageDetail: "Replaced by this patch.",
    });
    const after = state.current;

    // The captured pre-patch snapshot keeps every original value...
    expect(before).toEqual(baselineSnapshot());
    expect(before.confirmation).toBeNull();
    // ...the replacement is a distinct top-level object...
    expect(after).toEqual({
      ...baselineSnapshot(),
      confirmation: "undo",
      storageDetail: "Replaced by this patch.",
    });
    expect(after).not.toBe(before);
    // ...and un-patched nested references are shared, not cloned.
    expect(after.events).toBe(beforeEvents);
  });

  it("accumulates successive patches onto fresh snapshots", () => {
    patchShellState(baselineSnapshot());

    patchShellState({ saving: true });
    const afterFirstPatch = state.current;
    patchShellState({ abilityPickerOpen: true });
    const afterSecondPatch = state.current;

    expect(afterFirstPatch).toEqual({ ...baselineSnapshot(), saving: true });
    expect(afterSecondPatch).toEqual({
      ...baselineSnapshot(),
      saving: true,
      abilityPickerOpen: true,
    });
    expect(afterSecondPatch).not.toBe(afterFirstPatch);
  });
});

describe("store cells", () => {
  it("rulesUi reads back exactly the snapshot it is set to", () => {
    const original = rulesUi.current;
    const originalQuery = original.query;
    const next = { ...original, open: true, query: "search term" };

    // Reads return the reactive view of the installed snapshot; values match
    // exactly what was set.
    rulesUi.set(next);
    expect(rulesUi.current.open).toBe(true);
    expect(rulesUi.current.query).toBe("search term");

    rulesUi.set({ ...next, open: false, query: originalQuery });
    expect(rulesUi.current.open).toBe(false);
    expect(rulesUi.current.query).toBe(originalQuery);
  });

  it("keeps the state and rulesUi cells independent of each other", () => {
    const beforeRules = rulesUi.current;
    const beforeState = state.current;

    patchShellState(baselineSnapshot());

    expect(rulesUi.current.open).toBe(beforeRules.open);
    expect(rulesUi.current.query).toBe(beforeRules.query);
    expect(state.current).not.toBe(beforeState);
  });
});

describe("reactive readability", () => {
  it("notifies reactive readers when the snapshot is replaced", async () => {
    patchShellState(baselineSnapshot());
    const probe = trackShellReadings();

    await settle();
    expect(probe.readings).toEqual([{ saving: false, confirmation: null }]);

    patchShellState({ saving: true });
    await settle();

    expect(probe.readings).toEqual([
      { saving: false, confirmation: null },
      { saving: true, confirmation: null },
    ]);
    probe.stop();
  });
});
