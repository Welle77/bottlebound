import type { MatchState } from "../domain/match";
import type { RulesSearchHighlight } from "../rules-reference/rules-search";

export function statusLabel(value: string): string {
  return value.replaceAll("-", " ");
}
export function modifierLabel(modifier: number): string {
  return modifier >= 0 ? `+${String(modifier)}` : String(modifier);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function outcomeLabel(
  outcome: Exclude<MatchState["outcome"], null>,
): string {
  return outcome === "draw" ? "Draw" : `${outcome} wins`;
}

export function highlightedExcerpt(
  excerpt: string,
  highlights: readonly RulesSearchHighlight[],
): string {
  const { markup, cursor } = highlights.reduce<{
    readonly markup: string;
    readonly cursor: number;
  }>(
    (built, highlight) => {
      if (highlight.start < built.cursor) return built;
      return {
        markup:
          `${built.markup}${escapeHtml(excerpt.slice(built.cursor, highlight.start))}` +
          `<mark>${escapeHtml(excerpt.slice(highlight.start, highlight.end))}</mark>`,
        cursor: highlight.end,
      };
    },
    { markup: "", cursor: 0 },
  );
  return markup + escapeHtml(excerpt.slice(cursor));
}

export function searchResultKind(kind: string): string {
  return (
    {
      ability: "Ability card",
      character: "Character",
      section: "Rules section",
      "quick-reference": "Quick reference",
    }[kind] ?? kind
  );
}

export function decisionBasisLabel(basis: string): string {
  return (
    {
      elimination: "Team Elimination",
      activeCount: "Active-character count",
      activeHpTotal: "Active HP total",
      coinFlip: "Coin Flip",
    }[basis] ?? basis
  );
}
