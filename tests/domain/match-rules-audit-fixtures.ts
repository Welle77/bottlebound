import {
  createSetup,
  finishTurn,
  generateInitiative,
  resolveAbility,
  startMatch,
  type AbilityId,
  type ActiveMatchState,
  type CharacterId,
  type CommandResult,
  type MatchEvent,
} from "../../src/domain/match";
import { queuedRandom } from "./match-test-support";
import { RULESET } from "../../src/domain/ruleset";

/**
 * Rules coverage audit fixtures (ticket T04).
 *
 * Initiative rolls give every character a distinct total so no coin-flip tie
 * break consumes random draws: ranger 21, wizard 19, barbarian 17, druid 16,
 * bard 15, cleric 14, rogue 13, fighter 12, warlock 8, sorcerer 7, monk 5,
 * paladin 4.
 */
export const AUDIT_ROLLS = [9, 14, 2, 18, 6, 12, 17, 1, 10, 15, 7, 13];
export const BASE_TIME = "2026-08-24T09:00:00.000Z";

export type AuditRun = {
  readonly events: readonly MatchEvent[];
  readonly state: ActiveMatchState;
} & {
  readonly record: (result: CommandResult) => ActiveMatchState;
  readonly recordEvent: (event: MatchEvent) => void;
};

export function createAuditRun(initialState: ActiveMatchState): AuditRun {
  let events: readonly MatchEvent[] = [];
  let state: ActiveMatchState = initialState;
  return {
    get events(): readonly MatchEvent[] {
      return events;
    },
    get state(): ActiveMatchState {
      return state;
    },
    record(result: CommandResult): ActiveMatchState {
      // Audit runs only replay commands whose results stay Active; the
      // constructor input and every recorded result satisfy that contract.
      state = result.state as ActiveMatchState;
      events = [...events, result.event];
      return state;
    },
    recordEvent(event: MatchEvent): void {
      events = [...events, event];
    },
  };
}

export function abilityId(
  ownerCharacterId: CharacterId,
  name: string,
): AbilityId {
  const fold = (value: string): string => value.replaceAll(/['’]/g, "");
  const ability = RULESET.abilities.find(
    (entry) =>
      entry.ownerCharacterId === ownerCharacterId &&
      fold(entry.name) === fold(name),
  );
  if (!ability) throw new Error(`Unknown audit ability ${name}.`);
  return ability.id;
}

export function startedAuditMatch(matchId: string): AuditRun {
  const setup = createSetup(matchId, BASE_TIME);
  const generated = generateInitiative(
    setup.state,
    queuedRandom(...AUDIT_ROLLS),
    BASE_TIME,
  );
  const started = startMatch(generated.state, BASE_TIME);
  const run = createAuditRun(started.state);
  run.record(setup);
  run.record(generated);
  run.record(started);
  return run;
}

export function slotOf(
  state: ActiveMatchState,
  characterId: CharacterId,
): number {
  const entry = state.initiative.find(
    ({ characterId: id }) => id === characterId,
  );
  if (!entry) throw new Error(`Unknown audit character ${characterId}.`);
  return entry.slot;
}

export function stamp(step: number): string {
  const minutes = String(step).padStart(2, "0");
  return `2026-08-24T09:${minutes}:00.000Z`;
}

export function play(
  run: Readonly<AuditRun>,
  result: CommandResult<ActiveMatchState>,
): ActiveMatchState {
  return run.record(result);
}

/** Finishes turns until the given character begins a fresh, unacted turn. */
export function advanceTo(
  run: Readonly<AuditRun>,
  characterId: CharacterId,
): ActiveMatchState {
  const targetSlot = slotOf(run.state, characterId);
  const advanceStep = (
    current: ActiveMatchState,
    step: number,
  ): ActiveMatchState => {
    if (current.activeSlot === targetSlot && !current.majorActionUsed) {
      return current;
    }
    if (step >= 40) {
      throw new Error("advanceTo exceeded one initiative pass.");
    }
    const next = play(run, finishTurn(current, stamp(50 + run.events.length)));
    return advanceStep(next, step + 1);
  };
  return advanceStep(run.state, 0);
}

export type CastRequest = {
  readonly abilityName: string;
  readonly input?: Omit<Parameters<typeof resolveAbility>[1], "abilityId">;
  readonly step: number;
};

/** Advances to the source's turn and commits one Ability resolution. */
export function cast(
  run: Readonly<AuditRun>,
  sourceCharacterId: CharacterId,
  request: CastRequest,
): ActiveMatchState {
  const state = advanceTo(run, sourceCharacterId);
  return play(
    run,
    resolveAbility(
      state,
      {
        ...request.input,
        abilityId: abilityId(sourceCharacterId, request.abilityName),
      },
      stamp(request.step),
    ),
  );
}

export const CONFIRMATIONS = {
  range: true,
  lineOfSight: true,
  legalBottleContact: true,
  terrainContact: true,
};
