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

type CurrentMatchMetadata = {
  readonly matchId: string;
  readonly sequence: number;
  readonly schemaVersion: number;
  readonly configurationVersion: string;
};

type CommitContext = {
  readonly transaction: IDBTransaction;
  readonly completion: Promise<void>;
  readonly metadataStore: IDBObjectStore;
  readonly current: CurrentMatchMetadata | undefined;
  readonly event: MatchEvent;
  readonly state: MatchState;
};

type DeepReadonly<T> = T extends (...args: infer Parameters) => infer Result
  ? (...args: Parameters) => Result
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T;

type ReadonlyDeepCommitContext = DeepReadonly<CommitContext>;

export type RestoredMatch = {
  readonly state: MatchState;
  readonly events: readonly MatchEvent[];
  readonly summary: MatchSummary | null;
};

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
        reject(
          transaction.error ?? new Error("IndexedDB transaction aborted."),
        );
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

function isReplacementCommit(
  current: CurrentMatchMetadata | undefined,
  event: MatchEvent,
): boolean {
  return (
    current !== undefined &&
    current.matchId !== event.matchId &&
    event.type === "SetupCreated" &&
    event.sequence === 1
  );
}

async function abortCommit(
  context: ReadonlyDeepCommitContext,
  message: string,
): Promise<never> {
  context.transaction.abort();
  await context.completion.catch(() => undefined);
  throw new Error(message);
}

async function replaceExistingMatch(
  context: ReadonlyDeepCommitContext,
): Promise<void> {
  const current = context.current;
  if (current === undefined) return;
  const oldSnapshotStore = context.transaction.objectStore(SNAPSHOT_STORE);
  const eventStore = context.transaction.objectStore(EVENT_STORE);
  const oldKeys = await requestResult(
    eventStore.index("matchId").getAllKeys(current.matchId),
  );
  oldSnapshotStore.delete(current.matchId);
  oldKeys.forEach((key) => eventStore.delete(key));
}

async function getCommittedHistory(
  transaction: IDBTransaction,
  matchId: string,
): Promise<{
  readonly state: MatchState | undefined;
  readonly events: readonly MatchEvent[];
}> {
  const previousState = await getRecord<MatchState>(
    transaction.objectStore(SNAPSHOT_STORE),
    matchId,
  );
  const previousEvents = await getAllRecords<MatchEvent>(
    transaction.objectStore(EVENT_STORE).index("matchId"),
    matchId,
  );
  return { state: previousState, events: previousEvents };
}

async function validateUndoCommit(
  context: ReadonlyDeepCommitContext,
): Promise<void> {
  if (context.event.type !== "UndoApplied") return;
  const history = await getCommittedHistory(
    context.transaction,
    context.event.matchId,
  );
  const previousState = history.state;
  if (previousState === undefined) {
    return abortCommit(context, "Undo needs the last committed Match State.");
  }
  const preview = getUndoPreview(previousState, history.events);
  if (
    preview === null ||
    preview.target.sequence !== context.event.targetSequence ||
    preview.target.type !== context.event.targetType ||
    !canonicalMatchRecordsEqual(preview.restoredState, context.state)
  ) {
    await abortCommit(
      context,
      "The Undo Event and restored snapshot do not match.",
    );
  }
}

async function validateDerivedCommit(
  context: ReadonlyDeepCommitContext,
): Promise<void> {
  if (
    context.event.type !== "ActionResolved" &&
    context.event.type !== "SimultaneousEliminationRuled"
  ) {
    return;
  }
  const history = await getCommittedHistory(
    context.transaction,
    context.event.matchId,
  );
  if (
    history.state === undefined ||
    !canonicalMatchRecordsEqual(
      restoreStateFromEvents([...history.events, context.event]),
      context.state,
    )
  ) {
    await abortCommit(
      context,
      "The Match Event and committed snapshot do not match.",
    );
  }
}

async function validateExistingCommit(
  context: ReadonlyDeepCommitContext,
): Promise<void> {
  const expectedSequence = context.current ? context.current.sequence + 1 : 1;
  if (
    context.event.sequence !== expectedSequence ||
    (context.current !== undefined &&
      (context.current.matchId !== context.event.matchId ||
        context.current.configurationVersion !==
          context.state.configurationVersion))
  ) {
    await abortCommit(
      context,
      "The new record must continue the committed sequence.",
    );
  }
  await validateUndoCommit(context);
  await validateDerivedCommit(context);
}

function writeEndedSummary(
  transaction: IDBTransaction,
  state: MatchState,
): void {
  const endedState = state as Extract<MatchState, { readonly phase: "ended" }>;
  const summary = toMatchSummary(endedState);
  assertMatchSummaryStructure(summary);
  transaction.objectStore(SUMMARY_STORE).put(summary, LATEST_SUMMARY_KEY);
}

async function writeCommit(context: ReadonlyDeepCommitContext): Promise<void> {
  try {
    context.transaction.objectStore(EVENT_STORE).add(context.event);
    context.transaction.objectStore(SNAPSHOT_STORE).put(context.state);
    context.metadataStore.put(
      {
        matchId: context.state.matchId,
        sequence: context.state.sequence,
        schemaVersion: MATCH_SCHEMA_VERSION,
        configurationVersion: context.state.configurationVersion,
      } satisfies CurrentMatchMetadata,
      CURRENT_MATCH_KEY,
    );
    if (context.event.type === "MatchEnded") {
      writeEndedSummary(context.transaction, context.state);
    }
  } catch (error) {
    context.transaction.abort();
    await context.completion.catch(() => undefined);
    throw error;
  }
  await context.completion;
}

export type MatchStore = {
  readonly commit: (event: MatchEvent, state: MatchState) => Promise<void>;
  readonly restore: () => Promise<RestoredMatch | null>;
  readonly getSummary: () => Promise<MatchSummary | null>;
  readonly deleteSummary: (confirmed: boolean) => Promise<void>;
  readonly deleteMatch: (matchId: string, confirmed: boolean) => Promise<void>;
};

export type IndexedDbMatchStore = MatchStore;

export function createIndexedDbMatchStore(
  factory: IDBFactory = globalThis.indexedDB,
  databaseName = DEFAULT_DATABASE_NAME,
): MatchStore {
  let databasePromise: Promise<IDBDatabase> | null = null;

  function open(): Promise<IDBDatabase> {
    if (databasePromise) return databasePromise;
    const promise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(databaseName, DATABASE_VERSION);
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
    });
    databasePromise = promise;
    return promise;
  }

  async function commit(event: MatchEvent, state: MatchState): Promise<void> {
    assertCommit(event, state, state.configurationVersion);
    const database = await open();
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
    const context: CommitContext = {
      transaction,
      completion,
      metadataStore,
      current,
      event,
      state,
    };
    if (isReplacementCommit(current, event)) {
      await replaceExistingMatch(context);
    } else {
      await validateExistingCommit(context);
    }
    await writeCommit(context);
  }

  async function restore(): Promise<RestoredMatch | null> {
    const database = await open();
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

  async function getSummary(): Promise<MatchSummary | null> {
    const database = await open();
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

  async function deleteSummary(confirmed: boolean): Promise<void> {
    if (!confirmed) throw new Error("Remove confirmation is required.");
    const database = await open();
    const transaction = database.transaction([SUMMARY_STORE], "readwrite");
    const completion = transactionComplete(transaction);
    transaction.objectStore(SUMMARY_STORE).delete(LATEST_SUMMARY_KEY);
    await completion;
  }

  async function deleteMatch(
    matchId: string,
    confirmed: boolean,
  ): Promise<void> {
    if (!confirmed) throw new Error("Discard confirmation is required.");
    const database = await open();
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

  return { commit, restore, getSummary, deleteSummary, deleteMatch };
}
