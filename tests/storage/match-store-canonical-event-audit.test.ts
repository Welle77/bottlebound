/* eslint-disable functional/no-let, functional/immutable-data -- Test harness builds event histories and storage fixtures incrementally; this is the sanctioned mutability boundary for tests. */
import { describe, expect, it } from "vitest";

import {
  createSetup,
  finishTurn,
  generateInitiative,
  resolveAbility,
  resolveBasicAttack,
  startMatch,
  type ActiveMatchState,
} from "../../src/domain/match";
import { initiativeCharacterId, queuedRandom } from "../domain/match-test-support";
import type { MatchEvent } from "../../src/domain/match";
import { assertCanonicalEvent } from "../../src/storage/match-store-canonical-event";

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
  let state = started.state;
  // The Ranger holds initiative slot 1, so the Mark is cast on its turn.
  const marked = resolveAbility(
    state,
    {
      abilityId: "duergar-ranger-hunter-s-mark",
      targetCharacterIds: ["drow-wizard"],
    },
    "2026-08-24T09:01:00.000Z",
  );
  state = marked.state;
  while (state.activeSlot !== slotOf(state, "duergar-fighter")) {
    const turned = finishTurn(state, "2026-08-24T09:02:00.000Z");
    state = turned.state;
  }
  return state;
}

describe("canonical Action Resolution recorded Ability Override", () => {
  const OVERRIDE =
    "The referee recorded an Override for this state-invalid ability choice.";

  /** Slot 1 is the Duergar Ranger; Arcane Bolt belongs to the Drow Sorcerer. */
  function overriddenResolution(): MatchEvent {
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
        abilityOverride: OVERRIDE,
      },
      "2026-08-24T09:01:00.000Z",
    ).event;
  }

  it("admits an Ability resolution whose recorded Override sentence is persisted", () => {
    const event = overriddenResolution();
    expect(event).toMatchObject({
      actionType: "Ability",
      abilityOverride: OVERRIDE,
    });
    expect(() => {
      assertCanonicalEvent(event);
    }).not.toThrow();
  });

  it("rejects persisted events that omit the recorded Override field", () => {
    const legacy: MatchEvent = { ...overriddenResolution() };
    delete (legacy as unknown as Record<string, unknown>).abilityOverride;
    expect(() => {
      assertCanonicalEvent(legacy);
    }).toThrow(
      "The canonical Action Resolution Event is invalid.",
    );
  });

  it("rejects a blank recorded Ability Override sentence", () => {
    const blank = {
      ...overriddenResolution(),
      abilityOverride: "   ",
    } as unknown as MatchEvent;
    expect(() => {
      assertCanonicalEvent(blank);
    }).toThrow(
      "The canonical Action Resolution Event is invalid.",
    );
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
    }).toThrow(
      "The canonical Action Resolution effect is invalid.",
    );
  });
});
