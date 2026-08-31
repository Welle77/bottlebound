import {
  MATCH_SCHEMA_VERSION,
  validatedMatchRecordsEqual,
  getUndoPreview,
  restoreStateFromEvents,
  toMatchSummary,
  type MatchEvent,
  type EndedMatchState,
  type MatchState,
  type MatchSummary,
} from "../domain/match";
import {
  assertCommit,
  assertRestoredMatch,
} from "./match-store-validated-commit";
import * as z from "zod";
import {
  matchEventSchema,
  matchStateSchema,
  matchSummarySchema,
} from "./match-store-schemas";

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

const currentMatchMetadataSchema: z.ZodType<CurrentMatchMetadata> = z.object({
  matchId: z.string(),
  sequence: z.number().int(),
  schemaVersion: z.number().int(),
  configurationVersion: z.string(),
});

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
  schema: z.ZodType<T>,
): Promise<T | undefined> {
  return requestResult(store.get(key)).then((value) => {
    if (value === undefined) return undefined;
    try {
      return schema.parse(value);
    } catch (error) {
      throw new Error("Saved validated data is structurally invalid.", {
        cause: error,
      });
    }
  });
}

function getAllRecords<T>(
  source: IDBObjectStore | IDBIndex,
  schema: z.ZodType<T>,
  key?: IDBValidKey,
): Promise<readonly T[]> {
  const request = key === undefined ? source.getAll() : source.getAll(key);
  return requestResult(request).then((value) => {
    try {
      return schema.array().parse(value);
    } catch (error) {
      throw new Error("Saved validated data is structurally invalid.", {
        cause: error,
      });
    }
  });
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
  const oldSnapshotStore = context.transaction.objectStore(SNAPSHOT_STORE);
  const eventStore = context.transaction.objectStore(EVENT_STORE);
  const snapshotKeys = await requestResult(oldSnapshotStore.getAllKeys());
  const eventKeys = await requestResult(eventStore.getAllKeys());
  snapshotKeys.forEach((key) => oldSnapshotStore.delete(key));
  eventKeys.forEach((key) => eventStore.delete(key));
}

async function getCommittedHistory(
  transaction: IDBTransaction,
  matchId: string,
): Promise<{
  readonly state: MatchState | undefined;
  readonly events: readonly MatchEvent[];
}> {
  const previousStateRaw = await getRecord(
    transaction.objectStore(SNAPSHOT_STORE),
    matchId,
    matchStateSchema,
  );
  const previousEvents = await getAllRecords(
    transaction.objectStore(EVENT_STORE).index("matchId"),
    matchEventSchema,
    matchId,
  );
  return { state: previousStateRaw, events: previousEvents };
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
    !validatedMatchRecordsEqual(preview.restoredState, context.state)
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
    !validatedMatchRecordsEqual(
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
  state: EndedMatchState,
): void {
  const summary = toMatchSummary(state);
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
    if (
      context.event.type === "MatchEnded" &&
      context.state.phase === "ended"
    ) {
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
      currentMatchMetadataSchema,
    );
    const savedSnapshotKeys = await requestResult(
      transaction.objectStore(SNAPSHOT_STORE).getAllKeys(),
    );
    const savedEventKeys = await requestResult(
      transaction.objectStore(EVENT_STORE).getAllKeys(),
    );
    const context: CommitContext = {
      transaction,
      completion,
      metadataStore,
      current,
      event,
      state,
    };
    if (
      event.type === "SetupCreated" &&
      event.sequence === 1 &&
      (current !== undefined ||
        savedSnapshotKeys.length > 0 ||
        savedEventKeys.length > 0)
    ) {
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
    const metadata = await getRecord(
      transaction.objectStore(METADATA_STORE),
      CURRENT_MATCH_KEY,
      currentMatchMetadataSchema,
    );
    const allSnapshots = await getAllRecords(
      transaction.objectStore(SNAPSHOT_STORE),
      matchStateSchema,
      undefined,
    );
    const allEvents = await getAllRecords(
      transaction.objectStore(EVENT_STORE),
      matchEventSchema,
      undefined,
    );
    const summary = await getRecord(
      transaction.objectStore(SUMMARY_STORE),
      LATEST_SUMMARY_KEY,
      matchSummarySchema,
    );
    const restoredSummary: MatchSummary | null = summary ?? null;
    if (metadata === undefined) {
      if (allSnapshots.length > 0 || allEvents.length > 0) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new Error("Saved validated data is incomplete.");
      }
      await completion;
      if (restoredSummary !== null) {
        // Prior summary persists without an Active Ended snapshot
        // Expose via getSummary; restore signals no Active Match
        return null;
      }
      return null;
    }
    const [state] = allSnapshots;
    if (allSnapshots.length !== 1) {
      transaction.abort();
      await completion.catch(() => undefined);
      throw new Error("Saved validated data has an invalid snapshot count.");
    }
    // Single-schema persistence: anything that does not validate as the
    // current schema is rejected through the existing restore error path.
    const restored = assertRestoredMatch(metadata, state, allEvents);
    await completion;
    return {
      state: restored.state,
      events: restored.events,
      summary: restoredSummary,
    };
  }

  async function getSummary(): Promise<MatchSummary | null> {
    const database = await open();
    const transaction = database.transaction([SUMMARY_STORE], "readonly");
    const completion = transactionComplete(transaction);
    const raw = await getRecord(
      transaction.objectStore(SUMMARY_STORE),
      LATEST_SUMMARY_KEY,
      matchSummarySchema,
    );
    await completion;
    if (raw === undefined) return null;
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
      currentMatchMetadataSchema,
    );
    if (metadata !== undefined && metadata.matchId !== matchId) {
      transaction.abort();
      await completion.catch(() => undefined);
      throw new Error("The requested Match is not the saved Match.");
    }
    metadataStore.delete(CURRENT_MATCH_KEY);
    const snapshot = await getRecord(
      transaction.objectStore(SNAPSHOT_STORE),
      matchId,
      matchStateSchema,
    );
    const shouldDeleteSummary =
      snapshot !== undefined && snapshot.phase === "ended";
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
