import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

import type {
  RulesReference,
  RulesReferenceHeading,
  RulesReferenceRecord,
} from "../src/rules-reference/types.ts";

type HeadingMatch = {
  readonly title: string;
  readonly level: number;
  readonly start: number;
};

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function rejectRawHtml(source: string): void {
  if (/<[!/A-Za-z][^>]*>/u.test(source)) {
    throw new Error(
      "Raw HTML is not allowed in the authoritative rules Markdown.",
    );
  }
}

function plainText(value: string): string {
  return value
    .replaceAll(/\\([\\[\\]])/g, "$1")
    .replaceAll(/[*_`]/g, "")
    .trim();
}

function headingTitle(value: string): string {
  return plainText(value.replace(/[ \t]+#+[ \t]*$/u, ""));
}

function anchorSlug(value: string, index: number): string {
  const slug = headingTitle(value)
    .normalize("NFKD")
    .replaceAll(/\p{M}/gu, "")
    .replaceAll(/[’']/g, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
  return slug || `heading-${index + 1}`;
}

function parseHeadings(source: string): readonly HeadingMatch[] {
  return [
    ...source.matchAll(/^[ \t]{0,3}(#{1,6})[ \t]+(.+?)[ \t]*$/gmu),
  ].flatMap((match) => {
    const [, headingLevel, title] = match;
    return headingLevel !== undefined && title !== undefined
      ? [
          {
            title: headingTitle(title),
            level: headingLevel.length,
            start: match.index ?? 0,
          },
        ]
      : [];
  });
}

function uniqueAnchor(title: string, index: number, used: ReadonlySet<string>) {
  const base = `rules-heading-${anchorSlug(title, index)}`;
  let anchor = base;
  let suffix = 2;
  while (used.has(anchor)) {
    anchor = `${base}-${suffix}`;
    suffix += 1;
  }
  return anchor;
}

function createHeadings(source: string): readonly RulesReferenceHeading[] {
  const used = new Set<string>();
  return parseHeadings(source).map((heading, index) => {
    const anchor = uniqueAnchor(heading.title, index, used);
    used.add(anchor);
    return {
      title: heading.title,
      level: heading.level,
      anchor,
      sourceOrder: heading.start,
    };
  });
}

function annotateHeadings(
  source: string,
  headings: readonly RulesReferenceHeading[],
): string {
  return headings.reduceRight(
    (result, heading) =>
      `${result.slice(0, heading.sourceOrder)}<span id="${heading.anchor}" class="rules-anchor" aria-hidden="true"></span>\n\n${result.slice(heading.sourceOrder)}`,
    source,
  );
}

function renderSanitized(source: string): string {
  const rendered = marked.parse(source, { gfm: true, async: false });
  if (typeof rendered !== "string")
    throw new Error("Rules rendering did not complete synchronously.");
  return sanitizeHtml(rendered, {
    allowedTags: [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
      "em",
      "strong",
      "ul",
      "ol",
      "li",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "span",
    ],
    allowedAttributes: {
      span: ["id", "class", "aria-hidden"],
    },
    disallowedTagsMode: "discard",
    allowedSchemes: [],
  });
}

function visibleMarkdownText(source: string): string {
  const rendered = marked.parse(source, { gfm: true, async: false });
  if (typeof rendered !== "string") {
    throw new Error("Rules text extraction did not complete synchronously.");
  }
  return sanitizeHtml(rendered, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: "discard",
  })
    .replaceAll(/\s+/g, " ")
    .trim();
}

function recordsFor(
  source: string,
  headings: readonly RulesReferenceHeading[],
): readonly RulesReferenceRecord[] {
  return headings.map((heading, index) => {
    const nextHeading = headings[index + 1];
    const sectionSource = source.slice(
      heading.sourceOrder,
      nextHeading?.sourceOrder ?? source.length,
    );
    return {
      kind: "heading",
      title: heading.title,
      anchor: heading.anchor,
      sourceOrder: heading.sourceOrder,
      text: visibleMarkdownText(sectionSource),
    };
  });
}

function navigationHeadings(
  headings: readonly RulesReferenceHeading[],
): readonly RulesReferenceHeading[] {
  const first = headings[0];
  if (!first) return [];
  const contentHeadings = first.level === 1 ? headings.slice(1) : headings;
  const level = contentHeadings.length
    ? Math.min(
        ...contentHeadings.map(({ level: headingLevel }) => headingLevel),
      )
    : first.level;
  return headings.filter((heading) => heading.level === level);
}

export function buildRulesReference(
  source: string,
  version: string,
): RulesReference {
  rejectRawHtml(source);
  const headings = createHeadings(source);
  const records = recordsFor(source, headings);
  const html = renderSanitized(annotateHeadings(source, headings));
  return deepFreeze({
    version,
    html,
    headings,
    navigation: navigationHeadings(headings),
    records,
  });
}
