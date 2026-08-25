import { isAbilityNamed } from "./match-ability-effects";
import type { ActionEffect, MatchCharacter } from "./match-types";
import type { StructuredAbility } from "./ruleset";

export interface UtilityAbilityContext {
  readonly ability: StructuredAbility;
  readonly affectedCharacterIds: readonly string[];
  /** Working copy mutated in place as HP changes apply. */
  readonly characters: MatchCharacter[];
  /** Pre-action snapshot backing the Lay on Hands revive-or-heal choice. */
  readonly priorCharacters: readonly MatchCharacter[];
  /** Output ledger; every touched character appends exactly one entry. */
  readonly effects: ActionEffect[];
}

/**
 * Applies a resolved non-attack ability to its affected characters:
 * healing up to current maximum HP, revival to exactly 1 HP, Shapeshift's
 * maximum-HP change with its written 1-HP restore, and zero-damage ledger
 * entries for buff/marker abilities (rules §12 and §15 cards).
 */
export function applyUtilityAbility(context: UtilityAbilityContext): void {
  const {
    ability,
    affectedCharacterIds,
    characters,
    priorCharacters,
    effects,
  } = context;
  const abilityName = ability.name;

  const healTarget = (targetId: string) => {
    const idx = characters.findIndex(
      (character) => character.characterId === targetId,
    );
    const character = characters[idx];
    if (!character) throw new Error("Heal target unknown");
    const maxHp = character.currentMaxHp;
    const hpAfter = Math.min(maxHp, character.hp + 1);
    const before = character.hp;
    characters[idx] = { ...character, hp: hpAfter };
    effects.push({
      characterId: targetId,
      damage: 0,
      hpBefore: before,
      hpAfter,
      downedBefore: before === 0,
      downedAfter: hpAfter === 0,
    });
  };

  const reviveTarget = (targetId: string) => {
    const idx = characters.findIndex(
      (character) => character.characterId === targetId,
    );
    const character = characters[idx];
    if (!character) throw new Error("Revive target unknown");
    const before = character.hp;
    characters[idx] = { ...character, hp: 1 };
    effects.push({
      characterId: targetId,
      damage: 0,
      hpBefore: before,
      hpAfter: 1,
      downedBefore: true,
      downedAfter: false,
    });
  };

  if (
    isAbilityNamed(ability, "Nature’s Renewal") ||
    abilityName === "Inspiring Words" ||
    abilityName === "Second Wind"
  ) {
    for (const targetId of affectedCharacterIds) {
      healTarget(targetId);
    }
  } else if (abilityName === "Lay on Hands") {
    for (const targetId of affectedCharacterIds) {
      const targetChar = priorCharacters.find(
        (character) => character.characterId === targetId,
      );
      if (targetChar?.hp === 0) reviveTarget(targetId);
      else healTarget(targetId);
    }
  } else if (abilityName === "Revivify") {
    for (const targetId of affectedCharacterIds) reviveTarget(targetId);
  } else if (abilityName === "Shapeshift") {
    // Maximum HP becomes 4 and the ability restores 1 HP (rules §15).
    for (const targetId of affectedCharacterIds) {
      const idx = characters.findIndex(
        (character) => character.characterId === targetId,
      );
      const character = characters[idx]!;
      const before = character.hp;
      const withMax = {
        ...character,
        currentMaxHp: 4,
        hp: Math.min(4, character.hp + 1),
      };
      characters[idx] = withMax;
      effects.push({
        characterId: targetId,
        damage: 0,
        hpBefore: before,
        hpAfter: withMax.hp,
        downedBefore: before === 0,
        downedAfter: withMax.hp === 0,
      });
    }
  } else if (
    abilityName === "Vanish" ||
    abilityName === "Misty Escape" ||
    abilityName === "Deflecting Palm" ||
    abilityName === "Divine Shield" ||
    abilityName === "Shield Wall" ||
    abilityName === "Mirror Veil"
  ) {
    // Vanish is carried by its Active Effect; the Reaction cards resolve
    // inside their triggering attack. No HP changes — record the ledger.
    for (const targetId of affectedCharacterIds) {
      const character = characters.find(
        (candidate) => candidate.characterId === targetId,
      )!;
      effects.push({
        characterId: targetId,
        damage: 0,
        hpBefore: character.hp,
        hpAfter: character.hp,
        downedBefore: character.hp === 0,
        downedAfter: character.hp === 0,
      });
    }
  } else if (
    abilityName === "Frostbind" ||
    abilityName === "Battle Hymn" ||
    abilityName === "Blessing of Battle"
  ) {
    for (const targetId of affectedCharacterIds) {
      const character = characters.find(
        (candidate) => candidate.characterId === targetId,
      )!;
      effects.push({
        characterId: targetId,
        damage: 0,
        hpBefore: character.hp,
        hpAfter: character.hp,
        downedBefore: character.hp === 0,
        downedAfter: character.hp === 0,
      });
    }
  } else if (abilityName === "Rage") {
    for (const targetId of affectedCharacterIds) {
      const character = characters.find(
        (candidate) => candidate.characterId === targetId,
      )!;
      effects.push({
        characterId: targetId,
        damage: 0,
        hpBefore: character.hp,
        hpAfter: character.hp,
        downedBefore: character.hp === 0,
        downedAfter: character.hp === 0,
      });
    }
  } else {
    // Hunter's Mark, Hex, and any future no-HP marker: no immediate HP
    // change, but the resolution ledger records each affected character.
    for (const targetId of affectedCharacterIds) {
      const character = characters.find(
        (candidate) => candidate.characterId === targetId,
      )!;
      effects.push({
        characterId: targetId,
        damage: 0,
        hpBefore: character.hp,
        hpAfter: character.hp,
        downedBefore: character.hp === 0,
        downedAfter: character.hp === 0,
      });
    }
  }
}
