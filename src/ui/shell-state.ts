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
  targets: string[];
  /**
   * Ability draft progression: select-target (targeted/ally/enemy/utility),
   * reactions (targeted-attack only), contacts (physical-attack), review.
   * Basic Attack drafts start at contacts.
   */
  step: "select-target" | "reactions" | "contacts" | "review";
  attackLegs: string[][];
  physicalConfirmations: Record<PhysicalAttackCheck, boolean>;
  reactions: Array<
    ProtectiveReactionInput & { readonly override: string | null }
  >;
  /** Records a state-invalid ability choice (spent, wrong active character, invalid target). */
  abilityOverride: boolean;
  /**
   * A domain error that demands a recorded Override before the ability can
   * commit again; rendered as an explicit Override prompt.
   */
  overrideRequired: string | null;
  majorActionOverride: boolean;
}

export function draftAffectedCharacterIds(draft: ActionDraft): string[] {
  return draft.attackLegs.flatMap((leg) => leg);
}
export function createPhysicalConfirmations(
  requireManualChecks: boolean,
): Record<PhysicalAttackCheck, boolean> {
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
  network: NetworkState;
  serviceWorker: ServiceWorkerState;
  appShellCache: AppShellCacheState;
  canonicalStorage: ProbeState;
  storageDetail: string;
  match: MatchState | null;
  events: readonly MatchEvent[];
  matchLoaded: boolean;
  matchError: string | null;
  confirmation: Confirmation;
  endGamePreview: EndGamePreview | null;
  actionDraft: ActionDraft | null;
  abilityPickerOpen: boolean;
  requirePhysicalConfirmations: boolean;
  saving: boolean;
  summary: MatchSummary | null;
}

export const state: ShellState = {
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
export let rulesUi = createRulesUiState(RULESET.version);

export function replaceRulesUi(next: RulesUiState): void {
  rulesUi = next;
}
export const matchStore = new IndexedDbMatchStore();
const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("The Referee Console root element is missing.");
export const appRoot: HTMLDivElement = root;
