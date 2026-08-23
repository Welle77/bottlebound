import type { MatchState } from "../domain/match";
import type { RulesSearchHighlight } from "../rules-reference/rules-search";

export function statusLabel(value: string): string {
  return value.replaceAll("-", " ");
}
export function modifierLabel(modifier: number): string {
  return modifier >= 0 ? `+${modifier}` : String(modifier);
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
  let cursor = 0;
  let result = "";
  for (const highlight of highlights) {
    if (highlight.start < cursor) continue;
    result += escapeHtml(excerpt.slice(cursor, highlight.start));
    result += `<mark>${escapeHtml(excerpt.slice(highlight.start, highlight.end))}</mark>`;
    cursor = highlight.end;
  }
  return result + escapeHtml(excerpt.slice(cursor));
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

export function contextualRulesControl(
  id: string,
  label: string,
  anchor: string,
): string {
  return `<button id="${escapeHtml(id)}" class="rules-context-link" type="button" data-open-rules-anchor="${escapeHtml(anchor)}">${escapeHtml(label)}</button>`;
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
