<script lang="ts">
  import type { SetupMatchState } from "../domain/match";
  import { RULESET } from "../domain/ruleset";
  import { modifierLabel } from "./format";
  import CharacterName from "./CharacterName.svelte";

  // The Setup initiative table: roster rows before initiative exists,
  // committed initiative rows afterwards. Cell structure stays identical to
  // the deleted legacy template (seven cells per row).
  let { match }: { match: SetupMatchState } = $props();

  interface InitiativeRow {
    readonly key: string;
    readonly slot: number;
    readonly character: { readonly id: string; readonly name: string };
    readonly team: string;
    readonly roll: number;
    readonly modifier: string;
    readonly total: number;
    readonly tieBreak: string;
  }
  interface RosterRow {
    readonly key: string;
    readonly character: { readonly id: string; readonly name: string };
    readonly team: string;
    readonly hp: number;
    readonly baseHp: number;
    readonly modifier: string;
  }

  const initiativeRows = $derived.by((): readonly InitiativeRow[] => {
    const initiative = match.initiative;
    if (!initiative) return [];
    const totalCounts = new Map<number, number>(
      [...new Set(initiative.map(({ total }) => total))].map((total) => [
        total,
        initiative.filter((entry) => entry.total === total).length,
      ]),
    );
    return initiative.map((entry): InitiativeRow => {
      const character = RULESET.characters.find(
        ({ id }) => id === entry.characterId,
      );
      if (!character)
        throw new Error("The Match references an unknown character.");
      return {
        key: entry.characterId,
        slot: entry.slot,
        character,
        team: character.team,
        roll: entry.roll,
        modifier: modifierLabel(entry.modifier),
        total: entry.total,
        tieBreak:
          (totalCounts.get(entry.total) ?? 0) > 1 ? "Digital coin flip" : "—",
      };
    });
  });

  const rosterRows = $derived.by((): readonly RosterRow[] => {
    if (match.initiative) return [];
    return match.characters.map((entry): RosterRow => {
      const character = RULESET.characters.find(
        ({ id }) => id === entry.characterId,
      );
      if (!character)
        throw new Error("The Match references an unknown character.");
      return {
        key: entry.characterId,
        character,
        team: character.team,
        hp: entry.hp,
        baseHp: character.baseHp,
        modifier: modifierLabel(character.initiativeModifier),
      };
    });
  });
</script>

<div class="table-wrap">
  <table class="initiative-table">
    {#if match.initiative}
      <thead>
        <tr>
          <th>Slot</th>
          <th>Character</th>
          <th>Team</th>
          <th>Roll</th>
          <th>Modifier</th>
          <th>Total</th>
          <th>Tie break</th>
        </tr>
      </thead>
      <tbody>
        {#each initiativeRows as row (row.key)}
          <tr data-initiative-row>
            <td data-label="Slot">{row.slot}</td>
            <th scope="row">
              <CharacterName
                character={row.character}
                displayNames={match.displayNames}
              />
            </th>
            <td data-label="Team">{row.team}</td>
            <td data-label="Roll">{row.roll}</td>
            <td data-label="Modifier">{row.modifier}</td>
            <td data-label="Total"><strong>{row.total}</strong></td>
            <td data-label="Tie break">{row.tieBreak}</td>
          </tr>
        {/each}
      </tbody>
    {:else}
      <thead>
        <tr>
          <th>Slot</th>
          <th>Character</th>
          <th>Team</th>
          <th>HP</th>
          <th>Modifier</th>
          <th>Total</th>
          <th>Tie break</th>
        </tr>
      </thead>
      <tbody>
        {#each rosterRows as row (row.key)}
          <tr data-roster-row>
            <td data-label="Slot">—</td>
            <th scope="row">
              <CharacterName
                character={row.character}
                displayNames={match.displayNames}
              />
            </th>
            <td data-label="Team">{row.team}</td>
            <td data-label="HP">{row.hp}/{row.baseHp}</td>
            <td data-label="Modifier">{row.modifier}</td>
            <td data-label="Total">—</td>
            <td data-label="Tie break">—</td>
          </tr>
        {/each}
      </tbody>
    {/if}
  </table>
</div>
