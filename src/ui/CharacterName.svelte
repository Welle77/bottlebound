<script lang="ts">
  import type { CharacterId, DisplayNames } from "../domain/match";

  // One character name with its optional Display Name primary and the
  // Application character name secondary as muted context; without a distinct
  // Display Name it falls back to the application name alone. The sole name renderer —
  // the escaped characterNameHtml() template was deleted with the legacy
  // renderer (T10).
  let {
    character,
    displayNames,
  }: {
    character: { readonly id: CharacterId; readonly name: string };
    displayNames?: DisplayNames;
  } = $props();

  const displayName = $derived(displayNames?.[character.id]);
</script>

{#if displayName && displayName !== character.name}
  {displayName} <span class="display-name-character">{character.name}</span>
{:else}
  {character.name}
{/if}
