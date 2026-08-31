import {
  MATCH_SCHEMA_VERSION,
  isCharacterId,
  isMatchEventType,
  isTeam,
  type CharacterId,
  type InitiativeEntry,
  type MatchEvent,
} from "../domain/match";
import { MATCH_CONFIGURATION } from "../domain/match-configuration";
import {
  assertActionResolutionEffectCollections,
  assertActionResolutionMetadata,
  assertExpiredEffectCollection,
} from "./match-store-canonical-action";
import { assertMatchEndedEvent } from "./match-store-canonical-ended-event";
import {
  assertCoinFlipTieOrder,
  assertCanonicalState,
  isRecord,
} from "./match-store-canonical-state";

/**
 * Highest finalized per-character attack damage: a base or ability attack
 * contributes its written 1 damage and both
 * stacking character effects (Hunter's Mark, Hex) add +1 each, for a maximum of 3.
 */
const MAX_STACKED_ATTACK_DAMAGE = 3;
const invalidActionResolution = () =>
  new Error("The canonical Action Resolution Event is invalid.");
function assertEventBase(
  value: Record<string, unknown>,
  expectedConfigurationVersion?: string,
): void {
  if (
    typeof value.matchId !== "string" ||
    !Number.isSafeInteger(value.sequence) ||
    (value.sequence as number) < 1 ||
    typeof value.configurationVersion !== "string" ||
    value.configurationVersion.length === 0 ||
    (expectedConfigurationVersion !== undefined &&
      value.configurationVersion !== expectedConfigurationVersion) ||
    typeof value.occurredAt !== "string" ||
    value.occurredAt.length === 0
  ) {
    throw new Error("The canonical Match Event is structurally invalid.");
  }
  if (
    expectedConfigurationVersion === undefined &&
    value.configurationVersion !== MATCH_CONFIGURATION.version
  ) {
    throw new Error(
      "The canonical Match Event configuration version is incompatible.",
    );
  }
}
function assertSetupEvent(value: Record<string, unknown>): void {
  if (value.sequence !== 1) {
    throw new Error("The canonical Setup Event is structurally invalid.");
  }
}
function assertDisplayNamesEvent(value: Record<string, unknown>): void {
  const names = value.displayNames;
  if (
    !isRecord(names) ||
    !Object.keys(names).every(
      (characterId) =>
        typeof characterId === "string" &&
        isCharacterId(characterId) &&
        typeof names[characterId] === "string" &&
        names[characterId].length > 0 &&
        names[characterId].trim() === names[characterId] &&
        MATCH_CONFIGURATION.characters.some(({ id }) => id === characterId),
    )
  ) {
    throw new Error("The canonical Display Name assignment is invalid.");
  }
}
function assertMatchStartedEvent(value: Record<string, unknown>): void {
  if (value.round !== 1 || value.activeSlot !== 1) {
    throw new Error("The canonical Start Match Event is invalid.");
  }
}
function assertTurnFields(value: Record<string, unknown>): void {
  const values = [
    value.fromRound,
    value.fromSlot,
    value.round,
    value.activeSlot,
  ];
  if (
    values.some((entry) => !Number.isSafeInteger(entry)) ||
    (value.fromRound as number) < 1 ||
    (value.round as number) < 1 ||
    (value.fromSlot as number) < 1 ||
    (value.fromSlot as number) > MATCH_CONFIGURATION.characters.length ||
    (value.activeSlot as number) < 1 ||
    (value.activeSlot as number) > MATCH_CONFIGURATION.characters.length ||
    !Array.isArray(value.skippedSlots) ||
    !value.skippedSlots.every(
      (slot) =>
        Number.isSafeInteger(slot) &&
        (slot as number) >= 1 &&
        (slot as number) <= MATCH_CONFIGURATION.characters.length,
    )
  ) {
    throw new Error("The canonical Finish Turn Event is invalid.");
  }
}
function expectedVisitedTurnSlots(
  value: Record<string, unknown>,
): readonly number[] {
  return Array.from(
    { length: MATCH_CONFIGURATION.characters.length + 4 },
    (_, step) => step,
  ).reduce<{
    readonly slot: number;
    readonly round: number;
    readonly visited: readonly number[];
    readonly done: boolean;
  }>(
    (position) => {
      if (position.done) return position;
      const wraps = position.slot === MATCH_CONFIGURATION.characters.length;
      const slot = wraps ? 1 : position.slot + 1;
      const round = wraps ? position.round + 1 : position.round;
      const nextVisited =
        slot !== value.activeSlot || round !== value.round
          ? [...position.visited, slot]
          : position.visited;
      if (nextVisited.length > MATCH_CONFIGURATION.characters.length) {
        return { slot, round, visited: nextVisited, done: true };
      }
      return {
        slot,
        round,
        visited: nextVisited,
        done: slot === value.activeSlot && round === value.round,
      };
    },
    {
      slot: value.fromSlot as number,
      round: value.fromRound as number,
      visited: [],
      done: false,
    },
  ).visited;
}
function assertTurnSkippedSlots(
  value: Record<string, unknown>,
  visited: readonly number[],
): void {
  if (
    visited.length > MATCH_CONFIGURATION.characters.length ||
    !Array.isArray(value.skippedSlots) ||
    value.skippedSlots.length !== visited.length ||
    !value.skippedSlots.every((skipped, index) => skipped === visited[index])
  ) {
    throw new Error("The canonical Finish Turn Event is invalid.");
  }
}
function assertTurnFinishedEvent(value: Record<string, unknown>): void {
  assertTurnFields(value);
  assertTurnSkippedSlots(value, expectedVisitedTurnSlots(value));
  assertExpiredEffectCollection(value.expiredEffects);
}

function assertDashedEvent(value: Record<string, unknown>): void {
  if (
    typeof value.sourceCharacterId !== "string" ||
    !isCharacterId(value.sourceCharacterId) ||
    value.movementPaces !== 2 ||
    value.remainingMovementPaces !== 0
  ) {
    throw new Error("The canonical Dash Event is invalid.");
  }
}

function assertActionResolutionCollections(
  value: Record<string, unknown>,
): void {
  if (
    !Array.isArray(value.attackLegs) ||
    value.attackLegs.length === 0 ||
    value.attackLegs.length > 2 ||
    !isRecord(value.physicalConfirmations) ||
    value.physicalConfirmations.range !== true ||
    value.physicalConfirmations.lineOfSight !== true ||
    value.physicalConfirmations.legalBottleContact !== true ||
    value.physicalConfirmations.terrainContact !== true ||
    !Array.isArray(value.reactions) ||
    !Array.isArray(value.effects) ||
    !Array.isArray(value.eliminatedTeams)
  ) {
    throw invalidActionResolution();
  }
}
function assertActionResolutionTeamsAndOverrides(
  value: Record<string, unknown>,
): void {
  if (
    !Array.isArray(value.eliminatedTeams) ||
    !value.eliminatedTeams.every(
      (team) => typeof team === "string" && isTeam(team),
    ) ||
    new Set(value.eliminatedTeams).size !== value.eliminatedTeams.length ||
    (value.majorActionOverride !== null &&
      (typeof value.majorActionOverride !== "string" ||
        value.majorActionOverride.trim().length === 0)) ||
    (value.abilityOverride !== null &&
      (typeof value.abilityOverride !== "string" ||
        value.abilityOverride.trim().length === 0))
  ) {
    throw invalidActionResolution();
  }
}
function assertAttackLegIdentity(
  value: Record<string, unknown>,
  leg: Record<string, unknown>,
  index: number,
): void {
  if (
    leg.sequence !== index + 1 ||
    leg.kind !== (index === 0 ? "initial" : "redirected") ||
    leg.sourceCharacterId !== value.sourceCharacterId ||
    leg.attackId !== value.attackId ||
    leg.rangePaces !== value.rangePaces
  ) {
    throw new Error("The canonical Attack Leg is invalid.");
  }
}
function assertAttackLegRedirection(
  leg: Record<string, unknown>,
  index: number,
): void {
  if (
    (index === 0 && leg.redirectedByReactionId !== null) ||
    (index === 1 &&
      (typeof leg.redirectedByReactionId !== "string" ||
        leg.redirectedByReactionId.length === 0 ||
        leg.redirectedByReactionId !== "duergar-monk-deflecting-palm"))
  ) {
    throw new Error("The canonical Attack Leg is invalid.");
  }
}
function assertAttackLegTargets(
  value: Record<string, unknown>,
  leg: Record<string, unknown>,
  index: number,
): readonly CharacterId[] {
  const affectedCharacterIds = characterIdsFrom(leg.affectedCharacterIds);
  if (
    leg.towardCharacterId !== (index === 0 ? null : value.sourceCharacterId) ||
    affectedCharacterIds === null ||
    (index === 0 && affectedCharacterIds.length === 0)
  ) {
    throw new Error("The canonical Attack Leg is invalid.");
  }
  return affectedCharacterIds;
}

function characterIdsFrom(value: unknown): readonly CharacterId[] | null {
  if (!Array.isArray(value)) return null;
  return value.reduce<readonly CharacterId[] | null>((ids, characterId) => {
    if (
      ids === null ||
      typeof characterId !== "string" ||
      !isCharacterId(characterId) ||
      !MATCH_CONFIGURATION.characters.some(({ id }) => id === characterId)
    ) {
      return null;
    }
    return [...ids, characterId];
  }, []);
}

function affectedIdsForLeg(
  value: Record<string, unknown>,
  context: {
    readonly leg: unknown;
    readonly index: number;
  },
): readonly CharacterId[] {
  const { leg, index } = context;
  if (!isRecord(leg)) {
    throw new Error("The canonical Attack Leg is invalid.");
  }
  assertAttackLegIdentity(value, leg, index);
  assertAttackLegRedirection(leg, index);
  return assertAttackLegTargets(value, leg, index);
}
function assertActionResolutionContacts(
  value: Record<string, unknown>,
): readonly CharacterId[] {
  const affectedCharacterIds = (value.attackLegs as readonly unknown[]).flatMap(
    (leg, index) => affectedIdsForLeg(value, { leg, index }),
  );
  if (
    new Set(affectedCharacterIds).size !== affectedCharacterIds.length ||
    (value.effects as readonly unknown[]).length !== affectedCharacterIds.length
  ) {
    throw new Error("The canonical Action Resolution contacts are invalid.");
  }
  return affectedCharacterIds;
}
function assertReactionIdentity(
  reactionResolution: Record<string, unknown>,
  context: {
    readonly reaction: { readonly ownerCharacterId: string } | undefined;
    readonly owner: unknown;
  },
): void {
  const { reaction, owner } = context;
  if (
    !reaction ||
    typeof owner !== "string" ||
    owner.length === 0 ||
    reactionResolution.ownerCharacterId !== owner
  ) {
    throw new Error("The canonical Action Resolution Reaction is invalid.");
  }
}
function assertReactionProtection(
  reactionResolution: Record<string, unknown>,
  affectedCharacterIds: readonly CharacterId[],
): void {
  const protectedCharacterId = reactionResolution.protectedCharacterId;
  if (
    typeof protectedCharacterId !== "string" ||
    !isCharacterId(protectedCharacterId) ||
    !affectedCharacterIds.includes(protectedCharacterId)
  ) {
    throw new Error("The canonical Action Resolution Reaction is invalid.");
  }
}
function isValidReactionOperation(
  operation: unknown,
  context: {
    readonly owner: string;
    readonly sourceCharacterId: unknown;
    readonly reaction: { readonly name: string } | undefined;
  },
): boolean {
  const { owner, sourceCharacterId, reaction } = context;
  if (!isRecord(operation)) return false;
  if (operation.type === "prevent-damage-and-effects") return true;
  if (operation.type === "manual-movement") {
    return (
      operation.characterId === owner &&
      typeof operation.instruction === "string" &&
      operation.instruction.length > 0 &&
      operation.maxPaces === 2
    );
  }
  if (operation.type === "redirect-physical-attack") {
    return (
      operation.fromCharacterId === owner &&
      operation.towardCharacterId === sourceCharacterId &&
      reaction?.name === "Deflecting Palm"
    );
  }
  return false;
}
function assertReactionOperations(
  reactionResolution: Record<string, unknown>,
  context: {
    readonly owner: string;
    readonly value: Readonly<Record<string, unknown>>;
    readonly reaction: { readonly name: string } | undefined;
  },
): void {
  const { owner, value, reaction } = context;
  if (
    (reactionResolution.override !== null &&
      (typeof reactionResolution.override !== "string" ||
        reactionResolution.override.trim().length === 0)) ||
    !Array.isArray(reactionResolution.operations) ||
    !reactionResolution.operations.every((operation) =>
      isValidReactionOperation(operation, {
        owner,
        sourceCharacterId: value.sourceCharacterId,
        reaction,
      }),
    )
  ) {
    throw new Error("The canonical Action Resolution Reaction is invalid.");
  }
}
function assertReactionResolution(
  rawResolution: unknown,
  context: {
    readonly value: Readonly<Record<string, unknown>>;
    readonly affectedCharacterIds: readonly CharacterId[];
    readonly seenOwners: ReadonlySet<string>;
  },
): string {
  const { value, affectedCharacterIds, seenOwners } = context;
  if (!isRecord(rawResolution)) {
    throw new Error("The canonical Action Resolution Reaction is invalid.");
  }
  const reactionResolution = rawResolution;
  const reaction = MATCH_CONFIGURATION.reactions.find(
    ({ id }) => id === reactionResolution.reactionId,
  );
  const owner = reaction?.ownerCharacterId;
  assertReactionIdentity(reactionResolution, {
    reaction,
    owner,
  });
  assertReactionProtection(reactionResolution, affectedCharacterIds);
  if (seenOwners.has(owner as string)) {
    throw new Error("The canonical Action Resolution Reaction is invalid.");
  }
  if (
    !Array.isArray(reactionResolution.warnings) ||
    !reactionResolution.warnings.every(
      (warning) => typeof warning === "string" && warning.length > 0,
    )
  ) {
    throw new Error("The canonical Action Resolution Reaction is invalid.");
  }
  assertReactionOperations(reactionResolution, {
    owner: owner as string,
    value,
    reaction,
  });
  return owner as string;
}
function assertActionResolutionReactions(
  value: Record<string, unknown>,
  affectedCharacterIds: readonly CharacterId[],
): void {
  const reactionList = value.reactions as readonly unknown[];
  reactionList.reduce<ReadonlySet<string>>((seenOwners, rawResolution) => {
    const owner = assertReactionResolution(rawResolution, {
      value,
      affectedCharacterIds,
      seenOwners,
    });
    return new Set([...seenOwners, owner]);
  }, new Set<string>());
}
function hasRedirectOperation(rawResolution: unknown): boolean {
  if (!isRecord(rawResolution)) return false;
  return (
    typeof rawResolution.ownerCharacterId === "string" &&
    Array.isArray(rawResolution.operations) &&
    rawResolution.operations.some(
      (operation) =>
        isRecord(operation) && operation.type === "redirect-physical-attack",
    )
  );
}
function assertActionResolutionRedirect(value: Record<string, unknown>): void {
  const redirectOwner = (value.reactions as readonly unknown[]).find(
    hasRedirectOperation,
  );
  const redirectOwnerId: string | null =
    isRecord(redirectOwner) &&
    typeof redirectOwner.ownerCharacterId === "string"
      ? redirectOwner.ownerCharacterId
      : null;
  const firstLeg: unknown = (value.attackLegs as readonly unknown[])[0];
  const initialAffectedCharacterIds =
    isRecord(firstLeg) && Array.isArray(firstLeg.affectedCharacterIds)
      ? (firstLeg.affectedCharacterIds as readonly unknown[])
      : [];
  if (
    ((value.attackLegs as readonly unknown[]).length === 2) !==
      Boolean(redirectOwnerId) ||
    (redirectOwnerId !== null &&
      !initialAffectedCharacterIds.includes(redirectOwnerId))
  ) {
    throw new Error("The canonical redirected Attack Leg is invalid.");
  }
}
function assertActionEffect(
  effect: unknown,
  affectedCharacterId: CharacterId,
  actionType: unknown,
): void {
  if (
    !isRecord(effect) ||
    effect.characterId !== affectedCharacterId ||
    !Number.isInteger(effect.damage) ||
    (effect.damage as number) < 0 ||
    (effect.damage as number) > MAX_STACKED_ATTACK_DAMAGE ||
    !Number.isInteger(effect.hpBefore) ||
    !Number.isInteger(effect.hpAfter) ||
    (effect.hpBefore as number) < 0 ||
    ((effect.hpAfter as number) !==
      Math.max(0, (effect.hpBefore as number) - (effect.damage as number)) &&
      !(
        actionType === "Ability" &&
        (effect.damage as number) === 0 &&
        (effect.hpAfter as number) > (effect.hpBefore as number)
      )) ||
    effect.downedBefore !== (effect.hpBefore === 0) ||
    effect.downedAfter !== (effect.hpAfter === 0)
  ) {
    throw new Error("The canonical Action Resolution effect is invalid.");
  }
}
function assertActionResolutionEffects(
  value: Record<string, unknown>,
  affectedCharacterIds: readonly CharacterId[],
): void {
  (value.effects as readonly unknown[]).forEach((effect, index) => {
    const affectedCharacterId = affectedCharacterIds[index];
    if (!affectedCharacterId) {
      throw new Error("The canonical Action Resolution effects are invalid.");
    }
    assertActionEffect(effect, affectedCharacterId, value.actionType);
  });
}
function assertActionResolvedEvent(value: Record<string, unknown>): void {
  assertActionResolutionMetadata(value);
  assertActionResolutionCollections(value);
  assertActionResolutionEffectCollections(value);
  assertActionResolutionTeamsAndOverrides(value);
  const affectedCharacterIds = assertActionResolutionContacts(value);
  assertActionResolutionReactions(value, affectedCharacterIds);
  assertActionResolutionRedirect(value);
  assertActionResolutionEffects(value, affectedCharacterIds);
}
function assertEliminationContinuedEvent(value: Record<string, unknown>): void {
  if (
    typeof value.eliminatedTeam !== "string" ||
    !isTeam(value.eliminatedTeam) ||
    typeof value.outcome !== "string" ||
    !isTeam(value.outcome) ||
    value.eliminatedTeam === value.outcome
  ) {
    throw new Error("The canonical Continue Event is invalid.");
  }
}
function assertSimultaneousEliminationEvent(
  value: Record<string, unknown>,
): void {
  const outcome = value.outcome;
  const outcomeIsValid =
    (typeof outcome === "string" && isTeam(outcome)) || outcome === "draw";
  if (
    !Array.isArray(value.eliminatedTeams) ||
    value.eliminatedTeams.length !== 2 ||
    value.eliminatedTeams[0] !== "Drow" ||
    value.eliminatedTeams[1] !== "Duergar" ||
    !outcomeIsValid ||
    typeof value.overrideEvidence !== "string" ||
    value.overrideEvidence.trim().length === 0
  ) {
    throw new Error(
      "The canonical simultaneous-elimination ruling is invalid.",
    );
  }
}
function assertMatchReopenedEvent(value: Record<string, unknown>): void {
  if (
    !Number.isSafeInteger(value.endedSequence) ||
    (value.endedSequence as number) < 2 ||
    (value.endedSequence as number) >= (value.sequence as number)
  ) {
    throw new Error("The canonical Reopen Match Event is invalid.");
  }
}
function assertUndoAppliedEvent(value: Record<string, unknown>): void {
  const targetType: unknown = value.targetType;
  const targetTypeIsValid =
    typeof targetType === "string" &&
    isMatchEventType(targetType) &&
    (targetType === "InitiativeGenerated" ||
      targetType === "InitiativeRerolled" ||
      targetType === "DisplayNamesAssigned" ||
      targetType === "MatchStarted" ||
      targetType === "TurnFinished" ||
      targetType === "Dashed" ||
      targetType === "ActionResolved" ||
      targetType === "EliminationContinued" ||
      targetType === "SimultaneousEliminationRuled" ||
      targetType === "MatchReopened");
  if (
    !Number.isSafeInteger(value.targetSequence) ||
    (value.targetSequence as number) < 2 ||
    (value.targetSequence as number) >= (value.sequence as number) ||
    !targetTypeIsValid
  ) {
    throw new Error("The canonical Undo Event is invalid.");
  }
}
function expectedInitiativeTies(results: readonly unknown[]): readonly {
  readonly total: number;
  readonly initialCharacterIds: readonly CharacterId[];
  readonly finalCharacterIds: readonly CharacterId[];
}[] {
  return [...new Set(results.map((entry) => (entry as InitiativeEntry).total))]
    .filter(
      (total) =>
        results.filter((entry) => (entry as InitiativeEntry).total === total)
          .length > 1,
    )
    .map((total) => ({
      total,
      initialCharacterIds: MATCH_CONFIGURATION.characters
        .filter((character) =>
          results.some(
            (entry) =>
              (entry as InitiativeEntry).total === total &&
              (entry as InitiativeEntry).characterId === character.id,
          ),
        )
        .map(({ id }) => id),
      finalCharacterIds: results
        .filter((entry) => (entry as InitiativeEntry).total === total)
        .map((entry) => (entry as InitiativeEntry).characterId),
    }));
}
function assertInitiativeEvent(
  value: Record<string, unknown>,
  expectedConfigurationVersion?: string,
): void {
  if (
    (value.type !== "InitiativeGenerated" &&
      value.type !== "InitiativeRerolled") ||
    !Array.isArray(value.results) ||
    !Array.isArray(value.tieOrder)
  ) {
    throw new Error("The canonical Match Event is structurally invalid.");
  }
  const results = value.results as readonly unknown[];
  assertCanonicalState(
    {
      schemaVersion: MATCH_SCHEMA_VERSION,
      configurationVersion: value.configurationVersion,
      matchId: value.matchId,
      phase: "setup",
      sequence: value.sequence,
      characters: MATCH_CONFIGURATION.characters.map(({ id, baseHp }) => ({
        characterId: id,
        hp: baseHp,
      })),
      initiative: results,
      displayNames: {},
      spentReactionIds: [],
      spentAbilityIds: [],
      movementPaces: 2,
      remainingMovementPaces: 2,
      actionsUsed: 0,
      majorActionUsed: false,
      eliminatedTeams: [],
      acknowledgedEliminations: [],
      outcome: null,
      activeEffects: [],
    },
    expectedConfigurationVersion,
  );
  const expectedTies = expectedInitiativeTies(results);
  if (value.tieOrder.length !== expectedTies.length) {
    throw new Error("The canonical tied-group order is structurally invalid.");
  }
  value.tieOrder.forEach((tie, index) => {
    const expected = expectedTies[index];
    if (expected === undefined) {
      throw new Error(
        "The canonical tied-group order is structurally invalid.",
      );
    }
    assertCoinFlipTieOrder(tie, expected.total, {
      initialCharacterIds: expected.initialCharacterIds,
      finalCharacterIds: expected.finalCharacterIds,
    });
  });
}
export function assertCanonicalEvent(
  value: unknown,
  expectedConfigurationVersion?: string,
): asserts value is MatchEvent {
  if (!isRecord(value)) {
    throw new Error("The canonical Match Event is structurally invalid.");
  }
  assertEventBase(value, expectedConfigurationVersion);
  if (value.type === "SetupCreated") {
    assertSetupEvent(value);
    return;
  }
  if (value.type === "DisplayNamesAssigned") {
    assertDisplayNamesEvent(value);
    return;
  }
  if (value.type === "MatchStarted") {
    assertMatchStartedEvent(value);
    return;
  }
  if (value.type === "TurnFinished") {
    assertTurnFinishedEvent(value);
    return;
  }
  if (value.type === "Dashed") {
    assertDashedEvent(value);
    return;
  }
  if (value.type === "ActionResolved") {
    assertActionResolvedEvent(value);
    return;
  }
  if (value.type === "EliminationContinued") {
    assertEliminationContinuedEvent(value);
    return;
  }
  if (value.type === "SimultaneousEliminationRuled") {
    assertSimultaneousEliminationEvent(value);
    return;
  }
  if (value.type === "MatchEnded") {
    assertMatchEndedEvent(value);
    return;
  }
  if (value.type === "MatchReopened") {
    assertMatchReopenedEvent(value);
    return;
  }
  if (value.type === "UndoApplied") {
    assertUndoAppliedEvent(value);
    return;
  }
  assertInitiativeEvent(value, expectedConfigurationVersion);
}
