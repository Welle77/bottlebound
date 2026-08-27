import type {
  AbilityId,
  AbilityName,
  ActiveEffect,
  BasicAttackId,
  BasicAttackInput,
  CharacterId,
  DisplayNames,
  ReactionId,
} from "../../src/domain/match";

// @ts-expect-error Character ids are limited to the authoritative 12-character roster.
const invalidCharacterId: CharacterId = "not-a-character";

// @ts-expect-error Basic attack inputs require a roster character id.
const invalidBasicAttackSourceCharacterId: BasicAttackInput["sourceCharacterId"] =
  "not-a-character";

// @ts-expect-error Display Names are keyed by roster character ids only.
const invalidDisplayNames: DisplayNames = { "not-a-character": "Silk" };

// @ts-expect-error Ability ids are the exact 24 printed Ability-card ids.
const invalidAbilityId: AbilityId = "drow-rogue-invented-ability";

// @ts-expect-error Ability names are limited to the authoritative 24 cards.
const invalidAbilityName: AbilityName = "Invented Ability";

// @ts-expect-error Basic Attack ids are distinct from one-shot Ability ids.
const abilityUsedAsBasicAttackId: BasicAttackId = "drow-rogue-backstab";

// @ts-expect-error Only the five configured defensive Reactions use Reaction ids.
const invalidReactionId: ReactionId = "drow-rogue-backstab";

// @ts-expect-error Active effect kinds are the exact domain branch keys.
const invalidActiveEffectKind: ActiveEffect["kind"] = "invented-effect";

// @ts-expect-error Boundary triggers are the exact domain branch keys.
const invalidEffectBoundaryTrigger: NonNullable<
  ActiveEffect["duration"]["boundaryTrigger"]
> = "invented-boundary";

// @ts-expect-error Active effect operations are the exact domain branch keys.
const invalidEffectOperation: ActiveEffect["operations"][number] =
  "invented-operation";

void invalidCharacterId;
void invalidBasicAttackSourceCharacterId;
void invalidDisplayNames;
void invalidAbilityId;
void invalidAbilityName;
void abilityUsedAsBasicAttackId;
void invalidReactionId;
void invalidActiveEffectKind;
void invalidEffectBoundaryTrigger;
void invalidEffectOperation;
