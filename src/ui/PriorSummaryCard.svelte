<script lang="ts">
  import { decisionBasisLabel, outcomeLabel } from "./format";
  import { patchShellState, state } from "./shell-state.svelte";

  // Converted prior-Match-Summary card (T10): real reactive markup replacing
  // the shared priorSummaryCard() template string. The card reacts to the
  // runes store: assigning a fresh shell snapshot with a new summary
  // re-renders it; removing the summary unmounts it. Its remove control is
  // wired directly — no delegated transport remains.
  const summary = $derived(state.current.summary);
  const result = $derived(summary ? outcomeLabel(summary.outcome) : "");
  const basisText = $derived(
    summary
      ? `${decisionBasisLabel(summary.decisionBasis)}${summary.coinFlipResult ? ` · ${summary.coinFlipResult}` : ""}`
      : "",
  );

  function requestRemoveSummary(): void {
    patchShellState({ confirmation: "remove-summary" });
  }
</script>

{#if summary}
  <section
    class="prior-summary-card"
    aria-labelledby="prior-summary-heading"
    data-prior-summary
  >
    <div class="section-heading">
      <div>
        <p class="eyebrow">Prior summary · On this device</p>
        <h3 id="prior-summary-heading">Prior Match Summary</h3>
        <p>Compact latest result — no export, no expiry.</p>
      </div>
    </div>
    <dl class="ended-result">
      <div><dt>Result</dt><dd>{result}</dd></div>
      <div><dt>Decision Basis</dt><dd>{basisText}</dd></div>
      <div><dt>Active counts</dt><dd>Drow {summary.finalCounts.Drow} · Duergar {summary.finalCounts.Duergar}</dd></div>
      <div><dt>Active HP totals</dt><dd>Drow {summary.finalHpTotals.Drow} · Duergar {summary.finalHpTotals.Duergar}</dd></div>
      <div><dt>Match Configuration</dt><dd>{summary.configurationVersion}</dd></div>
      <div><dt>Ended</dt><dd>{summary.endedAt}</dd></div>
    </dl>
    <p class="device-note">On this device only. No export.</p>
    <button
      id="request-remove-summary"
      class="danger-action"
      type="button"
      onclick={requestRemoveSummary}
    >
      Remove prior summary
    </button>
  </section>
{/if}
