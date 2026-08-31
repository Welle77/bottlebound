<script lang="ts">
  import { saveRequirePhysicalConfirmations } from "./console-settings";
  import { openRules } from "./rules-dialog";
  import {
    createPhysicalConfirmations,
    patchShellState,
    state,
  } from "./shell-state.svelte";

  // The console-setting control belongs to the pre-Match shell; it hides as
  // soon as a Match is open, exactly like the deleted legacy template did.
  const matchOpen = $derived(state.current.match !== null);

  function handleOpenRules(event: MouseEvent): void {
    if (!(event.currentTarget instanceof HTMLButtonElement)) return;
    openRules(event.currentTarget);
  }

  function handleRequirePhysicalConfirmationsChange(event: Event): void {
    if (!(event.currentTarget instanceof HTMLInputElement)) return;
    const requireManualChecks = event.currentTarget.checked;
    const currentDraft = state.current.actionDraft;
    patchShellState({
      requirePhysicalConfirmations: requireManualChecks,
      ...(currentDraft && !requireManualChecks
        ? {
            actionDraft: {
              ...currentDraft,
              physicalConfirmations: createPhysicalConfirmations(false),
            },
          }
        : {}),
    });
    saveRequirePhysicalConfirmations(requireManualChecks);
  }
</script>

<header class="hero">
  <div class="hero-heading">
    <div>
      <p class="eyebrow">BOTTLEBOUND</p>
      <h1>Referee Console</h1>
    </div>
    <button
      id="open-rules"
      class="secondary-action"
      type="button"
      onclick={handleOpenRules}
    >
      Rules
    </button>
  </div>
  {#if !matchOpen}
    <label class="console-setting">
      <input
        id="require-physical-confirmations"
        type="checkbox"
        checked={state.current.requirePhysicalConfirmations}
        onchange={handleRequirePhysicalConfirmationsChange}
      />
      Require manual physical confirmations
    </label>
  {/if}
</header>
