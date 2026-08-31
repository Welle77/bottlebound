<script lang="ts">
import { getUndoPreview } from "../domain/match";
import type { ReversibleMatchEvent } from "../domain/match";
import { confirmAction } from "../app/actions";
import { patchShellState, state } from "./shell-state.svelte";

  // Undo uses a compact modal because the referee only needs to confirm the
  // destructive history change. The complete restored state remains owned by
  // the domain preview and does not need to fill the active match surface.
  const TARGET_LABELS: Record<ReversibleMatchEvent["type"], string> = {
    DisplayNamesAssigned: "Assign Display Names",
    InitiativeGenerated: "Generate Initiative",
    InitiativeRerolled: "Reroll Initiative",
    MatchStarted: "Start Match",
    TurnFinished: "Finish Turn",
    Dashed: "Move",
    ActionResolved: "Action Resolution",
    EliminationContinued: "Continue",
    SimultaneousEliminationRuled: "Simultaneous Elimination Ruling",
    MatchReopened: "Reopen Match",
  };

  const preview = $derived.by(() => {
    if (state.current.confirmation !== "undo") return null;
    if (state.current.match === null) return null;
    return getUndoPreview(state.current.match, state.current.events);
  });
  const targetLabel = $derived(
    preview ? TARGET_LABELS[preview.target.type] : "",
  );
  function handleCancel(): void {
    patchShellState({ confirmation: null });
  }
</script>

{#if preview}
  <section
    class="undo-modal"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="confirmation-heading"
    aria-describedby="confirmation-detail"
  >
    <p class="eyebrow">Confirmation required</p>
    <h3 id="confirmation-heading">Undo {targetLabel}?</h3>
    <p id="confirmation-detail">
      Are you sure you want to undo this action? The last committed change will
      be removed and the previous Match state will be restored.
    </p>
    <div class="button-row">
      <button
        id="confirm-action"
        class="danger-action"
        type="button"
        onclick={() => void confirmAction()}
      >
        Confirm Undo
      </button>
      <button
        id="cancel-action"
        class="secondary-action"
        type="button"
        onclick={handleCancel}
      >
        Cancel
      </button>
    </div>
  </section>
{/if}
