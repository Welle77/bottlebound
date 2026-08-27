import type { RulesReferenceRecord, RulesReferenceRecordKind } from "./types";

export type RulesSearchHighlight = {
  readonly start: number;
  readonly end: number;
  readonly text: string;
};

export type RulesSearchResult = {
  readonly kind: RulesReferenceRecordKind;
  readonly title: string;
  readonly anchor: string;
  readonly sourceOrder: number;
  readonly excerpt: string;
  readonly highlights: readonly RulesSearchHighlight[];
};

type NormalizedText = {
  readonly value: string;
  readonly sourceStarts: readonly number[];
  readonly sourceEnds: readonly number[];
};

type SourceRange = {
  readonly start: number;
  readonly end: number;
};

const EXCERPT_CONTEXT = 48;
const MAX_COMPLETE_EXCERPT = 180;

function normalizeWithSourceMap(source: string): NormalizedText {
  // Array.from iterates Unicode code points exactly like string spread.
  const scanned = Array.from(source).reduce<{
    readonly characters: readonly string[];
    readonly sourceStarts: readonly number[];
    readonly sourceEnds: readonly number[];
    readonly index: number;
  }>(
    (acc, sourceCharacter) => {
      const sourceEnd = acc.index + sourceCharacter.length;
      const normalizedCharacter = sourceCharacter
        .normalize("NFKD")
        .toLowerCase();
      const written = Array.from(normalizedCharacter).reduce<typeof acc>(
        (inner, character) => {
          if (/\p{M}/u.test(character)) return inner;
          if (/[\p{L}\p{N}]/u.test(character)) {
            return {
              ...inner,
              characters: [...inner.characters, character],
              sourceStarts: [...inner.sourceStarts, inner.index],
              sourceEnds: [...inner.sourceEnds, sourceEnd],
            };
          }
          return inner;
        },
        acc,
      );
      const wroteWordCharacter =
        written.characters.length > acc.characters.length;
      const joinsWord = /['’‘ʼ]/u.test(sourceCharacter);
      const spaced =
        !wroteWordCharacter && !joinsWord && written.characters.at(-1) !== " "
          ? {
              ...written,
              characters: [...written.characters, " "],
              sourceStarts: [...written.sourceStarts, acc.index],
              sourceEnds: [...written.sourceEnds, sourceEnd],
            }
          : written;
      return { ...spaced, index: sourceEnd };
    },
    { characters: [], sourceStarts: [], sourceEnds: [], index: 0 },
  );

  // Drop all trailing separator spaces.
  const contentIndices = scanned.characters.flatMap((character, position) =>
    character === " " ? [] : [position],
  );
  const lastContentIndex = contentIndices.at(-1);
  const keepLength = lastContentIndex === undefined ? 0 : lastContentIndex + 1;
  const trimmedCharacters = scanned.characters.slice(0, keepLength);
  const trimmedStarts = scanned.sourceStarts.slice(0, keepLength);
  const trimmedEnds = scanned.sourceEnds.slice(0, keepLength);
  // Remove one leading separator space when present.
  const leading = trimmedCharacters[0] === " ";
  const characters = leading ? trimmedCharacters.slice(1) : trimmedCharacters;
  const sourceStarts = leading ? trimmedStarts.slice(1) : trimmedStarts;
  const sourceEnds = leading ? trimmedEnds.slice(1) : trimmedEnds;

  return { value: characters.join(""), sourceStarts, sourceEnds };
}

export function normalizeRulesQuery(query: string): readonly string[] {
  const terms = normalizeWithSourceMap(query).value.split(" ").filter(Boolean);
  return [...new Set(terms)];
}

function insertSorted(
  ranges: readonly SourceRange[],
  range: SourceRange,
): readonly SourceRange[] {
  const compare = (left: SourceRange, right: SourceRange): number =>
    left.start - right.start || left.end - right.end;
  const index = ranges.findIndex((existing) => compare(existing, range) > 0);
  if (index < 0) return [...ranges, range];
  return [...ranges.slice(0, index), range, ...ranges.slice(index)];
}

function matchingRanges(
  normalized: NormalizedText,
  terms: readonly string[],
): readonly SourceRange[] | null {
  if (terms.some((term) => !normalized.value.includes(term))) return null;
  const sorted = terms
    .flatMap((term) => {
      // Non-overlapping left-to-right occurrences, matching the previous
      // indexOf(term, position + term.length) walk.
      const parts = normalized.value.split(term);
      return parts.slice(0, -1).reduce<{
        readonly cursor: number;
        readonly ranges: readonly SourceRange[];
      }>(
        (acc, part) => {
          // Each separator (the matched term) begins right after its
          // preceding part in the reconstructed string.
          const position = acc.cursor + part.length;
          const sourceStart = normalized.sourceStarts[position];
          const sourceEnd = normalized.sourceEnds[position + term.length - 1];
          const matched =
            sourceStart !== undefined && sourceEnd !== undefined
              ? [...acc.ranges, { start: sourceStart, end: sourceEnd }]
              : acc.ranges;
          return {
            cursor: position + term.length,
            ranges: matched,
          };
        },
        { cursor: 0, ranges: [] as readonly SourceRange[] },
      ).ranges;
    })
    .reduce<readonly SourceRange[]>(insertSorted, []);
  const merged = sorted.reduce<readonly SourceRange[]>(
    (mergedRanges, range) => {
      const previous = mergedRanges.at(-1);
      if (previous && range.start < previous.end) {
        return [
          ...mergedRanges.slice(0, -1),
          {
            start: previous.start,
            end: Math.max(previous.end, range.end),
          },
        ];
      }
      return [...mergedRanges, { ...range }];
    },
    [],
  );
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

  const compareResults = (
    left: { readonly result: RulesSearchResult; readonly exactTitle: boolean },
    right: { readonly result: RulesSearchResult; readonly exactTitle: boolean },
  ): number => {
    if (left.exactTitle !== right.exactTitle) return left.exactTitle ? -1 : 1;
    const leftAbility = left.result.kind === "ability";
    const rightAbility = right.result.kind === "ability";
    if (leftAbility !== rightAbility) return leftAbility ? -1 : 1;
    return left.result.sourceOrder - right.result.sourceOrder;
  };
  const insertRanked = (
    sorted: readonly {
      readonly result: RulesSearchResult;
      readonly exactTitle: boolean;
    }[],
    entry: { readonly result: RulesSearchResult; readonly exactTitle: boolean },
  ): readonly {
    readonly result: RulesSearchResult;
    readonly exactTitle: boolean;
  }[] => {
    const index = sorted.findIndex(
      (existing) => compareResults(existing, entry) > 0,
    );
    if (index < 0) return [...sorted, entry];
    return [...sorted.slice(0, index), entry, ...sorted.slice(index)];
  };

  return records
    .flatMap((record) => {
      const normalizedText = normalizeWithSourceMap(record.text);
      const ranges = matchingRanges(normalizedText, terms);
      if (!ranges) return [];
      const exactTitle =
        normalizeWithSourceMap(record.title).value === normalizedQuery;
      return [{ result: resultFor(record, ranges), exactTitle }];
    })
    .reduce<
      readonly {
        readonly result: RulesSearchResult;
        readonly exactTitle: boolean;
      }[]
    >(insertRanked, [])
    .map(({ result }) => result);
}
