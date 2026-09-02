import { describe, expect, it } from "vitest";

import { resolveBasicAttack } from "../../src/domain/match";
import {
  cast,
  CONFIRMATIONS,
  play,
  startedAuditMatch,
} from "./match-rules-audit-fixtures";

describe("physical throws with no bottle contact", () => {
  it.each([
    ["drow-rogue", "Backstab"],
    ["duergar-monk", "Stunning Strike"],
    ["duergar-barbarian", "Brutal Shove"],
  ] as const)("resolves %s without a hit", (sourceCharacterId, abilityName) => {
    const run = startedAuditMatch(`no-hit-${sourceCharacterId}`);
    const { characters: beforeCharacters } = run.state;

    const result = cast(run, sourceCharacterId, {
      abilityName,
      input: {
        attackLegs: [{ affectedCharacterIds: [] }],
        physicalConfirmations: CONFIRMATIONS,
      },
      step: 1,
    });

    expect(result.characters).toEqual(beforeCharacters);
    expect(result.spentAbilityIds).toContain(
      `${sourceCharacterId}-${abilityName.toLowerCase().replaceAll(" ", "-")}`,
    );
    expect(run.events.at(-1)).toMatchObject({
      effects: [],
      targetCharacterIds: [],
      attackLegs: [expect.objectContaining({ affectedCharacterIds: [] })],
    });
  });

  it("resolves a Basic Attack without a hit", () => {
    const run = startedAuditMatch("no-hit-basic-attack");
    const { state } = run;
    const activeCharacter = state.initiative[state.activeSlot - 1];
    if (!activeCharacter) throw new Error("Expected an active character.");
    const result = play(
      run,
      resolveBasicAttack(
        state,
        {
          sourceCharacterId: activeCharacter.characterId,
          attackLegs: [{ affectedCharacterIds: [] }],
          physicalConfirmations: CONFIRMATIONS,
          majorActionOverride: null,
        },
        "2026-08-24T09:01:00.000Z",
      ),
    );

    expect(result.characters).toEqual(state.characters);
    expect(run.events.at(-1)).toMatchObject({
      effects: [],
      attackLegs: [expect.objectContaining({ affectedCharacterIds: [] })],
    });
  });
});
