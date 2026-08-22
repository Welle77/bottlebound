import type { RulesReferenceRecord, RulesReferenceRecordKind } from "./types";

export interface RulesSearchHighlight {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export interface RulesSearchResult {
  readonly kind: RulesReferenceRecordKind;
  readonly title: string;
  readonly anchor: string;
  readonly sourceOrder: number;
  readonly excerpt: string;
  readonly highlights: readonly RulesSearchHighlight[];
}

interface NormalizedText {
  readonly value: string;
  readonly sourceStarts: readonly number[];
  readonly sourceEnds: readonly number[];
}

interface SourceRange {
  readonly start: number;
  readonly end: number;
}

const EXCERPT_CONTEXT = 48;
const MAX_COMPLETE_EXCERPT = 180;

function normalizeWithSourceMap(source: string): NormalizedText {
  const characters: string[] = [];
  const sourceStarts: number[] = [];
  const sourceEnds: number[] = [];

  let sourceIndex = 0;
  for (const sourceCharacter of source) {
    const sourceEnd = sourceIndex + sourceCharacter.length;
    const normalizedCharacter = sourceCharacter.normalize("NFKD").toLowerCase();
    let wroteWordCharacter = false;

    for (const character of normalizedCharacter) {
      if (/\p{M}/u.test(character)) continue;
      if (/[\p{L}\p{N}]/u.test(character)) {
        characters.push(character);
        sourceStarts.push(sourceIndex);
        sourceEnds.push(sourceEnd);
        wroteWordCharacter = true;
      }
    }

    const joinsWord = /['’‘ʼ]/u.test(sourceCharacter);
    if (!wroteWordCharacter && !joinsWord && characters.at(-1) !== " ") {
      characters.push(" ");
      sourceStarts.push(sourceIndex);
      sourceEnds.push(sourceEnd);
    }
    sourceIndex = sourceEnd;
  }

  while (characters.at(-1) === " ") {
    characters.pop();
    sourceStarts.pop();
    sourceEnds.pop();
  }
  if (characters[0] === " ") {
    characters.shift();
    sourceStarts.shift();
    sourceEnds.shift();
  }

  return { value: characters.join(""), sourceStarts, sourceEnds };
}

export function normalizeRulesQuery(query: string): readonly string[] {
  const terms = normalizeWithSourceMap(query).value.split(" ").filter(Boolean);
  return [...new Set(terms)];
}

function matchingRanges(
  normalized: NormalizedText,
  terms: readonly string[],
): readonly SourceRange[] | null {
  const ranges: SourceRange[] = [];
  for (const term of terms) {
    let position = normalized.value.indexOf(term);
    if (position < 0) return null;
    while (position >= 0) {
      const start = normalized.sourceStarts[position];
      const end = normalized.sourceEnds[position + term.length - 1];
      if (start !== undefined && end !== undefined) ranges.push({ start, end });
      position = normalized.value.indexOf(term, position + term.length);
    }
  }
  const sorted = ranges.sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
  const merged: SourceRange[] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && range.start < previous.end) {
      merged[merged.length - 1] = {
        start: previous.start,
        end: Math.max(previous.end, range.end),
      };
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function excerptFor(text: string, ranges: readonly SourceRange[]) {
  if (text.length <= MAX_COMPLETE_EXCERPT) return { excerpt: text, offset: 0 };
  const first = ranges[0];
  const last = ranges.at(-1);
  if (!first || !last) return { excerpt: text, offset: 0 };

  const start = Math.max(0, first.start - EXCERPT_CONTEXT);
  const end = Math.min(text.length, last.end + EXCERPT_CONTEXT);
  return {
    excerpt: `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`,
    offset: start - (start > 0 ? 1 : 0),
  };
}

function resultFor(
  record: RulesReferenceRecord,
  ranges: readonly SourceRange[],
): RulesSearchResult {
  const { excerpt, offset } = excerptFor(record.text, ranges);
  const highlights = ranges
    .map(({ start, end }) => ({
      start: start - offset,
      end: end - offset,
      text: record.text.slice(start, end),
    }))
    .filter(({ start, end }) => start >= 0 && end <= excerpt.length);
  return {
    kind: record.kind,
    title: record.title,
    anchor: record.anchor,
    sourceOrder: record.sourceOrder,
    excerpt,
    highlights,
  };
}

export function searchRules(
  records: readonly RulesReferenceRecord[],
  query: string,
): readonly RulesSearchResult[] {
  const terms = normalizeRulesQuery(query);
  if (terms.length === 0) return [];
  const normalizedQuery = terms.join(" ");

  return records
    .flatMap((record) => {
      const normalizedText = normalizeWithSourceMap(record.text);
      const ranges = matchingRanges(normalizedText, terms);
      if (!ranges) return [];
      const exactTitle =
        normalizeWithSourceMap(record.title).value === normalizedQuery;
      return [{ result: resultFor(record, ranges), exactTitle }];
    })
    .sort((left, right) => {
      if (left.exactTitle !== right.exactTitle) return left.exactTitle ? -1 : 1;
      const leftAbility = left.result.kind === "ability";
      const rightAbility = right.result.kind === "ability";
      if (leftAbility !== rightAbility) return leftAbility ? -1 : 1;
      return left.result.sourceOrder - right.result.sourceOrder;
    })
    .map(({ result }) => result);
}
