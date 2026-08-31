import type {
  AbilityActionType,
  AbilityInteraction,
  AbilityOperation,
  AbilityTargetCardinality,
  AbilityTargetLifeState,
  AbilityTargetRelation,
  MatchConfiguration,
  PhysicalAttackCheck,
  ReactionOperationType,
  ReactionTrigger,
} from "../../src/domain/match-configuration";

const validActionType: AbilityActionType = "powerful";
const validInteraction: AbilityInteraction = "targeted-attack";
const validOperation: AbilityOperation = "deal-damage";
const validCardinality: AbilityTargetCardinality = "all-in-range";
const validLifeState: AbilityTargetLifeState = "downed";
const validRelation: AbilityTargetRelation = "enemy";
const validCheck: PhysicalAttackCheck = "terrain-contact";
const validReactionTrigger: ReactionTrigger = "physical-ball-hits-owner";
const validReactionOperation: ReactionOperationType = "manual-movement";
const configuration: MatchConfiguration = {} as MatchConfiguration;

// @ts-expect-error Invented ability action types must not compile.
const invalidActionType: AbilityActionType = "ultimate";
// @ts-expect-error Invented interactions must not compile.
const invalidInteraction: AbilityInteraction = "nearest";
// @ts-expect-error Invented configuration operations must not compile.
const invalidOperation: AbilityOperation = "run-function";
// @ts-expect-error Invented target policies must not compile.
const invalidCardinality: AbilityTargetCardinality = "some";
// @ts-expect-error Invented physical checks must not compile.
const invalidCheck: PhysicalAttackCheck = "guide-anchor";
// @ts-expect-error Invented Reaction triggers must not compile.
const invalidReactionTrigger: ReactionTrigger = "when-convenient";
// @ts-expect-error Invented Reaction operations must not compile.
const invalidReactionOperation: ReactionOperationType = "call-handler";

void validActionType;
void validInteraction;
void validOperation;
void validCardinality;
void validLifeState;
void validRelation;
void validCheck;
void validReactionTrigger;
void validReactionOperation;
void configuration;
void invalidActionType;
void invalidInteraction;
void invalidOperation;
void invalidCardinality;
void invalidCheck;
void invalidReactionTrigger;
void invalidReactionOperation;
