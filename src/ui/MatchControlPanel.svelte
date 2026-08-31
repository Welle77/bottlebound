<script lang="ts">
  import { createMatch, runStorageProbe } from "../app/actions";
  import { deriveReadinessState } from "../readiness";
  import { state } from "./shell-state.svelte";

  // Converted pre-Match surface (T10): the error-recovery and create-Match
  // panels react to the runes store instead of being swapped as the legacy
  // matchPanel() template. Rendered only while no Match snapshot exists —
  // exactly the position the legacy renderer appended it to, as main.shell's
  // last child after the conditional system check.
  const readiness = $derived(deriveReadinessState(state.current));
  const recovery = $derived(
    state.current.matchError !== null && state.current.match === null,
  );
  const blocked = $derived(
    readiness.matchCreation === "blocked" ||
      !state.current.matchLoaded ||
      state.current.saving,
  );
  // One composed run of text so matchers see exactly the legacy
  // single-spaced guidance sentence across its conditional halves.
  const guidance = $derived(
    readiness.blockingReason ??
      (state.current.matchLoaded
        ? "Create the fixed 12-character Setup at full HP."
        : "Checking for a saved Match."),
  );
</script>

{#if recovery}
  <section class="action-panel error-panel" role="alert" aria-labelledby="recovery-heading">
    <div>
      <p class="eyebrow">Recovery stopped</p>
      <h2 id="recovery-heading">Saved Match needs recovery</h2>
      <p>{state.current.matchError}</p>
      <p>Starting a new Match will replace the incompatible saved data.</p>
    </div>
    <button
      id="create-match"
      class="primary-action"
      type="button"
      disabled={blocked}
      aria-describedby="recovery-heading"
      onclick={() => void createMatch()}
    >
      {state.current.saving ? "Saving…" : "Start new Match"}
    </button>
  </section>
{:else if state.current.match === null}
  <section class="action-panel" aria-labelledby="match-heading">
    <div>
      <p class="eyebrow">Match control</p>
      <h2 id="match-heading">Create a Match</h2>
      <p id="match-guidance">{guidance}</p>
    </div>
    <button
      id="create-match"
      class="primary-action"
      type="button"
      disabled={blocked}
      aria-describedby="match-guidance"
      onclick={() => void createMatch()}
    >
      {state.current.saving ? "Saving…" : "Create Match"}
    </button>
    {#if readiness.canonicalStorage === "failed"}
      <button
        id="retry-storage"
        class="secondary-action"
        type="button"
        onclick={() => void runStorageProbe()}
      >
        Retry storage check
      </button>
    {/if}
  </section>
{/if}
