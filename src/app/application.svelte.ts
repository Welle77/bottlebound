import {
  acknowledgeElimination,
  assignDisplayNames,
  createSetup,
  dash,
  endMatch,
  finishTurn,
  generateInitiative,
  getEndGamePreview,
  getProtectiveReactionChoices,
  reopenMatch,
  rerollInitiative,
  resolveAbility,
  resolveBasicAttack,
  ruleSimultaneousElimination,
  startMatch,
  undoLastEvent,
  toMatchSummary,
  type CommandResult,
  type MatchState,
  type Team,
} from "../domain/match";
import { deriveReadinessState } from "../readiness";
import { probeValidatedStorage } from "../storage/validated-storage-probe";
import type {
  AppShellCacheState,
  NetworkState,
  ReadinessInputs,
  ServiceWorkerState,
} from "../readiness";
import { abilityInputFromDraft } from "./ability-input";
import type {
  Application,
  ApplicationDependencies,
  ApplicationErrorState,
  ApplicationReadinessState,
  ApplicationState,
  ApplicationValidationState,
  StorageValidationResult,
} from "./application-interface";

const INITIAL_STORAGE_DETAIL = "Validated storage has not been checked.";
const INVALID_MATCH_ERROR =
  "Saved validated data is incompatible, incomplete, or structurally invalid.";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : fallback;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function matchIdFromRandom(
  randomSource: ApplicationDependencies["randomSource"],
): string {
  const value = randomSource.nextUint32();
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(
      "The random source must return an unsigned 32-bit integer.",
    );
  }
  return `match-${value.toString(16).padStart(8, "0")}`;
}

function initialReadiness(): ApplicationReadinessState {
  const inputs: ReadinessInputs = {
    network: "online",
    serviceWorker: "registering",
    appShellCache: "checking",
    validatedStorage: "checking",
  };
  return { ...inputs, ...deriveReadinessState(inputs) };
}

function initialValidation(): ApplicationValidationState {
  return {
    match: "unknown",
    storage: "checking",
    storageDetail: INITIAL_STORAGE_DETAIL,
  };
}

function initialErrors(): ApplicationErrorState {
  return { operation: null, validation: null };
}

function initialState(): ApplicationState {
  return {
    match: null,
    events: [],
    loading: false,
    saving: false,
    validation: initialValidation(),
    errors: initialErrors(),
    readiness: initialReadiness(),
    summary: null,
  };
}

function readinessWith(
  current: ApplicationReadinessState,
  patch: Partial<ReadinessInputs>,
): ApplicationReadinessState {
  const inputs: ReadinessInputs = {
    network: patch.network ?? current.network,
    serviceWorker: patch.serviceWorker ?? current.serviceWorker,
    appShellCache: patch.appShellCache ?? current.appShellCache,
    validatedStorage: patch.validatedStorage ?? current.validatedStorage,
  };
  return { ...inputs, ...deriveReadinessState(inputs) };
}

export function createApplication(
  dependencies: ApplicationDependencies,
): Application {
  let snapshot = initialState();
  let previewCoinFlipResult: Team | undefined;
  const revision = $state({ value: 0 });

  function install(patch: Partial<ApplicationState>): void {
    snapshot = { ...snapshot, ...patch };
    revision.value += 1;
  }

  function readState(): ApplicationState {
    String(revision.value);
    return snapshot;
  }

  function setOperationError(error: unknown, fallback: string): void {
    install({
      errors: {
        ...snapshot.errors,
        operation: errorMessage(error, fallback),
      },
    });
  }

  async function commitResult(result: CommandResult): Promise<boolean> {
    install({
      saving: true,
      errors: { ...snapshot.errors, operation: null },
    });
    try {
      await dependencies.matchStore.commit(result.event, result.state);
      const nextEvents =
        result.event.type === "SetupCreated" && result.event.sequence === 1
          ? [clone(result.event)]
          : [...snapshot.events, clone(result.event)];
      const nextSummary =
        result.event.type === "MatchEnded" && result.state.phase === "ended"
          ? clone(toMatchSummary(result.state))
          : snapshot.summary;
      install({
        match: clone(result.state),
        events: nextEvents,
        summary: nextSummary,
        validation: { ...snapshot.validation, match: "valid" },
        errors: { ...snapshot.errors, operation: null },
      });
      if (result.event.type === "SetupCreated") {
        try {
          install({
            summary: clone(await dependencies.matchStore.getSummary()),
          });
        } catch {
          // A prior summary remains available when its refresh fails.
        }
      }
      return true;
    } catch (error) {
      setOperationError(error, "The Match command could not be saved.");
      return false;
    } finally {
      install({ saving: false });
    }
  }

  async function execute(buildResult: () => CommandResult): Promise<boolean> {
    try {
      return await commitResult(buildResult());
    } catch (error) {
      setOperationError(error, "The Match command is not valid.");
      return false;
    }
  }

  async function load(): Promise<boolean> {
    install({
      loading: true,
      errors: { ...snapshot.errors, validation: null },
    });
    try {
      const restored = await dependencies.matchStore.restore();
      const summary =
        restored?.summary ?? (await dependencies.matchStore.getSummary());
      install({
        match: restored ? clone(restored.state) : null,
        events: restored ? clone(restored.events) : [],
        summary: summary === null ? null : clone(summary),
        validation: { ...snapshot.validation, match: "valid" },
        errors: { ...snapshot.errors, validation: null },
      });
      return true;
    } catch (error) {
      const { summary: currentSummary } = snapshot;
      let summary = currentSummary;
      try {
        const restoredSummary = await dependencies.matchStore.getSummary();
        summary = restoredSummary === null ? null : clone(restoredSummary);
      } catch {
        // The invalid restore result remains the primary application error.
      }
      install({
        match: null,
        events: [],
        summary,
        validation: { ...snapshot.validation, match: "invalid" },
        errors: {
          ...snapshot.errors,
          validation: errorMessage(error, INVALID_MATCH_ERROR),
        },
      });
      return false;
    } finally {
      install({ loading: false });
    }
  }

  async function probeStorage(): Promise<boolean> {
    setStorageValidation({
      status: "checking",
      detail: "Running a write and removal safety check.",
    });
    const result = await probeValidatedStorage();
    setStorageValidation({
      status: result.status,
      detail:
        result.status === "ready"
          ? "The validated write and removal check passed."
          : `${result.reason} The shell remains safe. Retry this check.`,
      ...(result.status === "failed" ? { reason: result.reason } : {}),
    });
    if (result.status !== "ready") return false;
    return snapshot.validation.match === "unknown" ? load() : true;
  }

  function setStorageValidation(result: StorageValidationResult): void {
    const detail = result.detail ?? defaultValidationDetail(result.status);
    const validation: ApplicationValidationState = {
      ...snapshot.validation,
      storage: result.status,
      storageDetail: detail,
    };
    install({
      validation,
      readiness: readinessWith(snapshot.readiness, {
        validatedStorage: result.status,
      }),
      errors: {
        ...snapshot.errors,
        validation:
          result.status === "failed" ? (result.reason ?? detail) : null,
      },
    });
  }

  function defaultValidationDetail(
    status: StorageValidationResult["status"],
  ): string {
    if (status === "ready") return "Validated storage is ready.";
    if (status === "failed") return "Validated storage is unavailable.";
    return INITIAL_STORAGE_DETAIL;
  }

  function setNetworkState(state: NetworkState): void {
    install({
      readiness: readinessWith(snapshot.readiness, { network: state }),
    });
  }

  function setServiceWorkerState(state: ServiceWorkerState): void {
    install({
      readiness: readinessWith(snapshot.readiness, { serviceWorker: state }),
    });
  }

  function setAppShellCacheState(state: AppShellCacheState): void {
    install({
      readiness: readinessWith(snapshot.readiness, { appShellCache: state }),
    });
  }

  function clearErrors(): void {
    install({ errors: initialErrors() });
  }

  async function createMatch(matchId?: string): Promise<boolean> {
    try {
      const nextMatchId =
        matchId ?? matchIdFromRandom(dependencies.randomSource);
      return await commitResult(
        createSetup(nextMatchId, dependencies.clock.now()),
      );
    } catch (error) {
      setOperationError(error, "The Match could not start.");
      return false;
    }
  }

  async function assignNames(
    requested: Readonly<Record<string, string>>,
  ): Promise<boolean> {
    if (snapshot.match?.phase !== "setup") return false;
    return execute(() =>
      assignDisplayNames(
        snapshot.match as Extract<MatchState, { phase: "setup" }>,
        requested,
        dependencies.clock.now(),
      ),
    );
  }

  async function generate(): Promise<boolean> {
    if (snapshot.match?.phase !== "setup") return false;
    return execute(() =>
      generateInitiative(
        snapshot.match as Extract<MatchState, { phase: "setup" }>,
        dependencies.randomSource,
        dependencies.clock.now(),
      ),
    );
  }

  async function reroll(): Promise<boolean> {
    if (snapshot.match?.phase !== "setup") return false;
    return execute(() =>
      rerollInitiative(
        snapshot.match as Extract<MatchState, { phase: "setup" }>,
        dependencies.randomSource,
        { occurredAt: dependencies.clock.now(), confirmed: true },
      ),
    );
  }

  async function start(): Promise<boolean> {
    if (snapshot.match?.phase !== "setup") return false;
    return execute(() =>
      startMatch(
        snapshot.match as Extract<MatchState, { phase: "setup" }>,
        dependencies.clock.now(),
      ),
    );
  }

  async function recordMove(): Promise<boolean> {
    if (snapshot.match?.phase !== "active") return false;
    const sourceCharacterId =
      snapshot.match.initiative[snapshot.match.activeSlot - 1]?.characterId;
    if (!sourceCharacterId) return false;
    return execute(() =>
      dash(
        snapshot.match as Extract<MatchState, { phase: "active" }>,
        sourceCharacterId,
        dependencies.clock.now(),
      ),
    );
  }

  async function finish(): Promise<boolean> {
    if (snapshot.match?.phase !== "active") return false;
    return execute(() =>
      finishTurn(
        snapshot.match as Extract<MatchState, { phase: "active" }>,
        dependencies.clock.now(),
      ),
    );
  }

  async function acknowledge(team: Team): Promise<boolean> {
    if (snapshot.match?.phase !== "active") return false;
    return execute(() =>
      acknowledgeElimination(
        snapshot.match as Extract<MatchState, { phase: "active" }>,
        team,
        dependencies.clock.now(),
      ),
    );
  }

  async function rule(outcome: Team | "draw"): Promise<boolean> {
    if (snapshot.match?.phase !== "active") return false;
    return execute(() =>
      ruleSimultaneousElimination(
        snapshot.match as Extract<MatchState, { phase: "active" }>,
        outcome,
        {
          overrideEvidence:
            "The authoritative rules do not define simultaneous Team Elimination; the referee selected this recorded override.",
          occurredAt: dependencies.clock.now(),
        },
      ),
    );
  }

  async function resolveBasic(
    input: Parameters<typeof resolveBasicAttack>[1],
  ): Promise<boolean> {
    if (snapshot.match?.phase !== "active") return false;
    return execute(() =>
      resolveBasicAttack(
        snapshot.match as Extract<MatchState, { phase: "active" }>,
        input,
        dependencies.clock.now(),
      ),
    );
  }

  async function resolveAbilityInput(
    input: import("./ability-input").AbilityDraftInput,
  ): Promise<boolean> {
    if (snapshot.match?.phase !== "active") return false;
    return execute(() =>
      resolveAbility(
        snapshot.match as Extract<MatchState, { phase: "active" }>,
        abilityInputFromDraft(input),
        dependencies.clock.now(),
      ),
    );
  }

  /** @returns The preview when available, otherwise null. */
  function previewEndGame(): ReturnType<typeof getEndGamePreview> | null {
    if (snapshot.match?.phase !== "active") return null;
    try {
      const preview = getEndGamePreview(
        snapshot.match,
        dependencies.randomSource,
      );
      previewCoinFlipResult = preview.coinFlipResult;
      return clone(preview);
    } catch (error) {
      previewCoinFlipResult = undefined;
      setOperationError(error, "The End Game preview is not available.");
      return null;
    }
  }

  async function end(): Promise<boolean> {
    if (snapshot.match?.phase !== "active") return false;
    const expected = previewCoinFlipResult;
    const random =
      expected === undefined
        ? dependencies.randomSource
        : { nextUint32: (): number => (expected === "Drow" ? 0 : 1) };
    const completed = await execute(() =>
      endMatch(snapshot.match as Extract<MatchState, { phase: "active" }>, {
        occurredAt: dependencies.clock.now(),
        confirmed: true,
        random,
      }),
    );
    if (completed) previewCoinFlipResult = undefined;
    return completed;
  }

  async function reopen(): Promise<boolean> {
    if (snapshot.match?.phase !== "ended") return false;
    return execute(() =>
      reopenMatch(
        snapshot.match as Extract<MatchState, { phase: "ended" }>,
        dependencies.clock.now(),
      ),
    );
  }

  async function undo(): Promise<boolean> {
    if (snapshot.match === null) return false;
    return execute(() =>
      undoLastEvent(snapshot.match as MatchState, snapshot.events, {
        occurredAt: dependencies.clock.now(),
        confirmed: true,
      }),
    );
  }

  async function deleteSummary(): Promise<boolean> {
    install({ saving: true, errors: { ...snapshot.errors, operation: null } });
    try {
      await dependencies.matchStore.deleteSummary(true);
      install({ summary: null });
      return true;
    } catch (error) {
      setOperationError(error, "The Match Summary could not be removed.");
      return false;
    } finally {
      install({ saving: false });
    }
  }

  async function deleteMatch(matchId: string): Promise<boolean> {
    install({ saving: true, errors: { ...snapshot.errors, operation: null } });
    try {
      await dependencies.matchStore.deleteMatch(matchId, true);
      const isCurrentMatch = snapshot.match?.matchId === matchId;
      const shouldClearSummary =
        isCurrentMatch && snapshot.match?.phase === "ended";
      const summary = shouldClearSummary
        ? null
        : clone(await dependencies.matchStore.getSummary());
      install({
        match: isCurrentMatch ? null : snapshot.match,
        events: isCurrentMatch ? [] : snapshot.events,
        summary,
      });
      return true;
    } catch (error) {
      setOperationError(error, "The Match could not be removed.");
      return false;
    } finally {
      install({ saving: false });
    }
  }

  function reactionChoices(
    affectedCharacterIds: readonly import("../domain/match").CharacterId[],
    selectedReactions: readonly import("../domain/match").ProtectiveReactionInput[] = [],
    physicalAttack = true,
  ): readonly import("../domain/match").ProtectiveReactionChoice[] {
    if (snapshot.match?.phase !== "active") return [];
    return clone(
      getProtectiveReactionChoices(snapshot.match, affectedCharacterIds, {
        selectedReactions,
        physicalAttack,
      }),
    );
  }

  return {
    get state(): ApplicationState {
      return readState();
    },
    load,
    probeStorage,
    createMatch,
    assignDisplayNames: assignNames,
    generateInitiative: generate,
    rerollInitiative: reroll,
    startMatch: start,
    recordMove,
    finishTurn: finish,
    acknowledgeElimination: acknowledge,
    ruleSimultaneousElimination: rule,
    resolveBasicAttack: resolveBasic,
    resolveAbility: resolveAbilityInput,
    previewEndGame,
    endMatch: end,
    reopenMatch: reopen,
    undoLastEvent: undo,
    deleteSummary,
    deleteMatch,
    getProtectiveReactionChoices: reactionChoices,
    setStorageValidation,
    setNetworkState,
    setServiceWorkerState,
    setAppShellCacheState,
    clearErrors,
  };
}
