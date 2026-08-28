export type RulesUiState = {
  readonly open: boolean;
  readonly query: string;
  readonly selectedAnchor: string | null;
  readonly scrollTop: number;
  readonly openerId: string | null;
};

export function createRulesUiState(): RulesUiState {
  return {
    open: false,
    query: "",
    selectedAnchor: null,
    scrollTop: 0,
    openerId: null,
  };
}

export function openRulesWithQuery(
  state: RulesUiState,
  query: string,
): RulesUiState {
  return {
    ...state,
    open: true,
    query,
    selectedAnchor: null,
    scrollTop: 0,
  };
}
