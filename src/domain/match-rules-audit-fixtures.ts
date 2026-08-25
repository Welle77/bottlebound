import {
  createSetup,
  finishTurn,
  generateInitiative,
  resolveAbility,
  startMatch,
  type ActiveMatchState,
  type CommandResult,
  type MatchEvent,
} from "./match";
import { queuedRandom } from "./match-test-support";
import { RULESET } from "./ruleset";

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

export interface AuditRun {
  events: MatchEvent[];
  state: ActiveMatchState;
}

export function abilityId(ownerCharacterId: string, name: string): string {
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
  return {
    events: [setup.event, generated.event, started.event],
    state: started.state,
  };
}

export function slotOf(state: ActiveMatchState, characterId: string): number {
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
  run: AuditRun,
  result: CommandResult<ActiveMatchState, MatchEvent>,
): ActiveMatchState {
  run.events.push(result.event);
  run.state = result.state;
  return result.state;
}

/** Finishes turns until the given character begins a fresh, unacted turn. */
export function advanceTo(
  run: AuditRun,
  characterId: string,
): ActiveMatchState {
  let current = run.state;
  const targetSlot = slotOf(current, characterId);
  for (let step = 0; step < 40; step += 1) {
    if (current.activeSlot === targetSlot && !current.majorActionUsed) {
      return current;
    }
    current = play(run, finishTurn(current, stamp(50 + run.events.length)));
  }
  throw new Error("advanceTo exceeded one initiative pass.");
}

export interface CastRequest {
  readonly abilityName: string;
  readonly input?: Omit<Parameters<typeof resolveAbility>[1], "abilityId">;
  readonly step: number;
}

/** Advances to the source's turn and commits one Ability resolution. */
export function cast(
  run: AuditRun,
  sourceCharacterId: string,
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
