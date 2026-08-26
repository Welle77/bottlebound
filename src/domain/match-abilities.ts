import { RULESET, type StructuredAbility } from "./ruleset";
import {
  AUTOMATED_REACTION_NAMES,
  protectiveReactionWarnings,
} from "./match-combat";
import { applyDownedCleanup } from "./match-turn";
import { applyUtilityAbility } from "./match-ability-utility";
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
  MatchCharacter,
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

/**
 * Hard maximum range in paces parsed from the ability card's Range field
 * ("2 paces", "6 paces", "8 paces" — Deadeye). Attack interactions always
 * carry their printed card range; anything else is an automation contract
 * error.
 */
function attackRangePaces(ability: StructuredAbility): 2 | 6 | 8 {
  const parsed = /^(\d+) paces$/.exec(ability.range);
  const value = parsed ? Number(parsed[1]) : NaN;
  if (value === 2 || value === 6 || value === 8) return value;
  throw new Error(
    `The ability has an unsupported attack range contract: ${ability.range}`,
  );
}

import {
  abilityWarnings,
  buildAbilityEffects,
  getAbilityOrThrow,
  resolveAffectedCharacterIds,
  resolveAttackDamageAgainstCharacter,
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
  // Card gate: Shapeshift may be activated only while the Druid is active at
  // exactly 2 or 3 HP (rules §15 Druid card).
  if (
    ability.name === "Shapeshift" &&
    sourceCharacter.hp !== 2 &&
    sourceCharacter.hp !== 3
  ) {
    throw new Error(
      "Shapeshift may be activated only while the Druid is at 2 or 3 HP.",
    );
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
  // A character hit by Backstab or Stunning Strike cannot use a Powerful
  // Ability on its next turn (rules §15 card effects).
  if (ability.actionType === "powerful") {
    const prohibited = state.activeEffects.some(
      (effect) =>
        effect.kind === "prohibit-powerful" &&
        effect.affectedCharacterId === ability.ownerCharacterId,
    );
    if (prohibited) {
      throw new Error(
        "A Powerful Ability is prohibited on this turn by a recorded card effect.",
      );
    }
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
                instruction: `Move ${reaction.name}'s owner up to ${String(operation.maxPaces)} paces immediately.`,
              },
            ];
          }
          // Only "redirect-physical-attack" operations remain in this union.
          return [
            {
              type: operation.type,
              fromCharacterId: reaction.ownerCharacterId,
              towardCharacterId: ability.ownerCharacterId,
            },
          ];
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
  // Per-target HP changes feed effect expiry checks, so the update is
  // computed as one pure fold: every intermediate snapshot stays immutable.
  const initialApplied: readonly ActiveEffect[] = buildAbilityEffects(ability, {
    affectedIds: affectedCharacterIds,
    sequence,
    anchorId: ability.ownerCharacterId,
  });

  const isAttackInteraction =
    ability.interaction === "targeted-attack" ||
    ability.interaction === "physical-attack";

  const attackOutcome = isAttackInteraction
    ? (() => {
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
        return affectedCharacterIds.reduce<{
          readonly characters: readonly MatchCharacter[];
          readonly effects: readonly ActionEffect[];
          readonly expired: readonly ActiveEffect[];
          readonly applied: readonly ActiveEffect[];
        }>(
          (accumulated, targetId) => {
            const character = accumulated.characters.find(
              (candidate) => candidate.characterId === targetId,
            );
            if (!character)
              throw new Error("Ability references unknown character.");
            const resolved = resolveAttackDamageAgainstCharacter({
              baseDamage,
              affectedCharacterId: targetId,
              physicalAttack: ability.interaction === "physical-attack",
              prevented:
                protectedIds.has(targetId) ||
                (ability.interaction === "physical-attack" &&
                  vanishProtected.has(targetId)),
              activeEffects: state.activeEffects,
              sequence,
            });
            const hpBefore = character.hp;
            const hpAfter = Math.max(0, hpBefore - resolved.finalDamage);
            return {
              characters: accumulated.characters.map((candidate) =>
                candidate.characterId === targetId
                  ? { ...candidate, hp: hpAfter }
                  : candidate,
              ),
              effects: [
                ...accumulated.effects,
                {
                  characterId: targetId,
                  damage: resolved.finalDamage,
                  hpBefore,
                  hpAfter,
                  downedBefore: hpBefore === 0,
                  downedAfter: hpAfter === 0,
                },
              ],
              expired: [...accumulated.expired, ...resolved.expired],
              applied: [...accumulated.applied, ...resolved.applied],
            };
          },
          {
            characters: [...state.characters],
            effects: [],
            expired: [],
            applied: [],
          },
        );
      })()
    : (() => {
        const utility = applyUtilityAbility({
          ability,
          affectedCharacterIds,
          priorCharacters: state.characters,
          characters: [...state.characters],
        });
        return {
          ...utility,
          expired: [] as readonly ActiveEffect[],
          applied: [] as readonly ActiveEffect[],
        };
      })();

  const shapeshiftExpiry = [...state.activeEffects, ...initialApplied]
    .filter((effect) => effect.kind === "shapeshift")
    .reduce<{
      readonly characters: readonly MatchCharacter[];
      readonly expired: readonly ActiveEffect[];
    }>(
      (accumulated, effect) => {
        const affected = accumulated.characters.find(
          (character) => character.characterId === effect.affectedCharacterId,
        );
        if (!affected || (affected.hp >= 3 && affected.hp !== 0)) {
          return accumulated;
        }
        return {
          characters: accumulated.characters.map((candidate) =>
            candidate.characterId === effect.affectedCharacterId
              ? { ...candidate, currentMaxHp: 3, hp: Math.min(candidate.hp, 3) }
              : candidate,
          ),
          expired: [...accumulated.expired, effect],
        };
      },
      {
        characters: attackOutcome.characters,
        expired: [],
      },
    );

  const characters = shapeshiftExpiry.characters;
  const effects: readonly ActionEffect[] = attackOutcome.effects;
  const pendingAppliedEffects: readonly ActiveEffect[] = [
    ...initialApplied,
    ...attackOutcome.applied,
  ];
  const expiredBeforeCleanup: readonly ActiveEffect[] = [
    ...attackOutcome.expired,
    ...shapeshiftExpiry.expired,
  ];

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
  const cardRangePaces = isAttackInteraction ? attackRangePaces(ability) : 2;
  const mappedLegs: readonly AttackLeg[] = isAttackInteraction
    ? (attackLegsInput ?? [{ affectedCharacterIds: affectedCharacterIds }]).map(
        (leg, index) => ({
          sequence: index + 1,
          kind: index === 0 ? "initial" : "redirected",
          sourceCharacterId: ability.ownerCharacterId,
          attackId: ability.id,
          rangePaces: cardRangePaces,
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
          rangePaces: cardRangePaces,
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
            rangePaces: cardRangePaces,
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
    rangePaces: cardRangePaces,
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
    abilityOverride,
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
