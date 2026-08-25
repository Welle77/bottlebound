/**
 * Match engine facade.
 *
 * The engine is decomposed into cohesive behavior-preserving modules; this
 * file composes them and preserves the historical public import surface so
 * existing importers of "./domain/match" are unaffected.
 */

export {
  LEGACY_MATCH_SCHEMA_VERSION,
  MATCH_SCHEMA_VERSION,
} from "./match-types";

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
  canonicalMatchRecordsEqual,
  migrateLegacyMatch,
  toMatchSummary,
} from "./match-history";

export {
  getUndoPreview,
  restoreStateFromEvents,
  undoLastEvent,
} from "./match-replay";

export type {
  ActionEffect,
  ActionResolvedEvent,
  ActiveEffect,
  ActiveMatchState,
  AttackLeg,
  BasicAttackInput,
  CoinFlipAttempt,
  CoinFlipTieBreakStep,
  CommandResult,
  DecisionBasis,
  DigitalCoinFlipResult,
  DisplayNames,
  DisplayNamesAssignedEvent,
  EffectDurationKind,
  EliminationContinuedEvent,
  EndedMatchState,
  EndGamePreview,
  FinalTeamCounts,
  InitiativeEntry,
  InitiativeEvent,
  LegacyActiveMatchState,
  LegacyMatchState,
  LegacySetupMatchState,
  MatchCharacter,
  MatchEndedEvent,
  MatchEvent,
  MatchMigratedEvent,
  MatchOutcome,
  MatchReopenedEvent,
  MatchStartedEvent,
  MatchState,
  MatchSummary,
  PhysicalConfirmations,
  ProtectiveReactionChoice,
  ProtectiveReactionInput,
  ProtectiveReactionOperation,
  ProtectiveReactionResolution,
  RandomSource,
  ReversibleMatchEvent,
  SetupCreatedEvent,
  SetupMatchEvent,
  SetupMatchState,
  SimultaneousEliminationRuledEvent,
  TieOrder,
  TurnFinishedEvent,
  UndoAppliedEvent,
  UndoPreview,
} from "./match-types";

export type { AbilityInput } from "./match-abilities";
