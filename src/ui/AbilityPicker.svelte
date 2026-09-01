<script lang="ts">
  import { useConsoleContext } from "./console-context";
  import type { AbilityId, MatchState } from "../domain/match";
  import {
    MATCH_CONFIGURATION,
    type MatchConfigurationAbility,
  } from "../domain/match";
  import { rulesCharacterOf, unspentAbilities } from "./ability-draft";
  import CharacterName from "./CharacterName.svelte";
  import { createPhysicalConfirmations } from "./ui-state";

  // Converted ability picker (T07): the "Use Ability" list panel reacts to
  // the runes store instead of being swapped as the legacy abilityListPanel()
  // template. Rendered only while the picker is open and no draft holds the
  // surface (the App shell owns that branching).
  const {
    match,
  }: { match: Extract<MatchState, { readonly phase: "active" }> } = $props();
  const { application, uiState } = useConsoleContext();

  const activeRules = $derived.by(() => {
    const entry = match.initiative[match.activeSlot - 1];
    if (!entry) throw new Error("Active character not found");
    return rulesCharacterOf(entry.characterId);
  });
  const abilities = $derived(unspentAbilities(match));

  function abilityMeta(ability: MatchConfigurationAbility): string {
    return `${ability.actionType === "powerful" ? MATCH_CONFIGURATION.labels.powerfulAbility : MATCH_CONFIGURATION.labels.standardAbility} · Range ${ability.range}${ability.targetPolicy.lifeState === "active" ? " · Active targets" : ""}`;
  }

  function openAbilityDraft(abilityId: AbilityId): void {
    const { match: currentMatch } = application.state;
    if (
      currentMatch?.phase !== "active" ||
      currentMatch.configurationVersion !== MATCH_CONFIGURATION.version
    )
      return;
    const activeCharacterId =
      currentMatch.initiative[currentMatch.activeSlot - 1]?.characterId;
    const ability = MATCH_CONFIGURATION.abilities.find(
      ({ id }) => id === abilityId,
    );
    if (!ability || !activeCharacterId) return;
    if (
      ability.ownerCharacterId !== activeCharacterId ||
      ability.actionType === "reaction" ||
      currentMatch.spentAbilityIds.includes(ability.id)
    )
      return;
    const physical = ability.interaction === "physical-attack";
    const step = (() => {
      if (ability.interaction === "self") return "review";
      if (physical) return "contacts";
      return "select-target";
    })();
    uiState.setPickerVisibility({ ability: false });
    uiState.setActionDraft({
      kind: "ability",
      sourceCharacterId: activeCharacterId,
      configurationVersion: currentMatch.configurationVersion,
      abilityId: ability.id,
      targets: [],
      step,
      attackLegs: physical ? [[]] : [],
      physicalConfirmations: createPhysicalConfirmations(
        uiState.state.physicalConfirmationPreference,
      ),
      reactions: [],
      abilityOverride: false,
      overrideRequired: null,
      majorActionOverride: false,
    });
  }

  function closeAbilityPicker(): void {
    uiState.setPickerVisibility({ ability: false });
  }
</script>

<section
  class="match-panel ability-list"
  aria-labelledby="ability-list-heading"
>
  <p class="eyebrow">Use Ability</p>
  <h2 id="ability-list-heading">Choose an Ability</h2>
  <p>
    Unspent Abilities of
    <CharacterName character={activeRules} displayNames={match.displayNames} />.
    Each Ability may be used once per Match.
  </p>
  <div class="ability-option-list">
    {#if abilities.length > 0}
      {#each abilities as ability (ability.id)}
        <article class="ability-option" data-ability-option>
          <div>
            <h3>{ability.name}</h3>
            <p class="ability-meta">{abilityMeta(ability)}</p>
            <p class="ability-effect">{ability.rulesText}</p>
          </div>
          <div class="match-actions">
            <button
              class="secondary-action"
              type="button"
              data-open-ability={ability.id}
              onclick={() => openAbilityDraft(ability.id)}
            >
              Use {ability.name}
            </button>
          </div>
        </article>
      {/each}
    {:else}
      <p class="ability-empty" role="status">
        Every non-Reaction Ability of
        <CharacterName
          character={activeRules}
          displayNames={match.displayNames}
        />
        is spent. Reactions stay available inside Basic Attack drafts.
      </p>
    {/if}
  </div>
  <div class="match-actions">
    <button
      id="close-ability-picker"
      class="secondary-action"
      type="button"
      onclick={closeAbilityPicker}
    >
      Back
    </button>
  </div>
</section>
