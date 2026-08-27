import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

import {
  ABILITY_FIELDS,
  type AbilityField,
  type RulesAbilityReference,
  type RulesCharacterReference,
  type RulesQuickReference,
  type RulesReference,
  type RulesReferenceRecord,
  type RulesSectionReference,
} from "../src/rules-reference/types.ts";

const ROSTER_HEADING = "2. Teams, Roles, HP & Basic Attacks";
const CARDS_HEADING = "15. Character Ability Cards";
const QUICK_REFERENCE_HEADING = "16. Referee Quick Reference";

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
    .replaceAll(/\\([\\[\]])/g, "$1")
    .replaceAll(/[*_`]/g, "")
    .trim();
}

function slug(value: string): string {
  const result = plainText(value)
    .normalize("NFKD")
    .replaceAll(/[’']/g, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
  if (!result) throw new Error(`Cannot create a source anchor for "${value}".`);
  return result;
}

function tableRows(block: string, label: string): string[][] {
  const lines = block.split("\n").filter((line) => /^\|.*\|\s*$/.test(line));
  if (lines.length < 3)
    throw new Error(`${label} table is missing or malformed.`);
  const rows = lines.map((line) =>
    line.trim().slice(1, -1).split("|").map(plainText),
  );
  if (!rows[1]?.every((cell) => /^-+$/.test(cell))) {
    throw new Error(`${label} table separator is malformed.`);
  }
  const width = rows[0]?.length ?? 0;
  if (width === 0 || rows.some((row) => row.length !== width)) {
    throw new Error(`${label} table has inconsistent columns.`);
  }
  return [rows[0] as string[], ...rows.slice(2)];
}

function sectionBody(source: string, heading: string): string {
  const marker = `## ${heading}`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Required section "${heading}" is missing.`);
  const bodyStart = start + marker.length;
  const next = source.indexOf("\n## ", bodyStart);
  return source.slice(bodyStart, next < 0 ? source.length : next);
}

function parseSections(source: string): RulesSectionReference[] {
  const headings = [...source.matchAll(/^## (\d+)\. (.+)$/gm)];
  if (headings.length !== 16) {
    throw new Error(
      `Expected 16 numbered rules sections; found ${headings.length}.`,
    );
  }
  return headings.map((match, index) => {
    const number = Number(match[1]);
    if (number !== index + 1) {
      throw new Error(`Expected rules section ${index + 1}; found ${number}.`);
    }
    const title = `${number}. ${match[2] as string}`;
    return {
      title,
      anchor: `section-${slug(title)}`,
      sourceOrder: match.index,
    };
  });
}

type RosterEntry = {
  readonly team: "Drow" | "Duergar";
  readonly name: string;
  readonly role: string;
  readonly baseHp: number;
  readonly initiativeModifier: number;
  readonly basicAttack: string;
}

function parseRoster(source: string): RosterEntry[] {
  const rows = tableRows(sectionBody(source, ROSTER_HEADING), "Roster");
  const header = rows.shift();
  if (header?.join("|") !== "Team|Class|Role|HP|Init.|Basic Attack") {
    throw new Error("Roster table has unsupported required columns.");
  }
  if (rows.length !== 12) {
    throw new Error(`Expected 12 roster entries; found ${rows.length}.`);
  }
  return rows.map(([team, name, role, hp, initiative, basicAttack]) => {
    if (team !== "Drow" && team !== "Duergar") {
      throw new Error(
        `Roster character "${name}" has unsupported team "${team}".`,
      );
    }
    const baseHp = Number(hp);
    const initiativeModifier = Number(initiative);
    if (
      !name ||
      !role ||
      !basicAttack ||
      !Number.isInteger(baseHp) ||
      !Number.isInteger(initiativeModifier)
    ) {
      throw new Error(`Roster entry for "${name || "unknown"}" is malformed.`);
    }
    return {
      team,
      name,
      role,
      baseHp,
      initiativeModifier,
      basicAttack,
    };
  });
}

function parseAbilities(
  characterBlock: string,
  characterName: string,
): RulesAbilityReference[] {
  const headings = [...characterBlock.matchAll(/^##### \\\[ \\\] (.+)$/gm)];
  if (headings.length !== 2) {
    throw new Error(
      `Character "${characterName}" must contain exactly 2 ability cards; found ${headings.length}.`,
    );
  }
  return headings.map((match, index) => {
    const name = plainText(match[1] as string);
    const start = (match.index ?? 0) + match[0].length;
    const end = headings[index + 1]?.index ?? characterBlock.length;
    const rows = tableRows(
      characterBlock.slice(start, end),
      `Ability "${name}"`,
    );
    const fields = Object.fromEntries(
      rows.map(([field, value]) => [field, value]),
    ) as Partial<Record<AbilityField, string>>;
    for (const field of ABILITY_FIELDS) {
      if (!fields[field]) {
        throw new Error(
          `Ability "${name}" is missing required field "${field}".`,
        );
      }
    }
    if (Object.keys(fields).length !== ABILITY_FIELDS.length) {
      throw new Error(`Ability "${name}" has unsupported fields.`);
    }
    return {
      name,
      characterName,
      anchor: `ability-${slug(characterName)}-${slug(name)}`,
      fields: fields as Readonly<Record<AbilityField, string>>,
    };
  });
}

function parseCharacters(
  source: string,
  roster: readonly RosterEntry[],
): RulesCharacterReference[] {
  const cards = sectionBody(source, CARDS_HEADING);
  const headings = [...cards.matchAll(/^#### (.+) — (.+)$/gm)];
  if (headings.length !== 12) {
    throw new Error(`Expected 12 character cards; found ${headings.length}.`);
  }
  return headings.map((match, index) => {
    const name = plainText(match[1] as string);
    const role = plainText(match[2] as string);
    const start = (match.index ?? 0) + match[0].length;
    const end = headings[index + 1]?.index ?? cards.length;
    const block = cards.slice(start, end);
    const stats = block.match(
      /^\s*HP (\d+) • Initiative ([+-]\d+) • Basic Attack: (.+)$/m,
    );
    if (!stats)
      throw new Error(`Character card "${name}" has malformed stats.`);
    const rosterEntry = roster.find((entry) => entry.name === name);
    if (!rosterEntry)
      throw new Error(`Character card "${name}" is absent from the roster.`);
    const cardValues = {
      role,
      baseHp: Number(stats[1]),
      initiativeModifier: Number(stats[2]),
      basicAttack: plainText(stats[3] as string),
    };
    for (const field of Object.keys(
      cardValues,
    ) as (keyof typeof cardValues)[]) {
      if (cardValues[field] !== rosterEntry[field]) {
        throw new Error(
          `Character card "${name}" ${field} drifts from the roster.`,
        );
      }
    }
    return {
      id: `${rosterEntry.team.toLowerCase()}-${slug(name)}`,
      name,
      team: rosterEntry.team,
      ...cardValues,
      anchor: `character-${rosterEntry.team.toLowerCase()}-${slug(name)}`,
      abilities: parseAbilities(block, name),
    };
  });
}

function parseQuickReference(source: string): RulesQuickReference[] {
  const rows = tableRows(
    sectionBody(source, QUICK_REFERENCE_HEADING),
    "Quick reference",
  );
  const header = rows.shift();
  if (header?.join("|") !== "Rule|Summary") {
    throw new Error("Quick-reference table has unsupported required columns.");
  }
  if (rows.length === 0) throw new Error("Quick-reference table is empty.");
  return rows.map(([rule, summary]) => {
    if (!rule || !summary) throw new Error("Quick-reference row is malformed.");
    return {
      rule,
      summary,
      anchor: `quick-reference-${slug(rule)}`,
    };
  });
}

function anchorSource(
  source: string,
  references: {
    sections: readonly RulesSectionReference[];
    characters: readonly RulesCharacterReference[];
    quickReference: readonly RulesQuickReference[];
  },
): string {
  const { sections, characters, quickReference } = references;
  let result = source;
  const anchors = new Map<string, string>();
  const add = (needle: string, anchor: string) => {
    if (anchors.has(anchor))
      throw new Error(`Duplicate source anchor "${anchor}".`);
    anchors.set(anchor, needle);
    if (!result.includes(needle))
      throw new Error(`Source content for anchor "${anchor}" is missing.`);
    result = result.replace(
      needle,
      `<span id="${anchor}" class="rules-anchor" aria-hidden="true"></span>\n\n${needle}`,
    );
  };
  for (const section of sections) add(`## ${section.title}`, section.anchor);
  for (const character of characters) {
    add(`#### ${character.name} — ${character.role}`, character.anchor);
    for (const ability of character.abilities) {
      add(`##### \\[ \\] ${ability.name}`, ability.anchor);
    }
    const rosterNeedle = `| ${character.team}`;
    const rosterLine = result
      .split("\n")
      .find(
        (line) =>
          line.startsWith(rosterNeedle) &&
          line.split("|")[2]?.trim() === character.name,
      );
    if (!rosterLine)
      throw new Error(`Roster source row for "${character.name}" is missing.`);
    result = result.replace(
      rosterLine,
      rosterLine.replace(
        character.team,
        `<span id="${character.anchor}-roster" class="rules-anchor" aria-hidden="true"></span>${character.team}`,
      ),
    );
  }
  for (const quick of quickReference) {
    const quickLine = result
      .split("\n")
      .find((line) => plainText(line.split("|")[1] ?? "") === quick.rule);
    if (!quickLine)
      throw new Error(
        `Quick-reference source row for "${quick.rule}" is missing.`,
      );
    result = result.replace(
      quickLine,
      quickLine.replace(
        `**${quick.rule}**`,
        `<span id="${quick.anchor}" class="rules-anchor" aria-hidden="true"></span>**${quick.rule}**`,
      ),
    );
  }
  return result;
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

export function buildRulesReference(
  source: string,
  version: string,
): RulesReference {
  rejectRawHtml(source);
  if (!source.startsWith("# BOTTLEBOUND\n")) {
    throw new Error(
      'Rules source must begin with the level-one heading "BOTTLEBOUND".',
    );
  }
  const sections = parseSections(source);
  const roster = parseRoster(source);
  const characters = parseCharacters(source, roster);
  const abilities = characters.flatMap(({ abilities: entries }) => entries);
  const quickReference = parseQuickReference(source);
  const records: RulesReferenceRecord[] = [
    ...sections.map((section, index) => {
      const nextSection = sections[index + 1];
      const sectionSource = source.slice(
        section.sourceOrder,
        nextSection?.sourceOrder ?? source.length,
      );
      return {
        kind: "section" as const,
        title: section.title,
        anchor: section.anchor,
        sourceOrder: section.sourceOrder,
        text: visibleMarkdownText(sectionSource),
      };
    }),
    ...characters.flatMap((character) => {
      const characterPosition = source.indexOf(
        `#### ${character.name} — ${character.role}`,
      );
      return [
        {
          kind: "character" as const,
          title: character.name,
          anchor: character.anchor,
          sourceOrder: characterPosition,
          text: `${character.name} ${character.team} ${character.role} HP ${character.baseHp} Initiative ${character.initiativeModifier} ${character.basicAttack}`,
        },
        ...character.abilities.map((ability) => ({
          kind: "ability" as const,
          title: ability.name,
          anchor: ability.anchor,
          sourceOrder: source.indexOf(
            `##### \\[ \\] ${ability.name}`,
            characterPosition,
          ),
          text: `${ability.name} Character ${character.name} ${Object.entries(
            ability.fields,
          )
            .map(([label, value]) => `${label} ${value}`)
            .join(" ")}`,
        })),
      ];
    }),
    ...quickReference.map((quick) => ({
      kind: "quick-reference" as const,
      title: quick.rule,
      anchor: quick.anchor,
      sourceOrder: source.indexOf(`**${quick.rule}**`),
      text: `${quick.rule} ${quick.summary}`,
    })),
  ].sort((left, right) => left.sourceOrder - right.sourceOrder);
  const uniqueAnchors = new Set<string>();
  for (const { anchor } of records) {
    if (uniqueAnchors.has(anchor)) {
      throw new Error(`Duplicate source anchor "${anchor}".`);
    }
    uniqueAnchors.add(anchor);
  }
  const html = renderSanitized(
    anchorSource(source, { sections, characters, quickReference }),
  );
  return deepFreeze({
    version,
    html,
    sections,
    characters,
    abilities,
    quickReference,
    records,
  });
}
