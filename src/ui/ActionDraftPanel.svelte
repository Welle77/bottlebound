<script lang="ts">
  import AbilityDraft from "./AbilityDraft.svelte";
  import BasicAttackDraft from "./BasicAttackDraft.svelte";
  import { useConsoleContext } from "./console-context";

  const { uiState } = useConsoleContext();

  // Converted Action Draft dispatcher (T07): dispatches between Basic Attack
  // drafts and Ability drafts while an Action Draft holds the surface. The
  // Configuration-version and attack-profile guards live in each flow's derived
  // view, exactly where the deleted legacy panel functions threw them.
  const draftKind = $derived(uiState.state.actionDraft?.kind ?? null);
</script>

{#if draftKind === "basic"}
  <BasicAttackDraft />
{:else if draftKind === "ability"}
  <AbilityDraft />
{/if}
