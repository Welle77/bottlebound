<script lang="ts">
  import type { CharacterId, MatchState, Team } from "../domain/match";
  import { MATCH_CONFIGURATION } from "../domain/match-configuration";
  import {
    draftAffectedCharacterIds,
    patchShellState,
    state,
  } from "./shell-state.svelte";
  import CharacterName from "./CharacterName.svelte";

  // Ordered bottle-contact checklist shared by the Basic Attack draft and
  // physical-attack ability drafts (T07) — the reactive twin of the contact
  // fragment the legacy templates duplicated. Checking a contact appends it
  // to (or removes it from) the active Attack Leg and prunes Reactions whose
  // protected character left the draft, exactly like the deleted renderer
  // wiring did.
  let { match }: { match: Extract<MatchState, { readonly phase: "active" }> } =
    $props();

  const model = $derived.by(() => {
    const draft = state.current.actionDraft;
    if (!draft) return null;
    const activeLegIndex = draft.attackLegs.length - 1;
    const activeLeg = draft.attackLegs.at(activeLegIndex);
    if (!activeLeg) return null;
    const attackingCharacter = MATCH_CONFIGURATION.characters.find(
      ({ id }) => id === draft.sourceCharacterId,
    );
    if (!attackingCharacter) return null;
    const opposingTeam: Team =
      attackingCharacter.team === "Drow" ? "Duergar" : "Drow";
    const closedCharacterIds = new Set(
      draft.attackLegs.slice(0, activeLegIndex).flatMap((leg) => leg),
    );
    return {
      draft,
      activeLegIndex,
      activeLeg,
      closedCharacterIds,
      attackingTeam: attackingCharacter.team,
      teamOrder: [opposingTeam, attackingCharacter.team] as const,
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
      const currentDraft = state.current.actionDraft;
      if (!currentDraft) return;
      const checked = event.currentTarget.checked;
      const activeLegIndex = currentDraft.attackLegs.length - 1;
      const activeLeg = currentDraft.attackLegs.at(activeLegIndex);
      if (!activeLeg) return;
      const attackLegs = currentDraft.attackLegs.map((leg, index) =>
        index === activeLegIndex
          ? checked
            ? [...activeLeg, characterId]
            : activeLeg.filter((id) => id !== characterId)
          : leg,
      );
      const affectedCharacterIds = draftAffectedCharacterIds({
        ...currentDraft,
        attackLegs,
      });
      patchShellState({
        actionDraft: {
          ...currentDraft,
          attackLegs,
          reactions: currentDraft.reactions.filter(
            ({ protectedCharacterId }) =>
              affectedCharacterIds.includes(protectedCharacterId),
          ),
        },
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
              <label class="contact-control">
                <!-- Single-line runs: getByLabel(REGEX) probes receive raw label
                     text, so every spec-matched phrase stays contiguous. -->
                <input
                  type="checkbox"
                  data-hit-character={character.id}
                  checked={order >= 0}
                  disabled={duplicate}
                  onchange={handleContactChange(character.id)}
                />
                <!-- Single-line runs; interpolated separators keep their spaces
                     because Svelte trims whitespace at block-content edges. -->
                <span><CharacterName character={character} displayNames={match.displayNames} /> · {character.team}{#if duplicate}{DUPLICATE_SUFFIX}{closedLegIndex}{/if}</span>
              </label>
            {/each}
          </div>
        </article>
      {/each}
    </div>
  </fieldset>
{/if}
