import { MATCH_CONFIGURATION } from "./match-configuration";
import type {
  ActionResolvedEvent,
  BasicAttackInput,
  CharacterId,
  ProtectiveReactionResolution,
} from "./match-types";

type BasicAttack = (typeof MATCH_CONFIGURATION.basicAttacks)[number];
type BasicAttackLegInput = NonNullable<BasicAttackInput["attackLegs"]>[number];

export function buildAttackLegs(context: {
  readonly inputLegs: readonly BasicAttackLegInput[];
  readonly sourceCharacterId: CharacterId;
  readonly attack: BasicAttack;
  readonly redirectReaction: ProtectiveReactionResolution | undefined;
}): ActionResolvedEvent["attackLegs"] {
  const { inputLegs, sourceCharacterId, attack, redirectReaction } = context;
  return inputLegs.map((leg, index) => {
    const towardCharacterId =
      index > 0 && redirectReaction?.ownerCharacterId
        ? sourceCharacterId
        : null;
    return {
      sequence: index + 1,
      kind: index === 0 ? "initial" : "redirected",
      sourceCharacterId,
      attackId: attack.id,
      rangePaces: attack.rangePaces,
      redirectedByReactionId:
        index === 0 ? null : (redirectReaction?.reactionId ?? null),
      towardCharacterId,
      affectedCharacterIds: [...leg.affectedCharacterIds],
    };
  });
}
