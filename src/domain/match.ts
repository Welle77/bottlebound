import { RULESET, RULES_VERSION } from "./ruleset";

export const MATCH_SCHEMA_VERSION = 3;
export const LEGACY_MATCH_SCHEMA_VERSION = 2;

export interface RandomSource {
  nextUint32(): number;
}

export interface MatchCharacter {
  readonly characterId: string;
  readonly hp: number;
}

export type MatchOutcome = "Drow" | "Duergar" | "draw" | null;

interface CombatMatchState {
  readonly spentReactionIds: readonly string[];
  readonly majorActionUsed: boolean;
  readonly eliminatedTeams: readonly ("Drow" | "Duergar")[];
  readonly acknowledgedEliminations: readonly ("Drow" | "Duergar")[];
  readonly outcome: MatchOutcome;
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

export interface MatchEndedEvent extends EventBase {
  readonly type: "MatchEnded";
  readonly outcome: Exclude<MatchOutcome, null>;
  readonly eliminatedTeams: readonly ("Drow" | "Duergar")[];
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
  readonly actionType: "Basic Attack";
  readonly sourceCharacterId: string;
  readonly attackId: string;
  readonly attackType: "melee" | "ranged";
  readonly rangePaces: 2 | 6;
  readonly damage: 1;
  readonly rulesSourceAnchor: string;
  readonly attackLegs: readonly AttackLeg[];
  readonly physicalConfirmations: PhysicalConfirmations;
  readonly reactions: readonly ProtectiveReactionResolution[];
  readonly effects: readonly ActionEffect[];
  readonly majorActionOverride: string | null;
  readonly eliminatedTeams: readonly ("Drow" | "Duergar")[];
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
  majorActionUsed: false,
  eliminatedTeams: Object.freeze([]) as readonly ("Drow" | "Duergar")[],
  acknowledgedEliminations: Object.freeze([]) as readonly (
    "Drow" | "Duergar"
  )[],
  outcome: null,
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
  return {
    state: { ...state, sequence, round, activeSlot, majorActionUsed: false },
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
    },
  };
}

export function acknowledgeElimination(
  state: ActiveMatchState,
  eliminatedTeam: "Drow" | "Duergar",
  occurredAt: string,
): CommandResult<ActiveMatchState, EliminationContinuedEvent> {
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

export function endMatch(
  state: ActiveMatchState,
  occurredAt: string,
  confirmed: boolean,
): CommandResult<EndedMatchState, MatchEndedEvent> {
  if (!confirmed) throw new Error("End Game confirmation is required.");
  if (
    state.outcome === null ||
    (state.eliminatedTeams.length !== 1 &&
      state.eliminatedTeams.length !== 2) ||
    (state.eliminatedTeams.length === 1 && state.outcome === "draw")
  ) {
    throw new Error("End Game needs a resolved Team Elimination result.");
  }
  const sequence = state.sequence + 1;
  return {
    state: {
      ...state,
      phase: "ended",
      sequence,
      outcome: state.outcome,
      endedAt: occurredAt,
      endedSequence: sequence,
    },
    event: {
      type: "MatchEnded",
      matchId: state.matchId,
      sequence,
      rulesVersion: state.rulesVersion,
      occurredAt,
      outcome: state.outcome,
      eliminatedTeams: [...state.eliminatedTeams],
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
    majorActionUsed: state.majorActionUsed,
    eliminatedTeams: state.eliminatedTeams,
    acknowledgedEliminations: state.acknowledgedEliminations,
    outcome: state.outcome,
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
  if (state.rulesVersion !== RULESET.version) {
    throw new Error("Basic Attack needs the exact bundled Ruleset.");
  }
  const activeCharacterId = state.initiative[state.activeSlot - 1]?.characterId;
  if (input.sourceCharacterId !== activeCharacterId) {
    throw new Error("Basic Attack needs the active character as its source.");
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
      (entry.hp as number) < 0 ||
      (entry.hp as number) > rulesCharacter.baseHp
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
  if (schemaVersion === MATCH_SCHEMA_VERSION) {
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
      const expected = resolveBasicAttack(
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
      const expected = endMatch(current, event.occurredAt, true);
      if (!canonicalMatchRecordsEqual(expected.event, event)) {
        throw new Error("End Game does not follow Match State.");
      }
      current = expected.state;
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
