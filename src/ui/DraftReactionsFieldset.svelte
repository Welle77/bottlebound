<script lang="ts">
  import {
    getProtectiveReactionChoices,
    type CharacterId,
    type MatchState,
    type ReactionId,
  } from "../domain/match";
  import { RULESET } from "../domain/ruleset";
  import { rulesCharacterOf } from "./ability-draft";
  import { patchShellState, state } from "./shell-state.svelte";
  import CharacterName from "./CharacterName.svelte";

  // Protective Reaction choices shared by the Basic Attack draft and every
  // ability draft with targets (T07) — the reactive twin of the duplicated
  // legacy reaction fieldset fragments. Eligible choices render directly;
  // state-warned choices hide behind the Override details block, and a
  // selection records the referee Override exactly like the deleted renderer
  // wiring (including the Deflecting Palm second-leg management).
  let { match, affectedCharacterIds }: {
    match: Extract<MatchState, { readonly phase: "active" }>;
    affectedCharacterIds: readonly CharacterId[];
  } = $props();

  type ReactionRow = {
    readonly reactionId: ReactionId;
    readonly protectedCharacterId: CharacterId;
    readonly reactionName: string;
    readonly owner: { readonly id: CharacterId; readonly name: string };
    readonly protectedCharacter: {
      readonly id: CharacterId;
      readonly name: string;
    };
    readonly warning: string;
    readonly override: boolean;
    readonly selected: boolean;
  }

  const DEFLECTING_PALM_REACTION_ID = "duergar-monk-deflecting-palm";

  const model = $derived.by(() => {
    const draft = state.current.actionDraft;
    if (!draft || affectedCharacterIds.length === 0) return null;
    const choices = getProtectiveReactionChoices(match, affectedCharacterIds);
    const rowOf = (
      choice: (typeof choices)[number],
      override: boolean,
    ): ReactionRow | null => {
      const reaction = RULESET.reactions.find(
        ({ id }) => id === choice.reactionId,
      );
      const owner = reaction
        ? RULESET.characters.find(({ id }) => id === reaction.ownerCharacterId)
        : undefined;
      if (!reaction || !owner) return null;
      return {
        reactionId: choice.reactionId,
        protectedCharacterId: choice.protectedCharacterId,
        reactionName: reaction.name,
        owner,
        protectedCharacter: rulesCharacterOf(choice.protectedCharacterId),
        warning: choice.warnings.join(" "),
        override,
        selected: draft.reactions.some(
          ({ reactionId, protectedCharacterId }) =>
            reactionId === choice.reactionId &&
            protectedCharacterId === choice.protectedCharacterId,
        ),
      };
    };
    const eligible = choices
      .filter(({ eligible }) => eligible)
      .flatMap((choice) => {
        const row = rowOf(choice, false);
        return row ? [row] : [];
      });
    const overrides = choices
      .filter(({ eligible }) => !eligible)
      .flatMap((choice) => {
        const row = rowOf(choice, true);
        return row ? [row] : [];
      });
    return { eligible, overrides };
  });

  function handleReactionChange(row: ReactionRow): (event: Event) => void {
    return (event) => {
      if (!(event.currentTarget instanceof HTMLInputElement)) return;
      const currentDraft = state.current.actionDraft;
      if (!currentDraft) return;
      const selected = event.currentTarget.checked;
      const { reactionId, protectedCharacterId } = row;
      const deflectingPalm = reactionId === DEFLECTING_PALM_REACTION_ID;
      const reactions = selected
        ? [
            ...currentDraft.reactions.filter(
              (selection) => selection.reactionId !== reactionId,
            ),
            {
              reactionId,
              protectedCharacterId,
              override: row.override
                ? "Referee allowed a state-invalid Reaction."
                : null,
            },
          ]
        : currentDraft.reactions.filter(
            (selection) => selection.reactionId !== reactionId,
          );
      const attackLegs =
        selected && deflectingPalm && currentDraft.attackLegs.length === 1
          ? [...currentDraft.attackLegs, [] as readonly CharacterId[]]
          : !selected && deflectingPalm && currentDraft.attackLegs.length === 2
            ? currentDraft.attackLegs.slice(0, -1)
            : currentDraft.attackLegs;
      patchShellState({
        actionDraft: { ...currentDraft, reactions, attackLegs },
      });
    };
  }
</script>

{#snippet reactionControl(row: ReactionRow)}
  <label class="reaction-control{row.override ? " reaction-override" : ""}">
    <input
      type="checkbox"
      data-reaction-id={row.reactionId}
      data-protected-character={row.protectedCharacterId}
      data-reaction-override={String(row.override)}
      checked={row.selected}
      onchange={handleReactionChange(row)}
    />
    <!-- Single-line runs: getByLabel(REGEX) probes receive raw label text,
         so every spec-matched phrase stays contiguous. -->
    <span><strong>{row.reactionName}</strong> · <CharacterName character={row.owner} displayNames={match.displayNames} /> protects <CharacterName character={row.protectedCharacter} displayNames={match.displayNames} />{#if row.warning}<small>{row.warning} Override records the referee decision.</small>{/if}</span>
  </label>
{/snippet}

{#if model}
  <fieldset>
    <legend>Protective Reactions</legend>
    <p>Select at most one protected character for each reacting character.</p>
    <div class="reaction-list">
      {#if model.eligible.length > 0}
        {#each model.eligible as row (row.reactionId + row.protectedCharacterId)}
          {@render reactionControl(row)}
        {/each}
      {:else}
        <p>No state-eligible Reactions.</p>
      {/if}
    </div>
    {#if model.overrides.length > 0}
      <details class="reaction-overrides">
        <summary>Override unavailable Reactions</summary>
        <p>
          These choices have state warnings. Selection records an Override.
        </p>
        <div class="reaction-list">
          {#each model.overrides as row (row.reactionId + row.protectedCharacterId)}
            {@render reactionControl(row)}
          {/each}
        </div>
      </details>
    {/if}
  </fieldset>
{/if}
