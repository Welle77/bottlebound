import { describe, expect, it } from "vitest";

import {
  createSetup,
  finishTurn,
  generateInitiative,
  resolveAbility,
  resolveBasicAttack,
  startMatch,
  type ActionResolvedEvent,
  type ActiveMatchState,
} from "../../src/domain/match";
import {
  initiativeCharacterId,
  queuedRandom,
} from "../domain/match-test-support";
import type { MatchEvent } from "../../src/domain/match";
import { assertCanonicalEvent } from "../../src/storage/match-store-canonical-event";
import { assertCanonicalState } from "../../src/storage/match-store-canonical-state";

/**
 * Rules coverage audit (ticket T04): stacked character-based damage
 * (Hunter's Mark / Hex, rules §11 and §15 cards) widens the canonical effect
 * ledger beyond the previous 0/1 bound while staying bounded by the written
 * card values.
 */
const AUDIT_ROLLS = [9, 14, 2, 18, 6, 12, 17, 1, 10, 15, 7, 13];

function slotOf(state: ActiveMatchState, characterId: string): number {
  const entry = state.initiative.find(
    ({ characterId: id }) => id === characterId,
  );
  if (!entry) throw new Error(`Unknown audit character ${characterId}.`);
  return entry.slot;
}

function markedHistory(): ActiveMatchState {
  const setup = createSetup("audit-canonical", "2026-08-24T09:00:00.000Z");
  const generated = generateInitiative(
    setup.state,
    queuedRandom(...AUDIT_ROLLS),
    "2026-08-24T09:00:00.000Z",
  );
  const started = startMatch(generated.state, "2026-08-24T09:00:00.000Z");
  // The Ranger holds initiative slot 1, so the Mark is cast on its turn.
  const marked = resolveAbility(
    started.state,
    {
      abilityId: "duergar-ranger-hunter-s-mark",
      targetCharacterIds: ["drow-wizard"],
    },
    "2026-08-24T09:01:00.000Z",
  );
  const findFighterState = (current: ActiveMatchState): ActiveMatchState => {
    if (current.activeSlot === slotOf(current, "duergar-fighter")) {
      return current;
    }
    return findFighterState(
      finishTurn(current, "2026-08-24T09:02:00.000Z").state,
    );
  };
  return findFighterState(marked.state);
}

const ABILITY_OVERRIDE =
  "The referee recorded an Override for this state-invalid ability choice.";

/** Slot 1 is the Duergar Ranger; Arcane Bolt belongs to the Drow Sorcerer. */
function overriddenResolution(): ActionResolvedEvent {
  const setup = createSetup("audit-canonical", "2026-08-24T09:00:00.000Z");
  const generated = generateInitiative(
    setup.state,
    queuedRandom(...AUDIT_ROLLS),
    "2026-08-24T09:00:00.000Z",
  );
  const started = startMatch(generated.state, "2026-08-24T09:00:00.000Z");
  return resolveAbility(
    started.state,
    {
      abilityId: "drow-sorcerer-arcane-bolt",
      targetCharacterIds: ["duergar-ranger"],
      abilityOverride: ABILITY_OVERRIDE,
    },
    "2026-08-24T09:01:00.000Z",
  ).event;
}

function markedResolution(): {
  readonly event: ActionResolvedEvent;
  readonly state: ActiveMatchState;
} {
  const setup = createSetup("audit-active-effect", "2026-08-24T09:00:00.000Z");
  const generated = generateInitiative(
    setup.state,
    queuedRandom(...AUDIT_ROLLS),
    "2026-08-24T09:00:00.000Z",
  );
  const started = startMatch(generated.state, "2026-08-24T09:00:00.000Z");
  const resolved = resolveAbility(
    started.state,
    {
      abilityId: "duergar-ranger-hunter-s-mark",
      targetCharacterIds: ["drow-wizard"],
    },
    "2026-08-24T09:01:00.000Z",
  );
  return resolved;
}

function redirectedResolution(): ActionResolvedEvent {
  const setup = createSetup(
    "audit-retired-reaction",
    "2026-08-24T09:00:00.000Z",
  );
  const generated = generateInitiative(
    setup.state,
    queuedRandom(...AUDIT_ROLLS),
    "2026-08-24T09:00:00.000Z",
  );
  const started = startMatch(generated.state, "2026-08-24T09:00:00.000Z");
  const sourceCharacterId = started.state.initiative[0]?.characterId;
  if (!sourceCharacterId)
    throw new Error("The Match must have an active source.");
  return resolveBasicAttack(
    started.state,
    {
      sourceCharacterId,
      attackLegs: [
        { affectedCharacterIds: ["duergar-monk"] },
        { affectedCharacterIds: [sourceCharacterId, "drow-paladin"] },
      ],
      physicalConfirmations: {
        range: true,
        lineOfSight: true,
        legalBottleContact: true,
        terrainContact: true,
      },
      reactions: [
        {
          reactionId: "duergar-monk-deflecting-palm",
          protectedCharacterId: "duergar-monk",
          override: null,
        },
      ],
      majorActionOverride: null,
    },
    "2026-08-24T09:03:00.000Z",
  ).event;
}

describe("canonical Action Resolution recorded Ability Override", () => {
  it("admits an Ability resolution whose recorded Override sentence is persisted", () => {
    const event = overriddenResolution();
    expect(event).toMatchObject({
      actionType: "Ability",
      abilityOverride: ABILITY_OVERRIDE,
    });
    expect(() => {
      assertCanonicalEvent(event);
    }).not.toThrow();
  });

  it("rejects persisted events that omit the recorded Override field", () => {
    const base = overriddenResolution() as unknown as Record<string, unknown>;
    const { abilityOverride, ...legacyWithoutOverride } = base;
    void abilityOverride;
    const legacy = legacyWithoutOverride as unknown as MatchEvent;
    expect(() => {
      assertCanonicalEvent(legacy);
    }).toThrow("The canonical Action Resolution Event is invalid.");
  });

  it("rejects a blank recorded Ability Override sentence", () => {
    const blank = {
      ...overriddenResolution(),
      abilityOverride: "   ",
    } as unknown as MatchEvent;
    expect(() => {
      assertCanonicalEvent(blank);
    }).toThrow("The canonical Action Resolution Event is invalid.");
  });
});

describe("canonical Ability attack metadata", () => {
  it("admits an historic Ability resolution without optional abilityId", () => {
    const { abilityId, ...historicEvent } = overriddenResolution();
    void abilityId;

    expect(() => {
      assertCanonicalEvent(historicEvent);
    }).not.toThrow();
  });

  it("rejects an invented Ability attack id", () => {
    const attackId = "duergar-ranger-invented";
    const event = overriddenResolution();
    const invalid = {
      ...event,
      attackId,
      attackLegs: event.attackLegs.map((leg) => ({ ...leg, attackId })),
    };

    expect(() => {
      assertCanonicalEvent(invalid);
    }).toThrow("The canonical Action Resolution Event is invalid.");
  });

  it("rejects an Ability resolution with a non-Ability attack kind", () => {
    const invalid = { ...overriddenResolution(), attackType: "ranged" };

    expect(() => {
      assertCanonicalEvent(invalid);
    }).toThrow("The canonical Action Resolution Event is invalid.");
  });

  it("rejects an invented optional Ability id", () => {
    const invalid = {
      ...overriddenResolution(),
      abilityId: "duergar-ranger-invented",
    };

    expect(() => {
      assertCanonicalEvent(invalid);
    }).toThrow("The canonical Action Resolution Event is invalid.");
  });

  it("accepts omitted and null historical optional Ability ids", () => {
    const event = overriddenResolution();
    const { abilityId, ...omitted } = event;
    void abilityId;

    expect(() => {
      assertCanonicalEvent(omitted);
      assertCanonicalEvent({ ...event, abilityId: null });
    }).not.toThrow();
  });

  it("rejects an Action Resolution without current metadata", () => {
    const historicalRulesVersion = "BB-retired";
    const withoutCurrentMetadata = (event: ActionResolvedEvent) => {
      const { attackType, rangePaces, damage, ...historical } = event;
      void attackType;
      void rangePaces;
      void damage;
      return {
        ...historical,
        configurationVersion: historicalRulesVersion,
        attackLegs: historical.attackLegs.map((leg) => {
          const { rangePaces: legRangePaces, ...withoutRange } = leg;
          void legRangePaces;
          return withoutRange;
        }),
      };
    };

    expect(() => {
      assertCanonicalEvent(
        withoutCurrentMetadata(overriddenResolution()),
        historicalRulesVersion,
      );
    }).toThrow("configuration version is incompatible");
  });

  it("rejects retired Ability ids and attack metadata", () => {
    const event = overriddenResolution();
    const historicalRulesVersion = "BB-retired";
    const attackId = "duergar-ranger-retired-mark";
    const historical = {
      ...event,
      configurationVersion: historicalRulesVersion,
      attackId,
      abilityId: null,
      attackType: "retired-ability-attack",
      rangePaces: 9,
      damage: 2,
      attackLegs: event.attackLegs.map((leg) => ({
        ...leg,
        attackId,
        rangePaces: 9,
      })),
    };

    expect(() => {
      assertCanonicalEvent(historical, historicalRulesVersion);
    }).toThrow("configuration version is incompatible");
  });

  it("rejects retired Reaction ids and attack metadata", () => {
    const event = redirectedResolution();
    const historicalRulesVersion = "BB-retired";
    const attackId = "duergar-monk-retired-basic-attack";
    const reactionId = "duergar-monk-retired-deflection";
    const historical = {
      ...event,
      configurationVersion: historicalRulesVersion,
      attackId,
      attackType: "retired-thrown-attack",
      rangePaces: 9,
      damage: 2,
      attackLegs: event.attackLegs.map((leg) => ({
        ...leg,
        attackId,
        rangePaces: 9,
        redirectedByReactionId:
          leg.redirectedByReactionId === null ? null : reactionId,
      })),
      reactions: event.reactions.map((reaction) => ({
        ...reaction,
        reactionId,
      })),
    };

    expect(() => {
      assertCanonicalEvent(historical, historicalRulesVersion);
    }).toThrow("configuration version is incompatible");
  });
});

describe("canonical active-effect persistence", () => {
  it("validates active-effect identifiers in snapshots and event effect ledgers", () => {
    const { event, state } = markedResolution();
    const effect = event.appliedEffects?.[0];
    if (!effect) throw new Error("Hunter's Mark must apply one active effect.");
    const invalidEffects = [
      { ...effect, abilityId: "retired-invented-ability" },
      { ...effect, anchorCharacterId: "retired-anchor" },
      { ...effect, affectedCharacterId: "retired-affected" },
    ];

    for (const invalidEffect of invalidEffects) {
      expect(() => {
        assertCanonicalState({ ...state, activeEffects: [invalidEffect] });
      }).toThrow("The canonical active effects are structurally invalid.");
      expect(() => {
        assertCanonicalEvent({ ...event, appliedEffects: [invalidEffect] });
      }).toThrow("The canonical Action Resolution Event is invalid.");
      expect(() => {
        assertCanonicalEvent({ ...event, expiredEffects: [invalidEffect] });
      }).toThrow("The canonical Action Resolution Event is invalid.");
    }
  });

  it("rejects retired effect and spent Ability ids", () => {
    const { state } = markedResolution();
    const effect = state.activeEffects[0];
    if (!effect) throw new Error("Hunter's Mark must apply one active effect.");
    const historicalRulesVersion = "BB-retired";
    const historical = {
      ...state,
      configurationVersion: historicalRulesVersion,
      spentAbilityIds: ["duergar-ranger-retired-mark"],
      spentReactionIds: ["retired-deflecting-palm"],
      activeEffects: [{ ...effect, abilityId: "duergar-ranger-retired-mark" }],
    };

    expect(() => {
      assertCanonicalState(historical, historicalRulesVersion);
    }).toThrow("configuration version is incompatible");
  });
});

describe("canonical Action Resolution effect damage bounds", () => {
  it("admits a Basic Attack that finalized at 2 damage from Hunter's Mark", () => {
    const state = markedHistory();
    const attacked = resolveBasicAttack(
      state,
      {
        sourceCharacterId: "duergar-fighter",
        affectedCharacterIds: ["drow-wizard"],
        physicalConfirmations: {
          range: true,
          lineOfSight: true,
          legalBottleContact: true,
          terrainContact: true,
        },
        majorActionOverride: null,
      },
      "2026-08-24T09:03:00.000Z",
    );
    expect(attacked.event.effects[0]).toMatchObject({ damage: 2 });
    expect(() => {
      assertCanonicalEvent(attacked.event);
    }).not.toThrow();
  });

  it("rejects per-character damage beyond every written card value", () => {
    const setup = createSetup("audit-overbound", "2026-08-24T09:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(...AUDIT_ROLLS),
      "2026-08-24T09:00:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-24T09:00:00.000Z");
    const attack = resolveBasicAttack(
      started.state,
      {
        sourceCharacterId: initiativeCharacterId(started.state, 0),
        affectedCharacterIds: ["drow-wizard"],
        physicalConfirmations: {
          range: true,
          lineOfSight: true,
          legalBottleContact: true,
          terrainContact: true,
        },
        majorActionOverride: null,
      },
      "2026-08-24T09:03:00.000Z",
    );
    const overbound = {
      ...attack.event,
      effects: attack.event.effects.map((effect) => ({
        ...effect,
        damage: 4,
        hpAfter: Math.max(0, effect.hpBefore - 4),
      })),
    } as unknown as MatchEvent;
    expect(() => {
      assertCanonicalEvent(overbound);
    }).toThrow("The canonical Action Resolution effect is invalid.");
  });
});
