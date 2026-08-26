import { IndexedDbMatchStore } from "../storage/match-store";

// Application singletons that outlive every surface: the canonical Match
// store and the mounted application root element. Reactive Console state
// lives in src/ui/shell-state.svelte.ts; this module only holds the
// non-reactive wiring the command layer and entry point share.
export const matchStore = new IndexedDbMatchStore();
const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("The Referee Console root element is missing.");
export const appRoot: HTMLDivElement = root;
