<script lang="ts">
  import { getUndoPreview } from "../domain/match";
  import { useConsoleContext } from "./console-context";
  import { openRules } from "./rules-dialog";
  import type { UiConfirmation } from "./ui-state";
  import ConfirmationDialog from "./ConfirmationDialog.svelte";
  import DisplayNamesEditor from "./DisplayNamesEditor.svelte";
  import PriorSummaryCard from "./PriorSummaryCard.svelte";
  import RosterTable from "./RosterTable.svelte";
  import UndoConfirmation from "./UndoConfirmation.svelte";

  const { application, uiState } = useConsoleContext();

  // Converted setup surface (T05): the whole Initiative Setup panel reacts
  // to the runes store instead of being swapped as legacy template HTML.
  // Rendered only while the shell snapshot holds a setup-phase Match.
  const match = $derived(
    application.state.match?.phase === "setup" ? application.state.match : null,
  );
  const saving = $derived(application.state.saving);
  const matchError = $derived(application.state.errors.operation);
  const summary = $derived(application.state.summary);
  const canUndo = $derived(
    match !== null &&
      !saving &&
      getUndoPreview(match, application.state.events) !== null,
  );

  function requestConfirmation(
    confirmation: Exclude<UiConfirmation, null>,
  ): void {
    uiState.requestConfirmation(confirmation);
  }

  async function generate(): Promise<void> {
    await application.generateInitiative();
  }

  async function start(): Promise<void> {
    await application.startMatch();
  }

  function handleDelegatedClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    // Transport for the setup panel's contextual Rules queries, which carry
    // no individual listeners; every other control below is a real wired
    // button/input.
    const anchorButton = target.closest<HTMLElement>(
      "[data-open-rules-query]",
    );
    if (anchorButton) {
      openRules(uiState, anchorButton, anchorButton.dataset.openRulesQuery);
    }
  }
</script>

{#if match}
  <!-- Delegation transport only: the listener routes the contextual rules
       anchor buttons; every visible control below is a real wired
       button/input. -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <section
    class="match-panel"
    aria-labelledby="setup-heading"
    onclick={handleDelegatedClick}
  >
    <div class="section-heading">
      <div>
        <p class="eyebrow">Setup · Sequence {match.sequence}</p>
        <h2 id="setup-heading">Initiative Setup</h2>
        <p>
          {match.initiative
            ? "The complete committed order is ready. Exact ties use recorded digital coin flips."
            : "All characters start at full HP. Generate the complete order when ready."}
        </p>
        <div class="rules-context-links">
          {#if match.initiative}
            <button
              id="rules-tie-break"
              class="rules-context-link"
              type="button"
             data-open-rules-query="Initiative"
            >
              Exact tie-break rules
            </button>
          {:else}
            <button
              id="rules-initiative"
              class="rules-context-link"
              type="button"
              data-open-rules-query="Initiative"
            >
              Initiative rules
            </button>
          {/if}
        </div>
      </div>
      <span class="readiness-badge" data-state="ready">Saved</span>
    </div>
    {#if matchError}
      <p class="blocking-error" role="alert">
        {matchError}
        The last committed Setup remains visible.
      </p>
    {/if}
    <RosterTable {match} />
    <DisplayNamesEditor {match} />
    <div class="match-actions">
      {#if match.initiative}
        <button
          id="start-match"
          class="primary-action"
          type="button"
          onclick={() => void start()}
        >
          Start Match
        </button>
        <button
          id="request-reroll"
          class="secondary-action"
          type="button"
          onclick={() => requestConfirmation("reroll")}
        >
          Reroll initiative
        </button>
      {:else}
        <button
          id="generate-initiative"
          class="primary-action"
          type="button"
          onclick={() => void generate()}
        >
          Generate initiative
        </button>
      {/if}
      {#if canUndo}
        <button
          id="request-undo"
          class="secondary-action"
          type="button"
          onclick={() => requestConfirmation("undo")}
        >
          Undo
        </button>
      {/if}
      <button
        id="request-discard"
        class="danger-action"
        type="button"
        onclick={() => requestConfirmation("discard")}
      >
        Discard Match
      </button>
    </div>
    {#if summary}
      <PriorSummaryCard />
    {/if}
    {#if uiState.state.confirmation === "undo"}
      <!-- Compact Undo confirmation modal. -->
      <UndoConfirmation />
    {:else}
      <!-- Converted confirmations (T08): reroll, discard, and remove-summary
           dialogs as real markup. -->
      <ConfirmationDialog />
    {/if}
  </section>
{/if}
