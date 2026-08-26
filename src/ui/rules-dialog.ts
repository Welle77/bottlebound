import { RULESET } from "../domain/ruleset";
import { retainRulesVersion } from "../rules-reference/rules-ui-state";
import { pendingAnchorReveal, rulesUi, state } from "./shell-state.svelte";

/**
 * Applies main's inert flag synchronously with the dialog transition.
 * Closing the Rules dialog refocuses its opener immediately after this runs;
 * a deferred component-reactive binding would make that focus() a silent
 * no-op while main is still inert (T04 learning), so the transition owns
 * the toggle now that the legacy renderer is gone (T10).
 */
function applyDialogInert(open: boolean): void {
  const shellMain = document.querySelector<HTMLElement>("main.shell");
  shellMain?.toggleAttribute("inert", open);
}

/**
 * Opens the Rules modal through the reactive rules UI state; the
 * RulesModal component renders it. An optional anchor selects and reveals
 * that section once the modal mounts. Retaining pins the stored rules UI
 * state to the active Match's Ruleset version so a restored Match with
 * unbundled rules never inherits stale search or selection context from
 * another version.
 */
export function openRules(
  opener: HTMLElement,
  anchor: string | null = null,
): void {
  const version = state.current.match?.rulesVersion ?? RULESET.version;
  const retained = retainRulesVersion(rulesUi.current, version);
  rulesUi.set({ ...retained, open: true, openerId: opener.id });
  if (anchor) {
    rulesUi.set({
      ...rulesUi.current,
      selectedAnchor: anchor,
      scrollTop: 0,
    });
    pendingAnchorReveal.set(anchor);
  }
  applyDialogInert(true);
}

/**
 * Closes the Rules modal and refocuses its opener. main's inert flag must
 * clear synchronously — the refocus below would be a silent no-op while
 * main is still inert (T04 learning).
 */
export function closeRules(): void {
  const openerId = rulesUi.current.openerId;
  rulesUi.set({ ...rulesUi.current, open: false });
  applyDialogInert(false);
  if (openerId) document.getElementById(openerId)?.focus();
}
