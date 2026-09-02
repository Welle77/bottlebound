import { MATCH_CONFIGURATION } from "../domain/match";
import type { ActiveEffect, CharacterId } from "../domain/match";
import shieldCheckIcon from "@phosphor-icons/core/bold/shield-check-bold.svg?url";
import warningOctagonIcon from "@phosphor-icons/core/bold/warning-octagon-bold.svg?url";

export type ActiveEffectStatus = {
  readonly effectId: string;
  readonly name: string;
  readonly summary: string;
  readonly tone: "buff" | "debuff";
  readonly icon: string;
};

function effectTone(effect: ActiveEffect): ActiveEffectStatus["tone"] {
  switch (effect.kind) {
    case "hunters-mark":
    case "hex":
    case "prohibit-powerful":
      return "debuff";
    case "movement-cap":
      return effect.abilityId === "drow-bard-battle-hymn" ||
        effect.abilityId === "duergar-cleric-blessing-of-battle"
        ? "buff"
        : "debuff";
    case "rage":
    case "hold-the-line":
    case "vanish":
    case "shapeshift":
      return "buff";
  }
}

function effectSummary(effect: ActiveEffect): string {
  switch (effect.kind) {
    case "hunters-mark":
    case "hex":
      return "The next successful damaging attack deals +1 damage.";
    case "prohibit-powerful":
      return "Cannot use a Powerful Ability on the next turn.";
    case "movement-cap":
      return effect.abilityId === "drow-bard-battle-hymn" ||
        effect.abilityId === "duergar-cleric-blessing-of-battle"
        ? "Move increases by 1 pace."
        : "Movement is limited to 1 pace on the next turn.";
    case "hold-the-line":
      return "The next attack against this character deals 1 less damage.";
    case "vanish":
      return "Cannot be affected by physically thrown balls.";
    case "shapeshift":
      return "Maximum HP is 4 while this effect lasts.";
    case "rage":
      return "This character has an active Rage effect.";
  }
}

export function activeEffectStatuses(
  effects: readonly ActiveEffect[],
  characterId: CharacterId,
): readonly ActiveEffectStatus[] {
  return effects.flatMap((effect) => {
    if (effect.affectedCharacterId !== characterId) return [];
    const ability = MATCH_CONFIGURATION.abilities.find(
      ({ id }) => id === effect.abilityId,
    );
    if (!ability) return [];
    const tone = effectTone(effect);
    return [
      {
        effectId: effect.effectId,
        name: ability.name,
        summary: effectSummary(effect),
        tone,
        icon: tone === "buff" ? shieldCheckIcon : warningOctagonIcon,
      },
    ];
  });
}
