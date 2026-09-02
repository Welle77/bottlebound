<script lang="ts">
  import { useConsoleContext } from "./console-context";
  import {
    MATCH_CONFIGURATION,
    vanishMovementPaces,
    type AbilityId,
    type CharacterId,
    type Team,
  } from "../domain/match";
  import {
    attackPreviewRow,
    currentMaxHpOf,
    draftWarnings,
    effectPreviewRow,
    hpByIdMap,
    rulesCharacterOf,
    targetCandidates,
  } from "./ability-draft";
  import CharacterName from "./CharacterName.svelte";
  import DraftChecksFieldset from "./DraftChecksFieldset.svelte";
  import DraftContactsFieldset from "./DraftContactsFieldset.svelte";
  import DraftReactionsFieldset from "./DraftReactionsFieldset.svelte";
  import type { ActionDraft } from "./ui-state";

  const { application, uiState } = useConsoleContext();
  const OVERRIDEABLE_DOMAIN_ERRORS = new Set([
    "wrong-active-character",
    "ability-already-spent",
    "invalid-target-relation",
    "invalid-target-life-state",
  ]);

  // Converted Ability Action Draft (T07): the select-target, reactions,
  // contacts, and review steps react to the runes store instead of being
  // swapped as the legacy targetingPanel/reactionsPanel/physicalContactsPanel/
  // reviewPanel templates. Hit and change preview rows run through the
  // unchanged attackPreviewRow()/effectPreviewRow() helpers so Review shows
  // exactly the finalized damage and effect consumption that confirming
  // records; since T10 they render as real markup through CharacterName.
  type DraftStep = ActionDraft["step"];
  function abilityCommandInput(abilityId: AbilityId, draft: ActionDraft) {
    return {
      abilityId,
      ...(draft.targets.length > 0
        ? { targetCharacterIds: [...draft.targets] }
        : {}),
      ...(draft.attackLegs.length > 0
        ? {
            attackLegs: draft.attackLegs.map((affectedCharacterIds) => ({
              affectedCharacterIds: [...affectedCharacterIds],
            })),
          }
        : {}),
      physicalConfirmations: draft.physicalConfirmations,
      ...(draft.reactions.length > 0 ? { reactions: draft.reactions } : {}),
      majorActionOverride: draft.majorActionOverride,
      abilityOverride: draft.abilityOverride,
    };
  }

  // Interpolated separators keep their spaces; literal whitespace at
  // control-flow block edges is trimmed by the Svelte compiler.
  const LEG_NAME_SEPARATOR = " \u2192 ";
  const LEG_CONTACTS_NONE = "No later bottle contacts.";
  const WARNING_CODE_SEPARATOR = " — ";

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

  type TargetRow = {
    readonly candidate: ReturnType<typeof targetCandidates>[number];
    readonly character: NamedCharacter & { readonly team: Team };
    readonly hp: number;
    readonly maxHp: number;
    readonly selected: boolean;
  };

  const base = $derived.by(() => {
    const draft = uiState.state.actionDraft;
    const { match } = application.state;
    if (!draft || draft.kind !== "ability" || match?.phase !== "active") {
      return null;
    }
    const ability = MATCH_CONFIGURATION.abilities.find(
      ({ id }) => id === draft.abilityId,
    );
    if (!ability) {
      throw new Error("The Action Draft references an unknown ability.");
    }
    if (draft.configurationVersion !== match.configurationVersion) {
      throw new Error(
        "The Action Draft does not match the active Match Configuration.",
      );
    }
    return {
      draft,
      match,
      ability,
      sourceCharacter: rulesCharacterOf(draft.sourceCharacterId),
    };
  });

  type AbilityDraftBase = NonNullable<typeof base>;

  const targeting = $derived.by(() => {
    const b = base;
    if (!b || b.draft.step !== "select-target") return null;
    const single = b.ability.targetPolicy.cardinality !== "all-in-range";
    const hpById = hpByIdMap(b.match);
    const rows = targetCandidates(b.match, b.ability).map((candidate) => ({
      candidate,
      character: rulesCharacterOf(candidate.characterId),
      hp: hpById.get(candidate.characterId) ?? 0,
      maxHp: currentMaxHpOf(b.match, candidate.characterId),
      selected: b.draft.targets.includes(candidate.characterId),
    }));
    return {
      single,
      eligible: rows.filter(
        (row) => !row.candidate.blocked && row.candidate.reasons.length === 0,
      ),
      overridden: rows.filter(
        (row) => !row.candidate.blocked && row.candidate.reasons.length > 0,
      ),
      blockedCount: rows.filter((row) => row.candidate.blocked).length,
      continueLabel:
        b.ability.interaction === "targeted-attack"
          ? "Choose Reactions"
          : "Record Action Resolution",
      ready: single
        ? b.draft.targets.length === 1
        : b.draft.targets.length >= 1,
    };
  });

  const physicalContacts = $derived.by(() => {
    const b = base;
    if (!b || b.draft.step !== "contacts") return null;
    const activeLegIndex = b.draft.attackLegs.length - 1;
    const activeLeg = b.draft.attackLegs.at(activeLegIndex);
    if (!activeLeg) return null;
    const closedLeg = b.draft.attackLegs.at(0);
    return {
      closedLeg:
        activeLegIndex === 1
          ? {
              names: (closedLeg ?? []).map((id) => rulesCharacterOf(id)),
            }
          : null,
      ready:
        (!uiState.state.physicalConfirmationPreference ||
          Object.values(b.draft.physicalConfirmations).every(Boolean)),
    };
  });

  const review = $derived.by(() => {
    const b = base;
    if (!b || b.draft.step !== "review") return null;
    const { match, draft, ability } = b;
    const attacks =
      ability.interaction === "targeted-attack" ||
      ability.interaction === "physical-attack";
    const hitRows = (() => {
      if (!attacks) return [];
      const attackTargets =
        ability.interaction === "physical-attack"
          ? draft.attackLegs.flatMap((leg, legIndex) =>
              leg.map((characterId, contactIndex) => ({
                characterId,
                label: `${legIndex + 1}.${contactIndex + 1}`,
              })),
            )
          : draft.targets.map((characterId) => ({
              characterId,
              label: "1.1",
            }));
      return attackTargets.map(({ characterId, label }) =>
        attackPreviewRow(
          {
            match,
            draft,
            baseDamage: 1,
            physicalAttack: ability.interaction === "physical-attack",
          },
          characterId,
          label,
        ),
      );
    })();
    const changeRows = (() => {
      if (
        attacks ||
        (draft.targets.length === 0 && ability.interaction !== "self")
      )
        return [];
      const changeTargets =
        ability.interaction === "self"
          ? [ability.ownerCharacterId]
          : draft.targets;
      return changeTargets.map((characterId) =>
        effectPreviewRow(match, ability, characterId),
      );
    })();
    const legReviews: readonly LegReview[] = draft.attackLegs
      .filter((leg) => leg.length > 0 || draft.attackLegs.length > 1)
      .map((leg, index) => ({
        names: leg.map((id) => rulesCharacterOf(id)),
        redirect: index === 1,
      }));
    const reactionReviews: readonly ReactionReview[] = draft.reactions.flatMap(
      (selection) => {
        const reaction = MATCH_CONFIGURATION.reactions.find(
          ({ id }) => id === selection.reactionId,
        );
        if (!reaction) return [];
        const owner = rulesCharacterOf(reaction.ownerCharacterId);
        const protectedCharacter = rulesCharacterOf(
          selection.protectedCharacterId,
        );
        const isDamageBlock = reaction.operations.some(
          ({ type }) => type === "reduce-remaining-damage",
        );
        const details = [
          isDamageBlock
            ? `Reduces remaining damage by 1 for ${protectedCharacter.name}.`
            : `Prevents damage and effects for ${protectedCharacter.name}.`,
          reaction.name === "Misty Escape"
            ? `Move ${owner.name} up to 2 paces immediately. Position remains physical.`
            : "",
          reaction.name === "Deflecting Palm"
            ? `The same physical attack is redirected toward ${rulesCharacterOf(draft.sourceCharacterId).name}; its original source, profile, and hard maximum range remain unchanged.`
            : "",
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
    const warnings = draftWarnings(match, draft, ability);
    const needsAbilityOverride = warnings.length > 0;
    const backStep: DraftStep = (() => {
      if (ability.interaction === "physical-attack") return "contacts";
      if (ability.interaction === "targeted-attack") return "reactions";
      return "select-target";
    })();
    return {
      hitRows,
      changeRows,
      legReviews,
      reactionReviews,
      warnings,
      needsAbilityOverride,
      confirmDisabled:
        // Disabled unless the referee cleared every warning or recorded the
        // Ability Override.
        needsAbilityOverride && !draft.abilityOverride,
      backStep,
      saving: application.state.saving,
    };
  });

  function setStep(step: DraftStep): void {
    const draft = uiState.state.actionDraft;
    if (!draft || draft.kind !== "ability") return;
    uiState.setActionDraft({ ...draft, step });
  }

  function continueTargets(): void {
    if (base?.ability.interaction === "targeted-attack") {
      setStep("reactions");
      return;
    }
    finishAbility();
  }

  function finishAbility(): void {
    const b = base;
    if (!b) return;
    if (draftWarnings(b.match, b.draft, b.ability).length > 0) {
      setStep("review");
      return;
    }
    void confirmAbility();
  }

  function handleTargetChange(
    characterId: CharacterId,
  ): (event: Event) => void {
    return (event) => {
      if (!(event.currentTarget instanceof HTMLInputElement)) return;
      const currentDraft = uiState.state.actionDraft;
      const ability = MATCH_CONFIGURATION.abilities.find(
        ({ id }) => id === currentDraft?.abilityId,
      );
      if (!currentDraft || currentDraft.kind !== "ability" || !ability) return;
      const multi = ability.targetPolicy.cardinality === "all-in-range";
      const { checked } = event.currentTarget;
      const targets = (() => {
        if (!checked)
          return currentDraft.targets.filter((id) => id !== characterId);
        if (multi) return [...currentDraft.targets, characterId];
        return [characterId];
      })();
      uiState.setActionDraft({
          ...currentDraft,
          targets,
          reactions: currentDraft.reactions.filter(({ protectedCharacterId }) =>
            targets.includes(protectedCharacterId),
          ),
      });
    };
  }

  function handleAbilityOverrideChange(event: Event): void {
    if (!(event.currentTarget instanceof HTMLInputElement)) return;
    const currentDraft = uiState.state.actionDraft;
    if (!currentDraft || currentDraft.kind !== "ability") return;
    uiState.setActionDraft({
        ...currentDraft,
        abilityOverride: event.currentTarget.checked,
    });
  }

  function cancelAbilityDraft(): void {
    const draft = uiState.state.actionDraft;
    if (!draft || draft.kind !== "ability") return;
    uiState.setActionDraft(null);
    uiState.setPickerVisibility({ ability: false });
  }

  async function confirmAbility(): Promise<void> {
    const { match } = application.state;
    const draft = uiState.state.actionDraft;
    if (
      match?.phase !== "active" ||
      draft?.kind !== "ability" ||
      draft.abilityId === null
    )
      return;
    const succeeded = await application.resolveAbility(
      abilityCommandInput(draft.abilityId, draft),
    );
    if (!succeeded) {
      const message = application.state.errors.operation;
      if (message && OVERRIDEABLE_DOMAIN_ERRORS.has(message)) {
        uiState.setActionDraft({ ...draft, overrideRequired: message });
      }
      return;
    }
    uiState.setActionDraft(null);
    uiState.setPickerVisibility({ ability: false });
  }
</script>

{#snippet abilityProfile(b: AbilityDraftBase)}
  <div class="attack-profile">
    <!-- Single-line runs: specs regex-match across these phrases and read
         raw textContent from the source paragraph. -->
    <p>
      <strong>Source:</strong>
      <CharacterName
        character={b.sourceCharacter}
        displayNames={b.match.displayNames}
      />
    </p>
    <p>
      <strong>{MATCH_CONFIGURATION.labels.ability}:</strong>
      {b.ability.name} · {b.ability.actionType === "powerful"
        ? MATCH_CONFIGURATION.labels.powerfulAbility
        : MATCH_CONFIGURATION.labels.standardAbility}
    </p>
    <p><strong>Range:</strong> {b.ability.range}</p>
    <p><strong>Effect:</strong> {b.ability.name === "Vanish" ? b.ability.rulesText.replace("up to twice the Rogue’s current Move allowance plus 2 paces", `up to ${String(vanishMovementPaces(b.match, b.sourceCharacter.id))} paces`) : b.ability.rulesText}</p>
  </div>
{/snippet}

{#snippet reviewArticle(leg: LegReview, index: number, b: AbilityDraftBase)}
  <article class="attack-leg-review" data-attack-leg-review>
    <h3>
      Leg {index + 1} · {index === 0
        ? "Initial throw"
        : "Deflecting Palm redirect"}
    </h3>
    <p>
      {#each leg.names as name, nameIndex (name.id)}{#if nameIndex > 0}{LEG_NAME_SEPARATOR}{/if}<CharacterName
          character={name}
          displayNames={b.match.displayNames}
        />{/each}{#if leg.names.length === 0}{LEG_CONTACTS_NONE}{/if}
    </p>
    {#if leg.redirect}
      <!-- Single-line run: matched across interpolations. -->
      <p>
        Original source: <CharacterName
          character={b.sourceCharacter}
          displayNames={b.match.displayNames}
        /> · {b.ability.name} · hard maximum range {b.ability.range}.
      </p>
    {/if}
  </article>
{/snippet}

{#snippet targetRow(row: TargetRow, override: boolean, b: AbilityDraftBase)}
  <label class="contact-control">
    <input
      type="checkbox"
      data-ability-target={row.candidate.characterId}
      data-ability-target-override={String(override)}
      checked={row.selected}
      onchange={handleTargetChange(row.candidate.characterId)}
    />
    <!-- Single-line runs: getByLabel(REGEX) probes receive raw label text,
         so every spec-matched phrase stays contiguous. -->
    <span
      ><CharacterName
        character={row.character}
        displayNames={b.match.displayNames}
      /> · {row.character.team} · HP {row.hp}/{row.maxHp}{#if row.candidate.reasons.length > 0}<small
          >{row.candidate.reasons.join(" · ")}. Selecting records an Override.</small
        >{/if}</span
    >
  </label>
{/snippet}

{#if base}
  <section
    class="match-panel action-draft ability-draft"
    aria-labelledby="ability-draft-heading"
  >
    {#if application.state.errors.operation}
      <p class="blocking-error" role="alert">
        {application.state.errors.operation}
      </p>
    {/if}
    {#if targeting}
      <p class="eyebrow">Use Ability · Choose target</p>
      <h2 id="ability-draft-heading">{base.ability.name}</h2>
      {@render abilityProfile(base)}
      <fieldset>
        <legend>
          {targeting.single ? "Exactly one target" : "Targets in range"}
        </legend>
        <!-- Single-line run: matches the legacy template's single-spaced
             sentence exactly. -->
        <p>
          Selections are filtered by the ability's target policy: {base.ability
            .targetPolicy.relation} · {base.ability.targetPolicy.lifeState}.
        </p>
        <div class="contact-list" data-eligible-targets>
          {#if targeting.eligible.length > 0}
            {#each targeting.eligible as row (row.candidate.characterId)}
              {@render targetRow(row, false, base)}
            {/each}
          {:else}
            <p>No state-eligible targets.</p>
          {/if}
        </div>
      </fieldset>
      {#if targeting.overridden.length > 0}
        <details class="target-overrides">
          <summary>Override unavailable targets</summary>
          <p>
            These choices violate the target policy. Selection records an
            Override.
          </p>
          <div class="contact-list" data-override-targets>
            {#each targeting.overridden as row (row.candidate.characterId)}
              {@render targetRow(row, true, base)}
            {/each}
          </div>
        </details>
      {/if}
      {#if targeting.blockedCount > 0}
        <!-- Single-line run: this sentence stays one contiguous phrase. -->
        <p class="device-note">
          {targeting.blockedCount} character{targeting.blockedCount === 1
            ? " is"
            : "s are"} unavailable because an absolute rule blocks the selection.
        </p>
      {/if}
      <div class="match-actions">
        <button
          id="ability-targets-continue"
          class="primary-action"
          type="button"
          disabled={!targeting.ready}
          onclick={continueTargets}
        >
          {targeting.continueLabel}
        </button>
        <button
          id="cancel-ability"
          class="secondary-action"
          type="button"
          onclick={() => cancelAbilityDraft()}
        >
          Cancel draft
        </button>
      </div>
    {:else if base.draft.step === "reactions"}
      <p class="eyebrow">Use Ability · Reactions</p>
      <h2 id="ability-draft-heading">{base.ability.name}</h2>
      {@render abilityProfile(base)}
      <DraftReactionsFieldset
        match={base.match}
        affectedCharacterIds={base.draft.targets}
        physicalAttack={false}
      />
      <div class="match-actions">
        <button
          id="review-ability"
          class="primary-action"
          type="button"
          onclick={finishAbility}
        >
          Record Action Resolution
        </button>
        <button
          id="back-to-ability-targets"
          class="secondary-action"
          type="button"
          onclick={() => setStep("select-target")}
        >
          Back
        </button>
        <button
          id="cancel-ability"
          class="secondary-action"
          type="button"
          onclick={() => cancelAbilityDraft()}
        >
          Cancel draft
        </button>
      </div>
    {:else if physicalContacts}
      <p class="eyebrow">Use Ability · Physical result</p>
      <h2 id="ability-draft-heading">Record {base.ability.name}</h2>
      <p>This draft stays local until final confirmation.</p>
      {@render abilityProfile(base)}
      {#if physicalContacts.closedLeg}
        <section class="closed-attack-leg" data-closed-attack-leg>
          <h3>Attack Leg 1 closed</h3>
          <p>
            {#each physicalContacts.closedLeg.names as name, nameIndex (name.id)}{#if nameIndex > 0}{LEG_NAME_SEPARATOR}{/if}<CharacterName
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
            /> · {base.ability.name} · hard maximum range {base.ability.range}.
            Record every later legal contact; earlier contacts remain
            unavailable.
          </p>
        </section>
      {/if}
      <DraftContactsFieldset match={base.match} />
      <DraftReactionsFieldset
        match={base.match}
        affectedCharacterIds={base.draft.attackLegs.flat()}
      />
      <DraftChecksFieldset />
      <div class="match-actions">
        <button
          id="review-ability"
          class="primary-action"
          type="button"
          disabled={!physicalContacts.ready}
          onclick={finishAbility}
        >
          Record Action Resolution
        </button>
        <button
          id="cancel-ability"
          class="secondary-action"
          type="button"
          onclick={() => cancelAbilityDraft()}
        >
          Cancel draft
        </button>
      </div>
    {:else if review}
      <p class="eyebrow">Use Ability · Override</p>
      <h2 id="ability-draft-heading">Override {base.ability.name}</h2>
      {@render abilityProfile(base)}
      {#if review.legReviews.length > 0}
        <section aria-labelledby="ability-legs-heading">
          <h3 id="ability-legs-heading">Ordered Attack Legs</h3>
          <div class="attack-leg-review-list">
            {#each review.legReviews as leg, index (index)}
              {@render reviewArticle(leg, index, base)}
            {/each}
          </div>
        </section>
      {/if}
      {#if review.hitRows.length > 0}
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
      {/if}
      {#if review.changeRows.length > 0}
        <div class="table-wrap">
          <table class="initiative-table">
            <caption>Expected changes</caption>
            <thead>
              <tr>
                <th>Character</th>
                <th>Team</th>
                <th>Effect</th>
                <th>HP</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {#each review.changeRows as row, rowIndex (rowIndex)}
                <tr data-ability-review-change>
                  <th scope="row">
                    <CharacterName
                      character={row.character}
                      displayNames={base.match.displayNames}
                    />
                  </th>
                  <td>{row.team}</td>
                  <td>{row.effectLabel}</td>
                  <td>{row.hpText}</td>
                  <td>{row.lifeStateText}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
      {#if review.reactionReviews.length > 0}
        <section aria-labelledby="ability-reaction-review-heading">
          <h3 id="ability-reaction-review-heading">
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
      {#if review.needsAbilityOverride}
        <div class="draft-warning" role="alert">
          {#each review.warnings as warning, warningIndex (warningIndex)}
            <!-- The code separator and any character-name gap ride inside
                 expressions: literal whitespace at control-flow block edges
                 is trimmed, expression output is not. -->
            <p>
              {warning.code}{WARNING_CODE_SEPARATOR}{#if warning.character}<CharacterName
                  character={warning.character}
                  displayNames={base.match.displayNames}
                />{/if}{warning.rest}
            </p>
          {/each}
          <label class="override-control">
            <input
              id="ability-override"
              type="checkbox"
              checked={base.draft.abilityOverride}
              onchange={handleAbilityOverrideChange}
            />
            Record referee Override for this Ability choice
          </label>
        </div>
      {/if}
      <div class="match-actions">
        <button
          id="confirm-ability"
          class="primary-action"
          type="button"
          disabled={review.confirmDisabled}
          onclick={() => void confirmAbility()}
        >
          {review.saving ? "Saving…" : "Record Action Resolution"}
        </button>
        {#if review.backStep === "contacts"}
          <button
            id="back-to-contacts"
            class="secondary-action"
            type="button"
            onclick={() => setStep("contacts")}
          >
            Back
          </button>
        {:else if review.backStep === "reactions"}
          <button
            id="back-to-ability-reactions"
            class="secondary-action"
            type="button"
            onclick={() => setStep("reactions")}
          >
            Back
          </button>
        {:else}
          <button
            id="back-to-ability-targets"
            class="secondary-action"
            type="button"
            onclick={() => setStep("select-target")}
          >
            Back
          </button>
        {/if}
        <button
          id="cancel-ability"
          class="secondary-action"
          type="button"
          onclick={() => cancelAbilityDraft()}
        >
          Cancel draft
        </button>
      </div>
    {/if}
  </section>
{/if}
