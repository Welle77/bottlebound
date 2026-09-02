<script lang="ts">
  import {
    type CharacterId,
    type MatchState,
    type ReactionId,
  } from "../domain/match";
  import { MATCH_CONFIGURATION } from "../domain/match";
  import { rulesCharacterOf } from "./ability-draft";
  import CharacterName from "./CharacterName.svelte";
  import { useConsoleContext } from "./console-context";

  const { application, uiState } = useConsoleContext();

  // Protective Reaction choices shared by the Basic Attack draft and every
  // ability draft with targets (T07) — the reactive twin of the duplicated
  // legacy reaction fieldset fragments. Eligible choices render directly;
  // state-warned choices hide behind the Override details block, and a
  // selection records the referee Override exactly like the deleted renderer
  // wiring (including the Deflecting Palm second-leg management).
  const {
    match,
    affectedCharacterIds,
    physicalAttack,
  }: {
    match: Extract<MatchState, { readonly phase: "active" }>;
    affectedCharacterIds: readonly CharacterId[];
    physicalAttack?: boolean;
  } = $props();
  const physicalAttackMode = $derived(physicalAttack ?? true);

  type ReactionRow = {
    readonly reactionId: ReactionId;
    readonly protectedCharacterId: CharacterId;
    readonly protectedCharacter: {
      readonly id: CharacterId;
      readonly name: string;
    };
    readonly warning: string;
    readonly override: boolean;
    readonly disabled: boolean;
    readonly selected: boolean;
  };

  type ReactionGroup = {
    readonly reactionId: ReactionId;
    readonly reactionName: string;
    readonly owner: { readonly id: CharacterId; readonly name: string };
    readonly target: string;
    readonly range: string;
    readonly lineOfSight: string;
    readonly rulesText: string;
    readonly rows: readonly ReactionRow[];
  };

  const DEFLECTING_PALM_REACTION_ID = "duergar-monk-deflecting-palm";
  let openReactionId = $state<ReactionId | null>(null);

  const model = $derived.by(() => {
    const draft = uiState.state.actionDraft;
    if (!draft || affectedCharacterIds.length === 0) return null;
    const choices = application.getProtectiveReactionChoices(
      affectedCharacterIds,
      draft.reactions,
      physicalAttackMode,
    );
    const rowOf = (
      choice: (typeof choices)[number],
      override: boolean,
    ): ReactionRow | null => {
      const reaction = MATCH_CONFIGURATION.reactions.find(
        ({ id }) => id === choice.reactionId,
      );
      if (!reaction) return null;
      return {
        reactionId: choice.reactionId,
        protectedCharacterId: choice.protectedCharacterId,
        protectedCharacter: rulesCharacterOf(choice.protectedCharacterId),
        warning: choice.warnings.join(" "),
        override: override && choice.overrideAllowed,
        disabled: !choice.overrideAllowed,
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
      .filter(({ eligible, overrideAllowed }) => !eligible && overrideAllowed)
      .flatMap((choice) => {
        const row = rowOf(choice, true);
        return row ? [row] : [];
      });
    const avoidanceConflicts = choices
      .filter(
        ({ eligible, overrideAllowed, warnings }) =>
          !eligible &&
          !overrideAllowed &&
          warnings.some((warning) => warning.startsWith("Attack Avoidance")),
      )
      .flatMap((choice) => {
        const row = rowOf(choice, false);
        return row ? [row] : [];
      });
    const groupsOf = (rows: readonly ReactionRow[]): readonly ReactionGroup[] =>
      MATCH_CONFIGURATION.reactions.flatMap((reaction) => {
        const groupRows = rows.filter(
          ({ reactionId }) => reactionId === reaction.id,
        );
        if (groupRows.length === 0) return [];
        const owner = MATCH_CONFIGURATION.characters.find(
          ({ id }) => id === reaction.ownerCharacterId,
        );
        if (!owner) return [];
        return [
          {
            reactionId: reaction.id,
            reactionName: reaction.name,
            owner,
            target: reaction.target,
            range: reaction.range,
            lineOfSight: reaction.lineOfSight,
            rulesText: reaction.rulesText,
            rows: groupRows,
          },
        ];
      });
    return {
      eligible: groupsOf([...eligible, ...avoidanceConflicts]),
      overrides: groupsOf(overrides),
    };
  });

  function handleReactionChange(row: ReactionRow): (event: Event) => void {
    return (event) => {
      if (!(event.currentTarget instanceof HTMLInputElement)) return;
      const currentDraft = uiState.state.actionDraft;
      if (!currentDraft) return;
      const selected = event.currentTarget.checked;
      const { reactionId, protectedCharacterId } = row;
      const deflectingPalm = reactionId === DEFLECTING_PALM_REACTION_ID;
      const override = row.override
        ? MATCH_CONFIGURATION.refereeInstructions.stateInvalidReaction
        : null;
      const reactions = selected
        ? [
            ...currentDraft.reactions.filter(
              (selection) => selection.reactionId !== reactionId,
            ),
            {
              reactionId,
              protectedCharacterId,
              override,
            },
          ]
        : currentDraft.reactions.filter(
            (selection) => selection.reactionId !== reactionId,
          );
      const attackLegs = (() => {
        if (
          selected &&
          deflectingPalm &&
          currentDraft.attackLegs.length === 1
        ) {
          return [...currentDraft.attackLegs, []];
        }
        if (
          !selected &&
          deflectingPalm &&
          currentDraft.attackLegs.length === 2
        ) {
          return currentDraft.attackLegs.slice(0, -1);
        }
        return currentDraft.attackLegs;
      })();
      uiState.setActionDraft({ ...currentDraft, reactions, attackLegs });
    };
  }
</script>

{#snippet reactionControl(row: ReactionRow)}
  <label class="reaction-control{row.override ? ' reaction-override' : ''}">
    <input
      type="checkbox"
      data-reaction-id={row.reactionId}
      data-protected-character={row.protectedCharacterId}
      data-reaction-override={String(row.override)}
      disabled={row.disabled}
      checked={row.selected}
      onchange={handleReactionChange(row)}
    />
    <span>Protect <CharacterName
        character={row.protectedCharacter}
        displayNames={match.displayNames}
      />{#if row.warning}<small
          >{row.warning} Override records the referee decision.</small
        >{/if}</span
    >
  </label>
{/snippet}

{#snippet reactionGroup(group: ReactionGroup)}
  <section
    class="reaction-group"
    role="group"
    aria-labelledby={`reaction-group-${group.reactionId}`}
  >
    <div class="reaction-group-heading">
      <h3 id={`reaction-group-${group.reactionId}`}>
        {group.reactionName} <small>· <CharacterName
            character={group.owner}
            displayNames={match.displayNames}
          /></small>
      </h3>
      <button
        type="button"
        class="reaction-guidance-button"
        aria-label={`What ${group.reactionName} does`}
        aria-controls={`reaction-effect-${group.reactionId}`}
        aria-expanded={openReactionId === group.reactionId}
        onclick={() =>
          (openReactionId =
            openReactionId === group.reactionId ? null : group.reactionId)}
      >i</button>
    </div>
    {#if openReactionId === group.reactionId}
      <div
        id={`reaction-effect-${group.reactionId}`}
        class="reaction-guidance-tooltip"
        role="tooltip"
        aria-label={`${group.reactionName} effect`}
      >
        <p><strong>Target:</strong> {group.target}</p>
        <p><strong>Range:</strong> {group.range}</p>
        <p><strong>Line of Sight:</strong> {group.lineOfSight}</p>
        <p><strong>Effect:</strong> {group.rulesText}</p>
      </div>
    {/if}
    <div class="reaction-character-list">
      {#each group.rows as row (row.protectedCharacterId)}
        {@render reactionControl(row)}
      {/each}
    </div>
  </section>
{/snippet}

{#if model}
  <fieldset>
    <legend>Protective Reactions</legend>
    <p>Select at most one protected character for each reacting character.</p>
    <div class="reaction-list">
      {#if model.eligible.length > 0}
        {#each model.eligible as group (group.reactionId)}
          {@render reactionGroup(group)}
        {/each}
      {:else}
        <p>No state-eligible Reactions.</p>
      {/if}
    </div>
    {#if model.overrides.length > 0}
      <details class="reaction-overrides">
        <summary>Override unavailable Reactions</summary>
        <p>These choices have state warnings. Selection records an Override.</p>
        <div class="reaction-list">
          {#each model.overrides as group (group.reactionId)}
            {@render reactionGroup(group)}
          {/each}
        </div>
      </details>
    {/if}
  </fieldset>
{/if}
