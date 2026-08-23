import {
  MATCH_SCHEMA_VERSION,
  LEGACY_MATCH_SCHEMA_VERSION,
  assertMatchStateStructure,
  canonicalMatchRecordsEqual,
  getUndoPreview,
  migrateLegacyMatch,
  restoreStateFromEvents,
  type InitiativeEntry,
  type MatchEvent,
  type MatchState,
} from "../domain/match";
import { RULESET } from "../domain/ruleset";

const DEFAULT_DATABASE_NAME = "bottlebound-match";
const DATABASE_VERSION = 1;
const METADATA_STORE = "metadata";
const SNAPSHOT_STORE = "snapshots";
const EVENT_STORE = "events";
const CURRENT_MATCH_KEY = "current-match";

interface CurrentMatchMetadata {
  readonly matchId: string;
  readonly sequence: number;
  readonly schemaVersion: number;
  readonly rulesVersion: string;
}

export interface RestoredMatch {
  readonly state: MatchState;
  readonly events: readonly MatchEvent[];
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), {
      once: true,
    });
    request.addEventListener(
      "error",
      () => reject(request.error ?? new Error("IndexedDB request failed.")),
      { once: true },
    );
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener(
      "abort",
      () =>
        reject(
          transaction.error ?? new Error("IndexedDB transaction aborted."),
        ),
      { once: true },
    );
    transaction.addEventListener(
      "error",
      () =>
        reject(transaction.error ?? new Error("IndexedDB transaction failed.")),
      { once: true },
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordWithout(
  value: object,
  omittedKeys: readonly string[],
): Record<string, unknown> {
  const omitted = new Set(omittedKeys);
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !omitted.has(key)),
  );
}

function assertCanonicalState(
  value: unknown,
  expectedRulesVersion?: string,
): asserts value is MatchState {
  assertMatchStateStructure(value);
  if (!isRecord(value))
    throw new Error("The canonical snapshot is structurally invalid.");
  if (
    typeof value.rulesVersion !== "string" ||
    value.rulesVersion.length === 0 ||
    (expectedRulesVersion !== undefined &&
      value.rulesVersion !== expectedRulesVersion)
  ) {
    throw new Error("The canonical snapshot rules version is incompatible.");
  }
  if (
    typeof value.matchId !== "string" ||
    value.matchId.length === 0 ||
    (value.phase !== "setup" &&
      value.phase !== "active" &&
      value.phase !== "ended") ||
    !Number.isSafeInteger(value.sequence) ||
    (value.sequence as number) < 1
  ) {
    throw new Error("The canonical snapshot is structurally invalid.");
  }
  if (
    !Array.isArray(value.characters) ||
    value.characters.length !== RULESET.characters.length
  ) {
    throw new Error("The canonical snapshot roster is invalid.");
  }
  for (const [index, rulesCharacter] of RULESET.characters.entries()) {
    const matchCharacter = value.characters[index];
    if (
      !isRecord(matchCharacter) ||
      matchCharacter.characterId !== rulesCharacter.id ||
      !Number.isInteger(matchCharacter.hp) ||
      (matchCharacter.hp as number) < 0 ||
      (matchCharacter.hp as number) > rulesCharacter.baseHp
    ) {
      throw new Error("The canonical snapshot roster is invalid.");
    }
  }
  if (value.initiative === null) {
    if (value.phase === "active") {
      throw new Error("The Active Match initiative result is incomplete.");
    }
    return;
  }
  if (
    !Array.isArray(value.initiative) ||
    value.initiative.length !== RULESET.characters.length
  ) {
    throw new Error("The canonical initiative result is structurally invalid.");
  }
  const seen = new Set<string>();
  let previousTotal = Number.POSITIVE_INFINITY;
  value.initiative.forEach((entry, index) => {
    if (!isRecord(entry))
      throw new Error(
        "The canonical initiative result is structurally invalid.",
      );
    const rulesCharacter = RULESET.characters.find(
      ({ id }) => id === entry.characterId,
    );
    if (
      !rulesCharacter ||
      seen.has(rulesCharacter.id) ||
      entry.slot !== index + 1 ||
      !Number.isInteger(entry.roll) ||
      (entry.roll as number) < 1 ||
      (entry.roll as number) > 20 ||
      entry.modifier !== rulesCharacter.initiativeModifier ||
      entry.total !==
        (entry.roll as number) + rulesCharacter.initiativeModifier ||
      (entry.total as number) > previousTotal
    ) {
      throw new Error(
        "The canonical initiative result is structurally invalid.",
      );
    }
    seen.add(rulesCharacter.id);
    previousTotal = entry.total as number;
  });
  if (
    (value.phase === "active" || value.phase === "ended") &&
    (!Number.isSafeInteger(value.round) ||
      (value.round as number) < 1 ||
      !Number.isSafeInteger(value.activeSlot) ||
      (value.activeSlot as number) < 1 ||
      (value.activeSlot as number) > RULESET.characters.length)
  ) {
    throw new Error("The Active Match turn is structurally invalid.");
  }
  if (
    value.phase === "ended" &&
    (typeof value.endedAt !== "string" ||
      value.endedAt.length === 0 ||
      !Number.isSafeInteger(value.endedSequence) ||
      (value.endedSequence as number) < 2 ||
      (value.endedSequence as number) > (value.sequence as number) ||
      value.outcome === null)
  ) {
    throw new Error("The Ended Match is structurally invalid.");
  }
}

function sameInitiative(
  left: readonly InitiativeEntry[],
  right: readonly InitiativeEntry[],
): boolean {
  return left.every((entry, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      entry.characterId === other.characterId &&
      entry.roll === other.roll &&
      entry.modifier === other.modifier &&
      entry.total === other.total &&
      entry.slot === other.slot
    );
  });
}

function assertCoinFlipTieOrder(
  value: unknown,
  total: number,
  initialCharacterIds: readonly string[],
  finalCharacterIds: readonly string[],
): void {
  if (
    !isRecord(value) ||
    value.total !== total ||
    !Array.isArray(value.initialCharacterIds) ||
    !Array.isArray(value.steps) ||
    !Array.isArray(value.characterIds) ||
    value.initialCharacterIds.length !== initialCharacterIds.length ||
    !value.initialCharacterIds.every(
      (characterId, index) => characterId === initialCharacterIds[index],
    ) ||
    value.characterIds.length !== finalCharacterIds.length
  ) {
    throw new Error("The canonical digital coin-flip order is invalid.");
  }
  const replayed = [...initialCharacterIds];
  if (value.steps.length !== replayed.length - 1) {
    throw new Error("The canonical digital coin-flip order is invalid.");
  }
  value.steps.forEach((step, stepIndex) => {
    const position = replayed.length - 1 - stepIndex;
    const upperExclusive = position + 1;
    const bitCount = Math.ceil(Math.log2(upperExclusive));
    if (
      !isRecord(step) ||
      step.position !== position ||
      step.upperExclusive !== upperExclusive ||
      !Array.isArray(step.attempts) ||
      step.attempts.length === 0
    ) {
      throw new Error("The canonical digital coin-flip order is invalid.");
    }
    const attempts = step.attempts;
    attempts.forEach((attempt, attemptIndex) => {
      if (
        !isRecord(attempt) ||
        !Array.isArray(attempt.flips) ||
        attempt.flips.length !== bitCount ||
        !attempt.flips.every((flip) => flip === "heads" || flip === "tails")
      ) {
        throw new Error("The canonical digital coin-flip order is invalid.");
      }
      const candidate = attempt.flips.reduce(
        (result, flip) => result * 2 + (flip === "heads" ? 1 : 0),
        0,
      );
      const accepted = candidate < upperExclusive;
      const isLast = attemptIndex === attempts.length - 1;
      if (
        attempt.candidate !== candidate ||
        attempt.accepted !== accepted ||
        accepted !== isLast ||
        (isLast && step.selectedIndex !== candidate)
      ) {
        throw new Error("The canonical digital coin-flip order is invalid.");
      }
    });
    const selectedIndex = step.selectedIndex as number;
    [replayed[position], replayed[selectedIndex]] = [
      replayed[selectedIndex] as string,
      replayed[position] as string,
    ];
  });
  if (
    !value.characterIds.every(
      (characterId, index) =>
        characterId === replayed[index] &&
        characterId === finalCharacterIds[index],
    )
  ) {
    throw new Error("The canonical digital coin-flip order is invalid.");
  }
}

function assertCanonicalEvent(
  value: unknown,
  expectedRulesVersion?: string,
): asserts value is MatchEvent {
  if (
    !isRecord(value) ||
    typeof value.matchId !== "string" ||
    !Number.isSafeInteger(value.sequence) ||
    (value.sequence as number) < 1 ||
    typeof value.rulesVersion !== "string" ||
    value.rulesVersion.length === 0 ||
    (expectedRulesVersion !== undefined &&
      value.rulesVersion !== expectedRulesVersion) ||
    typeof value.occurredAt !== "string" ||
    value.occurredAt.length === 0
  ) {
    throw new Error("The canonical Match Event is structurally invalid.");
  }
  if (value.type === "SetupCreated") {
    if (value.sequence !== 1) {
      throw new Error("The canonical Setup Event is structurally invalid.");
    }
    return;
  }
  if (value.type === "MatchStarted") {
    if (value.round !== 1 || value.activeSlot !== 1) {
      throw new Error("The canonical Start Match Event is invalid.");
    }
    return;
  }
  if (value.type === "TurnFinished") {
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
      (value.fromSlot as number) > RULESET.characters.length ||
      (value.activeSlot as number) < 1 ||
      (value.activeSlot as number) > RULESET.characters.length ||
      !Array.isArray(value.skippedSlots) ||
      !value.skippedSlots.every(
        (slot) =>
          Number.isSafeInteger(slot) &&
          (slot as number) >= 1 &&
          (slot as number) <= RULESET.characters.length,
      )
    ) {
      throw new Error("The canonical Finish Turn Event is invalid.");
    }
    const visited: number[] = [];
    let slot = value.fromSlot as number;
    let round = value.fromRound as number;
    do {
      if (slot === RULESET.characters.length) {
        slot = 1;
        round += 1;
      } else slot += 1;
      if (slot !== value.activeSlot || round !== value.round)
        visited.push(slot);
      if (visited.length > RULESET.characters.length) break;
    } while (slot !== value.activeSlot || round !== value.round);
    if (
      visited.length > RULESET.characters.length ||
      value.skippedSlots.length !== visited.length ||
      !value.skippedSlots.every((skipped, index) => skipped === visited[index])
    ) {
      throw new Error("The canonical Finish Turn Event is invalid.");
    }
    return;
  }
  if (value.type === "ActionResolved") {
    const historicalRuleset =
      typeof expectedRulesVersion === "string" &&
      expectedRulesVersion !== RULESET.version;
    const attack = historicalRuleset
      ? undefined
      : RULESET.basicAttacks.find(({ id }) => id === value.attackId);
    if (
      value.actionType !== "Basic Attack" ||
      (!historicalRuleset &&
        (!attack ||
          value.sourceCharacterId !== attack.characterId ||
          value.attackType !== attack.attackType ||
          value.rangePaces !== attack.rangePaces ||
          value.damage !== attack.damage ||
          value.rulesSourceAnchor !== attack.sourceAnchor)) ||
      (historicalRuleset &&
        (!Number.isInteger(value.rangePaces) ||
          (value.rangePaces as number) < 1 ||
          !Number.isInteger(value.damage) ||
          (value.damage as number) < 0 ||
          typeof value.rulesSourceAnchor !== "string" ||
          value.rulesSourceAnchor.length === 0)) ||
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
      !Array.isArray(value.eliminatedTeams) ||
      !value.eliminatedTeams.every(
        (team) => team === "Drow" || team === "Duergar",
      ) ||
      new Set(value.eliminatedTeams).size !== value.eliminatedTeams.length ||
      (value.majorActionOverride !== null &&
        (typeof value.majorActionOverride !== "string" ||
          value.majorActionOverride.trim().length === 0))
    ) {
      throw new Error("The canonical Action Resolution Event is invalid.");
    }
    const affectedCharacterIds: string[] = [];
    value.attackLegs.forEach((leg, index) => {
      if (
        !isRecord(leg) ||
        leg.sequence !== index + 1 ||
        leg.kind !== (index === 0 ? "initial" : "redirected") ||
        leg.sourceCharacterId !== value.sourceCharacterId ||
        leg.attackId !== value.attackId ||
        leg.rangePaces !== value.rangePaces ||
        (index === 0 && leg.redirectedByReactionId !== null) ||
        (index === 1 &&
          (typeof leg.redirectedByReactionId !== "string" ||
            leg.redirectedByReactionId.length === 0 ||
            (!historicalRuleset &&
              leg.redirectedByReactionId !==
                "duergar-monk-deflecting-palm"))) ||
        leg.towardCharacterId !==
          (index === 0 ? null : value.sourceCharacterId) ||
        !Array.isArray(leg.affectedCharacterIds) ||
        (index === 0 && leg.affectedCharacterIds.length === 0) ||
        !leg.affectedCharacterIds.every(
          (characterId) =>
            typeof characterId === "string" &&
            RULESET.characters.some(({ id }) => id === characterId),
        )
      ) {
        throw new Error("The canonical Attack Leg is invalid.");
      }
      affectedCharacterIds.push(...leg.affectedCharacterIds);
    });
    if (
      new Set(affectedCharacterIds).size !== affectedCharacterIds.length ||
      value.effects.length !== affectedCharacterIds.length
    ) {
      throw new Error("The canonical Action Resolution contacts are invalid.");
    }
    const reactionOwners = new Set<string>();
    value.reactions.forEach((reactionResolution) => {
      if (!isRecord(reactionResolution)) {
        throw new Error("The canonical Action Resolution Reaction is invalid.");
      }
      const reaction = historicalRuleset
        ? null
        : RULESET.reactions.find(
            ({ id }) => id === reactionResolution.reactionId,
          );
      const owner = historicalRuleset
        ? reactionResolution.ownerCharacterId
        : reaction?.ownerCharacterId;
      if (
        (historicalRuleset &&
          (typeof reactionResolution.reactionId !== "string" ||
            reactionResolution.reactionId.length === 0)) ||
        (!historicalRuleset && !reaction) ||
        typeof owner !== "string" ||
        owner.length === 0 ||
        (!historicalRuleset && reactionResolution.ownerCharacterId !== owner) ||
        typeof reactionResolution.protectedCharacterId !== "string" ||
        !affectedCharacterIds.includes(
          reactionResolution.protectedCharacterId,
        ) ||
        reactionOwners.has(owner) ||
        !Array.isArray(reactionResolution.warnings) ||
        !reactionResolution.warnings.every(
          (warning) => typeof warning === "string" && warning.length > 0,
        ) ||
        (reactionResolution.override !== null &&
          (typeof reactionResolution.override !== "string" ||
            reactionResolution.override.trim().length === 0)) ||
        !Array.isArray(reactionResolution.operations) ||
        !reactionResolution.operations.every(
          (operation) =>
            isRecord(operation) &&
            (operation.type === "prevent-damage-and-effects" ||
              (operation.type === "manual-movement" &&
                operation.characterId === owner &&
                typeof operation.instruction === "string" &&
                operation.instruction.length > 0 &&
                (historicalRuleset || operation.maxPaces === 2)) ||
              (operation.type === "redirect-physical-attack" &&
                operation.fromCharacterId === owner &&
                operation.towardCharacterId === value.sourceCharacterId &&
                (historicalRuleset || reaction?.name === "Deflecting Palm"))),
        )
      ) {
        throw new Error("The canonical Action Resolution Reaction is invalid.");
      }
      reactionOwners.add(owner);
    });
    let redirectOwnerId: string | null = null;
    for (const reactionResolution of value.reactions) {
      if (
        isRecord(reactionResolution) &&
        typeof reactionResolution.ownerCharacterId === "string" &&
        Array.isArray(reactionResolution.operations) &&
        reactionResolution.operations.some(
          (operation) =>
            isRecord(operation) &&
            operation.type === "redirect-physical-attack",
        )
      ) {
        redirectOwnerId = reactionResolution.ownerCharacterId;
        break;
      }
    }
    const firstLeg = value.attackLegs[0];
    const initialAffectedCharacterIds =
      isRecord(firstLeg) && Array.isArray(firstLeg.affectedCharacterIds)
        ? firstLeg.affectedCharacterIds
        : [];
    if (
      (value.attackLegs.length === 2) !== Boolean(redirectOwnerId) ||
      (redirectOwnerId !== null &&
        !initialAffectedCharacterIds.includes(redirectOwnerId))
    ) {
      throw new Error("The canonical redirected Attack Leg is invalid.");
    }
    value.effects.forEach((effect, index) => {
      if (
        !isRecord(effect) ||
        effect.characterId !== affectedCharacterIds[index] ||
        (effect.damage !== 0 && effect.damage !== 1) ||
        !Number.isInteger(effect.hpBefore) ||
        !Number.isInteger(effect.hpAfter) ||
        (effect.hpBefore as number) < 0 ||
        effect.hpAfter !==
          Math.max(0, (effect.hpBefore as number) - effect.damage) ||
        effect.downedBefore !== (effect.hpBefore === 0) ||
        effect.downedAfter !== (effect.hpAfter === 0)
      ) {
        throw new Error("The canonical Action Resolution effect is invalid.");
      }
    });
    return;
  }
  if (value.type === "EliminationContinued") {
    if (
      (value.eliminatedTeam !== "Drow" && value.eliminatedTeam !== "Duergar") ||
      (value.outcome !== "Drow" && value.outcome !== "Duergar") ||
      value.eliminatedTeam === value.outcome
    ) {
      throw new Error("The canonical Continue Event is invalid.");
    }
    return;
  }
  if (value.type === "SimultaneousEliminationRuled") {
    if (
      !Array.isArray(value.eliminatedTeams) ||
      value.eliminatedTeams.length !== 2 ||
      value.eliminatedTeams[0] !== "Drow" ||
      value.eliminatedTeams[1] !== "Duergar" ||
      (value.outcome !== "Drow" &&
        value.outcome !== "Duergar" &&
        value.outcome !== "draw") ||
      typeof value.overrideEvidence !== "string" ||
      value.overrideEvidence.trim().length === 0
    ) {
      throw new Error(
        "The canonical simultaneous-elimination ruling is invalid.",
      );
    }
    return;
  }
  if (value.type === "MatchEnded") {
    if (
      (value.outcome !== "Drow" &&
        value.outcome !== "Duergar" &&
        value.outcome !== "draw") ||
      !Array.isArray(value.eliminatedTeams) ||
      (value.eliminatedTeams.length === 1
        ? value.outcome === "draw" || value.eliminatedTeams[0] === value.outcome
        : value.eliminatedTeams.length !== 2 ||
          value.eliminatedTeams[0] !== "Drow" ||
          value.eliminatedTeams[1] !== "Duergar")
    ) {
      throw new Error("The canonical End Game Event is invalid.");
    }
    return;
  }
  if (value.type === "MatchReopened") {
    if (
      !Number.isSafeInteger(value.endedSequence) ||
      (value.endedSequence as number) < 2 ||
      (value.endedSequence as number) >= (value.sequence as number)
    ) {
      throw new Error("The canonical Reopen Match Event is invalid.");
    }
    return;
  }
  if (value.type === "MatchMigrated") {
    if (
      value.fromSchemaVersion !== LEGACY_MATCH_SCHEMA_VERSION ||
      value.toSchemaVersion !== MATCH_SCHEMA_VERSION
    ) {
      throw new Error("The canonical Match Migration Event is invalid.");
    }
    return;
  }
  if (value.type === "UndoApplied") {
    if (
      !Number.isSafeInteger(value.targetSequence) ||
      (value.targetSequence as number) < 2 ||
      (value.targetSequence as number) >= (value.sequence as number) ||
      (value.targetType !== "InitiativeGenerated" &&
        value.targetType !== "InitiativeRerolled" &&
        value.targetType !== "MatchStarted" &&
        value.targetType !== "TurnFinished" &&
        value.targetType !== "ActionResolved" &&
        value.targetType !== "EliminationContinued" &&
        value.targetType !== "SimultaneousEliminationRuled" &&
        value.targetType !== "MatchReopened")
    ) {
      throw new Error("The canonical Undo Event is invalid.");
    }
    return;
  }
  if (
    (value.type !== "InitiativeGenerated" &&
      value.type !== "InitiativeRerolled") ||
    !Array.isArray(value.results) ||
    !Array.isArray(value.tieOrder)
  ) {
    throw new Error("The canonical Match Event is structurally invalid.");
  }
  const results: unknown[] = value.results;
  assertCanonicalState({
    schemaVersion: MATCH_SCHEMA_VERSION,
    rulesVersion: value.rulesVersion,
    matchId: value.matchId,
    phase: "setup",
    sequence: value.sequence,
    characters: RULESET.characters.map(({ id, baseHp }) => ({
      characterId: id,
      hp: baseHp,
    })),
    initiative: results,
    spentReactionIds: [],
    majorActionUsed: false,
    eliminatedTeams: [],
    acknowledgedEliminations: [],
    outcome: null,
  });
  const expectedTies = [
    ...new Set(results.map((entry) => (entry as InitiativeEntry).total)),
  ]
    .filter(
      (total) =>
        results.filter((entry) => (entry as InitiativeEntry).total === total)
          .length > 1,
    )
    .map((total) => ({
      total,
      initialCharacterIds: RULESET.characters
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
    assertCoinFlipTieOrder(
      tie,
      expected.total,
      expected.initialCharacterIds,
      expected.finalCharacterIds,
    );
  });
}

function assertCommit(event: MatchEvent, state: MatchState): void {
  assertCanonicalState(state);
  assertCanonicalEvent(event, state.rulesVersion);
  if (
    event.matchId !== state.matchId ||
    event.sequence !== state.sequence ||
    event.rulesVersion !== state.rulesVersion
  ) {
    throw new Error(
      "The Match Event and snapshot do not describe one sequence.",
    );
  }
  if (event.type === "SetupCreated") {
    if (
      event.sequence !== 1 ||
      state.phase !== "setup" ||
      state.initiative !== null
    ) {
      throw new Error("The Setup creation record is structurally invalid.");
    }
    return;
  }
  if (
    event.type === "InitiativeGenerated" ||
    event.type === "InitiativeRerolled"
  ) {
    if (
      state.phase !== "setup" ||
      state.initiative === null ||
      event.results.length !== state.initiative.length ||
      !sameInitiative(event.results, state.initiative)
    ) {
      throw new Error("The initiative event and snapshot do not match.");
    }
    return;
  }
  if (event.type === "UndoApplied") {
    return;
  }
  if (event.type === "MatchMigrated") {
    return;
  }
  if (event.type === "ActionResolved") {
    if (state.phase !== "active" || !state.majorActionUsed) {
      throw new Error("The Action Resolution Event and snapshot do not match.");
    }
    const activeSource = state.initiative[state.activeSlot - 1]?.characterId;
    if (event.sourceCharacterId !== activeSource) {
      throw new Error("The Action Resolution source is not active.");
    }
    for (const effect of event.effects) {
      const character = state.characters.find(
        ({ characterId }) => characterId === effect.characterId,
      );
      if (!character || character.hp !== effect.hpAfter) {
        throw new Error(
          "The Action Resolution Event and snapshot do not match.",
        );
      }
    }
    if (
      event.reactions.some(
        ({ reactionId }) => !state.spentReactionIds.includes(reactionId),
      )
    ) {
      throw new Error("The Action Resolution Reaction state does not match.");
    }
    if (
      !canonicalMatchRecordsEqual(event.eliminatedTeams, state.eliminatedTeams)
    ) {
      throw new Error(
        "The Action Resolution Team Elimination state does not match.",
      );
    }
    return;
  }
  if (event.type === "EliminationContinued") {
    if (
      state.phase !== "active" ||
      !state.acknowledgedEliminations.includes(event.eliminatedTeam) ||
      state.outcome !== event.outcome
    ) {
      throw new Error("The Continue Event and snapshot do not match.");
    }
    return;
  }
  if (event.type === "SimultaneousEliminationRuled") {
    if (
      state.phase !== "active" ||
      state.outcome !== event.outcome ||
      !canonicalMatchRecordsEqual(state.eliminatedTeams, event.eliminatedTeams)
    ) {
      throw new Error(
        "The simultaneous-elimination ruling and snapshot do not match.",
      );
    }
    return;
  }
  if (event.type === "MatchEnded") {
    if (
      state.phase !== "ended" ||
      state.outcome !== event.outcome ||
      !canonicalMatchRecordsEqual(
        state.eliminatedTeams,
        event.eliminatedTeams,
      ) ||
      state.endedSequence !== event.sequence ||
      state.endedAt !== event.occurredAt
    ) {
      throw new Error("The End Game Event and snapshot do not match.");
    }
    return;
  }
  if (event.type === "MatchReopened") {
    if (state.phase !== "active") {
      throw new Error("The Reopen Match Event and snapshot do not match.");
    }
    return;
  }
  if (event.type !== "MatchStarted" && event.type !== "TurnFinished") {
    throw new Error("The canonical Match Event is structurally invalid.");
  }
  if (
    state.phase !== "active" ||
    event.round !== state.round ||
    event.activeSlot !== state.activeSlot
  ) {
    throw new Error("The live Match Event and snapshot do not match.");
  }
}

function assertRestoredMatch(
  metadata: unknown,
  state: unknown,
  events: unknown[],
): asserts state is MatchState {
  if (!isRecord(metadata))
    throw new Error("Saved canonical metadata is invalid.");
  assertCanonicalState(state);
  if (
    metadata.matchId !== state.matchId ||
    metadata.sequence !== state.sequence ||
    metadata.schemaVersion !== MATCH_SCHEMA_VERSION ||
    metadata.rulesVersion !== state.rulesVersion ||
    events.length !== state.sequence
  ) {
    throw new Error("Saved canonical data has a partial sequence.");
  }
  events.forEach((event, index) => {
    assertCanonicalEvent(event, state.rulesVersion);
    if (
      event.matchId !== state.matchId ||
      event.sequence !== index + 1 ||
      (index === 0 && event.type !== "SetupCreated") ||
      (index === 1 &&
        event.type !== "InitiativeGenerated" &&
        event.type !== "MatchMigrated")
    ) {
      throw new Error("Saved canonical data has a partial sequence.");
    }
  });
  const lastEvent = events.at(-1);
  if (lastEvent === undefined)
    throw new Error("Saved canonical data has no Match Event.");
  assertCanonicalEvent(lastEvent, state.rulesVersion);
  assertCommit(lastEvent, state);
  if (
    !canonicalMatchRecordsEqual(
      restoreStateFromEvents(events as MatchEvent[]),
      state,
    )
  ) {
    throw new Error("Saved canonical data does not match its event history.");
  }
}

export class IndexedDbMatchStore {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly factory: IDBFactory = globalThis.indexedDB,
    private readonly databaseName = DEFAULT_DATABASE_NAME,
  ) {}

  private open(): Promise<IDBDatabase> {
    this.databasePromise ??= new Promise((resolve, reject) => {
      const request = this.factory.open(this.databaseName, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(METADATA_STORE)) {
          database.createObjectStore(METADATA_STORE);
        }
        if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
          database.createObjectStore(SNAPSHOT_STORE, { keyPath: "matchId" });
        }
        if (!database.objectStoreNames.contains(EVENT_STORE)) {
          const events = database.createObjectStore(EVENT_STORE, {
            keyPath: ["matchId", "sequence"],
          });
          events.createIndex("matchId", "matchId", { unique: false });
        }
      });
      request.addEventListener("success", () => resolve(request.result), {
        once: true,
      });
      request.addEventListener(
        "error",
        () =>
          reject(
            request.error ?? new Error("The Match database could not open."),
          ),
        { once: true },
      );
    });
    return this.databasePromise;
  }

  async commit(event: MatchEvent, state: MatchState): Promise<void> {
    assertCommit(event, state);
    const database = await this.open();
    const transaction = database.transaction(
      [METADATA_STORE, SNAPSHOT_STORE, EVENT_STORE],
      "readwrite",
    );
    const completion = transactionComplete(transaction);
    const metadataStore = transaction.objectStore(METADATA_STORE);
    const current = await requestResult<CurrentMatchMetadata | undefined>(
      metadataStore.get(CURRENT_MATCH_KEY),
    );
    const expectedSequence = current ? current.sequence + 1 : 1;
    if (
      event.sequence !== expectedSequence ||
      (current !== undefined &&
        (current.matchId !== event.matchId ||
          current.rulesVersion !== state.rulesVersion))
    ) {
      transaction.abort();
      await completion.catch(() => undefined);
      throw new Error("The new record must continue the committed sequence.");
    }
    if (event.type === "UndoApplied") {
      const previousState = await requestResult<MatchState | undefined>(
        transaction.objectStore(SNAPSHOT_STORE).get(event.matchId),
      );
      const previousEvents = await requestResult<MatchEvent[]>(
        transaction
          .objectStore(EVENT_STORE)
          .index("matchId")
          .getAll(event.matchId),
      );
      if (previousState === undefined) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new Error("Undo needs the last committed Match State.");
      }
      const preview = getUndoPreview(previousState, previousEvents);
      if (
        preview === null ||
        preview.target.sequence !== event.targetSequence ||
        preview.target.type !== event.targetType ||
        !canonicalMatchRecordsEqual(preview.restoredState, state)
      ) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new Error("The Undo Event and restored snapshot do not match.");
      }
    }
    if (
      event.type === "ActionResolved" ||
      event.type === "SimultaneousEliminationRuled"
    ) {
      const previousState = await requestResult<MatchState | undefined>(
        transaction.objectStore(SNAPSHOT_STORE).get(event.matchId),
      );
      const previousEvents = await requestResult<MatchEvent[]>(
        transaction
          .objectStore(EVENT_STORE)
          .index("matchId")
          .getAll(event.matchId),
      );
      if (
        previousState === undefined ||
        !canonicalMatchRecordsEqual(
          restoreStateFromEvents([...previousEvents, event]),
          state,
        )
      ) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new Error("The Match Event and committed snapshot do not match.");
      }
    }
    try {
      transaction.objectStore(EVENT_STORE).add(event);
      transaction.objectStore(SNAPSHOT_STORE).put(state);
      metadataStore.put(
        {
          matchId: state.matchId,
          sequence: state.sequence,
          schemaVersion: MATCH_SCHEMA_VERSION,
          rulesVersion: state.rulesVersion,
        } satisfies CurrentMatchMetadata,
        CURRENT_MATCH_KEY,
      );
    } catch (error) {
      transaction.abort();
      await completion.catch(() => undefined);
      throw error;
    }
    await completion;
  }

  async restore(): Promise<RestoredMatch | null> {
    const database = await this.open();
    const transaction = database.transaction(
      [METADATA_STORE, SNAPSHOT_STORE, EVENT_STORE],
      "readwrite",
    );
    const completion = transactionComplete(transaction);
    const metadata = await requestResult<unknown>(
      transaction.objectStore(METADATA_STORE).get(CURRENT_MATCH_KEY),
    );
    const allSnapshots = await requestResult<unknown[]>(
      transaction.objectStore(SNAPSHOT_STORE).getAll(),
    );
    const allEvents = await requestResult<unknown[]>(
      transaction.objectStore(EVENT_STORE).getAll(),
    );
    if (metadata === undefined) {
      if (allSnapshots.length > 0 || allEvents.length > 0) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new Error("Saved canonical data is incomplete.");
      }
      await completion;
      return null;
    }
    const state = allSnapshots[0];
    if (allSnapshots.length !== 1) {
      transaction.abort();
      await completion.catch(() => undefined);
      throw new Error("Saved canonical data has an invalid snapshot count.");
    }
    if (
      isRecord(metadata) &&
      metadata.schemaVersion === LEGACY_MATCH_SCHEMA_VERSION
    ) {
      try {
        assertMatchStateStructure(state, LEGACY_MATCH_SCHEMA_VERSION);
        if (
          metadata.matchId !== state.matchId ||
          metadata.sequence !== state.sequence ||
          metadata.rulesVersion !== state.rulesVersion ||
          allEvents.length !== state.sequence
        ) {
          throw new Error("Saved canonical data has a partial sequence.");
        }
        allEvents.forEach((event, index) => {
          assertCanonicalEvent(event, state.rulesVersion);
          if (
            !isRecord(event) ||
            event.matchId !== state.matchId ||
            event.sequence !== index + 1 ||
            (index === 0 && event.type !== "SetupCreated")
          ) {
            throw new Error("Saved canonical data has a partial sequence.");
          }
        });
        const replayed = restoreStateFromEvents(allEvents as MatchEvent[]);
        const legacyState = recordWithout(state, ["schemaVersion", "sequence"]);
        const replayedLegacy = recordWithout(replayed, [
          "schemaVersion",
          "sequence",
          "spentReactionIds",
          "majorActionUsed",
          "eliminatedTeams",
          "acknowledgedEliminations",
          "outcome",
        ]);
        if (!canonicalMatchRecordsEqual(legacyState, replayedLegacy)) {
          throw new Error(
            "Saved canonical data does not match its event history.",
          );
        }
        const lastEvent = allEvents.at(-1) as MatchEvent | undefined;
        if (!lastEvent)
          throw new Error("Saved canonical data has no Match Event.");
        const migrated = migrateLegacyMatch(state, lastEvent.occurredAt);
        const migratedEvents = [...(allEvents as MatchEvent[]), migrated.event];
        const migratedMetadata = {
          matchId: migrated.state.matchId,
          sequence: migrated.state.sequence,
          schemaVersion: MATCH_SCHEMA_VERSION,
          rulesVersion: migrated.state.rulesVersion,
        } satisfies CurrentMatchMetadata;
        assertRestoredMatch(migratedMetadata, migrated.state, migratedEvents);
        transaction.objectStore(EVENT_STORE).add(migrated.event);
        transaction.objectStore(SNAPSHOT_STORE).put(migrated.state);
        transaction
          .objectStore(METADATA_STORE)
          .put(migratedMetadata, CURRENT_MATCH_KEY);
        await completion;
        return { state: migrated.state, events: migratedEvents };
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already have aborted after a failed write.
        }
        await completion.catch(() => undefined);
        throw error;
      }
    }
    assertRestoredMatch(metadata, state, allEvents);
    await completion;
    return { state, events: allEvents as MatchEvent[] };
  }

  async deleteMatch(matchId: string, confirmed: boolean): Promise<void> {
    if (!confirmed) throw new Error("Discard confirmation is required.");
    const database = await this.open();
    const transaction = database.transaction(
      [METADATA_STORE, SNAPSHOT_STORE, EVENT_STORE],
      "readwrite",
    );
    const completion = transactionComplete(transaction);
    const metadataStore = transaction.objectStore(METADATA_STORE);
    const metadata = await requestResult<CurrentMatchMetadata | undefined>(
      metadataStore.get(CURRENT_MATCH_KEY),
    );
    if (metadata !== undefined && metadata.matchId !== matchId) {
      transaction.abort();
      await completion.catch(() => undefined);
      throw new Error("The requested Match is not the saved Match.");
    }
    metadataStore.delete(CURRENT_MATCH_KEY);
    transaction.objectStore(SNAPSHOT_STORE).delete(matchId);
    const eventStore = transaction.objectStore(EVENT_STORE);
    const eventKeys = await requestResult<IDBValidKey[]>(
      eventStore.index("matchId").getAllKeys(matchId),
    );
    eventKeys.forEach((key) => eventStore.delete(key));
    await completion;
  }
}
