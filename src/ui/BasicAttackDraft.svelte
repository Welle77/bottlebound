<script lang="ts">
  import { useConsoleContext } from "./console-context";
  import {
    type CharacterId,
    type MatchState,
  } from "../domain/match";
  import { MATCH_CONFIGURATION } from "../domain/match";
  import { attackPreviewRow } from "./ability-draft";
  import CharacterName from "./CharacterName.svelte";
  import DraftChecksFieldset from "./DraftChecksFieldset.svelte";
  import DraftContactsFieldset from "./DraftContactsFieldset.svelte";
  import DraftReactionsFieldset from "./DraftReactionsFieldset.svelte";

  const { application, uiState } = useConsoleContext();

  // Converted Basic Attack draft (T07): the contacts step and the review step
  // react to the runes store instead of being swapped as the legacy
  // actionDraftPanel() template. Review rows run through the shared damage
  // pipeline via the unchanged attackPreviewRow() helper, so a marked,
  // raged, Vanished, or protected contact shows exactly the finalized damage
  // and effect consumption that confirming records. Since T10 they render as
  // real markup through CharacterName instead of hosted template strings.
  type ActiveView = Extract<MatchState, { readonly phase: "active" }>;

  type NamedCharacter = {
    readonly id: CharacterId;
    readonly name: string;
  };

  type LegReview = {
    readonly names: readonly NamedCharacter[];
    readonly redirect: boolean;
  };

  type ReactionReview = {
    readonly key: string;
    readonly reactionName: string;
    readonly owner: NamedCharacter;
    readonly protectedCharacter: NamedCharacter;
    readonly details: readonly string[];
  };

  // Interpolated separators keep their spaces; literal whitespace at
  // control-flow block edges is trimmed by the Svelte compiler.
  const LEG_NAME_SEPARATOR = " \u2192 ";
  const LEG_CONTACTS_NONE = "No later bottle contacts.";

  const rulesCharacterById = (
    characterId: CharacterId,
  ): NamedCharacter | null => {
    const character = MATCH_CONFIGURATION.characters.find(
      ({ id }) => id === characterId,
    );
    return character ?? null;
  };

  const base = $derived.by(() => {
    const draft = uiState.state.actionDraft;
    const { match } = application.state;
    if (!draft || draft.kind !== "basic" || match?.phase !== "active") {
      return null;
    }
    const attack = MATCH_CONFIGURATION.basicAttacks.find(
      ({ characterId }) => characterId === draft.sourceCharacterId,
    );
    if (!attack || draft.configurationVersion !== match.configurationVersion) {
      throw new Error(
        "The Action Draft does not match the active Match Configuration.",
      );
    }
    const sourceCharacter = rulesCharacterById(draft.sourceCharacterId);
    if (!sourceCharacter) {
      throw new Error("The Active Match references an unknown character.");
    }
    return {
      draft,
      match,
      attack,
      sourceCharacter,
    };
  });

  type BasicAttackDraftBase = NonNullable<typeof base>;

  // Display-name-aware plain label for review detail sentences, matching the
  // legacy primaryNameOf() fallback order.
  function primaryNameOf(match: ActiveView, characterId: CharacterId): string {
    return (
      match.displayNames?.[characterId] ??
      rulesCharacterById(characterId)?.name ??
      characterId
    );
  }

  function reactionDescription(
    reaction: (typeof MATCH_CONFIGURATION.reactions)[number],
    match: ActiveView,
    characterId: CharacterId,
  ): string {
    return reaction.operations[0]?.type === "reduce-remaining-damage"
      ? `Reduces remaining damage by 1 for ${primaryNameOf(match, characterId)}.`
      : `Prevents damage and effects for ${primaryNameOf(match, characterId)}.`;
  }

  const review = $derived.by(() => {
    const b = base;
    if (!b || b.draft.step !== "review") return null;
    const { match, draft, attack } = b;
    const affectedCharacterIds = draft.attackLegs.flat();
    // Review rows run through the shared damage pipeline, so a marked, raged,
    // Vanished, or protected contact shows exactly the finalized damage and
    // effect consumption that confirming records.
    const hitRows = draft.attackLegs.flatMap((leg, legIndex) =>
      leg.map((characterId, contactIndex) =>
        attackPreviewRow(
          { match, draft, baseDamage: attack.damage, physicalAttack: true },
          characterId,
          `${legIndex + 1}.${contactIndex + 1}`,
        ),
      ),
    );
    const legReviews: readonly LegReview[] = draft.attackLegs.map(
      (leg, index) => ({
        names: leg.flatMap((id) => {
          const character = rulesCharacterById(id);
          return character ? [character] : [];
        }),
        redirect: index === 1,
      }),
    );
    const choices = application.getProtectiveReactionChoices(
      affectedCharacterIds,
      draft.reactions,
    );
    const reactionReviews: readonly ReactionReview[] = draft.reactions.flatMap(
      (selection) => {
        const reaction = MATCH_CONFIGURATION.reactions.find(
          ({ id }) => id === selection.reactionId,
        );
        const owner = reaction
          ? rulesCharacterById(reaction.ownerCharacterId)
          : null;
        const protectedCharacter = rulesCharacterById(
          selection.protectedCharacterId,
        );
        if (!reaction || !owner || !protectedCharacter) {
          throw new Error("The Action Draft references an unknown Reaction.");
        }
        const warnings =
          choices.find(
            ({ reactionId, protectedCharacterId }) =>
              reactionId === selection.reactionId &&
              protectedCharacterId === selection.protectedCharacterId,
          )?.warnings ?? [];
        const details = [
          reactionDescription(reaction, match, protectedCharacter.id),
          reaction.name === "Misty Escape"
            ? `Move ${primaryNameOf(match, owner.id)} up to 2 paces immediately. Position remains physical.`
            : "",
          reaction.name === "Deflecting Palm"
            ? `The same physical attack is redirected toward ${primaryNameOf(match, draft.sourceCharacterId)}; its original source, profile, and hard maximum range remain unchanged.`
            : "",
          ...warnings,
          selection.override ? selection.override : "",
        ].filter(Boolean);
        return [
          {
            key: `${selection.reactionId}:${selection.protectedCharacterId}`,
            reactionName: reaction.name,
            owner,
            protectedCharacter,
            details,
          },
        ];
      },
    );
    return {
      hitRows,
      legReviews,
      reactionReviews,
      saving: application.state.saving,
      confirmDisabled: false,
    };
  });

  const contacts = $derived.by(() => {
    const b = base;
    if (!b || b.draft.step === "review") return null;
    const activeLegIndex = b.draft.attackLegs.length - 1;
    const affectedCharacterIds = b.draft.attackLegs.flat();
    const requireManualChecks = uiState.state.physicalConfirmationPreference;
    const ready =
      affectedCharacterIds.length > 0 &&
      (!requireManualChecks ||
        Object.values(b.draft.physicalConfirmations).every(Boolean));
    const closedLegSource = b.draft.attackLegs.at(0);
    const closedLeg =
      activeLegIndex === 1
        ? {
            names: (closedLegSource ?? []).flatMap((id) => {
              const character = rulesCharacterById(id);
              return character ? [character] : [];
            }),
          }
        : null;
    return { activeLegIndex, ready, closedLeg };
  });

  function backToContacts(): void {
    const draft = uiState.state.actionDraft;
    if (draft === null) return;
    uiState.setActionDraft({ ...draft, step: "contacts" });
  }

  async function confirmBasicAttack(): Promise<void> {
    const { match } = application.state;
    const draft = uiState.state.actionDraft;
    if (match?.phase !== "active" || !draft || draft.kind !== "basic") return;
    const succeeded = await application.resolveBasicAttack({
      sourceCharacterId: draft.sourceCharacterId,
      attackLegs: draft.attackLegs.map((affectedCharacterIds) => ({
        affectedCharacterIds: [...affectedCharacterIds],
      })),
      physicalConfirmations: {
        range: draft.physicalConfirmations.range,
        lineOfSight: draft.physicalConfirmations["line-of-sight"],
        legalBottleContact:
          draft.physicalConfirmations["legal-bottle-contact"],
        terrainContact: draft.physicalConfirmations["terrain-contact"],
      },
      reactions: draft.reactions,
      majorActionOverride: draft.majorActionOverride
        ? MATCH_CONFIGURATION.refereeInstructions.secondMajorAction
        : null,
    });
    if (succeeded) uiState.setActionDraft(null);
  }

  function cancelDraft(): void {
    uiState.setActionDraft(null);
  }
</script>

{#snippet attackProfile(b: BasicAttackDraftBase)}
  <div class="attack-profile">
    <!-- Single-line runs: specs read raw textContent() from the first
         paragraph and regex-match across these phrases. -->
    <p>
      <strong>Source:</strong>
      <CharacterName
        character={b.sourceCharacter}
        displayNames={b.match.displayNames}
      />
    </p>
    <p>
      <strong>Type:</strong>
      {b.attack.attackType === "melee" ? "Melee" : "Ranged"}
    </p>
    <p><strong>Range:</strong> {b.attack.rangePaces} paces</p>
    <p><strong>Damage:</strong> {b.attack.damage}</p>
  </div>
{/snippet}

{#if base}
  <section
    class="match-panel action-draft"
    aria-labelledby="action-draft-heading"
  >
    {#if review}
      <p class="eyebrow">Action Draft · Review</p>
      <h2 id="action-draft-heading">Review Basic Attack</h2>
      {@render attackProfile(base)}
      <p>All four physical facts are referee-confirmed.</p>
      <section aria-labelledby="attack-legs-heading">
        <h3 id="attack-legs-heading">Ordered Attack Legs</h3>
        <div class="attack-leg-review-list">
          {#each review.legReviews as leg, index (index)}
            <article class="attack-leg-review" data-attack-leg-review>
              <h3>
                Leg {index + 1} · {index === 0
                  ? "Initial throw"
                  : "Deflecting Palm redirect"}
              </h3>
              <p>
                {#each leg.names as name, nameIndex (name.id)}{#if nameIndex > 0}{LEG_NAME_SEPARATOR}{/if}<CharacterName
                    character={name}
                    displayNames={base.match.displayNames}
                  />{/each}{#if leg.names.length === 0}{LEG_CONTACTS_NONE}{/if}
              </p>
              {#if leg.redirect}
                <!-- Single-line run: this sentence is matched by a raw-text
                     Playwright regex across its interpolations. -->
                <p>
                  Original source: <CharacterName
                    character={base.sourceCharacter}
                    displayNames={base.match.displayNames}
                  /> · {base.attack.attackType === "melee" ? "Melee" : "Ranged"} ·
                  hard maximum range {base.attack.rangePaces} paces.
                </p>
              {/if}
            </article>
          {/each}
        </div>
      </section>
      {#if review.reactionReviews.length > 0}
        <section aria-labelledby="reaction-review-heading">
          <h3 id="reaction-review-heading">
            Reactions and objective operations
          </h3>
          <div class="reaction-review-list">
            {#each review.reactionReviews as entry (entry.key)}
              <article class="reaction-review" data-reaction-review>
                <h3>{entry.reactionName}</h3>
                <p>
                  <CharacterName
                    character={entry.owner}
                    displayNames={base.match.displayNames}
                  />
                  protects
                  <CharacterName
                    character={entry.protectedCharacter}
                    displayNames={base.match.displayNames}
                  />.
                </p>
                <ul>
                  {#each entry.details as detail, detailIndex (detailIndex)}
                    <li>{detail}</li>
                  {/each}
                </ul>
              </article>
            {/each}
          </div>
        </section>
      {:else}
        <p>No Reactions apply in this resolution.</p>
      {/if}
      <div class="table-wrap">
        <table class="initiative-table">
          <caption>Ordered hits and final changes</caption>
          <thead>
            <tr>
              <th>Contact</th>
              <th>Character</th>
              <th>Team</th>
              <th>Damage</th>
              <th>HP</th>
              <th>Downed</th>
            </tr>
          </thead>
          <tbody>
            {#each review.hitRows as row, rowIndex (rowIndex)}
              <tr data-action-review-hit>
                <td>{row.contactLabel}</td>
                <th scope="row">
                  <CharacterName
                    character={row.character}
                    displayNames={base.match.displayNames}
                  />
                </th>
                <td>{row.team}</td>
                <td>{row.damageText}</td>
                <td>{row.hpText}</td>
                <td>{row.lifeStateText}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="match-actions">
        <button
          id="confirm-basic-attack"
          class="primary-action"
          type="button"
          disabled={review.confirmDisabled}
          onclick={() => void confirmBasicAttack()}
        >
          {review.saving ? "Saving…" : "Confirm Action Resolution"}
        </button>
        <button
          id="back-to-contacts"
          class="secondary-action"
          type="button"
          onclick={backToContacts}
        >
          Back
        </button>
        <button
          id="cancel-basic-attack"
          class="secondary-action"
          type="button"
          onclick={cancelDraft}
        >
          Cancel draft
        </button>
      </div>
    {:else if contacts}
      <p class="eyebrow">Action Draft · Physical result</p>
      <h2 id="action-draft-heading">Record Basic Attack</h2>
      {@render attackProfile(base)}
      {#if contacts.closedLeg}
        <section class="closed-attack-leg" data-closed-attack-leg>
          <h3>Attack Leg 1 closed</h3>
          <p>
            {#each contacts.closedLeg.names as name, nameIndex (name.id)}{#if nameIndex > 0}{LEG_NAME_SEPARATOR}{/if}<CharacterName
                character={name}
                displayNames={base.match.displayNames}
              />{/each}
          </p>
        </section>
        <section class="redirect-evidence" data-redirect-evidence>
          <h3>Redirected Attack Leg 2</h3>
          <!-- Single-line run: this sentence is matched by a raw-text
               Playwright regex across its interpolations. -->
          <p>
            Original source: <CharacterName
              character={base.sourceCharacter}
              displayNames={base.match.displayNames}
            /> · {base.attack.attackType === "melee" ? "Melee" : "Ranged"} · hard
            maximum range {base.attack.rangePaces} paces. Record every later legal
            contact; earlier contacts remain unavailable.
          </p>
        </section>
      {/if}
      <DraftContactsFieldset match={base.match} />
      <DraftReactionsFieldset
        match={base.match}
        affectedCharacterIds={base.draft.attackLegs.flat()}
      />
      <DraftChecksFieldset />
      {#if application.state.errors.operation}
        <p class="blocking-error" role="alert">
          {application.state.errors.operation}
        </p>
      {/if}
      <div class="match-actions">
        <button
          id="record-basic-attack"
          class="primary-action"
          type="button"
          disabled={!contacts.ready}
          onclick={() => void confirmBasicAttack()}
        >
          Record Action Resolution
        </button>
        <button
          id="cancel-basic-attack"
          class="secondary-action"
          type="button"
          onclick={cancelDraft}
        >
          Cancel draft
        </button>
      </div>
    {/if}
  </section>
{/if}
