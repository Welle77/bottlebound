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
import { IndexedDbMatchStore } from "../storage/match-store";
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

/**
 * The one deliberate mutability cell in the Console. Its contents are always
 * replaced wholesale with immutable snapshots; consumers never mutate fields,
 * they call {@link Ref.set} with a new object.
 */
export class Ref<T> {
  #value: T;
  constructor(value: T) {
    this.#value = value;
  }
  get current(): T {
    return this.#value;
  }
  set(next: T): void {
    this.#value = next;
  }
}

export const state = new Ref<ShellState>({
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
});
export const rulesUi = new Ref<RulesUiState>(
  createRulesUiState(RULESET.version),
);

/** Replace the shell snapshot wholesale with a patched immutable copy. */
export function patchShellState(patch: Partial<ShellState>): void {
  state.set({ ...state.current, ...patch });
}
export const matchStore = new IndexedDbMatchStore();
const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("The Referee Console root element is missing.");
export const appRoot: HTMLDivElement = root;
