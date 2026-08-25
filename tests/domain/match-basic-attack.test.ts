import { describe, expect, it } from "vitest";

import {
  createSetup,
  finishTurn,
  generateInitiative,
  resolveBasicAttack,
  restoreStateFromEvents,
  startMatch,
  type MatchEvent,
} from "../../src/domain/match";
import { queuedRandom } from "./match-test-support";

describe("Active Match commands", () => {
  it("resolves one ordered Basic Attack as one reversible Match Event", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const sourceId = started.state.initiative[0]?.characterId;
    if (!sourceId) throw new Error("The test needs an active character.");

    const result = resolveBasicAttack(
      started.state,
      {
        sourceCharacterId: sourceId,
        affectedCharacterIds: ["drow-paladin", "duergar-ranger", sourceId],
        physicalConfirmations: {
          range: true,
          lineOfSight: true,
          legalBottleContact: true,
          terrainContact: true,
        },
        majorActionOverride: null,
      },
      "2026-08-22T14:03:00.000Z",
    );

    expect(result.state).toMatchObject({ sequence: 4, majorActionUsed: true });
    expect(result.state.characters).toEqual(
      started.state.characters.map((character) => ({
        ...character,
        hp: ["drow-paladin", "duergar-ranger", sourceId].includes(
          character.characterId,
        )
          ? Math.max(0, character.hp - 1)
          : character.hp,
      })),
    );
    expect(result.event).toMatchObject({
      type: "ActionResolved",
      sequence: 4,
      sourceCharacterId: sourceId,
      attackLegs: [
        {
          sequence: 1,
          affectedCharacterIds: ["drow-paladin", "duergar-ranger", sourceId],
        },
      ],
      majorActionOverride: null,
    });
    expect(result.event.effects).toEqual([
      {
        characterId: "drow-paladin",
        damage: 1,
        hpBefore: 5,
        hpAfter: 4,
        downedBefore: false,
        downedAfter: false,
      },
      {
        characterId: "duergar-ranger",
        damage: 1,
        hpBefore: 3,
        hpAfter: 2,
        downedBefore: false,
        downedAfter: false,
      },
      {
        characterId: sourceId,
        damage: 1,
        hpBefore: 3,
        hpAfter: 2,
        downedBefore: false,
        downedAfter: false,
      },
    ]);
    expect(
      restoreStateFromEvents([
        setup.event,
        generated.event,
        started.event,
        result.event,
      ]),
    ).toEqual(result.state);
  });

  it("rejects duplicate contacts, missing checks, and a second attack without an override", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const sourceCharacterId = started.state.initiative[0]!.characterId;
    const input = {
      sourceCharacterId,
      affectedCharacterIds: ["duergar-ranger"],
      physicalConfirmations: {
        range: true,
        lineOfSight: true,
        legalBottleContact: true,
        terrainContact: true,
      },
      majorActionOverride: null,
    } as const;

    expect(() =>
      resolveBasicAttack(
        started.state,
        {
          ...input,
          affectedCharacterIds: ["duergar-ranger", "duergar-ranger"],
        },
        "2026-08-22T14:03:00.000Z",
      ),
    ).toThrow("unique");
    expect(() =>
      resolveBasicAttack(
        started.state,
        {
          ...input,
          physicalConfirmations: {
            ...input.physicalConfirmations,
            range: false,
          },
        },
        "2026-08-22T14:03:00.000Z",
      ),
    ).toThrow("physical confirmation");

    const first = resolveBasicAttack(
      started.state,
      input,
      "2026-08-22T14:03:00.000Z",
    );
    expect(() =>
      resolveBasicAttack(first.state, input, "2026-08-22T14:04:00.000Z"),
    ).toThrow("override");
    const second = resolveBasicAttack(
      first.state,
      { ...input, majorActionOverride: "Referee confirmed a second attack." },
      "2026-08-22T14:04:00.000Z",
    );
    expect(second.event.majorActionOverride).toBe(
      "Referee confirmed a second attack.",
    );
    expect(
      finishTurn(second.state, "2026-08-22T14:05:00.000Z").state,
    ).toMatchObject({ majorActionUsed: false, activeSlot: 2 });
  });

  it("rejects a Basic Attack from a Downed active character", () => {
    const setup = createSetup(
      "match-downed-source",
      "2026-08-22T14:00:00.000Z",
    );
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const sourceCharacterId = started.state.initiative[0]!.characterId;

    expect(() =>
      resolveBasicAttack(
        {
          ...started.state,
          characters: started.state.characters.map((character) =>
            character.characterId === sourceCharacterId
              ? { ...character, hp: 0 }
              : character,
          ),
        },
        {
          sourceCharacterId,
          affectedCharacterIds: ["duergar-ranger"],
          physicalConfirmations: {
            range: true,
            lineOfSight: true,
            legalBottleContact: true,
            terrainContact: true,
          },
          majorActionOverride: null,
        },
        "2026-08-22T14:03:00.000Z",
      ),
    ).toThrow("Downed");
  });

  it("replays an unavailable-version Action Resolution from its recorded evidence", () => {
    const setup = createSetup("match-historical", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const attack = resolveBasicAttack(
      started.state,
      {
        sourceCharacterId: started.state.initiative[0]!.characterId,
        affectedCharacterIds: ["duergar-ranger"],
        physicalConfirmations: {
          range: true,
          lineOfSight: true,
          legalBottleContact: true,
          terrainContact: true,
        },
        majorActionOverride: null,
      },
      "2026-08-22T14:03:00.000Z",
    );
    const historicalVersion = "BB-prior-release";
    const history = [setup.event, generated.event, started.event].map(
      (event) => ({ ...event, rulesVersion: historicalVersion }),
    );
    const resolvedEvent = {
      ...attack.event,
      rulesVersion: historicalVersion,
    } as MatchEvent;
    const expectedState = { ...attack.state, rulesVersion: historicalVersion };

    expect(restoreStateFromEvents([...history, resolvedEvent])).toEqual(
      expectedState,
    );

    const corruptedEffects = attack.event.effects.map((effect) => ({
      ...effect,
      hpBefore: effect.hpBefore + 1,
    }));
    expect(() =>
      restoreStateFromEvents([
        ...history,
        { ...resolvedEvent, effects: corruptedEffects } as MatchEvent,
      ]),
    ).toThrow("does not follow Match State");
  });
});
