<script lang="ts">
  import ConfirmationDialog from "./ConfirmationDialog.svelte";
  import PriorSummaryCard from "./PriorSummaryCard.svelte";
  import UndoConfirmation from "./UndoConfirmation.svelte";
  import { useConsoleContext } from "./console-context";

  const {
    showEndGameControl,
    hasSummary,
    requestEndGame,
  }: {
    showEndGameControl: boolean;
    hasSummary: boolean;
    requestEndGame: () => void;
  } = $props();

  const { uiState } = useConsoleContext();
</script>

{#if showEndGameControl}
  <section
    class="end-game-control"
    aria-labelledby="end-game-heading"
    data-surface-order="end-game"
  >
    <h3 id="end-game-heading">End Game</h3>
    <p>Close the Match with the calculated winner and Decision Basis.</p>
    <button
      id="request-end-game"
      class="secondary-action"
      type="button"
      onclick={requestEndGame}
    >
      End Game
    </button>
  </section>
{/if}
{#if hasSummary}
  <PriorSummaryCard />
{/if}
{#if uiState.state.confirmation === "undo"}
  <UndoConfirmation />
{:else}
  <ConfirmationDialog />
{/if}
