<script lang="ts">
  import { saveRequirePhysicalConfirmations } from "./console-settings";
  import { useConsoleContext } from "./console-context";
  import { openRules } from "./rules-dialog";

  const { application, uiState } = useConsoleContext();

  // The console-setting control belongs to the pre-Match shell; it hides as
  // soon as a Match is open, exactly like the deleted legacy template did.
  const matchOpen = $derived(application.state.match !== null);

  function handleOpenRules(event: MouseEvent): void {
    if (!(event.currentTarget instanceof HTMLButtonElement)) return;
    openRules(uiState, event.currentTarget);
  }

  function handleRequirePhysicalConfirmationsChange(event: Event): void {
    if (!(event.currentTarget instanceof HTMLInputElement)) return;
    const requireManualChecks = event.currentTarget.checked;
    const currentDraft = uiState.state.actionDraft;
    uiState.setPhysicalConfirmationPreference(requireManualChecks);
    if (currentDraft && !requireManualChecks) {
      uiState.setActionDraft({
        ...currentDraft,
        physicalConfirmations: {
          range: true,
          "line-of-sight": true,
          "legal-bottle-contact": true,
          "terrain-contact": true,
        },
      });
    }
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
        checked={uiState.state.physicalConfirmationPreference}
        onchange={handleRequirePhysicalConfirmationsChange}
      />
      Require manual physical confirmations
    </label>
  {/if}
</header>
