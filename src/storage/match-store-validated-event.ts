import {
  MATCH_SCHEMA_VERSION,
  isCharacterId,
  isInteger,
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
} from "./match-store-validated-action";
import { assertMatchEndedEvent } from "./match-store-validated-ended-event";
import {
  assertCoinFlipTieOrder,
  assertValidatedState,
  isRecord,
} from "./match-store-validated-state";
import { matchEventSchema } from "./match-store-schemas";

/**
 * Highest finalized per-character attack damage: a base or ability attack
 * contributes its written 1 damage and both
 * stacking character effects (Hunter's Mark, Hex) add +1 each, for a maximum of 3.
 */
const MAX_STACKED_ATTACK_DAMAGE = 3;

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function assertString(value: unknown): asserts value is string {
  if (typeof value !== "string") {
    throw new Error("The validated Match Event contains an invalid string.");
  }
}

function isInitiativeEntry(value: unknown): value is InitiativeEntry {
  return (
    isRecord(value) &&
    typeof value.characterId === "string" &&
    isCharacterId(value.characterId) &&
    isInteger(value.roll) &&
    isInteger(value.modifier) &&
    isInteger(value.total) &&
    isInteger(value.slot)
  );
}
const invalidActionResolution = () =>
  new Error("The validated Action Resolution Event is invalid.");
function assertEventBase(
  value: Record<string, unknown>,
  expectedConfigurationVersion?: string,
): void {
  if (
    typeof value.matchId !== "string" ||
    !isInteger(value.sequence) ||
    value.sequence < 1 ||
    typeof value.configurationVersion !== "string" ||
    value.configurationVersion.length === 0 ||
    (expectedConfigurationVersion !== undefined &&
      value.configurationVersion !== expectedConfigurationVersion) ||
    typeof value.occurredAt !== "string" ||
    value.occurredAt.length === 0
  ) {
    throw new Error("The validated Match Event is structurally invalid.");
  }
  if (
    expectedConfigurationVersion === undefined &&
    value.configurationVersion !== MATCH_CONFIGURATION.version
  ) {
    throw new Error(
      "The validated Match Event configuration version is incompatible.",
    );
  }
}
function assertSetupEvent(value: Record<string, unknown>): void {
  if (value.sequence !== 1) {
    throw new Error("The validated Setup Event is structurally invalid.");
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
    throw new Error("The validated Display Name assignment is invalid.");
  }
}
function assertMatchStartedEvent(value: Record<string, unknown>): void {
  if (value.round !== 1 || value.activeSlot !== 1) {
    throw new Error("The validated Start Match Event is invalid.");
  }
}
function assertTurnFields(value: Record<string, unknown>): void {
  const { fromRound, fromSlot, round, activeSlot } = value;
  if (
    !isInteger(fromRound) ||
    !isInteger(fromSlot) ||
    !isInteger(round) ||
    !isInteger(activeSlot) ||
    fromRound < 1 ||
    round < 1 ||
    fromSlot < 1 ||
    fromSlot > MATCH_CONFIGURATION.characters.length ||
    activeSlot < 1 ||
    activeSlot > MATCH_CONFIGURATION.characters.length ||
    !Array.isArray(value.skippedSlots) ||
    !value.skippedSlots.every(
      (slot) =>
        isInteger(slot) &&
        slot >= 1 &&
        slot <= MATCH_CONFIGURATION.characters.length,
    )
  ) {
    throw new Error("The validated Finish Turn Event is invalid.");
  }
}
function expectedVisitedTurnSlots(
  value: Record<string, unknown>,
): readonly number[] {
  const { fromSlot, fromRound, activeSlot, round: expectedRound } = value;
  if (
    !isInteger(fromSlot) ||
    !isInteger(fromRound) ||
    !isInteger(activeSlot) ||
    !isInteger(expectedRound)
  ) {
    throw new Error("The validated Finish Turn Event is invalid.");
  }
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
        slot !== activeSlot || round !== expectedRound
          ? [...position.visited, slot]
          : position.visited;
      if (nextVisited.length > MATCH_CONFIGURATION.characters.length) {
        return { slot, round, visited: nextVisited, done: true };
      }
      return {
        slot,
        round,
        visited: nextVisited,
        done: slot === activeSlot && round === expectedRound,
      };
    },
    {
      slot: fromSlot,
      round: fromRound,
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
    throw new Error("The validated Finish Turn Event is invalid.");
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
    throw new Error("The validated Dash Event is invalid.");
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
    throw new Error("The validated Attack Leg is invalid.");
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
    throw new Error("The validated Attack Leg is invalid.");
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
    throw new Error("The validated Attack Leg is invalid.");
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
    throw new Error("The validated Attack Leg is invalid.");
  }
  assertAttackLegIdentity(value, leg, index);
  assertAttackLegRedirection(leg, index);
  return assertAttackLegTargets(value, leg, index);
}
function assertActionResolutionContacts(
  value: Record<string, unknown>,
): readonly CharacterId[] {
  const { attackLegs, effects } = value;
  if (!isUnknownArray(attackLegs) || !isUnknownArray(effects)) {
    throw new Error("The validated Action Resolution contacts are invalid.");
  }
  const affectedCharacterIds = attackLegs.flatMap((leg, index) =>
    affectedIdsForLeg(value, { leg, index }),
  );
  if (
    new Set(affectedCharacterIds).size !== affectedCharacterIds.length ||
    effects.length !== affectedCharacterIds.length
  ) {
    throw new Error("The validated Action Resolution contacts are invalid.");
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
    throw new Error("The validated Action Resolution Reaction is invalid.");
  }
}
function assertReactionProtection(
  reactionResolution: Record<string, unknown>,
  affectedCharacterIds: readonly CharacterId[],
): void {
  const { protectedCharacterId } = reactionResolution;
  if (
    typeof protectedCharacterId !== "string" ||
    !isCharacterId(protectedCharacterId) ||
    !affectedCharacterIds.includes(protectedCharacterId)
  ) {
    throw new Error("The validated Action Resolution Reaction is invalid.");
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
    throw new Error("The validated Action Resolution Reaction is invalid.");
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
    throw new Error("The validated Action Resolution Reaction is invalid.");
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
  assertString(owner);
  assertReactionProtection(reactionResolution, affectedCharacterIds);
  if (seenOwners.has(owner)) {
    throw new Error("The validated Action Resolution Reaction is invalid.");
  }
  if (
    !Array.isArray(reactionResolution.warnings) ||
    !reactionResolution.warnings.every(
      (warning) => typeof warning === "string" && warning.length > 0,
    )
  ) {
    throw new Error("The validated Action Resolution Reaction is invalid.");
  }
  assertReactionOperations(reactionResolution, {
    owner,
    value,
    reaction,
  });
  return owner;
}
function assertActionResolutionReactions(
  value: Record<string, unknown>,
  affectedCharacterIds: readonly CharacterId[],
): void {
  const { reactions } = value;
  if (!isUnknownArray(reactions)) {
    throw new Error("The validated Action Resolution reactions are invalid.");
  }
  const reactionList = reactions;
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
  const { reactions, attackLegs } = value;
  if (!isUnknownArray(reactions) || !isUnknownArray(attackLegs)) {
    throw new Error("The validated redirected Attack Leg is invalid.");
  }
  const redirectOwner = reactions.find(hasRedirectOperation);
  const redirectOwnerId: string | null =
    isRecord(redirectOwner) &&
    typeof redirectOwner.ownerCharacterId === "string"
      ? redirectOwner.ownerCharacterId
      : null;
  const [firstLeg] = attackLegs;
  const initialAffectedCharacterIds =
    isRecord(firstLeg) && Array.isArray(firstLeg.affectedCharacterIds)
      ? firstLeg.affectedCharacterIds
      : [];
  if (
    (attackLegs.length === 2) !== Boolean(redirectOwnerId) ||
    (redirectOwnerId !== null &&
      !initialAffectedCharacterIds.includes(redirectOwnerId))
  ) {
    throw new Error("The validated redirected Attack Leg is invalid.");
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
    !isInteger(effect.damage) ||
    effect.damage < 0 ||
    effect.damage > MAX_STACKED_ATTACK_DAMAGE ||
    !isInteger(effect.hpBefore) ||
    !isInteger(effect.hpAfter) ||
    effect.hpBefore < 0 ||
    (effect.hpAfter !== Math.max(0, effect.hpBefore - effect.damage) &&
      !(
        actionType === "Ability" &&
        effect.damage === 0 &&
        effect.hpAfter > effect.hpBefore
      )) ||
    effect.downedBefore !== (effect.hpBefore === 0) ||
    effect.downedAfter !== (effect.hpAfter === 0)
  ) {
    throw new Error("The validated Action Resolution effect is invalid.");
  }
}
function assertActionResolutionEffects(
  value: Record<string, unknown>,
  affectedCharacterIds: readonly CharacterId[],
): void {
  if (!isUnknownArray(value.effects)) {
    throw new Error("The validated Action Resolution effects are invalid.");
  }
  value.effects.forEach((effect, index) => {
    const affectedCharacterId = affectedCharacterIds[index];
    if (!affectedCharacterId) {
      throw new Error("The validated Action Resolution effects are invalid.");
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
    throw new Error("The validated Continue Event is invalid.");
  }
}
function assertSimultaneousEliminationEvent(
  value: Record<string, unknown>,
): void {
  const { outcome } = value;
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
      "The validated simultaneous-elimination ruling is invalid.",
    );
  }
}
function assertMatchReopenedEvent(value: Record<string, unknown>): void {
  const { endedSequence, sequence } = value;
  if (
    !isInteger(endedSequence) ||
    !isInteger(sequence) ||
    endedSequence < 2 ||
    endedSequence >= sequence
  ) {
    throw new Error("The validated Reopen Match Event is invalid.");
  }
}
function assertUndoAppliedEvent(value: Record<string, unknown>): void {
  const { targetType, targetSequence, sequence } = value;
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
    !isInteger(targetSequence) ||
    !isInteger(sequence) ||
    targetSequence < 2 ||
    targetSequence >= sequence ||
    !targetTypeIsValid
  ) {
    throw new Error("The validated Undo Event is invalid.");
  }
}
function expectedInitiativeTies(results: readonly unknown[]): readonly {
  readonly total: number;
  readonly initialCharacterIds: readonly CharacterId[];
  readonly finalCharacterIds: readonly CharacterId[];
}[] {
  const entries = results.filter(isInitiativeEntry);
  if (entries.length !== results.length) {
    throw new Error("The validated initiative result is structurally invalid.");
  }
  return [...new Set(entries.map(({ total }) => total))]
    .filter(
      (total) => entries.filter((entry) => entry.total === total).length > 1,
    )
    .map((total) => ({
      total,
      initialCharacterIds: MATCH_CONFIGURATION.characters
        .filter((character) =>
          entries.some(
            (entry) =>
              entry.total === total && entry.characterId === character.id,
          ),
        )
        .map(({ id }) => id),
      finalCharacterIds: entries
        .filter((entry) => entry.total === total)
        .map((entry) => entry.characterId),
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
    throw new Error("The validated Match Event is structurally invalid.");
  }
  const { results } = value;
  assertValidatedState(
    {
      schemaVersion: MATCH_SCHEMA_VERSION,
      configurationVersion: value.configurationVersion,
      matchId: value.matchId,
      phase: "setup",
      sequence: value.sequence,
      characters: MATCH_CONFIGURATION.characters.map(({ id, baseHp }) => ({
        characterId: id,
        hp: baseHp,
        currentMaxHp: baseHp,
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
    throw new Error("The validated tied-group order is structurally invalid.");
  }
  value.tieOrder.forEach((tie, index) => {
    const expected = expectedTies[index];
    if (expected === undefined) {
      throw new Error(
        "The validated tied-group order is structurally invalid.",
      );
    }
    assertCoinFlipTieOrder(tie, expected.total, {
      initialCharacterIds: expected.initialCharacterIds,
      finalCharacterIds: expected.finalCharacterIds,
    });
  });
}
function validateValidatedEvent(
  value: unknown,
  expectedConfigurationVersion?: string,
): void {
  if (!isRecord(value)) {
    throw new Error("The validated Match Event is structurally invalid.");
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

export function parseValidatedEvent(
  value: unknown,
  expectedConfigurationVersion?: string,
): MatchEvent {
  const parsed = matchEventSchema.parse(value);
  validateValidatedEvent(value, expectedConfigurationVersion);
  return parsed;
}

export function assertValidatedEvent(
  value: unknown,
  expectedConfigurationVersion?: string,
): asserts value is MatchEvent {
  validateValidatedEvent(value, expectedConfigurationVersion);
}
