import * as z from "zod";
import {
  ABILITY_IDS,
  ACTION_KINDS,
  ACTIVE_EFFECT_KINDS,
  ATTACK_KINDS,
  CHARACTER_IDS,
  DECISION_BASES,
  EFFECT_BOUNDARY_TRIGGERS,
  EFFECT_DURATION_KINDS,
  EFFECT_OPERATIONS,
  MATCH_SCHEMA_VERSION,
  REACTION_IDS,
  TEAMS,
  type MatchEvent,
  type MatchState,
  type MatchSummary,
  ATTACK_IDS,
} from "../domain/match-types";

const teamSchema = z.enum(TEAMS);
const characterIdSchema = z.enum(CHARACTER_IDS);
const abilityIdSchema = z.enum(ABILITY_IDS);
const reactionIdSchema = z.enum(REACTION_IDS);
const attackIdSchema = z.enum(ATTACK_IDS);
const actionKindSchema = z.enum(ACTION_KINDS);
const attackKindSchema = z.enum(ATTACK_KINDS);
const decisionBasisSchema = z.enum(DECISION_BASES);
const durationKindSchema = z.enum(EFFECT_DURATION_KINDS);
const boundaryTriggerSchema = z.enum(EFFECT_BOUNDARY_TRIGGERS);
const effectOperationSchema = z.enum(EFFECT_OPERATIONS);
const nonEmptyStringSchema = z.string().min(1);
const integerSchema = z.number().int();
const nonNegativeIntegerSchema = integerSchema.nonnegative();
const schemaVersionSchema = z.literal(MATCH_SCHEMA_VERSION);

// Zod omits absent optional keys at runtime, but its inferred object output
// includes `undefined`; retain the domain's exact-optional contract here.
type MatchStateSchema = z.ZodType<MatchState>;
type MatchEventSchema = z.ZodType<MatchEvent>;
type MatchSummarySchema = z.ZodType<MatchSummary>;

const displayNamesSchema = z.partialRecord(
  characterIdSchema,
  nonEmptyStringSchema,
);

const matchCharacterSchema = z.object({
  characterId: characterIdSchema,
  hp: nonNegativeIntegerSchema,
  currentMaxHp: nonNegativeIntegerSchema,
});

const initiativeEntrySchema = z.object({
  characterId: characterIdSchema,
  roll: integerSchema,
  modifier: integerSchema,
  total: integerSchema,
  slot: integerSchema,
});

const coinFlipAttemptSchema = z.object({
  flips: z.array(z.enum(["heads", "tails"])),
  candidate: nonNegativeIntegerSchema,
  accepted: z.boolean(),
});

const coinFlipTieBreakStepSchema = z.object({
  position: nonNegativeIntegerSchema,
  upperExclusive: z.number().int().positive(),
  attempts: z.array(coinFlipAttemptSchema),
  selectedIndex: nonNegativeIntegerSchema,
});

export const tieOrderSchema = z.object({
  total: integerSchema,
  initialCharacterIds: z.array(characterIdSchema),
  steps: z.array(coinFlipTieBreakStepSchema),
  characterIds: z.array(characterIdSchema),
});

const activeEffectSchema = z.object({
  effectId: nonEmptyStringSchema,
  abilityId: abilityIdSchema,
  kind: z.enum(ACTIVE_EFFECT_KINDS),
  anchorCharacterId: characterIdSchema,
  affectedCharacterId: characterIdSchema,
  duration: z
    .object({
      kind: durationKindSchema,
      boundaryTrigger: boundaryTriggerSchema.optional(),
      anchor: z.enum(["source", "affected"]),
      removeWhenAffectedDowned: z.boolean(),
    })
    .catchall(z.unknown()),
  operations: z.array(effectOperationSchema),
  appliedSequence: integerSchema,
});

const finalTeamCountsSchema = z.object({
  Drow: nonNegativeIntegerSchema,
  Duergar: nonNegativeIntegerSchema,
});

const combatStateSchema = z.object({
  spentReactionIds: z.array(reactionIdSchema),
  spentAbilityIds: z.array(abilityIdSchema),
  movementPaces: z.literal(2),
  remainingMovementPaces: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  actionsUsed: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  majorActionUsed: z.boolean(),
  eliminatedTeams: z.array(teamSchema),
  acknowledgedEliminations: z.array(teamSchema),
  outcome: z.union([teamSchema, z.literal("draw"), z.null()]),
  activeEffects: z.array(activeEffectSchema),
});

const stateBaseSchema = z.object({
  schemaVersion: schemaVersionSchema,
  configurationVersion: nonEmptyStringSchema,
  matchId: nonEmptyStringSchema,
  sequence: integerSchema.positive(),
  characters: z.array(matchCharacterSchema),
  displayNames: displayNamesSchema,
});

const setupStateSchema = stateBaseSchema
  .extend(combatStateSchema.shape)
  .extend({
    phase: z.literal("setup"),
    initiative: z.array(initiativeEntrySchema).nullable(),
  });

const activeStateSchema = stateBaseSchema
  .extend(combatStateSchema.shape)
  .extend({
    phase: z.literal("active"),
    initiative: z.array(initiativeEntrySchema),
    round: integerSchema.positive(),
    activeSlot: integerSchema.positive(),
  });

const endedStateSchema = activeStateSchema.extend({
  phase: z.literal("ended"),
  outcome: z.union([teamSchema, z.literal("draw")]),
  endedAt: nonEmptyStringSchema,
  endedSequence: integerSchema.positive(),
  decisionBasis: decisionBasisSchema,
  finalCounts: finalTeamCountsSchema,
  finalHpTotals: finalTeamCountsSchema,
  coinFlipResult: z.union([teamSchema, z.null()]),
});

export const matchStateSchema = z.discriminatedUnion("phase", [
  setupStateSchema,
  activeStateSchema,
  endedStateSchema,
]) as MatchStateSchema;

const eventBaseSchema = z.object({
  matchId: nonEmptyStringSchema,
  sequence: integerSchema.positive(),
  configurationVersion: nonEmptyStringSchema,
  occurredAt: nonEmptyStringSchema,
});

const physicalConfirmationsSchema = z.object({
  range: z.literal(true),
  lineOfSight: z.literal(true),
  legalBottleContact: z.literal(true),
  terrainContact: z.literal(true),
});

const attackLegSchema = z.object({
  sequence: integerSchema.positive(),
  kind: z.enum(["initial", "redirected"]),
  sourceCharacterId: characterIdSchema,
  attackId: attackIdSchema,
  rangePaces: z.union([z.literal(2), z.literal(6), z.literal(8)]),
  redirectedByReactionId: reactionIdSchema.nullable(),
  towardCharacterId: characterIdSchema.nullable(),
  affectedCharacterIds: z.array(characterIdSchema),
});

const actionEffectSchema = z.object({
  characterId: characterIdSchema,
  damage: nonNegativeIntegerSchema,
  hpBefore: nonNegativeIntegerSchema,
  hpAfter: nonNegativeIntegerSchema,
  downedBefore: z.boolean(),
  downedAfter: z.boolean(),
});

const protectiveReactionOperationSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("prevent-damage-and-effects"),
      characterId: characterIdSchema,
    })
    .catchall(z.unknown()),
  z
    .object({
      type: z.literal("manual-movement"),
      characterId: characterIdSchema,
      maxPaces: z.literal(2),
      instruction: nonEmptyStringSchema,
    })
    .catchall(z.unknown()),
  z
    .object({
      type: z.literal("redirect-physical-attack"),
      fromCharacterId: characterIdSchema,
      towardCharacterId: characterIdSchema,
    })
    .catchall(z.unknown()),
]);

const reactionResolutionSchema = z.object({
  reactionId: reactionIdSchema,
  ownerCharacterId: characterIdSchema,
  protectedCharacterId: characterIdSchema,
  warnings: z.array(nonEmptyStringSchema),
  override: z.union([z.string(), z.null()]),
  operations: z.array(protectiveReactionOperationSchema),
});

const actionResolvedSchema = eventBaseSchema.extend({
  type: z.literal("ActionResolved"),
  actionType: actionKindSchema,
  sourceCharacterId: characterIdSchema,
  attackId: attackIdSchema,
  attackType: attackKindSchema,
  rangePaces: z.union([z.literal(2), z.literal(6), z.literal(8)]),
  damage: z.literal(1),
  attackLegs: z.array(attackLegSchema),
  physicalConfirmations: physicalConfirmationsSchema,
  reactions: z.array(reactionResolutionSchema),
  effects: z.array(actionEffectSchema),
  majorActionOverride: z.union([z.string(), z.null()]),
  eliminatedTeams: z.array(teamSchema),
  abilityId: abilityIdSchema.nullable().optional(),
  targetCharacterIds: z.array(characterIdSchema).optional(),
  spentAbilityIds: z.array(abilityIdSchema).optional(),
  appliedEffects: z.array(activeEffectSchema).optional(),
  expiredEffects: z.array(activeEffectSchema),
  abilityOverride: z.union([z.string(), z.null()]),
});

const eventSchemas = [
  eventBaseSchema.extend({ type: z.literal("SetupCreated") }),
  eventBaseSchema.extend({
    type: z.literal("DisplayNamesAssigned"),
    displayNames: displayNamesSchema,
  }),
  eventBaseSchema.extend({
    type: z.enum(["InitiativeGenerated", "InitiativeRerolled"]),
    results: z.array(initiativeEntrySchema),
    tieOrder: z.array(tieOrderSchema),
  }),
  eventBaseSchema.extend({
    type: z.literal("MatchStarted"),
    round: z.literal(1),
    activeSlot: z.literal(1),
  }),
  eventBaseSchema.extend({
    type: z.literal("TurnFinished"),
    fromRound: integerSchema,
    fromSlot: integerSchema,
    round: integerSchema,
    activeSlot: integerSchema,
    skippedSlots: z.array(integerSchema),
    expiredEffects: z.array(activeEffectSchema),
  }),
  eventBaseSchema.extend({
    type: z.literal("Dashed"),
    sourceCharacterId: characterIdSchema,
    movementPaces: z.literal(2),
    remainingMovementPaces: z.literal(0),
  }),
  actionResolvedSchema,
  eventBaseSchema.extend({
    type: z.literal("EliminationContinued"),
    eliminatedTeam: teamSchema,
    outcome: teamSchema,
  }),
  eventBaseSchema.extend({
    type: z.literal("SimultaneousEliminationRuled"),
    eliminatedTeams: z.tuple([teamSchema, teamSchema]),
    outcome: z.union([teamSchema, z.literal("draw")]),
    overrideEvidence: nonEmptyStringSchema,
  }),
  eventBaseSchema.extend({
    type: z.literal("MatchEnded"),
    outcome: z.union([teamSchema, z.literal("draw")]),
    eliminatedTeams: z.array(teamSchema),
    decisionBasis: decisionBasisSchema,
    finalCounts: finalTeamCountsSchema,
    finalHpTotals: finalTeamCountsSchema,
    coinFlipResult: z.union([teamSchema, z.null()]),
  }),
  eventBaseSchema.extend({
    type: z.literal("MatchReopened"),
    endedSequence: integerSchema,
  }),
  eventBaseSchema.extend({
    type: z.literal("UndoApplied"),
    targetSequence: integerSchema,
    targetType: z.enum([
      "InitiativeGenerated",
      "InitiativeRerolled",
      "DisplayNamesAssigned",
      "MatchStarted",
      "TurnFinished",
      "Dashed",
      "ActionResolved",
      "EliminationContinued",
      "SimultaneousEliminationRuled",
      "MatchReopened",
    ]),
  }),
] as const;

export const matchEventSchema = z.discriminatedUnion(
  "type",
  eventSchemas,
) as MatchEventSchema;

export const matchSummarySchema = z.object({
  outcome: z.union([teamSchema, z.literal("draw")]),
  decisionBasis: decisionBasisSchema,
  finalCounts: finalTeamCountsSchema,
  finalHpTotals: finalTeamCountsSchema,
  configurationVersion: nonEmptyStringSchema,
  endedAt: nonEmptyStringSchema,
  coinFlipResult: teamSchema.optional(),
}) as MatchSummarySchema;
