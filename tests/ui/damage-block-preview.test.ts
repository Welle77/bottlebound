import { describe, expect, it } from "vitest";

import {
  createSetup,
  generateInitiative,
  resolveBasicAttack,
  startMatch,
} from "../../src/domain/match";
import { MATCH_CONFIGURATION } from "../../src/domain/match-configuration";
import { attackPreviewRow } from "../../src/ui/ability-draft";
import type { ActionDraft } from "../../src/ui/ui-state";
import {
  initiativeCharacterId,
  queuedRandom,
} from "../domain/match-test-support";

describe("Damage Block review preview", () => {
  it("matches the confirmed Damage Block result", () => {
    const setup = createSetup(
      "damage-block-preview",
      "2026-08-22T14:00:00.000Z",
    );
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(
      generated.state,
      "2026-08-22T14:02:00.000Z",
    ).state;
    const sourceCharacterId = initiativeCharacterId(started, 0);
    const targetCharacterId = "duergar-ranger" as const;
    const draft = {
      kind: "basic",
      sourceCharacterId,
      configurationVersion: MATCH_CONFIGURATION.version,
      abilityId: null,
      targets: [targetCharacterId],
      step: "review",
      attackLegs: [[targetCharacterId]],
      physicalConfirmations: {
        range: true,
        "line-of-sight": true,
        "legal-bottle-contact": true,
        "terrain-contact": true,
      },
      reactions: [
        {
          reactionId: "drow-paladin-divine-shield",
          protectedCharacterId: targetCharacterId,
          override: null,
        },
      ],
      abilityOverride: false,
      overrideRequired: null,
      majorActionOverride: false,
    } satisfies ActionDraft;
    const preview = attackPreviewRow(
      { match: started, draft, baseDamage: 1, physicalAttack: true },
      targetCharacterId,
      "1.1",
    );
    const confirmed = resolveBasicAttack(
      started,
      {
        sourceCharacterId,
        affectedCharacterIds: [targetCharacterId],
        physicalConfirmations: {
          range: true,
          lineOfSight: true,
          legalBottleContact: true,
          terrainContact: true,
        },
        reactions: draft.reactions,
        majorActionOverride: null,
      },
      "2026-08-22T14:03:00.000Z",
    );
    const [effect] = confirmed.event.effects;
    expect(effect).toBeDefined();
    expect(preview.damageText).toContain(String(effect?.damage));
    expect(preview.hpText).toBe(
      `${String(effect?.hpBefore)} → ${String(effect?.hpAfter)}`,
    );
  });
});
