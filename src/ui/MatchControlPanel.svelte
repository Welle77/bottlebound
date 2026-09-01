<script lang="ts">
  import { useConsoleContext } from "./console-context";

  const { application } = useConsoleContext();

  // Match creation reads application readiness and validation state. The
  // application operation owns persistence and error transitions.
  const readiness = $derived(application.state.readiness);
  const recovery = $derived(
    application.state.validation.match === "invalid" &&
      application.state.match === null,
  );
  const blocked = $derived(
    readiness.matchCreation === "blocked" ||
      application.state.validation.match === "unknown" ||
      application.state.saving,
  );
  // One composed run of text so matchers see exactly the legacy
  // single-spaced guidance sentence across its conditional halves.
  const guidance = $derived(
    readiness.blockingReason ??
      (application.state.validation.match !== "unknown"
        ? "Create the fixed 12-character Setup at full HP."
        : "Checking for a saved Match."),
  );

  async function createMatch(): Promise<void> {
    await application.createMatch();
  }

  async function runStorageProbe(): Promise<void> {
    await application.probeStorage();
  }
</script>

{#if recovery}
  <section class="action-panel error-panel" role="alert" aria-labelledby="recovery-heading">
    <div>
      <p class="eyebrow">Recovery stopped</p>
      <h2 id="recovery-heading">Saved Match needs recovery</h2>
      <p>{application.state.errors.validation}</p>
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
      {application.state.saving ? "Saving…" : "Start new Match"}
    </button>
  </section>
{:else if application.state.match === null}
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
      {application.state.saving ? "Saving…" : "Create Match"}
    </button>
    {#if readiness.validatedStorage === "failed"}
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
