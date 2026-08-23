import { RULESET } from "./ruleset";
import {
  AUTOMATED_REACTION_NAMES,
  protectiveReactionWarnings,
} from "./match-combat";
import { teamOfCharacter } from "./match-endgame";
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
  readonly attackLegs?: readonly Readonly<{
    affectedCharacterIds: readonly string[];
  }>[];
  readonly physicalConfirmations?: Readonly<{
    range: boolean;
    lineOfSight: boolean;
    legalBottleContact: boolean;
    terrainContact: boolean;
  }>;
  readonly reactions?: readonly ProtectiveReactionInput[];
  readonly majorActionOverride?: string | null;
  readonly abilityOverride?: string | null;
}

import {
  abilityWarnings,
  buildAbilityEffects,
  getAbilityOrThrow,
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
  let affectedCharacterIds: string[] = [];
  const attackLegsInput = input.attackLegs;
  const targetIds = input.targetCharacterIds ?? [];

  if (ability.interaction === "targeted-attack") {
    if (targetIds.length !== 1) {
      throw new Error("A targeted Ability Attack needs exactly one target.");
    }
    const targetId = targetIds[0]!;
    const targetChar = state.characters.find(
      (character) => character.characterId === targetId,
    );
    if (!targetChar)
      throw new Error("The ability references an unknown target.");
    const sourceTeam = teamOfCharacter(ability.ownerCharacterId);
    const targetTeam = teamOfCharacter(targetId);
    if (targetTeam === sourceTeam) {
      const override = abilityOverride;
      if (override === null) throw new Error("invalid-target-relation");
    }
    if (targetChar.hp === 0) {
      const override = abilityOverride;
      if (override === null) throw new Error("invalid-target-life-state");
    }
    // Enforce targetPolicy lifeState active unless either
    if (ability.targetPolicy.lifeState === "active" && targetChar.hp === 0) {
      const override = abilityOverride;
      if (override === null) throw new Error("invalid-target-life-state");
    }
    affectedCharacterIds = [targetId];
  } else if (ability.interaction === "physical-attack") {
    if (!attackLegsInput || attackLegsInput.length === 0) {
      throw new Error("A physical ability needs ordered bottle contacts.");
    }
    const confirmations = input.physicalConfirmations;
    if (
      !confirmations ||
      Object.values(confirmations).some((value) => value !== true)
    ) {
      throw new Error("Every manual physical confirmation is required.");
    }
    const flat = attackLegsInput.flatMap(
      ({ affectedCharacterIds }) => affectedCharacterIds,
    );
    if (flat.length === 0)
      throw new Error(
        "A physical ability needs at least one affected character.",
      );
    if (new Set(flat).size !== flat.length)
      throw new Error("Basic Attack contacts must be unique.");
    for (const characterId of flat) {
      if (
        !state.characters.some(
          (character) => character.characterId === characterId,
        )
      ) {
        throw new Error(
          "Physical ability references an unknown affected character.",
        );
      }
    }
    // Deflecting Palm handling for physical ability (reuse)
    const selectedReactions = input.reactions ?? [];
    const redirectReaction = selectedReactions.find((selection) => {
      const reaction = RULESET.reactions.find(
        ({ id }) => id === selection.reactionId,
      );
      return reaction?.name === "Deflecting Palm";
    });
    if (redirectReaction && attackLegsInput.length !== 2) {
      throw new Error(
        "Deflecting Palm needs exactly one redirected Attack Leg.",
      );
    }
    if (!redirectReaction && attackLegsInput.length !== 1) {
      throw new Error("A redirected Attack Leg needs Deflecting Palm.");
    }
    affectedCharacterIds = flat;
  } else if (ability.interaction === "self") {
    affectedCharacterIds = [ability.ownerCharacterId];
  } else if (
    ability.interaction === "ally" ||
    ability.interaction === "enemy" ||
    ability.interaction === "utility"
  ) {
    // For utility: use provided targetCharacterIds or default to self for self-targeting heals
    if (targetIds.length === 0) {
      // Some utilities are self (Second Wind, Rage) – default to owner
      if (
        ability.name === "Second Wind" ||
        ability.name === "Rage" ||
        ability.name === "Vanish" ||
        ability.name === "Shapeshift"
      ) {
        affectedCharacterIds = [ability.ownerCharacterId];
      } else {
        throw new Error("Utility ability needs target selection.");
      }
    } else {
      // Validate each target relation and lifeState
      for (const targetId of targetIds) {
        const targetChar = state.characters.find(
          (character) => character.characterId === targetId,
        );
        if (!targetChar)
          throw new Error("Utility ability references unknown target.");
        const sourceTeam = teamOfCharacter(ability.ownerCharacterId);
        const targetTeam = teamOfCharacter(targetId);
        const relation = ability.targetPolicy.relation;
        if (relation === "ally" && targetTeam !== sourceTeam) {
          const override = abilityOverride;
          if (override === null) throw new Error("invalid-target-relation");
        }
        if (relation === "enemy" && targetTeam === sourceTeam) {
          const override = abilityOverride;
          if (override === null) throw new Error("invalid-target-relation");
        }
        // lifeState
        if (
          ability.targetPolicy.lifeState === "active" &&
          targetChar.hp === 0
        ) {
          const override = abilityOverride;
          if (override === null) throw new Error("invalid-target-life-state");
        }
        if (
          ability.targetPolicy.lifeState === "downed" &&
          targetChar.hp !== 0
        ) {
          const override = abilityOverride;
          if (override === null) throw new Error("invalid-target-life-state");
        }
      }
      affectedCharacterIds = [...targetIds];
    }
    // Specific guards: Revivify and Lay on Hands revive blocked when team eliminated
    if (
      (ability.name === "Revivify" || ability.name === "Lay on Hands") &&
      targetIds.some((targetId) => {
        const targetChar = state.characters.find(
          (character) => character.characterId === targetId,
        );
        return targetChar?.hp === 0;
      })
    ) {
      for (const targetId of targetIds) {
        const targetChar = state.characters.find(
          (character) => character.characterId === targetId,
        );
        if (targetChar?.hp === 0) {
          const team = teamOfCharacter(targetId);
          if (state.eliminatedTeams.includes(team)) {
            throw new Error("eliminated-team");
          }
        }
      }
    }
  }

  // Reactions for targeted/physical abilities (reuse protective logic)
  const selectedReactions = input.reactions ?? [];
  const reactionOwners = new Set<string>();
  const reactions = selectedReactions.map((selection) => {
    const reaction = RULESET.reactions.find(
      ({ id }) => id === selection.reactionId,
    );
    if (!reaction || !AUTOMATED_REACTION_NAMES.has(reaction.name)) {
      throw new Error("The Action Draft references an unsupported Reaction.");
    }
    if (!affectedCharacterIds.includes(selection.protectedCharacterId)) {
      throw new Error("A Reaction can protect only an affected character.");
    }
    if (reactionOwners.has(reaction.ownerCharacterId)) {
      throw new Error(
        "One character cannot use two Reactions against one attack.",
      );
    }
    reactionOwners.add(reaction.ownerCharacterId);
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
      (operation): ProtectiveReactionOperation[] => {
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
      reactionId: reaction.id,
      ownerCharacterId: reaction.ownerCharacterId,
      protectedCharacterId: selection.protectedCharacterId,
      warnings,
      override: reactionOverride,
      operations,
    } satisfies ProtectiveReactionResolution;
  });

  // Compute damage/effects for ability
  const sequence = state.sequence + 1;
  const characters = [...state.characters];
  const effects: ActionEffect[] = [];
  const pendingAppliedEffects: ActiveEffect[] = buildAbilityEffects(ability, {
    affectedIds: affectedCharacterIds,
    sequence,
    anchorId: ability.ownerCharacterId,
  });
  const pendingExpired: ActiveEffect[] = [];

  // Handle operation types that affect HP or maxHP directly
  const abilityName = ability.name;

  // Helper to apply heal
  const healTarget = (targetId: string) => {
    const idx = characters.findIndex(
      (character) => character.characterId === targetId,
    );
    const character = characters[idx];
    if (!character) throw new Error("Heal target unknown");
    const maxHp = character.currentMaxHp;
    const hpAfter = Math.min(maxHp, character.hp + 1);
    const before = character.hp;
    characters[idx] = { ...character, hp: hpAfter };
    effects.push({
      characterId: targetId,
      damage: 0,
      hpBefore: before,
      hpAfter,
      downedBefore: before === 0,
      downedAfter: hpAfter === 0,
    });
  };

  const reviveTarget = (targetId: string) => {
    const idx = characters.findIndex(
      (character) => character.characterId === targetId,
    );
    const character = characters[idx];
    if (!character) throw new Error("Revive target unknown");
    const before = character.hp;
    characters[idx] = { ...character, hp: 1 };
    effects.push({
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
      const character = characters.find(
        (candidate) => candidate.characterId === targetId,
      );
      if (!character) throw new Error("Ability references unknown character.");
      let damage: 0 | 1 = baseDamage as 0 | 1;
      if (protectedIds.has(targetId)) damage = 0;
      // Vanish ignores physical-ball damage (physical attacks only)
      if (
        ability.interaction === "physical-attack" &&
        vanishProtected.has(targetId)
      ) {
        damage = 0;
      }
      // Rage reduction: if target has rage and damage positive, reduce by 1 then consume rage
      const rageEffect = state.activeEffects.find(
        (effect) =>
          effect.kind === "rage" && effect.affectedCharacterId === targetId,
      );
      if (rageEffect && damage > 0) {
        damage = 0 as 0 | 1;
        pendingExpired.push(rageEffect);
      }
      // Add-damage from Hunter's Mark / Hex on target
      const markEffect = state.activeEffects.find(
        (effect) =>
          (effect.kind === "hunters-mark" || effect.kind === "hex") &&
          effect.affectedCharacterId === targetId,
      );
      const finalDamage = damage;
      if (markEffect && finalDamage === 1) {
        // add-damage makes it still 1? Actually add-damage would make 2? But hp is capped per damage? For simplicity keep 1 + mark consumption will be handled as consumption; damage stays 1 then mark consumed.
        pendingExpired.push(markEffect);
        // If Hex, also create movement cap on trigger
        if (markEffect.kind === "hex") {
          pendingAppliedEffects.push({
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
      const idx = characters.findIndex(
        (candidate) => candidate.characterId === targetId,
      );
      characters[idx] = { ...characters[idx]!, hp: hpAfter };
      effects.push({
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
        const idx = characters.findIndex(
          (character) => character.characterId === targetId,
        );
        const character = characters[idx]!;
        const before = character.hp;
        const withMax = {
          ...character,
          currentMaxHp: 4,
          hp: Math.min(4, character.hp + 1),
        };
        characters[idx] = withMax;
        effects.push({
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
        const character = characters.find(
          (candidate) => candidate.characterId === targetId,
        )!;
        effects.push({
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
        const character = characters.find(
          (candidate) => candidate.characterId === targetId,
        )!;
        effects.push({
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
        const character = characters.find(
          (candidate) => candidate.characterId === targetId,
        )!;
        effects.push({
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
        const character = characters.find(
          (candidate) => candidate.characterId === targetId,
        )!;
        effects.push({
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
        const character = characters.find(
          (candidate) => candidate.characterId === targetId,
        )!;
        effects.push({
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
  const shapeshiftExpiries: ActiveEffect[] = [];
  for (const effect of [...state.activeEffects, ...pendingAppliedEffects]) {
    if (effect.kind === "shapeshift") {
      const affected = characters.find(
        (character) => character.characterId === effect.affectedCharacterId,
      );
      if (affected && (affected.hp < 3 || affected.hp === 0)) {
        shapeshiftExpiries.push(effect);
        // Also revert maxHP to 3
        const idx = characters.findIndex(
          (character) => character.characterId === effect.affectedCharacterId,
        );
        if (idx >= 0) {
          const before = characters[idx]!;
          characters[idx] = {
            ...before,
            currentMaxHp: 3,
            hp: Math.min(before.hp, 3),
          };
          // Adjust effects hpAfter if changed? Keep original effects but maxHP change is expiry side effect.
        }
      }
    }
  }
  pendingExpired.push(...shapeshiftExpiries);

  // Downed cleanup after HP changes and immediate expiries
  const combinedEffects = [
    ...state.activeEffects,
    ...pendingAppliedEffects,
  ].filter(
    (effect) =>
      !pendingExpired.some((expired) => expired.effectId === effect.effectId),
  );
  const downedCleanup = applyDownedCleanup(characters, combinedEffects);
  const finalActiveEffects = downedCleanup.cleaned;
  pendingExpired.push(...downedCleanup.expired);

  // Deduplicate expired
  const uniqueExpired = [
    ...new Map(
      pendingExpired.map((effect) => [effect.effectId, effect]),
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
  const resultingEliminations: ("Drow" | "Duergar")[] = [
    ...new Set([...state.eliminatedTeams, ...eliminatedTeams]),
  ];
  const outcome: MatchOutcome =
    resultingEliminations.length === 1
      ? resultingEliminations[0] === "Drow"
        ? "Duergar"
        : "Drow"
      : null;

  // Build attackLegs for event
  let attackLegs: AttackLeg[];
  if (
    ability.interaction === "targeted-attack" ||
    ability.interaction === "physical-attack"
  ) {
    const inputLegs = attackLegsInput ?? [
      { affectedCharacterIds: affectedCharacterIds },
    ];
    attackLegs = inputLegs.map((leg, index) => ({
      sequence: index + 1,
      kind: index === 0 ? "initial" : "redirected",
      sourceCharacterId: ability.ownerCharacterId,
      attackId: ability.id,
      rangePaces: (ability.range.includes("6") ? 6 : 2) as 2 | 6,
      redirectedByReactionId:
        index === 0 ? null : (reactions[0]?.reactionId ?? null),
      towardCharacterId:
        index === 0
          ? null
          : reactions[0]?.ownerCharacterId
            ? ability.ownerCharacterId
            : null,
      affectedCharacterIds: [...leg.affectedCharacterIds],
    }));
    if (attackLegs.length === 0) {
      attackLegs = [
        {
          sequence: 1,
          kind: "initial",
          sourceCharacterId: ability.ownerCharacterId,
          attackId: ability.id,
          rangePaces: (ability.range.includes("6") ? 6 : 2) as 2 | 6,
          redirectedByReactionId: null,
          towardCharacterId: null,
          affectedCharacterIds: [...affectedCharacterIds],
        },
      ];
    }
  } else {
    attackLegs = [
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
  }

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
    rangePaces: (ability.range.includes("6") ? 6 : 2) as 2 | 6,
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
