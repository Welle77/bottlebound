<script lang="ts">
  import type { DisplayNames } from "../domain/match";

  // One character name with its optional Display Name primary and the
  // Ruleset name secondary as muted context; without a distinct Display
  // Name it falls back to the Ruleset name alone. The sole name renderer —
  // the escaped characterNameHtml() template was deleted with the legacy
  // renderer (T10).
  let {
    character,
    displayNames,
  }: {
    character: { readonly id: string; readonly name: string };
    displayNames?: DisplayNames;
  } = $props();

  const displayName = $derived(displayNames?.[character.id]);
</script>

{#if displayName && displayName !== character.name}
  {displayName} <span class="display-name-ruleset">{character.name}</span>
{:else}
  {character.name}
{/if}
