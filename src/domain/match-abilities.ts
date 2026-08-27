import { RULESET, type StructuredAbility } from "./ruleset";
import {
  AUTOMATED_REACTION_NAMES,
  protectiveReactionWarnings,
} from "./match-combat";
import { applyDownedCleanup } from "./match-turn";
import { applyUtilityAbility } from "./match-ability-utility";
import type {
  AbilityId,
  ActionEffect,
  ActionResolvedEvent,
  ActiveEffect,
  ActiveMatchState,
  AttackLeg,
  CharacterId,
  CommandResult,
  MatchOutcome,
  MatchState,
  ProtectiveReactionInput,
  ProtectiveReactionOperation,
  ProtectiveReactionResolution,
  MatchCharacter,
  ReactionId,
  Team,
} from "./match-types";

export type AbilityInput = {
  readonly abilityId: AbilityId;
  readonly targetCharacterIds?: readonly CharacterId[];
  readonly attackLegs?: readonly {
    readonly affectedCharacterIds: readonly CharacterId[];
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
};

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

type AbilityOutcome = {
  readonly characters: readonly MatchCharacter[];
  readonly effects: readonly ActionEffect[];
  readonly expired: readonly ActiveEffect[];
  readonly applied: readonly ActiveEffect[];
};

type AbilityOutcomeContext = {
  readonly state: ActiveMatchState;
  readonly ability: StructuredAbility;
  readonly affectedCharacterIds: readonly CharacterId[];
  readonly reactions: readonly ProtectiveReactionResolution[];
  readonly sequence: number;
};

type ActiveEffectLedger = {
  readonly activeEffects: readonly ActiveEffect[];
  readonly expiredEffects: readonly ActiveEffect[];
};

function normalizedOverride(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function validateAbilityUse(context: {
  readonly state: ActiveMatchState;
  readonly ability: StructuredAbility;
  readonly abilityOverride: string | null;
  readonly majorActionOverride: string | null;
}): void {
  const { state, ability, abilityOverride, majorActionOverride } = context;
  const activeCharacterId = state.initiative[state.activeSlot - 1]?.characterId;
  if (
    ability.ownerCharacterId !== activeCharacterId &&
    abilityOverride === null
  ) {
    throw new Error("wrong-active-character");
  }
  const sourceCharacter = state.characters.find(
    ({ characterId }) => characterId === ability.ownerCharacterId,
  );
  if (!sourceCharacter || sourceCharacter.hp === 0) {
    throw new Error("A Downed character cannot use an ability.");
  }
  if (
    ability.name === "Shapeshift" &&
    sourceCharacter.hp !== 2 &&
    sourceCharacter.hp !== 3
  ) {
    throw new Error(
      "Shapeshift may be activated only while the Druid is at 2 or 3 HP.",
    );
  }
  if (
    abilityWarnings(state, ability.id).length > 0 &&
    abilityOverride === null
  ) {
    throw new Error("ability-already-spent");
  }
  if (state.majorActionUsed && majorActionOverride === null) {
    throw new Error("A second ability needs a recorded referee override.");
  }
  const powerfulProhibited = state.activeEffects.some(
    (effect) =>
      effect.kind === "prohibit-powerful" &&
      effect.affectedCharacterId === ability.ownerCharacterId,
  );
  if (ability.actionType === "powerful" && powerfulProhibited) {
    throw new Error(
      "A Powerful Ability is prohibited on this turn by a recorded card effect.",
    );
  }
}

function reactionOperations(
  reaction: (typeof RULESET.reactions)[number],
  ability: StructuredAbility,
  protectedCharacterId: CharacterId,
): readonly ProtectiveReactionOperation[] {
  return reaction.operations.flatMap(
    (operation): readonly ProtectiveReactionOperation[] => {
      if (operation.type === "prevent-damage-and-effects") {
        return [{ type: operation.type, characterId: protectedCharacterId }];
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
      return [
        {
          type: operation.type,
          fromCharacterId: reaction.ownerCharacterId,
          towardCharacterId: ability.ownerCharacterId,
        },
      ];
    },
  );
}

function resolveProtectiveReactions(context: {
  readonly state: ActiveMatchState;
  readonly ability: StructuredAbility;
  readonly affectedCharacterIds: readonly CharacterId[];
  readonly selections: readonly ProtectiveReactionInput[];
}): readonly ProtectiveReactionResolution[] {
  const { state, ability, affectedCharacterIds, selections } = context;
  return selections.reduce<{
    readonly seen: ReadonlySet<CharacterId>;
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
      const override = normalizedOverride(selection.override);
      if (warnings.length > 0 && override === null) {
        throw new Error("A state-invalid Reaction needs a recorded Override.");
      }
      return {
        seen: new Set([...accumulated.seen, reaction.ownerCharacterId]),
        results: [
          ...accumulated.results,
          {
            reactionId: reaction.id,
            ownerCharacterId: reaction.ownerCharacterId,
            protectedCharacterId: selection.protectedCharacterId,
            warnings,
            override,
            operations: reactionOperations(
              reaction,
              ability,
              selection.protectedCharacterId,
            ),
          } satisfies ProtectiveReactionResolution,
        ],
      };
    },
    { seen: new Set<CharacterId>(), results: [] },
  ).results;
}

function attackAbilityOutcome(context: AbilityOutcomeContext): AbilityOutcome {
  const { state, ability, affectedCharacterIds, reactions, sequence } = context;
  const protectedIds = new Set<CharacterId>(
    reactions.flatMap(({ operations }) =>
      operations.flatMap((operation) =>
        operation.type === "prevent-damage-and-effects"
          ? [operation.characterId]
          : [],
      ),
    ),
  );
  const vanishProtected = new Set<CharacterId>(
    state.activeEffects
      .filter((effect) => effect.operations.includes("ignore-physical-attack"))
      .map((effect) => effect.affectedCharacterId),
  );
  return affectedCharacterIds.reduce<AbilityOutcome>(
    (accumulated, targetId) => {
      const character = accumulated.characters.find(
        (candidate) => candidate.characterId === targetId,
      );
      if (!character) throw new Error("Ability references unknown character.");
      const resolved = resolveAttackDamageAgainstCharacter({
        baseDamage: 1,
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
}

function utilityAbilityOutcome(
  state: ActiveMatchState,
  ability: StructuredAbility,
  affectedCharacterIds: readonly CharacterId[],
): AbilityOutcome {
  const utility = applyUtilityAbility({
    ability,
    affectedCharacterIds,
    priorCharacters: state.characters,
    characters: [...state.characters],
  });
  return { ...utility, expired: [], applied: [] };
}

function resolveAbilityOutcome(context: AbilityOutcomeContext): AbilityOutcome {
  const { state, ability, affectedCharacterIds } = context;
  const attackInteraction =
    ability.interaction === "targeted-attack" ||
    ability.interaction === "physical-attack";
  return attackInteraction
    ? attackAbilityOutcome(context)
    : utilityAbilityOutcome(state, ability, affectedCharacterIds);
}

function expireInvalidShapeshifts(
  characters: readonly MatchCharacter[],
  activeEffects: readonly ActiveEffect[],
): {
  readonly characters: readonly MatchCharacter[];
  readonly expired: readonly ActiveEffect[];
} {
  return activeEffects
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
      { characters, expired: [] },
    );
}

function finalizeActiveEffects(context: {
  readonly state: ActiveMatchState;
  readonly characters: readonly MatchCharacter[];
  readonly pendingAppliedEffects: readonly ActiveEffect[];
  readonly expiredBeforeCleanup: readonly ActiveEffect[];
}): ActiveEffectLedger {
  const { state, characters, pendingAppliedEffects, expiredBeforeCleanup } =
    context;
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
  return {
    activeEffects: downedCleanup.cleaned,
    expiredEffects: [
      ...new Map(
        [...expiredBeforeCleanup, ...downedCleanup.expired].map((effect) => [
          effect.effectId,
          effect,
        ]),
      ).values(),
    ],
  };
}

function resultingEliminations(
  state: ActiveMatchState,
  characters: readonly MatchCharacter[],
): readonly Team[] {
  const newlyEliminated = (["Drow", "Duergar"] as const).filter((team) =>
    RULESET.characters
      .filter((character) => character.team === team)
      .every(
        (character) =>
          characters.find(({ characterId }) => characterId === character.id)
            ?.hp === 0,
      ),
  );
  return [...new Set([...state.eliminatedTeams, ...newlyEliminated])];
}

function matchOutcome(eliminatedTeams: readonly Team[]): MatchOutcome {
  if (eliminatedTeams.length !== 1) return null;
  return eliminatedTeams[0] === "Drow" ? "Duergar" : "Drow";
}

function initialAbilityAttackLeg(
  ability: StructuredAbility,
  affectedCharacterIds: readonly CharacterId[],
  rangePaces: 2 | 6 | 8,
): AttackLeg {
  return {
    sequence: 1,
    kind: "initial",
    sourceCharacterId: ability.ownerCharacterId,
    attackId: ability.id,
    rangePaces,
    redirectedByReactionId: null,
    towardCharacterId: null,
    affectedCharacterIds: [...affectedCharacterIds],
  };
}

function buildAbilityAttackLegs(context: {
  readonly ability: StructuredAbility;
  readonly attackLegsInput: AbilityInput["attackLegs"];
  readonly affectedCharacterIds: readonly CharacterId[];
  readonly reactions: readonly ProtectiveReactionResolution[];
  readonly rangePaces: 2 | 6 | 8;
  readonly attackInteraction: boolean;
}): readonly AttackLeg[] {
  const {
    ability,
    attackLegsInput,
    affectedCharacterIds,
    reactions,
    rangePaces,
    attackInteraction,
  } = context;
  if (!attackInteraction) {
    return [initialAbilityAttackLeg(ability, affectedCharacterIds, rangePaces)];
  }
  const mapped = (attackLegsInput ?? [{ affectedCharacterIds }]).map<AttackLeg>(
    (leg, index) => ({
      sequence: index + 1,
      kind: index === 0 ? "initial" : "redirected",
      sourceCharacterId: ability.ownerCharacterId,
      attackId: ability.id,
      rangePaces,
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
  );
  return mapped.length === 0
    ? [initialAbilityAttackLeg(ability, affectedCharacterIds, rangePaces)]
    : mapped;
}

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
  const abilityOverride = normalizedOverride(input.abilityOverride);
  const majorActionOverride = normalizedOverride(input.majorActionOverride);
  validateAbilityUse({
    state,
    ability,
    abilityOverride,
    majorActionOverride,
  });
  const affectedCharacterIds = resolveAffectedCharacterIds({
    state,
    ability,
    input,
    abilityOverride,
  });
  const reactions = resolveProtectiveReactions({
    state,
    ability,
    affectedCharacterIds,
    selections: input.reactions ?? [],
  });
  const sequence = state.sequence + 1;
  const initialApplied = buildAbilityEffects(ability, {
    affectedIds: affectedCharacterIds,
    sequence,
    anchorId: ability.ownerCharacterId,
  });
  const attackInteraction =
    ability.interaction === "targeted-attack" ||
    ability.interaction === "physical-attack";
  const abilityOutcome = resolveAbilityOutcome({
    state,
    ability,
    affectedCharacterIds,
    reactions,
    sequence,
  });
  const shapeshiftExpiry = expireInvalidShapeshifts(abilityOutcome.characters, [
    ...state.activeEffects,
    ...initialApplied,
  ]);
  const characters = shapeshiftExpiry.characters;
  const pendingAppliedEffects: readonly ActiveEffect[] = [
    ...initialApplied,
    ...abilityOutcome.applied,
  ];
  const expiredBeforeCleanup: readonly ActiveEffect[] = [
    ...abilityOutcome.expired,
    ...shapeshiftExpiry.expired,
  ];
  const effectLedger = finalizeActiveEffects({
    state,
    characters,
    pendingAppliedEffects,
    expiredBeforeCleanup,
  });
  const eliminatedTeams = resultingEliminations(state, characters);
  const outcome = matchOutcome(eliminatedTeams);
  const cardRangePaces = attackInteraction ? attackRangePaces(ability) : 2;
  const attackLegs = buildAbilityAttackLegs({
    ability,
    attackLegsInput: input.attackLegs,
    affectedCharacterIds,
    reactions,
    rangePaces: cardRangePaces,
    attackInteraction,
  });
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
    physicalConfirmations: {
      range: true,
      lineOfSight: true,
      legalBottleContact: true,
      terrainContact: true,
    },
    reactions,
    effects: abilityOutcome.effects,
    majorActionOverride,
    abilityOverride,
    eliminatedTeams,
    abilityId: ability.id,
    targetCharacterIds: affectedCharacterIds,
    spentAbilityIds: [ability.id],
    appliedEffects: pendingAppliedEffects,
    expiredEffects: effectLedger.expiredEffects,
  };

  return {
    event,
    state: {
      ...state,
      sequence,
      majorActionUsed: true,
      spentAbilityIds: [
        ...new Set([...state.spentAbilityIds, ability.id]),
      ] as readonly AbilityId[],
      spentReactionIds: [
        ...new Set([
          ...state.spentReactionIds,
          ...reactions.map(({ reactionId }) => reactionId),
        ]),
      ] as readonly ReactionId[],
      characters,
      eliminatedTeams,
      outcome,
      activeEffects: effectLedger.activeEffects,
    },
  };
}
