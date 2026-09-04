import { describe, expect, it } from "vitest";

import {
  MATCH_CONFIGURATION,
  normalMovementPaces,
  type MatchConfigurationAbility,
} from "../../src/domain/match";
import { cast, startedAuditMatch } from "./match-rules-audit-fixtures";

const debuffAbilityNames = [
  "Backstab",
  "Frostbind",
  "Hunter’s Mark",
  "Stunning Strike",
  "Hex",
] as const;

describe("debuff ability coverage", () => {
  it("lists every ability that applies a debuff to another character", () => {
    const debuffAbilities = MATCH_CONFIGURATION.abilities
      .filter((ability) => isDebuffAbility(ability))
      .map(({ name }) => name);

    expect(debuffAbilities).toEqual(debuffAbilityNames);
  });

  it("limits Frostbind's target to 1 pace on its next turn", () => {
    const run = startedAuditMatch("audit-frostbind");
    cast(run, "drow-wizard", {
      abilityName: "Frostbind",
      input: { targetCharacterIds: ["duergar-ranger"] },
      step: 1,
    });

    expect(run.state.activeEffects).toMatchObject([
      {
        abilityId: "drow-wizard-frostbind",
        kind: "movement-cap",
        affectedCharacterId: "duergar-ranger",
      },
    ]);
    expect(normalMovementPaces(run.state, "duergar-ranger")).toBe(1);
  });
});

function isDebuffAbility(ability: MatchConfigurationAbility): boolean {
  return (
    ability.operations.includes("prohibit-action-type") ||
    ability.operations.includes("add-damage") ||
    ability.name === "Frostbind"
  );
}
