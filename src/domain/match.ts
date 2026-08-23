import { RULESET, RULES_VERSION, type StructuredAbility } from "./ruleset";

export const MATCH_SCHEMA_VERSION = 3;
export const LEGACY_MATCH_SCHEMA_VERSION = 2;

export interface RandomSource {
  nextUint32(): number;
}

export interface MatchCharacter {
  readonly characterId: string;
  readonly hp: number;
  readonly currentMaxHp: number;
}

export type MatchOutcome = "Drow" | "Duergar" | "draw" | null;

export type EffectDurationKind =
  | "immediate"
  | "until-boundary"
  | "until-trigger"
  | "until-trigger-or-boundary"
  | "while-condition";

export interface ActiveEffect {
  readonly effectId: string;
  readonly abilityId: string;
  readonly kind: string;
  readonly anchorCharacterId: string;
  readonly affectedCharacterId: string;
  readonly duration: {
    readonly kind: EffectDurationKind;
    readonly boundaryTrigger?: string;
    readonly anchor: "source" | "affected";
    readonly removeWhenAffectedDowned: boolean;
  };
  readonly operations: readonly string[];
  readonly appliedSequence: number;
}

interface CombatMatchState {
  readonly spentReactionIds: readonly string[];
  readonly spentAbilityIds: readonly string[];
  readonly majorActionUsed: boolean;
  readonly eliminatedTeams: readonly ("Drow" | "Duergar")[];
  readonly acknowledgedEliminations: readonly ("Drow" | "Duergar")[];
  readonly outcome: MatchOutcome;
  readonly activeEffects: readonly ActiveEffect[];
}

export interface InitiativeEntry {
  readonly characterId: string;
  readonly roll: number;
  readonly modifier: number;
  readonly total: number;
  readonly slot: number;
}

export interface TieOrder {
  readonly total: number;
  readonly initialCharacterIds: readonly string[];
  readonly steps: readonly CoinFlipTieBreakStep[];
  readonly characterIds: readonly string[];
}

export type DigitalCoinFlipResult = "heads" | "tails";

export interface CoinFlipAttempt {
  readonly flips: readonly DigitalCoinFlipResult[];
  readonly candidate: number;
  readonly accepted: boolean;
}

export interface CoinFlipTieBreakStep {
  readonly position: number;
  readonly upperExclusive: number;
  readonly attempts: readonly CoinFlipAttempt[];
  readonly selectedIndex: number;
}

export interface SetupMatchState extends CombatMatchState {
  readonly schemaVersion: typeof MATCH_SCHEMA_VERSION;
  readonly rulesVersion: string;
  readonly matchId: string;
  readonly phase: "setup";
  readonly sequence: number;
  readonly characters: readonly MatchCharacter[];
  readonly initiative: readonly InitiativeEntry[] | null;
}

export interface ActiveMatchState extends CombatMatchState {
  readonly schemaVersion: typeof MATCH_SCHEMA_VERSION;
  readonly rulesVersion: string;
  readonly matchId: string;
  readonly phase: "active";
  readonly sequence: number;
  readonly characters: readonly MatchCharacter[];
  readonly initiative: readonly InitiativeEntry[];
  readonly round: number;
  readonly activeSlot: number;
}

export interface EndedMatchState extends CombatMatchState {
  readonly schemaVersion: typeof MATCH_SCHEMA_VERSION;
  readonly rulesVersion: string;
  readonly matchId: string;
  readonly phase: "ended";
  readonly sequence: number;
  readonly characters: readonly MatchCharacter[];
  readonly initiative: readonly InitiativeEntry[];
  readonly round: number;
  readonly activeSlot: number;
  readonly outcome: Exclude<MatchOutcome, null>;
  readonly endedAt: string;
  readonly endedSequence: number;
  readonly decisionBasis?: DecisionBasis;
  readonly finalCounts?: FinalTeamCounts;
  readonly finalHpTotals?: FinalTeamCounts;
  readonly coinFlipResult?: "Drow" | "Duergar";
}

export type MatchState = SetupMatchState | ActiveMatchState | EndedMatchState;

export type LegacySetupMatchState = Omit<
  SetupMatchState,
  | "schemaVersion"
  | "spentReactionIds"
  | "majorActionUsed"
  | "eliminatedTeams"
  | "acknowledgedEliminations"
  | "outcome"
> & { readonly schemaVersion: typeof LEGACY_MATCH_SCHEMA_VERSION };
export type LegacyActiveMatchState = Omit<
  ActiveMatchState,
  | "schemaVersion"
  | "spentReactionIds"
  | "majorActionUsed"
  | "eliminatedTeams"
  | "acknowledgedEliminations"
  | "outcome"
> & { readonly schemaVersion: typeof LEGACY_MATCH_SCHEMA_VERSION };
export type LegacyMatchState = LegacySetupMatchState | LegacyActiveMatchState;

interface EventBase {
  readonly matchId: string;
  readonly sequence: number;
  readonly rulesVersion: string;
  readonly occurredAt: string;
}

export interface SetupCreatedEvent extends EventBase {
  readonly type: "SetupCreated";
}

export interface InitiativeEvent extends EventBase {
  readonly type: "InitiativeGenerated" | "InitiativeRerolled";
  readonly results: readonly InitiativeEntry[];
  readonly tieOrder: readonly TieOrder[];
}

export interface MatchStartedEvent extends EventBase {
  readonly type: "MatchStarted";
  readonly round: 1;
  readonly activeSlot: 1;
}

export interface TurnFinishedEvent extends EventBase {
  readonly type: "TurnFinished";
  readonly fromRound: number;
  readonly fromSlot: number;
  readonly round: number;
  readonly activeSlot: number;
  readonly skippedSlots: readonly number[];
  readonly expiredEffects?: readonly ActiveEffect[];
}

export interface EliminationContinuedEvent extends EventBase {
  readonly type: "EliminationContinued";
  readonly eliminatedTeam: "Drow" | "Duergar";
  readonly outcome: "Drow" | "Duergar";
}

export interface SimultaneousEliminationRuledEvent extends EventBase {
  readonly type: "SimultaneousEliminationRuled";
  readonly eliminatedTeams: readonly ["Drow", "Duergar"];
  readonly outcome: Exclude<MatchOutcome, null>;
  readonly overrideEvidence: string;
}

export type DecisionBasis =
  "elimination" | "activeCount" | "activeHpTotal" | "coinFlip";

export interface FinalTeamCounts {
  readonly Drow: number;
  readonly Duergar: number;
}

export interface EndGamePreview {
  readonly outcome: Exclude<MatchOutcome, null>;
  readonly decisionBasis: DecisionBasis;
  readonly finalCounts: FinalTeamCounts;
  readonly finalHpTotals: FinalTeamCounts;
  readonly coinFlipResult?: "Drow" | "Duergar";
}

export interface MatchSummary {
  readonly outcome: Exclude<MatchOutcome, null>;
  readonly decisionBasis: DecisionBasis;
  readonly finalCounts: FinalTeamCounts;
  readonly finalHpTotals: FinalTeamCounts;
  readonly rulesVersion: string;
  readonly endedAt: string;
  readonly coinFlipResult?: "Drow" | "Duergar";
}

export interface MatchEndedEvent extends EventBase {
  readonly type: "MatchEnded";
  readonly outcome: Exclude<MatchOutcome, null>;
  readonly eliminatedTeams: readonly ("Drow" | "Duergar")[];
  readonly decisionBasis?: DecisionBasis;
  readonly finalCounts?: FinalTeamCounts;
  readonly finalHpTotals?: FinalTeamCounts;
  readonly coinFlipResult?: "Drow" | "Duergar";
}

export interface MatchReopenedEvent extends EventBase {
  readonly type: "MatchReopened";
  readonly endedSequence: number;
}

export interface MatchMigratedEvent extends EventBase {
  readonly type: "MatchMigrated";
  readonly fromSchemaVersion: typeof LEGACY_MATCH_SCHEMA_VERSION;
  readonly toSchemaVersion: typeof MATCH_SCHEMA_VERSION;
}

export interface PhysicalConfirmations {
  readonly range: true;
  readonly lineOfSight: true;
  readonly legalBottleContact: true;
  readonly terrainContact: true;
}

export interface AttackLeg {
  readonly sequence: number;
  readonly kind: "initial" | "redirected";
  readonly sourceCharacterId: string;
  readonly attackId: string;
  readonly rangePaces: 2 | 6;
  readonly redirectedByReactionId: string | null;
  readonly towardCharacterId: string | null;
  readonly affectedCharacterIds: readonly string[];
}

export interface ActionEffect {
  readonly characterId: string;
  readonly damage: 0 | 1;
  readonly hpBefore: number;
  readonly hpAfter: number;
  readonly downedBefore: boolean;
  readonly downedAfter: boolean;
}

export type ProtectiveReactionOperation =
  | {
      readonly type: "prevent-damage-and-effects";
      readonly characterId: string;
    }
  | {
      readonly type: "manual-movement";
      readonly characterId: string;
      readonly maxPaces: 2;
      readonly instruction: string;
    }
  | {
      readonly type: "redirect-physical-attack";
      readonly fromCharacterId: string;
      readonly towardCharacterId: string;
    };

export interface ProtectiveReactionResolution {
  readonly reactionId: string;
  readonly ownerCharacterId: string;
  readonly protectedCharacterId: string;
  readonly warnings: readonly string[];
  readonly override: string | null;
  readonly operations: readonly ProtectiveReactionOperation[];
}

export interface ProtectiveReactionInput {
  readonly reactionId: string;
  readonly protectedCharacterId: string;
  readonly override: string | null;
}

export interface ProtectiveReactionChoice {
  readonly reactionId: string;
  readonly ownerCharacterId: string;
  readonly protectedCharacterId: string;
  readonly eligible: boolean;
  readonly warnings: readonly string[];
}

export interface ActionResolvedEvent extends EventBase {
  readonly type: "ActionResolved";
  readonly actionType: "Basic Attack" | "Ability";
  readonly sourceCharacterId: string;
  readonly attackId: string;
  readonly attackType: "melee" | "ranged" | "ability";
  readonly rangePaces: 2 | 6;
  readonly damage: 1;
  readonly rulesSourceAnchor: string;
  readonly attackLegs: readonly AttackLeg[];
  readonly physicalConfirmations: PhysicalConfirmations;
  readonly reactions: readonly ProtectiveReactionResolution[];
  readonly effects: readonly ActionEffect[];
  readonly majorActionOverride: string | null;
  readonly eliminatedTeams: readonly ("Drow" | "Duergar")[];
  readonly abilityId?: string;
  readonly targetCharacterIds?: readonly string[];
  readonly spentAbilityIds?: readonly string[];
  readonly appliedEffects?: readonly ActiveEffect[];
  readonly expiredEffects?: readonly ActiveEffect[];
}

export interface BasicAttackInput {
  readonly sourceCharacterId: string;
  readonly affectedCharacterIds?: readonly string[];
  readonly attackLegs?: readonly Readonly<{
    affectedCharacterIds: readonly string[];
  }>[];
  readonly physicalConfirmations: Readonly<{
    range: boolean;
    lineOfSight: boolean;
    legalBottleContact: boolean;
    terrainContact: boolean;
  }>;
  readonly reactions?: readonly ProtectiveReactionInput[];
  readonly majorActionOverride: string | null;
}

export type ReversibleMatchEvent =
  | InitiativeEvent
  | MatchStartedEvent
  | TurnFinishedEvent
  | ActionResolvedEvent
  | EliminationContinuedEvent
  | SimultaneousEliminationRuledEvent
  | MatchReopenedEvent;

export interface UndoAppliedEvent extends EventBase {
  readonly type: "UndoApplied";
  readonly targetSequence: number;
  readonly targetType: ReversibleMatchEvent["type"];
}

export type MatchEvent =
  | SetupCreatedEvent
  | InitiativeEvent
  | MatchStartedEvent
  | TurnFinishedEvent
  | ActionResolvedEvent
  | EliminationContinuedEvent
  | SimultaneousEliminationRuledEvent
  | MatchEndedEvent
  | MatchReopenedEvent
  | MatchMigratedEvent
  | UndoAppliedEvent;
export type SetupMatchEvent = SetupCreatedEvent | InitiativeEvent;

export interface CommandResult<
  State extends MatchState = MatchState,
  Event extends MatchEvent = MatchEvent,
> {
  readonly state: State;
  readonly event: Event;
}

export interface UndoPreview {
  readonly target: ReversibleMatchEvent;
  readonly currentState: MatchState;
  readonly restoredState: MatchState;
}

const initialCombatState = Object.freeze({
  spentReactionIds: Object.freeze([]) as readonly string[],
  spentAbilityIds: Object.freeze([]) as readonly string[],
  majorActionUsed: false,
  eliminatedTeams: Object.freeze([]) as readonly ("Drow" | "Duergar")[],
  acknowledgedEliminations: Object.freeze([]) as readonly (
    "Drow" | "Duergar"
  )[],
  outcome: null,
  activeEffects: Object.freeze([]) as readonly ActiveEffect[],
});

const UINT32_RANGE = 0x1_0000_0000;

export const cryptoRandomSource: RandomSource = {
  nextUint32(): number {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    const result = value[0];
    if (result === undefined) {
      throw new Error("Cryptographic randomness did not return a value.");
    }
    return result;
  },
};

function nextBounded(random: RandomSource, upperExclusive: number): number {
  if (!Number.isSafeInteger(upperExclusive) || upperExclusive < 1) {
    throw new Error("The random bound must be a positive safe integer.");
  }
  const limit = Math.floor(UINT32_RANGE / upperExclusive) * upperExclusive;
  let value: number;
  do {
    value = random.nextUint32();
    if (!Number.isInteger(value) || value < 0 || value >= UINT32_RANGE) {
      throw new Error(
        "The random source must return an unsigned 32-bit integer.",
      );
    }
  } while (value >= limit);
  return value % upperExclusive;
}

function drawIndexWithCoinFlips(
  random: RandomSource,
  upperExclusive: number,
): { selectedIndex: number; attempts: CoinFlipAttempt[] } {
  const bitCount = Math.ceil(Math.log2(upperExclusive));
  const attempts: CoinFlipAttempt[] = [];
  for (;;) {
    const flips: DigitalCoinFlipResult[] = [];
    let candidate = 0;
    for (let bit = 0; bit < bitCount; bit += 1) {
      const flip = nextBounded(random, 2) === 1 ? "heads" : "tails";
      flips.push(flip);
      candidate = candidate * 2 + (flip === "heads" ? 1 : 0);
    }
    const accepted = candidate < upperExclusive;
    attempts.push({ flips, candidate, accepted });
    if (accepted) return { selectedIndex: candidate, attempts };
  }
}

function orderByCoinFlips<T>(
  values: readonly T[],
  random: RandomSource,
): { ordered: T[]; steps: CoinFlipTieBreakStep[] } {
  const ordered = [...values];
  const steps: CoinFlipTieBreakStep[] = [];
  for (let position = ordered.length - 1; position > 0; position -= 1) {
    const upperExclusive = position + 1;
    const { selectedIndex, attempts } = drawIndexWithCoinFlips(
      random,
      upperExclusive,
    );
    [ordered[position], ordered[selectedIndex]] = [
      ordered[selectedIndex] as T,
      ordered[position] as T,
    ];
    steps.push({ position, upperExclusive, attempts, selectedIndex });
  }
  return { ordered, steps };
}

function createSetupForRulesVersion(
  matchId: string,
  occurredAt: string,
  rulesVersion: string,
): CommandResult<SetupMatchState, SetupCreatedEvent> {
  if (matchId.length === 0) {
    throw new Error("A Match identifier is required.");
  }
  const state: SetupMatchState = {
    schemaVersion: MATCH_SCHEMA_VERSION,
    rulesVersion,
    matchId,
    phase: "setup",
    sequence: 1,
    characters: RULESET.characters.map(({ id, baseHp }) => ({
      characterId: id,
      hp: baseHp,
      currentMaxHp: baseHp,
    })),
    initiative: null,
    ...initialCombatState,
  };
  return {
    state,
    event: {
      type: "SetupCreated",
      matchId,
      sequence: 1,
      rulesVersion,
      occurredAt,
    },
  };
}

export function createSetup(
  matchId: string,
  occurredAt: string,
): CommandResult<SetupMatchState, SetupCreatedEvent> {
  return createSetupForRulesVersion(matchId, occurredAt, RULES_VERSION);
}

function rollInitiative(
  state: SetupMatchState,
  random: RandomSource,
): { results: InitiativeEntry[]; tieOrder: TieOrder[] } {
  const unsorted = RULESET.characters.map((character) => {
    const roll = nextBounded(random, 20) + 1;
    return {
      characterId: character.id,
      roll,
      modifier: character.initiativeModifier,
      total: roll + character.initiativeModifier,
    };
  });
  const totals = [...new Set(unsorted.map(({ total }) => total))].sort(
    (left, right) => right - left,
  );
  const tieOrder: TieOrder[] = [];
  const ordered = totals.flatMap((total) => {
    const group = unsorted.filter((entry) => entry.total === total);
    const tieBreak =
      group.length > 1
        ? orderByCoinFlips(group, random)
        : { ordered: group, steps: [] };
    if (group.length > 1) {
      tieOrder.push({
        total,
        initialCharacterIds: group.map(({ characterId }) => characterId),
        steps: tieBreak.steps,
        characterIds: tieBreak.ordered.map(({ characterId }) => characterId),
      });
    }
    return tieBreak.ordered;
  });
  const results = ordered.map((entry, index) => ({
    ...entry,
    slot: index + 1,
  }));

  if (state.characters.length !== RULESET.characters.length) {
    throw new Error("The Setup roster is incomplete.");
  }
  return { results, tieOrder };
}

function initiativeCommand(
  state: SetupMatchState,
  random: RandomSource,
  occurredAt: string,
  type: InitiativeEvent["type"],
): CommandResult<SetupMatchState, InitiativeEvent> {
  const { results, tieOrder } = rollInitiative(state, random);
  const sequence = state.sequence + 1;
  const nextState: SetupMatchState = {
    ...state,
    sequence,
    initiative: results,
  };
  return {
    state: nextState,
    event: {
      type,
      matchId: state.matchId,
      sequence,
      rulesVersion: state.rulesVersion,
      occurredAt,
      results,
      tieOrder,
    },
  };
}

export function generateInitiative(
  state: SetupMatchState,
  random: RandomSource,
  occurredAt: string,
): CommandResult<SetupMatchState, InitiativeEvent> {
  if (state.initiative !== null) {
    throw new Error(
      "Initiative already exists. Use the confirmed reroll command.",
    );
  }
  return initiativeCommand(state, random, occurredAt, "InitiativeGenerated");
}

export function rerollInitiative(
  state: SetupMatchState,
  random: RandomSource,
  occurredAt: string,
  confirmed: boolean,
): CommandResult<SetupMatchState, InitiativeEvent> {
  if (!confirmed) {
    throw new Error("Reroll confirmation is required.");
  }
  if (state.initiative === null) {
    throw new Error("Initiative must exist before a reroll.");
  }
  return initiativeCommand(state, random, occurredAt, "InitiativeRerolled");
}

export function startMatch(
  state: SetupMatchState,
  occurredAt: string,
): CommandResult<ActiveMatchState, MatchStartedEvent> {
  const characterIds = new Set(
    state.initiative?.map(({ characterId }) => characterId),
  );
  if (
    state.initiative?.length !== RULESET.characters.length ||
    characterIds.size !== RULESET.characters.length ||
    state.initiative.some(
      (entry, index) =>
        entry.slot !== index + 1 ||
        !RULESET.characters.some(({ id }) => id === entry.characterId),
    )
  ) {
    throw new Error("A complete 12-slot initiative result is required.");
  }
  const sequence = state.sequence + 1;
  return {
    state: {
      ...state,
      phase: "active",
      sequence,
      initiative: state.initiative,
      round: 1,
      activeSlot: 1,
    },
    event: {
      type: "MatchStarted",
      matchId: state.matchId,
      sequence,
      rulesVersion: state.rulesVersion,
      occurredAt,
      round: 1,
      activeSlot: 1,
    },
  };
}

export function finishTurn(
  state: ActiveMatchState,
  occurredAt: string,
): CommandResult<ActiveMatchState, TurnFinishedEvent> {
  if ((state as MatchState).phase === "ended") {
    throw new Error("The Ended Match is read-only.");
  }
  const sequence = state.sequence + 1;
  const hpByCharacter = new Map(
    state.characters.map(({ characterId, hp }) => [characterId, hp]),
  );
  const eliminatedTeams = new Set(state.eliminatedTeams);
  const skippedSlots: number[] = [];
  let activeSlot = state.activeSlot;
  let round = state.round;
  for (let checked = 0; checked < state.initiative.length; checked += 1) {
    if (activeSlot === state.initiative.length) {
      activeSlot = 1;
      round += 1;
    } else {
      activeSlot += 1;
    }
    const entry = state.initiative[activeSlot - 1];
    const character = RULESET.characters.find(
      ({ id }) => id === entry?.characterId,
    );
    if (
      entry &&
      character &&
      hpByCharacter.get(entry.characterId) !== 0 &&
      !eliminatedTeams.has(character.team)
    ) {
      break;
    }
    skippedSlots.push(activeSlot);
  }
  if (skippedSlots.length === state.initiative.length) {
    throw new Error("Finish Turn needs one non-Downed character.");
  }
  // Expiry handling for scheduled and turn boundaries
  const slotToCharacter = new Map<number, string>(
    state.initiative.map((entry) => [entry.slot, entry.characterId]),
  );
  const pathSlots = [...skippedSlots, activeSlot];
  const fromSlotValue = state.activeSlot;
  const pendingExpired: ActiveEffect[] = [];
  const remaining: ActiveEffect[] = [];
  for (const effect of state.activeEffects) {
    const trigger = effect.duration.boundaryTrigger;
    const anchorId =
      effect.duration.anchor === "source"
        ? effect.anchorCharacterId
        : effect.affectedCharacterId;
    const anchorSlot = [...slotToCharacter.entries()].find(([, characterId]) => characterId === anchorId)?.[0];
    if (!trigger) {
      remaining.push(effect);
      continue;
    }
    if (trigger === "beginning-of-next-turn" && effect.duration.anchor === "affected") {
      const affectedSlot = [...slotToCharacter.entries()].find(([, characterId]) => characterId === effect.affectedCharacterId)?.[0];
      if (affectedSlot === activeSlot) {
        pendingExpired.push(effect);
        continue;
      }
    }
    if (trigger === "end-of-next-turn" && effect.duration.anchor === "affected") {
      const affectedSlot = [...slotToCharacter.entries()].find(([, characterId]) => characterId === effect.affectedCharacterId)?.[0];
      if (affectedSlot === fromSlotValue) {
        pendingExpired.push(effect);
        continue;
      }
    }
    if (
      (trigger === "beginning-of-next-scheduled-slot" || trigger === "end-of-next-scheduled-slot") &&
      effect.duration.anchor === "source"
    ) {
      if (anchorSlot !== undefined && pathSlots.includes(anchorSlot)) {
        pendingExpired.push(effect);
        continue;
      }
    }
    remaining.push(effect);
  }
  // Downed cleanup after expiry (if any character is Downed, remove its effects)
  const downedCleanup = applyDownedCleanup(state.characters, remaining);
  const finalActiveEffects = downedCleanup.cleaned;
  pendingExpired.push(...downedCleanup.expired);
  // Handle while-condition shapeshift expiry that may have been triggered by previous HP changes but also need to revert maxHP
  let finalCharacters = state.characters;
  // If any shapeshift expired, revert maxHP to 3 (as in resolveAbility)
  for (const expired of pendingExpired) {
    if (expired.kind === "shapeshift") {
      finalCharacters = finalCharacters.map((character) =>
        character.characterId === expired.affectedCharacterId
          ? { ...character, currentMaxHp: 3, hp: Math.min(character.hp, 3) }
          : character,
      );
    }
  }
  return {
    state: {
      ...state,
      sequence,
      round,
      activeSlot,
      majorActionUsed: false,
      characters: finalCharacters,
      activeEffects: finalActiveEffects,
    },
    event: {
      type: "TurnFinished",
      matchId: state.matchId,
      sequence,
      rulesVersion: state.rulesVersion,
      occurredAt,
      fromRound: state.round,
      fromSlot: state.activeSlot,
      round,
      activeSlot,
      skippedSlots,
      ...(pendingExpired.length > 0 ? { expiredEffects: pendingExpired } : {}),
    },
  };
}

export function acknowledgeElimination(
  state: ActiveMatchState,
  eliminatedTeam: "Drow" | "Duergar",
  occurredAt: string,
): CommandResult<ActiveMatchState, EliminationContinuedEvent> {
  if ((state as MatchState).phase === "ended") {
    throw new Error("The Ended Match is read-only.");
  }
  if (
    state.eliminatedTeams.length !== 1 ||
    state.eliminatedTeams[0] !== eliminatedTeam ||
    state.outcome === null ||
    state.outcome === "draw"
  ) {
    throw new Error("Continue needs one normal Team Elimination.");
  }
  if (state.acknowledgedEliminations.includes(eliminatedTeam)) {
    throw new Error("This Team Elimination is already acknowledged.");
  }
  const sequence = state.sequence + 1;
  return {
    state: {
      ...state,
      sequence,
      acknowledgedEliminations: [
        ...state.acknowledgedEliminations,
        eliminatedTeam,
      ],
    },
    event: {
      type: "EliminationContinued",
      matchId: state.matchId,
      sequence,
      rulesVersion: state.rulesVersion,
      occurredAt,
      eliminatedTeam,
      outcome: state.outcome,
    },
  };
}

export function ruleSimultaneousElimination(
  state: ActiveMatchState,
  outcome: Exclude<MatchOutcome, null>,
  overrideEvidence: string,
  occurredAt: string,
): CommandResult<ActiveMatchState, SimultaneousEliminationRuledEvent> {
  if ((state as MatchState).phase === "ended") {
    throw new Error("The Ended Match is read-only.");
  }
  if (
    (outcome !== "Drow" && outcome !== "Duergar" && outcome !== "draw") ||
    state.eliminatedTeams.length !== 2 ||
    !state.eliminatedTeams.includes("Drow") ||
    !state.eliminatedTeams.includes("Duergar") ||
    state.outcome !== null
  ) {
    throw new Error(
      "A simultaneous-elimination ruling needs both teams eliminated and no existing outcome.",
    );
  }
  if (overrideEvidence.trim().length === 0) {
    throw new Error(
      "A simultaneous-elimination ruling needs override evidence.",
    );
  }
  const sequence = state.sequence + 1;
  const eliminatedTeams = ["Drow", "Duergar"] as const;
  return {
    state: { ...state, sequence, outcome },
    event: {
      type: "SimultaneousEliminationRuled",
      matchId: state.matchId,
      sequence,
      rulesVersion: state.rulesVersion,
      occurredAt,
      eliminatedTeams,
      outcome,
      overrideEvidence,
    },
  };
}

function teamOfCharacter(characterId: string): "Drow" | "Duergar" {
  const character = RULESET.characters.find(({ id }) => id === characterId);
  if (!character) throw new Error("The Match references an unknown character.");
  return character.team;
}

function computeFinalTallies(state: ActiveMatchState): {
  finalCounts: FinalTeamCounts;
  finalHpTotals: FinalTeamCounts;
} {
  let drowCount = 0;
  let duergarCount = 0;
  let drowHp = 0;
  let duergarHp = 0;
  for (const { characterId, hp } of state.characters) {
    if (hp === 0) continue;
    const team = teamOfCharacter(characterId);
    if (team === "Drow") {
      drowCount += 1;
      drowHp += hp;
    } else {
      duergarCount += 1;
      duergarHp += hp;
    }
  }
  return {
    finalCounts: { Drow: drowCount, Duergar: duergarCount },
    finalHpTotals: { Drow: drowHp, Duergar: duergarHp },
  };
}

export function getEndGamePreview(
  state: ActiveMatchState,
  random: RandomSource = cryptoRandomSource,
): EndGamePreview {
  const { finalCounts, finalHpTotals } = computeFinalTallies(state);
  if (state.eliminatedTeams.length === 1) {
    const outcome: Exclude<MatchOutcome, null> =
      state.eliminatedTeams[0] === "Drow" ? "Duergar" : "Drow";
    if (state.outcome !== null && state.outcome !== outcome) {
      throw new Error(
        "End Game elimination outcome does not match Match State.",
      );
    }
    return {
      outcome,
      decisionBasis: "elimination",
      finalCounts,
      finalHpTotals,
    };
  }
  if (state.eliminatedTeams.length === 2) {
    if (state.outcome === null) {
      throw new Error("End Game needs a resolved Team Elimination result.");
    }
    const basisOutcome = state.outcome as Exclude<MatchOutcome, null>;
    return {
      outcome: basisOutcome,
      decisionBasis: "elimination",
      finalCounts,
      finalHpTotals,
    };
  }
  if (state.eliminatedTeams.length !== 0) {
    throw new Error("End Game Team Elimination state is invalid.");
  }
  if (finalCounts.Drow !== finalCounts.Duergar) {
    return {
      outcome: finalCounts.Drow > finalCounts.Duergar ? "Drow" : "Duergar",
      decisionBasis: "activeCount",
      finalCounts,
      finalHpTotals,
    };
  }
  if (finalHpTotals.Drow !== finalHpTotals.Duergar) {
    return {
      outcome: finalHpTotals.Drow > finalHpTotals.Duergar ? "Drow" : "Duergar",
      decisionBasis: "activeHpTotal",
      finalCounts,
      finalHpTotals,
    };
  }
  const coinFlipResult = nextBounded(random, 2) === 0 ? "Drow" : "Duergar";
  return {
    outcome: coinFlipResult,
    decisionBasis: "coinFlip",
    finalCounts,
    finalHpTotals,
    coinFlipResult,
  };
}

export function endMatch(
  state: ActiveMatchState,
  occurredAt: string,
  confirmed: boolean,
  random: RandomSource = cryptoRandomSource,
): CommandResult<EndedMatchState, MatchEndedEvent> {
  if (!confirmed) throw new Error("End Game confirmation is required.");
  const preview = getEndGamePreview(state, random);
  const sequence = state.sequence + 1;
  return {
    state: {
      ...state,
      phase: "ended",
      sequence,
      outcome: preview.outcome,
      endedAt: occurredAt,
      endedSequence: sequence,
      decisionBasis: preview.decisionBasis,
      finalCounts: preview.finalCounts,
      finalHpTotals: preview.finalHpTotals,
      ...(preview.coinFlipResult
        ? { coinFlipResult: preview.coinFlipResult }
        : {}),
    },
    event: {
      type: "MatchEnded",
      matchId: state.matchId,
      sequence,
      rulesVersion: state.rulesVersion,
      occurredAt,
      outcome: preview.outcome,
      eliminatedTeams: [...state.eliminatedTeams],
      decisionBasis: preview.decisionBasis,
      finalCounts: preview.finalCounts,
      finalHpTotals: preview.finalHpTotals,
      ...(preview.coinFlipResult
        ? { coinFlipResult: preview.coinFlipResult }
        : {}),
    },
  };
}

export function reopenMatch(
  state: EndedMatchState,
  occurredAt: string,
): CommandResult<ActiveMatchState, MatchReopenedEvent> {
  const sequence = state.sequence + 1;
  const active: ActiveMatchState = {
    schemaVersion: state.schemaVersion,
    rulesVersion: state.rulesVersion,
    matchId: state.matchId,
    phase: "active",
    sequence,
    characters: state.characters,
    initiative: state.initiative,
    round: state.round,
    activeSlot: state.activeSlot,
    spentReactionIds: state.spentReactionIds,
    spentAbilityIds: (state as unknown as ActiveMatchState).spentAbilityIds ?? [],
    majorActionUsed: state.majorActionUsed,
    eliminatedTeams: state.eliminatedTeams,
    acknowledgedEliminations: state.acknowledgedEliminations,
    outcome: null,
    activeEffects: (state as unknown as ActiveMatchState).activeEffects ?? [],
  };
  return {
    state: active,
    event: {
      type: "MatchReopened",
      matchId: state.matchId,
      sequence,
      rulesVersion: state.rulesVersion,
      occurredAt,
      endedSequence: state.endedSequence,
    },
  };
}

const AUTOMATED_REACTION_NAMES = new Set([
  "Divine Shield",
  "Misty Escape",
  "Mirror Veil",
  "Deflecting Palm",
  "Shield Wall",
]);

function protectiveReactionWarnings(
  state: ActiveMatchState,
  reactionId: string,
  protectedCharacterId: string,
): string[] {
  const reaction = RULESET.reactions.find(({ id }) => id === reactionId);
  if (!reaction || !AUTOMATED_REACTION_NAMES.has(reaction.name)) {
    throw new Error("The Action Draft references an unsupported Reaction.");
  }
  const warnings: string[] = [];
  if (state.spentReactionIds.includes(reaction.id)) {
    warnings.push(`${reaction.name} is already spent.`);
  }
  const owner = state.characters.find(
    ({ characterId }) => characterId === reaction.ownerCharacterId,
  );
  if (!owner || owner.hp === 0) {
    warnings.push(`${reaction.name}'s owner is Downed.`);
  }
  if (
    (reaction.name === "Misty Escape" || reaction.name === "Mirror Veil") &&
    protectedCharacterId !== reaction.ownerCharacterId
  ) {
    warnings.push(`${reaction.name} can protect only its owner.`);
  }
  return warnings;
}

export function getProtectiveReactionChoices(
  state: ActiveMatchState,
  affectedCharacterIds: readonly string[],
): ProtectiveReactionChoice[] {
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
              towardCharacterId: input.sourceCharacterId,
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
  const resultingEliminations: ("Drow" | "Duergar")[] = [
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

export interface AbilityInput {
  readonly abilityId: string;
  readonly targetCharacterIds?: readonly string[];
  readonly attackLegs?: readonly Readonly<{ affectedCharacterIds: readonly string[] }>[];
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

function abilityWarnings(
  state: ActiveMatchState,
  abilityId: string,
): string[] {
  const warnings: string[] = [];
  if (state.spentAbilityIds.includes(abilityId)) {
    warnings.push("ability-already-spent");
  }
  return warnings;
}

function getAbilityOrThrow(abilityId: string) {
  const ability = RULESET.abilities.find((entry) => entry.id === abilityId);
  if (!ability) throw new Error("The ability is unknown.");
  return ability;
}

function buildAbilityEffects(
  ability: StructuredAbility,
  affectedIds: readonly string[],
  sequence: number,
  anchorId: string,
): ActiveEffect[] {
  const effects: ActiveEffect[] = [];
  const name = ability.name;
  // Hunter's Mark / Hex (add-damage until next scheduled slot)
  if (name === "Hunter's Mark" || name === "Hex") {
    for (const targetId of affectedIds) {
      effects.push({
        effectId: `${ability.id}-${targetId}-${sequence}`,
        abilityId: ability.id,
        kind: name === "Hunter's Mark" ? "hunters-mark" : "hex",
        anchorCharacterId: anchorId,
        affectedCharacterId: targetId,
        duration: {
          kind: "until-trigger-or-boundary",
          boundaryTrigger: "beginning-of-next-scheduled-slot",
          anchor: "source",
          removeWhenAffectedDowned: true,
        },
        operations: ["add-damage"],
        appliedSequence: sequence,
      });
    }
    return effects;
  }
  if (name === "Rage") {
    effects.push({
      effectId: `${ability.id}-${anchorId}-${sequence}`,
      abilityId: ability.id,
      kind: "rage",
      anchorCharacterId: anchorId,
      affectedCharacterId: anchorId,
      duration: {
        kind: "until-trigger-or-boundary",
        boundaryTrigger: "beginning-of-next-turn",
        anchor: "affected",
        removeWhenAffectedDowned: true,
      },
      operations: ["reduce-remaining-damage"],
      appliedSequence: sequence,
    });
    return effects;
  }
  if (name === "Vanish") {
    effects.push({
      effectId: `${ability.id}-${anchorId}-${sequence}`,
      abilityId: ability.id,
      kind: "vanish",
      anchorCharacterId: anchorId,
      affectedCharacterId: anchorId,
      duration: {
        kind: "until-boundary",
        boundaryTrigger: "beginning-of-next-turn",
        anchor: "affected",
        removeWhenAffectedDowned: true,
      },
      operations: ["ignore-physical-attack"],
      appliedSequence: sequence,
    });
    return effects;
  }
  if (name === "Shapeshift") {
    effects.push({
      effectId: `${ability.id}-${anchorId}-${sequence}`,
      abilityId: ability.id,
      kind: "shapeshift",
      anchorCharacterId: anchorId,
      affectedCharacterId: anchorId,
      duration: {
        kind: "while-condition",
        anchor: "affected",
        removeWhenAffectedDowned: true,
      },
      operations: ["change-max-hp"],
      appliedSequence: sequence,
    });
    return effects;
  }
  // Physical prohibit effects
  if (name === "Backstab" || name === "Stunning Strike") {
    for (const targetId of affectedIds) {
      effects.push({
        effectId: `${ability.id}-${targetId}-${sequence}`,
        abilityId: ability.id,
        kind: "prohibit-powerful",
        anchorCharacterId: anchorId,
        affectedCharacterId: targetId,
        duration: {
          kind: "until-boundary",
          boundaryTrigger: "end-of-next-turn",
          anchor: "affected",
          removeWhenAffectedDowned: true,
        },
        operations: ["prohibit-action-type"],
        appliedSequence: sequence,
      });
    }
    return effects;
  }
  // Movement caps
  if (name === "Frostbind" || name === "Battle Hymn" || name === "Blessing of Battle" || name === "Hex") {
    // Hex movement is handled via consumption, not initial
    if (name !== "Hex") {
      for (const targetId of affectedIds) {
        effects.push({
          effectId: `${ability.id}-${targetId}-${sequence}`,
          abilityId: ability.id,
          kind: "movement-cap",
          anchorCharacterId: anchorId,
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
      return effects;
    }
  }
  return effects;
}

function applyDownedCleanup(
  characters: readonly MatchCharacter[],
  effects: readonly ActiveEffect[],
): { cleaned: readonly ActiveEffect[]; expired: readonly ActiveEffect[] } {
  const downedIds = new Set(
    characters.filter((character) => character.hp === 0).map((character) => character.characterId),
  );
  const kept: ActiveEffect[] = [];
  const expired: ActiveEffect[] = [];
  for (const effect of effects) {
    if (effect.duration.removeWhenAffectedDowned && downedIds.has(effect.affectedCharacterId)) {
      expired.push(effect);
    } else {
      kept.push(effect);
    }
  }
  return { cleaned: kept, expired };
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
  const sourceCharacter = state.characters.find(({ characterId }) => characterId === ability.ownerCharacterId);
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
    const targetChar = state.characters.find((character) => character.characterId === targetId);
    if (!targetChar) throw new Error("The ability references an unknown target.");
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
    if (!confirmations || Object.values(confirmations).some((value) => value !== true)) {
      throw new Error("Every manual physical confirmation is required.");
    }
    const flat = attackLegsInput.flatMap(({ affectedCharacterIds }) => affectedCharacterIds);
    if (flat.length === 0) throw new Error("A physical ability needs at least one affected character.");
    if (new Set(flat).size !== flat.length) throw new Error("Basic Attack contacts must be unique.");
    for (const characterId of flat) {
      if (!state.characters.some((character) => character.characterId === characterId)) {
        throw new Error("Physical ability references an unknown affected character.");
      }
    }
    // Deflecting Palm handling for physical ability (reuse)
    const selectedReactions = input.reactions ?? [];
    const redirectReaction = selectedReactions.find((selection) => {
      const reaction = RULESET.reactions.find(({ id }) => id === selection.reactionId);
      return reaction?.name === "Deflecting Palm";
    });
    if (redirectReaction && attackLegsInput.length !== 2) {
      throw new Error("Deflecting Palm needs exactly one redirected Attack Leg.");
    }
    if (!redirectReaction && attackLegsInput.length !== 1) {
      throw new Error("A redirected Attack Leg needs Deflecting Palm.");
    }
    affectedCharacterIds = flat;
  } else if (ability.interaction === "self") {
    affectedCharacterIds = [ability.ownerCharacterId];
  } else if (ability.interaction === "ally" || ability.interaction === "enemy" || ability.interaction === "utility") {
    // For utility: use provided targetCharacterIds or default to self for self-targeting heals
    if (targetIds.length === 0) {
      // Some utilities are self (Second Wind, Rage) – default to owner
      if (ability.name === "Second Wind" || ability.name === "Rage" || ability.name === "Vanish" || ability.name === "Shapeshift") {
        affectedCharacterIds = [ability.ownerCharacterId];
      } else {
        throw new Error("Utility ability needs target selection.");
      }
    } else {
      // Validate each target relation and lifeState
      for (const targetId of targetIds) {
        const targetChar = state.characters.find((character) => character.characterId === targetId);
        if (!targetChar) throw new Error("Utility ability references unknown target.");
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
        if (ability.targetPolicy.lifeState === "active" && targetChar.hp === 0) {
          const override = abilityOverride;
          if (override === null) throw new Error("invalid-target-life-state");
        }
        if (ability.targetPolicy.lifeState === "downed" && targetChar.hp !== 0) {
          const override = abilityOverride;
          if (override === null) throw new Error("invalid-target-life-state");
        }
      }
      affectedCharacterIds = [...targetIds];
    }
    // Specific guards: Revivify and Lay on Hands revive blocked when team eliminated
    if ((ability.name === "Revivify" || ability.name === "Lay on Hands") && targetIds.some((targetId) => {
      const targetChar = state.characters.find((character) => character.characterId === targetId);
      return targetChar?.hp === 0;
    })) {
      for (const targetId of targetIds) {
        const targetChar = state.characters.find((character) => character.characterId === targetId);
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
    const reaction = RULESET.reactions.find(({ id }) => id === selection.reactionId);
    if (!reaction || !AUTOMATED_REACTION_NAMES.has(reaction.name)) {
      throw new Error("The Action Draft references an unsupported Reaction.");
    }
    if (!affectedCharacterIds.includes(selection.protectedCharacterId)) {
      throw new Error("A Reaction can protect only an affected character.");
    }
    if (reactionOwners.has(reaction.ownerCharacterId)) {
      throw new Error("One character cannot use two Reactions against one attack.");
    }
    reactionOwners.add(reaction.ownerCharacterId);
    const warnings = protectiveReactionWarnings(state, reaction.id, selection.protectedCharacterId);
    const reactionOverride = selection.override?.trim() || null;
    if (warnings.length > 0 && reactionOverride === null) {
      throw new Error("A state-invalid Reaction needs a recorded Override.");
    }
    const operations = reaction.operations.flatMap((operation): ProtectiveReactionOperation[] => {
      if (operation.type === "prevent-damage-and-effects") {
        return [{ type: operation.type, characterId: selection.protectedCharacterId }];
      }
      if (operation.type === "manual-movement") {
        return [{ type: operation.type, characterId: reaction.ownerCharacterId, maxPaces: operation.maxPaces, instruction: `Move ${reaction.name}'s owner up to ${operation.maxPaces} paces immediately.` }];
      }
      if (operation.type === "redirect-physical-attack") {
        return [{ type: operation.type, fromCharacterId: reaction.ownerCharacterId, towardCharacterId: ability.ownerCharacterId }];
      }
      return [];
    });
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
  const pendingAppliedEffects: ActiveEffect[] = buildAbilityEffects(ability, affectedCharacterIds, sequence, ability.ownerCharacterId);
  const pendingExpired: ActiveEffect[] = [];

  // Handle operation types that affect HP or maxHP directly
  const abilityName = ability.name;

  // Helper to apply heal
  const healTarget = (targetId: string) => {
    const idx = characters.findIndex((character) => character.characterId === targetId);
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
    const idx = characters.findIndex((character) => character.characterId === targetId);
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
  if (ability.interaction === "targeted-attack" || ability.interaction === "physical-attack") {
    const protectedIds = new Set(
      reactions.flatMap(({ operations }) =>
        operations.flatMap((operation) => (operation.type === "prevent-damage-and-effects" ? [operation.characterId] : [])),
      ),
    );
    // Check Vanish ignore
    const vanishProtected = new Set(
      state.activeEffects
        .filter((effect) => effect.operations.includes("ignore-physical-attack"))
        .map((effect) => effect.affectedCharacterId),
    );
    const baseDamage = 1;
    // Build base effects with final damage after prevention and ignore
    for (const targetId of affectedCharacterIds) {
      const character = characters.find((candidate) => candidate.characterId === targetId);
      if (!character) throw new Error("Ability references unknown character.");
      let damage: 0 | 1 = baseDamage as 0 | 1;
      if (protectedIds.has(targetId)) damage = 0;
      // Vanish ignores physical-ball damage (physical attacks only)
      if (ability.interaction === "physical-attack" && vanishProtected.has(targetId)) {
        damage = 0;
      }
      // Rage reduction: if target has rage and damage positive, reduce by 1 then consume rage
      const rageEffect = state.activeEffects.find(
        (effect) => effect.kind === "rage" && effect.affectedCharacterId === targetId,
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
      const idx = characters.findIndex((candidate) => candidate.characterId === targetId);
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
    if (abilityName === "Nature's Renewal" || abilityName === "Inspiring Words" || abilityName === "Second Wind") {
      for (const targetId of affectedCharacterIds) {
        healTarget(targetId);
      }
    } else if (abilityName === "Lay on Hands") {
      for (const targetId of affectedCharacterIds) {
        const targetChar = state.characters.find((character) => character.characterId === targetId);
        if (targetChar?.hp === 0) reviveTarget(targetId);
        else healTarget(targetId);
      }
    } else if (abilityName === "Revivify") {
      for (const targetId of affectedCharacterIds) reviveTarget(targetId);
    } else if (abilityName === "Shapeshift") {
      // change-max-hp to 4 and heal 1
      for (const targetId of affectedCharacterIds) {
        const idx = characters.findIndex((character) => character.characterId === targetId);
        const character = characters[idx]!;
        const before = character.hp;
        const withMax = { ...character, currentMaxHp: 4, hp: Math.min(4, character.hp + 1) };
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
    } else if (abilityName === "Vanish" || abilityName === "Misty Escape" || abilityName === "Deflecting Palm" || abilityName === "Divine Shield" || abilityName === "Shield Wall" || abilityName === "Mirror Veil") {
      // Vanish handled as effect; others are reactions not direct abilities. No HP change.
      // Push empty effect per target for audit?
      for (const targetId of affectedCharacterIds) {
        const character = characters.find((candidate) => candidate.characterId === targetId)!;
        effects.push({
          characterId: targetId,
          damage: 0,
          hpBefore: character.hp,
          hpAfter: character.hp,
          downedBefore: character.hp === 0,
          downedAfter: character.hp === 0,
        });
      }
    } else if (abilityName === "Frostbind" || abilityName === "Battle Hymn" || abilityName === "Blessing of Battle") {
      for (const targetId of affectedCharacterIds) {
        const character = characters.find((candidate) => candidate.characterId === targetId)!;
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
        const character = characters.find((candidate) => candidate.characterId === targetId)!;
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
        const character = characters.find((candidate) => candidate.characterId === targetId)!;
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
        const character = characters.find((candidate) => candidate.characterId === targetId)!;
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
      const affected = characters.find((character) => character.characterId === effect.affectedCharacterId);
      if (affected && (affected.hp < 3 || affected.hp === 0)) {
        shapeshiftExpiries.push(effect);
        // Also revert maxHP to 3
        const idx = characters.findIndex((character) => character.characterId === effect.affectedCharacterId);
        if (idx >= 0) {
          const before = characters[idx]!;
          characters[idx] = { ...before, currentMaxHp: 3, hp: Math.min(before.hp, 3) };
          // Adjust effects hpAfter if changed? Keep original effects but maxHP change is expiry side effect.
        }
      }
    }
  }
  pendingExpired.push(...shapeshiftExpiries);

  // Downed cleanup after HP changes and immediate expiries
  const combinedEffects = [...state.activeEffects, ...pendingAppliedEffects].filter(
    (effect) => !pendingExpired.some((expired) => expired.effectId === effect.effectId),
  );
  const downedCleanup = applyDownedCleanup(characters, combinedEffects);
  const finalActiveEffects = downedCleanup.cleaned;
  pendingExpired.push(...downedCleanup.expired);

  // Deduplicate expired
  const uniqueExpired = [...new Map(pendingExpired.map((effect) => [effect.effectId, effect])).values()];

  // Eliminations
  const eliminatedTeams = (["Drow", "Duergar"] as const).filter((team) =>
    RULESET.characters
      .filter((character) => character.team === team)
      .every((character) => characters.find(({ characterId }) => characterId === character.id)?.hp === 0),
  );
  const resultingEliminations: ("Drow" | "Duergar")[] = [...new Set([...state.eliminatedTeams, ...eliminatedTeams])];
  const outcome: MatchOutcome =
    resultingEliminations.length === 1
      ? resultingEliminations[0] === "Drow"
        ? "Duergar"
        : "Drow"
      : null;

  // Build attackLegs for event
  let attackLegs: AttackLeg[];
  if (ability.interaction === "targeted-attack" || ability.interaction === "physical-attack") {
    const inputLegs = attackLegsInput ?? [{ affectedCharacterIds: affectedCharacterIds }];
    attackLegs = inputLegs.map((leg, index) => ({
      sequence: index + 1,
      kind: index === 0 ? "initial" : "redirected",
      sourceCharacterId: ability.ownerCharacterId,
      attackId: ability.id,
      rangePaces: (ability.range.includes("6") ? 6 : 2) as 2 | 6,
      redirectedByReactionId: index === 0 ? null : (reactions[0]?.reactionId ?? null),
      towardCharacterId: index === 0 ? null : (reactions[0]?.ownerCharacterId ? ability.ownerCharacterId : null),
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
    physicalConfirmations: ability.interaction === "physical-attack"
      ? { range: true, lineOfSight: true, legalBottleContact: true, terrainContact: true }
      : { range: true, lineOfSight: true, legalBottleContact: true, terrainContact: true },
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
      spentReactionIds: [...new Set([...state.spentReactionIds, ...reactions.map(({ reactionId }) => reactionId)])],
      characters,
      eliminatedTeams: resultingEliminations,
      outcome,
      activeEffects: finalActiveEffects,
    },
  };
}

function applyHistoricalActionResolution(
  state: ActiveMatchState,
  event: ActionResolvedEvent,
): ActiveMatchState {
  if (event.rulesVersion !== state.rulesVersion) {
    throw new Error(
      "The Action Resolution rules version does not follow Match State.",
    );
  }
  if (event.actionType !== "Basic Attack" && event.actionType !== "Ability") {
    throw new Error("The historical Action Resolution is unsupported.");
  }
  const activeCharacterId = state.initiative[state.activeSlot - 1]?.characterId;
  if (event.sourceCharacterId !== activeCharacterId) {
    throw new Error("The Action Resolution source is not active.");
  }
  if (state.majorActionUsed && event.majorActionOverride === null) {
    throw new Error("A second Basic Attack needs a recorded referee override.");
  }
  const affected = new Set<string>();
  for (const leg of event.attackLegs) {
    for (const characterId of leg.affectedCharacterIds) {
      if (affected.has(characterId)) {
        throw new Error("The Action Resolution contacts must be unique.");
      }
      affected.add(characterId);
    }
  }
  for (const effect of event.effects) {
    if (!affected.has(effect.characterId)) {
      throw new Error("The Action Resolution effect references no contact.");
    }
    const character = state.characters.find(
      ({ characterId }) => characterId === effect.characterId,
    );
    if (!character || character.hp !== effect.hpBefore) {
      throw new Error("The Action Resolution does not follow Match State.");
    }
    if (effect.hpAfter < 0) {
      throw new Error("The Action Resolution damage evidence is invalid.");
    }
    // For abilities, heal can increase HP; allow up to currentMaxHp
    const expectedMax = character.currentMaxHp ?? RULESET.characters.find((rule) => rule.id === character.characterId)?.baseHp ?? 5;
    if (effect.hpAfter > expectedMax) {
      throw new Error("The Action Resolution damage evidence is invalid.");
    }
  }
  if (
    event.eliminatedTeams.some(
      (team) => team !== "Drow" && team !== "Duergar",
    ) ||
    new Set(event.eliminatedTeams).size !== event.eliminatedTeams.length
  ) {
    throw new Error("The Action Resolution eliminations are invalid.");
  }
  // Derive characters with hp and possibly maxHp changes (Shapeshift)
  let characters = state.characters.map((character) => {
    const effect = event.effects.find(
      ({ characterId }) => characterId === character.characterId,
    );
    return effect ? { ...character, hp: effect.hpAfter } : character;
  });
  // Apply maxHp changes inferred from applied/expired effects (Shapeshift)
  if (event.actionType === "Ability" && event.appliedEffects) {
    for (const applied of event.appliedEffects) {
      if (applied.kind === "shapeshift") {
        characters = characters.map((character) =>
          character.characterId === applied.affectedCharacterId
            ? { ...character, currentMaxHp: 4 }
            : character,
        );
      }
    }
  }
  if (event.actionType === "Ability" && event.expiredEffects) {
    for (const expired of event.expiredEffects) {
      if (expired.kind === "shapeshift") {
        characters = characters.map((character) =>
          character.characterId === expired.affectedCharacterId
            ? { ...character, currentMaxHp: 3, hp: Math.min(character.hp, 3) }
            : character,
        );
      }
    }
  }
  const spentAbilityIds =
    event.actionType === "Ability" && event.spentAbilityIds
      ? [...new Set([...state.spentAbilityIds, ...event.spentAbilityIds])]
      : state.spentAbilityIds;
  const appliedEffects = event.appliedEffects ?? [];
  const expiredIds = new Set((event.expiredEffects ?? []).map((effect) => effect.effectId));
  const retained = state.activeEffects.filter((effect) => !expiredIds.has(effect.effectId));
  const nextActiveEffects = [...retained, ...appliedEffects].filter(
    (effect) => !expiredIds.has(effect.effectId),
  );
  return {
    ...state,
    sequence: event.sequence,
    majorActionUsed: true,
    spentReactionIds: [
      ...new Set([
        ...state.spentReactionIds,
        ...event.reactions.map(({ reactionId }) => reactionId),
      ]),
    ],
    spentAbilityIds,
    characters,
    eliminatedTeams: [...event.eliminatedTeams],
    outcome:
      event.eliminatedTeams.length === 1
        ? event.eliminatedTeams[0] === "Drow"
          ? "Duergar"
          : "Drow"
        : null,
    activeEffects: nextActiveEffects,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orderedJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(orderedJsonValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, orderedJsonValue(value[key])]),
    );
  }
  return value;
}

export function canonicalMatchRecordsEqual(
  left: unknown,
  right: unknown,
): boolean {
  return (
    JSON.stringify(orderedJsonValue(left)) ===
    JSON.stringify(orderedJsonValue(right))
  );
}

function assertStringArray(
  value: unknown,
  label: string,
): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === "string")
  ) {
    throw new Error(`The canonical ${label} is structurally invalid.`);
  }
}

/** Shared structural boundary used by domain replay and canonical storage. */
export function assertMatchStateStructure(
  value: unknown,
  schemaVersion?: typeof MATCH_SCHEMA_VERSION,
): asserts value is MatchState;
export function assertMatchStateStructure(
  value: unknown,
  schemaVersion: typeof LEGACY_MATCH_SCHEMA_VERSION,
): asserts value is LegacyMatchState;
export function assertMatchStateStructure(
  value: unknown,
  schemaVersion: number = MATCH_SCHEMA_VERSION,
): void {
  if (
    !isRecord(value) ||
    value.schemaVersion !== schemaVersion ||
    typeof value.rulesVersion !== "string" ||
    value.rulesVersion.length === 0 ||
    typeof value.matchId !== "string" ||
    value.matchId.length === 0 ||
    (value.phase !== "setup" &&
      value.phase !== "active" &&
      value.phase !== "ended") ||
    !Number.isSafeInteger(value.sequence) ||
    (value.sequence as number) < 1
  ) {
    throw new Error("The canonical Match State is structurally invalid.");
  }
  if (
    !Array.isArray(value.characters) ||
    value.characters.length !== RULESET.characters.length
  ) {
    throw new Error("The canonical Match State roster is invalid.");
  }
  value.characters.forEach((entry, index) => {
    const rulesCharacter = RULESET.characters[index];
    if (
      !rulesCharacter ||
      !isRecord(entry) ||
      entry.characterId !== rulesCharacter.id ||
      !Number.isInteger(entry.hp) ||
      (entry.hp as number) < 0
    ) {
      throw new Error("The canonical Match State roster is invalid.");
    }
    const currentMaxHp = (entry as Record<string, unknown>).currentMaxHp as number | undefined;
    const effectiveMax = Number.isInteger(currentMaxHp) ? (currentMaxHp as number) : rulesCharacter.baseHp;
    if (
      (entry.hp as number) > effectiveMax ||
      (currentMaxHp !== undefined &&
        (!Number.isInteger(currentMaxHp) || currentMaxHp < 1 || currentMaxHp > 10))
    ) {
      throw new Error("The canonical Match State roster is invalid.");
    }
  });
  if (value.initiative === null) {
    if (value.phase !== "setup") {
      throw new Error("The Active Match initiative result is incomplete.");
    }
  } else if (
    !Array.isArray(value.initiative) ||
    value.initiative.length !== RULESET.characters.length
  ) {
    throw new Error("The canonical initiative result is structurally invalid.");
  }
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
    throw new Error("The Ended Match state is structurally invalid.");
  }
  if (value.phase === "ended" && schemaVersion === MATCH_SCHEMA_VERSION) {
    const ended = value as unknown as EndedMatchState;
    if (
      ended.decisionBasis !== undefined &&
      ended.decisionBasis !== "elimination" &&
      ended.decisionBasis !== "activeCount" &&
      ended.decisionBasis !== "activeHpTotal" &&
      ended.decisionBasis !== "coinFlip"
    ) {
      throw new Error("The Ended Match decision basis is invalid.");
    }
    if (
      (ended.decisionBasis !== undefined ||
        ended.finalCounts !== undefined ||
        ended.finalHpTotals !== undefined) &&
      (!isRecord(ended.finalCounts) ||
        !Number.isInteger((ended.finalCounts as FinalTeamCounts).Drow) ||
        !Number.isInteger((ended.finalCounts as FinalTeamCounts).Duergar) ||
        (ended.finalCounts as FinalTeamCounts).Drow < 0 ||
        (ended.finalCounts as FinalTeamCounts).Duergar < 0 ||
        !isRecord(ended.finalHpTotals) ||
        !Number.isInteger((ended.finalHpTotals as FinalTeamCounts).Drow) ||
        !Number.isInteger((ended.finalHpTotals as FinalTeamCounts).Duergar) ||
        (ended.finalHpTotals as FinalTeamCounts).Drow < 0 ||
        (ended.finalHpTotals as FinalTeamCounts).Duergar < 0)
    ) {
      throw new Error("The Ended Match final team tallies are invalid.");
    }
    if (
      ended.coinFlipResult !== undefined &&
      ended.coinFlipResult !== "Drow" &&
      ended.coinFlipResult !== "Duergar"
    ) {
      throw new Error("The Ended Match coin flip result is invalid.");
    }
    if (
      ended.decisionBasis === "coinFlip" &&
      ended.coinFlipResult === undefined
    ) {
      throw new Error("The Ended Match coin flip result is invalid.");
    }
    if (
      ended.coinFlipResult !== undefined &&
      ended.decisionBasis !== "coinFlip"
    ) {
      throw new Error("The Ended Match coin flip result is invalid.");
    }
  }
  if (schemaVersion === MATCH_SCHEMA_VERSION) {
    // Backwards compat: older snapshots may lack ability fields
    if (value.spentAbilityIds !== undefined) {
      assertStringArray(value.spentAbilityIds, "spent Abilities");
    }
    if (value.activeEffects !== undefined && !Array.isArray(value.activeEffects)) {
      throw new Error("The canonical active effects are structurally invalid.");
    }
    assertStringArray(value.spentReactionIds, "spent Reactions");
    assertStringArray(value.eliminatedTeams, "Team Elimination state");
    assertStringArray(
      value.acknowledgedEliminations,
      "acknowledged Team Elimination state",
    );
    if (
      typeof value.majorActionUsed !== "boolean" ||
      !value.eliminatedTeams.every(
        (team) => team === "Drow" || team === "Duergar",
      ) ||
      new Set(value.eliminatedTeams).size !== value.eliminatedTeams.length ||
      !value.acknowledgedEliminations.every(
        (team) => team === "Drow" || team === "Duergar",
      ) ||
      (value.outcome !== null &&
        value.outcome !== "Drow" &&
        value.outcome !== "Duergar" &&
        value.outcome !== "draw")
    ) {
      throw new Error("The canonical combat state is structurally invalid.");
    }
  }
}

export function assertMatchSummaryStructure(
  value: unknown,
): asserts value is MatchSummary {
  if (
    !isRecord(value) ||
    (value.outcome !== "Drow" &&
      value.outcome !== "Duergar" &&
      value.outcome !== "draw") ||
    (value.decisionBasis !== "elimination" &&
      value.decisionBasis !== "activeCount" &&
      value.decisionBasis !== "activeHpTotal" &&
      value.decisionBasis !== "coinFlip") ||
    !isRecord(value.finalCounts) ||
    !Number.isInteger((value.finalCounts as unknown as FinalTeamCounts).Drow) ||
    !Number.isInteger(
      (value.finalCounts as unknown as FinalTeamCounts).Duergar,
    ) ||
    (value.finalCounts as unknown as FinalTeamCounts).Drow < 0 ||
    (value.finalCounts as unknown as FinalTeamCounts).Duergar < 0 ||
    !isRecord(value.finalHpTotals) ||
    !Number.isInteger(
      (value.finalHpTotals as unknown as FinalTeamCounts).Drow,
    ) ||
    !Number.isInteger(
      (value.finalHpTotals as unknown as FinalTeamCounts).Duergar,
    ) ||
    (value.finalHpTotals as unknown as FinalTeamCounts).Drow < 0 ||
    (value.finalHpTotals as unknown as FinalTeamCounts).Duergar < 0 ||
    typeof value.rulesVersion !== "string" ||
    value.rulesVersion.length === 0 ||
    typeof value.endedAt !== "string" ||
    value.endedAt.length === 0
  ) {
    throw new Error("The Match Summary is structurally invalid.");
  }
  if (
    value.coinFlipResult !== undefined &&
    value.coinFlipResult !== "Drow" &&
    value.coinFlipResult !== "Duergar"
  ) {
    throw new Error("The Match Summary coin flip result is invalid.");
  }
  if (
    value.decisionBasis === "coinFlip" &&
    value.coinFlipResult === undefined
  ) {
    throw new Error("The Match Summary coin flip result is invalid.");
  }
  if (
    value.coinFlipResult !== undefined &&
    value.decisionBasis !== "coinFlip"
  ) {
    throw new Error("The Match Summary coin flip result is invalid.");
  }
}

export function toMatchSummary(state: EndedMatchState): MatchSummary {
  if (
    state.decisionBasis === undefined ||
    state.finalCounts === undefined ||
    state.finalHpTotals === undefined
  ) {
    throw new Error("The Ended Match does not contain summary fields.");
  }
  const summary: MatchSummary = {
    outcome: state.outcome,
    decisionBasis: state.decisionBasis,
    finalCounts: state.finalCounts,
    finalHpTotals: state.finalHpTotals,
    rulesVersion: state.rulesVersion,
    endedAt: state.endedAt,
    ...(state.coinFlipResult ? { coinFlipResult: state.coinFlipResult } : {}),
  };
  assertMatchSummaryStructure(summary);
  return summary;
}

export function migrateLegacyMatch(
  value: unknown,
  occurredAt: string,
): CommandResult<MatchState, MatchMigratedEvent> {
  assertMatchStateStructure(value, LEGACY_MATCH_SCHEMA_VERSION);
  const legacy = value as LegacyMatchState;
  const sequence = legacy.sequence + 1;
  const state = {
    ...legacy,
    schemaVersion: MATCH_SCHEMA_VERSION,
    sequence,
    ...initialCombatState,
  } as MatchState;
  return {
    state,
    event: {
      type: "MatchMigrated",
      matchId: legacy.matchId,
      sequence,
      rulesVersion: legacy.rulesVersion,
      occurredAt,
      fromSchemaVersion: LEGACY_MATCH_SCHEMA_VERSION,
      toSchemaVersion: MATCH_SCHEMA_VERSION,
    },
  };
}

function isReversibleEvent(event: MatchEvent): event is ReversibleMatchEvent {
  return (
    event.type === "InitiativeGenerated" ||
    event.type === "InitiativeRerolled" ||
    event.type === "MatchStarted" ||
    event.type === "TurnFinished" ||
    event.type === "ActionResolved" ||
    event.type === "EliminationContinued" ||
    event.type === "SimultaneousEliminationRuled" ||
    event.type === "MatchReopened"
  );
}

function findUndoTarget(
  events: readonly MatchEvent[],
): ReversibleMatchEvent | null {
  const ineffective = new Set(
    events
      .filter(
        (event): event is UndoAppliedEvent => event.type === "UndoApplied",
      )
      .map(({ targetSequence }) => targetSequence),
  );
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event && isReversibleEvent(event) && !ineffective.has(event.sequence)) {
      return event;
    }
  }
  return null;
}

export function restoreStateFromEvents(
  events: readonly MatchEvent[],
): MatchState {
  const first = events[0];
  if (!first || first.type !== "SetupCreated") {
    throw new Error("Undo needs a complete Match Event history.");
  }
  let current: MatchState = createSetupForRulesVersion(
    first.matchId,
    first.occurredAt,
    first.rulesVersion,
  ).state;
  for (const [offset, event] of events.slice(1).entries()) {
    const eventIndex = offset + 1;
    if (event.sequence !== eventIndex + 1) {
      throw new Error("Undo needs a complete Match Event sequence.");
    }
    if (event.matchId !== current.matchId) {
      throw new Error("Undo needs one complete Match Event history.");
    }
    if (event.type === "InitiativeGenerated") {
      if (current.phase !== "setup") {
        throw new Error(
          "The initiative event cannot apply to this Match State.",
        );
      }
      if (current.initiative !== null) {
        throw new Error(
          "Initiative Generate needs an empty initiative result.",
        );
      }
      current = {
        ...current,
        sequence: event.sequence,
        initiative: event.results,
      };
    } else if (event.type === "InitiativeRerolled") {
      if (current.phase !== "setup") {
        throw new Error(
          "The initiative event cannot apply to this Match State.",
        );
      }
      if (current.initiative === null) {
        throw new Error(
          "Initiative Reroll needs an existing initiative result.",
        );
      }
      current = {
        ...current,
        sequence: event.sequence,
        initiative: event.results,
      };
    } else if (event.type === "MatchStarted") {
      if (current.phase !== "setup" || current.initiative === null) {
        throw new Error(
          "The Start Match Event cannot apply to this Match State.",
        );
      }
      current = {
        ...current,
        phase: "active",
        sequence: event.sequence,
        initiative: current.initiative,
        round: event.round,
        activeSlot: event.activeSlot,
      };
    } else if (event.type === "TurnFinished") {
      if (current.phase !== "active") {
        throw new Error(
          "The Finish Turn Event cannot apply to this Match State.",
        );
      }
      const expected = finishTurn(current, event.occurredAt);
      if (!canonicalMatchRecordsEqual(expected.event, event)) {
        throw new Error("The Finish Turn Event does not follow Match State.");
      }
      current = expected.state;
    } else if (event.type === "ActionResolved") {
      if (current.phase !== "active") {
        throw new Error(
          "The Action Resolution cannot apply to this Match State.",
        );
      }
      const activeState: ActiveMatchState = current;
      if (activeState.rulesVersion === RULESET.version) {
        let expected: CommandResult<ActiveMatchState, ActionResolvedEvent>;
        if (event.actionType === "Ability") {
          expected = resolveAbility(
            activeState,
            {
              abilityId: event.abilityId ?? event.attackId,
              targetCharacterIds: event.targetCharacterIds ?? event.attackLegs.flatMap((leg) => leg.affectedCharacterIds),
              attackLegs: event.attackLegs.map(({ affectedCharacterIds }) => ({
                affectedCharacterIds: [...affectedCharacterIds],
              })),
              physicalConfirmations: event.physicalConfirmations,
              reactions: event.reactions.map(
                ({ reactionId, protectedCharacterId, override }) => ({
                  reactionId,
                  protectedCharacterId,
                  override,
                }),
              ),
              majorActionOverride: event.majorActionOverride,
              abilityOverride: event.spentAbilityIds?.length ? "historical-override" : null,
            },
            event.occurredAt,
          );
          // For replay, we cannot rely on spent check; allow any spent override
          // Instead, compare via canonical equality; if mismatch due to override, fallback to historical
          if (!canonicalMatchRecordsEqual(expected.event, event)) {
            current = applyHistoricalActionResolution(activeState, event);
          } else {
            current = expected.state;
          }
        } else {
          expected = resolveBasicAttack(
            activeState,
            {
              sourceCharacterId: event.sourceCharacterId,
              attackLegs: event.attackLegs.map(({ affectedCharacterIds }) => ({
                affectedCharacterIds,
              })),
              physicalConfirmations: event.physicalConfirmations,
              reactions: event.reactions.map(
                ({ reactionId, protectedCharacterId, override }) => ({
                  reactionId,
                  protectedCharacterId,
                  override,
                }),
              ),
              majorActionOverride: event.majorActionOverride,
            },
            event.occurredAt,
          );
          if (!canonicalMatchRecordsEqual(expected.event, event)) {
            throw new Error("The Action Resolution does not follow Match State.");
          }
          current = expected.state;
        }
      } else {
        current = applyHistoricalActionResolution(activeState, event);
      }
    } else if (event.type === "EliminationContinued") {
      if (current.phase !== "active") {
        throw new Error("Continue cannot apply to this Match State.");
      }
      const expected = acknowledgeElimination(
        current,
        event.eliminatedTeam,
        event.occurredAt,
      );
      if (!canonicalMatchRecordsEqual(expected.event, event)) {
        throw new Error("Continue does not follow Match State.");
      }
      current = expected.state;
    } else if (event.type === "SimultaneousEliminationRuled") {
      if (current.phase !== "active") {
        throw new Error(
          "A simultaneous-elimination ruling cannot apply to this Match State.",
        );
      }
      const expected = ruleSimultaneousElimination(
        current,
        event.outcome,
        event.overrideEvidence,
        event.occurredAt,
      );
      if (!canonicalMatchRecordsEqual(expected.event, event)) {
        throw new Error(
          "The simultaneous-elimination ruling does not follow Match State.",
        );
      }
      current = expected.state;
    } else if (event.type === "MatchEnded") {
      if (current.phase !== "active") {
        throw new Error("End Game cannot apply to this Match State.");
      }
      if (event.decisionBasis === undefined) {
        if (
          event.outcome === "draw"
            ? event.eliminatedTeams.length !== 2
            : event.eliminatedTeams.length === 0
        ) {
          throw new Error("End Game does not follow Match State.");
        }
        const expectedLegacy = (() => {
          if (current.eliminatedTeams.length === 1) {
            const expectedOutcome =
              current.eliminatedTeams[0] === "Drow" ? "Duergar" : "Drow";
            if (
              event.outcome !== expectedOutcome ||
              !canonicalMatchRecordsEqual(
                [...current.eliminatedTeams],
                event.eliminatedTeams,
              )
            ) {
              throw new Error("End Game does not follow Match State.");
            }
            return {
              outcome: expectedOutcome,
              eliminatedTeams: [...current.eliminatedTeams] as (
                "Drow" | "Duergar"
              )[],
            };
          }
          if (current.eliminatedTeams.length === 2) {
            if (
              current.outcome === null ||
              event.outcome !== current.outcome ||
              !canonicalMatchRecordsEqual(
                [...current.eliminatedTeams],
                event.eliminatedTeams,
              )
            ) {
              throw new Error("End Game does not follow Match State.");
            }
            return {
              outcome: current.outcome as Exclude<MatchOutcome, null>,
              eliminatedTeams: [...current.eliminatedTeams] as (
                "Drow" | "Duergar"
              )[],
            };
          }
          throw new Error("End Game does not follow Match State.");
        })();
        if (
          event.outcome !== expectedLegacy.outcome ||
          !canonicalMatchRecordsEqual(
            [...event.eliminatedTeams],
            expectedLegacy.eliminatedTeams,
          )
        ) {
          throw new Error("End Game does not follow Match State.");
        }
        current = {
          ...current,
          phase: "ended",
          sequence: event.sequence,
          outcome: event.outcome,
          endedAt: event.occurredAt,
          endedSequence: event.sequence,
        } as EndedMatchState;
      } else {
        let preview: EndGamePreview;
        if (event.decisionBasis === "coinFlip") {
          if (
            event.coinFlipResult !== "Drow" &&
            event.coinFlipResult !== "Duergar"
          ) {
            throw new Error("End Game does not follow Match State.");
          }
          const deterministicRandom: RandomSource = {
            nextUint32: () => (event.coinFlipResult === "Drow" ? 0 : 1),
          };
          preview = getEndGamePreview(current, deterministicRandom);
        } else {
          preview = getEndGamePreview(current);
        }
        if (
          preview.outcome !== event.outcome ||
          preview.decisionBasis !== event.decisionBasis ||
          !canonicalMatchRecordsEqual(preview.finalCounts, event.finalCounts) ||
          !canonicalMatchRecordsEqual(
            preview.finalHpTotals,
            event.finalHpTotals,
          ) ||
          preview.coinFlipResult !== event.coinFlipResult ||
          !canonicalMatchRecordsEqual(
            [...current.eliminatedTeams],
            event.eliminatedTeams,
          )
        ) {
          throw new Error("End Game does not follow Match State.");
        }
        current = {
          ...current,
          phase: "ended",
          sequence: event.sequence,
          outcome: preview.outcome,
          endedAt: event.occurredAt,
          endedSequence: event.sequence,
          decisionBasis: preview.decisionBasis,
          finalCounts: preview.finalCounts,
          finalHpTotals: preview.finalHpTotals,
          ...(preview.coinFlipResult
            ? { coinFlipResult: preview.coinFlipResult }
            : {}),
        } as EndedMatchState;
      }
    } else if (event.type === "MatchReopened") {
      if (current.phase !== "ended") {
        throw new Error("Reopen Match cannot apply to this Match State.");
      }
      const expected = reopenMatch(current, event.occurredAt);
      if (!canonicalMatchRecordsEqual(expected.event, event)) {
        throw new Error("Reopen Match does not follow Match State.");
      }
      current = expected.state;
    } else if (event.type === "UndoApplied") {
      const expectedTarget = findUndoTarget(events.slice(0, eventIndex));
      if (
        expectedTarget === null ||
        expectedTarget.sequence !== event.targetSequence ||
        expectedTarget.type !== event.targetType
      ) {
        throw new Error(
          "The Undo Event does not reference the newest effective event.",
        );
      }
      const targetIndex = events.findIndex(
        ({ sequence }) => sequence === event.targetSequence,
      );
      if (targetIndex < 1 || targetIndex >= event.sequence - 1) {
        throw new Error("The Undo Event target is invalid.");
      }
      current = {
        ...restoreStateFromEvents(events.slice(0, targetIndex)),
        sequence: event.sequence,
      } as MatchState;
    } else if (event.type === "MatchMigrated") {
      if (
        event.fromSchemaVersion !== LEGACY_MATCH_SCHEMA_VERSION ||
        event.toSchemaVersion !== MATCH_SCHEMA_VERSION
      ) {
        throw new Error("The Match Migration Event is incompatible.");
      }
      current = { ...current, sequence: event.sequence } as MatchState;
    } else {
      throw new Error("Setup creation can only be the first Match Event.");
    }
  }
  assertMatchStateStructure(current);
  return current;
}

export function getUndoPreview(
  state: MatchState,
  events: readonly MatchEvent[],
): UndoPreview | null {
  if (state.phase === "ended") return null;
  const target = findUndoTarget(events);
  if (target === null) return null;
  if (events.length !== state.sequence) {
    throw new Error("Undo needs the complete committed Match Event history.");
  }
  if (!canonicalMatchRecordsEqual(restoreStateFromEvents(events), state)) {
    throw new Error("Undo needs the exact committed Match State and history.");
  }
  const targetIndex = events.findIndex(
    ({ sequence }) => sequence === target.sequence,
  );
  const restored = restoreStateFromEvents(events.slice(0, targetIndex));
  return {
    target,
    currentState: state,
    restoredState: { ...restored, sequence: state.sequence + 1 } as MatchState,
  };
}

export function undoLastEvent(
  state: MatchState,
  events: readonly MatchEvent[],
  occurredAt: string,
  confirmed: boolean,
): CommandResult<MatchState, UndoAppliedEvent> {
  if (!confirmed) throw new Error("Undo confirmation is required.");
  const preview = getUndoPreview(state, events);
  if (preview === null) throw new Error("No reversible Match Event remains.");
  return {
    state: preview.restoredState,
    event: {
      type: "UndoApplied",
      matchId: state.matchId,
      sequence: state.sequence + 1,
      rulesVersion: state.rulesVersion,
      occurredAt,
      targetSequence: preview.target.sequence,
      targetType: preview.target.type,
    },
  };
}
