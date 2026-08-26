export const MATCH_SCHEMA_VERSION = 3;

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

/**
 * Optional referee-assigned Display Names keyed by Ruleset character id.
 * Absent keys mean the character keeps its Ruleset name alone.
 */
export type DisplayNames = Readonly<Record<string, string>>;

export interface SetupMatchState extends CombatMatchState {
  readonly schemaVersion: typeof MATCH_SCHEMA_VERSION;
  readonly rulesVersion: string;
  readonly matchId: string;
  readonly phase: "setup";
  readonly sequence: number;
  readonly characters: readonly MatchCharacter[];
  readonly initiative: readonly InitiativeEntry[] | null;
  /** Complete Display Name map; empty when the referee assigned none. */
  readonly displayNames: DisplayNames;
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
  /** Complete Display Name map; empty when the referee assigned none. */
  readonly displayNames: DisplayNames;
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
  /** Complete Display Name map; empty when the referee assigned none. */
  readonly displayNames: DisplayNames;
  readonly decisionBasis: DecisionBasis;
  readonly finalCounts: FinalTeamCounts;
  readonly finalHpTotals: FinalTeamCounts;
  /** The recorded Coin Flip; null whenever the Decision Basis is not coinFlip. */
  readonly coinFlipResult: "Drow" | "Duergar" | null;
}

export type MatchState = SetupMatchState | ActiveMatchState | EndedMatchState;

interface EventBase {
  readonly matchId: string;
  readonly sequence: number;
  readonly rulesVersion: string;
  readonly occurredAt: string;
}

export interface SetupCreatedEvent extends EventBase {
  readonly type: "SetupCreated";
}

export interface DisplayNamesAssignedEvent extends EventBase {
  readonly type: "DisplayNamesAssigned";
  readonly displayNames: DisplayNames;
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
  /** Every effect that expired at this turn boundary; empty when none did. */
  readonly expiredEffects: readonly ActiveEffect[];
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
  readonly decisionBasis: DecisionBasis;
  readonly finalCounts: FinalTeamCounts;
  readonly finalHpTotals: FinalTeamCounts;
  /** The recorded Coin Flip; null whenever the Decision Basis is not coinFlip. */
  readonly coinFlipResult: "Drow" | "Duergar" | null;
}

export interface MatchReopenedEvent extends EventBase {
  readonly type: "MatchReopened";
  readonly endedSequence: number;
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
  /** Hard maximum range in paces; 8 covers the Deadeye ability card. */
  readonly rangePaces: 2 | 6 | 8;
  readonly redirectedByReactionId: string | null;
  readonly towardCharacterId: string | null;
  readonly affectedCharacterIds: readonly string[];
}

export interface ActionEffect {
  readonly characterId: string;
  /**
   * Finalized damage for this affected character. Base attacks contribute 1;
   * stacked character-based effects such as Hunter's Mark or Hex add their
   * written +1 each (rules §11), so any non-negative integer can occur.
   */
  readonly damage: number;
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
  readonly rangePaces: 2 | 6 | 8;
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
  /** Every effect that expired through this resolution; empty when none did. */
  readonly expiredEffects: readonly ActiveEffect[];
  /**
   * The recorded Override sentence for a state-invalid Ability choice; null
   * when the resolution needed no Override.
   */
  readonly abilityOverride: string | null;
}

export interface BasicAttackInput {
  readonly sourceCharacterId: string;
  readonly affectedCharacterIds?: readonly string[];
  readonly attackLegs?: readonly Readonly<{
    readonly affectedCharacterIds: readonly string[];
  }>[];
  readonly physicalConfirmations: Readonly<{
    readonly range: boolean;
    readonly lineOfSight: boolean;
    readonly legalBottleContact: boolean;
    readonly terrainContact: boolean;
  }>;
  readonly reactions?: readonly ProtectiveReactionInput[];
  readonly majorActionOverride: string | null;
}

export type ReversibleMatchEvent =
  | DisplayNamesAssignedEvent
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
  | DisplayNamesAssignedEvent
  | InitiativeEvent
  | MatchStartedEvent
  | TurnFinishedEvent
  | ActionResolvedEvent
  | EliminationContinuedEvent
  | SimultaneousEliminationRuledEvent
  | MatchEndedEvent
  | MatchReopenedEvent
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

export const initialCombatState = Object.freeze({
  spentReactionIds: Object.freeze([]),
  spentAbilityIds: Object.freeze([]),
  majorActionUsed: false,
  eliminatedTeams: Object.freeze([]),
  acknowledgedEliminations: Object.freeze([]),
  outcome: null,
  activeEffects: Object.freeze([]),
});
