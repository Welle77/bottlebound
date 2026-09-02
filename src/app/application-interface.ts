import type {
  BasicAttackInput,
  CharacterId,
  EndGamePreview,
  MatchEvent,
  MatchState,
  MatchSummary,
  ProtectiveReactionInput,
  ProtectiveReactionChoice,
  RandomSource,
  Team,
} from "../domain/match";
import type {
  AppShellCacheState,
  NetworkState,
  ProbeState,
  ServiceWorkerState,
  ReadinessState,
} from "../readiness";
import type { MatchStore } from "../storage/match-store";
import type { AbilityDraftInput } from "./ability-input";

export type { AbilityDraftInput } from "./ability-input";

export type ApplicationClock = {
  readonly now: () => string;
};

export type ApplicationDependencies = {
  readonly matchStore: MatchStore;
  readonly clock: ApplicationClock;
  readonly randomSource: RandomSource;
};

export type MatchValidationState = "unknown" | "valid" | "invalid";

export type ApplicationValidationState = {
  readonly match: MatchValidationState;
  readonly storage: ProbeState;
  readonly storageDetail: string;
};

export type ApplicationErrorState = {
  readonly operation: string | null;
  readonly validation: string | null;
};

export type ApplicationReadinessState = ReadinessState & {
  readonly appShellCache: AppShellCacheState;
};

export type ApplicationState = {
  readonly match: MatchState | null;
  readonly events: readonly MatchEvent[];
  readonly loading: boolean;
  readonly saving: boolean;
  readonly validation: ApplicationValidationState;
  readonly errors: ApplicationErrorState;
  readonly readiness: ApplicationReadinessState;
  readonly summary: MatchSummary | null;
};

export type StorageValidationResult = {
  readonly status: ProbeState;
  readonly detail?: string;
  readonly reason?: string;
};

export type ApplicationStateAccess = {
  readonly state: ApplicationState;
};

export type ApplicationOperations = {
  readonly load: () => Promise<boolean>;
  readonly probeStorage: () => Promise<boolean>;
  readonly createMatch: (matchId?: string) => Promise<boolean>;
  readonly assignDisplayNames: (
    requested: Readonly<Record<string, string>>,
  ) => Promise<boolean>;
  readonly generateInitiative: () => Promise<boolean>;
  readonly rerollInitiative: () => Promise<boolean>;
  readonly startMatch: () => Promise<boolean>;
  readonly recordMove: () => Promise<boolean>;
  readonly finishTurn: () => Promise<boolean>;
  readonly acknowledgeElimination: (team: Team) => Promise<boolean>;
  readonly ruleSimultaneousElimination: (
    outcome: Team | "draw",
  ) => Promise<boolean>;
  readonly resolveBasicAttack: (input: BasicAttackInput) => Promise<boolean>;
  readonly resolveAbility: (input: AbilityDraftInput) => Promise<boolean>;
  readonly previewEndGame: () => EndGamePreview | null;
  readonly endMatch: () => Promise<boolean>;
  readonly reopenMatch: () => Promise<boolean>;
  readonly undoLastEvent: () => Promise<boolean>;
  readonly deleteSummary: () => Promise<boolean>;
  readonly deleteMatch: (matchId: string) => Promise<boolean>;
  readonly getProtectiveReactionChoices: (
    affectedCharacterIds: readonly CharacterId[],
    selectedReactions?: readonly ProtectiveReactionInput[],
    physicalAttack?: boolean,
  ) => readonly ProtectiveReactionChoice[];
  readonly setStorageValidation: (result: StorageValidationResult) => void;
  readonly setNetworkState: (state: NetworkState) => void;
  readonly setServiceWorkerState: (state: ServiceWorkerState) => void;
  readonly setAppShellCacheState: (state: AppShellCacheState) => void;
  readonly clearErrors: () => void;
};

export type Application = ApplicationStateAccess & ApplicationOperations;
