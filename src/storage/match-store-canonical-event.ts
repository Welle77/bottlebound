import {
  LEGACY_MATCH_SCHEMA_VERSION,
  MATCH_SCHEMA_VERSION,
  type InitiativeEntry,
  type MatchEvent,
} from "../domain/match";
import { RULESET } from "../domain/ruleset";
import {
  assertCoinFlipTieOrder,
  assertCanonicalState,
  isRecord,
} from "./match-store-canonical-state";

/**
 * Highest finalized per-character attack damage expressible under the locked
 * Ruleset: a base or ability attack contributes its written 1 damage and both
 * stacking character effects (Hunter's Mark, Hex) add their written +1 each
 * (rules §11), for a maximum of 3.
 */
const MAX_STACKED_ATTACK_DAMAGE = 3;

export function assertCanonicalEvent(
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
  if (value.type === "DisplayNamesAssigned") {
    const names = value.displayNames;
    if (
      !isRecord(names) ||
      !Object.keys(names).every(
        (characterId) =>
          typeof names[characterId] === "string" &&
          (names[characterId] as string).length > 0 &&
          (names[characterId] as string).trim() === names[characterId] &&
          RULESET.characters.some(({ id }) => id === characterId),
      )
    ) {
      throw new Error("The canonical Display Name assignment is invalid.");
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
      (value.actionType !== "Basic Attack" && value.actionType !== "Ability") ||
      (!historicalRuleset &&
        value.actionType === "Basic Attack" &&
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
      (value.actionType === "Ability" &&
        (typeof value.attackId !== "string" ||
          value.attackId.length === 0 ||
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
          value.majorActionOverride.trim().length === 0)) ||
      // Optional recorded Override for a state-invalid Ability choice; older
      // persisted events omit the field entirely.
      (value.abilityOverride !== undefined &&
        value.abilityOverride !== null &&
        (typeof value.abilityOverride !== "string" ||
          value.abilityOverride.trim().length === 0))
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
        !Number.isInteger(effect.damage) ||
        (effect.damage as number) < 0 ||
        (effect.damage as number) > MAX_STACKED_ATTACK_DAMAGE ||
        !Number.isInteger(effect.hpBefore) ||
        !Number.isInteger(effect.hpAfter) ||
        (effect.hpBefore as number) < 0 ||
        // Damage effects follow the attack ledger; Ability heal and revival
        // effects raise HP without damage and are admitted for Abilities only.
        ((effect.hpAfter as number) !==
          Math.max(
            0,
            (effect.hpBefore as number) - (effect.damage as number),
          ) &&
          !(
            value.actionType === "Ability" &&
            (effect.damage as number) === 0 &&
            (effect.hpAfter as number) > (effect.hpBefore as number)
          )) ||
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
      !value.eliminatedTeams.every(
        (team: unknown) => team === "Drow" || team === "Duergar",
      ) ||
      new Set(value.eliminatedTeams).size !== value.eliminatedTeams.length ||
      (value.eliminatedTeams.length === 0 && value.outcome === "draw") ||
      (value.eliminatedTeams.length === 1 &&
        (value.outcome === "draw" ||
          value.eliminatedTeams[0] === value.outcome)) ||
      (value.eliminatedTeams.length === 2 &&
        (value.eliminatedTeams[0] !== "Drow" ||
          value.eliminatedTeams[1] !== "Duergar"))
    ) {
      throw new Error("The canonical End Game Event is invalid.");
    }
    if (
      value.decisionBasis !== undefined &&
      value.decisionBasis !== "elimination" &&
      value.decisionBasis !== "activeCount" &&
      value.decisionBasis !== "activeHpTotal" &&
      value.decisionBasis !== "coinFlip"
    ) {
      throw new Error("The canonical End Game Event is invalid.");
    }
    if (
      (value.decisionBasis !== undefined ||
        value.finalCounts !== undefined ||
        value.finalHpTotals !== undefined) &&
      (!isRecord(value.finalCounts) ||
        !Number.isInteger(
          (value.finalCounts as Record<string, unknown>).Drow as number,
        ) ||
        !Number.isInteger(
          (value.finalCounts as Record<string, unknown>).Duergar as number,
        ) ||
        ((value.finalCounts as Record<string, unknown>).Drow as number) < 0 ||
        ((value.finalCounts as Record<string, unknown>).Duergar as number) <
          0 ||
        !isRecord(value.finalHpTotals) ||
        !Number.isInteger(
          (value.finalHpTotals as Record<string, unknown>).Drow as number,
        ) ||
        !Number.isInteger(
          (value.finalHpTotals as Record<string, unknown>).Duergar as number,
        ) ||
        ((value.finalHpTotals as Record<string, unknown>).Drow as number) < 0 ||
        ((value.finalHpTotals as Record<string, unknown>).Duergar as number) <
          0)
    ) {
      throw new Error("The canonical End Game Event is invalid.");
    }
    if (
      value.coinFlipResult !== undefined &&
      value.coinFlipResult !== "Drow" &&
      value.coinFlipResult !== "Duergar"
    ) {
      throw new Error("The canonical End Game Event is invalid.");
    }
    if (
      value.decisionBasis === "coinFlip" &&
      value.coinFlipResult === undefined
    ) {
      throw new Error("The canonical End Game Event is invalid.");
    }
    if (
      value.coinFlipResult !== undefined &&
      value.decisionBasis !== "coinFlip"
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
        value.targetType !== "DisplayNamesAssigned" &&
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
    assertCoinFlipTieOrder(tie, expected.total, {
      initialCharacterIds: expected.initialCharacterIds,
      finalCharacterIds: expected.finalCharacterIds,
    });
  });
}
