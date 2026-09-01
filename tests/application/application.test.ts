import { describe, expect, it } from "vitest";

import {
  createApplication,
  type Application,
  type ApplicationClock,
} from "../../src/app/application";
import {
  createSetup,
  generateInitiative,
  startMatch,
  type ActiveMatchState,
  type MatchEvent,
  type MatchState,
  type MatchSummary,
  type RandomSource,
} from "../../src/domain/match";
import type { MatchStore, RestoredMatch } from "../../src/storage/match-store";

type StoreOptions = {
  readonly restored?: RestoredMatch | null;
  readonly summary?: MatchSummary | null;
  readonly commitError?: Error;
  readonly restoreError?: Error;
  readonly restoreDelay?: Promise<void>;
};

function createStore(options: StoreOptions = {}): MatchStore & {
  readonly committed: MatchEvent[];
} {
  let restored = options.restored ?? null;
  let summary = options.summary ?? null;
  const committed: MatchEvent[] = [];
  return {
    committed,
    commit(event: MatchEvent, state: MatchState): Promise<void> {
      return Promise.resolve().then(() => {
        if (options.commitError) throw options.commitError;
        committed.push(event);
        restored = {
          state,
          events: [...(restored?.events ?? []), event],
          summary,
        };
      });
    },
    async restore(): Promise<RestoredMatch | null> {
      if (options.restoreDelay) await options.restoreDelay;
      if (options.restoreError) throw options.restoreError;
      return restored;
    },
    getSummary(): Promise<MatchSummary | null> {
      return Promise.resolve(summary);
    },
    deleteSummary(confirmed: boolean): Promise<void> {
      return Promise.resolve().then(() => {
        if (!confirmed) throw new Error("confirmation required");
        summary = null;
      });
    },
    deleteMatch(matchId: string, confirmed: boolean): Promise<void> {
      return Promise.resolve().then(() => {
        if (!confirmed) throw new Error("confirmation required");
        if (restored?.state.matchId === matchId) restored = null;
      });
    },
  };
}

function createClock(...values: readonly string[]): ApplicationClock {
  let position = 0;
  return {
    now: (): string => {
      const value = values[position];
      position += 1;
      if (value === undefined) throw new Error("The test clock is empty.");
      return value;
    },
  };
}

function createRandom(...values: readonly number[]): RandomSource {
  let position = 0;
  return {
    nextUint32: (): number => {
      const value = values[position];
      position += 1;
      if (value === undefined)
        throw new Error("The test random source is empty.");
      return value;
    },
  };
}

function createTestApplication(
  store: MatchStore,
  clock: ApplicationClock = createClock("2026-09-01T10:00:00.000Z"),
  randomSource: RandomSource = createRandom(0),
): Application {
  return createApplication({ matchStore: store, clock, randomSource });
}

describe("application interface", () => {
  it("creates and starts a Match with deterministic time and randomness", async () => {
    const store = createStore();
    const application = createTestApplication(
      store,
      createClock(
        "2026-09-01T10:00:00.000Z",
        "2026-09-01T10:01:00.000Z",
        "2026-09-01T10:02:00.000Z",
      ),
      createRandom(19, 18, 17, 16, 15, 12, 10, 9, 8, 10, 7, 6),
    );

    expect(await application.createMatch("application-match")).toBe(true);
    expect(await application.generateInitiative()).toBe(true);
    expect(await application.startMatch()).toBe(true);

    expect(application.state.match?.phase).toBe("active");
    expect(application.state.match?.sequence).toBe(3);
    expect(store.committed.map(({ occurredAt }) => occurredAt)).toEqual([
      "2026-09-01T10:00:00.000Z",
      "2026-09-01T10:01:00.000Z",
      "2026-09-01T10:02:00.000Z",
    ]);
    expect(structuredClone(application.state)).toEqual(application.state);
    expect("actionDraft" in application.state).toBe(false);
  });

  it("reports persistence failures without changing Match State", async () => {
    const application = createTestApplication(
      createStore({ commitError: new Error("store write failed") }),
    );

    expect(await application.createMatch("failed-match")).toBe(false);
    expect(application.state.match).toBeNull();
    expect(application.state.saving).toBe(false);
    expect(application.state.errors.operation).toBe("store write failed");
  });

  it("reports loading while restore waits and installs the latest summary", async () => {
    let release: () => void = () => undefined;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const setup = createSetup("loading-match", "2026-09-01T11:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      createRandom(19, 18, 17, 16, 15, 12, 10, 9, 8, 10, 7, 6),
      "2026-09-01T11:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-09-01T11:02:00.000Z");
    const store = createStore({
      restored: {
        state: started.state,
        events: [setup.event, generated.event, started.event],
        summary: null,
      },
      summary: null,
      restoreDelay: wait,
    });
    const application = createTestApplication(store);

    const loading = application.load();
    expect(application.state.loading).toBe(true);
    release();
    expect(await loading).toBe(true);
    expect(application.state.loading).toBe(false);
    expect(application.state.match?.matchId).toBe("loading-match");
    expect(application.state.events).toHaveLength(3);
  });

  it("records invalid persisted data as a validation error after loading", async () => {
    const application = createTestApplication(
      createStore({ restoreError: new Error("persisted data is invalid") }),
    );

    expect(await application.load()).toBe(false);
    expect(application.state.loading).toBe(false);
    expect(application.state.validation.match).toBe("invalid");
    expect(application.state.errors.validation).toBe(
      "persisted data is invalid",
    );
  });

  it("tracks readiness transitions through explicit operations", () => {
    const application = createTestApplication(createStore());

    application.setStorageValidation({ status: "ready" });
    application.setServiceWorkerState("controlled");
    application.setAppShellCacheState("ready");
    application.setNetworkState("offline");

    expect(application.state.readiness).toEqual({
      network: "offline",
      serviceWorker: "controlled",
      appShellCache: "ready",
      validatedStorage: "ready",
      offline: "ready",
      matchCreation: "available",
      blockingReason: null,
    });
  });

  it("records a deterministic End Game summary through the application seam", async () => {
    const setup = createSetup("summary-match", "2026-09-01T12:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      createRandom(19, 18, 17, 16, 15, 12, 10, 9, 8, 10, 7, 6),
      "2026-09-01T12:00:00.000Z",
    );
    const started = startMatch(generated.state, "2026-09-01T12:00:00.000Z");
    const balanced: ActiveMatchState = {
      ...started.state,
      characters: started.state.characters.map((character) => ({
        ...character,
        hp: 1,
      })),
    };
    const store = createStore({
      restored: {
        state: balanced,
        events: [setup.event, generated.event, started.event],
        summary: null,
      },
    });
    const application = createTestApplication(
      store,
      createClock("2026-09-01T12:02:00.000Z"),
      createRandom(0),
    );

    expect(await application.load()).toBe(true);
    expect(application.previewEndGame()?.coinFlipResult).toBe("Drow");
    expect(await application.endMatch()).toBe(true);

    expect(application.state.summary).toEqual({
      outcome: "Drow",
      decisionBasis: "coinFlip",
      finalCounts: { Drow: 6, Duergar: 6 },
      finalHpTotals: { Drow: 6, Duergar: 6 },
      configurationVersion: application.state.match?.configurationVersion,
      endedAt: "2026-09-01T12:02:00.000Z",
      coinFlipResult: "Drow",
    });
  });
});
