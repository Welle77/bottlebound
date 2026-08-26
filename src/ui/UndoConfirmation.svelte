<script lang="ts">
  import { getUndoPreview } from "../domain/match";
  import type { ReversibleMatchEvent } from "../domain/match";
  import { confirmAction } from "../app/actions";
  import { openRules } from "./rules-dialog";
  import { patchShellState, state } from "./shell-state.svelte";
  import UndoStatePanel from "./UndoStatePanel.svelte";

  // Converted undo confirmation (T06): the alertdialog wrapper around the
  // two reactive undo-state panels, previously the undo branch of the legacy
  // confirmationPanel() template. Since T08 every other confirmation is the
  // converted ConfirmationDialog component.
  const TARGET_LABELS: Record<ReversibleMatchEvent["type"], string> = {
    DisplayNamesAssigned: "Assign Display Names",
    InitiativeGenerated: "Generate Initiative",
    InitiativeRerolled: "Reroll Initiative",
    MatchStarted: "Start Match",
    TurnFinished: "Finish Turn",
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
  const sourceAnchor = $derived.by(() => {
    if (!preview) return "";
    return preview.target.type === "TurnFinished" ||
      preview.target.type === "MatchStarted" ||
      preview.target.type === "ActionResolved"
      ? "section-7-turn-structure-movement"
      : "section-6-initiative-game-clock";
  });

  function handleOpenRules(event: MouseEvent): void {
    if (!(event.currentTarget instanceof HTMLButtonElement)) return;
    openRules(event.currentTarget, sourceAnchor);
  }

  function handleCancel(): void {
    if (state.current.confirmation === "end") {
      patchShellState({ endGamePreview: null });
    }
    patchShellState({ confirmation: null });
  }
</script>

{#if preview}
  <!-- Legacy parity: the confirmation wrapper keeps its alertdialog role on
       a section element exactly as the deleted template rendered it. -->
  <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
  <section
    class="confirmation-panel undo-confirmation"
    role="alertdialog"
    aria-labelledby="confirmation-heading"
    aria-describedby="confirmation-detail"
  >
    <div>
      <p class="eyebrow">Confirmation required</p>
      <h3 id="confirmation-heading">Undo {targetLabel}?</h3>
      <p id="confirmation-detail">
        Check the complete committed state and the complete state that Undo
        will restore.
      </p>
      <button
        id="rules-undo"
        class="rules-context-link"
        type="button"
        data-open-rules-anchor={sourceAnchor}
        onclick={handleOpenRules}
      >
        Undo rules
      </button>
    </div>
    <div class="undo-comparison">
      <UndoStatePanel match={preview.currentState} current />
      <UndoStatePanel match={preview.restoredState} current={false} />
    </div>
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
