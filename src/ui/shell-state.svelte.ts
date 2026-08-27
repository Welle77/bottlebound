/**
 * Runes-backed reactive shell state.
 *
 * Owns every reactive Console cell: the {@link ShellState} snapshot, the
 * rules UI state, and the pending Rules-anchor reveal. Each cell pairs a
 * plain snapshot holder with a `$state` revision counter, so reactivity
 * fires exactly when a cell is replaced wholesale and never on in-place
 * mutation — matching the functional-style discipline: consumers never
 * mutate fields, they install a fresh immutable snapshot. Reads hand back
 * the raw installed snapshot (never a proxy), keeping every object that
 * reaches the domain layer and IndexedDB structured-clone-safe.
 */

import {
  type EndGamePreview,
  type MatchEvent,
  type MatchState,
  type MatchSummary,
  type ProtectiveReactionInput,
} from "../domain/match";
import { RULESET, type PhysicalAttackCheck } from "../domain/ruleset";
import type {
  AppShellCacheState,
  NetworkState,
  ProbeState,
  ServiceWorkerState,
} from "../readiness";
import {
  createRulesUiState,
  type RulesUiState,
} from "../rules-reference/rules-ui-state";
import { loadRequirePhysicalConfirmations } from "./console-settings";

export type Confirmation =
  | "reroll"
  | "discard"
  | "undo"
  | "end"
  | "remove"
  | "remove-summary"
  | "start-new"
  | null;
export interface ActionDraft {
  /** Which command opened this draft; ability drafts resolve through resolveAbility. */
  readonly kind: "basic" | "ability";
  readonly sourceCharacterId: string;
  readonly rulesVersion: string;
  /** The chosen Ruleset ability; null for Basic Attack drafts. */
  readonly abilityId: string | null;
  /**
   * Chosen targets for targeted-attack and ally/enemy/utility ability
   * drafts. Self abilities need none and physical-attack abilities use the
   * ordered bottle contacts instead.
   */
  readonly targets: readonly string[];
  /**
   * Ability draft progression: select-target (targeted/ally/enemy/utility),
   * reactions (targeted-attack only), contacts (physical-attack), review.
   * Basic Attack drafts start at contacts.
   */
  readonly step: "select-target" | "reactions" | "contacts" | "review";
  readonly attackLegs: readonly (readonly string[])[];
  readonly physicalConfirmations: Readonly<
    Record<PhysicalAttackCheck, boolean>
  >;
  readonly reactions: ReadonlyArray<
    ProtectiveReactionInput & { readonly override: string | null }
  >;
  /** Records a state-invalid ability choice (spent, wrong active character, invalid target). */
  readonly abilityOverride: boolean;
  /**
   * A domain error that demands a recorded Override before the ability can
   * commit again; rendered as an explicit Override prompt.
   */
  readonly overrideRequired: string | null;
  readonly majorActionOverride: boolean;
}

export function draftAffectedCharacterIds(
  draft: ActionDraft,
): readonly string[] {
  return draft.attackLegs.flatMap((leg) => leg);
}
export function createPhysicalConfirmations(
  requireManualChecks: boolean,
): Readonly<Record<PhysicalAttackCheck, boolean>> {
  return requireManualChecks
    ? {
        range: false,
        "line-of-sight": false,
        "legal-bottle-contact": false,
        "terrain-contact": false,
      }
    : {
        range: true,
        "line-of-sight": true,
        "legal-bottle-contact": true,
        "terrain-contact": true,
      };
}
export interface ShellState {
  readonly network: NetworkState;
  readonly serviceWorker: ServiceWorkerState;
  readonly appShellCache: AppShellCacheState;
  readonly canonicalStorage: ProbeState;
  readonly storageDetail: string;
  readonly match: MatchState | null;
  readonly events: readonly MatchEvent[];
  readonly matchLoaded: boolean;
  readonly matchError: string | null;
  readonly confirmation: Confirmation;
  readonly endGamePreview: EndGamePreview | null;
  readonly actionDraft: ActionDraft | null;
  readonly abilityPickerOpen: boolean;
  readonly requirePhysicalConfirmations: boolean;
  readonly saving: boolean;
  readonly summary: MatchSummary | null;
}

function createInitialShellState(): ShellState {
  return {
    network: navigator.onLine ? "online" : "offline",
    serviceWorker: "serviceWorker" in navigator ? "registering" : "unsupported",
    appShellCache: "checking",
    canonicalStorage: "checking",
    storageDetail: "Running a write and removal safety check.",
    match: null,
    events: [],
    matchLoaded: false,
    matchError: null,
    confirmation: null,
    endGamePreview: null,
    actionDraft: null,
    abilityPickerOpen: false,
    requirePhysicalConfirmations: loadRequirePhysicalConfirmations(),
    saving: false,
    summary: null,
  };
}

let shellSnapshot = createInitialShellState();
const shellRevision = $state({ n: 0 });

/**
 * Reactive Console snapshot. Reads go through `state.current`; installs go
 * through {@link patchShellState}, the one wholesale-replacement entry.
 */
export const state = {
  get current(): ShellState {
    // Reading the revision counter tracks every wholesale replacement.
    void shellRevision.n;
    return shellSnapshot;
  },
};

let rulesSnapshot = createRulesUiState(RULESET.version);
const rulesRevision = $state({ n: 0 });

/** Reactive rules UI state with explicit wholesale replacement for dialog transitions. */
export const rulesUi = {
  get current(): RulesUiState {
    void rulesRevision.n;
    return rulesSnapshot;
  },
  set(next: RulesUiState): void {
    rulesSnapshot = next;
    rulesRevision.n += 1;
  },
};

let pendingAnchorSnapshot: string | null = null;
const anchorRevision = $state({ n: 0 });

/**
 * Anchor requested through openRules that the next Rules modal mount must
 * reveal; consumed and cleared by the RulesModal component.
 */
export const pendingAnchorReveal = {
  get current(): string | null {
    void anchorRevision.n;
    return pendingAnchorSnapshot;
  },
  set(next: string | null): void {
    pendingAnchorSnapshot = next;
    anchorRevision.n += 1;
  },
};

/** Replace the shell snapshot wholesale with a patched immutable copy. */
export function patchShellState(patch: Partial<ShellState>): void {
  shellSnapshot = { ...shellSnapshot, ...patch };
  shellRevision.n += 1;
}
