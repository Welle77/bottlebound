/**
 * Match engine facade.
 *
 * The engine is decomposed into cohesive behavior-preserving modules; this
 * file composes them and preserves the historical public import surface so
 * existing importers of "./domain/match" are unaffected.
 */

export {
  ACTION_KINDS,
  ACTIVE_EFFECT_KINDS,
  ATTACK_KINDS,
  CHARACTER_IDS,
  DECISION_BASES,
  EFFECT_BOUNDARY_TRIGGERS,
  EFFECT_DURATION_KINDS,
  EFFECT_OPERATIONS,
  MATCH_EVENT_TYPES,
  MATCH_SCHEMA_VERSION,
  PHASES,
  TEAMS,
  isActionKind,
  isActiveEffectKind,
  isAbilityId,
  isAttackId,
  isAttackKind,
  isBasicAttackId,
  isCharacterId,
  isDecisionBasis,
  isEffectBoundaryTrigger,
  isEffectDurationKind,
  isEffectOperation,
  isInteger,
  isMatchEventType,
  isPhase,
  isReactionId,
  isTeam,
  nextActionCount,
} from "./match-types";

export { isAbilityName } from "./match-configuration";

export {
  MATCH_CONFIGURATION,
  MATCH_CONFIGURATION_VERSION,
} from "./match-configuration";

export { cryptoRandomSource } from "./match-random";

export {
  assignDisplayNames,
  createSetup,
  generateInitiative,
  normalizeDisplayNames,
  rerollInitiative,
  startMatch,
} from "./match-setup";

export {
  acknowledgeElimination,
  dash,
  finishTurn,
  ruleSimultaneousElimination,
} from "./match-turn";

export { endMatch, getEndGamePreview, reopenMatch } from "./match-endgame";

export {
  getProtectiveReactionChoices,
  resolveBasicAttack,
} from "./match-combat";

export { resolveAbility } from "./match-abilities";

export {
  assertMatchStateStructure,
  assertMatchSummaryStructure,
  validatedMatchRecordsEqual,
  toMatchSummary,
} from "./match-history";

export {
  getUndoPreview,
  restoreStateFromEvents,
  undoLastEvent,
} from "./match-replay";

export type {
  AbilityId,
  ActionEffect,
  ActionKind,
  ActionResolvedEvent,
  ActiveEffect,
  ActiveEffectKind,
  ActiveMatchState,
  AttackKind,
  AttackId,
  AttackLeg,
  BasicAttackInput,
  BasicAttackId,
  CharacterId,
  CoinFlipAttempt,
  CoinFlipTieBreakStep,
  CommandResult,
  DecisionBasis,
  DashedEvent,
  DigitalCoinFlipResult,
  DisplayNames,
  DisplayNamesAssignedEvent,
  EffectDurationKind,
  EffectBoundaryTrigger,
  EffectOperation,
  EliminationContinuedEvent,
  EndedMatchState,
  EndGamePreview,
  FinalTeamCounts,
  InitiativeEntry,
  InitiativeEvent,
  MatchCharacter,
  MatchEndedEvent,
  MatchEvent,
  MatchEventType,
  MatchOutcome,
  MatchReopenedEvent,
  MatchStartedEvent,
  MatchState,
  MatchSummary,
  Phase,
  PhysicalConfirmations,
  ProtectiveReactionChoice,
  ProtectiveReactionInput,
  ProtectiveReactionOperation,
  ProtectiveReactionResolution,
  RandomSource,
  ReactionId,
  ReversibleMatchEvent,
  SetupCreatedEvent,
  SetupMatchEvent,
  SetupMatchState,
  SimultaneousEliminationRuledEvent,
  Team,
  TieOrder,
  TurnFinishedEvent,
  UndoAppliedEvent,
  UndoPreview,
} from "./match-types";

export type { AbilityName } from "./match-configuration";
export type { MatchConfigurationVersion } from "./match-configuration";

export type { AbilityInput } from "./match-abilities";
