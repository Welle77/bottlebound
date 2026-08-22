import type { Team } from "../domain/ruleset.ts";

export const ABILITY_FIELDS = [
  "Type",
  "Target",
  "Attack Type",
  "Range",
  "Line of Sight",
  "Ball Required",
  "Effect",
  "Duration",
] as const;

export type AbilityField = (typeof ABILITY_FIELDS)[number];

export interface RulesAbilityReference {
  readonly name: string;
  readonly characterName: string;
  readonly anchor: string;
  readonly fields: Readonly<Record<AbilityField, string>>;
}

export interface RulesCharacterReference {
  readonly id: string;
  readonly name: string;
  readonly team: Team;
  readonly role: string;
  readonly baseHp: number;
  readonly initiativeModifier: number;
  readonly basicAttack: string;
  readonly anchor: string;
  readonly abilities: readonly RulesAbilityReference[];
}

export interface RulesSectionReference {
  readonly title: string;
  readonly anchor: string;
  readonly sourceOrder: number;
}

export interface RulesQuickReference {
  readonly rule: string;
  readonly summary: string;
  readonly anchor: string;
}

export type RulesReferenceRecordKind =
  "section" | "character" | "ability" | "quick-reference";

export interface RulesReferenceRecord {
  readonly kind: RulesReferenceRecordKind;
  readonly title: string;
  readonly anchor: string;
  readonly sourceOrder: number;
  readonly text: string;
}

export interface RulesReference {
  readonly version: string;
  readonly html: string;
  readonly sections: readonly RulesSectionReference[];
  readonly characters: readonly RulesCharacterReference[];
  readonly abilities: readonly RulesAbilityReference[];
  readonly quickReference: readonly RulesQuickReference[];
  readonly records: readonly RulesReferenceRecord[];
}
