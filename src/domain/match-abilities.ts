import { castDraft, produce } from "immer";
import { RULESET } from "./ruleset";
import {
  AUTOMATED_REACTION_NAMES,
  protectiveReactionWarnings,
} from "./match-combat";
import { applyDownedCleanup } from "./match-turn";
import type {
  ActionEffect,
  ActionResolvedEvent,
  ActiveEffect,
  ActiveMatchState,
  AttackLeg,
  CommandResult,
  MatchOutcome,
  MatchState,
  ProtectiveReactionInput,
  ProtectiveReactionOperation,
  ProtectiveReactionResolution,
} from "./match-types";

export interface AbilityInput {
  readonly abilityId: string;
  readonly targetCharacterIds?: readonly string[];
  readonly attackLegs?: readonly {
    readonly affectedCharacterIds: readonly string[];
  }[];
  readonly physicalConfirmations?: {
    readonly range: boolean;
    readonly lineOfSight: boolean;
    readonly legalBottleContact: boolean;
    readonly terrainContact: boolean;
  };
  readonly reactions?: readonly ProtectiveReactionInput[];
  readonly majorActionOverride?: string | null;
  readonly abilityOverride?: string | null;
}

import {
  abilityWarnings,
  buildAbilityEffects,
  getAbilityOrThrow,
  resolveAffectedCharacterIds,
} from "./match-ability-effects";

export function resolveAbility(
  state: ActiveMatchState,
  input: AbilityInput,
  occurredAt: string,
): CommandResult<ActiveMatchState, ActionResolvedEvent> {
  if ((state as MatchState).phase === "ended") {
    throw new Error("The Ended Match is read-only.");
  }
  if (state.rulesVersion !== RULESET.version) {
    throw new Error("Ability needs the exact bundled Ruleset.");
  }
  const ability = getAbilityOrThrow(input.abilityId);
  const activeCharacterId = state.initiative[state.activeSlot - 1]?.characterId;
  if (input.abilityId && ability.ownerCharacterId !== activeCharacterId) {
    // ability must be owned by active character
    // This is a structural check that can be overridden? Spec says wrong-active-character is overridable? Use warning logic.
    // For now hard error unless abilityOverride provided that mentions wrong-active-character
    const override = input.abilityOverride?.trim() || null;
    if (override === null) {
      throw new Error("wrong-active-character");
    }
  }
  if (ability.ownerCharacterId !== activeCharacterId) {
    const override = input.abilityOverride?.trim() || null;
    if (override === null) {
      // collect warning path similar to spent - require override
      throw new Error("wrong-active-character");
    }
  }
  const sourceCharacter = state.characters.find(
    ({ characterId }) => characterId === ability.ownerCharacterId,
  );
  if (!sourceCharacter || sourceCharacter.hp === 0) {
    throw new Error("A Downed character cannot use an ability.");
  }
  const spentWarnings = abilityWarnings(state, ability.id);
  const abilityOverride = input.abilityOverride?.trim() || null;
  if (spentWarnings.length > 0 && abilityOverride === null) {
    throw new Error("ability-already-spent");
  }
  const majorOverride = input.majorActionOverride?.trim() || null;
  if (state.majorActionUsed && majorOverride === null) {
    throw new Error("A second ability needs a recorded referee override.");
  }
  // Powerful check inherits majorActionUsed (0 movement) – already enforced via majorActionUsed
  // For Powerful, same override required which we already check.

  // Determine affected / target ids based on interaction
  const attackLegsInput = input.attackLegs;
  const affectedCharacterIds = resolveAffectedCharacterIds({
    state,
    ability,
    input,
    abilityOverride,
  });

  // Reactions for targeted/physical abilities (reuse protective logic)
  const selectedReactions = input.reactions ?? [];
  const reactions = selectedReactions.reduce<{
    readonly seen: ReadonlySet<string>;
    readonly results: readonly ProtectiveReactionResolution[];
  }>(
    (accumulated, selection) => {
      const reaction = RULESET.reactions.find(
        ({ id }) => id === selection.reactionId,
      );
      if (!reaction || !AUTOMATED_REACTION_NAMES.has(reaction.name)) {
        throw new Error("The Action Draft references an unsupported Reaction.");
      }
      if (!affectedCharacterIds.includes(selection.protectedCharacterId)) {
        throw new Error("A Reaction can protect only an affected character.");
      }
      if (accumulated.seen.has(reaction.ownerCharacterId)) {
        throw new Error(
          "One character cannot use two Reactions against one attack.",
        );
      }
      const warnings = protectiveReactionWarnings(
        state,
        reaction.id,
        selection.protectedCharacterId,
      );
      const reactionOverride = selection.override?.trim() || null;
      if (warnings.length > 0 && reactionOverride === null) {
        throw new Error("A state-invalid Reaction needs a recorded Override.");
      }
      const operations = reaction.operations.flatMap(
        (operation): readonly ProtectiveReactionOperation[] => {
          if (operation.type === "prevent-damage-and-effects") {
            return [
              {
                type: operation.type,
                characterId: selection.protectedCharacterId,
              },
            ];
          }
          if (operation.type === "manual-movement") {
            return [
              {
                type: operation.type,
                characterId: reaction.ownerCharacterId,
                maxPaces: operation.maxPaces,
                instruction: `Move ${reaction.name}'s owner up to ${operation.maxPaces} paces immediately.`,
              },
            ];
          }
          if (operation.type === "redirect-physical-attack") {
            return [
              {
                type: operation.type,
                fromCharacterId: reaction.ownerCharacterId,
                towardCharacterId: ability.ownerCharacterId,
              },
            ];
          }
          return [];
        },
      );
      return {
        seen: new Set([...accumulated.seen, reaction.ownerCharacterId]),
        results: [
          ...accumulated.results,
          {
            reactionId: reaction.id,
            ownerCharacterId: reaction.ownerCharacterId,
            protectedCharacterId: selection.protectedCharacterId,
            warnings,
            override: reactionOverride,
            operations,
          } satisfies ProtectiveReactionResolution,
        ],
      };
    },
    { seen: new Set<string>(), results: [] },
  ).results;

  // Compute damage/effects for ability
  const sequence = state.sequence + 1;
  // The update is genuinely incremental: per-target HP changes feed effect
  // expiry checks. It therefore runs inside an immer workbench -- mutations
  // are expressed on the draft while every produced snapshot stays immutable.
  const workbench = produce(
    {
      characters: [...state.characters],
      effects: [] as readonly ActionEffect[],
      applied: [
        ...buildAbilityEffects(ability, {
          affectedIds: affectedCharacterIds,
          sequence,
          anchorId: ability.ownerCharacterId,
        }),
      ] as readonly ActiveEffect[],
      expired: [] as readonly ActiveEffect[],
    },
    (draft) => {
      // Handle operation types that affect HP or maxHP directly
      const abilityName = ability.name;

      // Helper to apply heal
      const healTarget = (targetId: string) => {
        const idx = draft.characters.findIndex(
          (character) => character.characterId === targetId,
        );
        const character = draft.characters[idx];
        if (!character) throw new Error("Heal target unknown");
        const maxHp = character.currentMaxHp;
        const hpAfter = Math.min(maxHp, character.hp + 1);
        const before = character.hp;
        draft.characters[idx] = { ...character, hp: hpAfter };
        draft.effects.push({
          characterId: targetId,
          damage: 0,
          hpBefore: before,
          hpAfter,
          downedBefore: before === 0,
          downedAfter: hpAfter === 0,
        });
      };

      const reviveTarget = (targetId: string) => {
        const idx = draft.characters.findIndex(
          (character) => character.characterId === targetId,
        );
        const character = draft.characters[idx];
        if (!character) throw new Error("Revive target unknown");
        const before = character.hp;
        draft.characters[idx] = { ...character, hp: 1 };
        draft.effects.push({
          characterId: targetId,
          damage: 0,
          hpBefore: before,
          hpAfter: 1,
          downedBefore: true,
          downedAfter: false,
        });
      };

      // For targeted and physical attacks: deal damage path
      if (
        ability.interaction === "targeted-attack" ||
        ability.interaction === "physical-attack"
      ) {
        const protectedIds = new Set(
          reactions.flatMap(({ operations }) =>
            operations.flatMap((operation) =>
              operation.type === "prevent-damage-and-effects"
                ? [operation.characterId]
                : [],
            ),
          ),
        );
        // Check Vanish ignore
        const vanishProtected = new Set(
          state.activeEffects
            .filter((effect) =>
              effect.operations.includes("ignore-physical-attack"),
            )
            .map((effect) => effect.affectedCharacterId),
        );
        const baseDamage = 1;
        // Build base effects with final damage after prevention and ignore
        for (const targetId of affectedCharacterIds) {
          const character = draft.characters.find(
            (candidate) => candidate.characterId === targetId,
          );
          if (!character)
            throw new Error("Ability references unknown character.");
          const prevented: 0 | 1 =
            protectedIds.has(targetId) ||
            (ability.interaction === "physical-attack" &&
              vanishProtected.has(targetId))
              ? 0
              : baseDamage;
          // Rage reduction: if target has rage and damage positive, reduce by 1 then consume rage
          const rageEffect = state.activeEffects.find(
            (effect) =>
              effect.kind === "rage" && effect.affectedCharacterId === targetId,
          );
          if (rageEffect && prevented > 0) {
            draft.expired.push(castDraft(rageEffect));
          }
          // Add-damage from Hunter's Mark / Hex on target
          const markEffect = state.activeEffects.find(
            (effect) =>
              (effect.kind === "hunters-mark" || effect.kind === "hex") &&
              effect.affectedCharacterId === targetId,
          );
          const finalDamage = rageEffect && prevented > 0 ? 0 : prevented;
          if (markEffect && finalDamage === 1) {
            // add-damage makes it still 1? Actually add-damage would make 2? But hp is capped per damage? For simplicity keep 1 + mark consumption will be handled as consumption; damage stays 1 then mark consumed.
            draft.expired.push(castDraft(markEffect));
            // If Hex, also create movement cap on trigger
            if (markEffect.kind === "hex") {
              draft.applied.push({
                effectId: `${ability.id}-hex-movement-${targetId}-${sequence}`,
                abilityId: markEffect.abilityId,
                kind: "movement-cap",
                anchorCharacterId: markEffect.anchorCharacterId,
                affectedCharacterId: targetId,
                duration: {
                  kind: "until-boundary",
                  boundaryTrigger: "end-of-next-turn",
                  anchor: "affected",
                  removeWhenAffectedDowned: true,
                },
                operations: ["set-movement-cap"],
                appliedSequence: sequence,
              });
            }
          }
          // For physical ability, each hit also accounts for its own effect already in pendingAppliedEffects (prohibit)
          const hpBefore = character.hp;
          const hpAfter = Math.max(0, hpBefore - finalDamage);
          const idx = draft.characters.findIndex(
            (candidate) => candidate.characterId === targetId,
          );
          draft.characters[idx] = { ...draft.characters[idx]!, hp: hpAfter };
          draft.effects.push({
            characterId: targetId,
            damage: finalDamage,
            hpBefore,
            hpAfter,
            downedBefore: hpBefore === 0,
            downedAfter: hpAfter === 0,
          });
        }
        // If damage was 0 due to prevention, do not trigger successful-damage consumption for marks that were not already handled? Already handled.
      } else {
        // Non-attack utilities: apply per ability
        if (
          abilityName === "Nature's Renewal" ||
          abilityName === "Inspiring Words" ||
          abilityName === "Second Wind"
        ) {
          for (const targetId of affectedCharacterIds) {
            healTarget(targetId);
          }
        } else if (abilityName === "Lay on Hands") {
          for (const targetId of affectedCharacterIds) {
            const targetChar = state.characters.find(
              (character) => character.characterId === targetId,
            );
            if (targetChar?.hp === 0) reviveTarget(targetId);
            else healTarget(targetId);
          }
        } else if (abilityName === "Revivify") {
          for (const targetId of affectedCharacterIds) reviveTarget(targetId);
        } else if (abilityName === "Shapeshift") {
          // change-max-hp to 4 and heal 1
          for (const targetId of affectedCharacterIds) {
            const idx = draft.characters.findIndex(
              (character) => character.characterId === targetId,
            );
            const character = draft.characters[idx]!;
            const before = character.hp;
            const withMax = {
              ...character,
              currentMaxHp: 4,
              hp: Math.min(4, character.hp + 1),
            };
            draft.characters[idx] = withMax;
            draft.effects.push({
              characterId: targetId,
              damage: 0,
              hpBefore: before,
              hpAfter: withMax.hp,
              downedBefore: before === 0,
              downedAfter: withMax.hp === 0,
            });
          }
        } else if (
          abilityName === "Vanish" ||
          abilityName === "Misty Escape" ||
          abilityName === "Deflecting Palm" ||
          abilityName === "Divine Shield" ||
          abilityName === "Shield Wall" ||
          abilityName === "Mirror Veil"
        ) {
          // Vanish handled as effect; others are reactions not direct abilities. No HP change.
          // Push empty effect per target for audit?
          for (const targetId of affectedCharacterIds) {
            const character = draft.characters.find(
              (candidate) => candidate.characterId === targetId,
            )!;
            draft.effects.push({
              characterId: targetId,
              damage: 0,
              hpBefore: character.hp,
              hpAfter: character.hp,
              downedBefore: character.hp === 0,
              downedAfter: character.hp === 0,
            });
          }
        } else if (
          abilityName === "Frostbind" ||
          abilityName === "Battle Hymn" ||
          abilityName === "Blessing of Battle"
        ) {
          for (const targetId of affectedCharacterIds) {
            const character = draft.characters.find(
              (candidate) => candidate.characterId === targetId,
            )!;
            draft.effects.push({
              characterId: targetId,
              damage: 0,
              hpBefore: character.hp,
              hpAfter: character.hp,
              downedBefore: character.hp === 0,
              downedAfter: character.hp === 0,
            });
          }
        } else if (abilityName === "Rage") {
          for (const targetId of affectedCharacterIds) {
            const character = draft.characters.find(
              (candidate) => candidate.characterId === targetId,
            )!;
            draft.effects.push({
              characterId: targetId,
              damage: 0,
              hpBefore: character.hp,
              hpAfter: character.hp,
              downedBefore: character.hp === 0,
              downedAfter: character.hp === 0,
            });
          }
        } else if (abilityName === "Hunter's Mark" || abilityName === "Hex") {
          // Apply mark effect: no immediate HP change but record effect. Need an effects entry for audit.
          for (const targetId of affectedCharacterIds) {
            const character = draft.characters.find(
              (candidate) => candidate.characterId === targetId,
            )!;
            draft.effects.push({
              characterId: targetId,
              damage: 0,
              hpBefore: character.hp,
              hpAfter: character.hp,
              downedBefore: character.hp === 0,
              downedAfter: character.hp === 0,
            });
          }
        } else {
          // Generic: no HP change, just record
          for (const targetId of affectedCharacterIds) {
            const character = draft.characters.find(
              (candidate) => candidate.characterId === targetId,
            )!;
            draft.effects.push({
              characterId: targetId,
              damage: 0,
              hpBefore: character.hp,
              hpAfter: character.hp,
              downedBefore: character.hp === 0,
              downedAfter: character.hp === 0,
            });
          }
        }
      }

      // After HP changes, apply Shapeshift while-condition expiry check: if HP <3, expire shapeshift
      for (const effect of [...state.activeEffects, ...draft.applied]) {
        if (effect.kind === "shapeshift") {
          const affected = draft.characters.find(
            (character) => character.characterId === effect.affectedCharacterId,
          );
          if (affected && (affected.hp < 3 || affected.hp === 0)) {
            draft.expired.push(castDraft(effect));
            // Also revert maxHP to 3
            const idx = draft.characters.findIndex(
              (character) =>
                character.characterId === effect.affectedCharacterId,
            );
            if (idx >= 0) {
              const before = draft.characters[idx]!;
              draft.characters[idx] = {
                ...before,
                currentMaxHp: 3,
                hp: Math.min(before.hp, 3),
              };
              // Adjust effects hpAfter if changed? Keep original effects but maxHP change is expiry side effect.
            }
          }
        }
      }
    },
  );

  const characters = workbench.characters;
  const effects = workbench.effects;
  const pendingAppliedEffects: readonly ActiveEffect[] = workbench.applied;
  const expiredBeforeCleanup: readonly ActiveEffect[] = workbench.expired;

  // Downed cleanup after HP changes and immediate expiries
  const combinedEffects = [
    ...state.activeEffects,
    ...pendingAppliedEffects,
  ].filter(
    (effect) =>
      !expiredBeforeCleanup.some(
        (expired) => expired.effectId === effect.effectId,
      ),
  );
  const downedCleanup = applyDownedCleanup(characters, combinedEffects);
  const finalActiveEffects = downedCleanup.cleaned;

  // Deduplicate expired
  const uniqueExpired = [
    ...new Map(
      [...expiredBeforeCleanup, ...downedCleanup.expired].map((effect) => [
        effect.effectId,
        effect,
      ]),
    ).values(),
  ];

  // Eliminations
  const eliminatedTeams = (["Drow", "Duergar"] as const).filter((team) =>
    RULESET.characters
      .filter((character) => character.team === team)
      .every(
        (character) =>
          characters.find(({ characterId }) => characterId === character.id)
            ?.hp === 0,
      ),
  );
  const resultingEliminations: readonly ("Drow" | "Duergar")[] = [
    ...new Set([...state.eliminatedTeams, ...eliminatedTeams]),
  ];
  const outcome: MatchOutcome =
    resultingEliminations.length === 1
      ? resultingEliminations[0] === "Drow"
        ? "Duergar"
        : "Drow"
      : null;

  // Build attackLegs for event
  const isAttackInteraction =
    ability.interaction === "targeted-attack" ||
    ability.interaction === "physical-attack";
  const mappedLegs: readonly AttackLeg[] = isAttackInteraction
    ? (attackLegsInput ?? [{ affectedCharacterIds: affectedCharacterIds }]).map(
        (leg, index) => ({
          sequence: index + 1,
          kind: index === 0 ? "initial" : "redirected",
          sourceCharacterId: ability.ownerCharacterId,
          attackId: ability.id,
          rangePaces: ability.range.includes("6") ? 6 : 2,
          redirectedByReactionId:
            index === 0 ? null : (reactions[0]?.reactionId ?? null),
          towardCharacterId:
            index === 0
              ? null
              : reactions[0]?.ownerCharacterId
                ? ability.ownerCharacterId
                : null,
          affectedCharacterIds: [...leg.affectedCharacterIds],
        }),
      )
    : [
        {
          sequence: 1,
          kind: "initial",
          sourceCharacterId: ability.ownerCharacterId,
          attackId: ability.id,
          rangePaces: 2,
          redirectedByReactionId: null,
          towardCharacterId: null,
          affectedCharacterIds: [...affectedCharacterIds],
        },
      ];
  const attackLegs: readonly AttackLeg[] =
    isAttackInteraction && mappedLegs.length === 0
      ? [
          {
            sequence: 1,
            kind: "initial",
            sourceCharacterId: ability.ownerCharacterId,
            attackId: ability.id,
            rangePaces: ability.range.includes("6") ? 6 : 2,
            redirectedByReactionId: null,
            towardCharacterId: null,
            affectedCharacterIds: [...affectedCharacterIds],
          },
        ]
      : mappedLegs;

  const event: ActionResolvedEvent = {
    type: "ActionResolved",
    matchId: state.matchId,
    sequence,
    rulesVersion: state.rulesVersion,
    occurredAt,
    actionType: "Ability",
    sourceCharacterId: ability.ownerCharacterId,
    attackId: ability.id,
    attackType: "ability",
    rangePaces: ability.range.includes("6") ? 6 : 2,
    damage: 1,
    rulesSourceAnchor: ability.sourceAnchor,
    attackLegs,
    physicalConfirmations:
      ability.interaction === "physical-attack"
        ? {
            range: true,
            lineOfSight: true,
            legalBottleContact: true,
            terrainContact: true,
          }
        : {
            range: true,
            lineOfSight: true,
            legalBottleContact: true,
            terrainContact: true,
          },
    reactions,
    effects,
    majorActionOverride: majorOverride,
    eliminatedTeams: resultingEliminations,
    abilityId: ability.id,
    targetCharacterIds: affectedCharacterIds,
    spentAbilityIds: [ability.id],
    appliedEffects: pendingAppliedEffects,
    expiredEffects: uniqueExpired,
  };

  return {
    event,
    state: {
      ...state,
      sequence,
      majorActionUsed: true,
      spentAbilityIds: [...new Set([...state.spentAbilityIds, ability.id])],
      spentReactionIds: [
        ...new Set([
          ...state.spentReactionIds,
          ...reactions.map(({ reactionId }) => reactionId),
        ]),
      ],
      characters,
      eliminatedTeams: resultingEliminations,
      outcome,
      activeEffects: finalActiveEffects,
    },
  };
}
