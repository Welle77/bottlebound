import {
  type EndGamePreview,
  type MatchEvent,
  type MatchState,
  type MatchSummary,
  type ProtectiveReactionInput,
} from "../domain/match";
import { RULESET } from "../domain/ruleset";
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
  readonly step: "contacts" | "review";
  readonly attackLegs: readonly (readonly string[])[];
  readonly physicalConfirmations: {
    readonly range: boolean;
    readonly "line-of-sight": boolean;
    readonly "legal-bottle-contact": boolean;
    readonly "terrain-contact": boolean;
  };
  readonly reactions: ReadonlyArray<
    ProtectiveReactionInput & { readonly override: string | null }
  >;
  readonly majorActionOverride: boolean;
}

export function draftAffectedCharacterIds(
  draft: ActionDraft,
): readonly string[] {
  return draft.attackLegs.flatMap((leg) => leg);
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
