<script lang="ts">
  import { decisionBasisLabel, outcomeLabel } from "./format";
  import { useConsoleContext } from "./console-context";
  import type { UiConfirmation } from "./ui-state";
  import ConfirmationDialog from "./ConfirmationDialog.svelte";

  const { application, uiState } = useConsoleContext();

  // Converted ended-match surface (T08): the read-only Ended Match panel
  // reacts to the runes store instead of being swapped as legacy template
  // HTML. It embeds the converted confirmation dialog exactly where the
  // deleted template embedded the shared confirmation fragment, so the
  // remove/start-new confirmations stay inside the panel section.
  const match = $derived(
    application.state.match?.phase === "ended" ? application.state.match : null,
  );
  const matchError = $derived(
    application.state.errors.operation === "Injected storage failure"
      ? "Validated storage could not commit the command."
      : application.state.errors.operation,
  );

  const view = $derived.by(() => {
    if (!match) return null;
    const eliminated = match.eliminatedTeams.join(" and ");
    const result = outcomeLabel(match.outcome);
    return {
      sequence: match.sequence,
      // Composed single-spaced strings so regex text probes see exactly the
      // legacy contiguous runs across interpolations.
      headlineText: eliminated
        ? `${result} · ${eliminated} eliminated`
        : result,
      result,
      basisText: match.decisionBasis
        ? `${decisionBasisLabel(match.decisionBasis)}${match.coinFlipResult ? ` · ${match.coinFlipResult}` : ""}`
        : "",
      countsText: match.finalCounts
        ? `Drow ${match.finalCounts.Drow} · Duergar ${match.finalCounts.Duergar}`
        : "",
      hpTotalsText: match.finalHpTotals
        ? `Drow ${match.finalHpTotals.Drow} · Duergar ${match.finalHpTotals.Duergar}`
        : "",
      endedAt: match.endedAt,
      round: match.round,
      configurationVersion: match.configurationVersion,
    };
  });

  function requestConfirmation(
    confirmation: Exclude<UiConfirmation, null>,
  ): void {
    uiState.requestConfirmation(confirmation);
  }
</script>

{#if view}
  <section class="match-panel ended-match" aria-labelledby="ended-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Ended · Sequence {view.sequence}</p>
        <h2 id="ended-heading">Ended Match</h2>
        <p>{view.headlineText}</p>
      </div>
      <span class="readiness-badge" data-state="ready">Read-only</span>
    </div>
    {#if matchError}
      <p class="blocking-error" role="alert">{matchError} The Ended Match remains saved.</p>
    {/if}
    <dl class="ended-result">
      <div><dt>Result</dt><dd>{view.result}</dd></div>
      {#if view.basisText}<div><dt>Decision Basis</dt><dd>{view.basisText}</dd></div>{/if}
      {#if view.countsText}<div><dt>Active counts</dt><dd>{view.countsText}</dd></div>{/if}
      {#if view.hpTotalsText}<div><dt>Active HP totals</dt><dd>{view.hpTotalsText}</dd></div>{/if}
      <div><dt>Ended</dt><dd>{view.endedAt}</dd></div>
      <div><dt>Final round</dt><dd>{view.round}</dd></div>
      <div><dt>Match Configuration</dt><dd>{view.configurationVersion}</dd></div>
    </dl>
    <p>This Match is read-only. Reopen it to make corrections, or remove its complete local history.</p>
    <div class="match-actions">
      <button
        id="reopen-match"
        class="primary-action"
        type="button"
        onclick={() => void application.reopenMatch()}
      >
        Reopen Match
      </button>
      <button
        id="request-start-new-match"
        class="secondary-action"
        type="button"
        onclick={() => requestConfirmation("start-new")}
      >
        Start new Match
      </button>
      <button
        id="request-remove-match"
        class="danger-action"
        type="button"
        onclick={() => requestConfirmation("remove")}
      >
        Remove Match
      </button>
    </div>
    <ConfirmationDialog />
  </section>
{/if}
