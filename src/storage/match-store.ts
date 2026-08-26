import {
  MATCH_SCHEMA_VERSION,
  assertMatchSummaryStructure,
  canonicalMatchRecordsEqual,
  getUndoPreview,
  restoreStateFromEvents,
  toMatchSummary,
  type MatchEvent,
  type MatchState,
  type MatchSummary,
} from "../domain/match";
import {
  assertCommit,
  assertRestoredMatch,
} from "./match-store-canonical-commit";

const DEFAULT_DATABASE_NAME = "bottlebound-match";
const DATABASE_VERSION = 2;
const METADATA_STORE = "metadata";
const SNAPSHOT_STORE = "snapshots";
const EVENT_STORE = "events";
const SUMMARY_STORE = "summaries";
const CURRENT_MATCH_KEY = "current-match";
const LATEST_SUMMARY_KEY = "latest-summary";

interface CurrentMatchMetadata {
  readonly matchId: string;
  readonly sequence: number;
  readonly schemaVersion: number;
  readonly rulesVersion: string;
}

export interface RestoredMatch {
  readonly state: MatchState;
  readonly events: readonly MatchEvent[];
  readonly summary: MatchSummary | null;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener(
      "success",
      () => {
        resolve(request.result);
      },
      { once: true },
    );
    request.addEventListener(
      "error",
      () => {
        reject(request.error ?? new Error("IndexedDB request failed."));
      },
      { once: true },
    );
  });
}

/**
 * lib.dom leaves object-store reads untyped (`IDBRequest<any>`); these
 * wrappers restore the expected payload shape at a single boundary. The
 * payloads remain guarded by the structural assertions applied afterwards.
 */
function getRecord<T>(
  store: IDBObjectStore,
  key: IDBValidKey,
): Promise<T | undefined> {
  return requestResult(store.get(key) as IDBRequest<T | undefined>);
}

function getAllRecords<T>(
  source: IDBObjectStore | IDBIndex,
  key?: IDBValidKey,
): Promise<readonly T[]> {
  const request = key === undefined ? source.getAll() : source.getAll(key);
  return requestResult(request) as Promise<readonly T[]>;
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener(
      "complete",
      () => {
        resolve();
      },
      { once: true },
    );
    transaction.addEventListener(
      "abort",
      () => {
        reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
      },
      { once: true },
    );
    transaction.addEventListener(
      "error",
      () => {
        reject(transaction.error ?? new Error("IndexedDB transaction failed."));
      },
      { once: true },
    );
  });
}

export class IndexedDbMatchStore {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly factory: IDBFactory = globalThis.indexedDB,
    private readonly databaseName = DEFAULT_DATABASE_NAME,
  ) {}

  private open(): Promise<IDBDatabase> {
    const promise = (this.databasePromise ??= new Promise((resolve, reject) => {
      const request = this.factory.open(this.databaseName, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(METADATA_STORE)) {
          database.createObjectStore(METADATA_STORE);
        }
        if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
          database.createObjectStore(SNAPSHOT_STORE, { keyPath: "matchId" });
        }
        if (!database.objectStoreNames.contains(EVENT_STORE)) {
          const events = database.createObjectStore(EVENT_STORE, {
            keyPath: ["matchId", "sequence"],
          });
          events.createIndex("matchId", "matchId", { unique: false });
        }
        if (!database.objectStoreNames.contains(SUMMARY_STORE)) {
          database.createObjectStore(SUMMARY_STORE);
        }
      });
      request.addEventListener(
        "success",
        () => {
          resolve(request.result);
        },
        {
          once: true,
        },
      );
      request.addEventListener(
        "error",
        () => {
          reject(
            request.error ?? new Error("The Match database could not open."),
          );
        },
        { once: true },
      );
    }));
    return promise;
  }

  async commit(event: MatchEvent, state: MatchState): Promise<void> {
    assertCommit(event, state);
    const database = await this.open();
    const transaction = database.transaction(
      [METADATA_STORE, SNAPSHOT_STORE, EVENT_STORE, SUMMARY_STORE],
      "readwrite",
    );
    const completion = transactionComplete(transaction);
    const metadataStore = transaction.objectStore(METADATA_STORE);
    const current = await getRecord<CurrentMatchMetadata>(
      metadataStore,
      CURRENT_MATCH_KEY,
    );
    const isReplacement =
      current !== undefined &&
      current.matchId !== event.matchId &&
      event.type === "SetupCreated" &&
      event.sequence === 1;
    if (isReplacement) {
      const oldSnapshotStore = transaction.objectStore(SNAPSHOT_STORE);
      const eventStore = transaction.objectStore(EVENT_STORE);
      const oldKeys = await requestResult(
        eventStore.index("matchId").getAllKeys(current.matchId),
      );
      oldSnapshotStore.delete(current.matchId);
      oldKeys.forEach((key) => eventStore.delete(key));
    } else {
      const expectedSequence = current ? current.sequence + 1 : 1;
      if (
        event.sequence !== expectedSequence ||
        (current !== undefined &&
          (current.matchId !== event.matchId ||
            current.rulesVersion !== state.rulesVersion))
      ) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new Error("The new record must continue the committed sequence.");
      }
      if (event.type === "UndoApplied") {
        const previousState = await getRecord<MatchState>(
          transaction.objectStore(SNAPSHOT_STORE),
          event.matchId,
        );
        const previousEvents = await getAllRecords<MatchEvent>(
          transaction.objectStore(EVENT_STORE).index("matchId"),
          event.matchId,
        );
        if (previousState === undefined) {
          transaction.abort();
          await completion.catch(() => undefined);
          throw new Error("Undo needs the last committed Match State.");
        }
        const preview = getUndoPreview(previousState, previousEvents);
        if (
          preview === null ||
          preview.target.sequence !== event.targetSequence ||
          preview.target.type !== event.targetType ||
          !canonicalMatchRecordsEqual(preview.restoredState, state)
        ) {
          transaction.abort();
          await completion.catch(() => undefined);
          throw new Error("The Undo Event and restored snapshot do not match.");
        }
      }
      if (
        event.type === "ActionResolved" ||
        event.type === "SimultaneousEliminationRuled"
      ) {
        const previousState = await getRecord<MatchState>(
          transaction.objectStore(SNAPSHOT_STORE),
          event.matchId,
        );
        const previousEvents = await getAllRecords<MatchEvent>(
          transaction.objectStore(EVENT_STORE).index("matchId"),
          event.matchId,
        );
        if (
          previousState === undefined ||
          !canonicalMatchRecordsEqual(
            restoreStateFromEvents([...previousEvents, event]),
            state,
          )
        ) {
          transaction.abort();
          await completion.catch(() => undefined);
          throw new Error(
            "The Match Event and committed snapshot do not match.",
          );
        }
      }
    }
    try {
      transaction.objectStore(EVENT_STORE).add(event);
      transaction.objectStore(SNAPSHOT_STORE).put(state);
      metadataStore.put(
        {
          matchId: state.matchId,
          sequence: state.sequence,
          schemaVersion: MATCH_SCHEMA_VERSION,
          rulesVersion: state.rulesVersion,
        } satisfies CurrentMatchMetadata,
        CURRENT_MATCH_KEY,
      );
      if (event.type === "MatchEnded") {
        const endedState = state as Extract<
          MatchState,
          { readonly phase: "ended" }
        >;
        const summary = toMatchSummary(endedState);
        assertMatchSummaryStructure(summary);
        transaction.objectStore(SUMMARY_STORE).put(summary, LATEST_SUMMARY_KEY);
      }
    } catch (error) {
      transaction.abort();
      await completion.catch(() => undefined);
      throw error;
    }
    await completion;
  }

  async restore(): Promise<RestoredMatch | null> {
    const database = await this.open();
    const transaction = database.transaction(
      [METADATA_STORE, SNAPSHOT_STORE, EVENT_STORE, SUMMARY_STORE],
      "readwrite",
    );
    const completion = transactionComplete(transaction);
    const metadata = await getRecord<unknown>(
      transaction.objectStore(METADATA_STORE),
      CURRENT_MATCH_KEY,
    );
    const allSnapshots = await getAllRecords<unknown>(
      transaction.objectStore(SNAPSHOT_STORE),
    );
    const allEvents = await getAllRecords<unknown>(
      transaction.objectStore(EVENT_STORE),
    );
    const summaryRaw = await getRecord<unknown>(
      transaction.objectStore(SUMMARY_STORE),
      LATEST_SUMMARY_KEY,
    );
    const summary: MatchSummary | null =
      summaryRaw === undefined
        ? null
        : (assertMatchSummaryStructure(summaryRaw), summaryRaw);
    if (metadata === undefined) {
      if (allSnapshots.length > 0 || allEvents.length > 0) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new Error("Saved canonical data is incomplete.");
      }
      await completion;
      if (summary !== null) {
        // Prior summary persists without an Active Ended snapshot
        // Expose via getSummary; restore signals no Active Match
        return null;
      }
      return null;
    }
    const state = allSnapshots[0];
    if (allSnapshots.length !== 1) {
      transaction.abort();
      await completion.catch(() => undefined);
      throw new Error("Saved canonical data has an invalid snapshot count.");
    }
    // Single-schema persistence: anything that does not validate as the
    // current schema is rejected through the existing restore error path.
    assertRestoredMatch(metadata, state, allEvents);
    await completion;
    return {
      state: state,
      events: allEvents as readonly MatchEvent[],
      summary,
    };
  }

  async getSummary(): Promise<MatchSummary | null> {
    const database = await this.open();
    const transaction = database.transaction([SUMMARY_STORE], "readonly");
    const completion = transactionComplete(transaction);
    const raw = await getRecord<unknown>(
      transaction.objectStore(SUMMARY_STORE),
      LATEST_SUMMARY_KEY,
    );
    await completion;
    if (raw === undefined) return null;
    assertMatchSummaryStructure(raw);
    return raw;
  }

  async deleteSummary(confirmed: boolean): Promise<void> {
    if (!confirmed) throw new Error("Remove confirmation is required.");
    const database = await this.open();
    const transaction = database.transaction([SUMMARY_STORE], "readwrite");
    const completion = transactionComplete(transaction);
    transaction.objectStore(SUMMARY_STORE).delete(LATEST_SUMMARY_KEY);
    await completion;
  }

  async deleteMatch(matchId: string, confirmed: boolean): Promise<void> {
    if (!confirmed) throw new Error("Discard confirmation is required.");
    const database = await this.open();
    const transaction = database.transaction(
      [METADATA_STORE, SNAPSHOT_STORE, EVENT_STORE, SUMMARY_STORE],
      "readwrite",
    );
    const completion = transactionComplete(transaction);
    const metadataStore = transaction.objectStore(METADATA_STORE);
    const metadata = await getRecord<CurrentMatchMetadata>(
      metadataStore,
      CURRENT_MATCH_KEY,
    );
    if (metadata !== undefined && metadata.matchId !== matchId) {
      transaction.abort();
      await completion.catch(() => undefined);
      throw new Error("The requested Match is not the saved Match.");
    }
    metadataStore.delete(CURRENT_MATCH_KEY);
    const snapshot = await getRecord<MatchState>(
      transaction.objectStore(SNAPSHOT_STORE),
      matchId,
    );
    const shouldDeleteSummary = snapshot?.phase === "ended";
    transaction.objectStore(SNAPSHOT_STORE).delete(matchId);
    const eventStore = transaction.objectStore(EVENT_STORE);
    const eventKeys = await requestResult(
      eventStore.index("matchId").getAllKeys(matchId),
    );
    eventKeys.forEach((key) => eventStore.delete(key));
    if (shouldDeleteSummary) {
      transaction.objectStore(SUMMARY_STORE).delete(LATEST_SUMMARY_KEY);
    }
    await completion;
  }
}
