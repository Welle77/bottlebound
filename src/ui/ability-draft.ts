import {
  type AbilityInput,
  type CharacterId,
  type MatchState,
  type Team,
} from "../domain/match";
import { resolveAttackDamageAgainstCharacter } from "../domain/match-ability-effects";
import {
  RULESET,
  type PhysicalAttackCheck,
  type StructuredAbility,
} from "../domain/ruleset";
import type { ActionDraft } from "./shell-state.svelte";

type ActiveView = Extract<MatchState, { readonly phase: "active" }>;

export function activeCharacterIdOf(
  match: ActiveView,
): CharacterId | undefined {
  return match.initiative[match.activeSlot - 1]?.characterId;
}

export function rulesCharacterOf(characterId: CharacterId) {
  const character = RULESET.characters.find(({ id }) => id === characterId);
  if (!character) throw new Error("The Match references an unknown character.");
  return character;
}

export function hpByIdMap(match: ActiveView): ReadonlyMap<CharacterId, number> {
  return new Map(
    match.characters.map(({ characterId, hp }) => [characterId, hp]),
  );
}

export function currentMaxHpOf(
  match: ActiveView,
  characterId: CharacterId,
): number {
  const entry = match.characters.find(
    ({ characterId: id }) => id === characterId,
  );
  return entry?.currentMaxHp ?? rulesCharacterOf(characterId).baseHp;
}

/** The active character's unspent, non-Reaction abilities from the Ruleset. */
export function unspentAbilities(
  match: ActiveView,
): readonly StructuredAbility[] {
  const activeCharacterId = activeCharacterIdOf(match);
  return RULESET.abilities.filter(
    (ability) =>
      ability.ownerCharacterId === activeCharacterId &&
      ability.actionType !== "reaction" &&
      !match.spentAbilityIds.includes(ability.id),
  );
}

function abilityOf(draft: ActionDraft): StructuredAbility {
  const ability = RULESET.abilities.find(({ id }) => id === draft.abilityId);
  if (!ability)
    throw new Error("The Action Draft references an unknown ability.");
  return ability;
}

/**
 * Maps an Ability Action Draft onto the single mutation path's input shape.
 * Physical confirmations reuse the T02 toggle-aware draft values; Reactions
 * and overrides pass through unchanged.
 */
export function buildAbilityInput(draft: ActionDraft): AbilityInput {
  const ability = abilityOf(draft);
  const toDomain = (key: PhysicalAttackCheck): boolean =>
    draft.physicalConfirmations[key];
  return {
    abilityId: ability.id,
    targetCharacterIds:
      ability.interaction === "self" ? undefined : [...draft.targets],
    attackLegs:
      ability.interaction === "physical-attack"
        ? draft.attackLegs.map((affectedCharacterIds) => ({
            affectedCharacterIds: [...affectedCharacterIds],
          }))
        : undefined,
    physicalConfirmations:
      ability.interaction === "physical-attack"
        ? {
            range: toDomain("range"),
            lineOfSight: toDomain("line-of-sight"),
            legalBottleContact: toDomain("legal-bottle-contact"),
            terrainContact: toDomain("terrain-contact"),
          }
        : undefined,
    reactions:
      draft.reactions.length > 0
        ? draft.reactions.map(
            ({ reactionId, protectedCharacterId, override }) => ({
              reactionId,
              protectedCharacterId,
              override,
            }),
          )
        : undefined,
    majorActionOverride: draft.majorActionOverride
      ? "Referee confirmed a second Major Action this turn."
      : null,
    abilityOverride: draft.abilityOverride
      ? "The referee recorded an Override for this state-invalid ability choice."
      : null,
  };
}

export const CHECK_LABELS: readonly (readonly [PhysicalAttackCheck, string])[] =
  [
    ["range", "Range is legal"],
    ["line-of-sight", "Line of Sight is legal"],
    ["legal-bottle-contact", "Every selected bottle was physically hit"],
    ["terrain-contact", "Terrain contact was resolved"],
  ];

/* ------------------------------------------------------------------ */
/* Shared draft-view helpers consumed by the converted T07 components   */
/* ------------------------------------------------------------------ */

type TargetCandidate = {
  readonly characterId: CharacterId;
  readonly blocked: boolean;
  readonly reasons: readonly string[];
};
export type { TargetCandidate };

function reviveBlockedOnEliminatedTeam(
  match: ActiveView,
  ability: StructuredAbility,
  targetCharacterId: CharacterId,
): boolean {
  if (ability.name !== "Revivify" && ability.name !== "Lay on Hands")
    return false;
  const hp = hpByIdMap(match).get(targetCharacterId) ?? 0;
  if (hp !== 0) return false;
  return match.eliminatedTeams.includes(
    rulesCharacterOf(targetCharacterId).team,
  );
}

export function targetCandidates(
  match: ActiveView,
  ability: StructuredAbility,
): readonly TargetCandidate[] {
  const hpById = hpByIdMap(match);
  const ownerTeam = rulesCharacterOf(ability.ownerCharacterId).team;
  return RULESET.characters.map((character) => {
    const hp = hpById.get(character.id) ?? 0;
    const relation = ability.targetPolicy.relation;
    const lifeState = ability.targetPolicy.lifeState;
    const reasons: readonly string[] = [
      ...(relation === "enemy" && character.team === ownerTeam
        ? ["Enemies only"]
        : []),
      ...(relation === "ally" && character.team !== ownerTeam
        ? ["Allies only"]
        : []),
      ...(lifeState === "active" && hp === 0 ? ["Active characters only"] : []),
      ...(lifeState === "downed" && hp !== 0 ? ["Downed characters only"] : []),
    ];
    const blocked = reviveBlockedOnEliminatedTeam(match, ability, character.id);
    return {
      characterId: character.id,
      blocked,
      reasons: blocked
        ? ["That team is permanently eliminated; revival cannot restore it"]
        : reasons,
    };
  });
}

/**
 * Collects every condition that requires a recorded Override before this
 * draft may commit. The list mirrors the domain's overridable validation
 * outcomes so the referee sees the exact reason before confirming.
 *
 * Each warning carries its code, an optional Display-Name-aware character,
 * and the sentence remainder; the review component renders them as real
 * markup through the CharacterName component (T10). A leading space in
 * `rest` separates a rendered character name from its sentence.
 */
export type DraftWarning = {
  readonly code: string;
  readonly character: {
    readonly id: CharacterId;
    readonly name: string;
  } | null;
  readonly rest: string;
};

export function draftWarnings(
  match: ActiveView,
  draft: ActionDraft,
  ability: StructuredAbility,
): readonly DraftWarning[] {
  const hpById = hpByIdMap(match);
  const ownerTeam = rulesCharacterOf(ability.ownerCharacterId).team;
  const targetWarnings: readonly DraftWarning[] = draft.targets.flatMap(
    (targetCharacterId) => {
      const character = rulesCharacterOf(targetCharacterId);
      const hp = hpById.get(targetCharacterId) ?? 0;
      return [
        ...(ability.targetPolicy.relation === "enemy" &&
        character.team === ownerTeam
          ? [
              {
                code: "invalid-target-relation",
                character,
                rest: " is not an enemy. Confirming records an Override.",
              },
            ]
          : []),
        ...(ability.targetPolicy.relation === "ally" &&
        character.team !== ownerTeam
          ? [
              {
                code: "invalid-target-relation",
                character,
                rest: " is not an ally. Confirming records an Override.",
              },
            ]
          : []),
        ...(ability.targetPolicy.lifeState === "active" && hp === 0
          ? [
              {
                code: "invalid-target-life-state",
                character,
                rest: " is Downed. Confirming records an Override.",
              },
            ]
          : []),
        ...(ability.targetPolicy.lifeState === "downed" && hp !== 0
          ? [
              {
                code: "invalid-target-life-state",
                character,
                rest: " is Active. Confirming records an Override.",
              },
            ]
          : []),
      ];
    },
  );
  return [
    ...(draft.sourceCharacterId !== activeCharacterIdOf(match)
      ? ([
          {
            code: "wrong-active-character",
            character: null,
            rest: "the Active Character changed since this draft opened. Confirming records an Override.",
          },
        ] as const)
      : []),
    ...(match.spentAbilityIds.includes(ability.id)
      ? ([
          {
            code: "ability-already-spent",
            character: null,
            rest: "this Ability was already used this Match. Confirming records an Override.",
          },
        ] as const)
      : []),
    ...targetWarnings,
    ...(draft.overrideRequired
      ? ([
          {
            code: draft.overrideRequired,
            character: null,
            rest: "the resolution needs a recorded Override. Tick the checkbox below and confirm again.",
          },
        ] as const)
      : []),
  ];
}

type AttackPreviewContext = {
  readonly match: ActiveView;
  readonly draft: ActionDraft;
  /** Printed damage before effect modification (Basic Attacks and abilities both print 1). */
  readonly baseDamage: number;
  /** Physical throws cannot affect a Vanish-protected character. */
  readonly physicalAttack: boolean;
};

/** One "Ordered hits and final changes" review row, rendered as real markup. */
export type AttackPreviewRow = {
  readonly contactLabel: string;
  readonly character: { readonly id: CharacterId; readonly name: string };
  readonly team: Team;
  /** Composed damage cell text: damage, prevention note, consumed-effect notes. */
  readonly damageText: string;
  /** Composed HP transition text, for example "3 → 1". */
  readonly hpText: string;
  readonly lifeStateText: string;
};

/**
 * One "Ordered hits and final changes" review row computed through the same
 * shared damage pipeline the confirm path uses
 * (resolveAttackDamageAgainstCharacter), so Review shows exactly the finalized
 * damage and effect consumption that confirming records. Consumed effects are
 * named; a Vanish that zeroed the damage is noted as retained.
 */
export function attackPreviewRow(
  { match, draft, baseDamage, physicalAttack }: AttackPreviewContext,
  characterId: CharacterId,
  contactLabel: string,
): AttackPreviewRow {
  const character = rulesCharacterOf(characterId);
  const hp = hpByIdMap(match).get(characterId) ?? 0;
  const prevented = draft.reactions.some(
    ({ protectedCharacterId }) => protectedCharacterId === characterId,
  );
  // The commit path resolves with the next sequence number; previews never
  // render the hex movement cap it can attach.
  const resolved = resolveAttackDamageAgainstCharacter({
    baseDamage,
    affectedCharacterId: characterId,
    physicalAttack,
    prevented,
    activeEffects: match.activeEffects,
    sequence: match.sequence + 1,
  });
  const damage = resolved.finalDamage;
  const after = Math.max(0, hp - damage);
  const consumedNames = [
    ...new Set(
      resolved.expired.map(
        ({ abilityId }) =>
          RULESET.abilities.find(({ id }) => id === abilityId)?.name ??
          abilityId,
      ),
    ),
  ];
  const vanishRetained =
    damage === 0 &&
    !prevented &&
    physicalAttack &&
    match.activeEffects.some(
      (effect) =>
        effect.kind === "vanish" && effect.affectedCharacterId === characterId,
    );
  const notes = [
    ...consumedNames.map((name) => `${name} consumed`),
    ...(vanishRetained ? ["Vanish retained"] : []),
  ];
  return {
    contactLabel,
    character,
    team: character.team,
    // One composed run so regex text probes see the exact legacy cell text
    // across its interpolated halves.
    damageText: `${String(damage)}${damage === 0 ? " (prevented)" : ""}${notes.length > 0 ? ` · ${notes.join(" · ")}` : ""}`,
    hpText: `${String(hp)} → ${String(after)}`,
    lifeStateText:
      hp === 0
        ? "Downed → Downed"
        : after === 0
          ? "Active → Downed"
          : "Active → Active",
  };
}

/** One "Expected changes" review row, rendered as real markup. */
export type EffectPreviewRow = {
  readonly character: { readonly id: CharacterId; readonly name: string };
  readonly team: Team;
  readonly effectLabel: string;
  /** Composed HP transition text, for example "3 → 4". */
  readonly hpText: string;
  readonly lifeStateText: string;
};

/**
 * One "Expected changes" review row for heal/revive/utility resolutions,
 * mirroring the domain's HP application without dealing damage.
 */
export function effectPreviewRow(
  match: ActiveView,
  ability: StructuredAbility,
  characterId: CharacterId,
): EffectPreviewRow {
  const character = rulesCharacterOf(characterId);
  const hp = hpByIdMap(match).get(characterId) ?? 0;
  const heals =
    ability.name === "Nature’s Renewal" ||
    ability.name === "Inspiring Words" ||
    ability.name === "Second Wind" ||
    ability.name === "Shapeshift";
  const revives =
    (ability.name === "Lay on Hands" && hp === 0) ||
    ability.name === "Revivify";
  const after = revives
    ? 1
    : heals
      ? Math.min(
          ability.name === "Shapeshift"
            ? 4
            : currentMaxHpOf(match, characterId),
          hp + 1,
        )
      : hp;
  const label = revives ? "Revived" : heals ? "+1 HP" : "No HP change";
  return {
    character,
    team: character.team,
    effectLabel: label,
    hpText: `${String(hp)} → ${String(after)}`,
    lifeStateText: after === 0 ? "Downed" : "Active",
  };
}
