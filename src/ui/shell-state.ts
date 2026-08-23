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
  readonly sourceCharacterId: string;
  readonly rulesVersion: string;
  step: "contacts" | "review";
  attackLegs: string[][];
  physicalConfirmations: Record<PhysicalAttackCheck, boolean>;
  reactions: Array<
    ProtectiveReactionInput & { readonly override: string | null }
  >;
  majorActionOverride: boolean;
}

export function draftAffectedCharacterIds(draft: ActionDraft): string[] {
  return draft.attackLegs.flatMap((leg) => leg);
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
