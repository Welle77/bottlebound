export type RulesUiState = {
  readonly version: string;
  readonly open: boolean;
  readonly query: string;
  readonly selectedAnchor: string | null;
  readonly scrollTop: number;
  readonly openerId: string | null;
};

export function createRulesUiState(version: string): RulesUiState {
  return {
    version,
    open: false,
    query: "",
    selectedAnchor: null,
    scrollTop: 0,
    openerId: null,
  };
}

export function retainRulesVersion(
  state: RulesUiState,
  version: string,
): RulesUiState {
  return state.version === version ? state : createRulesUiState(version);
}
