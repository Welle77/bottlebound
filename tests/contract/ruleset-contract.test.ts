import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { RULESET } from "../../src/domain/ruleset";

describe("authoritative roster contract", () => {
  it("matches the team, HP, and initiative table in the rules contract", () => {
    const rules = readFileSync(
      new URL("../../bottlebound_rules_final.md", import.meta.url),
      "utf8",
    );
    const rosterSection = rules
      .split("## 2. Teams, Roles, HP & Basic Attacks\n")[1]
      ?.split("\n## 3. Equipment")[0];

    expect(rosterSection).toBeDefined();
    const authoritativeRoster = rosterSection
      ?.split("\n")
      .filter((line) => /^\| (Drow|Duergar)\s+\|/.test(line))
      .map((line) => {
        const [team, name, , hp, initiative, basicAttack] = line
          .split("|")
          .slice(1, -1)
          .map((value) => value.trim());
        if (!team || !name || !hp || !initiative || !basicAttack) {
          throw new Error("The authoritative roster table is malformed.");
        }
        const attack = basicAttack.match(/^(Melee|Ranged) — (2|6) paces$/);
        if (!attack)
          throw new Error("The authoritative Basic Attack is malformed.");
        return {
          id: `${team}-${name}`.toLowerCase(),
          name,
          team,
          baseHp: Number(hp),
          initiativeModifier: Number(initiative),
          basicAttack: {
            attackType: attack[1]?.toLowerCase(),
            rangePaces: Number(attack[2]),
          },
        };
      });

    expect(authoritativeRoster).toHaveLength(12);
    expect(RULESET.characters).toEqual(
      authoritativeRoster?.map(
        ({ id, name, team, baseHp, initiativeModifier }) => ({
          id,
          name,
          team,
          baseHp,
          initiativeModifier,
        }),
      ),
    );
    expect(
      RULESET.basicAttacks.map(({ characterId, attackType, rangePaces }) => ({
        characterId,
        attackType,
        rangePaces,
      })),
    ).toEqual(
      authoritativeRoster?.map(({ id: characterId, basicAttack }) => ({
        characterId,
        ...basicAttack,
      })),
    );
  });
});
