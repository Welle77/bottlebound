import { openRulesWithQuery } from "../rules-reference/rules-ui-state";
import { rulesUi } from "./shell-state.svelte";

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
 * RulesModal component renders the one current bundled guide. An optional
 * application-owned query starts the modal in search mode.
 */
export function openRules(opener: HTMLElement, query?: string): void {
  rulesUi.set(
    query === undefined
      ? { ...rulesUi.current, open: true, openerId: opener.id }
      : openRulesWithQuery({ ...rulesUi.current, openerId: opener.id }, query),
  );
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
