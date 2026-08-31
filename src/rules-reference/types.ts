export type RulesReferenceHeading = {
  readonly title: string;
  readonly level: number;
  readonly anchor: string;
  readonly sourceOrder: number;
};

export type RulesReferenceRecordKind = "heading";

export type RulesReferenceRecord = {
  readonly kind: RulesReferenceRecordKind;
  readonly title: string;
  readonly anchor: string;
  readonly sourceOrder: number;
  readonly text: string;
};

export type RulesReference = {
  readonly version: string;
  readonly html: string;
  readonly headings: readonly RulesReferenceHeading[];
  readonly navigation: readonly RulesReferenceHeading[];
  readonly records: readonly RulesReferenceRecord[];
};
