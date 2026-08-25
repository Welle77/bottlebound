import { RULESET } from "./ruleset";
import type {
  ActionEffect,
  ActionResolvedEvent,
  ActiveMatchState,
  BasicAttackInput,
  CommandResult,
  MatchOutcome,
  MatchState,
  ProtectiveReactionChoice,
  ProtectiveReactionOperation,
  ProtectiveReactionResolution,
} from "./match-types";

export const AUTOMATED_REACTION_NAMES = new Set([
  "Divine Shield",
  "Misty Escape",
  "Mirror Veil",
  "Deflecting Palm",
  "Shield Wall",
]);

export function protectiveReactionWarnings(
  state: ActiveMatchState,
  reactionId: string,
  protectedCharacterId: string,
): readonly string[] {
  const reaction = RULESET.reactions.find(({ id }) => id === reactionId);
  if (!reaction || !AUTOMATED_REACTION_NAMES.has(reaction.name)) {
    throw new Error("The Action Draft references an unsupported Reaction.");
  }
  const owner = state.characters.find(
    ({ characterId }) => characterId === reaction.ownerCharacterId,
  );
  return [
    ...(state.spentReactionIds.includes(reaction.id)
      ? [`${reaction.name} is already spent.`]
      : []),
    ...(!owner || owner.hp === 0
      ? [`${reaction.name}'s owner is Downed.`]
      : []),
    ...((reaction.name === "Misty Escape" || reaction.name === "Mirror Veil") &&
    protectedCharacterId !== reaction.ownerCharacterId
      ? [`${reaction.name} can protect only its owner.`]
      : []),
  ];
}

export function getProtectiveReactionChoices(
  state: ActiveMatchState,
  affectedCharacterIds: readonly string[],
): readonly ProtectiveReactionChoice[] {
  return RULESET.reactions
    .filter(({ name }) => AUTOMATED_REACTION_NAMES.has(name))
    .flatMap((reaction) =>
      affectedCharacterIds
        .filter(
          (characterId) =>
            (reaction.name !== "Misty Escape" &&
              reaction.name !== "Mirror Veil" &&
              reaction.name !== "Deflecting Palm") ||
            characterId === reaction.ownerCharacterId,
        )
        .map((protectedCharacterId) => {
          const warnings = protectiveReactionWarnings(
            state,
            reaction.id,
            protectedCharacterId,
          );
          return {
            reactionId: reaction.id,
            ownerCharacterId: reaction.ownerCharacterId,
            protectedCharacterId,
            eligible: warnings.length === 0,
            warnings,
          };
        }),
    )
    .filter((choice) => {
      const reaction = RULESET.reactions.find(
        ({ id }) => id === choice.reactionId,
      );
      return reaction?.name !== "Deflecting Palm" || choice.eligible;
    });
}

export function resolveBasicAttack(
  state: ActiveMatchState,
  input: BasicAttackInput,
  occurredAt: string,
): CommandResult<ActiveMatchState, ActionResolvedEvent> {
  if ((state as MatchState).phase === "ended") {
    throw new Error("The Ended Match is read-only.");
  }
  if (state.rulesVersion !== RULESET.version) {
    throw new Error("Basic Attack needs the exact bundled Ruleset.");
  }
  const activeCharacterId = state.initiative[state.activeSlot - 1]?.characterId;
  if (input.sourceCharacterId !== activeCharacterId) {
    throw new Error("Basic Attack needs the active character as its source.");
  }
  const activeCharacter = state.characters.find(
    ({ characterId }) => characterId === activeCharacterId,
  );
  if (!activeCharacter || activeCharacter.hp === 0) {
    throw new Error("A Downed character cannot use Basic Attack.");
  }
  const attack = RULESET.basicAttacks.find(
    ({ characterId }) => characterId === input.sourceCharacterId,
  );
  if (!attack) throw new Error("The active character has no Basic Attack.");
  if (input.affectedCharacterIds && input.attackLegs) {
    throw new Error("Basic Attack needs one ordered contact representation.");
  }
  const inputLegs = input.attackLegs ?? [
    { affectedCharacterIds: input.affectedCharacterIds ?? [] },
  ];
  if (
    inputLegs.length === 0 ||
    inputLegs[0]!.affectedCharacterIds.length === 0
  ) {
    throw new Error("Basic Attack needs at least one affected character.");
  }
  const affectedCharacterIds = inputLegs.flatMap(
    ({ affectedCharacterIds }) => affectedCharacterIds,
  );
  if (new Set(affectedCharacterIds).size !== affectedCharacterIds.length) {
    throw new Error("Basic Attack contacts must be unique.");
  }
  if (
    affectedCharacterIds.some(
      (characterId) =>
        !state.characters.some(
          (character) => character.characterId === characterId,
        ),
    )
  ) {
    throw new Error("Basic Attack references an unknown affected character.");
  }
  if (
    Object.values(input.physicalConfirmations).some((value) => value !== true)
  ) {
    throw new Error("Every manual physical confirmation is required.");
  }
  const override = input.majorActionOverride?.trim() || null;
  if (state.majorActionUsed && override === null) {
    throw new Error("A second Basic Attack needs a recorded referee override.");
  }
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
                towardCharacterId: input.sourceCharacterId,
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
  const redirectReaction = reactions.find(({ operations }) =>
    operations.some(({ type }) => type === "redirect-physical-attack"),
  );
  if (redirectReaction && inputLegs.length !== 2) {
    throw new Error("Deflecting Palm needs exactly one redirected Attack Leg.");
  }
  if (!redirectReaction && inputLegs.length !== 1) {
    throw new Error("A redirected Attack Leg needs Deflecting Palm.");
  }
  if (
    redirectReaction &&
    !inputLegs[0]!.affectedCharacterIds.includes(
      redirectReaction.ownerCharacterId,
    )
  ) {
    throw new Error(
      "Deflecting Palm needs the Monk in the initial Attack Leg.",
    );
  }
  const protectedCharacterIds = new Set(
    reactions.flatMap(({ operations }) =>
      operations.flatMap((operation) =>
        operation.type === "prevent-damage-and-effects"
          ? [operation.characterId]
          : [],
      ),
    ),
  );
  const effects = affectedCharacterIds.map((characterId) => {
    const character = state.characters.find(
      (candidate) => candidate.characterId === characterId,
    );
    if (!character)
      throw new Error("Basic Attack references an unknown character.");
    const damage = protectedCharacterIds.has(characterId) ? 0 : attack.damage;
    const hpAfter = Math.max(0, character.hp - damage);
    return {
      characterId,
      damage,
      hpBefore: character.hp,
      hpAfter,
      downedBefore: character.hp === 0,
      downedAfter: hpAfter === 0,
    } satisfies ActionEffect;
  });
  const characters = state.characters.map((character) => {
    const effect = effects.find(
      ({ characterId }) => characterId === character.characterId,
    );
    return effect ? { ...character, hp: effect.hpAfter } : character;
  });
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
  const sequence = state.sequence + 1;
  const event: ActionResolvedEvent = {
    type: "ActionResolved",
    matchId: state.matchId,
    sequence,
    rulesVersion: state.rulesVersion,
    occurredAt,
    actionType: "Basic Attack",
    sourceCharacterId: input.sourceCharacterId,
    attackId: attack.id,
    attackType: attack.attackType,
    rangePaces: attack.rangePaces,
    damage: attack.damage,
    rulesSourceAnchor: attack.sourceAnchor,
    attackLegs: inputLegs.map((leg, index) => ({
      sequence: index + 1,
      kind: index === 0 ? "initial" : "redirected",
      sourceCharacterId: input.sourceCharacterId,
      attackId: attack.id,
      rangePaces: attack.rangePaces,
      redirectedByReactionId:
        index === 0 ? null : (redirectReaction?.reactionId ?? null),
      towardCharacterId:
        index === 0
          ? null
          : redirectReaction?.ownerCharacterId
            ? input.sourceCharacterId
            : null,
      affectedCharacterIds: [...leg.affectedCharacterIds],
    })),
    physicalConfirmations: {
      range: true,
      lineOfSight: true,
      legalBottleContact: true,
      terrainContact: true,
    },
    reactions,
    effects,
    majorActionOverride: override,
    eliminatedTeams: resultingEliminations,
  };
  return {
    event,
    state: {
      ...state,
      sequence,
      majorActionUsed: true,
      spentReactionIds: [
        ...new Set([
          ...state.spentReactionIds,
          ...reactions.map(({ reactionId }) => reactionId),
        ]),
      ],
      characters,
      eliminatedTeams: resultingEliminations,
      outcome,
    },
  };
}
