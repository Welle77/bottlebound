<script lang="ts">
  import { confirmAction } from "../app/actions";
  import {
    cryptoRandomSource,
    getEndGamePreview,
    type EndGamePreview,
  } from "../domain/match";
  import { decisionBasisLabel } from "./format";
  import {
    patchShellState,
    state,
    type Confirmation,
  } from "./shell-state.svelte";

  // Converted confirmation dialog (T08): every non-undo confirmation,
  // including the End Game preview, reacts to the runes store instead of
  // being swapped as shared legacy template HTML. The undo confirmation is
  // the UndoConfirmation component since T06. Each hosting surface (setup
  // panel, active-match board, ended-match panel) renders one instance;
  // only one surface is mounted per shell phase, so only one dialog can
  // exist at a time.
  type PreviewView = {
    readonly kind: "preview";
    readonly result: string;
    readonly basisText: string;
    readonly countsText: string;
    readonly hpTotalsText: string;
    readonly configurationVersion: string;
  };
  type GenericView = {
    readonly kind: "generic";
    readonly heading: string;
    readonly detail: string;
    readonly confirmLabel: string;
  };

  const GENERIC_CONTENT: Record<
    Exclude<Confirmation, "undo" | null>,
    readonly [heading: string, detail: string, confirmLabel: string]
  > = {
    reroll: [
      "Replace every initiative result?",
      "This creates 12 new rolls and a new committed order.",
      "Confirm reroll",
    ],
    discard: [
      "Discard this Match and its history?",
      "This final deletion cannot be undone.",
      "Confirm discard",
    ],
    end: [
      "End this Match?",
      "The result becomes read-only until the Match is reopened.",
      "Confirm End Game",
    ],
    remove: [
      "Remove this Ended Match and its history?",
      "This final deletion cannot be undone.",
      "Confirm removal",
    ],
    "remove-summary": [
      "Remove prior summary?",
      "This only removes the compact latest result. The Active Match stays.",
      "Confirm removal",
    ],
    "start-new": [
      "Start a new Match?",
      "This clears the Ended Match history but keeps its summary as prior result.",
      "Confirm start",
    ],
  };

  function previewView(
    preview: EndGamePreview,
    configurationVersion: string,
  ): PreviewView {
    return {
      kind: "preview",
      // Composed single-spaced strings so regex text probes see exactly the
      // legacy contiguous runs across interpolations.
      result: preview.outcome === "draw" ? "Draw" : `${preview.outcome} wins`,
      basisText: `${decisionBasisLabel(preview.decisionBasis)}${preview.coinFlipResult ? ` · ${preview.coinFlipResult}` : ""}`,
      countsText: `Drow ${preview.finalCounts.Drow} · Duergar ${preview.finalCounts.Duergar}`,
      hpTotalsText: `Drow ${preview.finalHpTotals.Drow} · Duergar ${preview.finalHpTotals.Duergar}`,
      configurationVersion,
    };
  }

  const view = $derived.by(() => {
    const { confirmation } = state.current;
    if (confirmation === null || confirmation === "undo") return null;
    if (confirmation === "end" && state.current.match?.phase === "active") {
      const storedPreview = state.current.endGamePreview;
      if (storedPreview) {
        return previewView(
          storedPreview,
          state.current.match.configurationVersion,
        );
      }
      try {
        return previewView(
          getEndGamePreview(state.current.match, cryptoRandomSource),
          state.current.match.configurationVersion,
        );
      } catch {
        // Fall back to the generic end confirmation when no preview can be
        // computed (for example an unruled simultaneous elimination).
      }
    }
    const [heading, detail, confirmLabel] = GENERIC_CONTENT[confirmation];
    const generic: GenericView = {
      kind: "generic",
      heading,
      detail,
      confirmLabel,
    };
    return generic;
  });

  function handleCancel(): void {
    if (state.current.confirmation === "end") {
      patchShellState({ endGamePreview: null });
    }
    patchShellState({ confirmation: null });
  }
</script>

{#if view}
  <!-- Legacy parity: the alertdialog role stays on a section element exactly
       as the deleted shared template rendered it. -->
  <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
  {#if view.kind === "preview"}
    <section
      class="confirmation-panel end-game-preview"
      role="alertdialog"
      aria-labelledby="confirmation-heading"
      aria-describedby="confirmation-detail"
    >
      <div>
        <p class="eyebrow">End Game preview</p>
        <h3 id="confirmation-heading">End this Match?</h3>
        <p id="confirmation-detail">
          Review the calculated winner and Decision Basis before confirming.
          This becomes read-only until reopened.
        </p>
      </div>
      <dl class="ended-result">
        <div>
          <dt>Winner</dt>
          <dd>{view.result}</dd>
        </div>
        <div>
          <dt>Decision Basis</dt>
          <dd>{view.basisText}</dd>
        </div>
        <div>
          <dt>Active counts</dt>
          <dd>{view.countsText}</dd>
        </div>
        <div>
          <dt>Active HP totals</dt>
          <dd>{view.hpTotalsText}</dd>
        </div>
        <div>
          <dt>Match Configuration</dt>
          <dd>{view.configurationVersion}</dd>
        </div>
      </dl>
      <div class="button-row">
        <button
          id="confirm-action"
          class="danger-action"
          type="button"
          onclick={() => void confirmAction()}
        >
          Confirm End Game
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
  {:else}
    <section
      class="confirmation-panel"
      role="alertdialog"
      aria-labelledby="confirmation-heading"
      aria-describedby="confirmation-detail"
    >
      <div>
        <p class="eyebrow">Confirmation required</p>
        <h3 id="confirmation-heading">{view.heading}</h3>
        <p id="confirmation-detail">{view.detail}</p>
      </div>
      <div class="button-row">
        <button
          id="confirm-action"
          class="danger-action"
          type="button"
          onclick={() => void confirmAction()}
        >
          {view.confirmLabel}
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
{/if}
