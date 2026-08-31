export const MATCH_SCHEMA_VERSION = 5;

export const TEAMS = ["Drow", "Duergar"] as const;

export type Team = (typeof TEAMS)[number];

export function isTeam(value: string): value is Team {
  return (TEAMS as readonly string[]).includes(value);
}

export const CHARACTER_IDS = [
  "drow-rogue",
  "drow-druid",
  "drow-paladin",
  "drow-wizard",
  "drow-sorcerer",
  "drow-bard",
  "duergar-ranger",
  "duergar-monk",
  "duergar-fighter",
  "duergar-barbarian",
  "duergar-warlock",
  "duergar-cleric",
] as const;

export type CharacterId =
  | "drow-rogue"
  | "drow-druid"
  | "drow-paladin"
  | "drow-wizard"
  | "drow-sorcerer"
  | "drow-bard"
  | "duergar-ranger"
  | "duergar-monk"
  | "duergar-fighter"
  | "duergar-barbarian"
  | "duergar-warlock"
  | "duergar-cleric";

export function isCharacterId(value: string): value is CharacterId {
  return (CHARACTER_IDS as readonly string[]).includes(value);
}

/** Every unlimited Basic Attack owned by the application configuration. */
export type BasicAttackId =
  | "drow-rogue-basic-attack"
  | "drow-druid-basic-attack"
  | "drow-paladin-basic-attack"
  | "drow-wizard-basic-attack"
  | "drow-sorcerer-basic-attack"
  | "drow-bard-basic-attack"
  | "duergar-ranger-basic-attack"
  | "duergar-monk-basic-attack"
  | "duergar-fighter-basic-attack"
  | "duergar-barbarian-basic-attack"
  | "duergar-warlock-basic-attack"
  | "duergar-cleric-basic-attack";

/** Every one-shot Ability card owned by the application configuration. */
export type AbilityId =
  | "drow-rogue-backstab"
  | "drow-rogue-vanish"
  | "drow-druid-shapeshift"
  | "drow-druid-nature-s-renewal"
  | "drow-paladin-lay-on-hands"
  | "drow-paladin-divine-shield"
  | "drow-wizard-frostbind"
  | "drow-wizard-misty-escape"
  | "drow-sorcerer-arcane-bolt"
  | "drow-sorcerer-mirror-veil"
  | "drow-bard-inspiring-words"
  | "drow-bard-battle-hymn"
  | "duergar-ranger-hunter-s-mark"
  | "duergar-ranger-deadeye"
  | "duergar-monk-stunning-strike"
  | "duergar-monk-deflecting-palm"
  | "duergar-fighter-second-wind"
  | "duergar-fighter-shield-wall"
  | "duergar-barbarian-brutal-shove"
  | "duergar-barbarian-rage"
  | "duergar-warlock-hex"
  | "duergar-warlock-eldritch-blast"
  | "duergar-cleric-blessing-of-battle"
  | "duergar-cleric-revivify";

/** The five defensive Reaction cards that can resolve during an attack. */
export type ReactionId =
  | "drow-paladin-divine-shield"
  | "drow-wizard-misty-escape"
  | "drow-sorcerer-mirror-veil"
  | "duergar-monk-deflecting-palm"
  | "duergar-fighter-shield-wall";

export type AttackId = BasicAttackId | AbilityId;

const BASIC_ATTACK_IDS: readonly BasicAttackId[] = [
  "drow-rogue-basic-attack",
  "drow-druid-basic-attack",
  "drow-paladin-basic-attack",
  "drow-wizard-basic-attack",
  "drow-sorcerer-basic-attack",
  "drow-bard-basic-attack",
  "duergar-ranger-basic-attack",
  "duergar-monk-basic-attack",
  "duergar-fighter-basic-attack",
  "duergar-barbarian-basic-attack",
  "duergar-warlock-basic-attack",
  "duergar-cleric-basic-attack",
];

const ABILITY_IDS: readonly AbilityId[] = [
  "drow-rogue-backstab",
  "drow-rogue-vanish",
  "drow-druid-shapeshift",
  "drow-druid-nature-s-renewal",
  "drow-paladin-lay-on-hands",
  "drow-paladin-divine-shield",
  "drow-wizard-frostbind",
  "drow-wizard-misty-escape",
  "drow-sorcerer-arcane-bolt",
  "drow-sorcerer-mirror-veil",
  "drow-bard-inspiring-words",
  "drow-bard-battle-hymn",
  "duergar-ranger-hunter-s-mark",
  "duergar-ranger-deadeye",
  "duergar-monk-stunning-strike",
  "duergar-monk-deflecting-palm",
  "duergar-fighter-second-wind",
  "duergar-fighter-shield-wall",
  "duergar-barbarian-brutal-shove",
  "duergar-barbarian-rage",
  "duergar-warlock-hex",
  "duergar-warlock-eldritch-blast",
  "duergar-cleric-blessing-of-battle",
  "duergar-cleric-revivify",
];

const REACTION_IDS: readonly ReactionId[] = [
  "drow-paladin-divine-shield",
  "drow-wizard-misty-escape",
  "drow-sorcerer-mirror-veil",
  "duergar-monk-deflecting-palm",
  "duergar-fighter-shield-wall",
];

export function isBasicAttackId(value: string): value is BasicAttackId {
  return (BASIC_ATTACK_IDS as readonly string[]).includes(value);
}

export function isAbilityId(value: string): value is AbilityId {
  return (ABILITY_IDS as readonly string[]).includes(value);
}

export function isReactionId(value: string): value is ReactionId {
  return (REACTION_IDS as readonly string[]).includes(value);
}

export function isAttackId(value: string): value is AttackId {
  return isBasicAttackId(value) || isAbilityId(value);
}

export const PHASES = ["setup", "active", "ended"] as const;

export type Phase = (typeof PHASES)[number];

export function isPhase(value: string): value is Phase {
  return (PHASES as readonly string[]).includes(value);
}

export const MATCH_EVENT_TYPES = [
  "SetupCreated",
  "DisplayNamesAssigned",
  "InitiativeGenerated",
  "InitiativeRerolled",
  "MatchStarted",
  "TurnFinished",
  "Dashed",
  "ActionResolved",
  "EliminationContinued",
  "SimultaneousEliminationRuled",
  "MatchEnded",
  "MatchReopened",
  "UndoApplied",
] as const;

export type MatchEventType = (typeof MATCH_EVENT_TYPES)[number];

export function isMatchEventType(value: string): value is MatchEventType {
  return (MATCH_EVENT_TYPES as readonly string[]).includes(value);
}

export const ACTION_KINDS = ["Basic Attack", "Ability"] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

export function isActionKind(value: string): value is ActionKind {
  return (ACTION_KINDS as readonly string[]).includes(value);
}

export const ATTACK_KINDS = ["melee", "ranged", "ability"] as const;

export type AttackKind = (typeof ATTACK_KINDS)[number];

export function isAttackKind(value: string): value is AttackKind {
  return (ATTACK_KINDS as readonly string[]).includes(value);
}

export const DECISION_BASES = [
  "elimination",
  "activeCount",
  "activeHpTotal",
  "coinFlip",
] as const;

export type DecisionBasis = (typeof DECISION_BASES)[number];

export function isDecisionBasis(value: string): value is DecisionBasis {
  return (DECISION_BASES as readonly string[]).includes(value);
}

export type RandomSource = {
  nextUint32(): number;
};

export type MatchCharacter = {
  readonly characterId: CharacterId;
  readonly hp: number;
  readonly currentMaxHp: number;
};

export type MatchOutcome = Team | "draw" | null;

export const EFFECT_DURATION_KINDS = [
  "immediate",
  "until-boundary",
  "until-trigger",
  "until-trigger-or-boundary",
  "while-condition",
] as const;

export type EffectDurationKind = (typeof EFFECT_DURATION_KINDS)[number];

export function isEffectDurationKind(
  value: string,
): value is EffectDurationKind {
  return (EFFECT_DURATION_KINDS as readonly string[]).includes(value);
}

export const ACTIVE_EFFECT_KINDS = [
  "hunters-mark",
  "hex",
  "rage",
  "vanish",
  "shapeshift",
  "prohibit-powerful",
  "movement-cap",
] as const;

export type ActiveEffectKind = (typeof ACTIVE_EFFECT_KINDS)[number];

export function isActiveEffectKind(value: string): value is ActiveEffectKind {
  return (ACTIVE_EFFECT_KINDS as readonly string[]).includes(value);
}

export const EFFECT_BOUNDARY_TRIGGERS = [
  "beginning-of-next-scheduled-slot",
  "end-of-next-scheduled-slot",
  "beginning-of-next-turn",
  "end-of-next-turn",
] as const;

export type EffectBoundaryTrigger = (typeof EFFECT_BOUNDARY_TRIGGERS)[number];

export function isEffectBoundaryTrigger(
  value: string,
): value is EffectBoundaryTrigger {
  return (EFFECT_BOUNDARY_TRIGGERS as readonly string[]).includes(value);
}

export const EFFECT_OPERATIONS = [
  "add-damage",
  "reduce-remaining-damage",
  "ignore-physical-attack",
  "change-max-hp",
  "prohibit-action-type",
  "set-movement-cap",
] as const;

export type EffectOperation = (typeof EFFECT_OPERATIONS)[number];

export function isEffectOperation(value: string): value is EffectOperation {
  return (EFFECT_OPERATIONS as readonly string[]).includes(value);
}

export type ActiveEffect = {
  readonly effectId: string;
  readonly abilityId: AbilityId;
  readonly kind: ActiveEffectKind;
  readonly anchorCharacterId: CharacterId;
  readonly affectedCharacterId: CharacterId;
  readonly duration: {
    readonly kind: EffectDurationKind;
    readonly boundaryTrigger?: EffectBoundaryTrigger;
    readonly anchor: "source" | "affected";
    readonly removeWhenAffectedDowned: boolean;
  };
  readonly operations: readonly EffectOperation[];
  readonly appliedSequence: number;
};

type CombatMatchState = {
  readonly spentReactionIds: readonly ReactionId[];
  readonly spentAbilityIds: readonly AbilityId[];
  readonly movementPaces: 2;
  readonly remainingMovementPaces: 0 | 1 | 2;
  /** Number of Move, Basic Attack, or Ability actions used this turn. */
  readonly actionsUsed?: 0 | 1 | 2;
  readonly majorActionUsed: boolean;
  readonly eliminatedTeams: readonly Team[];
  readonly acknowledgedEliminations: readonly Team[];
  readonly outcome: MatchOutcome;
  readonly activeEffects: readonly ActiveEffect[];
};

export type InitiativeEntry = {
  readonly characterId: CharacterId;
  readonly roll: number;
  readonly modifier: number;
  readonly total: number;
  readonly slot: number;
};

export type TieOrder = {
  readonly total: number;
  readonly initialCharacterIds: readonly CharacterId[];
  readonly steps: readonly CoinFlipTieBreakStep[];
  readonly characterIds: readonly CharacterId[];
};

export type DigitalCoinFlipResult = "heads" | "tails";

export type CoinFlipAttempt = {
  readonly flips: readonly DigitalCoinFlipResult[];
  readonly candidate: number;
  readonly accepted: boolean;
};

export type CoinFlipTieBreakStep = {
  readonly position: number;
  readonly upperExclusive: number;
  readonly attempts: readonly CoinFlipAttempt[];
  readonly selectedIndex: number;
};

/**
 * Optional referee-assigned Display Names keyed by configured character id.
 * Absent keys mean the character keeps its configured name alone.
 */
export type DisplayNames = Readonly<Partial<Record<CharacterId, string>>>;

export type SetupMatchState = {
  readonly schemaVersion: typeof MATCH_SCHEMA_VERSION;
  readonly configurationVersion: string;
  readonly matchId: string;
  readonly phase: Extract<Phase, "setup">;
  readonly sequence: number;
  readonly characters: readonly MatchCharacter[];
  readonly initiative: readonly InitiativeEntry[] | null;
  /** Complete Display Name map; empty when the referee assigned none. */
  readonly displayNames: DisplayNames;
} & CombatMatchState;

export type ActiveMatchState = {
  readonly schemaVersion: typeof MATCH_SCHEMA_VERSION;
  readonly configurationVersion: string;
  readonly matchId: string;
  readonly phase: Extract<Phase, "active">;
  readonly sequence: number;
  readonly characters: readonly MatchCharacter[];
  readonly initiative: readonly InitiativeEntry[];
  readonly round: number;
  readonly activeSlot: number;
  /** Complete Display Name map; empty when the referee assigned none. */
  readonly displayNames: DisplayNames;
} & CombatMatchState;

export type EndedMatchState = {
  readonly schemaVersion: typeof MATCH_SCHEMA_VERSION;
  readonly configurationVersion: string;
  readonly matchId: string;
  readonly phase: Extract<Phase, "ended">;
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
  readonly coinFlipResult: Team | null;
} & CombatMatchState;

export type MatchState = SetupMatchState | ActiveMatchState | EndedMatchState;

type EventBase = {
  readonly matchId: string;
  readonly sequence: number;
  readonly configurationVersion: string;
  readonly occurredAt: string;
};

export type SetupCreatedEvent = {
  readonly type: "SetupCreated";
} & EventBase;

export type DisplayNamesAssignedEvent = {
  readonly type: "DisplayNamesAssigned";
  readonly displayNames: DisplayNames;
} & EventBase;

export type InitiativeEvent = {
  readonly type: "InitiativeGenerated" | "InitiativeRerolled";
  readonly results: readonly InitiativeEntry[];
  readonly tieOrder: readonly TieOrder[];
} & EventBase;

export type MatchStartedEvent = {
  readonly type: "MatchStarted";
  readonly round: 1;
  readonly activeSlot: 1;
} & EventBase;

export type TurnFinishedEvent = {
  readonly type: "TurnFinished";
  readonly fromRound: number;
  readonly fromSlot: number;
  readonly round: number;
  readonly activeSlot: number;
  readonly skippedSlots: readonly number[];
  /** Every effect that expired at this turn boundary; empty when none did. */
  readonly expiredEffects: readonly ActiveEffect[];
} & EventBase;

export type DashedEvent = {
  readonly type: "Dashed";
  readonly sourceCharacterId: CharacterId;
  readonly movementPaces: 2;
  readonly remainingMovementPaces: 0;
} & EventBase;

export type EliminationContinuedEvent = {
  readonly type: "EliminationContinued";
  readonly eliminatedTeam: Team;
  readonly outcome: Team;
} & EventBase;

export type SimultaneousEliminationRuledEvent = {
  readonly type: "SimultaneousEliminationRuled";
  readonly eliminatedTeams: readonly [Team, Team];
  readonly outcome: Exclude<MatchOutcome, null>;
  readonly overrideEvidence: string;
} & EventBase;

export type FinalTeamCounts = {
  readonly Drow: number;
  readonly Duergar: number;
};

export type EndGamePreview = {
  readonly outcome: Exclude<MatchOutcome, null>;
  readonly decisionBasis: DecisionBasis;
  readonly finalCounts: FinalTeamCounts;
  readonly finalHpTotals: FinalTeamCounts;
  readonly coinFlipResult?: Team;
};

export type MatchSummary = {
  readonly outcome: Exclude<MatchOutcome, null>;
  readonly decisionBasis: DecisionBasis;
  readonly finalCounts: FinalTeamCounts;
  readonly finalHpTotals: FinalTeamCounts;
  readonly configurationVersion: string;
  readonly endedAt: string;
  readonly coinFlipResult?: Team;
};

export type MatchEndedEvent = {
  readonly type: "MatchEnded";
  readonly outcome: Exclude<MatchOutcome, null>;
  readonly eliminatedTeams: readonly Team[];
  readonly decisionBasis: DecisionBasis;
  readonly finalCounts: FinalTeamCounts;
  readonly finalHpTotals: FinalTeamCounts;
  /** The recorded Coin Flip; null whenever the Decision Basis is not coinFlip. */
  readonly coinFlipResult: Team | null;
} & EventBase;

export type MatchReopenedEvent = {
  readonly type: "MatchReopened";
  readonly endedSequence: number;
} & EventBase;

export type PhysicalConfirmations = {
  readonly range: true;
  readonly lineOfSight: true;
  readonly legalBottleContact: true;
  readonly terrainContact: true;
};

export type AttackLeg = {
  readonly sequence: number;
  readonly kind: "initial" | "redirected";
  readonly sourceCharacterId: CharacterId;
  readonly attackId: AttackId;
  /** Hard maximum range in paces; 8 covers the Deadeye ability card. */
  readonly rangePaces: 2 | 6 | 8;
  readonly redirectedByReactionId: ReactionId | null;
  readonly towardCharacterId: CharacterId | null;
  readonly affectedCharacterIds: readonly CharacterId[];
};

export type ActionEffect = {
  readonly characterId: CharacterId;
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
};

export type ProtectiveReactionOperation =
  | {
      readonly type: "prevent-damage-and-effects";
      readonly characterId: CharacterId;
    }
  | {
      readonly type: "manual-movement";
      readonly characterId: CharacterId;
      readonly maxPaces: 2;
      readonly instruction: string;
    }
  | {
      readonly type: "redirect-physical-attack";
      readonly fromCharacterId: CharacterId;
      readonly towardCharacterId: CharacterId;
    };

export type ProtectiveReactionResolution = {
  readonly reactionId: ReactionId;
  readonly ownerCharacterId: CharacterId;
  readonly protectedCharacterId: CharacterId;
  readonly warnings: readonly string[];
  readonly override: string | null;
  readonly operations: readonly ProtectiveReactionOperation[];
};

export type ProtectiveReactionInput = {
  readonly reactionId: ReactionId;
  readonly protectedCharacterId: CharacterId;
  readonly override: string | null;
};

export type ProtectiveReactionChoice = {
  readonly reactionId: ReactionId;
  readonly ownerCharacterId: CharacterId;
  readonly protectedCharacterId: CharacterId;
  readonly eligible: boolean;
  readonly warnings: readonly string[];
};

export type ActionResolvedEvent = {
  readonly type: "ActionResolved";
  readonly actionType: ActionKind;
  readonly sourceCharacterId: CharacterId;
  readonly attackId: AttackId;
  readonly attackType: AttackKind;
  readonly rangePaces: 2 | 6 | 8;
  readonly damage: 1;
  readonly attackLegs: readonly AttackLeg[];
  readonly physicalConfirmations: PhysicalConfirmations;
  readonly reactions: readonly ProtectiveReactionResolution[];
  readonly effects: readonly ActionEffect[];
  readonly majorActionOverride: string | null;
  readonly eliminatedTeams: readonly Team[];
  readonly abilityId?: AbilityId | null;
  readonly targetCharacterIds?: readonly CharacterId[];
  readonly spentAbilityIds?: readonly AbilityId[];
  readonly appliedEffects?: readonly ActiveEffect[];
  /** Every effect that expired through this resolution; empty when none did. */
  readonly expiredEffects: readonly ActiveEffect[];
  /**
   * The recorded Override sentence for a state-invalid Ability choice; null
   * when the resolution needed no Override.
   */
  readonly abilityOverride: string | null;
} & EventBase;

export type BasicAttackInput = {
  readonly sourceCharacterId: CharacterId;
  readonly affectedCharacterIds?: readonly CharacterId[];
  readonly attackLegs?: readonly Readonly<{
    readonly affectedCharacterIds: readonly CharacterId[];
  }>[];
  readonly physicalConfirmations: Readonly<{
    readonly range: boolean;
    readonly lineOfSight: boolean;
    readonly legalBottleContact: boolean;
    readonly terrainContact: boolean;
  }>;
  readonly reactions?: readonly ProtectiveReactionInput[];
  readonly majorActionOverride: string | null;
};

export type ReversibleMatchEvent =
  | DisplayNamesAssignedEvent
  | InitiativeEvent
  | MatchStartedEvent
  | TurnFinishedEvent
  | DashedEvent
  | ActionResolvedEvent
  | EliminationContinuedEvent
  | SimultaneousEliminationRuledEvent
  | MatchReopenedEvent;

export type UndoAppliedEvent = {
  readonly type: "UndoApplied";
  readonly targetSequence: number;
  readonly targetType: ReversibleMatchEvent["type"];
} & EventBase;

export type MatchEvent =
  | SetupCreatedEvent
  | DisplayNamesAssignedEvent
  | InitiativeEvent
  | MatchStartedEvent
  | TurnFinishedEvent
  | DashedEvent
  | ActionResolvedEvent
  | EliminationContinuedEvent
  | SimultaneousEliminationRuledEvent
  | MatchEndedEvent
  | MatchReopenedEvent
  | UndoAppliedEvent;
export type SetupMatchEvent = SetupCreatedEvent | InitiativeEvent;

export type CommandResult<
  State extends MatchState = MatchState,
  Event extends MatchEvent = MatchEvent,
> = {
  readonly state: State;
  readonly event: Event;
};

export type UndoPreview = {
  readonly target: ReversibleMatchEvent;
  readonly currentState: MatchState;
  readonly restoredState: MatchState;
};

export const initialCombatState = Object.freeze({
  spentReactionIds: Object.freeze([]),
  spentAbilityIds: Object.freeze([]),
  movementPaces: 2 as const,
  remainingMovementPaces: 2 as const,
  actionsUsed: 0 as const,
  majorActionUsed: false,
  eliminatedTeams: Object.freeze([]),
  acknowledgedEliminations: Object.freeze([]),
  outcome: null,
  activeEffects: Object.freeze([]),
});
