import type { ActionEffect, CharacterId, MatchCharacter } from "./match-types";
import type { StructuredAbility } from "./ruleset";
import { isAbilityNamed } from "./match-ability-effects";

export type UtilityAbilityContext = {
  readonly ability: StructuredAbility;
  readonly affectedCharacterIds: readonly CharacterId[];
  /** Pre-action snapshot backing the Lay on Hands revive-or-heal choice. */
  readonly priorCharacters: readonly MatchCharacter[];
  /** Working copy the HP changes apply onto (already carries earlier legs). */
  readonly characters: readonly MatchCharacter[];
};

export type UtilityAbilityResult = {
  /** Updated working copy with every HP/maxHP change applied. */
  readonly characters: readonly MatchCharacter[];
  /** Output ledger; every touched character appends exactly one entry. */
  readonly effects: readonly ActionEffect[];
};

type TargetOutcome = {
  readonly character: MatchCharacter;
  readonly effect: ActionEffect;
};

/**
 * Applies a resolved non-attack ability to its affected characters:
 * healing up to current maximum HP, revival to exactly 1 HP, Shapeshift's
 * maximum-HP change with its written 1-HP restore, and zero-damage ledger
 * entries for buff/marker abilities (rules §12 and §15 cards). Pure: both
 * input collections stay untouched; the updated copies are returned.
 */
export function applyUtilityAbility(
  context: UtilityAbilityContext,
): UtilityAbilityResult {
  const { ability, affectedCharacterIds, priorCharacters } = context;
  const abilityName = ability.name;

  const healTarget = (
    character: MatchCharacter,
    targetId: CharacterId,
  ): TargetOutcome => {
    const maxHp = character.currentMaxHp;
    const hpAfter = Math.min(maxHp, character.hp + 1);
    const before = character.hp;
    return {
      character: { ...character, hp: hpAfter },
      effect: {
        characterId: targetId,
        damage: 0,
        hpBefore: before,
        hpAfter,
        downedBefore: before === 0,
        downedAfter: hpAfter === 0,
      },
    };
  };

  const reviveTarget = (
    character: MatchCharacter,
    targetId: CharacterId,
  ): TargetOutcome => {
    const before = character.hp;
    return {
      character: { ...character, hp: 1 },
      effect: {
        characterId: targetId,
        damage: 0,
        hpBefore: before,
        hpAfter: 1,
        downedBefore: true,
        downedAfter: false,
      },
    };
  };

  const ledgerOnlyTarget = (
    character: MatchCharacter,
    targetId: CharacterId,
  ): TargetOutcome => ({
    character,
    effect: {
      characterId: targetId,
      damage: 0,
      hpBefore: character.hp,
      hpAfter: character.hp,
      downedBefore: character.hp === 0,
      downedAfter: character.hp === 0,
    },
  });

  const updateFor = (
    targetId: CharacterId,
  ): ((character: MatchCharacter) => TargetOutcome) => {
    const characterOf = (candidates: readonly MatchCharacter[]) =>
      candidates.find((candidate) => candidate.characterId === targetId);
    if (
      isAbilityNamed(ability, "Nature’s Renewal") ||
      abilityName === "Inspiring Words" ||
      abilityName === "Second Wind"
    ) {
      return (character) => healTarget(character, targetId);
    }
    if (abilityName === "Lay on Hands") {
      return (character) =>
        (characterOf(priorCharacters)?.hp ?? 0) === 0
          ? reviveTarget(character, targetId)
          : healTarget(character, targetId);
    }
    if (abilityName === "Revivify") {
      return (character) => reviveTarget(character, targetId);
    }
    if (abilityName === "Shapeshift") {
      // Maximum HP becomes 4 and the ability restores 1 HP (rules §15).
      return (character) => {
        const outcome = healTarget(character, targetId);
        const raised = {
          ...outcome.character,
          currentMaxHp: 4 as const,
          hp: Math.min(4, character.hp + 1),
        };
        return {
          character: raised,
          effect: {
            ...outcome.effect,
            hpAfter: raised.hp,
            downedAfter: raised.hp === 0,
          },
        };
      };
    }
    // Vanish is carried by its Active Effect; Reaction cards resolve inside
    // their triggering attack; buffs, marks, and Hex record their ledger.
    return (character) => ledgerOnlyTarget(character, targetId);
  };

  const applied = affectedCharacterIds.reduce<{
    readonly characters: readonly MatchCharacter[];
    readonly effects: readonly ActionEffect[];
  }>(
    (accumulated, targetId) => {
      const character = accumulated.characters.find(
        (candidate) => candidate.characterId === targetId,
      );
      if (!character) throw new Error("Heal target unknown");
      const outcome = updateFor(targetId)(character);
      return {
        characters: accumulated.characters.map((candidate) =>
          candidate.characterId === targetId ? outcome.character : candidate,
        ),
        effects: [...accumulated.effects, outcome.effect],
      };
    },
    { characters: context.characters, effects: [] },
  );

  return { characters: applied.characters, effects: applied.effects };
}
