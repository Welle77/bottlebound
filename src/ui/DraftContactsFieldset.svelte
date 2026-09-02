<script lang="ts">
  import type { CharacterId, MatchState, Team } from "../domain/match";
  import { MATCH_CONFIGURATION } from "../domain/match";
  import CharacterName from "./CharacterName.svelte";
  import { useConsoleContext } from "./console-context";
  import { draftAffectedCharacterIds } from "./ui-state";

  const { uiState } = useConsoleContext();

  // Ordered bottle-contact checklist shared by the Basic Attack draft and
  // physical-attack ability drafts (T07) — the reactive twin of the contact
  // fragment the legacy templates duplicated. Checking a contact appends it
  // to (or removes it from) the active Attack Leg and prunes Reactions whose
  // protected character left the draft, exactly like the deleted renderer
  // wiring did.
  const {
    match,
  }: { match: Extract<MatchState, { readonly phase: "active" }> } = $props();

  const model = $derived.by(() => {
    const draft = uiState.state.actionDraft;
    if (!draft) return null;
    const activeLegIndex = draft.attackLegs.length - 1;
    const activeLeg = draft.attackLegs.at(activeLegIndex);
    if (!activeLeg) return null;
    const attackingCharacter = MATCH_CONFIGURATION.characters.find(
      ({ id }) => id === draft.sourceCharacterId,
    );
    if (!attackingCharacter) return null;
    const deflectingPalmSelected = draft.reactions.some(
      ({ reactionId }) => reactionId === "duergar-monk-deflecting-palm",
    );
    const redirectedAttacker = deflectingPalmSelected
      ? MATCH_CONFIGURATION.characters.find(
          ({ id }) => id === "duergar-monk",
        )
      : null;
    const attackingTeam =
      activeLegIndex > 0 && redirectedAttacker
        ? redirectedAttacker.team
        : attackingCharacter.team;
    const opposingTeam: Team =
      attackingTeam === "Drow" ? "Duergar" : "Drow";
    const closedCharacterIds = new Set(
      draft.attackLegs.slice(0, activeLegIndex).flatMap((leg) => leg),
    );
    const hpByCharacter = new Map(
      match.characters.map(({ characterId, hp }) => [characterId, hp]),
    );
    const maxHpByCharacter = new Map(
      match.characters.map(({ characterId, currentMaxHp }) => [
        characterId,
        currentMaxHp,
      ]),
    );
    return {
      draft,
      activeLegIndex,
      activeLeg,
      closedCharacterIds,
      hpByCharacter,
      maxHpByCharacter,
      attackingTeam,
      teamOrder: [opposingTeam, attackingTeam] as const,
    };
  });

  // Interpolated suffix keeps its leading space; literal whitespace at
  // control-flow block edges is trimmed by the Svelte compiler.
  const DUPLICATE_SUFFIX = " \u00b7 Already contacted in Leg ";

  function handleContactChange(
    characterId: CharacterId,
  ): (event: Event) => void {
    return (event) => {
      if (!(event.currentTarget instanceof HTMLInputElement)) return;
      const currentDraft = uiState.state.actionDraft;
      if (!currentDraft) return;
      const { checked } = event.currentTarget;
      const activeLegIndex = currentDraft.attackLegs.length - 1;
      const activeLeg = currentDraft.attackLegs.at(activeLegIndex);
      if (!activeLeg) return;
      const attackLegs = currentDraft.attackLegs.map((leg, index) => {
        if (index !== activeLegIndex) return leg;
        if (checked) return [...activeLeg, characterId];
        return activeLeg.filter((id) => id !== characterId);
      });
      const affectedCharacterIds = draftAffectedCharacterIds({
        ...currentDraft,
        attackLegs,
      });
      uiState.setActionDraft({
          ...currentDraft,
          attackLegs,
          reactions: currentDraft.reactions.filter(({ protectedCharacterId }) =>
            affectedCharacterIds.includes(protectedCharacterId),
          ),
      });
    };
  }
</script>

{#if model}
  <fieldset>
    <legend>
      {model.activeLegIndex === 0
        ? "Ordered bottle contacts"
        : "Redirected bottle contacts"}
    </legend>
    <p>
      Select contacts in their physical order. Allies and the attacker remain
      valid choices.
    </p>
    <div class="contact-team-cards">
      {#each model.teamOrder as team (team)}
        <article class="contact-team-card" data-contact-team={team}>
          <h3>
            {team === model.attackingTeam ? "Your team" : "Opposing team"}
            · {team}
          </h3>
          <div class="contact-list">
            {#each MATCH_CONFIGURATION.characters.filter((character) => character.team === team) as character (character.id)}
              {@const order = model.activeLeg.indexOf(character.id)}
              {@const duplicate = model.closedCharacterIds.has(character.id)}
              {@const closedLegIndex = duplicate
                ? model.draft.attackLegs
                    .slice(0, model.activeLegIndex)
                    .findIndex((leg) => leg.includes(character.id)) + 1
                : 0}
              <label
                class="contact-control"
                class:contact-unavailable={model.hpByCharacter.get(character.id) === 0}
              >
                <!-- Single-line runs: getByLabel(REGEX) probes receive raw label
                     text, so every spec-matched phrase stays contiguous. -->
                <input
                  type="checkbox"
                  data-hit-character={character.id}
                  checked={order >= 0}
                  disabled={duplicate || model.hpByCharacter.get(character.id) === 0}
                  onchange={handleContactChange(character.id)}
                />
                <!-- Single-line runs; interpolated separators keep their spaces
                     because Svelte trims whitespace at block-content edges. -->
                <span
                  ><CharacterName
                    {character}
                    displayNames={match.displayNames}
                  /> · {character.team} · HP {model.hpByCharacter.get(character.id)}/{model.maxHpByCharacter.get(character.id)}{#if duplicate}{DUPLICATE_SUFFIX}{closedLegIndex}{/if}</span
                >
              </label>
            {/each}
          </div>
        </article>
      {/each}
    </div>
  </fieldset>
{/if}
