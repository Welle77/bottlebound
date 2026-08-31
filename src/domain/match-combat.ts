import {
  MATCH_CONFIGURATION,
  MATCH_CONFIGURATION_VERSION,
  type AbilityName,
} from "./match-configuration";
import { resolveAttackDamageAgainstCharacter } from "./match-ability-effects";
import { applyDownedCleanup } from "./match-turn";
import type {
  ActionEffect,
  ActionResolvedEvent,
  ActiveEffect,
  ActiveMatchState,
  BasicAttackInput,
  CharacterId,
  CommandResult,
  MatchCharacter,
  MatchOutcome,
  MatchState,
  ProtectiveReactionChoice,
  ProtectiveReactionInput,
  ProtectiveReactionOperation,
  ProtectiveReactionResolution,
  ReactionId,
  Team,
} from "./match-types";

type BasicAttack = (typeof MATCH_CONFIGURATION.basicAttacks)[number];
type BasicAttackLegInput = NonNullable<BasicAttackInput["attackLegs"]>[number];
type ProtectiveReaction = (typeof MATCH_CONFIGURATION.reactions)[number];

type ValidatedBasicAttack = {
  readonly attack: BasicAttack;
  readonly inputLegs: readonly BasicAttackLegInput[];
  readonly affectedCharacterIds: readonly CharacterId[];
  readonly override: string | null;
};

type ResolvedAttackEffect = {
  readonly effect: ActionEffect;
  readonly expired: readonly ActiveEffect[];
  readonly applied: readonly ActiveEffect[];
};

type BasicAttackOutcome = {
  readonly actionEffects: readonly ActionEffect[];
  readonly appliedEffects: readonly ActiveEffect[];
  readonly expiredEffects: readonly ActiveEffect[];
  readonly characters: readonly MatchCharacter[];
  readonly activeEffects: readonly ActiveEffect[];
};

export const AUTOMATED_REACTION_NAMES: ReadonlySet<AbilityName> = new Set([
  "Divine Shield",
  "Misty Escape",
  "Mirror Veil",
  "Deflecting Palm",
  "Shield Wall",
]);

export function protectiveReactionWarnings(
  state: ActiveMatchState,
  reactionId: ReactionId,
  protectedCharacterId: CharacterId,
): readonly string[] {
  const reaction = MATCH_CONFIGURATION.reactions.find(
    ({ id }) => id === reactionId,
  );
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
  affectedCharacterIds: readonly CharacterId[],
): readonly ProtectiveReactionChoice[] {
  return MATCH_CONFIGURATION.reactions
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
      const reaction = MATCH_CONFIGURATION.reactions.find(
        ({ id }) => id === choice.reactionId,
      );
      return reaction?.name !== "Deflecting Palm" || choice.eligible;
    });
}

function resolveAttackContacts(
  state: ActiveMatchState,
  input: BasicAttackInput,
): {
  readonly inputLegs: readonly BasicAttackLegInput[];
  readonly affectedCharacterIds: readonly CharacterId[];
} {
  if (input.affectedCharacterIds && input.attackLegs) {
    throw new Error("Basic Attack needs one ordered contact representation.");
  }
  const inputLegs = input.attackLegs ?? [
    { affectedCharacterIds: input.affectedCharacterIds ?? [] },
  ];
  const [firstLeg] = inputLegs;
  if (!firstLeg || firstLeg.affectedCharacterIds.length === 0) {
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
  return { inputLegs, affectedCharacterIds };
}

function validateBasicAttack(
  state: ActiveMatchState,
  input: BasicAttackInput,
): ValidatedBasicAttack {
  if ((state as MatchState).phase === "ended") {
    throw new Error("The Ended Match is read-only.");
  }
  if (state.configurationVersion !== MATCH_CONFIGURATION_VERSION) {
    throw new Error(
      "Basic Attack needs the exact bundled Match Configuration.",
    );
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
  const attack = MATCH_CONFIGURATION.basicAttacks.find(
    ({ characterId }) => characterId === input.sourceCharacterId,
  );
  if (!attack) throw new Error("The active character has no Basic Attack.");
  const { inputLegs, affectedCharacterIds } = resolveAttackContacts(
    state,
    input,
  );
  if (Object.values(input.physicalConfirmations).some((value) => !value)) {
    throw new Error("Every manual physical confirmation is required.");
  }
  const override = input.majorActionOverride?.trim() || null;
  if (
    (state.actionsUsed ?? (state.majorActionUsed ? 1 : 0)) >= 2 &&
    override === null
  ) {
    throw new Error(
      "Basic Attack needs an unused action or a recorded referee override.",
    );
  }
  return { attack, inputLegs, affectedCharacterIds, override };
}

function resolveReactionOperations(context: {
  readonly reaction: ProtectiveReaction;
  readonly selection: ProtectiveReactionInput;
  readonly sourceCharacterId: CharacterId;
}): readonly ProtectiveReactionOperation[] {
  const { reaction, selection, sourceCharacterId } = context;
  return reaction.operations.flatMap(
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
      return [
        {
          type: operation.type,
          fromCharacterId: reaction.ownerCharacterId,
          towardCharacterId: sourceCharacterId,
        },
      ];
    },
  );
}

function resolveProtectiveReactions(context: {
  readonly state: ActiveMatchState;
  readonly sourceCharacterId: CharacterId;
  readonly affectedCharacterIds: readonly CharacterId[];
  readonly selections: readonly ProtectiveReactionInput[];
}): readonly ProtectiveReactionResolution[] {
  const { state, sourceCharacterId, affectedCharacterIds, selections } =
    context;
  return selections.reduce<{
    readonly seen: ReadonlySet<CharacterId>;
    readonly results: readonly ProtectiveReactionResolution[];
  }>(
    (accumulated, selection) => {
      const reaction = MATCH_CONFIGURATION.reactions.find(
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
            operations: resolveReactionOperations({
              reaction,
              selection,
              sourceCharacterId,
            }),
          } satisfies ProtectiveReactionResolution,
        ],
      };
    },
    { seen: new Set<CharacterId>(), results: [] },
  ).results;
}

function redirectReactionForAttack(
  inputLegs: readonly BasicAttackLegInput[],
  reactions: readonly ProtectiveReactionResolution[],
): ProtectiveReactionResolution | undefined {
  const [firstLeg] = inputLegs;
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
    !firstLeg?.affectedCharacterIds.includes(redirectReaction.ownerCharacterId)
  ) {
    throw new Error(
      "Deflecting Palm needs the Monk in the initial Attack Leg.",
    );
  }
  return redirectReaction;
}

function protectedCharacterIds(
  reactions: readonly ProtectiveReactionResolution[],
): ReadonlySet<CharacterId> {
  return new Set<CharacterId>(
    reactions.flatMap(({ operations }) =>
      operations.flatMap((operation) =>
        operation.type === "prevent-damage-and-effects"
          ? [operation.characterId]
          : [],
      ),
    ),
  );
}

function resolveAttackEffects(context: {
  readonly state: ActiveMatchState;
  readonly attack: BasicAttack;
  readonly affectedCharacterIds: readonly CharacterId[];
  readonly protectedCharacterIds: ReadonlySet<CharacterId>;
  readonly sequence: number;
}): readonly ResolvedAttackEffect[] {
  const {
    state,
    attack,
    affectedCharacterIds,
    protectedCharacterIds: protectedIds,
    sequence,
  } = context;
  return affectedCharacterIds.map((characterId) => {
    const character = state.characters.find(
      (candidate) => candidate.characterId === characterId,
    );
    if (!character)
      throw new Error("Basic Attack references an unknown character.");
    // A Basic Attack is a damaging attack and a physically thrown ball, so
    // character-based damage effects (Hunter's Mark, Hex), Rage's reduction,
    // and Vanish's physical immunity all apply to it exactly as they do to
    // ability attacks (rules §8, §10(4), §11, §15 cards).
    const resolved = resolveAttackDamageAgainstCharacter({
      baseDamage: attack.damage,
      affectedCharacterId: characterId,
      physicalAttack: true,
      prevented: protectedIds.has(characterId),
      activeEffects: state.activeEffects,
      sequence,
    });
    const hpAfter = Math.max(0, character.hp - resolved.finalDamage);
    return {
      effect: {
        characterId,
        damage: resolved.finalDamage,
        hpBefore: character.hp,
        hpAfter,
        downedBefore: character.hp === 0,
        downedAfter: hpAfter === 0,
      } satisfies ActionEffect,
      expired: resolved.expired,
      applied: resolved.applied,
    };
  });
}

function applyResolvedDamage(
  characters: readonly MatchCharacter[],
  effects: readonly ResolvedAttackEffect[],
): readonly MatchCharacter[] {
  return characters.map((character) => {
    const resolved = effects.find(
      ({ effect }) => effect.characterId === character.characterId,
    );
    return resolved ? { ...character, hp: resolved.effect.hpAfter } : character;
  });
}

function expireShapeshiftsAfterDamage(
  characters: readonly MatchCharacter[],
  effects: readonly ActiveEffect[],
  alreadyExpiredIds: ReadonlySet<string>,
): {
  readonly characters: readonly MatchCharacter[];
  readonly expired: readonly ActiveEffect[];
} {
  return effects.reduce<{
    readonly characters: readonly MatchCharacter[];
    readonly expired: readonly ActiveEffect[];
  }>(
    (accumulated, effect) => {
      if (
        alreadyExpiredIds.has(effect.effectId) ||
        accumulated.expired.some(({ effectId }) => effectId === effect.effectId)
      ) {
        return accumulated;
      }
      if (effect.kind !== "shapeshift") return accumulated;
      const bearer = accumulated.characters.find(
        ({ characterId }) => characterId === effect.affectedCharacterId,
      );
      if (!bearer || bearer.hp >= 3) return accumulated;
      return {
        characters: accumulated.characters.map((character) =>
          character.characterId === effect.affectedCharacterId
            ? { ...character, currentMaxHp: 3, hp: Math.min(character.hp, 3) }
            : character,
        ),
        expired: [...accumulated.expired, effect],
      };
    },
    { characters, expired: [] },
  );
}

function resolveBasicAttackOutcome(context: {
  readonly state: ActiveMatchState;
  readonly attack: BasicAttack;
  readonly affectedCharacterIds: readonly CharacterId[];
  readonly protectedCharacterIds: ReadonlySet<CharacterId>;
  readonly sequence: number;
}): BasicAttackOutcome {
  const { state } = context;
  const resolvedEffects = resolveAttackEffects(context);
  const appliedEffects = resolvedEffects.flatMap(({ applied }) => applied);
  const initiallyExpired = resolvedEffects.flatMap(({ expired }) => expired);
  const actionEffects = resolvedEffects.map(({ effect }) => effect);
  const damagedCharacters = applyResolvedDamage(
    state.characters,
    resolvedEffects,
  );
  const initiallyExpiredIds = new Set(
    initiallyExpired.map(({ effectId }) => effectId),
  );
  const shapeshiftExpiry = expireShapeshiftsAfterDamage(
    damagedCharacters,
    [...state.activeEffects, ...appliedEffects],
    initiallyExpiredIds,
  );
  const shapeshiftExpiredIds = new Set(
    shapeshiftExpiry.expired.map(({ effectId }) => effectId),
  );
  const survivingEffects = [
    ...state.activeEffects.filter(
      ({ effectId }) => !initiallyExpiredIds.has(effectId),
    ),
    ...appliedEffects,
  ].filter(({ effectId }) => !shapeshiftExpiredIds.has(effectId));
  const downedCleanup = applyDownedCleanup(
    shapeshiftExpiry.characters,
    survivingEffects,
  );
  return {
    actionEffects,
    appliedEffects,
    characters: shapeshiftExpiry.characters,
    activeEffects: downedCleanup.cleaned,
    expiredEffects: [
      ...new Map(
        [
          ...initiallyExpired,
          ...shapeshiftExpiry.expired,
          ...downedCleanup.expired,
        ].map((effect) => [effect.effectId, effect]),
      ).values(),
    ],
  };
}

function resultingEliminations(
  state: ActiveMatchState,
  characters: readonly MatchCharacter[],
): readonly Team[] {
  const newlyEliminated = (["Drow", "Duergar"] as const).filter((team) =>
    MATCH_CONFIGURATION.characters
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

function buildAttackLegs(context: {
  readonly inputLegs: readonly BasicAttackLegInput[];
  readonly sourceCharacterId: CharacterId;
  readonly attack: BasicAttack;
  readonly redirectReaction: ProtectiveReactionResolution | undefined;
}): ActionResolvedEvent["attackLegs"] {
  const { inputLegs, sourceCharacterId, attack, redirectReaction } = context;
  return inputLegs.map((leg, index) => ({
    sequence: index + 1,
    kind: index === 0 ? "initial" : "redirected",
    sourceCharacterId,
    attackId: attack.id,
    rangePaces: attack.rangePaces,
    redirectedByReactionId:
      index === 0 ? null : (redirectReaction?.reactionId ?? null),
    towardCharacterId:
      index === 0
        ? null
        : redirectReaction?.ownerCharacterId
          ? sourceCharacterId
          : null,
    affectedCharacterIds: [...leg.affectedCharacterIds],
  }));
}

export function resolveBasicAttack(
  state: ActiveMatchState,
  input: BasicAttackInput,
  occurredAt: string,
): CommandResult<ActiveMatchState, ActionResolvedEvent> {
  const { attack, inputLegs, affectedCharacterIds, override } =
    validateBasicAttack(state, input);
  const reactions = resolveProtectiveReactions({
    state,
    sourceCharacterId: input.sourceCharacterId,
    affectedCharacterIds,
    selections: input.reactions ?? [],
  });
  const redirectReaction = redirectReactionForAttack(inputLegs, reactions);
  const protectedIds = protectedCharacterIds(reactions);
  const sequence = state.sequence + 1;
  const attackOutcome = resolveBasicAttackOutcome({
    state,
    attack,
    affectedCharacterIds,
    protectedCharacterIds: protectedIds,
    sequence,
  });
  const eliminatedTeams = resultingEliminations(
    state,
    attackOutcome.characters,
  );
  const outcome = matchOutcome(eliminatedTeams);
  const event: ActionResolvedEvent = {
    type: "ActionResolved",
    matchId: state.matchId,
    sequence,
    configurationVersion: state.configurationVersion,
    occurredAt,
    actionType: "Basic Attack",
    sourceCharacterId: input.sourceCharacterId,
    attackId: attack.id,
    attackType: attack.attackType,
    rangePaces: attack.rangePaces,
    damage: attack.damage,
    attackLegs: buildAttackLegs({
      inputLegs,
      sourceCharacterId: input.sourceCharacterId,
      attack,
      redirectReaction,
    }),
    physicalConfirmations: {
      range: true,
      lineOfSight: true,
      legalBottleContact: true,
      terrainContact: true,
    },
    reactions,
    effects: attackOutcome.actionEffects,
    majorActionOverride: override,
    // Basic Attacks never involve an Ability choice, so no Override applies.
    abilityOverride: null,
    eliminatedTeams,
    ...(attackOutcome.appliedEffects.length > 0
      ? { appliedEffects: attackOutcome.appliedEffects }
      : {}),
    expiredEffects: attackOutcome.expiredEffects,
  };
  return {
    event,
    state: {
      ...state,
      sequence,
      actionsUsed: Math.min(
        2,
        (state.actionsUsed ?? (state.majorActionUsed ? 1 : 0)) + 1,
      ) as 1 | 2,
      majorActionUsed: true,
      spentReactionIds: [
        ...new Set([
          ...state.spentReactionIds,
          ...reactions.map(({ reactionId }) => reactionId),
        ]),
      ] as readonly ReactionId[],
      characters: attackOutcome.characters,
      activeEffects: attackOutcome.activeEffects,
      eliminatedTeams,
      outcome,
    },
  };
}
