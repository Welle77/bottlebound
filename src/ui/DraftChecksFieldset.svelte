<script lang="ts">
  import { CHECK_LABELS } from "./ability-draft";
  import { MATCH_CONFIGURATION, type PhysicalAttackCheck } from "../domain/match";
  import { useConsoleContext } from "./console-context";

  const { uiState } = useConsoleContext();

  // Manual physical confirmations shared by the Basic Attack draft and
  // physical-attack ability drafts (T07) — the reactive twin of the duplicated
  // legacy checks fieldset. It renders only while the console-settings toggle
  // demands manual confirmations; each tick replaces the draft snapshot
  // wholesale, exactly like the deleted renderer wiring.
  const draft = $derived(uiState.state.actionDraft);
  const requireManualChecks = $derived(
    uiState.state.physicalConfirmationPreference,
  );

  function handleCheckChange(key: PhysicalAttackCheck): (event: Event) => void {
    return (event) => {
      if (!(event.currentTarget instanceof HTMLInputElement)) return;
      const currentDraft = uiState.state.actionDraft;
      if (!currentDraft) return;
      uiState.setActionDraft({
          ...currentDraft,
          physicalConfirmations: {
            ...currentDraft.physicalConfirmations,
            [key]: event.currentTarget.checked,
          },
      });
    };
  }
</script>

{#if requireManualChecks && draft}
  <fieldset>
    <legend>{MATCH_CONFIGURATION.refereeInstructions.manualPhysicalConfirmations}</legend>
    <div class="check-list">
      {#each CHECK_LABELS as [key, label] (key)}
        <label class="check-control">
          <input
            type="checkbox"
            data-physical-check={key}
            checked={draft.physicalConfirmations[key]}
            onchange={handleCheckChange(key)}
          />
          {label}
        </label>
      {/each}
    </div>
  </fieldset>
{/if}
