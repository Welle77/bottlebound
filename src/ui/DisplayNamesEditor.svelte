<script lang="ts">
  import { useConsoleContext } from "./console-context";
  import {
    CHARACTER_IDS,
    isCharacterId,
    normalizeDisplayNames,
    type CharacterId,
    type SetupMatchState,
  } from "../domain/match";
  import { MATCH_CONFIGURATION } from "../domain/match";
  import CharacterName from "./CharacterName.svelte";

  const { application } = useConsoleContext();

  // Referee-assigned Display Names for the fixed roster. Inputs keep their
  // data-display-name-for attributes so saveDisplayNames() keeps reading
  // them straight from the DOM exactly as before.
  const { match }: { match: SetupMatchState } = $props();

  const saving = $derived(application.state.saving);

  let editorElement: HTMLDivElement;

  async function saveDisplayNames(): Promise<void> {
    const requested = Array.from(
      editorElement.querySelectorAll<HTMLInputElement>(
        "[data-display-name-for]",
      ),
    ).reduce<Partial<Record<CharacterId, string>>>((displayNames, input) => {
      const characterId = input.dataset.displayNameFor;
      return characterId && isCharacterId(characterId)
        ? { ...displayNames, [characterId]: input.value }
        : displayNames;
    }, {});
    const normalized = normalizeDisplayNames(requested);
    const unchanged = CHARACTER_IDS.every(
      (characterId) => normalized[characterId] === match.displayNames[characterId],
    );
    if (unchanged) return;
    await application.assignDisplayNames(requested);
  }
</script>

<details class="display-names-panel" data-display-names>
  <summary>Character Display Names</summary>
  <p>
    Optionally name each character to match the miniatures on the table. An
    empty field keeps the configured name. Saving records one reversible event.
  </p>
<div class="display-name-list" bind:this={editorElement}>
    {#each MATCH_CONFIGURATION.characters as character (character.id)}
      <label class="display-name-control">
        <span>
          <CharacterName {character} displayNames={match.displayNames} />
          · {character.team}
        </span>
        <input
          type="text"
          data-display-name-for={character.id}
          value={match.displayNames?.[character.id] ?? ""}
          placeholder={character.name}
          autocomplete="off"
        />
      </label>
    {/each}
  </div>
  <div class="match-actions">
    <button
      id="save-display-names"
      class="secondary-action"
      type="button"
      disabled={saving}
      onclick={() => void saveDisplayNames()}
    >
      {saving ? "Saving…" : "Save display names"}
    </button>
  </div>
</details>
